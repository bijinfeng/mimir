import { useState } from 'react'
import {
  ToolbarButton,
  ToolbarLabel,
  ToolbarMenu,
  ToolbarMenuFields,
  ToolbarMenuNote,
} from '../shell/EditorShell.js'

export function XlsxInspectControls({
  range,
  address,
  inspect,
}: {
  range: string
  address: string
  inspect: (tool: string, args: Record<string, unknown>) => Promise<unknown>
}) {
  const [result, setResult] = useState<string[]>([])
  const run = async (tool: string, args: Record<string, unknown>) => {
    try {
      const response = (await inspect(tool, args)) as { data?: Record<string, unknown> }
      const data = response.data ?? {}
      if (tool === 'aggregate_range')
        setResult([
          `非空 ${data.nonEmpty}；空白 ${data.blank}；不同值 ${data.distinct}`,
          `数字 ${data.numericCount}；合计 ${data.sum}；均值 ${data.average ?? '—'}；最小 ${data.min ?? '—'}；最大 ${data.max ?? '—'}`,
          '公式值为文件缓存，可能过期',
        ])
      else if (tool === 'trace_precedents') {
        const precedents = (data.precedents as Array<{ sheetName: string; range: string }>) ?? []
        setResult([
          `直接引用：${precedents.length}`,
          ...precedents.map((item) => `${item.sheetName}!${item.range}`),
          String(data.note ?? ''),
        ])
      } else {
        const dependents = (data.dependents as Array<{ sheetName: string; address: string }>) ?? []
        setResult([
          `依赖此格的公式：${dependents.length}${data.truncated ? '（已截断）' : ''}`,
          ...dependents.map((item) => `${item.sheetName}!${item.address}`),
          String(data.note ?? ''),
        ])
      }
    } catch (error) {
      setResult([error instanceof Error ? error.message : '读取失败'])
    }
  }
  if (!range)
    return (
      <ToolbarButton label="范围汇总与公式追踪" disabled disabledReason="先选择单元格或输入范围">
        检查
      </ToolbarButton>
    )
  return (
    <ToolbarMenu
      label="范围汇总与公式追踪"
      text="检查"
      panelWidth={360}
      renderPanel={() => (
        <>
          <ToolbarMenuFields label="范围汇总与公式追踪">
            <ToolbarLabel>{range}</ToolbarLabel>
            <ToolbarButton
              label="汇总范围数据"
              onClick={() => void run('aggregate_range', { range })}
            >
              汇总范围数据
            </ToolbarButton>
            <ToolbarButton
              label="追踪引用单元格"
              onClick={() => void run('trace_precedents', { address })}
            >
              追踪引用
            </ToolbarButton>
            <ToolbarButton
              label="追踪从属公式"
              onClick={() => void run('trace_dependents', { address })}
            >
              追踪从属
            </ToolbarButton>
          </ToolbarMenuFields>
          <div role="status">
            {[...new Set(result)].map((line) => (
              <ToolbarMenuNote key={line}>{line}</ToolbarMenuNote>
            ))}
          </div>
        </>
      )}
    />
  )
}
