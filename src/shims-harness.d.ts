/** Ambient types for Harness services provided at runtime. */

declare module '@deepseek-ai/dsh-credentials' {
  export type CredentialRef = string & { readonly __brand?: 'CredentialRef' }
  export function credentialRef(value: string): CredentialRef
}

declare module '@deepseek-ai/dsh-launch-environment' {
  import type { Context } from '@deepseek-ai/cordis'
  export interface LaunchEnvironmentSnapshot {
    get(ref: string): { value: string } | undefined
  }
  export function launchEnvironmentOf(ctx: Context): LaunchEnvironmentSnapshot
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    tools: {
      register(tool: unknown): (() => void) | void
    }
    settings: {
      installSection(
        owner: Context,
        ns: string,
        schema: unknown,
        entry: unknown,
        hooks: {
          setSource: (source: () => any) => void
          onChange: () => void
        },
      ): void
    }
    get(name: 'credentials'):
      | {
          resolve(ref: string): Promise<{ value: string } | undefined>
        }
      | undefined
    get(name: string): unknown
    inject(deps: string[], callback: (ctx: Context) => void): void
  }
}
