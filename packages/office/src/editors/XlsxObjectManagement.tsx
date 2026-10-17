import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Popconfirm } from 'antd'
import { createPortal } from 'react-dom'
import type { XlsxSheet } from '../xlsx.js'
import {
  ToolbarButton,
  type ToolbarConfirmProps,
  ToolbarMenuFields,
  ToolbarMenuNote,
  ToolbarNumberField,
  ToolbarSelect,
  ToolbarTabs,
  ToolbarTextField,
} from '../shell/EditorShell.js'
import { XlsxVisualProperties } from './XlsxVisualProperties.js'
import './xlsx-object-management.css'

export function XlsxObjectManagement({
  sheet,
  sourceKey,
  contextKey,
  busy,
  selectedId,
  onSelect,
  onOperation,
}: {
  sheet: XlsxSheet
  sourceKey: unknown
  contextKey: string
  busy: boolean
  selectedId: string
  onSelect: (id: string) => void
  onOperation: (op: Record<string, unknown>, options: { signal: AbortSignal }) => Promise<boolean>
}) {
  const [task, setTask] = useState('objects'),
    [selectedTable, setSelectedTable] = useState(sheet.tables?.[0]?.name ?? ''),
    [tableAction, setTableAction] = useState('add_table_row'),
    [position, setPosition] = useState(1),
    [count, setCount] = useState(1),
    [columnName, setColumnName] = useState(''),
    [pending, setPending] = useState(false),
    [feedback, setFeedback] = useState(''),
    [footer, setFooter] = useState<HTMLElement | null>(null),
    [identity, setIdentity] = useState({
      sourceKey,
      contextKey,
      selectedId,
      selectedTable,
      task,
      revision: 0,
    })
  const request = useRef<AbortController | null>(null),
    live = useRef({ sourceKey, contextKey, selectedId, selectedTable, task })
  if (
    identity.sourceKey !== sourceKey ||
    identity.contextKey !== contextKey ||
    identity.selectedId !== selectedId ||
    identity.selectedTable !== selectedTable ||
    identity.task !== task
  ) {
    setIdentity({
      sourceKey,
      contextKey,
      selectedId,
      selectedTable,
      task,
      revision: identity.revision + 1,
    })
    setFeedback('')
    setPending(false)
    setPosition(1)
    setCount(1)
    setColumnName('')
    if (!sheet.tables?.some((table) => table.name === selectedTable))
      setSelectedTable(sheet.tables?.[0]?.name ?? '')
  }
  useLayoutEffect(() => {
    live.current = { sourceKey, contextKey, selectedId, selectedTable, task }
    request.current?.abort()
    request.current = null
    return () => request.current?.abort()
  }, [sourceKey, contextKey, selectedId, selectedTable, task])
  const locked = busy || pending,
    visual = sheet.visuals?.find((item) => item.id === selectedId),
    table = sheet.tables?.find((item) => item.name === selectedTable)
  const apply = async (operation: Record<string, unknown>) => {
    if (locked || request.current) return false
    const controller = new AbortController(),
      started = live.current
    request.current = controller
    setPending(true)
    setFeedback('')
    try {
      const ok = await onOperation(operation, { signal: controller.signal })
      if (controller.signal.aborted || live.current !== started || request.current !== controller)
        return false
      setFeedback(ok ? '已应用' : '未应用，设置已保留，请查看编辑器错误说明')
      return ok
    } catch (cause) {
      if (!controller.signal.aborted && request.current === controller)
        setFeedback(cause instanceof Error ? cause.message : '未应用，请重试')
      return false
    } finally {
      if (request.current === controller) {
        request.current = null
        setPending(false)
      }
    }
  }
  const action = (node: ReactNode) => (footer ? createPortal(node, footer) : null)
  return (
    <div className="mimir-xlsx-management">
      <div className="mimir-xlsx-management__body">
        <div className="mimir-xlsx-management__navigation">
          <ToolbarTabs
            label="管理任务"
            value={task}
            onChange={setTask}
            items={[
              { value: 'objects', label: '工作表对象' },
              { value: 'tables', label: '结构化表' },
            ]}
          />
          {task === 'objects' && !!sheet.visuals?.length && (
            <ToolbarSelect
              label="当前对象"
              value={selectedId}
              disabled={locked}
              onChange={onSelect}
              options={sheet.visuals.map((item) => ({ value: item.id, label: item.name }))}
            />
          )}
          {task === 'tables' && !!sheet.tables?.length && (
            <ToolbarSelect
              label="结构化表名称"
              value={selectedTable}
              disabled={locked}
              onChange={(name) => {
                setSelectedTable(name)
                setPosition(1)
                setCount(1)
                setColumnName('')
              }}
              options={sheet.tables.map((item) => ({
                value: item.name,
                label: `${item.name} · ${item.range}`,
              }))}
            />
          )}
        </div>
        <fieldset className="mimir-xlsx-management__configuration" disabled={locked}>
          {task === 'objects' &&
            (visual ? (
              <Fragment key={`${identity.revision}:${visual.id}`}>
                {visual.kind === 'shape' && (
                  <ToolbarMenuNote>
                    图片填充、图案填充、非线性渐变及文字特效预览有限，请在 Excel 中核对。
                  </ToolbarMenuNote>
                )}
                <XlsxVisualProperties
                  key={`${identity.revision}:${visual.id}`}
                  visual={visual}
                  onApply={apply}
                  renderAction={action}
                  busy={locked}
                />
                {visual.kind === 'image' && (
                  <ToolbarMenuNote>当前图片：{visual.name}</ToolbarMenuNote>
                )}
                <div className="mimir-xlsx-management__secondary">
                  <ManagementConfirm
                    title="删除所选对象？"
                    description="移除图表、形状或图片，单元格数据保留。可通过撤销恢复。"
                    confirmLabel="删除对象"
                    disabled={locked}
                    onConfirm={() => void apply({ op: 'delete_visual', visualId: visual.id })}
                  >
                    <ToolbarButton label="删除工作表对象" disabled={locked}>
                      删除对象
                    </ToolbarButton>
                  </ManagementConfirm>
                </div>
              </Fragment>
            ) : (
              <p className="mimir-xlsx-management__empty" role="status">
                {sheet.visuals?.length
                  ? '选择要管理的图表、形状或图片'
                  : '当前工作表没有图表、形状或图片'}
              </p>
            ))}
          {task === 'tables' &&
            (table ? (
              <ToolbarMenuFields key={`${identity.revision}:${table.name}`} label="表格结构">
                <ToolbarSelect
                  label="表格结构操作"
                  value={tableAction}
                  disabled={locked}
                  onChange={setTableAction}
                  options={[
                    { value: 'add_table_row', label: '插入数据行' },
                    { value: 'delete_table_row', label: '删除数据行' },
                    { value: 'add_table_column', label: '插入表格列' },
                    { value: 'delete_table_column', label: '删除表格列' },
                  ]}
                />
                <ToolbarNumberField
                  label={
                    tableAction.endsWith('_row')
                      ? '数据区相对行号（1开始）'
                      : '表格内相对列号（1开始）'
                  }
                  value={position}
                  min={1}
                  max={1000}
                  onCommit={setPosition}
                />
                <ToolbarNumberField
                  label="行列数量"
                  value={count}
                  min={1}
                  max={tableAction.endsWith('_row') ? 1000 : 100}
                  onCommit={setCount}
                />
                {tableAction === 'add_table_column' && (
                  <ToolbarTextField
                    label="新增列名称"
                    value={columnName}
                    onChange={setColumnName}
                  />
                )}
                <ToolbarMenuNote>
                  插入或删除会移动整行或整列及关联对象；表格保留至少一行数据和一列。
                </ToolbarMenuNote>
                <ManagementConfirm
                  title="将表格转换为普通区域？"
                  description="移除结构化表定义，单元格内容和显式格式保留。引用此表的公式必须先修改。"
                  confirmLabel="转换为区域"
                  disabled={locked}
                  onConfirm={() => void apply({ op: 'delete_table', tableName: table.name })}
                >
                  <ToolbarButton label="转换结构化表为区域" disabled={locked}>
                    转换为普通区域
                  </ToolbarButton>
                </ManagementConfirm>
                {action(
                  <ManagementConfirm
                    title="应用表格结构调整？"
                    description="影响所在整行或整列，可通过撤销恢复。"
                    confirmLabel="应用调整"
                    disabled={locked}
                    onConfirm={() =>
                      void apply({
                        op: tableAction,
                        tableName: table.name,
                        count,
                        ...(tableAction.endsWith('_row')
                          ? { row: position }
                          : { column: position }),
                        ...(tableAction === 'add_table_column' ? { columnName } : {}),
                      })
                    }
                  >
                    <ToolbarButton
                      label="应用表格结构调整"
                      primary
                      disabled={
                        locked || (tableAction === 'add_table_column' && !columnName.trim())
                      }
                      disabledReason={locked ? '正在应用，请稍候' : '填写新增列名称'}
                    />
                  </ManagementConfirm>,
                )}
              </ToolbarMenuFields>
            ) : (
              <p className="mimir-xlsx-management__empty" role="status">
                当前工作表没有结构化表
              </p>
            ))}
        </fieldset>
      </div>
      <footer className="mimir-xlsx-management__footer">
        <div ref={setFooter} className="mimir-xlsx-management__primary" />
        <div role="status" className="mimir-xlsx-tools__feedback">
          {pending ? '正在应用…' : feedback}
        </div>
      </footer>
    </div>
  )
}

/** Keep Escape at the confirmation layer; the Inspector owns the next Escape. */
function ManagementConfirm({
  title,
  description,
  confirmLabel,
  cancelLabel = '算了',
  disabled,
  onConfirm,
  children,
}: ToolbarConfirmProps) {
  const [open, setOpen] = useState(false),
    trigger = useRef<HTMLSpanElement>(null)
  if (open && disabled) setOpen(false)
  useEffect(() => {
    if (!open) return
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      trigger.current?.querySelector<HTMLButtonElement>('button')?.focus()
    }
    document.addEventListener('keydown', escape, true)
    return () => document.removeEventListener('keydown', escape, true)
  }, [open])
  return (
    <span ref={trigger} className="mimir-xlsx-management__confirm">
      <Popconfirm
        title={title}
        description={description}
        okText={confirmLabel}
        cancelText={cancelLabel}
        open={open && !disabled}
        onOpenChange={(next) => {
          if (!disabled) setOpen(next)
        }}
        disabled={disabled}
        okButtonProps={{ danger: true, autoInsertSpace: false }}
        cancelButtonProps={{ autoInsertSpace: false }}
        onConfirm={() => {
          setOpen(false)
          return onConfirm()
        }}
      >
        {children}
      </Popconfirm>
    </span>
  )
}
