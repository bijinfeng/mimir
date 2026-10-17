import { useState } from 'react'
import { ToolbarButton } from '../shell/EditorShell.js'
import { compareBlockText, keyedCompareItems, type CompareResult } from './docx-compare.js'
export function DocxComparePanel({ result }: { result: CompareResult }) {
  const [all, setAll] = useState(false)
  const changes = result.changes.filter((change) => all || change.kind !== 'same')
  return (
    <>
      <div className="mimir-docx-compare__summary" role="status">
        <span>新增 {result.added}</span>
        <span>删除 {result.removed}</span>
        <span>修改 {result.changed}</span>
      </div>
      {result.excluded > 0 && (
        <p className="mimir-docx-compare__note">
          有 {result.excluded} 个复杂对象或引用未参与对比（含嵌套表格）。
        </p>
      )}
      <ToolbarButton
        label={all ? '仅显示差异' : '显示全部段落'}
        active={all}
        onClick={() => setAll(!all)}
      >
        {all ? '仅差异' : '全部段落'}
      </ToolbarButton>
      {!changes.length && (
        <p role="status">{all ? '没有可比较的正文段落。' : '比较范围内没有文字差异。'}</p>
      )}
      <ol className="mimir-docx-compare__list" aria-label="文档差异">
        {keyedCompareItems(changes).map(({ value: change, key }) => (
          <li key={key} data-change={change.kind}>
            <h3>
              {{ same: '相同', added: '新增', removed: '删除', changed: '修改' }[change.kind]}
            </h3>
            {change.before && (
              <div>
                <strong>当前文档</strong>
                <p>{compareBlockText(change.before) || '（空段落）'}</p>
              </div>
            )}
            {change.after && change.kind !== 'same' && (
              <div>
                <strong>对比文件</strong>
                <p>{compareBlockText(change.after) || '（空段落）'}</p>
              </div>
            )}
          </li>
        ))}
      </ol>
    </>
  )
}
