# PPTX 美化截图草稿浏览器验收

2026-10-17，localhost:5180，测试账号admin@example.com。代码与界面验收，无模型调用；Desktop用户自验。本切片已完成代码、独立检查与浏览器验收，整体任务仍未完成。

## 真实PNG与未保存画布

已有测试文档 `MsyG7Y26t0yAs1IP`，8页，第一页面积比例4:3。「开始→AI编辑→美化本页」生成真实PNG并打开问AI，不自动发送。原始PNG `/tmp/pptx-ai-browser-snapshot-20261017.png` 1280×960、45027bytes；侧栏缩略图85.33×63.98，保持4:3。

手动将第一页背景改为FFF9E6并应用，不保存库，再点美化；新PNG `/tmp/pptx-ai-browser-unsaved-20261017.png` 1280×960、45996bytes。Pillow读取右下像素由255/255/255变255/249/230，证明截图来自当前未保存画布。源内容图像和文字也在PNG；不含工具条或选择框。像素记录 `/tmp/pptx-ai-browser-pixels-20261017.json`。临时背景随后撤销并reload，没有将测试修改保存到库。

## 目标与发送交互

- 无模型时草稿/PNG可见，发送点击和Enter均明确拒绝，图文保留，不声称真实模型美化。
- 换到第2页发送第1页截图，显示「截图对应的文档、页面或版本已变化，请重新点击“美化本页”」。回到内容/版本未变的原第1页时重新通过页面核验，随后仍被无模型门控拒绝；没有将图绑定到新页。
- 内容版本改变再撤销后，旧截图仍按版本拒绝；没有用JSON相等重新freeze旧版本。
- 附件完成后可改指令，后续渲染保留用户文字。移除截图保留文字，恢复普通提问入口。
- 浏览器发现移除截图后仍显示旧的截图专用错误提示，checker修复并补先红后绿回归及普通transport错误保持。最终build后真实420×500「自定义指令→发送拒绝→移除截图」复验图片和专属alert/关闭提示均消失，文字保留。
- 取消/迟到/排队/停止/重试与真实HTTP路由由实际Editor/Chat专项覆盖，没有用隐藏浏览器handle执行工具或伪造模型。

## 布局实证

1280×720：问AI侧栏400px，缩略图紧凑真实比例，textarea内滚，模型入口/发送可达。有效截图 `pptx-ai-snapshot-wide.jpg`。

实际420×720：document.scrollWidth420，侧栏覆盖且标题/关闭可见，图像85.33×63.98，发送框x361–393/y655–687。有效截图 `pptx-ai-snapshot-accepted-420.jpg`。

实际420×500：自定义短指令58px两行，发送y435–467，截图/移除/模型提示/模型选择均可见。有效截图 `pptx-ai-snapshot-accepted-short.jpg`。其余背板尺寸失配图不是验收证据；同尺寸reload后再截图获得正确比例。

全部截图目录 `/Users/admin/.codex/visualizations/2026/10/16/01a142b8-e543-7780-8181-44e1e0f94f51/`。验收tab31由原DOCX墨迹页复用于PPTX，原tab29保留；实际尺寸以各页DOM为准，不能只凭browser全局viewport设置推断。

## 门禁及边界

实施Office24/24、Chat39/39、Server18/18及四包类型/目标静态通过。独立checker修复过期排队截图失败覆盖用户新草稿：真实HTTP先红，修后Chat40/40、最终专项3/3、Office24/24、Server18/18、四包类型/静态通过，报告 `pptx-ai-screenshot-check-20261017.md`。最后移除错误提示专项Chat41/41及types/static通过，报告已续记。最终统一Webbuild exit0，日志 `/tmp/mimir-toolbar-compare-snapshot-final-web-20261017.log`，覆盖最终PPTX/Chat生产以及PDF checker书签和错误序号补修。

截图只在当前会话有界内存保存，不声称刷新恢复历史图片；保留纯文字历史。真实视觉模型调用未验，不以草稿成功替代。全仓技能lint480既有阻断、全Office前次1657通过/1失败事实不变，任务in_progress。
