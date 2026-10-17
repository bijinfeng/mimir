# PPTX 直接组合图片独立检查（2026-10-17）

## 结论与边界

独立检查 shared 私有 manual_picture 合同 → guarded Agent handle → server 工作副本 → 原生直接 slice/父组合 XML → manual-asset → actual Editor/历史。代码与目标专项检查通过，产品源码已冻结交 root 构建。真实生产浏览器 1280/420、矮视口、下载与去背景编码仍由 root 完成；本报告不代表浏览器验收已通过。

沿用 `pptx-group-picture-next-20261017.md` 和实施报告已固定的参考：GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`；WeKnora v0.8.3 / `3e22822c1d2397be730c458c7539d0eb8c113a24` 仅适用能力/权限真实绑定，不适用 Office 图片工具布局。本轮属于实施独立检查，没有重新联网调研，不将既有网络证据写成重新抓取成功。

## 检查与局部修正

- 确认原生 helper 要求唯一顶层父组、唯一直接普通图片模型及 nvId slice、唯一完整 blipFill/blip；深层、媒体封面、兼容分支和歧义 XML 在媒体添加前拒绝。父 anchor 与子 anchor/模型同时发布，完整 slide 前后 XML 参与资源清理，没有解组/重组或 vendor 修改。
- 确认 opacity/crop 私有输入严格校验，noop 不增版本；服务器在新 open 的工作副本完成修改和 ZIP preflight，session.replaceFromHost 为唯一发布点。keepCrop 使用原媒体真实尺寸；普通替换默认清裁切。
- 修正一个实际 UI 缺口：面板原来只显示图片名，新增父组名接缝，显示「组合名 › 图片名」。actual Editor 断言真实 fixture 为「组合图片验收 › 产品图片」，保持原有布局、换行及字重。
- 新增实际 Editor 的迟到素材结果回归：上传宿主已产生原生响应后切到第二页，request signal 被取消；迟到响应不发布，version=0、保存禁用、撤销禁用、当前页仍为第二页。
- 新增跨页媒体保真回归：删除第一页组外共享图片，使原图在替换后只由另页引用；使用实际不同像素的有效 PNG 替换目标。原媒体、新媒体字节正确，第二页 XML/rels 与所有非允许 entry 精确不变，再次保存稳定。初版测试使用同一 PNG 命中了引擎正确的媒体去重，改为不同像素后验证真正的跨页资源保留；这不是产品缺陷。

## 本检查者修改的文件

- `packages/office/src/editors/PptxGroupPictureControls.tsx`：groupName 与目标路径显示。
- `packages/office/src/editors/PptxEditor.tsx`：从父组选取真实名称的局部 prop 接缝。
- `packages/office/src/editors/PptxGroupPictureControls.test.tsx`：fixture 补 groupName。
- `packages/office/src/editors/PptxEditor.group-picture.test.tsx`：路径断言、切页取消迟到资产回归。
- `apps/server/src/test/pptx-group-picture-host.test.ts`：跨页唯一共享媒体回归。
- 本报告。其余实施文件只读检查，没有恢复共享工作区修改。

## 实际验证

- Office **4 文件 27/27**：`PptxGroupPictureControls.test.tsx`、`PptxEditor.group-picture.test.tsx`、`PptxEditor.selection-tools.test.tsx`、`pptx-selection.test.ts`。日志 `/tmp/mimir-pptx-group-picture-check-office.log`。注意源码中不存在 `PptxEditor.group-selection.test.tsx`；最终命令使用真实 `pptx-selection.test.ts`，没有把未匹配路径计作通过。
- Server **2 文件 28/28**：新片18 + 既有 group-flip10。日志 `/tmp/mimir-pptx-group-picture-check-server.log`。仅变量/expect lint 收口后新片 **18/18** 再绿，`/tmp/mimir-pptx-group-picture-check-server-final.log`。
- shared、Office、Server `tsc --noEmit` 均退出0：`/tmp/mimir-pptx-group-picture-check-{shared,office,server}-types.log`。
- 15个本片 TS/TSX 文件 oxlint 零警告/错误；16个 TS/TSX/CSS 文件 oxfmt check 通过，最终测试文件另行格式化/check通过。日志 `/tmp/mimir-pptx-group-picture-check-{lint,format}.log`。
- 修改控件和 Editor 测试分别 `antd lint --format json`，issues=[]、partial=false：`/tmp/mimir-pptx-group-picture-check-antd-{controls,editor-test}.log`。
- 局部 git diff check 通过；局部 CSS 无反引号。未跑全量 Office、Web build 或全仓 pnpm check；全仓已知 bundled skill 脚本 lint 阻塞不在本片重复处理。

## 剩余限制

直接普通成员、PNG/JPEG、数值裁切范围不变。深层、兼容分支、媒体封面、组内画布裁切与新增图片格式仍需独立合同。没有真实模型调用（用户已选择先完成代码/浏览器），Desktop 用户自行验收。没有暂存、提交、归档、上传或删除测试文件。

## 生产浏览器反馈：预览比例局部修正

root在1280/420生产浏览器验收发现：frame指定1.5比例，但全宽与独立max-height180/min-height80竞争，实际得到298×178，导致图片裁切预览变形；原inline还把真实比例钳为0.3–3。按root委派只修此处，没有重设计面板或改Shell宽度。

- 新增纯helper `editors/pptx-group-picture-preview.ts`：保留真实宽高比，按180px高换算maxWidth，异常尺寸回退有限1.5比例。
- `PptxGroupPictureControls.tsx` 绑定helper；CSS使用width100%、heightauto、align-self:center，去掉独立min/max-height；等效内描线不挤占图片百分比区域，只有无图/加载错误空态保留80px最小高度。footer、内部滚动、字段和保存链路保持。
- `pptx-group-picture-preview.test.ts` 11项：240×160在298px容器为270×180，在210px为210×140；20:1横图为298×14.9；1:20竖图为9×180；异常/无穷/溢出尺寸有限回退。控件测试确认真实style绑定。
- Office 3文件 **23/23**（纯几何11、控件8、actual Editor4），Office `tsc --noEmit`、4TS目标oxlint、5文件oxfmt、控件antd issues=[]及diff/styles检查通过。日志 `/tmp/mimir-pptx-group-picture-preview-{tests,types,lint,format,antd}.log`。初次控件断言因happy-dom将CSS数字1.5序列化为`1.5 / 1`失败，改按数值检查后通过，没有将序列化差异当作产品错误。
- 本次共修改5个产品/测试文件及本报告；未跑fullbuild，已冻结交root统一最终生产构建和实际尺寸复验。root已报告appearance/cutout两组native history全entry精确保真，本检查者没有重复其浏览器工作。
