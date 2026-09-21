import { FileAddOutlined, ReloadOutlined, SearchOutlined, UploadOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { Empty, Input, Modal, Spin, Typography } from 'antd'
import { createStyles } from 'antd-style'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { DocumentKind } from '@mimir/shared'
import { KindBadge } from '@/components/DocumentBadges'
import { api } from '@/lib/api'
import { FONT_SIZE } from '@/theme/tokens'

/**
 * 命令面板（Ctrl K）。
 *
 * `docs/PRD.md` §5.10 与原型 README：搜索文档、执行操作，**或直接提问**。
 * 三条出路共用一个输入框是刻意的——用户此刻只有「我想找点什么」这个意图，
 * 让他先选「这是搜索还是提问」是把分类负担推给他。
 *
 * 用 antd 的 Modal 而不是自绘浮层：焦点捕获、Esc 关闭、滚动锁定、
 * aria 语义这些它都处理好了，自己写一遍必然漏掉其中几样。
 */

export interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  onOpenDocument: (id: string) => void
  onAsk: (question: string) => void
  onOpenCapture: () => void
  onNewNote: () => void | Promise<void>
}

const useStyles = createStyles(({ css, token }) => ({
  /* 面板贴着屏幕上方而不是垂直居中：命令面板是「从顶部拉出来」的东西，
     居中会让人以为是个对话框，期待它挡住并取代后面的一切 */
  body: css`
    display: flex;
    flex-direction: column;
    margin-top: -12vh;
  `,

  list: css`
    max-height: 46vh;
    overflow-y: auto;
    margin: 0 -24px;
    padding: 6px 0;
  `,

  sectionLabel: css`
    padding: 8px 24px 5px;
    font-size: ${FONT_SIZE.badge}}px;
    font-weight: 600;
    color: ${token.colorTextTertiary};
    letter-spacing: 0.03em;
  `,

  item: css`
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px 24px;
    border: none;
    background: transparent;
    font-family: inherit;
    text-align: left;
    cursor: pointer;
    transition: background 0.1s ease-out;

    &:hover {
      background: ${token.colorFillQuaternary};
    }
  `,
  itemActive: css`
    background: ${token.colorPrimaryBg};
  `,
  itemIcon: css`
    flex: none;
    width: 18px;
    text-align: center;
    color: ${token.colorTextSecondary};
  `,
  itemMain: css`
    flex: 1;
    min-width: 0;
  `,
  itemTitle: css`
    display: block;
    font-size: ${FONT_SIZE.item}}px;
    color: ${token.colorText};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  itemSub: css`
    display: block;
    margin-top: 1px;
    font-size: ${FONT_SIZE.meta}}px;
    color: ${token.colorTextTertiary};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,

  /* 有输入时底部预览 AI 回答：体现「搜索和问答是同一个入口」 */
  aiRow: css`
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin: 0 -24px -20px;
    padding: 10px 24px;
    border-top: 1px solid ${token.colorBorderSecondary};
    background: ${token.colorPrimaryBg};
    font-size: ${FONT_SIZE.note}}px;
    line-height: 1.7;
    color: ${token.colorTextSecondary};
  `,
  aiIco: css`
    flex: none;
    margin-top: 2px;
    color: ${token.colorLink};
  `,

  foot: css`
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 0 -24px -20px;
    padding: 8px 24px;
    border-top: 1px solid ${token.colorBorderSecondary};
    font-size: ${FONT_SIZE.badge}}px;
    color: ${token.colorTextTertiary};
  `,
  kbd: css`
    font-family: ${token.fontFamilyCode};
    font-size: ${FONT_SIZE.badge}}px;
    padding: 1px 5px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 4px;
    background: ${token.colorFillQuaternary};
    margin-right: 4px;
  `,
}))

interface PaletteItem {
  type: 'command' | 'document'
  key: string
  icon?: ReactNode
  /** 文档项用它显示来源徽标；命令项没有 */
  kind?: DocumentKind
  title: string
  sub: string
  run: () => void
}

/**
 * 命令面板。
 *
 * 外面这层只做一件事：**关闭时整块不渲染**，于是每次打开都从零开始
 * （输入为空、高亮在第一项）。
 *
 * 不用「effect 里判断 open 然后重置 state」：那是用 effect 同步状态，
 * React 会警告它引发级联渲染，而且中间会有一帧渲染出上一次的输入。
 * 卸载重挂载干净，也没有中间态。
 */
export function CommandPalette({ open, ...rest }: CommandPaletteProps) {
  if (!open) return null
  return <PaletteBody {...rest} />
}

function PaletteBody({
  onClose,
  onOpenDocument,
  onAsk,
  onOpenCapture,
  onNewNote,
}: Omit<CommandPaletteProps, 'open'>) {
  const { styles, cx } = useStyles()
  const [value, setValue] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  /**
   * 输入两个字以上才检索。
   *
   * 一个字就查的话，中文里几乎所有字都会命中一大片，
   * 结果列表毫无信息量，而每次敲键都要跑一次检索。
   */
  const shouldSearch = value.trim().length >= 2
  const searchQuery = useQuery({
    queryKey: ['palette-search', value.trim()],
    queryFn: () => api.search({ q: value.trim(), limit: 6 }),
    enabled: shouldSearch,
  })

  const commands: PaletteItem[] = (
    [
      {
        type: 'command',
        key: 'new-note',
        icon: <FileAddOutlined />,
        title: '新建笔记',
        sub: '空白 Markdown 笔记，落在收件箱',
        run: () => void onNewNote(),
      },
      {
        type: 'command',
        key: 'capture',
        icon: <UploadOutlined />,
        title: '收集网页 / 公众号 / GitHub',
        sub: '粘贴 URL 抓取，进收件箱',
        run: onOpenCapture,
      },
      {
        type: 'command',
        key: 'reindex',
        icon: <ReloadOutlined />,
        title: '重建索引',
        sub: '同步外部编辑器改动的文件',
        run: () => {
          void api.maintenance.reindex().then((result) => {
            console.info('重建索引完成', result)
          })
          onClose()
        },
      },
    ] satisfies PaletteItem[]
  ).filter((item) => !value.trim() || matches(item, value))

  const documents: PaletteItem[] = (searchQuery.data?.hits ?? []).map((hit) => ({
    type: 'document',
    key: hit.documentId,
    kind: hit.kind,
    title: hit.title,
    sub: hit.snippet.text,
    run: () => onOpenDocument(hit.documentId),
  }))

  const items = [...commands, ...documents]

  /**
   * 输入变化时把高亮收回到第一项。
   *
   * 在这里做而不是用 effect 观察 value：改动输入**就是**触发它的那个事件。
   * 用 effect 去「观察变化再改状态」会多一次渲染，React 也会警告
   * （effect 里同步 setState 会引发级联渲染）。
   */
  const handleChange = (next: string) => {
    setValue(next)
    setActiveIndex(0)
  }

  /**
   * 键盘导航绑在输入框自己身上，而不是 window。
   *
   * 两个理由：命令面板打开时键盘输入理应只影响它；绑 window 会在关闭后
   * 仍然吃掉页面上别处的方向键（除非小心解绑，而那种解绑很容易漏）。
   * Modal 自己的 Esc 处理已经覆盖了关闭。
   */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => Math.min(items.length - 1, index + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => Math.max(0, index - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const item = items[activeIndex]
      if (item) {
        item.run()
        onClose()
      } else if (value.trim()) {
        // 没有匹配项时，回车把它当成一个问题
        onAsk(value.trim())
        onClose()
      }
    }
  }

  /** 高亮项滚进视野。键盘选择时列表不跟着动，用户就看不到自己选到哪了 */
  useEffect(() => {
    const node = listRef.current?.querySelector(`[data-index="${activeIndex}"]`)
    node?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  return (
    <Modal
      open
      onCancel={onClose}
      footer={null}
      closable={false}
      width={620}
      centered={false}
      destroyOnHidden
      styles={{ body: { padding: 20 } }}
      style={{ top: '14vh' }}
    >
      <div className={styles.body}>
        <Input
          autoFocus
          size="large"
          variant="borderless"
          prefix={<SearchOutlined style={{ opacity: 0.5 }} />}
          placeholder="搜索文档、执行操作，或直接提问…"
          value={value}
          onChange={(event) => handleChange(event.target.value)}
          onKeyDown={handleKeyDown}
        />

        <div className={styles.list} ref={listRef}>
          {commands.length > 0 && (
            <>
              <div className={styles.sectionLabel}>操作</div>
              {commands.map((item, index) => (
                <PaletteRow
                  key={item.key}
                  item={item}
                  index={index}
                  active={index === activeIndex}
                  onHover={setActiveIndex}
                  className={cx}
                />
              ))}
            </>
          )}

          {documents.length > 0 && (
            <>
              <div className={styles.sectionLabel}>{value.trim() ? '匹配的文档' : '最近打开'}</div>
              {documents.map((item, index) => (
                <PaletteRow
                  key={item.key}
                  item={item}
                  index={commands.length + index}
                  active={commands.length + index === activeIndex}
                  onHover={setActiveIndex}
                  className={cx}
                />
              ))}
            </>
          )}

          {items.length === 0 && (
            <div style={{ padding: '26px 0' }}>
              {searchQuery.isFetching ? (
                <div style={{ textAlign: 'center' }}>
                  <Spin />
                </div>
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    <Typography.Text type="secondary">
                      没有匹配的内容。按 Enter 把它当成问题问知识库
                    </Typography.Text>
                  }
                />
              )}
            </div>
          )}
        </div>

        {/* 有输入时预览 AI 会怎么回答——「搜索和问答同一个入口」的体现 */}
        {shouldSearch && (
          <div className={styles.aiRow}>
            <span className={styles.aiIco}>✦</span>
            <span>
              {searchQuery.isFetching
                ? '正在检索…'
                : documents.length > 0
                  ? `关于「${value.trim()}」命中 ${documents.length} 处，按 Enter 直接提问可以拿到带引用的回答。`
                  : `知识库里暂时没有「${value.trim()}」的记录。按 Enter 仍可提问，它会告诉你确实没存过。`}
            </span>
          </div>
        )}

        <div className={styles.foot}>
          <span>
            <span className={styles.kbd}>↑</span>
            <span className={styles.kbd}>↓</span>选择
          </span>
          <span>
            <span className={styles.kbd}>Enter</span>打开
          </span>
          <span>
            <span className={styles.kbd}>Esc</span>关闭
          </span>
          <span style={{ marginLeft: 'auto' }}>输入两个字以上会同时给 AI 答案</span>
        </div>
      </div>
    </Modal>
  )
}

function PaletteRow({
  item,
  index,
  active,
  onHover,
  className: cx,
}: {
  item: PaletteItem
  index: number
  active: boolean
  onHover: (index: number) => void
  className: (a?: string, b?: string) => string
}) {
  const { styles } = useStyles()
  return (
    <button
      type="button"
      data-index={index}
      className={cx(styles.item, active ? styles.itemActive : undefined)}
      onMouseEnter={() => onHover(index)}
      onClick={item.run}
    >
      {item.kind ? (
        <KindBadge kind={item.kind} />
      ) : (
        <span className={styles.itemIcon}>{item.icon}</span>
      )}
      <span className={styles.itemMain}>
        <span className={styles.itemTitle}>{item.title}</span>
        <span className={styles.itemSub}>{item.sub}</span>
      </span>
    </button>
  )
}

function matches(item: PaletteItem, query: string): boolean {
  const needle = query.trim().toLowerCase()
  return `${item.title} ${item.sub}`.toLowerCase().includes(needle)
}
