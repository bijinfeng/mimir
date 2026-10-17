import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { ToolbarMenu } from '../shell/EditorShell.js'

export interface CompactToolbarSection {
  key: string
  label: string
  /** Kept for callers during the ribbon migration; width no longer hides commands. */
  minWidth: number
  tab?: string
  /** Omit commands that the current editor or document cannot provide. */
  enabled?: boolean
  content: ReactNode
  /** Close the collapsed group before opening another workspace surface. */
  collapsedContent?(close: () => void): ReactNode
}

export interface CompactToolbarTab {
  key: string
  label: string
}

/** Visible categories; groups collapse individually to named menus when the editor column narrows. */
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
  const widths = useRef(new Map<string, number>())
  const findGroups = useRef(new Set<string>())
  const [collapsed, setCollapsed] = useState<string[]>([])
  const [commandOverflow, setCommandOverflow] = useState(false)
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
  const lastTab = useRef(activeTab)

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

  useLayoutEffect(() => {
    if (lastTab.current !== activeTab) {
      if (commandsRef.current) commandsRef.current.scrollLeft = 0
      lastTab.current = activeTab
    }
  }, [activeTab])

  useLayoutEffect(() => {
    const commands = commandsRef.current
    if (!commands) return
    const measure = () => {
      const availableWidth = commands.clientWidth || commands.getBoundingClientRect().width
      if (availableWidth <= 0) return
      // Share the actual width budget with CSS; retain a 44px touch target.
      // Only columns narrower than all minimum targets need local scrolling.
      const buttonWidth = Math.max(44, Math.min(72, Math.floor(availableWidth / shown.length)))
      commands.style.setProperty('--compact-group-width', `${buttonWidth}px`)
      for (const section of commands.querySelectorAll<HTMLElement>('[data-section-key]')) {
        const key = section.dataset.sectionKey!
        if (!section.hasAttribute('data-collapsed')) {
          const width = section.getBoundingClientRect().width || section.scrollWidth
          if (width > 0) widths.current.set(key, width)
          if (section.querySelector('[data-find-input]')) findGroups.current.add(key)
        }
      }
      const costs = shown.map((section) => widths.current.get(section.key) ?? section.minWidth)
      let total = costs.reduce((sum, cost) => sum + cost, 0)
      const next: string[] = []
      for (let index = shown.length - 1; index >= 0 && total > availableWidth + 0.5; index--) {
        const section = shown[index]!
        if (costs[index]! <= buttonWidth) continue
        next.push(section.key)
        total -= costs[index]! - buttonWidth
      }
      setCommandOverflow(total > availableWidth + 0.5)
      setCollapsed((previous) =>
        previous.length === next.length && previous.every((key, index) => key === next[index])
          ? previous
          : next,
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(commands)
    for (const section of commands.children) observer.observe(section)
    return () => observer.disconnect()
  }, [shown])

  // The format host changes the active category on Ctrl/Cmd+F. If its input is
  // in a collapsed group, reveal that group's sole instance before focusing it.
  useEffect(() => {
    let revealTimer: ReturnType<typeof setTimeout> | undefined,
      focusTimer: ReturnType<typeof setTimeout> | undefined
    const revealFind = (event: globalThis.KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'f' || event.altKey)
        return
      clearTimeout(revealTimer)
      clearTimeout(focusTimer)
      // Hidden webviews may stop delivering animation frames.
      revealTimer = setTimeout(() => {
        const commands = commandsRef.current
        const direct = commands?.querySelector<HTMLInputElement>('[data-find-input]')
        if (direct) return
        const group = Array.from(
          commands?.querySelectorAll<HTMLElement>('[data-collapsed]') ?? [],
        ).find(
          (section) =>
            findGroups.current.has(section.dataset.sectionKey!) ||
            section.getAttribute('aria-label')?.includes('查找'),
        )
        if (!group) return
        group.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')?.click()
        focusTimer = setTimeout(() => {
          const panel = group.querySelector<HTMLInputElement>('[data-find-input]')
          panel?.focus()
          panel?.select()
        }, 0)
      }, 0)
    }
    document.addEventListener('keydown', revealFind, true)
    return () => {
      document.removeEventListener('keydown', revealFind, true)
      clearTimeout(revealTimer)
      clearTimeout(focusTimer)
    }
  }, [])

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
        data-overflow={commandOverflow ? '' : undefined}
      >
        {shown.map((section) => (
          <div
            className="mimir-compact-toolbar__section"
            key={section.key}
            role="group"
            aria-label={section.label}
            data-section-key={section.key}
            data-collapsed={collapsed.includes(section.key) ? '' : undefined}
          >
            {collapsed.includes(section.key) ? (
              <ToolbarMenu
                label={section.label}
                text={section.label}
                panelWidth={320}
                renderPanel={(close) => (
                  <div className="mimir-compact-toolbar__panel">
                    {section.collapsedContent?.(close) ?? section.content}
                  </div>
                )}
              />
            ) : (
              <>
                <div className="mimir-compact-toolbar__controls">{section.content}</div>
                <span className="mimir-compact-toolbar__caption" aria-hidden="true">
                  {section.label}
                </span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
