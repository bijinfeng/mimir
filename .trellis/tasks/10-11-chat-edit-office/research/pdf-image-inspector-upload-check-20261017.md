# PDF 图片上传 Inspector 独立检查

2026-10-17 11:43，独立 `pdf_image_upload_ui_check`。按已批准 `pdf-image-inspector-upload-followup-20261017.md` 对照冻结 `pdf-image-inspector-upload-implementation-20261017.md`，检查指定五个图片面板、局部样式及测试文件。已读取 task PRD/design、implement 中本片批准边界，以及项目/Office 编辑器规范。没有新增调研、provider 调用、浏览器操作、全套构建或嵌套 agent。

## Findings (fixed)

- File: `packages/office/src/editors/PdfImagePanel.tsx`
  - Issue: 外部素材仅比较当前字符串 key，旧选择仍保存在父状态。实际生成素材后，来源、页面或目标切走再返回，key 重复；子组件预览已销毁，但底部插入按钮重新启用，可插入不可见旧素材。
  - Evidence: 新增 source/page/target/version 参数化回归，修复前前三项明确失败，version 原已正确禁用。
  - Fix: 外部素材状态保存当前绑定及 selection；绑定变化立即清空 selection，而非仅隐藏旧 selection。采用已有 PdfFormPanel/PdfDrawingCanvas 的 render 时绑定重置模式。自己的成功版本与反馈机制保留。
- File: `packages/office/src/editors/PdfImagePanel.test.tsx`
  - 增加上述四项回归，分别证明预览销毁后主按钮禁用，未调用第二次工具。
  - 加强删除确认 Escape 测试，从真实 portal 确认按钮聚焦后发送 Escape，断言回到主动作且不关闭 Inspector；不再仅从底栏按钮模拟 Escape。

## Reviewed behavior

九类原生操作的参数、真实几何/层次/opacity值与未知原因；本地 File+object URL 准备零工具调用/零 FileReader；固定 section 直属 footer、内容 min-height:0 和内部滚动；读阶段同步 controller 防双击、取消真实 abort 并结算 promise、源/页/目标/version/卸载迟到拒绝；自己的成功重新绑定；只读目标禁用、明确删除确认；图片替换与本地上传真实 host 保存→Undo 保存→Redo 保存原件字节闭环均有针对性行为证明。没有更改 shared Editor/Agent/OCR/preset/vendor 或其他 agent 的文件。

## Findings (not fixed)

- 本片没有剩余代码问题。实际 320px 宽、420×500 的固定底栏位置、长文件名/错误折行、完整工具可达、未配置外部来源与回焦效果，仍由 root 在统一生产构建中验收。组件 DOM 没有真实布局引擎，以上测试不代替该门槛。
- 未运行真实 provider/model；Desktop 按用户选择由用户验收。未运行全仓 `pnpm check`；root 已记录其既有技能 lint 阻断，本片不重复该重型 gate。

## Verification

- Tests: `pnpm --filter @mimir/office exec vitest run src/editors/PdfImagePanel.test.tsx src/editors/PdfEditor.images.test.tsx src/editors/PdfEditor.external-images.test.tsx`，**3 文件 27/27，exit0**；最终轮包含 portal Escape/focus 加强断言。
- TypeCheck: `pnpm --filter @mimir/office typecheck`，**exit0**。首次运行曾被并行 `apps/server/src/services/pdf-text-glyphs.ts:20` 的 ASI 语法错误阻断；已通知 root，对应 owner 修复后重跑通过，本 checker 未改该文件。
- Lint: 四个限定 TSX `pnpm exec oxlint ...`，**exit0**；`antd lint packages/office/src/editors/PdfImagePanel.tsx --format json`，**0 issues**。
- Format: 五文件 `pnpm exec oxfmt --check ...`，**exit0**。
- `git diff --check -- <五文件>`，**exit0**。
- Spec sync: 本片执行现有 PDF 外部图片契约 §16 的素材失效要求，没有改变产品/接口/原生能力，不新增重复 spec 段落。发现与验证证据保留于本报告。

本片源码及测试已冻结，可以进入 root 统一 build/浏览器验收。未暂存、提交、归档、上传或删除文件。
