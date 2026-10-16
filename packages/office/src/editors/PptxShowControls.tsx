import { useLayoutEffect, useRef, useState } from 'react'
import { Checkbox } from 'antd'
import { ArrowDown, ArrowUp, Check, LoaderCircle, Play } from 'lucide-react'
import type { Slide } from '../../vendor/packages/pptx-engine/src/types.js'
import {
  ToolbarButton,
  ToolbarMenuFields,
  ToolbarMenuNote,
  ToolbarPropertyForm,
  ToolbarSelect,
  ToolbarTextField,
} from '../shell/EditorShell.js'
import {
  pptxReadCustomShows,
  pptxRehearsalOps,
  pptxShowClock,
  pptxShowIndices,
  type PptxCustomShow,
  type PptxRehearsalResult,
  type PptxShowRequest,
} from './pptx-show.js'
import { pptxSlideOutline } from './PptxWorkspaceViews.js'
import './pptx-show-controls.css'

export type { PptxRehearsalResult, PptxShowRequest } from './pptx-show.js'
export interface PptxShowControlsProps {
  documentId: string
  slides: readonly Slide[]
  version: number
  pending?: boolean
  rehearsal: PptxRehearsalResult | null
  onDismissRehearsal(): void
  onStart(request: PptxShowRequest, trigger: HTMLButtonElement | null): void
  apply(ops: Record<string, unknown>[]): Promise<boolean>
}
export function PptxShowControls(props: PptxShowControlsProps) {
  return <ShowControls key={props.documentId} {...props} />
}
function ShowControls({
  documentId,
  slides,
  version,
  pending = false,
  rehearsal,
  onDismissRehearsal,
  onStart,
  apply,
}: PptxShowControlsProps) {
  const storageKey = `mimir:pptx-custom-shows:${documentId}`
  const [shows, setShows] = useState(() => {
    try {
      return pptxReadCustomShows(localStorage.getItem(storageKey))
    } catch {
      return []
    }
  })
  const [selected, setSelected] = useState('new')
  const [name, setName] = useState('')
  const [paths, setPaths] = useState<string[]>([])
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const rehearsalTrigger = useRef<HTMLButtonElement | null>(null)
  const customTrigger = useRef<HTMLButtonElement | null>(null)
  const live = useRef(true)
  const currentResult = useRef(rehearsal)
  useLayoutEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])
  useLayoutEffect(() => {
    currentResult.current = rehearsal
  }, [rehearsal])
  const blocked = pending || busy
  const validPaths = paths.filter((path) => slides.some((slide) => slide.path === path))
  const indices = pptxShowIndices({ id: '', name: '', slidePaths: validPaths }, slides)
  const stale =
    rehearsal &&
    (rehearsal.version !== version ||
      rehearsal.slidePaths.length !== slides.length ||
      rehearsal.slidePaths.some((path, index) => path !== slides[index]?.path))
  const timings = rehearsal ? pptxRehearsalOps(rehearsal) : []
  const totalMs = timings.reduce((sum, item) => sum + item.ms, 0)
  const store = (next: PptxCustomShow[]) => {
    setShows(next)
    setError('')
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
      setNotice('已保存在此浏览器中')
    } catch {
      setNotice('浏览器存储不可用，本次仍可播放；关闭页面后列表不会保留')
    }
  }
  const select = (id: string) => {
    const show = shows.find((item) => item.id === id)
    setSelected(id)
    setName(show?.name ?? '')
    setPaths(show?.slidePaths ?? [])
    setError('')
    setNotice('')
  }
  const save = () => {
    const title = name.trim().slice(0, 80)
    if (!title || !validPaths.length || blocked) return
    if (shows.some((show) => show.id !== selected && show.name === title)) {
      setError('此名称已存在，请使用其他名称')
      return
    }
    if (selected === 'new' && shows.length >= 100) {
      setError('最多保留 100 个自定义放映，请先删除不再使用的列表')
      return
    }
    const next = {
      id: selected === 'new' ? crypto.randomUUID() : selected,
      name: title,
      slidePaths: validPaths,
    }
    store(
      selected === 'new'
        ? [...shows, next]
        : shows.map((show) => (show.id === selected ? next : show)),
    )
    setSelected(next.id)
    setName(title)
    setPaths(validPaths)
  }
  const move = (path: string, direction: number) => {
    const at = validPaths.indexOf(path)
    const next = validPaths.slice()
    const destination = at + direction
    if (destination < 0 || destination >= next.length) return
    ;[next[at], next[destination]] = [next[destination]!, next[at]!]
    setPaths(next)
  }
  const confirmTimings = async () => {
    if (!rehearsal || stale || !timings.length || blocked || lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    const submitted = rehearsal
    try {
      const success = await apply(timings)
      if (!live.current || currentResult.current !== submitted) return
      if (success) {
        onDismissRehearsal()
        setNotice(`已应用 ${timings.length} 页换片时间，请保存文档`)
      } else setError('换片时间未应用，请检查画布状态后重试')
    } catch (cause) {
      if (live.current && currentResult.current === submitted)
        setError(cause instanceof Error ? cause.message : '换片时间应用失败，请重试')
    } finally {
      lock.current = false
      if (live.current) setBusy(false)
    }
  }
  // Included slides appear in playback order, followed by the remaining source slides.
  const ordered = [
    ...indices,
    ...slides.map((_, index) => index).filter((index) => !indices.includes(index)),
  ]
  return (
    <div className="mimir-pptx-show" aria-busy={busy}>
      <div className="mimir-pptx-show__body">
        {rehearsal && (
          <section className="mimir-pptx-show__rehearsal" aria-label="排练结果">
            <h3>排练已结束</h3>
            <p>
              已记录 {timings.length} 页，总计 {pptxShowClock(totalMs)}
              。应用后将按这些时间自动换片。
            </p>
            <ol className="mimir-pptx-show__timings">
              {timings.map((item) => (
                <li key={item.target.slide}>
                  <span>幻灯片 {item.target.slide + 1}</span>
                  <span>{pptxShowClock(item.ms)}</span>
                </li>
              ))}
            </ol>
            {stale && <ToolbarMenuNote>画布已发生变化，请丢弃此结果后重新排练。</ToolbarMenuNote>}
          </section>
        )}
        <ToolbarPropertyForm columns={1}>
          <ToolbarMenuFields label="自定义放映">
            <ToolbarMenuNote>列表按文稿保存在此浏览器。</ToolbarMenuNote>
            <ToolbarSelect
              label="放映列表"
              value={selected}
              disabled={blocked}
              options={[
                { value: 'new', label: '新建自定义放映' },
                ...shows.map((show) => ({ value: show.id, label: show.name })),
              ]}
              onChange={select}
            />
            <fieldset disabled={blocked} className="mimir-pptx-show__name">
              <ToolbarTextField
                label="列表名称"
                value={name}
                onChange={setName}
                onSubmit={save}
                placeholder="例如：客户演示"
              />
            </fieldset>
            <div className="mimir-pptx-show__actions">
              <ToolbarButton
                label="保存放映列表"
                disabled={blocked || !name.trim() || !validPaths.length}
                disabledReason={!name.trim() ? '请填写列表名称' : '请至少选择一页'}
                onClick={save}
              >
                保存列表
              </ToolbarButton>
              <ToolbarButton
                label="删除放映列表"
                disabled={blocked || selected === 'new'}
                onClick={() => {
                  store(shows.filter((show) => show.id !== selected))
                  select('new')
                }}
              >
                删除列表
              </ToolbarButton>
            </div>
          </ToolbarMenuFields>
        </ToolbarPropertyForm>
        <section className="mimir-pptx-show__slides" aria-label="放映幻灯片选择">
          <h3>
            播放顺序 <span>{validPaths.length} 页</span>
          </h3>
          <p>勾选要播放的页面，使用箭头调整顺序。</p>
          <ol>
            {ordered.map((index) => {
              const slide = slides[index]!
              const at = validPaths.indexOf(slide.path)
              const title = pptxSlideOutline(slide).title
              const hidden = /\bshow="0"/.test(slide.bodyPrefix)
              return (
                <li key={slide.path}>
                  <Checkbox
                    checked={at >= 0}
                    disabled={blocked}
                    onChange={(event) =>
                      setPaths(
                        event.target.checked
                          ? [...validPaths, slide.path]
                          : validPaths.filter((path) => path !== slide.path),
                      )
                    }
                  >
                    <span className="mimir-pptx-show__slide-label">
                      幻灯片 {index + 1}
                      {hidden ? ' · 已隐藏' : ''}
                      <small title={title}>{title}</small>
                    </span>
                  </Checkbox>
                  {at >= 0 && (
                    <div className="mimir-pptx-show__order">
                      <span aria-label={`播放顺序 ${at + 1}`}>{at + 1}</span>
                      <ToolbarButton
                        label={`上移幻灯片 ${index + 1}`}
                        disabled={blocked || at === 0}
                        onClick={() => move(slide.path, -1)}
                      >
                        <ArrowUp size={14} />
                      </ToolbarButton>
                      <ToolbarButton
                        label={`下移幻灯片 ${index + 1}`}
                        disabled={blocked || at === validPaths.length - 1}
                        onClick={() => move(slide.path, 1)}
                      >
                        <ArrowDown size={14} />
                      </ToolbarButton>
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
          {paths.length !== validPaths.length && (
            <ToolbarMenuNote>已移除的幻灯片不会播放；保存列表可清理这些记录。</ToolbarMenuNote>
          )}
          {indices.some(
            (index, position) => position > 0 && /\bshow="0"/.test(slides[index]!.bodyPrefix),
          ) && <ToolbarMenuNote>已隐藏的页面会跳过；列表的起始页仍会播放。</ToolbarMenuNote>}
        </section>
        {error && (
          <p role="alert" className="mimir-pptx-show__error">
            {error}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
      </div>
      <div className="mimir-pptx-show__footer">
        {rehearsal ? (
          <>
            <ToolbarButton label="丢弃排练计时" disabled={blocked} onClick={onDismissRehearsal}>
              丢弃
            </ToolbarButton>
            <ToolbarButton
              label="应用排练计时"
              primary
              disabled={blocked || !!stale || !timings.length}
              disabledReason={stale ? '画布已变化，请重新排练' : '没有可应用的计时'}
              onClick={() => void confirmTimings()}
            >
              {busy ? (
                <LoaderCircle size={14} aria-hidden="true" />
              ) : (
                <Check size={14} aria-hidden="true" />
              )}
            </ToolbarButton>
          </>
        ) : (
          <>
            <ToolbarButton
              label="开始排练计时"
              ref={rehearsalTrigger}
              disabled={blocked || !slides.length}
              onClick={() =>
                onStart(
                  {
                    start: Math.max(
                      0,
                      slides.findIndex((slide) => !/\bshow="0"/.test(slide.bodyPrefix)),
                    ),
                    rehearse: true,
                  },
                  rehearsalTrigger.current,
                )
              }
            >
              排练计时
            </ToolbarButton>
            <ToolbarButton
              label="播放自定义放映"
              ref={customTrigger}
              primary
              disabled={blocked || !indices.length}
              disabledReason="请至少选择一页"
              onClick={() =>
                onStart({ start: indices[0]!, slideIndices: indices }, customTrigger.current)
              }
            >
              <Play size={14} aria-hidden="true" />
            </ToolbarButton>
          </>
        )}
      </div>
    </div>
  )
}
