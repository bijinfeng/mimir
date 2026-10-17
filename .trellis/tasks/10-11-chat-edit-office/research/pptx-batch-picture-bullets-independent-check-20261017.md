# PPTX 批量图片项目符号独立检查

2026-10-17。checker `/root/r3_bullets_independent_check`。**本片代码/定向独立检查 PASS，未发现生产缺陷；实际生产浏览器及最终全仓门禁由 root 完成。**

## 依据与范围

已读原生role上下文、PRD/design/implement、项目quality/rules、Office engine/editors相关合同、专项plan与implementation。固定GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 的批量picker→selectedIds→setParagraphFormat作为编辑语义依据。WeKnora缓存 v0.8.3 / `3e22822c1d2397be730c458c7539d0eb8c113a24`（siteSHA `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe`、definitionsSHA `3aae03dc09c5c5261e71df3e9ee4fba9ad457cf632c817e4ea7ae1312f5bcae0`）只支持KB/Agent能力门控参考，没有新的远程HTTP核验声称。

4个专属生产文件检查前后与owner SHA exact，日志 `/tmp/mimir-pptx-picture-bullets-independent-freeze-check-20261017.log`：

```text
58c707a35efe74af305715be146d7063f33ea17e624e2a99a5dee682b039aa41  packages/office/src/editors/pptx-selection.ts
c006d5741731e6ce18ad7897301b7d2f058947154b4081286397e4b0fa20725a  packages/office/src/editors/PptxSelectionControls.tsx
3c0b8bf1b6c95bffc7de454ea887fade236eed0b8d1a9e6eadf8798991e55543  packages/office/src/editors/PptxSelectionFormatFields.tsx
a7f0238ac787026e92c8a5a947844c02dd1b859106a8dea9d461b1c5a6175c47  apps/server/src/services/pptx-picture-bullet.ts
```

共享 `apps/server/src/services/pptx-agent-host.ts` 仅按import/helper调用符号审查，保留media owner attachments工作；检查时整文件SHA `5eb594b87f848af1f4efd6db21210dd0fd3a160ab2baf203b188cd2c1bd58377` 只标识实际检查快照，不限制后续owner的合法共享改动。

## Findings (fixed)

无生产或机械问题需要修复，未修改本片生产代码或测试。以下测试已由checker独立实际执行并结合真实路径审查。

## 核对结论

- `pptxSelectionFormatOps` 对全部原refs完整解析，失效、非文字、深层组或不支持的组成员整批拒绝；不会先过滤后只改部分。一个ops批次进入一个host候选/版本/history，顶层和直接组成员沿现有nativewriter。
- `preflightPptxPictureBullets` 在runPptxHostTxn之前逐项schema/目标校验，复用图片真实内容读取、PNG CRC/JPEG完整解码，512KiB/400万像素边界；有效首图+坏末图/失效末目标均拒绝而不落部分字节。已有图片仅调size/悬挂等不带bulletImage时保留原图路径。
- PNG/JPEG各自同时覆盖2顶层+2组成员、每目标2段。每段原生blip的embed→slide rel→真实media字节一致；组成员保真从父组groupChildSlices取XML，未使用空child.anchor冒充原文。未知pPr/tabLst/opaque扩展、非目标对象、所有其他原ZIP部件保留。
- 真实handle/session/history保存、commit、重开/二次保存、一次Undo/Redo原生部件均通过。有效候选已生成后abort/version变化/dispose均零发布，人工稿保持、无onChange/history。
- FileReader草稿绑定source+slide及version+selectedRefs的实际key，身份变化卸载先废弃reader再abort，迟到load不能复活；同步read抛错和error/abort可恢复。读图只准备零dirty，读取中禁用唯一主动作；失败保留草稿，原图混合状态和文件名可读。
- `PptxSelectionControls` 固定footer只有“应用对象格式”，沿既有320px内部滚动和Escape/回焦路径；组件测试没有替代1280/420真实视觉验收。engine现行批量图片符号契约已同步，无额外spec drift。

## Verification

| Gate | 实际结果 | 日志 |
| --- | --- | --- |
| Office真实host/native/Editor/reader/selection/Agent | **6 files / 69 passed，0 failed，0 skipped，exit0** | `/tmp/mimir-pptx-picture-bullets-independent-tests-20261017.log` |
| Office TypeCheck | PASS exit0 | `/tmp/mimir-r3-independent-office-types-20261017.log` |
| Server TypeCheck | PASS exit0 | `/tmp/mimir-r3-independent-server-types-final-20261017.log` |
| 9文件oxlint --deny-warnings | PASS exit0 | `/tmp/mimir-pptx-picture-bullets-independent-lint-20261017.log` |
| 同9文件oxfmt --check | PASS exit0 | `/tmp/mimir-pptx-picture-bullets-independent-format-20261017.log` |
| scoped diff check | PASS exit0 | `/tmp/mimir-pptx-picture-bullets-independent-diff-20261017.log` |

实际命令：`cd packages/office; node_modules/.bin/vitest run src/editors/pptx-picture-bullets.test.ts src/editors/pptx-selection.test.ts src/editors/PptxSelectionControls.test.tsx src/editors/PptxEditor.multi-selection.test.tsx src/editors/PptxEditor.selection-tools.test.tsx src/agent/pptx-agent.test.ts`。直接调用已安装bin，无install。

## Findings (not fixed)

没有未修复的本片生产问题。未执行root负责的Webbuild/全repo门禁/真实1280×800与420×500浏览器、OS文件picker最终视觉、Desktop或真实provider。不能以69tests通过声称整体所有工具完成。root须使用固定浏览器fixture和PNG/JPEG验收每段native、保存下载/UndoRedo/reload和窄高滚动/固定primary/Escape回焦。

未修改vendor、manifest/lock或media owner生产；未暂存/提交/归档/上传/删除测试件。
