# A 图标实施验证

2026-10-18。限定产品图标组件及其许可分发，不包含 LibraryView 整体业务/GUI验收。

## 实现与来源

- `packages/renderer/src/components/library/FileFormatIcon.tsx` 接受文档 kind/mime/fileExtension/title、可选 size（默认22）及 className。来源 kind 优先；本地文件按既有格式/MIME策略区分，新增批准稿HTML/Markdown专用图形；未知回退通用文件。
- `FileFormatIcon.style.ts` 集中保存revision2 A的16类浅深配色，`useAppearance`选择后交给createStyles。没有全局token、文件夹或其他消费点改动。
- `phosphor-file-icons/glyphs.tsx` 是固定官方SVG逐path转换的静态React JSX；viewBox、currentColor、path d和opacity=0.2保留。没有运行时下载、XML解析、dangerouslySetInnerHTML、任意文件名生成SVG或整库依赖。
- 固定commit `2b75f3ad12b420c9504ef05df8d2564a28f8500e`，每类官方路径/blob/SHA256见资源目录`sources.json`。完整MIT许可和版权保存在相邻`LICENSE`。
- 主会话明确授权窄改`vite-preset.ts`：共享Web/Desktop插件新增`emitPhosphorLicense`，产物包含`licenses/Phosphor-Icons-MIT.txt`完整原文，不改变其他构建行为。
- 一次限定对照脚本将批准稿16个原SVG与JSX逐path属性比较，16/16完全一致；输出见`icon-implementation-parity.json`。

## 已执行检查

- `vitest run vite-preset.test.ts src/components/library/FileFormatIcon.test.tsx`：2文件6测试通过。包含格式/来源/MIME回退、任意输入不注入、22px槽位及浅深实际CSS切换、装饰性隐藏/无焦点；另有真实Vite无写盘构建验证共享预设确实输出完整MIT许可。
- 限定6个TS/TSX文件oxlint：通过。
- 限定7个TS/TSX/JSON文件oxfmt --check：通过。
- 限定git diff --check：通过。
- Renderer `tsc --noEmit`：未通过，唯一诊断为已有`src/lib/agent-media.check.test.ts:12`的TS2550（ES2023下Promise.withResolvers）。此次新文件无类型诊断；此记录不代表全仓通过。

## 边界

测试没有验证真实浏览器抗锯齿或全模块布局；这部分由主会话按冻结HTML进行GUI抽验。图标不表达打开/编辑/替换能力，不移除文件名后缀与来源文字。现有useAppearance无SSR快照，组件测试使用真实客户端挂载；未为图标改动扩展SSR架构。
