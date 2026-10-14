import type { Appearance } from './appearance'

/**
 * mimir 的自定义 token —— antd 没有这些语义的那部分。
 *
 * antd 的 token 体系里有品牌色、文字阶、语义色，但没有「列表列的底色」和
 * 「行内代码的字色」。历史上这三个值是 `global.css` 里的 `--mimir-*` 变量；
 * 改用 antd-style 后它们走 `customToken`，原因是：
 *
 * 1. 有类型 —— `createStyles` 里的 `token.tintList` 能补全，拼错会报错
 * 2. 有作用域 —— 值跟着 ThemeProvider 走，不再是全局裸变量
 * 3. 一处定义 —— 不需要 `:root` 与组件样式两处维护
 *
 * ## 两套外观
 *
 * 这些值同样分浅 / 深两套，由 `customTokenFor` 按当前外观选。
 * 深色不是「把浅色反过来」——四个值的取值依据各自写在下面对应项上。
 *
 * 规范与实测对比度见 `.trellis/spec/project/design.md` §3.6 / §4.3 / §3.8。
 *
 * ## 表面颜色维护指南
 *
 * ### 表面层级系统
 *
 * mimir 使用 5 层表面系统建立视觉层次（由低到高）：
 *
 * 1. **布局底** (`colorBgLayout` in tokens.ts) — 最底层的工作区背景
 * 2. **导航底** (`tintNav`) — 左侧导航栏，比布局底略亮/暗
 * 3. **列表底** (`tintList`) — 中栏列表、目录树，用于分隔而不加边框
 * 4. **容器底** (`colorBgContainer` in tokens.ts) — 主要内容区、卡片
 * 5. **浮层底** (`colorBgElevated` in tokens.ts) — 弹窗、下拉菜单，最上层
 *
 * ### 对比度要求
 *
 * **相邻层级的对比度**：
 * - 相邻表面之间必须保持可辨识的对比度差异（建议 ≥1.05:1）
 * - 例如：tintList vs colorBgContainer
 *
 * **悬停反馈的对比度**：
 * - tintHover 与所在表面（如 tintList）必须 ≥1.08:1
 * - 浅色实测 1.09:1，深色实测 1.16:1
 * - 第一版用 #fafbff（对比度仅 1.01:1）导致悬停反馈几乎不可见
 * - design.test.ts 守护此下限
 *
 * **热力图色阶**：
 * - 空格子（colorFillQuaternary）与第一档（heatL1）必须 ≥1.1:1
 * - 浅色：从浅到深（L1 刻意比 colorPrimaryBg 深，避免「有活动」看起来像「没活动」）
 * - 深色：从暗到亮（与空格子的亮度方向一致）
 *
 * ### 修改表面颜色时的检查清单
 *
 * 1. **保持层级秩序**：
 *    - 浅色：布局底 < 导航底 < 列表底 < 容器底 < 浮层底（从暗到亮）
 *    - 深色：布局底 < 导航底 < 列表底 < 容器底 < 浮层底（从暗到亮）
 *    - 注意：深色的"更高层级"意味着更亮，与浅色同方向
 *
 * 2. **验证悬停反馈**：
 *    - 在实际界面上测试 tintHover 是否清晰可见
 *    - 列表项、菜单项、按钮的悬停应当有一致的视觉强度
 *
 * 3. **跨外观一致性**：
 *    - 同一语义层级在浅色和深色下应保持相似的视觉重量
 *    - 深色下的对比度标准不应低于浅色（§3.8 的"不回归"原则）
 *
 * 4. **测试验证**：
 *    - 运行 design.test.ts 验证对比度符合要求
 *    - 在两种外观下目视检查表面层级是否清晰
 */
export interface MimirCustomToken {
  /** 第四层表面：三栏里的中栏列表、大纲列。比容器底稍冷，用来分隔而不加边框 */
  tintList: string
  /** 第四层表面：左导航、浮层页脚 */
  tintNav: string
  /**
   * 列表项 / 引用块悬停时的底。
   *
   * **要与 `tintList` 拉开可见的差**：第一版是 `#fafbff`，与 `#fcfcfd`
   * 只差 **1.01:1**——浅色下「悬停提亮一档」这个信号根本不存在（深色那边
   * 原本也只有 1.11）。现在两套都按 ≥1.08:1 挑（实测浅色 1.09、深色 1.16），
   * 与 antd 自己的 `colorFillTertiary` 悬停底同一档——列表、菜单、按钮
   * 的悬停深浅一致，不靠约定。
   * `design.test.ts` 有一条守着这个下限。
   */
  tintHover: string
  /** 行内代码字色。配 `colorFillSecondary` 底 */
  inlineCodeFg: string
  /** 正文 `<mark>` 的高亮底。字色继承正文 */
  highlightBg: string

  /**
   * 用量热力图的四档色阶。
   *
   * 浅色取紫色的四档色阶（`.trellis/spec/project/design.md` §3.6）。
   * **第一档刻意比 `colorPrimaryBg` 深**：过浅会让「有一点活动」与「完全没活动」看起来一样——
   * 而那是贡献图最常见的失败。
   *
   * 空格子反过来用 `colorFillQuaternary`，两边让开。
   *
   * 深色下同一个判断依然成立，但方向相反：空格子是**更暗**的一方
   * （白色 4% 压在容器底上），所以色阶要往亮走，且 L1 与空格子
   * 仍要拉开 1.1 以上（实测 1.39）。
   */
  heatL1: string
  heatL2: string
  heatL3: string
  heatL4: string
}

/**
 * 把自定义 token 的类型接进 antd-style。
 *
 * 这一步不做的话 `token.tintList` 在 `createStyles` 里是类型错误——
 * antd-style 的 `FullToken = AntdToken & CustomToken`，`CustomToken` 默认是空接口。
 */
declare module 'antd-style' {
  export interface CustomToken extends MimirCustomToken {}
}

const LIGHT: MimirCustomToken = {
  tintList: '#f8f8fa',
  tintNav: '#f4f4f5',
  // 与 tintList 差 1.09:1（第一版 #fafbff 只有 1.01，等于没有悬停反馈）
  tintHover: '#e9e5ef',
  inlineCodeFg: '#c7254e',
  highlightBg: '#fff3b0',
  // 用量热力图色阶（浅 → 深）。见 .trellis/spec/project/design.md §3.6
  heatL1: '#e1d8f3',
  heatL2: '#bea9e4',
  heatL3: '#9171d0',
  heatL4: '#543b9a',
}

/**
 * 深色。
 *
 * 与浅色**同序但反方向**：浅色里「列底比容器底略暗」，深色里变成「列底比
 * 容器底更暗」——保持「两栏之间有分隔、但不用边框」这同一个效果。
 *
 * 热力图色阶在深色下与 `colorPrimaryBorder` 共用了紫色阶的中段，
 * 这是有意的：它们是同一个色相族里的两个用途，而焦点环不该在色阶里出现
 * 完全落空的一档。
 */
const DARK: MimirCustomToken = {
  tintList: '#252529',
  tintNav: '#222226',
  // 与 tintList 差 1.16:1（比浅色那档再拉开一点——深色下亮度差更难感知）
  tintHover: '#393340',
  inlineCodeFg: '#ffa6b4',
  highlightBg: '#4a3c10',
  heatL1: '#4a3b68',
  heatL2: '#6f55a6',
  heatL3: '#a183df',
  heatL4: '#cbb5ff',
}

/** 当前外观对应的自定义 token。`MimirProvider` 用它 */
export function customTokenFor(appearance: Appearance): MimirCustomToken {
  return appearance === 'dark' ? DARK : LIGHT
}

/** 浅色那套。守门测试与「哪一套是什么」的对照都从这里取 */
export const mimirCustomToken = LIGHT

/** 深色那套 */
export const mimirDarkCustomToken = DARK
