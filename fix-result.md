## 漏洞修复完成

已成功修复 source-map-js v1.2.1 中的事件循环 DoS 漏洞 (GHSA-68fv-2mgg-jv7q)。

## 变更内容

- ✅ 将 source-map-js 从 1.2.1 更新到 1.2.2（修复版本）
- ✅ 将 vite 从 8.3.0 更新到 8.3.4
- ✅ 通过类型检查验证

## 验证结果

### 1. 漏洞已修复
```bash
pnpm list source-map-js --depth=Infinity
```
确认 source-map-js 现在是 1.2.2 版本（修复版本，要求 ≥1.2.2）

### 2. 类型检查通过
```bash
pnpm run typecheck
```
所有包的 TypeScript 类型检查均通过，包括：
- packages/office, shared, tokenizer, core, chat
- plugins/capturer, parser, provider, storage, leg
- packages/renderer
- apps/server, web, desktop

### 3. 依赖更新成功
通过 `git diff pnpm-lock.yaml` 确认：
- vite: 8.3.0 → 8.3.4
- source-map-js: 1.2.1 → 1.2.2
- 所有相关依赖链已更新

## 技术细节

通过运行 `pnpm update vite@latest -w` 和 `pnpm update postcss@latest -w`，pnpm 自动解析了依赖树并将 source-map-js 从漏洞版本 1.2.1 更新到安全版本 1.2.2。

虽然 vite 和 postcss 不是直接依赖（使用 catalog 管理），但 pnpm 更新了 lockfile 中的解析版本，成功修复了漏洞。

## 提交信息

- Commit: 64277e5
- 分支: agent/mika/mimi-16
- 已推送到远程仓库

## 下一步

创建 Pull Request：
```bash
访问: https://github.com/bijinfeng/mimir/pull/new/agent/mika/mimi-16
```

或手动创建 PR 合并到 master 分支。
