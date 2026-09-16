import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
/** `/files/upload` accepts only these types; anything else returns HTTP 400. */
const UPLOAD_MIME_BY_EXT = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
};
const UPLOAD_EXT_BY_MIME = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'video/webm': '.webm',
};
/** Per-kind ceilings enforced by `/files/upload`; larger payloads return HTTP 400. */
const UPLOAD_MAX_BYTES = {
    image: 10 * 1024 * 1024,
    video: 100 * 1024 * 1024,
};
export function resolveOutputDir(configured, override) {
    const raw = (override || configured || './outputs').trim() || './outputs';
    return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}
export async function ensureDir(dir) {
    await mkdir(dir, { recursive: true });
}
/** Unique suffix so repeated generations do not overwrite prior deliverables. */
export function uniqueStamp() {
    return String(Date.now());
}
/**
 * Confirm a local deliverable exists and has non-zero size.
 * @returns File size in bytes.
 */
export async function assertNonEmptyFile(filePath) {
    const abs = path.resolve(filePath);
    let st;
    try {
        st = await stat(abs);
    }
    catch {
        throw new Error(`下载后文件不存在: ${abs}`);
    }
    if (!st.isFile() || st.size <= 0) {
        throw new Error(`下载后文件为空或无效 (size=${st.size} bytes): ${abs}`);
    }
    return st.size;
}
function stripDataUrl(b64) {
    const match = /^data:([^;]+);base64,(.+)$/s.exec(b64);
    if (match)
        return { mime: match[1], data: match[2] };
    return { mime: 'image/png', data: b64 };
}
function extFromMime(mime) {
    if (mime.includes('jpeg') || mime.includes('jpg'))
        return '.jpg';
    if (mime.includes('webp'))
        return '.webp';
    if (mime.includes('gif'))
        return '.gif';
    if (mime.includes('mp4'))
        return '.mp4';
    if (mime.includes('webm'))
        return '.webm';
    return '.png';
}
export async function saveBase64Image(dir, prefix, index, b64, stamp = uniqueStamp()) {
    await ensureDir(dir);
    const { mime, data } = stripDataUrl(b64);
    const filePath = path.join(dir, `${prefix}-${stamp}-${index}${extFromMime(mime)}`);
    await writeFile(filePath, Buffer.from(data, 'base64'));
    const abs = path.resolve(filePath);
    const bytes = await assertNonEmptyFile(abs);
    return { path: abs, bytes };
}
export async function downloadToFile(url, filePath, signal, timeoutMs = 300_000) {
    await ensureDir(path.dirname(filePath));
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) {
            throw new Error(`download failed HTTP ${res.status}: ${url}`);
        }
        const buf = Buffer.from(await res.arrayBuffer());
        await writeFile(filePath, buf);
        const abs = path.resolve(filePath);
        const bytes = await assertNonEmptyFile(abs);
        return { path: abs, bytes };
    }
    finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
    }
}
/**
 * Recognize the accepted upload types from their leading magic bytes.
 * @param data File bytes to inspect.
 * @returns Matching MIME type, or `undefined` when no signature matches.
 */
export function sniffUploadMime(data) {
    const starts = (...bytes) => bytes.every((b, i) => data[i] === b);
    const ascii = (offset, text) => [...text].every((ch, i) => data[offset + i] === ch.charCodeAt(0));
    if (starts(0x89, 0x50, 0x4e, 0x47))
        return 'image/png';
    if (starts(0xff, 0xd8, 0xff))
        return 'image/jpeg';
    if (ascii(0, 'GIF8'))
        return 'image/gif';
    if (ascii(0, 'RIFF') && ascii(8, 'WEBP'))
        return 'image/webp';
    if (ascii(4, 'ftyp'))
        return ascii(8, 'qt') ? 'video/quicktime' : 'video/mp4';
    if (starts(0x1a, 0x45, 0xdf, 0xa3))
        return 'video/webm';
    return undefined;
}
/**
 * Classify an upload MIME type and reject payloads the endpoint would refuse.
 * @param mime MIME type sent in the `file` part.
 * @param bytes Payload size.
 * @param label Source description used in error messages.
 * @returns Kind the endpoint will report for this file.
 */
export function assertUploadPayload(mime, bytes, label) {
    if (!UPLOAD_EXT_BY_MIME[mime]) {
        throw new Error(`不支持上传的类型 ${mime}（${label}）。图片支持 JPEG/PNG/GIF/WEBP，视频支持 MP4/MOV/WebM。`);
    }
    const kind = mime.startsWith('video/') ? 'video' : 'image';
    if (bytes <= 0) {
        throw new Error(`待上传内容为空（${label}）`);
    }
    const limit = UPLOAD_MAX_BYTES[kind];
    if (bytes > limit) {
        throw new Error(`${kind === 'image' ? '图片' : '视频'}超过上传上限 ${limit / 1024 / 1024}MB（${label}，实际 ${bytes} bytes）`);
    }
    return kind;
}
/** Default filename for payloads that arrive without one, such as base64 input. */
export function uploadFilenameFor(mime, prefix = 'reference') {
    return `${prefix}-${uniqueStamp()}${UPLOAD_EXT_BY_MIME[mime] ?? '.bin'}`;
}
/**
 * Read a local reference file and derive the metadata `/files/upload` requires.
 * @param filePath Absolute or CWD-relative path.
 * @returns File bytes with a validated MIME type and its basename.
 */
export async function readUploadFromDisk(filePath) {
    const abs = path.resolve(filePath);
    let data;
    try {
        data = await readFile(abs);
    }
    catch {
        throw new Error(`参考素材文件不存在或无法读取: ${abs}`);
    }
    const mime = sniffUploadMime(data) ?? UPLOAD_MIME_BY_EXT[path.extname(abs).toLowerCase()];
    if (!mime) {
        throw new Error(`无法识别参考素材类型: ${abs}`);
    }
    const kind = assertUploadPayload(mime, data.byteLength, abs);
    return { data, filename: path.basename(abs), mime, kind };
}
/**
 * Decode base64 or a data URL into upload bytes.
 * @param raw Data URL or bare base64 payload.
 * @param label Source description used in error messages.
 * @returns File bytes with a validated MIME type and a generated filename.
 */
export function readUploadFromBase64(raw, label = 'base64 参考素材') {
    const match = /^data:([^;]+);base64,(.+)$/s.exec(raw.trim());
    const declared = match?.[1];
    const body = (match?.[2] ?? raw).replace(/\s+/g, '');
    let data;
    try {
        data = Buffer.from(body, 'base64');
    }
    catch {
        throw new Error(`无法解码 ${label}`);
    }
    const mime = sniffUploadMime(data) ?? declared;
    if (!mime) {
        throw new Error(`无法识别 ${label} 的类型`);
    }
    const kind = assertUploadPayload(mime, data.byteLength, label);
    return { data, filename: uploadFilenameFor(mime), mime, kind };
}
/** Whether a reference string is already a fetchable http(s) URL. */
export function isHttpUrl(raw) {
    try {
        const { protocol } = new URL(raw.trim());
        return protocol === 'http:' || protocol === 'https:';
    }
    catch {
        return false;
    }
}
/** Whether a reference string carries inline base64 bytes rather than a location. */
export function looksLikeBase64(raw) {
    const value = raw.trim();
    if (value.startsWith('data:'))
        return true;
    return value.length > 256 && /^[A-Za-z0-9+/\r\n=]+$/.test(value);
}
export function guessImageExtFromUrl(url) {
    try {
        const ext = path.extname(new URL(url).pathname).toLowerCase();
        if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext))
            return ext;
    }
    catch {
        // ignore
    }
    return '.png';
}
export function guessVideoExtFromUrl(url) {
    try {
        const ext = path.extname(new URL(url).pathname).toLowerCase();
        if (['.mp4', '.webm', '.mov', '.mkv'].includes(ext))
            return ext;
    }
    catch {
        // ignore
    }
    return '.mp4';
}
//# sourceMappingURL=files.js.map