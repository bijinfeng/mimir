# DOCX 原件保护 P0 独立检查

2026-10-17。按 `docx-protection-refinement-20261017.md` 与 implement.md 批准的 P0 检查；实现者冻结后仅自修保护两个模块及其专项测试。未改 vendor、compare/split、DocxEditor、Agent 或签名实现；未上传/删除文件、提交、暂存、归档、完整构建或全套测试。

## Findings (fixed)

### 原生关系 XML 的未知配置不能降级为无保护

- 文件：`packages/office/src/docx-protection.ts`、`docx-protection.test.ts`。
- 原问题：关系解析先去命名空间前缀，只认一层 `Relationships.Relationship`；嵌套 settings 关系被遗漏后回退到空的常规 settings，实际 `writable=true`。未知 namespace、qualified attrs 和未知 `/settings` 类型则被误当成可信关系，状态没有显示无法判定。
- 修复：复用 preserveOrder namespace-aware 读取，验证 OPC 元素命名空间、直接关系结构、关系 ID、无命名空间属性、明确的 transitional/strict settings 类型、内部唯一目标。异常/嵌套配置直接进入 uncertain 只读，不回退开放；合法别名前缀和 strict 类型保持可识别。
- 复现：`/tmp/mimir-docx-protection-check-before-20261017.log`，新增关系/手势共 5 个失败；其中嵌套关系实际开放写权限。

### 保护节点属性混用会开放异常原件

- 文件：同上。
- 原问题：凭据检查统一忽略两类节点的所有开关，`writeProtection` 携带 `edit/enforcement` 仍可开放推荐选择；未启用的 `documentProtection` 携带 `recommended` 被误判可编辑。
- 修复：分别识别 documentProtection 与 writeProtection 的开关，异常属性保守拒绝；同一展开名的重复属性不允许通过别名前缀覆盖，属性字典无原型。
- 复现：`/tmp/mimir-docx-protection-attributes-before-20261017.log`，2 个新增异常属性用例在修复前失败。

### PM 拒写仍会出现图片的虚假 DOM 修改

- 文件：`packages/office/src/editors/docx-protection.ts`、`DocxEditor.protection.test.tsx`。
- 原问题：guard 漏图片 resize handle，vendor resize/floating handlers 在事务前直接改 DOM。真实东侧手柄拖动使只读图片 box 从无 style 变成 width146px/height96px；单纯断言 PM 与保存拒绝不能发现。
- 修复：补图片手柄 capture；高优先级 mousedown handler 在只读时阻止后续 vendor 预览 handlers，普通文本不 preventDefault。真实拖动回归同时检查手势中/结束 DOM、正文、版本和 dirty。复制和双击选词默认行为保留，NodeView 子编辑激活仍被拦截。
- 复现：同第一份 before log；修复后手柄与图片 body 两种手势通过。

### 公式独立按钮和只读辅助状态

- 文件：同上。
- 原问题：公式原生 `.doc-formula-edit` 使用独立 click，绕过仅有的 dblclick guard，实际发送 `ai-docs-edit-inline-math`。按钮仍呈现可编辑，嵌套文本框缺只读辅助状态。
- 修复：捕获公式 click 并同步按钮 disabled/具体原因 title，文本框同步 aria-readonly。原属性快照放在 plugin 生命周期，避免 PM 重建 plugin view、沿用 NodeView DOM 时把 guard 自己写入的只读属性当原值；推荐明确继续后恢复当前挂载控件。
- 复现：`/tmp/mimir-docx-protection-formula-before-20261017.log`，真实按钮 click 导致编辑事件；恢复缺陷也由实际 Editor 断言与 root 浏览器复现，修复后 live requery 验证 disabled/aria-readonly 恢复。

## Findings (not fixed)

- Agent 原有 4 个 `oxc/no-map-spread` warning 保留，属于既有实现的性能建议；本片不改 Agent 算法。目标 lint 没有 error。
- 没有发现本片 P0 范围内需要保留的行为阻断。P1 comments/forms 受限写、P2 密码核验/管理和 P3 强制修订仍属于明确后续范围，未冒称已实现。
- 浏览器 320/420px、短高度、状态视觉及导出由 root 统一验收；本报告不替代实际浏览器结果。不运行真实模型或 Desktop。

## Verification

- 实际会话链：raw XML/关系→不可变 controller→PM/NodeView/Agent execute/draft/round→session.save；只读 no-op 返回私有原字节，公开 parsed/content/originalBytes 改动、native options 和规范化 part 覆盖不能放宽策略。
- 专项测试：`pnpm --filter @mimir/office test src/docx-protection.test.ts src/editors/DocxEditor.protection.test.tsx src/agent/docx-agent.test.ts src/docx.test.ts --maxWorkers=2`，**4 files / 109 tests passed**；日志 `/tmp/mimir-docx-protection-check-final-20261017.log`。
- Office TypeCheck：**exit0**，`/tmp/mimir-docx-protection-check-tsc-20261017.log`。
- 目标 lint/8-file format/style guard/diff：均 **exit0**，`/tmp/mimir-docx-protection-check-{lint,format,styles}-20261017.log`；lint 原有 4 warnings 如上。
- 规范同步：engine 的保护 P0 合同补严格关系与属性规则；editors pitfalls 补原生 DOM 预览/公式入口、选择复制和状态恢复边界。

主要参考及 WeKnora 适用性沿已核定研究：GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`；WeKnora 网站及固定源码的版本/HTTP 留证见 refinement 文档。后者能力门控原则适用，不作为 DOCX 保护或 Office 工具栏外观依据。

## 附：root 的设计预览生命周期修复独立复核

按 root 追加范围只读核对 `DocxDesignPreview.tsx` 与 `DocxDesignPreview.lifecycle.test.tsx`，没有修改生产或 outline 文件。结论：未发现需要自修的问题。

- 新增的两处 `editor.isDestroyed` early return 分别位于页面底色和边框 effect 的 `editor.view.dom` 访问之前；与已有主题 dispatch/边框 RAF 内的销毁检查一致。正常编辑器的主题、边框和既有 cleanup 路径保持原样，没有用 catch 吞掉预览错误。
- 回归使用真实 Tiptap Editor 和真实 React StrictMode：销毁 Editor 后渲染预览，断言无 React 未捕获错误、不调用 onError、不创建边框层。它证明已销毁实例进入 effect 时安全跳过，不冒称已模拟完整父 useEditor 的销毁/替换过程。
- 已读取 root 原始 before-red 日志 `/tmp/mimir-docx-preview-lifecycle-before-20261017.log`：真实 StrictMode 两次 effect 均在读取 view.dom 时抛错；读取 after 日志 `/tmp/mimir-docx-preview-lifecycle-after-20261017.log`：**2 files / 17 tests passed**。本 checker 没有重跑该组或保护109测试。
- 本 checker 额外对这两个文件执行目标 oxlint 与 oxfmt --check，均 exit0。前述最终 Office tsc0 已包含这些源文件。
