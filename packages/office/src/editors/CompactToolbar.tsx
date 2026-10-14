import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

export interface CompactToolbarSection {
  key: string
  label: string
  /** Kept for callers during the ribbon migration; width no longer hides commands. */
  minWidth: number
  tab?: string
  /** Omit commands that the current editor or document cannot provide. */
  enabled?: boolean
  content: ReactNode
}

export interface CompactToolbarTab {
  key: string
  label: string
}

/** A visible tab strip and a horizontally scrollable command band. */
export function CompactToolbar({
  sections,
  tabs,
  activeTab: controlledTab,
  onTabChange,
  quickAccess,
}: {
  sections: readonly CompactToolbarSection[]
  tabs?: readonly CompactToolbarTab[]
  activeTab?: string
  onTabChange?: (key: string) => void
  /** Actions that stay visible before the scrollable ribbon tabs. */
  quickAccess?: ReactNode
  /** Legacy prop retained while format toolbars migrate away from overflow menus. */
  overflowLabel?: string
}) {
  const [requestedTab, setRequestedTab] = useState<string | null>(null)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const commandsRef = useRef<HTMLDivElement | null>(null)
  const id = useId()
  const selectedTab = controlledTab ?? requestedTab
  const activeTab = tabs?.some((tab) => tab.key === selectedTab) ? selectedTab : tabs?.[0]?.key
  const available = sections.filter(
    (section) =>
      section.enabled !== false && section.content !== null && section.content !== undefined,
  )
  const shown = tabs
    ? available.filter((section) => (section.tab ?? tabs[0]?.key) === activeTab)
    : available

  const selectTab = (key: string) => {
    if (controlledTab === undefined) setRequestedTab(key)
    onTabChange?.(key)
  }

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!tabs?.length) return
    let next = index
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = tabs.length - 1
    else return
    event.preventDefault()
    selectTab(tabs[next]!.key)
    tabRefs.current[next]?.focus()
  }

  /**
   * 监测横向滚动位置，动态更新渐变遮罩的显示状态。
   *
   * 当用户滚动工具栏时：
   * - 在起始位置：只显示右侧渐变（提示右侧有更多内容）
   * - 在中间位置：显示两侧渐变（提示两侧都有内容）
   * - 在结束位置：只显示左侧渐变（提示左侧有更多内容）
   */
  useEffect(() => {
    const commands = commandsRef.current
    if (!commands) return

    const updateScrollState = () => {
      const { scrollLeft, scrollWidth, clientWidth } = commands
      const isAtStart = scrollLeft <= 1
      const isAtEnd = scrollLeft + clientWidth >= scrollWidth - 1

      if (isAtStart) {
        commands.setAttribute('data-scroll', 'start')
      } else if (isAtEnd) {
        commands.setAttribute('data-scroll', 'end')
      } else {
        commands.setAttribute('data-scroll', 'middle')
      }
    }

    updateScrollState()
    commands.addEventListener('scroll', updateScrollState, { passive: true })

    const resizeObserver = new ResizeObserver(updateScrollState)
    resizeObserver.observe(commands)

    return () => {
      commands.removeEventListener('scroll', updateScrollState)
      resizeObserver.disconnect()
    }
  }, [shown])

  return (
    <div className="mimir-compact-toolbar">
      {(quickAccess != null || (tabs && tabs.length > 0)) && (
        <div className="mimir-compact-toolbar__tab-row">
          {quickAccess != null && (
            <div className="mimir-compact-toolbar__quick-access" role="group" aria-label="快捷操作">
              {quickAccess}
            </div>
          )}
          {quickAccess != null && tabs && tabs.length > 0 && (
            <span className="mimir-compact-toolbar__quick-divider" aria-hidden="true" />
          )}
          {tabs && tabs.length > 0 && (
            <div className="mimir-compact-toolbar__tabs" role="tablist" aria-label="编辑分类">
              {tabs.map((tab, index) => (
                <button
                  key={tab.key}
                  ref={(node) => {
                    tabRefs.current[index] = node
                  }}
                  className="mimir-compact-toolbar__tab"
                  type="button"
                  role="tab"
                  id={`${id}-tab-${tab.key}`}
                  aria-controls={`${id}-commands`}
                  aria-selected={tab.key === activeTab}
                  tabIndex={tab.key === activeTab ? 0 : -1}
                  onClick={() => selectTab(tab.key)}
                  onKeyDown={(event) => onTabKeyDown(event, index)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div
        ref={commandsRef}
        className="mimir-compact-toolbar__commands"
        id={tabs ? `${id}-commands` : undefined}
        role={tabs ? 'tabpanel' : undefined}
        aria-labelledby={tabs && activeTab ? `${id}-tab-${activeTab}` : undefined}
        data-scroll="start"
      >
        {shown.map((section) => (
          <div
            className="mimir-compact-toolbar__section"
            key={section.key}
            role="group"
            aria-label={section.label}
          >
            <div className="mimir-compact-toolbar__controls">{section.content}</div>
            <span className="mimir-compact-toolbar__caption" aria-hidden="true">
              {section.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
