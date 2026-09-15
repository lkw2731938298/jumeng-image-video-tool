import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import path from 'node:path'
import {
  JumengApiError,
  JumengClient,
  isImageModel,
  isVideoModel,
  type JumengModel,
} from './api.js'
import {
  downloadToFile,
  guessImageExtFromUrl,
  guessVideoExtFromUrl,
  resolveOutputDir,
  saveBase64Image,
  uniqueStamp,
} from './files.js'
import { importHarnessPackage } from './harness-import.js'

const { defineTool } = await importHarnessPackage<{
  defineTool: (options: any) => unknown
}>('@deepseek-ai/dsh-tools')

export const name = 'jumeng-media'
export const inject = ['tools']

/** Settings namespace shown in Web UI → 插件 → 插件配置. */
export const JUMENG_MEDIA_SETTINGS_NS = 'jumeng-media'

const DEFAULT_API_KEY_ENV = 'JUMENG_API_KEY'

export interface Config {
  apiKey?: string
  apiKeyEnv: string
  baseUrl: string
  imageModel: string
  videoModel: string
  outputDir: string
  imageTimeoutMs: number
  videoPollIntervalMs: number
  videoTimeoutMs: number
}

export const Config = Schema.object({
  apiKey: (Schema.string() as any).role('secret').description('聚梦 API Key 字面量（优先用 Web UI / 凭据，避免写入配置文件）'),
  apiKeyEnv: (Schema.string() as any)
    .role('credential-ref')
    .default(DEFAULT_API_KEY_ENV)
    .description('凭据引用名；Web UI 保存的密钥写入此引用'),
  baseUrl: Schema.string().default('https://www.jumengai.com/v1').description('API Base URL'),
  imageModel: Schema.string().default('').description('默认生图模型 ID（可留空）'),
  videoModel: Schema.string().default('').description('默认生视频模型 ID（可留空）'),
  outputDir: Schema.string().default('./outputs').description('默认输出目录'),
  imageTimeoutMs: Schema.number().default(300_000).description('生图请求超时（毫秒）'),
  videoPollIntervalMs: Schema.number().default(10_000).description('视频任务轮询间隔（毫秒）'),
  videoTimeoutMs: Schema.number().default(900_000).description('视频任务最长等待（毫秒）'),
}) as any as Schema<Config>

function requireModel(explicit: string | undefined, fallback: string, kind: 'image' | 'video'): string {
  const model = (explicit || fallback || '').trim()
  if (!model) {
    throw new JumengApiError(
      `${kind === 'image' ? '生图' : '生视频'}未指定 model。请先调用 list_models，或在插件配置中填写 ${kind === 'image' ? 'imageModel' : 'videoModel'}。`,
    )
  }
  return model
}

/**
 * Resolve API key without statically importing harness-only packages.
 * Out-of-tree plugins resolve from their own directory, so peerDependencies
 * like @deepseek-ai/dsh-credentials are not visible to Node ESM.
 */
async function resolveApiKey(ctx: Context, config: Config): Promise<string> {
  if (config.apiKey && config.apiKey.trim()) return config.apiKey.trim()

  const refName = (config.apiKeyEnv || DEFAULT_API_KEY_ENV).trim() || DEFAULT_API_KEY_ENV

  const credentials = ctx.get('credentials') as
    | { resolve?: (ref: string) => Promise<{ value?: string } | undefined> }
    | undefined
  if (credentials?.resolve) {
    try {
      const resolved = await credentials.resolve(refName)
      if (resolved?.value?.trim()) return resolved.value.trim()
    } catch {
      // Invalid ref grammar or missing store — fall through to env.
    }
  }

  const fromEnv = process.env[refName]?.trim()
  if (fromEnv) return fromEnv

  throw new JumengApiError(
    `未配置聚梦 API Key。请打开 设置 → 插件 → 插件配置 → 聚梦媒体，填写 API Key 并保存；或设置环境变量 ${refName}。`,
  )
}

async function createClient(ctx: Context, config: Config): Promise<JumengClient> {
  const apiKey = await resolveApiKey(ctx, config)
  return new JumengClient(apiKey, config.baseUrl)
}

function formatModels(models: JumengModel[]): string {
  if (!models.length) return '（无匹配模型）'
  return models
    .map((m) => {
      const types = (m.supported_endpoint_types || []).join(',') || '-'
      return `- ${m.id}  [${types}]`
    })
    .join('\n')
}

export function apply(ctx: Context, config: Config) {
  let current = (): Config => config

  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.installSection(ctx, JUMENG_MEDIA_SETTINGS_NS, Config, config, {
      setSource: (source) => {
        current = source
      },
      onChange: () => {},
    })
  })

  ctx.tools.register(
    defineTool({
      name: 'list_models',
      description:
        '列出聚梦 AI（Jumeng）可用模型。生成图片/视频前应先调用本工具选型；可按 kind 过滤 image 或 video。',
      parameters: {
        kind: {
          type: 'string',
          description: '过滤类型：all | image | video，默认 all',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            kind: { type: 'string' },
            count: { type: 'number' },
            models: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'string' },
                  supported_endpoint_types: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                },
              },
            },
            text: { type: 'string' },
          },
        },
        render: (_args: unknown, value: { text: string }) => [{ type: 'text', text: value.text }],
      },
      async execute(args: any, exec?: { signal?: AbortSignal }) {
        const cfg = current()
        const kind = String(args.kind || 'all').toLowerCase()
        const client = await createClient(ctx, cfg)
        const all = await client.listModels(exec?.signal)
        let models = all
        if (kind === 'image') models = all.filter(isImageModel)
        else if (kind === 'video') models = all.filter(isVideoModel)

        const slim = models.map((m) => ({
          id: m.id,
          supported_endpoint_types: m.supported_endpoint_types || [],
        }))
        const text =
          `聚梦可用模型（kind=${kind}，共 ${slim.length} 个）\n` + formatModels(models as JumengModel[])
        return { kind, count: slim.length, models: slim, text }
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'generate_image',
      description:
        '使用聚梦 AI 生成图片（文生图；传入 image 则为图生图）。成功后下载到本地并返回绝对路径与字节大小。Agent 必须立即调用 present 工具，传入该本地绝对路径，Harness UI 才会展示交付物。模型可用 list_models(kind=image) 查询。',
      parameters: {
        prompt: { type: 'string', required: true, description: '提示词' },
        model: { type: 'string', description: '生图模型 ID；省略则用插件配置 imageModel' },
        size: {
          type: 'string',
          description: '尺寸，如 1024x1024 / 1024x1536 / 1536x1024，默认 1024x1024',
        },
        n: { type: 'number', description: '生成张数，默认 1' },
        image: {
          type: 'string',
          description: '参考图 URL 或 base64（图生图，部分模型支持）',
        },
        outputDir: { type: 'string', description: '输出目录，覆盖插件配置' },
        prefix: { type: 'string', description: '文件名前缀，默认 image' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            model: { type: 'string' },
            localPaths: { type: 'array', items: { type: 'string' } },
            urls: { type: 'array', items: { type: 'string' } },
            revisedPrompts: { type: 'array', items: { type: 'string' } },
            text: { type: 'string' },
          },
        },
        render: (_args: unknown, value: { text: string }) => [{ type: 'text', text: value.text }],
      },
      async execute(args: any, exec?: { signal?: AbortSignal }) {
        const cfg = current()
        const model = requireModel(args.model, cfg.imageModel, 'image')
        const client = await createClient(ctx, cfg)
        const images = await client.generateImage(
          {
            model,
            prompt: args.prompt,
            size: args.size,
            n: args.n,
            image: args.image,
          },
          { signal: exec?.signal, timeoutMs: cfg.imageTimeoutMs },
        )

        const dir = resolveOutputDir(cfg.outputDir, args.outputDir)
        const prefix = (args.prefix || 'image').trim() || 'image'
        const stamp = uniqueStamp()
        const localPaths: string[] = []
        const localBytes: number[] = []
        const urls: string[] = []
        const revisedPrompts: string[] = []

        for (let i = 0; i < images.length; i++) {
          const item = images[i]
          if (item.revised_prompt) revisedPrompts.push(item.revised_prompt)
          if (item.url) {
            urls.push(item.url)
            const ext = guessImageExtFromUrl(item.url)
            const filePath = path.join(dir, `${prefix}-${stamp}-${i + 1}${ext}`)
            const saved = await downloadToFile(item.url, filePath, exec?.signal)
            localPaths.push(saved.path)
            localBytes.push(saved.bytes)
          } else if (item.b64_json) {
            const saved = await saveBase64Image(dir, prefix, i + 1, item.b64_json, stamp)
            localPaths.push(saved.path)
            localBytes.push(saved.bytes)
          } else {
            throw new JumengApiError(`第 ${i + 1} 张图既无 url 也无 b64_json`)
          }
        }

        const text = [
          `生图完成 · model=${model}`,
          `本地文件:`,
          ...localPaths.map((p, i) => `- ${p} (${localBytes[i]} bytes)`),
          urls.length ? `远程 URL:` : '',
          ...urls.map((u) => `- ${u}`),
          `重要：你必须立即调用 present 工具，传入上述本地绝对路径，Harness UI 才会展示图片交付物。`,
        ]
          .filter(Boolean)
          .join('\n')

        return { model, localPaths, urls, revisedPrompts, text }
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'generate_video',
      description:
        '使用聚梦 AI 生成视频（文生视频；传入 image/images 则为图生视频）。异步提交并轮询，成功后下载到本地并返回绝对路径与字节大小。Agent 必须立即调用 present 工具，传入该本地绝对路径，Harness UI 才会展示交付物。模型可用 list_models(kind=video) 查询。',
      parameters: {
        prompt: { type: 'string', required: true, description: '提示词' },
        model: { type: 'string', description: '视频模型 ID；省略则用插件配置 videoModel' },
        size: {
          type: 'string',
          description: '画幅比例，如 16:9 / 9:16 / 1:1（写入请求 size；不要传 720P）',
        },
        ratio: {
          type: 'string',
          description: '画幅比例别名（优先于 size），如 16:9 / 9:16 / 1:1，默认 16:9',
        },
        resolution: {
          type: 'string',
          description: '清晰度：720P / 1080P（写入请求 resolution），默认 720P',
        },
        duration: { type: 'number', description: '时长（秒），默认 5' },
        watermark: { type: 'boolean', description: '是否加水印' },
        seed: { type: 'number', description: '随机种子（部分模型）' },
        image: {
          type: 'string',
          description: '单张参考图 URL/base64（图生视频首帧）',
        },
        images: {
          type: 'array',
          items: { type: 'string' },
          description: '多张参考图 URL 列表（多参考图生视频）',
        },
        outputDir: { type: 'string', description: '输出目录，覆盖插件配置' },
        prefix: { type: 'string', description: '文件名前缀，默认 video' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            model: { type: 'string' },
            taskId: { type: 'string' },
            localPath: { type: 'string' },
            url: { type: 'string' },
            text: { type: 'string' },
          },
        },
        render: (_args: unknown, value: { text: string }) => [{ type: 'text', text: value.text }],
      },
      async execute(args: any, exec?: { signal?: AbortSignal }) {
        const cfg = current()
        const model = requireModel(args.model, cfg.videoModel, 'video')
        const client = await createClient(ctx, cfg)
        const submitted = await client.submitVideo(
          {
            model,
            prompt: args.prompt,
            size: args.size,
            ratio: args.ratio || args.size,
            resolution: args.resolution || '720P',
            duration: args.duration ?? 5,
            watermark: args.watermark,
            seed: args.seed,
            image: args.image,
            images: args.images,
          },
          { signal: exec?.signal },
        )

        const taskId = submitted.task_id || submitted.id
        if (!taskId) {
          throw new JumengApiError('提交视频任务成功但未返回 task_id', undefined, submitted)
        }

        const done = await client.waitForVideo(taskId, {
          signal: exec?.signal,
          pollIntervalMs: cfg.videoPollIntervalMs,
          timeoutMs: cfg.videoTimeoutMs,
        })

        const dir = resolveOutputDir(cfg.outputDir, args.outputDir)
        const prefix = (args.prefix || 'video').trim() || 'video'
        const ext = guessVideoExtFromUrl(done.result_url!)
        const filePath = path.join(dir, `${prefix}-${uniqueStamp()}${ext}`)
        const saved = await downloadToFile(done.result_url!, filePath, exec?.signal, 300_000)

        const text = [
          `生视频完成 · model=${model}`,
          `task_id=${taskId}`,
          `本地文件: ${saved.path} (${saved.bytes} bytes)`,
          `远程 URL: ${done.result_url}`,
          `重要：你必须立即调用 present 工具，传入本地绝对路径 ${saved.path}，Harness UI 才会展示视频交付物。`,
        ].join('\n')

        return {
          model,
          taskId,
          localPath: saved.path,
          url: done.result_url!,
          text,
        }
      },
    }),
  )
}
