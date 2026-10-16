import { useState } from 'react'
import {
  ToolbarPropertyForm,
  ToolbarButton,
  ToolbarMenuFields,
  ToolbarLabel,
  ToolbarMenu,
  ToolbarTextArea,
  ToolbarTextField,
  ToolbarTabs,
  ToolbarMenuNote,
} from '../shell/EditorShell.js'

export function XlsxDataControls({
  range,
  column,
  filterRange,
  busy,
  onOperation,
}: {
  range: string
  column: string
  filterRange?: string
  busy?: boolean
  onOperation: (op: Record<string, unknown>) => void
}) {
  const [mode, setMode] = useState('sort')
  const [byColumn, setByColumn] = useState<string | null>(null)
  const [hasHeader, setHasHeader] = useState(true)
  const [values, setValues] = useState('')
  const [find, setFind] = useState('')
  const [replace, setReplace] = useState('')
  const [matchCase, setMatchCase] = useState(false)
  const [wholeCell, setWholeCell] = useState(false)
  const key = byColumn ?? column
  const validColumn = /^[A-Z]{1,3}$/.test(key)
  if (!range)
    return (
      <ToolbarButton label="范围数据操作" disabled disabledReason="先选中单元格或输入范围">
        数据
      </ToolbarButton>
    )
  return (
    <ToolbarMenu
      label="范围数据操作"
      text="排序、筛选与替换"
      panelWidth={360}
      renderPanel={() => (
        <ToolbarPropertyForm columns={1}>
          <div className="mimir-xlsx-tools">
            <ToolbarMenuNote>
              范围：{range} · 当前筛选：{filterRange ?? '未启用'}
            </ToolbarMenuNote>
            <ToolbarTabs
              label="数据工具"
              value={mode}
              onChange={setMode}
              items={[
                { value: 'sort', label: '排序' },
                { value: 'filter', label: '筛选' },
                { value: 'replace', label: '替换' },
              ]}
            />
            <fieldset
              disabled={busy}
              aria-busy={busy}
              title={busy ? '正在应用工作簿操作' : undefined}
              style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}
            >
              {mode === 'sort' && (
                <ToolbarMenuFields label="排序">
                  <ToolbarLabel>排序</ToolbarLabel>
                  <ToolbarTextField
                    label="排序与筛选列"
                    value={key}
                    onChange={(value) => setByColumn(value.toUpperCase())}
                    onCancel={() => setByColumn(null)}
                    placeholder="A"
                  />
                  <ToolbarButton
                    label="排序包含标题行"
                    active={hasHeader}
                    onClick={() => setHasHeader(!hasHeader)}
                  >
                    首行为标题
                  </ToolbarButton>
                  <ToolbarButton
                    label="范围升序排序"
                    disabled={!validColumn}
                    disabledReason="输入有效列字母"
                    onClick={() =>
                      onOperation({
                        op: 'sort_range',
                        range,
                        byColumn: key,
                        order: 'asc',
                        hasHeader,
                      })
                    }
                  >
                    升序
                  </ToolbarButton>
                  <ToolbarButton
                    label="范围降序排序"
                    disabled={!validColumn}
                    disabledReason="输入有效列字母"
                    onClick={() =>
                      onOperation({
                        op: 'sort_range',
                        range,
                        byColumn: key,
                        order: 'desc',
                        hasHeader,
                      })
                    }
                  >
                    降序
                  </ToolbarButton>
                </ToolbarMenuFields>
              )}
              {mode === 'filter' && (
                <ToolbarMenuFields label="筛选">
                  <ToolbarTextField
                    label="筛选列"
                    value={key}
                    onChange={(value) => setByColumn(value.toUpperCase())}
                  />

                  <ToolbarLabel>筛选</ToolbarLabel>
                  <ToolbarButton
                    label="设置范围筛选"
                    onClick={() => onOperation({ op: 'set_filter', range })}
                  >
                    启用筛选
                  </ToolbarButton>
                  <ToolbarButton
                    label="清除工作表筛选"
                    disabled={!filterRange}
                    disabledReason="先启用范围筛选"
                    onClick={() => onOperation({ op: 'clear_filter' })}
                  >
                    清除筛选
                  </ToolbarButton>
                  <ToolbarTextArea
                    label="筛选保留值（每行一个，空行匹配空值）"
                    value={values}
                    onChange={setValues}
                    rows={3}
                    placeholder="每行输入一个保留值"
                  />
                  <ToolbarButton
                    label="应用列值筛选"
                    disabled={!validColumn || !filterRange}
                    disabledReason={filterRange ? '输入有效列字母' : '先启用范围筛选'}
                    onClick={() =>
                      onOperation({
                        op: 'set_filter_criteria',
                        column: key,
                        values: values.split('\n'),
                      })
                    }
                  >
                    应用条件
                  </ToolbarButton>
                  <ToolbarButton
                    label="清除此列筛选条件"
                    disabled={!validColumn || !filterRange}
                    disabledReason="输入有效列字母"
                    onClick={() =>
                      onOperation({ op: 'set_filter_criteria', column: key, values: null })
                    }
                  >
                    清除列条件
                  </ToolbarButton>
                </ToolbarMenuFields>
              )}
              {mode === 'replace' && (
                <ToolbarMenuFields label="替换文字">
                  <ToolbarLabel>替换文字</ToolbarLabel>

                  <ToolbarTextField label="范围查找文字" value={find} onChange={setFind} />

                  <ToolbarTextField label="范围替换为" value={replace} onChange={setReplace} />

                  <ToolbarButton
                    label="范围替换区分大小写"
                    active={matchCase}
                    onClick={() => setMatchCase(!matchCase)}
                  >
                    区分大小写
                  </ToolbarButton>
                  <ToolbarButton
                    label="范围替换匹配整个单元格"
                    active={wholeCell}
                    onClick={() => setWholeCell(!wholeCell)}
                  >
                    全格匹配
                  </ToolbarButton>
                  <ToolbarButton
                    label="替换范围文字"
                    disabled={!find}
                    disabledReason="先输入查找文字"
                    onClick={() =>
                      onOperation({
                        op: 'find_replace',
                        range,
                        find,
                        replace,
                        matchCase,
                        wholeCell,
                      })
                    }
                  >
                    替换
                  </ToolbarButton>
                  <ToolbarButton
                    label="清空范围内容"
                    onClick={() => onOperation({ op: 'clear_range', range })}
                  >
                    清空内容
                  </ToolbarButton>
                </ToolbarMenuFields>
              )}
            </fieldset>
          </div>
        </ToolbarPropertyForm>
      )}
    />
  )
}
