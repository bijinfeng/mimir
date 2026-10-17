<!-- TRELLIS:START -->
# Trellis Instructions

These instructions are for AI assistants working in this project.

This project is managed by Trellis. The working knowledge you need lives under `.trellis/`:

- `.trellis/workflow.md` — development phases, when to create tasks, skill routing
- `.trellis/spec/` — package- and layer-scoped coding guidelines (read before writing code in a given layer)
- `.trellis/workspace/` — per-developer journals and session traces
- `.trellis/tasks/` — active and archived tasks (PRDs, research, jsonl context)

If a Trellis command is available on your platform (e.g. `/trellis:finish-work`, `/trellis:continue`), prefer it over manual steps. Not every platform exposes every command.

If you're using Codex or another agent-capable tool, additional project-scoped helpers may live in:
- `.agents/skills/` — reusable Trellis skills
- `.codex/agents/` — optional custom subagents

Managed by Trellis. Edits outside this block are preserved; edits inside may be overwritten by a future `trellis update`.

<!-- TRELLIS:END -->

## 提交节奏

每轮实现与验收完成后，及时提交本轮相关代码、测试和规范记录，避免跨轮积累未提交改动。按功能组织提交，只纳入当前任务的改动；不混入其他会话或用户的未完成工作。提交前检查差异与质量门，提交后记录 commit。推送仍按用户要求执行。

## 测试账号

统一使用以下凭据进行登录测试（与 `.env` 的 `OWNER_EMAIL` / `OWNER_PASSWORD`、`apps/server/src/test/helpers.ts` 的 `TEST_USER` 保持一致）：

| 字段 | 值 |
|---|---|
| 邮箱 | `admin@example.com` |
| 密码 | `12345678` |
| 用户名 | `admin` |

新增测试、验证脚本或手动验证时必须使用此账号，不要自行创建其他账号。

## Research reference

For every research task in this project, check [WeKnora](https://weknora.weixin.qq.com/) and its [public source](https://github.com/Tencent/WeKnora). Record the version and concrete evidence, then explain how it applies to Mimir or why it does not. Choose the main reference by domain: WeKnora for the knowledge base and Agent, Obsidian for page layout and visual style, and Office for the web, Google Docs, and GenOffice for file editing. Do not use WeKnora's Markdown editor as the primary model for Office toolbars.
