# 第七版渡鸦接入验收

- 用户批准的 SVG 与产品主源逐字一致，SHA-256 为 `54625fa21ea5aba444d1d1a31bf347db1e068a39770991f51cac0f45d2bde515`。
- AC1–AC3：四端资源及入口覆盖、13 个输出、幂等、容器目录、圆形安全区与眼部镂空均通过；详见 `docs/visual-comparisons/2026-10-21-brand-icon/README.md`。
- AC4：真实组件 20 张前后截图及离线 HTML 已归档，明暗、窄屏、导航/标题栏/官网/登录/桌面选择页与 Taro H5 均有证据。
- 原 `pnpm check` 在 `/private/tmp/mimir-icon-full-verification` 以退出码 0 通过，测试及安全规则未更改；Web、桌面、小程序生产构建通过。两次验证工作树全检失败与最终隔离通过的边界见 `verification/clean-check.md`。
- AC5：主会话只提交本任务变更；小程序 ui/login/scss 按已复核品牌差异暂存，不混入并行 NutUI 迁移。提交号记录在 task.json 与会话日志。
- 未测试原生安装后的系统图标缓存、fnOS 真机、微信开发工具/真机。未推送、发布或上传后台头像。
