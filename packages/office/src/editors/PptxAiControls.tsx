import { ImagePlus, Languages, ScanSearch, SpellCheck, WandSparkles, X } from 'lucide-react'
import { ToolbarButton, ToolbarMenu } from '../shell/EditorShell.js'
import {
  PPTX_AI_LANGUAGES,
  pptxAiPresetInstruction,
  validPptxAiTarget,
  type PptxAiPreset,
  type PptxAiTarget,
} from './pptx-ai-presets.js'

export interface PptxAiControlsProps extends PptxAiTarget {
  onAiPreset?: ((instruction: string) => void) | undefined
  onSnapshot?: (() => void) | undefined
  snapshotPending?: boolean | undefined
  disabled?: boolean
  section?: 'create' | 'review'
}
/** Beautify prepares a real PNG draft; other presets stay text-only. Never starts a run. */
export function PptxAiControls({
  onAiPreset,
  onSnapshot,
  snapshotPending = false,
  disabled = false,
  section,
  ...target
}: PptxAiControlsProps) {
  const unavailable = !onAiPreset || disabled || !validPptxAiTarget(target)
  const reason = !onAiPreset
    ? '当前宿主没有接入问 AI 侧栏'
    : disabled
      ? '请等待当前编辑操作完成'
      : '请先打开可编辑的幻灯片'
  const prepare = (preset: PptxAiPreset) => {
    if (!unavailable) onAiPreset?.(pptxAiPresetInstruction(preset, target))
  }
  return (
    <>
      {section !== 'review' && (
        <>
          <ToolbarButton
            label={snapshotPending ? '取消准备美化草稿' : '美化本页'}
            disabled={!snapshotPending && (!onSnapshot || disabled || !validPptxAiTarget(target))}
            disabledReason={!onSnapshot ? '当前宿主没有接入截图草稿' : reason}
            onClick={onSnapshot}
          >
            {snapshotPending ? <X size={16} /> : <WandSparkles size={16} />}
            <span>{snapshotPending ? '取消准备' : '美化本页'}</span>
          </ToolbarButton>
          <ToolbarButton
            label="事实核查"
            disabled={unavailable}
            disabledReason={reason}
            onClick={() => prepare('fact-check')}
          >
            <ScanSearch size={16} />
            <span>事实核查</span>
          </ToolbarButton>
          <ToolbarButton
            label="生成配图"
            disabled={unavailable}
            disabledReason={reason}
            onClick={() => prepare('image')}
          >
            <ImagePlus size={16} />
            <span>生成配图</span>
          </ToolbarButton>
        </>
      )}
      {section !== 'create' && (
        <>
          <ToolbarButton
            label="拼写检查"
            disabled={unavailable}
            disabledReason={reason}
            onClick={() => prepare('spelling')}
          >
            <SpellCheck size={16} />
            <span>拼写检查</span>
          </ToolbarButton>
          <ToolbarMenu
            label="翻译本页"
            text="翻译"
            icon={<Languages size={16} />}
            items={PPTX_AI_LANGUAGES.map((language) => ({
              key: language,
              label: `翻译为${language}`,
              disabled: unavailable,
              disabledReason: reason,
              onSelect: () => {
                if (!unavailable)
                  onAiPreset?.(pptxAiPresetInstruction('translate', target, language))
              },
            }))}
          />
        </>
      )}
    </>
  )
}
