# PDF 文字参数生产浏览器验收（进行中）

2026-10-17，root；实际 localhost:5180，12:32 冻结批次生产构建。测试账号 admin@example.com；无模型或 Desktop 验收。文档 `7D___MGkpGDrPqFA`，保留测试件。

## 已通过的原生标注

原样本 `/tmp/mimir-pdf-text-parameters-browser-20261017.pdf`（3571 B），四页 Rotate 0/90/180/270、CropBox [20,30,580,760]，每页两个重复 marker，含 Helvetica/粗体/图片/线条。

实际 UI 添加并保存：第一页部分文字 marker、全部匹配、高亮 #123456 共2处；第二页首处下划线 #AD2288 共1处；第三页首处删除线 #22AA66 共1处；第四页全部高亮 #CC5522 共2处。原件下载回读 `/tmp/mimir-pdf-text-browser-markup-20261017.pdf`（5989 B）。pypdf 独立验证 Subtype、C、数量和 QuadPoints；首页两框分别 [106.147995,419.832001,142.687988,428.615997]、[386.14801,419.832001,422.687988,428.615997]。四页文字提取与原件完全相同，Rotate/CropBox 保留。

实际纸面截图 `pdf-text-markup-270-production-1280.jpg` 已查看。以上不代表标注保存后 Undo/Redo 已验。

## 待修复：待保存文字拖动永久忙碌

420×500 Inspector 草稿已实际查看 `pdf-text-insert-draft-production-420.jpg`。新插字 `Toolbar native text wraps across several lines.`，Times、18 pt、160 pt 宽、center、bold/italic、#335599；初始页1 x200/y36，实际换行为约61 pt 高。

1280×800 实际鼠标将文字从屏幕 (650,245) 拖到 (690,285) 后，保存/撤销/重做及全部内容工具持续禁用。关闭 Inspector 后仍无法结束；未保存本段新插字。已保存的上述标注不受影响。

源码证据：PdfEditor.tsx 的 retainedSources 仅保留 currentBytes/imports，遗漏 activePendingText.base。首次插入替换 currentBytes 后，pdf-render.ts retainPdfDocuments 淘汰旧 base；replayPdfPendingText 再 loadPdfDocument(base) 时，新代理因不在保留集合而被立即 destroy，随后 getPage 可能永久不返回。现有 content 测试将 retainPdfDocuments mock 为无操作，不能覆盖真实生命周期。

修复边界：保留待编辑 base 的正确生命周期，并核对尚未发布的物化页面/批次字节是否需要请求级保留；补真实缓存淘汰回归。取消/换源须结束忙态并拒绝迟到发布，不能用延长测试等待或跳过拖动验收代替修复。完成后独立 check，再统一构建并重验插字、拖动、宽度、对齐、保存、history 和原生纸面。

当前结论：标注原生保存已过；插字拖动失败，PDF 文字整体生产验收尚未通过。

## 生命周期修复交接（尚非浏览器通过）

`pdf_pending_retention` 已完成代码修复：稳定保留活动 pending.base，并为物化插字/批次 geometry/replay 提供独立请求 pin、可取消 await 和回收。真实缓存回归先复现 3 秒不结算，再修复通过；实现与门禁见 `pdf-text-retention-implementation-20261017.md`。本段未操作生产浏览器；当前拖动失败结论须待 root 统一构建后实际复验更新。

## 最新生产构建复验（13:10 后批次）

生命周期独立检查18文件141项通过后，root使用 `/tmp/mimir-toolbar-lifecycle-web-20261017.log` exit0构建实际复验，旧失败保留作历史。

- 重建上述插字；真实鼠标650,245→690,285后正常结束busy，原生显示坐标224.8888889/60.8934356，字体/18pt/粗斜体/颜色保持。
- 换行手柄853.5625,341.171875→813.5625,341.171875，宽160→135.111111pt，正常完成；面板改右对齐并应用。
- 实际420×500面板x100/y156/w320/h317.36，无页面横溢出；固定更新按钮y433.36–457.36，body内部滚动。截图 `pdf-text-final-420.png`。
- 保存原件至 `/tmp/mimir-pdf-text-browser-insert-final-20261017.pdf`（22616B，使用只读鉴权原件fetch，不声称浏览器下载）。独立pypdf显示TimesNewRomanPS-BoldItalicMT、18pt、RGB .2/.33333334/.60000002，三行 Toolbar native / text wraps across / several lines.；四页Rotate/CropBox及原文字保持。
- 保存后四步Undo/save回到原标注基线，5989B且cmp逐字节相等；四步Redo/save回到22616B插字结果，cmp逐字节相等。
- 重新加载后真实纸面正确显示三行右对齐粗斜Times，截图 `pdf-text-final-reopen-1280.png`。

当前插字手势/换行/对齐/保存/保存后UndoRedo/重开已通过；生命周期取消/换源/迟到及原子性由独立真实缓存与Editor回归证明。未声称本轮另做浏览器取消中断或真实模型调用。
