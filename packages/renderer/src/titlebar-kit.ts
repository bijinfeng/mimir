/**
 * 标题栏插槽的配套件（D-103）。
 *
 * 自绘标题栏只存在于桌面端（`apps/desktop/src/renderer/components/TitleBar.tsx`），
 * 但它要显示的品牌与「与侧栏品牌行同一副字形」这件事属于渲染层——
 * 那是设计系统的一部分（`.trellis/spec/project/design.md` §9.1 要求两处同字重同字距）。
 *
 * ## 为什么要有这一份导出
 *
 * 不导出的话，桌面端只能深路径 import（`@mimir/renderer/src/components/...`）。
 * 那等于把包当目录用：包的导出边界形同虚设，renderer 内部挪一个文件就会
 * 无声地弄坏桌面端，而类型检查要等到构建桌面端时才报。
 *
 * 所以插槽需要的东西由渲染层**显式导出**：桌面端只认 `@mimir/renderer`，
 * 不认它的目录结构。
 */

export { BrandMark, BrandLockup } from './components/BrandMark'
export type { BrandMarkProps } from './components/BrandMark'
/**
 * 侧栏的品牌行样式。标题栏合并了侧栏原来那条顶栏（D-094），
 * 品牌字形必须与侧栏同源——各写一份的话，两处的字重与字距会漂移，
 * 而那只有把两处并排放才看得出来。
 */
export { useStyles as useNavStyles } from './components/NavSidebar.style'
/**
 * 标题栏自己的样式要用的两个度量。
 *
 * `TITLEBAR_HEIGHT` 必须与渲染层同源：标题栏高度同时决定「页面头部与它是否
 * 同档」以及侧栏顶栏合并后的净增高度（D-094）。桌面端再写一个 44 的话，
 * 改渲染层的那个值时标题栏不会跟着变——而那种偏差只有并排看才发现。
 */
export { FONT_SIZE, TITLEBAR_HEIGHT } from './theme/tokens'
/**
 * 主题与 antd 的接线。标题栏的样式读 antd token（`colorBgLayout`、
 * `colorTextSecondary`…），所以**测试里渲染它必须套这一层**——
 * 不套的话 `createStyles` 拿不到 token，组件直接抛错。
 */
export { MimirProvider } from './theme/MimirProvider'

/** 本地载体打开独立窗口时传递当前外观，不读取远端页面状态。 */
export { getAppearance, subscribe as subscribeAppearance } from './theme/appearance'
