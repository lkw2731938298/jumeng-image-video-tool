export class JumengApiError extends Error {
    status;
    body;
    constructor(message, status, body) {
        super(message);
        this.status = status;
        this.body = body;
        this.name = 'JumengApiError';
    }
}
export class JumengClient {
    apiKey;
    baseUrl;
    constructor(apiKey, baseUrl) {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
        if (!apiKey?.trim()) {
            throw new JumengApiError('apiKey 未配置。请在插件配置中填写聚梦 API Key（控制台 → 令牌管理）。');
        }
    }
    endpoint(p) {
        const base = this.baseUrl.replace(/\/+$/, '');
        const path = p.startsWith('/') ? p : `/${p}`;
        return `${base}${path}`;
    }
    async request(path, init = {}) {
        const { timeoutMs = 120_000, signal, ...rest } = init;
        const controller = new AbortController();
        const onAbort = () => controller.abort();
        signal?.addEventListener('abort', onAbort, { once: true });
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(this.endpoint(path), {
                ...rest,
                signal: controller.signal,
                headers: {
                    Authorization: `Bearer ${this.apiKey.trim()}`,
                    ...(rest.body ? { 'Content-Type': 'application/json' } : {}),
                    ...(rest.headers || {}),
                },
            });
            const text = await res.text();
            let json = null;
            if (text) {
                try {
                    json = JSON.parse(text);
                }
                catch {
                    json = text;
                }
            }
            if (!res.ok) {
                const msg = extractErrorMessage(json) || res.statusText || `HTTP ${res.status}`;
                throw new JumengApiError(`聚梦 API ${path} 失败: ${msg}`, res.status, json);
            }
            return json;
        }
        catch (err) {
            if (err instanceof JumengApiError)
                throw err;
            if (err instanceof Error && err.name === 'AbortError') {
                throw new JumengApiError(`请求超时或已取消: ${path}`);
            }
            throw new JumengApiError(`网络错误 ${path}: ${err instanceof Error ? err.message : String(err)}`);
        }
        finally {
            clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
        }
    }
    async listModels(signal) {
        const data = await this.request('/models', {
            method: 'GET',
            signal,
            timeoutMs: 60_000,
        });
        return Array.isArray(data?.data) ? data.data : [];
    }
    async generateImage(params, opts) {
        const body = {
            model: params.model,
            prompt: params.prompt,
            size: params.size || '1024x1024',
            n: params.n ?? 1,
        };
        if (params.image)
            body.image = params.image;
        const data = await this.request('/images/generations', {
            method: 'POST',
            body: JSON.stringify(body),
            signal: opts?.signal,
            timeoutMs: opts?.timeoutMs ?? 300_000,
        });
        if (!Array.isArray(data?.data) || data.data.length === 0) {
            throw new JumengApiError('生图成功但未返回图片数据', undefined, data);
        }
        return data.data;
    }
    async submitVideo(params, opts) {
        // Jumeng live gateway (see doc.jumengai.com /v1/video/generations):
        // - `size` MUST be an aspect ratio: 16:9 / 9:16 / 1:1 …
        // - `resolution` is clarity: 720P / 1080P
        // Passing 720P as `size` returns: "size 格式错误，请传画幅比例 ratio"
        const ratio = normalizeVideoRatio(params.ratio) ||
            normalizeVideoRatio(params.size) ||
            '16:9';
        const resolution = normalizeVideoQuality(params.resolution) ||
            normalizeVideoQuality(isVideoQualityLabel(params.size) ? params.size : undefined) ||
            '720P';
        const body = {
            model: params.model,
            prompt: params.prompt,
            size: ratio,
            resolution,
        };
        if (params.duration != null)
            body.duration = params.duration;
        if (params.seconds)
            body.seconds = params.seconds;
        if (params.image)
            body.image = params.image;
        if (params.input_reference)
            body.input_reference = params.input_reference;
        if (params.images?.length)
            body.images = params.images;
        const meta = {
            ratio,
            ...(params.watermark != null ? { watermark: params.watermark } : {}),
            ...(params.seed != null ? { seed: params.seed } : {}),
        };
        body.metadata = { parameters: meta };
        if (params.extra && typeof params.extra === 'object') {
            for (const [key, value] of Object.entries(params.extra)) {
                if (value !== undefined)
                    body[key] = value;
            }
        }
        return this.request('/video/generations', {
            method: 'POST',
            body: JSON.stringify(body),
            signal: opts?.signal,
            timeoutMs: 120_000,
        });
    }
    async getVideoTask(taskId, opts) {
        const raw = await this.request(`/video/generations/${encodeURIComponent(taskId)}`, {
            method: 'GET',
            signal: opts?.signal,
            timeoutMs: 60_000,
        });
        // 外层 code:"success" 只表示查询成功
        const data = raw.data || raw;
        if (!data?.status) {
            throw new JumengApiError(`无法解析视频任务状态: ${taskId}`, undefined, raw);
        }
        return data;
    }
    async waitForVideo(taskId, opts) {
        const started = Date.now();
        while (true) {
            if (opts.signal?.aborted) {
                throw new JumengApiError(`视频任务已取消: ${taskId}`);
            }
            if (Date.now() - started > opts.timeoutMs) {
                throw new JumengApiError(`视频任务超时（>${Math.round(opts.timeoutMs / 60000)} 分钟）: ${taskId}。可用 task_id 稍后重查。`);
            }
            const status = await this.getVideoTask(taskId, { signal: opts.signal });
            opts.onProgress?.(status);
            const s = String(status.status || '').toUpperCase();
            if (s === 'SUCCESS') {
                if (!status.result_url) {
                    throw new JumengApiError(`视频成功但无 result_url: ${taskId}`, undefined, status);
                }
                return status;
            }
            if (s === 'FAILURE') {
                throw new JumengApiError(`视频生成失败: ${status.fail_reason || 'unknown'}`, undefined, status);
            }
            if (s === 'UNKNOWN') {
                throw new JumengApiError(`视频任务状态未知或已过期: ${taskId}`, undefined, status);
            }
            await sleep(opts.pollIntervalMs, opts.signal);
        }
    }
}
function extractErrorMessage(body) {
    if (!body)
        return '';
    if (typeof body === 'string')
        return body;
    if (typeof body !== 'object')
        return String(body);
    const obj = body;
    const err = obj.error;
    if (err && typeof err === 'object') {
        const msg = err.message;
        if (typeof msg === 'string')
            return msg;
    }
    if (typeof obj.message === 'string')
        return obj.message;
    try {
        return JSON.stringify(body);
    }
    catch {
        return String(body);
    }
}
function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new JumengApiError('已取消'));
            return;
        }
        const timer = setTimeout(resolve, ms);
        const onAbort = () => {
            clearTimeout(timer);
            reject(new JumengApiError('已取消'));
        };
        signal?.addEventListener('abort', onAbort, { once: true });
    });
}
/** Normalize 720p/1080p-style quality labels used by Jumeng video models. */
function normalizeVideoQuality(raw) {
    if (!raw?.trim())
        return undefined;
    const upper = raw.trim().toUpperCase().replace(/\s+/g, '');
    if (upper === '720' || upper === '720P' || upper === 'HD')
        return '720P';
    if (upper === '1080' || upper === '1080P' || upper === 'FHD')
        return '1080P';
    if (/^\d{3,4}P$/i.test(upper))
        return upper;
    return undefined;
}
function isVideoQualityLabel(raw) {
    return normalizeVideoQuality(raw) !== undefined;
}
/** Normalize aspect-ratio labels; Jumeng `size` expects these, not 720P. */
function normalizeVideoRatio(raw) {
    if (!raw?.trim())
        return undefined;
    const v = raw.trim().replace(/\s+/g, '');
    if (isVideoQualityLabel(v))
        return undefined;
    if (/^\d+(\.\d+)?:\d+(\.\d+)?$/.test(v))
        return v;
    return undefined;
}
export function isImageModel(model) {
    const types = model.supported_endpoint_types || [];
    if (types.includes('image-generation'))
        return true;
    const id = model.id || '';
    return /text-to-image|image-generation|image/i.test(id);
}
export function isVideoModel(model) {
    const types = model.supported_endpoint_types || [];
    if (types.includes('video-generation'))
        return true;
    const id = model.id || '';
    return /-t2v|-i2v|video-generation|seedance|happyhorse/i.test(id);
}
//# sourceMappingURL=api.js.map