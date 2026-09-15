/**
 * Minimal ambient types so the plugin can typecheck without installing the full
 * @deepseek-ai/dsh-tools peer graph (provided by DeepSeek Harness at runtime).
 */
declare module '@deepseek-ai/dsh-tools' {
  export interface ToolParameter {
    type: string
    required?: boolean
    description?: string
    items?: unknown
    properties?: Record<string, unknown>
    [key: string]: unknown
  }

  export interface DefineToolOptions<TArgs = any, TValue = any> {
    name: string
    description: string
    parameters?: Record<string, ToolParameter>
    output: {
      schema: unknown
      render: (args: TArgs, value: TValue) => Array<{ type: string; text?: string; [key: string]: unknown }>
    }
    execute: (
      args: TArgs,
      exec?: { signal?: AbortSignal; [key: string]: unknown },
    ) => Promise<TValue> | TValue
  }

  export function defineTool<TArgs = any, TValue = any>(
    options: DefineToolOptions<TArgs, TValue>,
  ): unknown
}
