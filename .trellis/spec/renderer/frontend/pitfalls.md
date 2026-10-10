# 会静默出错的地方

这几类问题**不报错**，只在你以为没问题的时候悄悄地错。改相关代码前先扫一遍。
新坑记到这里；**子目录还有更细的坑表**（`src/editor`、`src/theme`、
`src/components/document`，以及 `packages/office` 的 `src/shell` / `src/editors`
——外壳与各格式编辑器的坑跟着代码走），跨区域的记[项目坑表](../../project/pitfalls.md)。
桌面载体自己的坑（标题栏拖动区、preload、产物路径）在 `.trellis/spec/desktop/runtime/index.md`。

| 症状 | 原因 |
|---|---|
| 切换文档后防抖窗口内的笔记改动丢失，且没有离开提示 | `NoteEditor` 必须直接向 `useUnsaved()` 注册 `setDirty` 与 `setSave`；只靠调用方传回调，漏接一次就让守卫失效 |
| 键盘进入正文后焦点环消失 | `--mimir-focus-ring-style` 声明在 `html`，这里只能存 `none` / `solid` 关键字；不要把引用 `--ant-*` 的整条 outline 存进去，颜色与宽度在消费处定义 |
| **渲染层里写 `window.mimirDesktop` 判断，浏览器构建跟着带上桌面代码** | 这一层是**两个平台共用**的源码（D-103）。平台差异一律走 `src/platform.tsx` 的三个 hook。写成运行时判断不报错，但那一支在浏览器里永远不成立——下一个读的人无法判断它是死代码还是有用分支，而桌面专属的组件也会被打进浏览器产物 |
| **某个文件改一行后整页白屏，刷新就好** | 一个**既导出组件、又在模块作用域调用一次性 setter** 的文件会被 React Fast Refresh 热接受并**重新执行模块体**（实测 Vite 发的是 `js-update` 而不是 `full-reload`），那一刻 setter 第二次调用抛错。这是 D-104 把模块级 `setPlatformSlots` 换成 Context 的原因之一——现在没有一次性 setter 了，但**新增任何「只能调一次」的模块级装配时都会复活这条坑**：把它放在不导出组件的文件里 |
| **桌面端加了路由，浏览器侧也能导航过去** | 路由树**每个平台一份**（D-104）。如果把平台专属的页面放进本包的 `src/routes/`，两个平台都会生成它——浏览器侧多出一条永远到不了的路由，类型上还合法。平台专属页面放使用方自己的目录（桌面端是 `apps/desktop/src/renderer/routes/`，由构建配置的 `extraRoutes` 挂载） |
| **包内用 `@/` 别名，某个平台「构建能过、另一个找不到模块」** | `@/` 是**应用**的别名。留在被 import 的包里就要求每个使用方都配一遍本包的内部目录（`apps/web` 与 `apps/desktop` 各一份 vite + tsconfig），漏配一处就分叉。包内一律相对导入——抽包时 204 处已全部改掉，别加回来 |
| **桌面端深路径 import 本包（`@mimir/renderer/src/components/...`）** | 那等于把包当目录用，导出边界形同虚设：本包挪一个文件就无声弄坏桌面端，而类型检查要等到构建桌面端时才报。标题栏需要的件由 `./titlebar-kit` 显式导出，新需求往那里加一行，不要让使用方伸手进 `src/` |
| **小屏幕下侧边栏被压缩变形** | 同一个断点（880px）被写了两份：外壳的 `@media` 把左列压到 48px，而栏内内容仍按折叠偏好渲染成展开态——中文标签逐字竖排、品牌名与开关叠在一起（实测 `scrollWidth` 129 对 `clientWidth` 47）。断点只在 `theme/tokens.ts` 定义（`NAV_NARROW_QUERY`），CSS 与 `lib/nav-collapse.ts` 的 `matchMedia` 共用它（DESIGN §5.5 / D-055）；`design.test.ts` 守住外壳里不再出现这个字面量 |
| **折叠后侧栏排版乱了（图标偏右 + 底部冒横向滚动条）** | 展开态的 `width: 100% !important`（占满整行）与折叠态 `margin-inline: 4px`（图标居中用）叠加，项盒比 48px rail 宽 4px——实测 `scrollWidth` 52 对 `clientWidth` 48、图标中心 28 而非 24。折叠态要 `width: calc(100% - 8px) !important`（`NavSidebar.style.ts` 的 `menuCollapsed`，DESIGN §5.4）；两条规则一个管展开一个管折叠，改一条要看另一条 |
| **目录树点哪行不进哪行** | rc-tree 的 `.ant-tree-title` 是行内元素，而标题内容是个块级 flex 盒子——放不进图标所在的 line box，被折到下一行（实测每行标题 top 比本行高恰好 28px）。名字画在下一行的行带上，`elementFromPoint` 取名字中心命中的是后一行：点「技术」进的是 `folder:技术/后端`。wrapper 补 `display:flex;align-items:center`、title 补 `display:flex;flex:1;min-width:0`（`FolderSection.tsx` 的 `treeWrap`，DESIGN §8.1 / D-069） |
| **菜单项里图标与文字不在一条中线上** | antd 给菜单项的 `line-height: 30px`（整行高）会**继承**到文字层：13.5px 中文排进 30px 行盒，中文字形没有西文下伸部，墨迹天然偏上——实测文字比图标高 1.5px。修法是把**文字层**（`.ant-menu-item-label` / `-extra`）行高压回 `normal`，不动 li 的行高（那是行框，改了整行塌）。残余 ≤0.5px 是字形度量，不做像素补偿（`NavSidebar.style.ts` 的 menu，DESIGN §8.1） |
| **Web 端整站内容只有几百像素高、下方一大片空** | 外壳网格按「标题栏 + 两栏」写了两行（`grid-template-rows: auto minmax(0,1fr)`），而 `TitleBar` 在浏览器端 `return null`（没有窗口可控制）——只剩一个子元素落进 `auto` 行，`1fr` 行空置。实测 1440×900：知识库页 398px、对话页 302px、设置页 740px。Electron 里标题栏在所以看不出来。修法是外层改 **flex 列**（对子项数量不敏感），子层用 `flex: 1` 吃剩余高度（`_app.tsx` 的 shell / app，D-095） |
| **进目录页图标切换动效不对（箭头朝上）** | morphicons 的路径形变与 antd 自带的收起态 `-90°` 旋转叠加了——`transform: none !important` 关掉 antd 那一半，朝向只归动效库一处（DESIGN §8.1） |
| **目录树整体浮着一块底色 / 树根样式写了不生效** | createStyles 里把树根样式写成 `.treeWrap .ant-tree` 后代式，而 treeWrap 类就挂在**树根自己身上**——祖先-后代关系不成立，规则静默失效：目录顶着 antd 的 colorBgContainer 坐了两个迭代，D-070（界面去线）删掉右缘线没了遮挡才被看见。同一条坑还埋着选中态规则（`-node-selected` 类也在 wrapper 自己身上，从没生效过，一直是 antd 默认在渲染）。要用 `&.ant-tree` 同元素选择器。展开三角的坑在同一段代码里还有一对：三角必须 z-index 抬过 content-wrapper（relative 且 DOM 在后，否则 elementFromPoint 命中 wrapper、点三角落空），闲时 pointer-events none（那个位置平时点图标 = 进目录）（`FolderSection.tsx` 的 `treeWrap`，DESIGN §8.1） |
| 界面里混进原生控件（深色下白框） | 语法对、typecheck 过、浅色下「看着还行」，但深浅主题都管不到原生 `<select>` / `<input type="file">`，各浏览器默认外观还不同。交互元素一律用 antd（`Segmented` / `Table` / `Upload` / `Button` / `Typography.Text code`）。见 D-042 |
| 点击「登出」后页面不变，控制台报 HTTP 415 | Better Auth 的 `/api/auth/sign-out` 要求 JSON 请求头；`lib/api.ts` 的 `request()` 只有在 body 存在时才加 `Content-Type`。两个登出入口都应发送空 JSON 对象 `{}`，再清空会话并回登录页。 |
| 热力图的日期键全部静默失配 | 图表库用 `YYYY/M/D`（**不补零**），API 给 `2026-09-18`（补零）——直接 `replaceAll('-','/')` 得到的键永远查不到，自定义规则全部失效而图照常渲染。只在一个 `dateKey()` 里统一转换。见 §12.8 |
| 热力图少渲染最后几天（含「今天」） | 库的 `gridNum` 从**容器宽度**推，不从日期范围推——CSS 自适应会安静丢掉放不下的天（370 天在 680px 容器里只画 53 列）。自己按日期范围算宽度传给 SVG。见 §12.8 |
| 热力图有时一格都不画 | antd `Tabs` 切走的面板是 `display: none`，`clientWidth` 为 0 → 列数为 0；且只在挂载时量一次，恢复与否全靠凑巧（实测同一页面来回切，有时 376 格、有时 0 格）。宽度为 0 时**不挂载**该库，用 `ResizeObserver` 等它有位置了再挂（`WhenVisible`）。见 §12.8 |
| 干净检出直接跑 `typecheck` 找不到 `routeTree.gen.ts` | 路由树是生成物。用 `tsr generate` 显式生成，已写进 typecheck/build 脚本 |
| antd 按钮 hover 时「边框一闪 + 内容抖一下」 | 我们给按钮写 `border: none` 而 antd 的变体样式在 `&:hover` 里用**简写**重写 `border`（`border-width: 1px` + 变体色，特异性高于单类）——hover 那一刻边框从 none 变 1px：颜色从 `currentColor`（深色下是白）过渡到透明，白边一闪；border-box 重算让内容内移 1px（实测头像 x 14 → 14.8）。修法是**留一个恒为透明的 1px 边框**（`border: 1px solid transparent`），并把过渡限定到 `color` / `background-color`（antd 默认的 `all` 会让边框宽度也参与过渡）。裸 `<button>` 不受影响（没有变体样式），只有 antd `Button` 需要（D-083） |
