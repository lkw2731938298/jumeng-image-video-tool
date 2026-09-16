export declare function resolveOutputDir(configured: string, override?: string): string;
export declare function ensureDir(dir: string): Promise<void>;
/** Unique suffix so repeated generations do not overwrite prior deliverables. */
export declare function uniqueStamp(): string;
/**
 * Confirm a local deliverable exists and has non-zero size.
 * @returns File size in bytes.
 */
export declare function assertNonEmptyFile(filePath: string): Promise<number>;
export declare function saveBase64Image(dir: string, prefix: string, index: number, b64: string, stamp?: string): Promise<{
    path: string;
    bytes: number;
}>;
export declare function downloadToFile(url: string, filePath: string, signal?: AbortSignal, timeoutMs?: number): Promise<{
    path: string;
    bytes: number;
}>;
/** Media kind `/files/upload` reports for an accepted MIME type. */
export type UploadKind = 'image' | 'video';
/**
 * Recognize the accepted upload types from their leading magic bytes.
 * @param data File bytes to inspect.
 * @returns Matching MIME type, or `undefined` when no signature matches.
 */
export declare function sniffUploadMime(data: Uint8Array): string | undefined;
/**
 * Classify an upload MIME type and reject payloads the endpoint would refuse.
 * @param mime MIME type sent in the `file` part.
 * @param bytes Payload size.
 * @param label Source description used in error messages.
 * @returns Kind the endpoint will report for this file.
 */
export declare function assertUploadPayload(mime: string, bytes: number, label: string): UploadKind;
/** Default filename for payloads that arrive without one, such as base64 input. */
export declare function uploadFilenameFor(mime: string, prefix?: string): string;
/**
 * Read a local reference file and derive the metadata `/files/upload` requires.
 * @param filePath Absolute or CWD-relative path.
 * @returns File bytes with a validated MIME type and its basename.
 */
export declare function readUploadFromDisk(filePath: string): Promise<{
    data: Uint8Array;
    filename: string;
    mime: string;
    kind: UploadKind;
}>;
/**
 * Decode base64 or a data URL into upload bytes.
 * @param raw Data URL or bare base64 payload.
 * @param label Source description used in error messages.
 * @returns File bytes with a validated MIME type and a generated filename.
 */
export declare function readUploadFromBase64(raw: string, label?: string): {
    data: Uint8Array;
    filename: string;
    mime: string;
    kind: UploadKind;
};
/** Whether a reference string is already a fetchable http(s) URL. */
export declare function isHttpUrl(raw: string): boolean;
/** Whether a reference string carries inline base64 bytes rather than a location. */
export declare function looksLikeBase64(raw: string): boolean;
export declare function guessImageExtFromUrl(url: string): string;
export declare function guessVideoExtFromUrl(url: string): string;
