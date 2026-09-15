import { mkdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

export function resolveOutputDir(configured: string, override?: string): string {
  const raw = (override || configured || './outputs').trim() || './outputs'
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw)
}

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
}

/** Unique suffix so repeated generations do not overwrite prior deliverables. */
export function uniqueStamp(): string {
  return String(Date.now())
}

/**
 * Confirm a local deliverable exists and has non-zero size.
 * @returns File size in bytes.
 */
export async function assertNonEmptyFile(filePath: string): Promise<number> {
  const abs = path.resolve(filePath)
  let st
  try {
    st = await stat(abs)
  } catch {
    throw new Error(`下载后文件不存在: ${abs}`)
  }
  if (!st.isFile() || st.size <= 0) {
    throw new Error(`下载后文件为空或无效 (size=${st.size} bytes): ${abs}`)
  }
  return st.size
}

function stripDataUrl(b64: string): { mime: string; data: string } {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(b64)
  if (match) return { mime: match[1], data: match[2] }
  return { mime: 'image/png', data: b64 }
}

function extFromMime(mime: string): string {
  if (mime.includes('jpeg') || mime.includes('jpg')) return '.jpg'
  if (mime.includes('webp')) return '.webp'
  if (mime.includes('gif')) return '.gif'
  if (mime.includes('mp4')) return '.mp4'
  if (mime.includes('webm')) return '.webm'
  return '.png'
}

export async function saveBase64Image(
  dir: string,
  prefix: string,
  index: number,
  b64: string,
  stamp = uniqueStamp(),
): Promise<{ path: string; bytes: number }> {
  await ensureDir(dir)
  const { mime, data } = stripDataUrl(b64)
  const filePath = path.join(dir, `${prefix}-${stamp}-${index}${extFromMime(mime)}`)
  await writeFile(filePath, Buffer.from(data, 'base64'))
  const abs = path.resolve(filePath)
  const bytes = await assertNonEmptyFile(abs)
  return { path: abs, bytes }
}

export async function downloadToFile(
  url: string,
  filePath: string,
  signal?: AbortSignal,
  timeoutMs = 300_000,
): Promise<{ path: string; bytes: number }> {
  await ensureDir(path.dirname(filePath))
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) {
      throw new Error(`download failed HTTP ${res.status}: ${url}`)
    }
    const buf = Buffer.from(await res.arrayBuffer())
    await writeFile(filePath, buf)
    const abs = path.resolve(filePath)
    const bytes = await assertNonEmptyFile(abs)
    return { path: abs, bytes }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

export function guessImageExtFromUrl(url: string): string {
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase()
    if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) return ext
  } catch {
    // ignore
  }
  return '.png'
}

export function guessVideoExtFromUrl(url: string): string {
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase()
    if (['.mp4', '.webm', '.mov', '.mkv'].includes(ext)) return ext
  } catch {
    // ignore
  }
  return '.mp4'
}
