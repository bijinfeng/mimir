import { useState } from 'react'
import type { XlsxSheet } from '../xlsx.js'
import {
  ToolbarPropertyForm,
  ToolbarButton,
  ToolbarMenu,
  ToolbarMenuFields,
  ToolbarMenuNote,
  ToolbarTabs,
  ToolbarTextArea,
  ToolbarTextField,
} from '../shell/EditorShell.js'
export function XlsxCellFeatureControls({
  address,
  sheet,
  busy,
  onOperation,
  onOpenLink,
}: {
  address: string | null
  sheet: XlsxSheet
  busy: boolean
  onOperation: (op: Record<string, unknown>) => Promise<boolean>
  onOpenLink: (target: string) => void
}) {
  const [mode, setMode] = useState('link')
  const [linkDraft, setLinkDraft] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const link = address ? sheet.extras?.hyperlinks[address] : undefined
  const note = address ? sheet.extras?.notes[address] : undefined
  const target = linkDraft ?? link ?? '',
    text = noteDraft ?? note?.text ?? ''
  const locked = !!sheet.extras?.protected
  const lockReason = locked ? '工作表已保护，请先取消保护' : !address ? '先选中单元格' : undefined
  const linkValid = /^(?:https?:\/\/|mailto:|#)/i.test(target)
  const save = async (op: Record<string, unknown>, kind?: 'link' | 'note') => {
    setFeedback(null)
    if (await onOperation(op)) {
      if (kind === 'link') setLinkDraft(null)
      if (kind === 'note') setNoteDraft(null)
      setFeedback('已应用')
    } else setFeedback('未应用，请查看编辑器下方的错误说明')
  }
  return (
    <ToolbarMenu
      label="单元格链接批注与保护"
      text="链接、批注与保护"
      panelWidth={360}
      renderPanel={() => (
        <ToolbarPropertyForm columns={1}>
          <div className="mimir-xlsx-tools">
            <ToolbarMenuNote>
              {address ?? '未选择单元格'} · 工作表{locked ? '已保护' : '未保护'}
              {sheet.extras?.passwordProtected ? '（含密码）' : ''}
            </ToolbarMenuNote>
            <ToolbarTabs
              label="审阅工具"
              value={mode}
              onChange={(value) => {
                setMode(value)
                setFeedback(null)
              }}
              items={[
                { value: 'link', label: '超链接' },
                { value: 'note', label: '批注' },
                { value: 'protection', label: '保护' },
              ]}
            />
            {lockReason && mode !== 'protection' && <ToolbarMenuNote>{lockReason}</ToolbarMenuNote>}
            <fieldset disabled={busy} aria-busy={busy}>
              {mode === 'link' && (
                <ToolbarMenuFields label="超链接">
                  <fieldset disabled={!!lockReason}>
                    <ToolbarTextField
                      label="单元格超链接地址"
                      value={target}
                      onChange={(value) => {
                        setLinkDraft(value)
                        setFeedback(null)
                      }}
                      placeholder="https:// 或 #工作表!A1"
                    />
                  </fieldset>
                  <ToolbarMenuNote>
                    支持网页、mailto 邮件地址与工作簿内的 #工作表!A1。
                  </ToolbarMenuNote>
                  <span role="status">{target !== (link ?? '') ? '待应用' : ''}</span>
                  <ToolbarButton
                    label="应用单元格超链接"
                    disabled={!!lockReason || !linkValid || target === link}
                    disabledReason={
                      lockReason ??
                      (!linkValid ? '输入http、https、mailto或#工作表!单元格' : '链接没有变化')
                    }
                    onClick={() => void save({ op: 'set_hyperlink', address, target }, 'link')}
                  >
                    设置链接
                  </ToolbarButton>
                  <div className="mimir-xlsx-tools__actions">
                    <ToolbarButton
                      label="打开单元格超链接"
                      disabled={!link || !/^(?:https?:\/\/|mailto:|#)/i.test(link)}
                      disabledReason="当前格没有可打开的链接"
                      onClick={() => onOpenLink(link!)}
                    >
                      打开链接
                    </ToolbarButton>
                    <ToolbarButton
                      label="删除单元格超链接"
                      disabled={!!lockReason || !link}
                      disabledReason={lockReason ?? '当前格没有链接'}
                      onClick={() =>
                        void save({ op: 'set_hyperlink', address, target: null }, 'link')
                      }
                    >
                      删除链接
                    </ToolbarButton>
                  </div>
                </ToolbarMenuFields>
              )}
              {mode === 'note' && (
                <ToolbarMenuFields label="单元格批注">
                  <ToolbarMenuNote>
                    作者：{note?.author || 'Mimir'}
                    {sheet.extras?.richNotes ? ' · 原件含富文本批注，暂不支持修改' : ''}
                  </ToolbarMenuNote>
                  <fieldset disabled={!!lockReason || sheet.extras?.richNotes}>
                    <ToolbarTextArea
                      label="单元格批注正文"
                      value={text}
                      onChange={(value) => {
                        setNoteDraft(value)
                        setFeedback(null)
                      }}
                      rows={5}
                    />
                  </fieldset>
                  <span role="status">{text !== (note?.text ?? '') ? '待应用' : ''}</span>
                  <div className="mimir-xlsx-tools__actions">
                    <ToolbarButton
                      label="保存单元格批注"
                      disabled={
                        !!lockReason || sheet.extras?.richNotes || !text || text === note?.text
                      }
                      disabledReason={
                        lockReason ??
                        (sheet.extras?.richNotes
                          ? '现有富文本批注暂不支持修改'
                          : !text
                            ? '输入批注正文'
                            : '批注没有变化')
                      }
                      onClick={() => void save({ op: 'set_note', address, text }, 'note')}
                    >
                      保存批注
                    </ToolbarButton>
                    <ToolbarButton
                      label="删除单元格批注"
                      disabled={!!lockReason || sheet.extras?.richNotes || !note}
                      disabledReason={lockReason ?? '当前格没有可删除的普通批注'}
                      onClick={() => void save({ op: 'set_note', address, text: null }, 'note')}
                    >
                      删除批注
                    </ToolbarButton>
                  </div>
                </ToolbarMenuFields>
              )}
              {mode === 'protection' && (
                <ToolbarMenuFields label="工作表保护">
                  <ToolbarMenuNote>
                    保护后将限制内容编辑。此工具不设置密码。
                    {sheet.extras?.passwordProtected ? '原件含密码保护，暂不能取消。' : ''}
                  </ToolbarMenuNote>
                  <ToolbarButton
                    label={locked ? '取消工作表保护' : '保护工作表'}
                    disabled={locked && sheet.extras?.passwordProtected}
                    disabledReason="含密码的保护暂不能取消"
                    onClick={() => void save({ op: 'protect_sheet', protected: !locked })}
                  >
                    {locked ? '取消保护' : '保护工作表'}
                  </ToolbarButton>
                </ToolbarMenuFields>
              )}
            </fieldset>
            <div role="status" className="mimir-xlsx-tools__feedback">
              {busy ? '正在应用…' : feedback}
            </div>
          </div>
        </ToolbarPropertyForm>
      )}
    />
  )
}
