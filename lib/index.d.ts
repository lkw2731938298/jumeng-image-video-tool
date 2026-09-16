import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
export declare const name = "jumeng-media";
export declare const inject: string[];
/** Settings namespace shown in Web UI → 插件 → 插件配置. */
export declare const JUMENG_MEDIA_SETTINGS_NS = "jumeng-media";
export interface Config {
    apiKey?: string;
    apiKeyEnv: string;
    baseUrl: string;
    imageModel: string;
    videoModel: string;
    outputDir: string;
    imageTimeoutMs: number;
    videoPollIntervalMs: number;
    videoTimeoutMs: number;
    uploadTimeoutMs: number;
}
export declare const Config: Schema<Config>;
export declare function apply(ctx: Context, config: Config): void;
