/**
 * Browser half for jumeng-media — registers a settings card under
 * Settings → Plugins → Plugin configuration.
 *
 * Delivered as a lazy-CJS ModuleLoader factory (DeepSeek Harness client-modules).
 */
window.__ModuleLoader__.load({
  id: 'jumeng-media',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const react = require('react')
    const { jsx, jsxs } = require('react/jsx-runtime')
    const { createSnapshotStore } = require('@deepseek-ai/dsh-client-store')

    const SETTINGS_NS = 'jumeng-media'
    const LOCALE_NS = 'jumeng-media.settings'
    const DEFAULT_API_KEY_REF = 'JUMENG_API_KEY'
    const TEXT_FIELDS = ['baseUrl', 'imageModel', 'videoModel', 'outputDir']

    const css = `
.jm_card{border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-3);border-radius:16px;list-style:none;margin:0 0 12px}
.jm_cardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}
.jm_header{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;display:flex;align-items:center;gap:12px;padding:14px 16px}
.jm_headText{display:flex;flex-direction:column;gap:4px;flex:1;min-width:0}
.jm_name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}
.jm_desc{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}
.jm_body{border-top:.5px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:8px}
.jm_field{margin:12px 0}
.jm_label{display:block;color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;margin-bottom:6px}
.jm_input{width:100%;box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border-radius:8px;padding:8px 10px;font:inherit;font-size:13px}
.jm_hint{margin:6px 0 0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5}
.jm_badge{display:inline-block;margin-left:8px;padding:1px 8px;border-radius:999px;font-size:11px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary)}
.jm_footer{border-top:.5px solid var(--dsw-alias-border-l2);display:flex;justify-content:flex-end;gap:8px;align-items:center;padding:12px 0 4px}
.jm_failed{flex:1;margin:0;color:var(--dsw-alias-label-error);font-size:12px}
.jm_btn{appearance:none;font:inherit;cursor:pointer;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5}
.jm_discard{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:transparent}
.jm_save{border:1px solid transparent;background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}
.jm_btn:disabled{opacity:.4;cursor:default}
.jm_pending{flex:none;font-size:11px;color:var(--dsw-alias-label-secondary)}
`
    const cssId = 'jumeng-media/settings-card.css'
    if (typeof document !== 'undefined' && !document.querySelector('style[data-plugin-css="' + cssId + '"]')) {
      const tag = document.createElement('style')
      tag.dataset.plugin = 'jumeng-media'
      tag.dataset.pluginCss = cssId
      tag.textContent = css
      document.head.appendChild(tag)
    }

    const en = {
      title: 'JuMeng Media',
      description: 'Generate images and videos via JuMeng AI.',
      apiKey: 'API key',
      apiKeyHint: 'Stored in credentials, not the settings file. Leave blank to keep the current key.',
      apiKeySet: 'A key is configured.',
      apiKeyUnset: 'No key yet — generation is unavailable until one is saved.',
      baseUrl: 'Base URL',
      baseUrlHint: 'OpenAI-compatible /v1 endpoint.',
      imageModel: 'Default image model',
      imageModelHint: 'Optional. Agents can still pass model explicitly or call list_models.',
      videoModel: 'Default video model',
      videoModelHint: 'Optional. Agents can still pass model explicitly or call list_models.',
      outputDir: 'Output directory',
      outputDirHint: 'Default folder for downloaded images and videos.',
      expand: 'Show settings',
      collapse: 'Hide settings',
      save: 'Save',
      saving: 'Saving…',
      discard: 'Discard',
      unsaved: 'Unsaved',
      saveFailed: 'The deployment did not accept these values; they were left for you to correct.',
      readOnly: 'This deployment stores settings read-only.',
    }

    const zh = {
      title: '聚梦媒体',
      description: '通过聚梦 AI 生成图片与视频。',
      apiKey: 'API 密钥',
      apiKeyHint: '保存在凭据库，不会写入设置文件。留空表示保留当前密钥。',
      apiKeySet: '已配置密钥。',
      apiKeyUnset: '尚未配置密钥；保存后才能生成。',
      baseUrl: 'Base URL',
      baseUrlHint: 'OpenAI 兼容的 /v1 端点。',
      imageModel: '默认生图模型',
      imageModelHint: '可选。Agent 仍可显式传 model，或先调用 list_models。',
      videoModel: '默认生视频模型',
      videoModelHint: '可选。Agent 仍可显式传 model，或先调用 list_models。',
      outputDir: '输出目录',
      outputDirHint: '下载成图/成片的默认目录。',
      expand: '展开设置',
      collapse: '收起设置',
      save: '保存',
      saving: '保存中…',
      discard: '放弃修改',
      unsaved: '未保存',
      saveFailed: '部署未接受这些值；已保留草稿供你修改。',
      readOnly: '本部署的设置为只读。',
    }

    function refOf(snapshot) {
      const declared = snapshot?.value?.apiKeyEnv
      return declared && String(declared).length > 0 ? String(declared) : DEFAULT_API_KEY_REF
    }

    function sectionString(snapshot, field) {
      const value = snapshot?.value?.[field]
      return typeof value === 'string' ? value : ''
    }

    class JumengMediaCardController {
      constructor(scope, ctx) {
        this.scope = scope
        this.ctx = ctx
        this.staged = new Map()
        this.saving = false
        this.failed = false
        this.credential = { ref: '', configured: false, writable: true }
        this.store = createSnapshotStore(this.projection())
        this.scope.subscribe(() => {
          this.readCredential()
          this.publish()
        })
        this.readCredential()
      }

      publish() {
        this.store.set(this.projection())
      }

      projection() {
        const snapshot = this.scope.getSnapshot()
        const dirty = this.plan().length > 0
        return {
          available: snapshot.status === 'ready',
          writable: !!snapshot.writable,
          dirty,
          invalid: false,
          saving: this.saving,
          failed: this.failed,
          apiKeyConfigured: this.credential.configured,
          apiKeyWritable: this.credential.writable,
          apiKeyText: this.staged.get('apiKey')?.text ?? '',
          baseUrl: this.fieldText('baseUrl'),
          imageModel: this.fieldText('imageModel'),
          videoModel: this.fieldText('videoModel'),
          outputDir: this.fieldText('outputDir'),
        }
      }

      fieldText(field) {
        const staged = this.staged.get(field)
        if (staged) return staged.text
        return sectionString(this.scope.getSnapshot(), field)
      }

      plan() {
        const plan = []
        const snapshot = this.scope.getSnapshot()
        for (const [field, staged] of this.staged) {
          if (field === 'apiKey') {
            const value = staged.text.trim()
            if (value) {
              plan.push({
                run: async () => {
                  await this.ctx.remote.credentials.set(refOf(snapshot), value)
                  await this.readCredential()
                  return this.credential.configured
                },
              })
            }
            continue
          }
          const current = sectionString(snapshot, field)
          const next = staged.text.trim()
          if (next === current) continue
          if (next === '') {
            plan.push({
              run: async () => {
                await this.scope.unset(field)
                return true
              },
            })
          } else {
            plan.push({
              run: async () => {
                await this.scope.set(field, next)
                return true
              },
            })
          }
        }
        return plan
      }

      async readCredential() {
        const ref = refOf(this.scope.getSnapshot())
        if (ref !== this.credential.ref) {
          this.credential = { ref, configured: false, writable: true }
          this.publish()
        }
        const response = await this.ctx.remote.credentials.describe([ref])
        if (!response.ok || ref !== refOf(this.scope.getSnapshot())) return
        const view = response.value[ref]
        this.credential = {
          ref,
          configured: view?.configured ?? false,
          writable: view?.writable ?? true,
        }
        this.publish()
      }

      refreshCredential(ref) {
        if (ref !== this.credential.ref) return
        this.readCredential()
      }

      edit(field, text) {
        this.staged.set(field, { text })
        this.failed = false
        this.publish()
      }

      discard() {
        if (this.staged.size === 0 && !this.failed) return
        this.staged.clear()
        this.failed = false
        this.publish()
      }

      async save() {
        const plan = this.plan()
        if (!plan.length || this.saving) return
        this.saving = true
        this.failed = false
        this.publish()
        let landed = true
        for (const item of plan) {
          try {
            landed = (await item.run()) && landed
          } catch {
            landed = false
            break
          }
        }
        if (landed) this.staged.clear()
        this.saving = false
        this.failed = !landed
        this.publish()
      }

      inject() {
        return {
          hooks: {
            jumengMediaCard: this.store,
          },
          edit: (field, text) => this.edit(field, text),
          save: () => {
            void this.save()
          },
          discard: () => this.discard(),
        }
      }
    }

    function Field(props) {
      return jsxs('div', {
        className: 'jm_field',
        children: [
          jsxs('label', {
            className: 'jm_label',
            htmlFor: props.id,
            children: [
              props.label,
              props.badge
                ? jsx('span', { className: 'jm_badge', children: props.badge })
                : null,
            ],
          }),
          jsx('input', {
            id: props.id,
            className: 'jm_input',
            type: props.type || 'text',
            autoComplete: 'off',
            value: props.value,
            disabled: props.disabled,
            placeholder: props.placeholder || '',
            onChange: (event) => props.onEdit(event.target.value),
          }),
          jsx('p', { className: 'jm_hint', children: props.hint }),
        ],
      })
    }

    function JumengMediaCard(props) {
      const { t } = props
      const state = props.useJumengMediaCard((snapshot) => snapshot)
      const [open, setOpen] = react.useState(false)
      const saveStarted = react.useRef(false)

      react.useEffect(() => {
        if (state.saving) {
          saveStarted.current = true
          return
        }
        if (!saveStarted.current) return
        saveStarted.current = false
        if (!state.dirty && !state.failed) setOpen(false)
      }, [state.dirty, state.failed, state.saving])

      if (!state.available) return null

      const title = t('title')
      const disabled = !state.writable
      const blocked = !state.dirty || state.saving

      return jsxs('li', {
        className: 'jm_card' + (open ? ' jm_cardOpen' : ''),
        children: [
          jsxs('button', {
            type: 'button',
            className: 'jm_header',
            'aria-expanded': open,
            'aria-label': `${t(open ? 'collapse' : 'expand')}: ${title}`,
            onClick: () => setOpen(!open),
            children: [
              jsxs('span', {
                className: 'jm_headText',
                children: [
                  jsx('span', { className: 'jm_name', children: title }),
                  jsx('span', { className: 'jm_desc', children: t('description') }),
                ],
              }),
              state.dirty
                ? jsx('span', { className: 'jm_pending', children: t('unsaved') })
                : null,
            ],
          }),
          open
            ? jsxs('div', {
                className: 'jm_body',
                children: [
                  !state.writable
                    ? jsx('p', { className: 'jm_hint', role: 'status', children: t('readOnly') })
                    : null,
                  jsx(Field, {
                    id: 'jumeng-media-api-key',
                    label: t('apiKey'),
                    hint: t('apiKeyHint'),
                    type: 'password',
                    disabled: !state.apiKeyWritable,
                    value: state.apiKeyText,
                    badge: state.apiKeyConfigured ? t('apiKeySet') : t('apiKeyUnset'),
                    onEdit: (text) => props.edit('apiKey', text),
                  }),
                  ...TEXT_FIELDS.map((field) =>
                    jsx(
                      Field,
                      {
                        id: `jumeng-media-${field}`,
                        label: t(field),
                        hint: t(`${field}Hint`),
                        disabled,
                        value: state[field],
                        onEdit: (text) => props.edit(field, text),
                      },
                      field,
                    ),
                  ),
                  jsxs('div', {
                    className: 'jm_footer',
                    children: [
                      state.failed
                        ? jsx('p', {
                            className: 'jm_failed',
                            role: 'status',
                            children: t('saveFailed'),
                          })
                        : null,
                      jsx('button', {
                        type: 'button',
                        className: 'jm_btn jm_discard',
                        disabled: blocked && !state.failed,
                        onClick: props.discard,
                        children: t('discard'),
                      }),
                      jsx('button', {
                        type: 'button',
                        className: 'jm_btn jm_save',
                        disabled: blocked,
                        onClick: props.save,
                        children: state.saving ? t('saving') : t('save'),
                      }),
                    ],
                  }),
                ],
              })
            : null,
        ],
      })
    }

    const inject = ['slots', 'locale', 'remote', 'remote.credentials', 'settingsScope']

    function apply(ctx) {
      ctx.effect(
        () =>
          ctx.locale.register(LOCALE_NS, {
            zh,
            en,
          }),
        'jumeng-media: locale',
      )

      const controller = new JumengMediaCardController(
        ctx.settingsScope.bind({ namespace: SETTINGS_NS }),
        ctx,
      )

      ctx.effect(
        () =>
          ctx.remote.$on('credentials/reference-updated', (ref) => {
            controller.refreshCredential(ref)
          }),
        'jumeng-media: credential invalidations',
      )

      ctx.slots.inject('settings.plugin.item', function* () {
        yield ctx.slots.register(
          {
            name: 'settings.plugin.item',
            key: SETTINGS_NS,
            locale: LOCALE_NS,
            inject: () => controller.inject(),
          },
          JumengMediaCard,
        )
      })
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
