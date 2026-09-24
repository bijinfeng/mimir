import { createStyles } from 'antd-style'
import { FONT_SIZE, NAV_ITEM_HEIGHT, NAV_ITEM_MARGIN } from '@/theme/tokens'

/**
 * 左导航的样式。
 *
 * 形态参照一份桌面应用侧栏：**顶部的动作列表、素文字分区标签、
 * 行内右侧对齐的弱化元信息**。三条都是刻意的：
 *
 *  1. **动作列表**（图标 + 文字 + 右侧快捷键）比一排按钮好——
 *     它把「能做什么」摊平成可扫读的清单，而不是让人去找按钮
 *  2. **素文字分区标签**（不是带箭头的大标题）——分区是**路标**，
 *     不该比它所标示的内容更显眼
 *  3. **右侧对齐的元信息**（计数、相对时间）——它让每一行的左侧
 *     对齐成一条整齐的竖线，扫读时视线不用来回跳
 *
 * 组件形态见 `docs/DESIGN.md` §8，字号一律走 `FONT_SIZE`（D-017）。
 */
export const useStyles = createStyles(({ css, token, prefixCls }) => ({
  nav: css`
    height: 100%;
    display: flex;
    flex-direction: column;
    background: ${token.tintNav};
    border-right: 1px solid ${token.colorBorderSecondary};
  `,

  /* ── 顶栏：品牌 + 折叠开关 ─────────────────────────── */
  topBar: css`
    flex: none;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 12px 10px 10px 14px;
  `,
  /**
   * 折叠后的顶栏：**竖排成一列**。
   *
   * 48px 的宽度放不下「标记 + 按钮」并排。改成竖排后两者都居中，
   * 且不需要在展开态与折叠态之间调换 DOM 顺序——顺序稳定，
   * 读屏软件听到的始终是「品牌 → 开关」。
   */
  topBarCollapsed: css`
    flex-direction: column;
    gap: 10px;
    padding: 12px 0 10px;
  `,
  brandLockup: css`
    display: flex;
    align-items: center;
    gap: 7px;
    margin-right: auto;
    color: ${token.colorPrimary};

    b {
      font-size: ${FONT_SIZE.section}px;
      font-weight: 700;
      letter-spacing: 0.06em;
      /* 文字用正文色而不是主色：主色 #1677ff 作文字在白底上只有 4.10:1
         （docs/DESIGN.md §3.5），品牌名不该是全页唯一不达标的文字 */
      color: ${token.colorText};
    }
  `,
  /** 折叠后只留标记，且不再撑开（`margin-right: auto` 会把它推向一侧） */
  brandLockupCollapsed: css`
    margin-right: 0;
  `,

  /* ── 主体：一个可滚动的 Menu + 一个 Tree ─────────────── */
  body: css`
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding-bottom: 6px;
  `,

  /**
   * antd Menu 的收敛。
   *
   * Menu 默认是给「应用级导航」调的：字号偏大、行高偏松、选中态是右侧一条蓝线。
   * 这里的侧栏信息密度更高，需要收紧；选中态也换成整行浅底（与列表项一致）。
   */
  menu: css`
    background: transparent;
    border-inline-end: none !important;
    font-size: ${FONT_SIZE.item}px;

    /* 行高与内边距：比 antd 默认紧，但仍留出可点击的余量 */
    .${prefixCls}-menu-item,
    .${prefixCls}-menu-submenu-title {
      height: ${NAV_ITEM_HEIGHT}px;
      line-height: ${NAV_ITEM_HEIGHT}px;
      margin: 1px ${NAV_ITEM_MARGIN}px;
      padding-inline: 8px !important;
      border-radius: 6px;
      color: ${token.colorTextSecondary};
    }
    .${prefixCls}-menu-item:hover {
      background: ${token.colorFillTertiary};
    }

    /* 选中态：整行浅底 + 链接色文字。用 colorLink 而不是 colorPrimary
       ——主色作文字在浅蓝底上只有 3.61:1（DESIGN §3.2） */
    .${prefixCls}-menu-item-selected {
      background: ${token.colorPrimaryBg} !important;
      color: ${token.colorLink} !important;
      font-weight: 500;
    }

    /* antd 默认给选中项右侧加一条竖线，与「整行浅底」重复了 */
    .${prefixCls}-menu-item-selected::after {
      display: none;
    }

    .${prefixCls}-menu-item-icon {
      font-size: ${FONT_SIZE.item}px;
      opacity: 0.65;
      margin-inline-end: 8px;
    }

    /* 分区标签：素文字，不抢内容。
       参考里它是很轻的一行，而不是带箭头的大标题 */
    .${prefixCls}-menu-item-group-title {
      padding: 14px 6px 4px 14px;
      font-size: ${FONT_SIZE.badge}px;
      font-weight: 600;
      color: ${token.colorTextTertiary};
      letter-spacing: 0.02em;
    }

    /* 右侧元信息（计数 / 相对时间）。**这一栏是扫读的锚点**——
       它让每行左边的内容对齐成一条竖线 */
    .${prefixCls}-menu-item-extra {
      font-size: ${FONT_SIZE.badge}px;
      color: ${token.colorTextTertiary};
      font-variant-numeric: tabular-nums;
      margin-inline-start: 8px;
    }

    /* 选中项的计数跟着变成链接色，否则浅蓝底上会有一块灰字显得脏 */
    .${prefixCls}-menu-item-selected .${prefixCls}-menu-item-extra {
      color: ${token.colorLink};
    }

    .${prefixCls}-menu-item-divider {
      margin: 8px 12px 8px 10px;
      border-color: ${token.colorBorderSecondary};
    }
  `,

  /**
   * 折叠态对 Menu 的收敛。
   *
   * antd 的 `inlineCollapsed` 把菜单**硬定成 80px 宽**（实测计算样式
   * `width: 80px`），而这一栏只留 48px。不覆写的话整块菜单横向溢出，
   * 栏内出现横向滚动条，右侧内容也被压过去——实测确认过。
   *
   * 四处都要处理，缺一处就还是溢出：
   *
   *  1. **宽度本身**。这是溢出的大头
   *  2. **分组标签**（`对话` / `知识库`）。48px 下它们会被裁成「还」这种残字，
   *     看起来像渲染坏了。折叠态里图标本身已经说明了分组，整块隐藏
   *  3. **图标居中**。antd 靠 `padding-inline: calc(50% - 16px/2)` 把图标
   *     推到中间，而那假设了图标恰好 16px 宽；一旦有多宽的图标就会偏。
   *     改成 flex 居中，与图标实际宽度无关
   *  4. **计数与相对时间**（`-item-extra`）。撑不住 48px，挤进来只会溢出
   *
   * 分隔线的左右边距也一并收窄，否则它比菜单还宽。
   */
  menuCollapsed: css`
    /* 用 100% 而不是写死 48px：栏本身有 1px 右边框，内容盒只有 47px，
       写死 48px 会多出 1px（实测 scrollWidth 48 > clientWidth 47）。
       跟随容器宽度也更耐用——栏宽若在别处调整，这里不用跟着改。 */
    width: 100% !important;

    .${prefixCls}-menu-item-group-title {
      display: none;
    }

    .${prefixCls}-menu-item,
    .${prefixCls}-menu-submenu-title {
      display: flex;
      /* 必须 !important：antd 的规则是
         .ant-menu-inline-collapsed > … > .ant-menu-item（四个类），
         特异性 (0,4,0) 高于这里的 (0,2,0)，普通声明会被它盖掉。
         它给的是 justify-content: flex-start 配一个
         padding-inline: calc(50% - 图标宽/2 - …)——那套算法假定图标
         恰好是 --ant-menu-collapsed-icon-size，换个尺寸就偏。 */
      justify-content: center !important;
      margin-inline: 4px;
      padding-inline: 0 !important;
    }

    .${prefixCls}-menu-item-icon {
      margin-inline-end: 0;
      /* 图标是唯一内容，让它拿到全部对比度 */
      opacity: 0.8;
    }

    .${prefixCls}-menu-item-extra {
      display: none;
    }

    /*
     * 标签是图标的**兄弟节点**，且折叠时它并没有消失——antd 只是把它压成
     * 0 宽。flex 居中因此按「图标 + 标签」两个子项来分配空间，图标实测
     * 落在 12px 处（应为 24px 正中）。display: none 让它真正退出布局。
     *
     * 不能改成 inline 之类——antd 的过渡依赖它存在，
     * 而这里要的正是「折叠态下它不存在」。
     */
    .${prefixCls}-menu-item-label {
      display: none;
    }

    .${prefixCls}-menu-item-divider {
      margin-inline: 10px;
    }
  `,

  /* ── 目录树 ──────────────────────────────────────────
     Tree 不在 Menu 里：Menu 是扁平的，而目录是层级结构。
     两处的行高与选中态必须看起来是同一套东西 */
  treeGroup: css`
    padding: 0 6px;
  `,
  treeWrap: css`
    .${prefixCls}-tree {
      background: transparent;
      font-size: ${FONT_SIZE.item}px;
    }

    .${prefixCls}-tree-node-content-wrapper {
      height: 28px;
      line-height: 28px;
      padding-inline: 6px !important;
      border-radius: 6px;
      color: ${token.colorTextSecondary};
    }

    .${prefixCls}-tree-node-selected .${prefixCls}-tree-node-content-wrapper {
      background: ${token.colorPrimaryBg};
      color: ${token.colorLink};
    }
  `,
  treeCount: css`
    margin-inline-start: 6px;
    font-size: ${FONT_SIZE.badge}px;
    color: ${token.colorTextTertiary};
    font-variant-numeric: tabular-nums;
  `,

  emptyHint: css`
    padding: 2px 14px 6px;
    font-size: ${FONT_SIZE.note}px;
    line-height: 1.7;
    color: ${token.colorTextTertiary};
  `,

  /* ── 底部 ──────────────────────────────────────────── */
  foot: css`
    flex: none;
    border-top: 1px solid ${token.colorBorderSecondary};
    padding: 4px 0;
  `,

  /**
   * 底部账号行（`docs/DESIGN.md` §8.13）。
   *
   * ## 尺寸与对齐**照抄上面的菜单项**（实测值）
   *
   * 第一版按「看上去差不多」写的，实测差了三处，叠在一起就是
   * 「这一行不像同一套东西」：
   *
   * | | 菜单项（实测） | 第一版账号行 |
   * |---|---|---|
   * | 外边距 | `1px 6px` | `2px 4px 4px` |
   * | 内边距 | `0 8px` | `5px 8px` |
   * | 高 | `30px` | `32px` |
   * | 行宽 | 191px | 199px（**右边缘溢出容器 3px**）|
   * | 内容 | 左对齐（图标 x=14）| **居中**（头像 x=77）|
   *
   * 最后两行是会被一眼看出来的：账号行比上面宽出一截，而头像又飘在
   * 中间——两行的左边缘差了 63px，读起来像两个不相关的块。
   *
   * 现在三处尺寸全部对齐菜单项，`justify-content` 去掉（默认左对齐），
   * 头像与菜单图标落在同一条竖线上。
   *
   * ## 选中态与菜单项同一套
   *
   * 账号行也是「设置」的一个入口（进的是设置 › 账号），所以它在
   * 账号分区时应当和菜单项一样点亮：`colorPrimaryBg` 底 + `colorLink` 字。
   * 这三重线索（底色 + 字色 + 字重）是 `DESIGN.md` §8.1 定的导航项形态，
   * 直接沿用，不另创一种「选中」的样子。
   *
   * 底色用 `colorPrimaryBg` 而不是 `colorFillQuaternary`（第一版）：
   * 后者是 hover 用的，选中与 hover 用同一个色等于没有选中态。
   */
  /**
   * 底部那一行：账号在左、设置图标贴右。
   *
   * `padding` 与菜单项对齐（4px 5px 是 `.ant-menu` 的默认内边距，
   * 而这里自行给一份，让图标与上面各行的右边缘落在同一条竖线上）。
   */
  accountRow: css`
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 2px 5px 3px;
  `,
  accountRowCollapsed: css`
    flex-direction: column;
    gap: 4px;
    padding: 4px 0 5px;
  `,

  account: css`
    display: flex;
    /*
     * 账号侧占满剩余宽度，把设置图标挤到最右——这是「贴最右」的实现，
     * 不靠 margin-left: auto（那个在折叠态（竖排）会失效）。
     */
    flex: 1;
    align-items: center;
    gap: 8px;
    /*
     * width: auto 配两侧 margin，**与菜单项同一种盒子**。
     *
     * 第一版写的是 width: calc(100% - 12px)，算出来比菜单项窄 4px——
     * 差别在于百分比的参照是父容器的**内容盒**，而 antd 菜单项
     * 是按 flex 子项（width: auto 加 margin）撑出来的。
     * 两种算法在有 padding 的容器里不相等，于是两行的右边缘差 4px。
     *
     * 用同一种布局方式就没有这个换算问题：flex 的块级子项默认
     * width: auto 就会占满剩余宽度。
     *
     * 注：这段注释里**不能出现反引号**——它所在的模板字符串会被提前结束
     * （见 TECH.md 第 10 节的坑表，这个坑咬过五次）。
     */
    /*
     * flex: 1 让它撑满，而不是被内容收缩。
     *
     * 上一版试图用 width: auto 达成「与菜单项一样的盒子」，但那只在
     * 块级布局里成立——antd 的菜单项在 ul 的 flex 上下文里是**被拉伸**的
     * （实测 191 = 容器 199 减两侧 margin 6+6，正好占满）。
     * 这里显式写 flex: 1，得到同一个结果，不依赖父容器的布局巧合。
     */
    flex: 1;
    margin: 1px ${NAV_ITEM_MARGIN}px 4px;
    height: ${NAV_ITEM_HEIGHT}px;
    padding: 0 8px;
    border: none;
    border-radius: 6px;
    background: none;
    cursor: pointer;
    text-align: left;

    &:hover {
      background: ${token.colorFillQuaternary};
    }
  `,
  accountCollapsed: css`
    justify-content: center;
    padding: 0;
  `,
  accountAvatar: css`
    flex: none;
    /* 无头像时的字母底：主色浅底 + 链接色文字，与设置页的预览一致 */
    background: ${token.colorPrimaryBg};
    color: ${token.colorLink};
    font-size: ${FONT_SIZE.badge}px;
    font-weight: 600;
  `,
  /**
   * 设置图标。
   *
   * 尺寸与账号行的头像同高（26px），让右端那个图标与左端的头像
   * 看起来是同一层级的两个元素；热区比图标本身大（`size="small"`
   * 的 antd 按钮是 24×24），点得到。
   */
  accountSettings: css`
    flex: none;
    width: 26px;
    height: 26px;
    min-width: 26px;
    padding: 0;
    color: ${token.colorTextTertiary};
  `,
  accountSettingsActive: css`
    color: ${token.colorLink};
    background: ${token.colorPrimaryBg};
  `,
  /**
   * 外观菜单里的一项：文字在左、选中勾在右。
   *
   * `width: 100%` + `justify-content: space-between` 让它撑满菜单项，
   * 勾才会贴在右端而不是紧跟着文字。`min-width` 保证三项的勾在同一竖线上
   * （「跟随系统」比「浅色」宽，不定宽的话勾会左右浮动）。
   *
   * 注：这几条样式作用在 `Dropdown` 的 portal 里，而 antd-style 注入的
   * 类名是全局的，所以照常生效。
   */
  themeOption: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-width: 72px;
  `,
  themeCheck: css`
    flex: none;
    font-size: ${FONT_SIZE.badge}px;
    color: ${token.colorLink};
  `,
  accountName: css`
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: ${FONT_SIZE.item}px;
    font-weight: 500;
    color: ${token.colorText};
  `,
}))
