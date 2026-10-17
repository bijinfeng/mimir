import { useEffect, useState, type ReactNode } from 'react'
import { Check, RotateCcw } from 'lucide-react'
import type { ThemeColors } from '../../vendor/packages/docx-engine/src/types.js'
import { docxDesignSaveOptions, liveDocxTheme, type DocxDesignEdits } from '../docx-design-save.js'
import {
  ToolbarButton,
  ToolbarColorPicker,
  ToolbarMenuFields,
  ToolbarMenuNote,
  ToolbarPropertyForm,
  ToolbarSelect,
} from '../shell/EditorShell.js'
import type { DocxAdvancedContext } from './DocxAdvancedControls.js'
import {
  applyDocxDesign,
  docxDesignTarget,
  DESIGN_COLOR_PRESETS,
  DESIGN_FONT_PRESETS,
  DESIGN_THEMES,
} from './docx-design.js'
import './docx-design.css'

const ACCENTS = ['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'] as const
const matchesColors = (a?: ThemeColors | null, b?: ThemeColors | null) =>
  ['dk2', 'lt2', ...ACCENTS].every(
    (key) => a?.[key as keyof ThemeColors] === b?.[key as keyof ThemeColors],
  )
function Palette({ colors }: { colors?: ThemeColors | null }) {
  return (
    <span className="mimir-docx-design__palette" aria-hidden="true">
      {ACCENTS.map((slot) => (
        <i key={slot} style={{ background: `#${colors?.[slot] ?? 'CCCCCC'}` }} />
      ))}
    </span>
  )
}
function useDesign(context: DocxAdvancedContext) {
  const [target, setTarget] = useState(() => docxDesignTarget(context.editor, context.sections))
  const [optionsIdentity] = useState(() => JSON.stringify(context.options))
  const [stale, setStale] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [current, setCurrent] = useState<Awaited<ReturnType<typeof liveDocxTheme>> | null>(null)
  useEffect(() => {
    const check = () => {
      if (context.editor.state.doc !== target.doc) setStale(true)
    }
    context.editor.on('transaction', check)
    return () => {
      context.editor.off('transaction', check)
    }
  }, [context.editor, target])
  useEffect(() => {
    let active = true
    liveDocxTheme(
      context.session,
      docxDesignSaveOptions(target.doc, context.options, context.session),
    )
      .then((value) => {
        if (active) setCurrent(value)
      })
      .catch((cause) => {
        if (active) setError(String(cause))
      })
    return () => {
      active = false
    }
  }, [context.session, context.options, target])
  const locked =
    stale || context.editor.isDestroyed || optionsIdentity !== JSON.stringify(context.options)
  const apply = (
    patch: DocxDesignEdits,
    border?: { enabled: boolean; scope: 'section' | 'document' },
  ) => {
    try {
      if (locked) throw new Error('文档已变化，请重新打开设计设置')
      const next = applyDocxDesign(context.editor, target, patch, border)
      setTarget(next)
      setStale(false)
      setError('')
      setStatus('已应用，可在工具栏撤销')
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      return false
    }
  }
  return {
    target,
    current,
    locked,
    error,
    status,
    apply,
    clearStatus: () => {
      setError('')
      setStatus('')
    },
  }
}
function DesignFrame({
  children,
  locked,
  dirty,
  error,
  status,
  onApply,
  onReset,
  unavailable = false,
}: {
  children: ReactNode
  locked: boolean
  dirty: boolean
  error: string
  status: string
  onApply: () => void
  onReset: () => void
  unavailable?: boolean
}) {
  return (
    <div className="mimir-docx-design">
      <div className="mimir-docx-design__scroll">
        <fieldset disabled={locked}>
          <ToolbarPropertyForm>{children}</ToolbarPropertyForm>
        </fieldset>
      </div>
      <div className="mimir-docx-design__actions">
        {(error || locked || status) && (
          <p role={error || locked ? 'alert' : 'status'}>
            {error || (locked ? '文档已变化，请关闭并重新打开面板。' : status)}
          </p>
        )}
        <div className="mimir-docx-design__buttons">
          <ToolbarButton label="重置设计草稿" disabled={locked || !dirty} onClick={onReset}>
            <RotateCcw size={14} />
            <span>重置草稿</span>
          </ToolbarButton>
          <ToolbarButton
            label="应用设计"
            disabled={locked || unavailable || !dirty}
            onClick={onApply}
          >
            <Check size={14} />
            <span>应用</span>
          </ToolbarButton>
        </div>
      </div>
    </div>
  )
}
export function DocxThemeControls({ context }: { context: DocxAdvancedContext }) {
  const state = useDesign(context)
  const locked = state.locked || !state.current?.themeSupported
  const [draft, setDraft] = useState<DocxDesignEdits>({})
  const [themeName, setThemeName] = useState('')
  const fonts =
    draft.fonts === null
      ? context.session.footnotes.parsed.themeFonts
      : (draft.fonts ?? state.current?.fonts)
  const colors =
    draft.colors === null
      ? context.session.footnotes.parsed.themeColors
      : (draft.colors ?? state.current?.colors)
  const change = (patch: DocxDesignEdits, name = '') => {
    setDraft({ ...draft, ...patch })
    setThemeName(name)
    state.clearStatus()
  }
  const fontChoice =
    draft.fonts === null
      ? 'original'
      : draft.fonts
        ? DESIGN_FONT_PRESETS.findIndex(
            (p) => JSON.stringify(p.fonts) === JSON.stringify(draft.fonts),
          )
        : -1
  return (
    <DesignFrame
      {...state}
      unavailable={!state.current?.themeSupported}
      dirty={Object.keys(draft).length > 0}
      onReset={() => {
        setDraft({})
        setThemeName('')
        state.clearStatus()
      }}
      onApply={() => {
        if (state.apply(draft)) {
          setDraft({})
          setThemeName('')
        }
      }}
    >
      <ToolbarMenuFields label="文档主题">
        {state.current && !state.current.themeSupported && (
          <ToolbarMenuNote>原件主题路径不受支持，保留原主题；请在 Word 中修改。</ToolbarMenuNote>
        )}
        <ToolbarMenuNote>主题作用于全文。显式设置的字体和文字颜色保持原值。</ToolbarMenuNote>
        <div className="mimir-docx-design__themes" role="group" aria-label="主题预设">
          {DESIGN_THEMES.map((theme) => (
            <button
              type="button"
              key={theme.name}
              disabled={locked}
              aria-pressed={
                themeName === theme.name ||
                (!themeName &&
                  fonts?.major === theme.fonts.major &&
                  fonts?.minor === theme.fonts.minor &&
                  fonts?.eastAsia === theme.fonts.eastAsia &&
                  matchesColors(colors, theme.colors))
              }
              onClick={() => change({ fonts: theme.fonts, colors: theme.colors }, theme.name)}
            >
              <span
                className="mimir-docx-design__theme-type"
                style={{ fontFamily: theme.fonts.major }}
              >
                Aa
              </span>
              <Palette colors={theme.colors} />
              <span>{theme.name}</span>
            </button>
          ))}
        </div>
      </ToolbarMenuFields>
      <ToolbarMenuFields label="主题字体">
        <div className="mimir-docx-design__wide">
          <ToolbarSelect
            label="字体方案"
            value={String(fontChoice)}
            disabled={locked}
            options={[
              {
                value: '-1',
                label: draft.fonts && fontChoice === -1 ? '所选主题字体' : '当前文档字体',
              },
              { value: 'original', label: '恢复原件字体' },
              ...DESIGN_FONT_PRESETS.map((item, i) => ({ value: String(i), label: item.name })),
            ]}
            onChange={(value) => {
              if (value !== '-1')
                change({
                  fonts: value === 'original' ? null : DESIGN_FONT_PRESETS[Number(value)]!.fonts,
                })
            }}
          />
        </div>
        <p className="mimir-docx-design__current">
          标题：{fonts?.major || '未声明'}
          <br />
          正文：{fonts?.minor || '未声明'}
          <br />
          东亚字体：{fonts?.eastAsia || '沿用原件语言规则'}
        </p>
      </ToolbarMenuFields>
      <ToolbarMenuFields label="主题颜色">
        <p className="mimir-docx-design__current">方案：{colors?.name || '未声明'}</p>
        <div className="mimir-docx-design__colors" role="group" aria-label="主题色板">
          {DESIGN_COLOR_PRESETS.map((item) => (
            <button
              type="button"
              key={item.name}
              disabled={locked}
              aria-pressed={matchesColors(colors, item.colors)}
              onClick={() => change({ colors: item.colors })}
            >
              <Palette colors={item.colors} />
              <span>{item.name}</span>
            </button>
          ))}
        </div>
        <div className="mimir-docx-design__wide">
          <ToolbarButton
            label="恢复原件主题"
            disabled={locked}
            onClick={() => change({ fonts: null, colors: null })}
          >
            <RotateCcw size={14} />
            <span>恢复原件主题</span>
          </ToolbarButton>
        </div>
      </ToolbarMenuFields>
      <ToolbarMenuFields label="方案预览">
        <div
          className="mimir-docx-design__sample mimir-docx-design__wide"
          aria-label="主题方案预览"
        >
          <strong style={{ fontFamily: fonts?.major, color: `#${colors?.accent1 ?? '4472C4'}` }}>
            主题标题 Heading
          </strong>
          <span style={{ fontFamily: fonts?.minor }}>正文示例 · Body text</span>
          <Palette colors={colors} />
        </div>
        <ToolbarMenuNote>
          示例展示方案；应用后画布按原件的主题引用更新。未安装的字体使用可用字体替代。
        </ToolbarMenuNote>
      </ToolbarMenuFields>
    </DesignFrame>
  )
}
const PAGE_COLORS = ['FFF9E6', 'F5F0E6', 'EAF5EA', 'E8F1FB', 'F3EEFB', 'F2F2F2', '333333', '000000']
export function DocxPageBackgroundControls({ context }: { context: DocxAdvancedContext }) {
  const state = useDesign(context)
  const [draft, setDraft] = useState<DocxDesignEdits>({})
  const [border, setBorder] = useState('keep')
  const [scope, setScope] = useState<'section' | 'document'>('section')
  const section = context.sections[state.target.section]
  const background = draft.pageColor === undefined ? state.current?.pageColor : draft.pageColor
  const enabled = border === 'keep' ? section?.settings.pageBorder : border === 'box'
  const reset = () => {
    setDraft({})
    setBorder('keep')
    state.clearStatus()
  }
  return (
    <DesignFrame
      {...state}
      dirty={Object.keys(draft).length > 0 || border !== 'keep'}
      onReset={reset}
      onApply={() => {
        if (
          state.apply(draft, border === 'keep' ? undefined : { enabled: border === 'box', scope })
        ) {
          setDraft({})
          setBorder('keep')
        }
      }}
    >
      <ToolbarMenuFields label="页面颜色 · 全文">
        {state.current && !state.current.pageColorSupported && (
          <ToolbarMenuNote>
            原件包含图形页面背景，保留该背景；底色替换请在 Word 中操作。
          </ToolbarMenuNote>
        )}
        <div className="mimir-docx-design__wide">
          <ToolbarColorPicker
            label="页面底色"
            inline
            allowCustomRgb
            clearLabel="无页面底色"
            options={PAGE_COLORS.map((value) => ({
              value,
              label: `#${value}`,
              swatch: `#${value}`,
            }))}
            value={background ?? null}
            disabled={state.locked || !state.current?.pageColorSupported}
            onPick={(pageColor) => {
              setDraft({ ...draft, pageColor: pageColor.replace(/^#/, '').toUpperCase() })
              state.clearStatus()
            }}
            onClear={() => {
              setDraft({ ...draft, pageColor: null })
              state.clearStatus()
            }}
          />
        </div>
        <p className="mimir-docx-design__current">
          {background ? `底色 #${background}` : '无页面底色（跟随纸张外观）'}
        </p>
      </ToolbarMenuFields>
      <ToolbarMenuFields label={`页面边框 · 当前第 ${state.target.section + 1} 节`}>
        <div className="mimir-docx-design__wide">
          <ToolbarSelect
            label="边框"
            disabled={state.locked}
            value={border}
            options={[
              {
                value: 'keep',
                label: section?.settings.pageBorder ? '保留当前边框' : '当前无边框',
              },
              { value: 'box', label: '方框 · 0.5 磅' },
              { value: 'none', label: '无边框' },
            ]}
            onChange={(value) => {
              setBorder(value)
              state.clearStatus()
            }}
          />
        </div>
        <div className="mimir-docx-design__wide">
          <ToolbarSelect
            label="边框应用范围"
            disabled={state.locked}
            value={scope}
            options={[
              { value: 'section', label: `当前第 ${state.target.section + 1} 节` },
              { value: 'document', label: `全文 · ${context.sections.length} 节` },
            ]}
            onChange={(value) => setScope(value as typeof scope)}
          />
        </div>
        <ToolbarMenuNote>
          方框距纸边 24 磅。选择方框会替换目标节的原有边框；保留时不改自定义边框。
        </ToolbarMenuNote>
        {context.sections.some((s) => s.startType === 'continuous') && (
          <ToolbarMenuNote>
            连续节共用一页时，画布按该页首段所属节预览；最终分页以 Word 为准。
          </ToolbarMenuNote>
        )}
      </ToolbarMenuFields>
      <ToolbarMenuFields label="页面效果预览">
        <div className="mimir-docx-design__paper-wrap mimir-docx-design__wide">
          <div
            className="mimir-docx-design__paper"
            aria-label="页面效果示意"
            style={{ background: background ? `#${background}` : '#FFFFFF' }}
          >
            <div style={{ border: enabled ? '1px solid #000000' : '1px solid transparent' }}>
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
          </div>
        </div>
        <ToolbarMenuNote>
          页面示意仅显示是否有边框。应用后画布显示原件每页实际的边框样式。
        </ToolbarMenuNote>
      </ToolbarMenuFields>
    </DesignFrame>
  )
}
