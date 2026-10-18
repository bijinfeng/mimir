# 收集与导入 v1 revision2 产品实施与验收

2026-10-18，用户“可以，实施吧”批准冻结稿，HTML SHA256 `fa66bdc5e0ed6a4c7d1383342b7e554754b9f88ce69db162a56fc947b93061e1` 保持不变。本轮前端实施、独立复查和代表场景浏览器验收已落地。任务保留in_progress：Renderer类型门和全仓门有外部阻断，不归档，不宣称达到项目完整完成定义。

## 实施结果

- 收集弹窗与上传面板按批准稿实现细边框、中性表面、绿色动作、独立目标路径、双页签和分层逐项结果。保持现有API与存储语义，仅延伸Office保存注册的可选能力事实，未改其工具栏。
- URL完整http(s)校验、2000字符、IME/229/repeat保护、同步单飞、busy与260ms交接锁；只展示服务端返回阶段，未知阶段不补成功。卸载后迟到响应刷新库查询但不导航。
- 文件保持串行单文件请求、50MiB边界、任意格式、目录首段和相对路径；无正文原件算成功，空Markdown正文独立说明。整批结束刷新documents/counts/folders，再提供首个成功结果动作。
- 目录整页drop复用UploadPanel内联逐项结果；没有额外打开按钮。宿主同步批次锁防止modal/drop并发。空列表/非Files/非目录范围不发起批次。
- 打开结果走现有未保存保护；守卫期间仅隐藏收集层并保留内容。保存失败不放行，取消后恢复结果与打开动作焦点，不重新抓取/上传。Office提示型保存回调显式声明不可由guard代存，收集专用变体只提供返回编辑器。收集关闭清理专用上下文，不污染普通守卫。

9组源码和测试映射见[实施报告](verification/product-implementation.md)，91项逐项源码落点见[覆盖台账](implementation-coverage.json)。91项是覆盖项，组级回归证据不代表91项均执行了独立GUI测试。

## 视觉与实际交互证据

- 最终浅色URL空值/聚焦与批准稿的17个指定度量一致：弹窗540×323.640625、padding20/24、字段492×34与1px绿色边框且无阴影、输入宽470/14px/22px、label12.5/21.25、页签34、动作56.53125×32及禁用背景/边框/文字色。见[精确度量](verification/product/comparison-metrics.json)。这是该状态的指定度量比较，不是全场景逐像素一致声明。
- 首轮发现并修正AntD双字插空、disabled颜色、label行高、primary阴影/透明边框、空suffix4px占位与窄屏结果动作未全宽。真实鼠标default→hover→leave与键盘focus后矩形完全相同；primary为1px实色边框、无阴影，见hover-geometry-final.json。
- 实际浏览器检查根/目录入口、文件夹预置、空值/无效/有效/清除与来源、等待与extract失败、两文件串行等待/原件成功/部分失败、浅深、390×844、844×480。390px结果动作各342×44且无页面横滚；低高度主体滚动、关闭可达。导航关闭回收集，目录菜单关闭回添加文档。
- 实际笔记临时草稿模拟自动保存失败，再模拟抓取成功，验证480px守卫、真实标题、继续编辑首次焦点、保存失败阻止导航，取消后成功结果仍在并回焦“打开收集的文档”。临时文本已撤销，原正文恢复并保存。
- 捕获/上传及保存失败响应由CDP拦截提供，未制造真实抓取/上传落库成功。非敏感测试夹具存于verification/product/fixtures。拦截已清空、视口已恢复、主题已恢复浅色。

截图、操作说明与边界见[browser-qa.json](verification/product/browser-qa.json)及[视觉证据页](verification/product/comparison.html)。原生目录选择器、OS输入法、读屏/触屏、Electron、真实目录拖放及后端抓取/解析/导入成功未验证；CDP文件拖放能力明确拒绝，未绕过。手动/Office守卫依组件与宿主回归；产品200%大字和长列表未作本轮GUI逐项抽验，不能以原型代替。

## 质量门

| 检查 | 结果 |
|---|---|
| 独立全范围产品审查 | 本模块无遗留代码缺陷；见product-check.md |
| 限定20个源码/测试lint与format | 通过，exit0 |
| AntD CLI三核心组件 | 各0问题 |
| Renderer完整测试 | 59文件/511项通过，vitest run --maxWorkers=4，exit0 |
| Renderer类型 | 失败，仅外部agent-media.check.test.ts:12的Promise.withResolvers/ES2023库TS2550；本模块无诊断 |
| 最终pnpm check | exit1，停在并发小程序及其原型的React refs/purity等lint；后续流水线未执行 |
| 冻结HTML SHA256与限定diff-check | 通过 |

完整日志在verification/product/check-*-final.txt及verification/repo-check-settled.txt。默认高并发测试曾使未修改nav-collapse动态import超过5秒；保留原始失败，不修改超时/断言，以4 worker复跑全套通过。没有排除产品文件、提高TS目标库或降低规则。

## 后续

按功能限定提交本轮代码、回归、规范与验收材料；其它会话的小程序、主题、技能、Office夹具等改动保留。外部质量门修复后重跑pnpm check，通过后才能归档本任务。其余模块仍先交HTML获认可后再实施。
