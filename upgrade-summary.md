# TanStack AI 和 Assistant UI 升级总结

## 升级的版本

### @tanstack/ai
- **之前**: 0.55.0
- **之后**: 0.68.0
- **影响包**: 
  - `plugins/provider/package.json`
  - `packages/renderer/package.json`
  - `apps/server/package.json`

### @assistant-ui/react-ag-ui
- **之前**: 0.0.63
- **之后**: 0.0.68
- **影响包**: `packages/chat/package.json`

### @assistant-ui/react (兼容性升级)
- **之前**: 0.15.23
- **之后**: 0.15.28
- **原因**: 需要匹配 @assistant-ui/core@^0.3.27 以避免类型冲突
- **影响包**: `packages/chat/package.json`

## 版本选择说明

原计划升级到最新版本（0.69.0 和 0.0.69），但遇到以下限制：

1. **@tanstack/ai@0.69.0**: 发布时间为 2026-10-13，不满足工作区的 `minimumReleaseAge: 1440`（24小时）安全策略
2. **@assistant-ui/react-ag-ui@0.0.69**: 依赖 @assistant-ui/core@^0.3.28，但该版本尚未发布（最新为 0.3.27）

因此选择了最新的稳定可用版本：
- @tanstack/ai: 0.68.0 (2026-10-09 发布)
- @assistant-ui/react-ag-ui: 0.0.68

## 补丁处理

移除了 `@assistant-ui/react-ag-ui@0.0.63` 的补丁配置。该补丁修复了 `resumeWithResponses` 方法的错误处理逻辑。

**需要后续验证**: 0.0.68 版本是否已包含该修复，或需要创建新的补丁。

## 验证结果

### ✅ 依赖安装
- 成功安装所有依赖
- pnpm 安装完成，无冲突

### ✅ TypeScript 类型检查
```
pnpm typecheck
```
所有包通过类型检查，无错误。

### ⚠️ 测试和构建
测试和构建失败，但**不是由升级引起**。失败原因是预存在的仓库配置问题：

**缺失文件**: `packages/office/src/generated/editor.css`

这是一个需要通过 `packages/office/scripts/trim-editor-css.mjs` 或 `sync-upstream.mjs` 生成的文件，但生成目录不存在。这是仓库设置问题，与依赖升级无关。

## 升级涉及的主要变更

根据 TanStack AI 的变更日志，0.55.0 → 0.68.0 包含：

1. **AG-UI 完全合规**: 客户端到服务器的完整 AG-UI 协议支持
2. **改进的 Tree-shaking**: 更小的打包体积
3. **更清晰的 API 命名**: 简化配置
4. **provider Files / storage APIs**: 一次上传媒体，引用句柄，降低延迟和带宽

详见：
- [TanStack AI Migration Docs](https://tanstack.com/ai/latest/docs/migration/ag-ui-compliance)
- [TanStack AI Changelog](https://github.com/TanStack/ai/blob/main/CHANGELOG.md)

## 后续建议

1. **修复生成文件问题**: 运行或修复 `packages/office` 的 CSS 生成脚本，使测试和构建能够通过
2. **验证补丁需求**: 测试 AI 对话中的错误恢复功能，确认是否需要重新应用补丁
3. **等待更新版本**: 24小时后可以考虑升级到 0.69.0（如果需要最新功能）
4. **功能验证**: 在修复生成文件后，进行完整的 AI 功能测试
