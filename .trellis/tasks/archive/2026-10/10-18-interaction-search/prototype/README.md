# 搜索与命令面板 · HTML 评审稿 v1

本目录只包含独立评审原型。产品实现尚未获得本模块具体版本的认可，本原型不修改任何产品源码，不发业务请求，不存储真实数据。

## 查看

使用本地静态服务器打开 `review.html`，不依赖 CDN、字体服务或业务后端。主会话评审地址为 `http://127.0.0.1:5182/review.html`。`review.html#scene=search.query.error` 可直接进入指定状态；场景目录与选择器包含全部 16 组、152 项交互覆盖。`coverage.json` 逐项映射到同名入口。

顶部可切换前后并排、当前、打磨后、浅深外观、桌面自适应、390×844、390×500。桌面画布的面板最大宽度620px，窄于636px时按实际容器收缩；小屏并排允许横向滚动，也可单侧查看。当前侧以产品源码和本任务 verification/ 实拍为依据，保留单行片段、绿色选中和现有读取反馈缺口。前后使用相同数据，不改变命中顺序或合并同文档片段。

## 可操作内容

- 输入、清空、箭头选行、Enter执行、Tab/Shift+Tab焦点循环、Esc和遮罩关闭、重新打开重置、返回入口焦点。
- 最近笔记读取/部分失败/全失败/重试、检索加载/空/错误/缓存刷新、稳定选择与列表更新。
- 完整标题、路径、片段的详情披露；每处片段保持独立打开。
- 新建等待/失败/成功与未保存保护；响应丢失明确说明不能保证幂等重试。
- 笔记/只读文件/未知上下文命令差异；重命名、移动、当前笔记查找、收集弹窗、文档与新对话的局部交接。
- AI只通过独立动作把问题带到新对话，目的地只预填、不自动发送。
- 手动/自动保存保护、继续编辑、丢弃、保存等待/失败，以及Office无法代存的提示。

“场景演示”的成功/失败响应、列表变化和输入法候选按钮属于评审工具，不是新增产品按钮。初始等待场景可保持等待供比较，模拟响应按钮可手动完成。实际重试按本地定时器模拟完成。所有状态可以通过“重置交互”还原。

## 明确边界

原生 Ctrl/Cmd+K、操作系统中文候选、辅助技术播报、跨标签存储、真实401权限处理、文档片段真实偏移定位、高亮 API 与 Electron宿主需要实施后另验。原型只演示对应可见状态或局部交接，不能当作实际通过。收集、编辑器与AI完整页面属于后续模块；这里只展示该命令链路的必要交接。没有新增搜索过滤、历史查询、分页、分组算法或后端接口。

## 源码与构建

使用本仓已有 React、ReactDOM、lucide-react与Vite构建，但不导入任何产品组件、主题或业务代码。评审样式的常量从已认可浅深主题抄录到原型，保证构建产物独立。源码为 `main.tsx`、`fixtures.ts`、`review.css`、`scenes.json`；Vite输出在`dist/`，`build.mjs`再内联为单文件`review.html`。

在仓库根目录运行：

```sh
pnpm --filter @mimir/renderer exec tsc -p "$PWD/.trellis/tasks/10-18-interaction-search/prototype/tsconfig.json"
pnpm exec oxlint .trellis/tasks/10-18-interaction-search/prototype/main.tsx .trellis/tasks/10-18-interaction-search/prototype/fixtures.ts .trellis/tasks/10-18-interaction-search/prototype/build.mjs
node .trellis/tasks/10-18-interaction-search/prototype/build.mjs
node .trellis/tasks/10-18-interaction-search/prototype/check-artifact.mjs
```

隐藏的`.trellis`目录被仓库格式器默认忽略，源码格式使用`oxfmt --stdin-filepath <文件名>`检查。局部检查结果写入`checks.json`；实际浏览器验收由主会话写入verification/，不以构建通过代替视觉或产品验收。
