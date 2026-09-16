export interface JumengModel {
  id: string
  supported_endpoint_types?: string[]
  [key: string]: unknown
}

export interface ImageGenerationResult {
  url?: string
  b64_json?: string
  revised_prompt?: string
}

export interface VideoTaskSubmitResult {
  id?: string
  task_id?: string
  status?: string
  progress?: number | string
  model?: string
}

export interface VideoTaskStatus {
  task_id?: string
  status: string
  progress?: string | number
  result_url?: string
  fail_reason?: string
}

/** Successful `/files/upload` response; `url` expires about one hour after `created_at`. */
export interface JumengFile {
  id?: string
  object?: string
  bytes?: number
  created_at?: number
  expires_at?: number
  filename?: string
  purpose?: string
  kind?: string
  url: string
}

/** Bytes plus the metadata `/files/upload` needs for its `file` part. */
export interface UploadPayload {
  data: Uint8Array
  filename: string
  mime: string
}

export interface GenerateImageParams {
  model: string
  prompt: string
  size?: string
  n?: number
  image?: string
}

export interface GenerateVideoParams {
  model: string
  prompt: string
  /**
   * Aspect ratio for the Jumeng video gateway `size` field.
   * Live API expects values like `16:9` / `9:16` (NOT `720P`).
   */
  size?: string
  /** Clarity: `720P` / `1080P` — sent as `resolution`. */
  resolution?: string
  duration?: number
  seconds?: string
  image?: string
  images?: string[]
  input_reference?: string
  /** Alias for aspect ratio; preferred over `size` when both are set. */
  ratio?: string
  watermark?: boolean
  seed?: number
  /** Extra body fields merged into the submit payload (model-specific). */
  extra?: Record<string, unknown>
}

export class JumengApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: unknown,
  ) {
    super(message)
    this.name = 'JumengApiError'
  }
}

export class JumengClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
  ) {
    if (!apiKey?.trim()) {
      throw new JumengApiError(
        'apiKey 未配置。请在插件配置中填写聚梦 API Key（控制台 → 令牌管理）。',
      )
    }
  }

  private endpoint(p: string): string {
    const base = this.baseUrl.replace(/\/+$/, '')
    const path = p.startsWith('/') ? p : `/${p}`
    return `${base}${path}`
  }

  private async request<T>(
    path: string,
    init: RequestInit & { timeoutMs?: number } = {},
  ): Promise<T> {
    const { timeoutMs = 120_000, signal, ...rest } = init
    const controller = new AbortController()
    const onAbort = () => controller.abort()
    signal?.addEventListener('abort', onAbort, { once: true })
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(this.endpoint(path), {
        ...rest,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.apiKey.trim()}`,
          // FormData bodies must keep the boundary fetch generates for them.
          ...(typeof rest.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
          ...(rest.headers || {}),
        },
      })
      const text = await res.text()
      let json: unknown = null
      if (text) {
        try {
          json = JSON.parse(text)
        } catch {
          json = text
        }
      }
      if (!res.ok) {
        const msg = extractErrorMessage(json) || res.statusText || `HTTP ${res.status}`
        throw new JumengApiError(`聚梦 API ${path} 失败: ${msg}`, res.status, json)
      }
      return json as T
    } catch (err) {
      if (err instanceof JumengApiError) throw err
      if (err instanceof Error && err.name === 'AbortError') {
        throw new JumengApiError(`请求超时或已取消: ${path}`)
      }
      throw new JumengApiError(
        `网络错误 ${path}: ${err instanceof Error ? err.message : String(err)}`,
      )
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
  }

  async listModels(signal?: AbortSignal): Promise<JumengModel[]> {
    const data = await this.request<{ data?: JumengModel[] }>('/models', {
      method: 'GET',
      signal,
      timeoutMs: 60_000,
    })
    return Array.isArray(data?.data) ? data.data : []
  }

  /**
   * Upload one reference image or video and return its temporary public URL.
   * @param payload File bytes with the filename and MIME type sent in the `file` part.
   * @returns Upload record whose `url` other endpoints accept as a reference.
   */
  async uploadFile(
    payload: UploadPayload,
    opts?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<JumengFile> {
    const form = new FormData()
    // Node's Buffer is a valid BlobPart, but its declared ArrayBufferLike backing
    // store does not satisfy the DOM BlobPart type.
    const part = payload.data as unknown as BlobPart
    form.append('file', new Blob([part], { type: payload.mime }), payload.filename)

    const data = await this.request<JumengFile & { data?: JumengFile }>('/files/upload', {
      method: 'POST',
      body: form,
      signal: opts?.signal,
      timeoutMs: opts?.timeoutMs ?? 120_000,
    })
    const file = data?.url ? data : data?.data
    if (!file?.url) {
      throw new JumengApiError(`上传成功但未返回 url: ${payload.filename}`, undefined, data)
    }
    return file
  }

  async generateImage(
    params: GenerateImageParams,
    opts?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<ImageGenerationResult[]> {
    const body: Record<string, unknown> = {
      model: params.model,
      prompt: params.prompt,
      size: params.size || '1024x1024',
      n: params.n ?? 1,
    }
    if (params.image) body.image = params.image

    const data = await this.request<{ data?: ImageGenerationResult[]; error?: unknown }>(
      '/images/generations',
      {
        method: 'POST',
        body: JSON.stringify(body),
        signal: opts?.signal,
        timeoutMs: opts?.timeoutMs ?? 300_000,
      },
    )
    if (!Array.isArray(data?.data) || data.data.length === 0) {
      throw new JumengApiError('生图成功但未返回图片数据', undefined, data)
    }
    return data.data
  }

  async submitVideo(
    params: GenerateVideoParams,
    opts?: { signal?: AbortSignal },
  ): Promise<VideoTaskSubmitResult> {
    // Jumeng live gateway (see doc.jumengai.com /v1/video/generations):
    // - `size` MUST be an aspect ratio: 16:9 / 9:16 / 1:1 …
    // - `resolution` is clarity: 720P / 1080P
    // Passing 720P as `size` returns: "size 格式错误，请传画幅比例 ratio"
    const ratio =
      normalizeVideoRatio(params.ratio) ||
      normalizeVideoRatio(params.size) ||
      '16:9'
    const resolution =
      normalizeVideoQuality(params.resolution) ||
      normalizeVideoQuality(isVideoQualityLabel(params.size) ? params.size : undefined) ||
      '720P'

    const body: Record<string, unknown> = {
      model: params.model,
      prompt: params.prompt,
      size: ratio,
      resolution,
    }

    if (params.duration != null) body.duration = params.duration
    if (params.seconds) body.seconds = params.seconds
    if (params.image) body.image = params.image
    if (params.input_reference) body.input_reference = params.input_reference
    if (params.images?.length) body.images = params.images

    const meta: Record<string, unknown> = {
      ratio,
      ...(params.watermark != null ? { watermark: params.watermark } : {}),
      ...(params.seed != null ? { seed: params.seed } : {}),
    }
    body.metadata = { parameters: meta }

    if (params.extra && typeof params.extra === 'object') {
      for (const [key, value] of Object.entries(params.extra)) {
        if (value !== undefined) body[key] = value
      }
    }

    return this.request<VideoTaskSubmitResult>('/video/generations', {
      method: 'POST',
      body: JSON.stringify(body),
      signal: opts?.signal,
      timeoutMs: 120_000,
    })
  }

  async getVideoTask(
    taskId: string,
    opts?: { signal?: AbortSignal },
  ): Promise<VideoTaskStatus> {
    const raw = await this.request<Record<string, unknown>>(
      `/video/generations/${encodeURIComponent(taskId)}`,
      {
        method: 'GET',
        signal: opts?.signal,
        timeoutMs: 60_000,
      },
    )
    // 外层 code:"success" 只表示查询成功
    const data = (raw.data as VideoTaskStatus | undefined) || (raw as unknown as VideoTaskStatus)
    if (!data?.status) {
      throw new JumengApiError(`无法解析视频任务状态: ${taskId}`, undefined, raw)
    }
    return data
  }

  async waitForVideo(
    taskId: string,
    opts: {
      signal?: AbortSignal
      pollIntervalMs: number
      timeoutMs: number
      onProgress?: (status: VideoTaskStatus) => void
    },
  ): Promise<VideoTaskStatus> {
    const started = Date.now()
    while (true) {
      if (opts.signal?.aborted) {
        throw new JumengApiError(`视频任务已取消: ${taskId}`)
      }
      if (Date.now() - started > opts.timeoutMs) {
        throw new JumengApiError(
          `视频任务超时（>${Math.round(opts.timeoutMs / 60000)} 分钟）: ${taskId}。可用 task_id 稍后重查。`,
        )
      }

      const status = await this.getVideoTask(taskId, { signal: opts.signal })
      opts.onProgress?.(status)
      const s = String(status.status || '').toUpperCase()

      if (s === 'SUCCESS') {
        if (!status.result_url) {
          throw new JumengApiError(`视频成功但无 result_url: ${taskId}`, undefined, status)
        }
        return status
      }
      if (s === 'FAILURE') {
        throw new JumengApiError(
          `视频生成失败: ${status.fail_reason || 'unknown'}`,
          undefined,
          status,
        )
      }
      if (s === 'UNKNOWN') {
        throw new JumengApiError(`视频任务状态未知或已过期: ${taskId}`, undefined, status)
      }

      await sleep(opts.pollIntervalMs, opts.signal)
    }
  }
}

function extractErrorMessage(body: unknown): string {
  if (!body) return ''
  if (typeof body === 'string') return body
  if (typeof body !== 'object') return String(body)
  const obj = body as Record<string, unknown>
  const err = obj.error
  if (err && typeof err === 'object') {
    const msg = (err as Record<string, unknown>).message
    if (typeof msg === 'string') return msg
  }
  if (typeof obj.message === 'string') return obj.message
  try {
    return JSON.stringify(body)
  } catch {
    return String(body)
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new JumengApiError('已取消'))
      return
    }
    const timer = setTimeout(resolve, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new JumengApiError('已取消'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** Normalize 720p/1080p-style quality labels used by Jumeng video models. */
function normalizeVideoQuality(raw?: string): string | undefined {
  if (!raw?.trim()) return undefined
  const upper = raw.trim().toUpperCase().replace(/\s+/g, '')
  if (upper === '720' || upper === '720P' || upper === 'HD') return '720P'
  if (upper === '1080' || upper === '1080P' || upper === 'FHD') return '1080P'
  if (/^\d{3,4}P$/i.test(upper)) return upper
  return undefined
}

function isVideoQualityLabel(raw?: string): boolean {
  return normalizeVideoQuality(raw) !== undefined
}

/** Normalize aspect-ratio labels; Jumeng `size` expects these, not 720P. */
function normalizeVideoRatio(raw?: string): string | undefined {
  if (!raw?.trim()) return undefined
  const v = raw.trim().replace(/\s+/g, '')
  if (isVideoQualityLabel(v)) return undefined
  if (/^\d+(\.\d+)?:\d+(\.\d+)?$/.test(v)) return v
  return undefined
}

export function isImageModel(model: JumengModel): boolean {
  const types = model.supported_endpoint_types || []
  if (types.includes('image-generation')) return true
  const id = model.id || ''
  return /text-to-image|image-generation|image/i.test(id)
}

export function isVideoModel(model: JumengModel): boolean {
  const types = model.supported_endpoint_types || []
  if (types.includes('video-generation')) return true
  const id = model.id || ''
  return /-t2v|-i2v|video-generation|seedance|happyhorse/i.test(id)
}
