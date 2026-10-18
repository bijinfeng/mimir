# Prototype implementation checks

2026-10-18，Trellis implement 子代理。范围仅 `prototype/` 与本记录；没有执行 `task.py start`、提交、真实上传、抓取或浏览器操作。主会话负责最后真实浏览器验收，以下结果不等同产品实施或原生验收。

## 输出

- 独立 `prototype/review.html`，由本地 React/ReactDOM/lucide-react/Vite 生成，JS/CSS内联，无CDN、产品组件或业务API。
- 9组91个研究ID全部映射，60个数据视图基础切片；同类微状态按实际交互路径复用，不能称为91个真实页面。每项可通过hash和目录进入，路径在 `coverage.json` 与场景说明中可查。
- 默认部分失败的3文件批次；当前/打磨后独立交互，同源样本与同宽画布。顶部主题、尺寸、大字号、动效、重置及独立工具控制响应。
- busy/settling关闭锁与页签锁、静态真实阶段、上传原件成功、手动重新选择、文件夹相对路径、整页drop提案与未保存交接均有可体验路径。更多数据包括长URL/2000上限/长后缀/24项列表及解析失败样本。
- 当前列为源码和实际截图复现，非所有状态像素复刻。新增校验、锁定、刷新、统一drop结果与guard仅在打磨后。

## 本地通过

- `node_modules/.bin/oxlint`：main.tsx、fixtures.ts、build.mjs、check-artifact.mjs，0错误0警告。
- `packages/renderer/node_modules/.bin/tsc -p <prototype>/tsconfig.json`：通过。
- `node <prototype>/build.mjs`：通过，单文件产物约356KB（构建日志按实际bundled字节）。
- `node <prototype>/check-artifact.mjs`：通过；91ID顺序/唯一/入口/有效view/path、单文件、禁止产品导入/API调用、6项URL来源与校验断言。最新HTML摘要在 `prototype/checks.json`。
- 格式：使用本地 `oxfmt --stdin-filepath <普通文件名>` 对源文本格式化并比较；隐藏目录本身会被ignore，不能只依赖目录检查输出。

## 依赖同步注意

首次参照此前模块命令调用 `pnpm --filter ... exec tsc` 和 `pnpm exec oxlint`，pnpm12自动触发全工作区依赖同步；另会话新增miniapp importer造成锁文件图变化。一条同步结束，另一条并发同步报 staging 路径缺失。此后使用已有本地binary完成全部检查，未修改依赖声明，未恢复或纳入锁文件；主会话已收到通知并保留其他会话工作。不能笼统宣称整个工作树零变化；本轮产品来源文件未改以主会话source-snapshot为准。

## 主会话首轮发现与已修正

- 等宽并排在1042/1265屏局部横滚不可显见：补明确提示与「看当前/看打磨后」快捷切换，保持两侧同宽。
- after批次结果被大Dragger挤压：有结果时收为54px紧凑新选择入口，保留“选择即开始/替换本地结果/已保存不撤销”语义；结果列表不再被flex压缩，正文可滚动，footer保持可达。当前列仍保留现有大Dragger。
- 键盘：busy无可聚焦控件时焦点留dialog并阻止Tab逃出；F6往返评审工具，以便键盘模拟响应，工具不冒充产品按钮。

## 未验证边界

OS文件/目录选择器、真实File/drop/浏览器默认导航、中文IME候选、触屏、读屏播报、Electron、实际网络/权限/解析/写入和真实宿主query失效均不由HTML验证。文字200%是压力布局开关，不是原生浏览器zoom。竞品版本证据、产品基线截图、实际hover/中心线/溢出与滚动由主会话记录。
