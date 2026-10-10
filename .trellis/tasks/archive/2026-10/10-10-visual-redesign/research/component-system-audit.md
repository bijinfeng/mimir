# 组件与图标技术核对

2026-10-10 根据用户新约束审查规划，不修改产品代码。

| 证据 | 结论与实施要求 |
| --- | --- |
| `pnpm-workspace.yaml` catalog：antd `^6.6.4`、antd-style `^4.1.0` | 继续使用现有版本与单一 provider 栈，不引入第二组件库；antd CLI 用 6.6.4 查询具体组件 API/token/semantic 部位 |
| `packages/renderer/src/theme/MimirProvider.tsx` | ThemeProvider 管主题与 customToken，内层 ConfigProvider 只管 locale；Office 的局部 ConfigProvider 只管 small 尺寸，不重复注入 theme |
| `packages/renderer/src/theme/tokens.ts` 与 `design.test.ts` | 旧蓝色与表面值将在实施时替换；保留 default/dark 算法链、叶子 token 校准和实际 provider 对比度测试，不能只比对原型颜色 |
| `packages/renderer/src/components/chat/ChatThemeBridge.tsx`、`theme/editor-theme-bridge.ts` | chat/office 不 import renderer 私有主题；字号与编辑器色值继续由宿主桥接 |
| renderer/chat/desktop 大部分页面已经 import `lucide-react`；renderer `package.json` 仍声明 `@ant-design/icons`，产品源码中无直接 import | Lucide 作为 UI 图标唯一库；确认全仓引用后删除旧依赖，避免规范和依赖再次诱导混用 |
| `packages/office/src/shell/icons.tsx` 自绘并导出约 60 个 UI 图标；Office 暂无 `lucide-react` 依赖 | 增加依赖，保留既有导出名称作适配层，以 Lucide 对应语义替换通用图标；无合适图形时以短文字操作名呈现，六格式命令行为不变 |
| `.trellis/spec/project/design.md` §7.1 写 `@ant-design/icons`，与用户本轮选择相反 | 本任务 PRD 与设计方案优先；实施验证后同任务改规范，不把旧文字当实施指令 |
| `BrandMark.tsx` 和 Office/PDF 文档渲染中的 SVG | 品牌标记与内容图形不是操作图标，不改其数据/视觉语义 |

当前视觉 HTML 用部分字形和 `m` 作静态占位，不能照抄到产品。真实界面要换现有 `BrandMark` 与 Lucide 组件。Ant Design 的控件保留原生交互和可访问性，Obsidian 气质由布局与 token 决定，不另装皮肤。
