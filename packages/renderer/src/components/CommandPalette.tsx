import { useQuery } from '@tanstack/react-query'
import { Empty, Input, Modal, Spin, Typography } from 'antd'
import { createStyles } from 'antd-style'
import { FilePlus, Search, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from '../lib/api'
import { FONT_SIZE } from '../theme/tokens'

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

const useStyles = createStyles(({ css, token, prefixCls }) => ({
  /**
   * 面板内容。**竖排三段：搜索行 / 列表 / 页脚**，每段自己管内边距。
   *
   * ## 为什么不再用负外边距
   *
   * 早期这里给列表和页脚写 `margin: 0 -24px`，用来「抵消 body 的 24px 内边距」，
   * 好让 hover 底色通栏。但 body 的实际内边距是 **20px**（Modal 的
   * `styles={{ body: { padding: 20 } }}`），两边对不上：列表因此比正文区
   * 宽出 8px，hover 底色与输入框左右不齐。
   *
   * 更糟的是那个 `margin-top: -12vh`——它本意是让面板更靠上，而 Modal 已经用
   * `top: 14vh` 定位了。实测（视口 940px）内容顶部落在 **y=59**，而 Modal 面板
   * 从 **y=132** 才开始：整个搜索框被拉到了白色面板**外面**，浮在页面内容上，
   * 「操作」分组标题也被裁掉半个。
   *
   * 现在 body 内边距归零，三段各自声明左右内边距（统一 18px）——通栏底色
   * 不再需要负数抵消，也就不会再有对不齐或溢出面板的可能。
   */
  panel: css`
    display: flex;
    flex-direction: column;
  `,

  /* ── 搜索行 ────────────────────────────────────────── */
  searchRow: css`
    display: flex;
    align-items: center;
    padding: 13px 18px;
    border-bottom: 1px solid ${token.colorSplit};
    transition: border-color 0.2s;

    /*
     * 搜索框不画自己的边框与焦点环（浮层本身就是容器），但**焦点仍要可见**
     * （DESIGN §7.2）——面板一打开输入框就是焦点所在，用一道常驻的蓝环会变成
     * 噪声。改成让分隔线在聚焦时提亮，安静但看得见。
     *
     * 三处都要关掉：antd v6 给输入类控件加了 focusOutline（实测计算样式
     * outline: rgb(22,119,255) solid 1px），它会画出那个蓝色胶囊。
     *
     * 前缀走 prefixCls 变量而不是写死 .ant-（AGENTS.md 样式第 7 条）。
     */
    .${prefixCls}-input-affix-wrapper,
    .${prefixCls}-input {
      padding: 0;
      background: transparent;
      border: none;
      outline: none;
      box-shadow: none;
      font-size: ${FONT_SIZE.body}px;

      &:focus,
      &:focus-within,
      &:hover {
        outline: none;
        box-shadow: none;
      }
    }

    &:focus-within {
      border-bottom-color: ${token.colorPrimaryBorder};
    }

    /* 放大镜与元信息同色阶即可，不需要单独降透明度 */
    .${prefixCls}-input-prefix {
      color: ${token.colorTextTertiary};
      margin-inline-end: 9px;
    }
  `,

  /* ── 列表 ──────────────────────────────────────────── */
  list: css`
    max-height: 46vh;
    overflow-y: auto;
    padding: 6px 0;
  `,

  sectionLabel: css`
    padding: 9px 18px 5px;
    font-size: ${FONT_SIZE.badge}px;
    font-weight: 600;
    color: ${token.colorTextTertiary};
    letter-spacing: 0.03em;
  `,

  item: css`
    display: flex;
    align-items: center;
    gap: 11px;
    width: 100%;
    padding: 9px 18px;
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
  /**
   * 高亮项用**三重线索**（DESIGN §8.1 的导航项同款）：底色 + 字色 + 字重。
   *
   * 只给底色的话，键盘上下移动时视线要去找「哪一行变色了」；把标题同时
   * 提成链接色并加粗，扫读时一眼就能落下。用 `colorLink` 而不是 `colorPrimary`：
   * 主色作文字在浅蓝底上只有 3.61:1（DESIGN §3.2）。
   */
  itemActive: css`
    background: ${token.colorPrimaryBg};

    & [data-role='title'] {
      color: ${token.colorLink};
      font-weight: 500;
    }
  `,
  itemIcon: css`
    flex: none;
    width: 20px;
    text-align: center;
    font-size: ${FONT_SIZE.item}px;
    color: ${token.colorTextSecondary};
  `,
  itemMain: css`
    flex: 1;
    min-width: 0;
  `,
  itemTitle: css`
    display: block;
    font-size: ${FONT_SIZE.item}px;
    color: ${token.colorText};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  itemSub: css`
    display: block;
    margin-top: 1px;
    font-size: ${FONT_SIZE.meta}px;
    color: ${token.colorTextTertiary};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,

  /** 空态 / 加载态也要有左右内边距，否则文字会顶到面板边缘 */
  emptyBox: css`
    padding: 26px 18px;
  `,

  /* ── 底部两段 ──────────────────────────────────────── */
  /**
   * 有输入时预览 AI 回答：体现「搜索和问答是同一个入口」。
   *
   * 底色用 `tintNav`（中性极浅灰）而**不是** `colorPrimaryBg`：高亮项用的
   * 就是那个浅蓝，两者相邻时同一片蓝会连成一块，看起来像一个跨行的选中态。
   * 而且 §0.1 说语义色只出现在真的有状态的地方——这条是**提示**，不是状态。
   *
   * AI 的暗示由 `✦` 图标的 `colorLink` 承担，不靠底色。
   * 与 `DESIGN.md` §8.6 检索过程用同一种表面处理，二者是同类东西。
   */
  aiRow: css`
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 10px 18px;
    border-top: 1px solid ${token.colorSplit};
    background: ${token.tintNav};
    font-size: ${FONT_SIZE.note}px;
    line-height: 1.7;
    color: ${token.colorTextSecondary};
  `,
  aiIco: css`
    flex: none;
    margin-top: 2px;
    color: ${token.colorLink};
  `,

  /**
   * 页脚。
   *
   * **换行只能发生在项与项之间。** 页脚是 `display: flex` + `gap`，各段是裸
   * `<span>`——中文可以在任意字间断行。实测窄到 440px 以下时页脚占两行，
   * 而断点在词内部：「↑ ↓ 选 / 择」「Enter 打 / 开」「Esc 关 / 闭」
   * （w=400/440 → 页脚 55px，w=480 以上 → 37px）。快捷键提示读不成句，
   * 用户看不出那几组键各是做什么的。
   *
   * 所以每一项 `flex: none` + `nowrap`（项不会被压扁，字也不拆），整行
   * `flex-wrap: wrap`：放不下时整项落到下一行。行间距取 4px 而不是 12px
   * ——那是**换行后**两行之间的距离，按 DESIGN §5.1 的 4px 网格走，列间距不变。
   */
  foot: css`
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px 12px;
    padding: 9px 18px;
    border-top: 1px solid ${token.colorSplit};
    font-size: ${FONT_SIZE.badge}px;
    color: ${token.colorTextTertiary};
  `,
  footItem: css`
    flex: none;
    white-space: nowrap;
  `,
  /** 右侧那句是补充说明而非必需信息：贴右，放不下时整句落到下一行 */
  footHint: css`
    flex: none;
    margin-left: auto;
    white-space: nowrap;
  `,
  kbd: css`
    font-family: ${token.fontFamilyCode};
    font-size: ${FONT_SIZE.badge}px;
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
   * 关闭时**把焦点还给打开它的人**。
   *
   * 这一层是唯一「关闭即卸载」的对话框（外层 `if (!open) return null`）——
   * 而 antd 的焦点归还是挂在 `visible: false` 那条路径上的，卸载不会走到
   * 那里。实测：从某个按钮按 Ctrl+K 打开、Esc 关闭，`activeElement` 是
   * `BODY`，键盘用户每次用完面板都要重新 Tab 一大段才能回到刚才的位置。
   *
   * 记的是**挂载时的 activeElement**（打开前的焦点所在），卸载时若它还在
   * 文档里就还回去。`isConnected` 的判断是必须的：触发按钮可能随导航一起
   * 消失（例如从「新建对话」进对话页之后，那个按钮还在侧栏，但历史里点
   * 进来的会话项可能已经不在了），对着一个已卸载的元素 focus 是空操作，
   * 而不判断也不会报错——只是行为「有时不生效」，最难查。
   */
  useEffect(() => {
    const previous = document.activeElement
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
    }
  }, [])

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

  /**
   * 两条操作命令。副标题用 `docs/DESIGN.md` §8.10 原型里的措辞（「直接落进库」）。
   *
   * 曾经写的是「落在收件箱 / 进收件箱」——收件箱视图与导航项已随 D-054 退役
   * （`docs/DECISIONS.md`:3022：新内容 `status` 直接 `ready`）。界面里再没有
   * 那个去处：用户收集完一篇东西却被告知内容进了「收件箱」，会去找一个不存在
   * 的视图，怀疑内容没收到。文案说的是别处（对话框、toast）也要说同一件事。
   */
  const commands: PaletteItem[] = (
    [
      {
        type: 'command',
        key: 'new-note',
        icon: <FilePlus size={16} />,
        title: '新建笔记',
        sub: '空白 Markdown 笔记，直接落进库',
        run: () => void onNewNote(),
      },
      {
        type: 'command',
        key: 'capture',
        icon: <Upload size={16} />,
        title: '收集网页 / 公众号 / GitHub',
        sub: '粘贴 URL 抓取，直接落进库',
        run: onOpenCapture,
      },
    ] satisfies PaletteItem[]
  ).filter((item) => !value.trim() || matches(item, value))

  const documents: PaletteItem[] = (searchQuery.data?.hits ?? []).map((hit) => ({
    type: 'document',
    key: hit.documentId,
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
      /*
       * body 与 container 的内边距都归零，三段各自管自己的左右内边距
       * （见 useStyles.searchRow / list / foot）。
       *
       * **两处都要归零**：antd v6 的 `.ant-modal-container` 自带
       * `padding: 20px 24px`（实测），只清 body 的话每一行仍会内缩 24px，
       * hover 底色到不了面板边缘——命令面板的行应该是通栏的。
       *
       * `overflow: hidden` 是必需的：内容首尾两段要通栏，不裁掉的话
       * 容器圆角会被子元素的直角盖住。
       *
       * 圆角用 12px 而不是 `token.borderRadiusLG`（现值 10px）：
       * `docs/DESIGN.md` §5.2 把「对话框、命令面板」定为 **12–14px**，
       * 而 antd 的 LG 是按 base + 2 派生的，够不到那个区间。
       */
      styles={{
        body: { padding: 0 },
        container: { padding: 0, borderRadius: 12, overflow: 'hidden' },
      }}
      /* 贴着屏幕上方而不是垂直居中：命令面板是「从顶部拉出来」的东西，
         居中会让人以为是个对话框，期待它挡住并取代后面的一切。
         **定位只靠这一处**——早期另给内容加了 `margin-top: -12vh`，
         结果把搜索框拉到了面板外面。 */
      style={{ top: '14vh' }}
    >
      <div className={styles.panel}>
        <div className={styles.searchRow}>
          <Input
            autoFocus
            size="large"
            variant="borderless"
            prefix={<Search size={16} />}
            placeholder="搜索文档、执行操作，或直接提问…"
            value={value}
            onChange={(event) => handleChange(event.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

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
              {/*
               * 这里曾经是 `value.trim() ? '匹配的文档' : '最近打开'` —— 后半句
               * 永远不会渲染：文档行的唯一来源是 `searchQuery.data?.hits`，
               * 而那个查询 `enabled: shouldSearch`（输入 ≥ 2 字），与
               * `value.trim()` 为空互斥。三条路都是死的：空查询下 hits 为
               * undefined，缓存里也没有空键的条目（queryKey 带 value），
               * 于是「最近打开」这个意图在界面上从来没有发生过。
               *
               * 想要真的「最近打开」得另接一个最近文档查询——那是新增产品行为，
               * 按仓库铁律要先改 `docs/DESIGN.md` §8.10 再改代码。这里只把
               * 不可能成立的分支删掉，说它实际是什么。
               */}
              <div className={styles.sectionLabel}>匹配的文档</div>
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
            <div className={styles.emptyBox}>
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
          <span className={styles.footItem}>
            <span className={styles.kbd}>↑</span>
            <span className={styles.kbd}>↓</span>选择
          </span>
          <span className={styles.footItem}>
            <span className={styles.kbd}>Enter</span>打开
          </span>
          <span className={styles.footItem}>
            <span className={styles.kbd}>Esc</span>关闭
          </span>
          <span className={styles.footHint}>输入两个字以上会同时给 AI 答案</span>
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
      <span className={styles.itemIcon}>{item.icon}</span>
      <span className={styles.itemMain}>
        {/* data-role 供高亮态选中：antd-style 的作用域类名不好做子选择器匹配，
            而这个属性把「这是标题」表达得比 nth-child 明确 */}
        <span className={styles.itemTitle} data-role="title">
          {item.title}
        </span>
        <span className={styles.itemSub}>{item.sub}</span>
      </span>
    </button>
  )
}

function matches(item: PaletteItem, query: string): boolean {
  const needle = query.trim().toLowerCase()
  return `${item.title} ${item.sub}`.toLowerCase().includes(needle)
}
