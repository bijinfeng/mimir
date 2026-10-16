# 本轮工具栏补全提交计划

日期：2026-10-16。仅包含本轮已核对的编辑器实现与记录。以下未识别脏文件均不暂存。

## Commit 1

feat(office): extend six-format editor toolbar actions

-  M apps/server/src/routes/conversations.ts
-  M apps/server/src/services/pdf-agent-host.ts
-  M apps/server/src/services/pptx-agent-host.ts
-  M apps/server/src/services/xlsx-agent-catalog.ts
-  M apps/server/src/services/xlsx-agent-host.ts
-  M apps/server/src/test/pdf-agent-host.test.ts
-  M apps/server/src/test/pdf-agent-route.test.ts
-  M apps/server/src/test/pptx-agent-host.test.ts
-  M apps/server/src/test/xlsx-agent-host.test.ts
-  M packages/office/src/agent/docx-agent.test.ts
-  M packages/office/src/agent/docx-agent.ts
-  M packages/office/src/editors/DocxEditor.tsx
-  M packages/office/src/editors/HtmlEditor.test.tsx
-  M packages/office/src/editors/HtmlEditor.tsx
-  M packages/office/src/editors/MarkdownEditor.tsx
-  M packages/office/src/editors/PdfEditor.content.test.tsx
-  M packages/office/src/editors/PdfEditor.tsx
-  M packages/office/src/editors/PptxEditor.test.tsx
-  M packages/office/src/editors/PptxEditor.tsx
-  M packages/office/src/editors/XlsxEditor.test.tsx
-  M packages/office/src/editors/XlsxEditor.tsx
-  M packages/office/src/editors/docx-toolbar-render.test.tsx
-  M packages/office/src/editors/editors.css
-  M packages/office/src/editors/markdown-slash.ts
-  M packages/office/src/editors/pdf-text.test.ts
-  M packages/office/src/editors/pdf-text.ts
-  M packages/office/src/editors/pdf-toolbar-render.test.tsx
-  M packages/office/src/footnotes.ts
-  M packages/office/src/pagination.ts
-  M packages/office/src/shell/shell.css
-  M packages/office/src/xlsx.test.ts
-  M packages/office/src/xlsx.ts
-  M packages/renderer/package.json
-  M packages/renderer/src/components/ContentTypography.style.ts
-  M packages/renderer/src/components/document/MarkdownBody.test.tsx
-  M packages/renderer/src/components/document/OfficeSourceEditor.tsx
-  M packages/renderer/src/editor/extensions.ts
-  M packages/renderer/src/editor/markdown-save.test.tsx
- ?? packages/renderer/src/editor/math-block.test.ts
- ?? packages/renderer/src/editor/math-block.ts
-  M packages/renderer/src/lib/api.ts
-  M packages/shared/src/document-agent.ts
-  M packages/shared/src/index.ts
- ?? packages/shared/src/pdf-agent.ts
-  M pnpm-lock.yaml

## Commit 2

docs(office): record toolbar coverage and limits

-  M .trellis/spec/office/frontend/editors/pitfalls.md
-  M .trellis/spec/project/decisions.md
-  M .trellis/tasks/10-11-chat-edit-office/research/implementation-tracker.md
-  M .trellis/tasks/10-13-html-agent-manual/research/html-capability-matrix.md
-  M .trellis/tasks/10-13-markdown-agent-manual/research/capability-matrix.md
-  M .trellis/tasks/10-13-pdf-agent-manual/research/capability-matrix.md
-  M .trellis/tasks/10-13-pptx-agent-manual/research/capability-matrix.md
-  M .trellis/tasks/10-13-xlsx-agent-manual/capability-matrix.md
- ?? .trellis/tasks/10-16-genoffice-editor-capability-audit/check.jsonl
- ?? .trellis/tasks/10-16-genoffice-editor-capability-audit/implement.jsonl
- ?? .trellis/tasks/10-16-genoffice-editor-capability-audit/prd.md
- ?? .trellis/tasks/10-16-genoffice-editor-capability-audit/research/commit-plan.md
- ?? .trellis/tasks/10-16-genoffice-editor-capability-audit/research/toolbar-assessment.md
- ?? .trellis/tasks/10-16-genoffice-editor-capability-audit/task.json

## 未识别脏文件（不纳入提交）

-  D .agents/skills/frontend-design/LICENSE.txt
-  D .agents/skills/frontend-design/SKILL.md
-  D .claude/skills/frontend-design
-  M .codex/hooks.json
-  D .trae/skills/frontend-design
-  D .trae/skills/ui-animation
-  D .trae/skills/ui-ux-pro-max
-  D .trae/skills/web-design-guidelines
-  M .trellis/spec/project/design.md
-  M .trellis/spec/renderer/frontend/theme/pitfalls.md
-  D .zcode/plans/plan-sess_9b220fb8-0eaa-439f-ac2e-9631ac54946a.md
-  D .zcode/skills/frontend-design
-  D .zcode/skills/ui-animation
-  D .zcode/skills/ui-ux-pro-max
-  D .zcode/skills/web-design-guidelines
-  M apps/desktop/public/favicon.svg
-  M apps/desktop/resources/icon.icns
-  M apps/desktop/resources/icon.ico
-  M apps/desktop/resources/icon.png
-  M apps/desktop/scripts/make-icons.ts
-  M apps/desktop/src/main/index.ts
-  M apps/desktop/src/renderer/index.html
-  M apps/desktop/src/renderer/setup.html
-  M apps/web/index.html
-  M apps/web/public/favicon.svg
-  M packages/renderer/src/components/library/LibraryView.style.ts
-  M packages/renderer/src/components/library/LibraryView.tsx
-  M packages/renderer/src/components/list-helpers.test.ts
-  M packages/renderer/src/components/list-helpers.ts
-  M packages/renderer/src/theme/customToken.ts
-  M packages/renderer/src/theme/design.test.ts
-  M packages/renderer/src/theme/tokens.ts
-  D skills/frontend-design
- ?? .agents/skills/impeccable/
- ?? .claude/agents/
- ?? .claude/settings.local.json
- ?? .claude/skills/impeccable/
- ?? .github/agents/
- ?? .github/hooks/
- ?? .github/skills/
- ?? .pnpm-store/
- ?? apps/desktop/.impeccable/
- ?? apps/desktop/PRODUCT.md
- ?? apps/web/.impeccable/
- ?? apps/web/DESIGN.md
- ?? apps/web/PRODUCT.md

确认后才依次暂存上述两个 Commit 的文件；不 amend、不 push。
