export interface JumengModel {
    id: string;
    supported_endpoint_types?: string[];
    [key: string]: unknown;
}
export interface ImageGenerationResult {
    url?: string;
    b64_json?: string;
    revised_prompt?: string;
}
export interface VideoTaskSubmitResult {
    id?: string;
    task_id?: string;
    status?: string;
    progress?: number | string;
    model?: string;
}
export interface VideoTaskStatus {
    task_id?: string;
    status: string;
    progress?: string | number;
    result_url?: string;
    fail_reason?: string;
}
/** Successful `/files/upload` response; `url` expires about one hour after `created_at`. */
export interface JumengFile {
    id?: string;
    object?: string;
    bytes?: number;
    created_at?: number;
    expires_at?: number;
    filename?: string;
    purpose?: string;
    kind?: string;
    url: string;
}
/** Bytes plus the metadata `/files/upload` needs for its `file` part. */
export interface UploadPayload {
    data: Uint8Array;
    filename: string;
    mime: string;
}
export interface GenerateImageParams {
    model: string;
    prompt: string;
    size?: string;
    n?: number;
    image?: string;
}
export interface GenerateVideoParams {
    model: string;
    prompt: string;
    /**
     * Aspect ratio for the Jumeng video gateway `size` field.
     * Live API expects values like `16:9` / `9:16` (NOT `720P`).
     */
    size?: string;
    /** Clarity: `720P` / `1080P` — sent as `resolution`. */
    resolution?: string;
    duration?: number;
    seconds?: string;
    image?: string;
    images?: string[];
    input_reference?: string;
    /** Alias for aspect ratio; preferred over `size` when both are set. */
    ratio?: string;
    watermark?: boolean;
    seed?: number;
    /** Extra body fields merged into the submit payload (model-specific). */
    extra?: Record<string, unknown>;
}
export declare class JumengApiError extends Error {
    readonly status?: number | undefined;
    readonly body?: unknown | undefined;
    constructor(message: string, status?: number | undefined, body?: unknown | undefined);
}
export declare class JumengClient {
    private readonly apiKey;
    private readonly baseUrl;
    constructor(apiKey: string, baseUrl: string);
    private endpoint;
    private request;
    listModels(signal?: AbortSignal): Promise<JumengModel[]>;
    /**
     * Upload one reference image or video and return its temporary public URL.
     * @param payload File bytes with the filename and MIME type sent in the `file` part.
     * @returns Upload record whose `url` other endpoints accept as a reference.
     */
    uploadFile(payload: UploadPayload, opts?: {
        signal?: AbortSignal;
        timeoutMs?: number;
    }): Promise<JumengFile>;
    generateImage(params: GenerateImageParams, opts?: {
        signal?: AbortSignal;
        timeoutMs?: number;
    }): Promise<ImageGenerationResult[]>;
    submitVideo(params: GenerateVideoParams, opts?: {
        signal?: AbortSignal;
    }): Promise<VideoTaskSubmitResult>;
    getVideoTask(taskId: string, opts?: {
        signal?: AbortSignal;
    }): Promise<VideoTaskStatus>;
    waitForVideo(taskId: string, opts: {
        signal?: AbortSignal;
        pollIntervalMs: number;
        timeoutMs: number;
        onProgress?: (status: VideoTaskStatus) => void;
    }): Promise<VideoTaskStatus>;
}
export declare function isImageModel(model: JumengModel): boolean;
export declare function isVideoModel(model: JumengModel): boolean;
