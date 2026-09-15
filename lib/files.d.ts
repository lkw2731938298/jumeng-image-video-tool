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
export declare function guessImageExtFromUrl(url: string): string;
export declare function guessVideoExtFromUrl(url: string): string;
