import { useEffect, useRef, useState } from 'react'
import type { XlsxSheet } from '../xlsx.js'
import { parseXlsxDelimited } from '../xlsx-delimited.js'
import { parseRange } from '../../vendor/packages/xlsx-gateway/src/domain/cell-address.js'
import {
  ToolbarButton,
  ToolbarFileButton,
  ToolbarMenu,
  ToolbarMenuFields,
  ToolbarMenuNote,
  ToolbarPropertyForm,
  ToolbarSelect,
  ToolbarTextArea,
} from '../shell/EditorShell.js'
const quoteTsv = (s: string) => (/[\t\r\n"]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s)
export function XlsxClipboardControls({
  sheet,
  range,
  busy,
  onOperation,
}: {
  sheet: XlsxSheet
  range: string
  busy: boolean
  onOperation: (op: Record<string, unknown>) => Promise<boolean>
}) {
  const [content, setContent] = useState(''),
    [delimiter, setDelimiter] = useState('\t'),
    [message, setMessage] = useState('')
  const requestScope = useRef<{ live: boolean }>({ live: true })
  useEffect(() => {
    const scope = { live: true }
    requestScope.current = scope
    return () => {
      scope.live = false
    }
  }, [])
  let values: (string | number | boolean)[][] = [],
    issue = ''
  try {
    values = parseXlsxDelimited(content, delimiter === 'csv' ? ',' : '\t')
  } catch (error) {
    issue = error instanceof Error ? error.message : '无法读取内容'
  }
  const apply = async () => {
    try {
      const b = parseRange(range)
      if (b.startRow + values.length > 1048576 || b.startColumn + (values[0]?.length ?? 0) > 16384)
        throw new Error('导入内容超出工作表边界')
      const ok = await onOperation({ op: 'set_range', start: range.split(':')[0], values })
      setMessage(ok ? '已应用' : '未写入，请查看编辑器错误说明')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '写入失败')
    }
  }
  const copy = async () => {
    try {
      const b = parseRange(range)
      if ((b.endRow - b.startRow + 1) * (b.endColumn - b.startColumn + 1) > 2000)
        throw new Error('复制最多2000格')
      const text = Array.from({ length: b.endRow - b.startRow + 1 }, (_, r) =>
        Array.from({ length: b.endColumn - b.startColumn + 1 }, (_cell, c) =>
          quoteTsv(
            sheet.rows.find((row) => row.number === b.startRow + r + 1)?.cells[b.startColumn + c]
              ?.text ?? '',
          ),
        ).join('\t'),
      ).join('\r\n')
      await navigator.clipboard.writeText(text)
      setMessage('已复制范围的显示值')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '复制失败')
    }
  }
  return (
    <ToolbarMenu
      label="范围剪贴板与CSV导入"
      text="粘贴与导入"
      panelWidth={360}
      renderPanel={() => (
        <ToolbarPropertyForm columns={1}>
          <div className="mimir-xlsx-tools">
            <ToolbarMenuFields label="范围剪贴板">
              <ToolbarMenuNote>从 {range || '所选单元格'} 开始写入，最多2000格。</ToolbarMenuNote>
              <div className="mimir-xlsx-tools__actions">
                <ToolbarButton
                  label="复制范围显示值"
                  disabled={!range}
                  disabledReason="先选择范围"
                  onClick={() => void copy()}
                >
                  复制显示值
                </ToolbarButton>
                <ToolbarButton
                  label="读取剪贴板"
                  disabled={busy || !navigator.clipboard?.readText}
                  disabledReason="此地址不允许读取剪贴板，可粘贴到下方输入框"
                  onClick={() => {
                    const scope = requestScope.current
                    void navigator.clipboard
                      ?.readText()
                      .then((text) => {
                        if (!scope.live) return
                        setDelimiter('\t')
                        setContent(text)
                        setMessage('内容已载入，确认后写入')
                      })
                      .catch((error: unknown) => {
                        if (!scope.live) return
                        setMessage(
                          error instanceof Error ? error.message : '请直接粘贴到下方输入框',
                        )
                      })
                  }}
                >
                  读取剪贴板
                </ToolbarButton>
              </div>
              <ToolbarFileButton
                label="选择CSV或TSV文件"
                accept=".csv,.tsv,text/csv,text/tab-separated-values"
                disabled={busy}
                onPick={async (file) => {
                  const scope = requestScope.current
                  try {
                    if (file.size > 1024 * 1024) throw new Error('请选择不超过1MiB的文本文件')
                    const text = await file.text()
                    if (!scope.live) return
                    setDelimiter(/\.tsv$/i.test(file.name) ? '\t' : 'csv')
                    setContent(text)
                    setMessage(`已载入 ${file.name}，确认后写入`)
                  } catch (error) {
                    if (scope.live)
                      setMessage(error instanceof Error ? error.message : '文件读取失败')
                  }
                }}
              />
              <ToolbarSelect
                label="内容分隔方式"
                value={delimiter}
                onChange={setDelimiter}
                options={[
                  { value: '\t', label: '制表符（电子表格复制）' },
                  { value: 'csv', label: '逗号（CSV）' },
                ]}
              />
              <ToolbarTextArea
                label="待写入的表格内容"
                value={content}
                onChange={setContent}
                rows={5}
              />
              {content && (
                <ToolbarMenuNote>
                  {issue ||
                    `${values.length}行 × ${values[0]?.length ?? 0}列；以等号开头的内容将写为公式。`}
                </ToolbarMenuNote>
              )}
              <ToolbarButton
                label="将内容写入当前范围"
                primary
                disabled={busy || !range || !content || !!issue}
                disabledReason={issue || '选择范围并准备内容'}
                onClick={() => void apply()}
              />
            </ToolbarMenuFields>
            <div role="status" className="mimir-xlsx-tools__feedback">
              {message}
            </div>
          </div>
        </ToolbarPropertyForm>
      )}
    />
  )
}
