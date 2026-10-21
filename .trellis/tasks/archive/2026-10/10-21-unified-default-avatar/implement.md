# 实施与验证

1. 读取 package spec，保存真实 avatar 入口 baseline。遵循用户直接打磨授权。
2. 实现统一矢量默认用户图案与必要的小程序本地图片，保留布局和图片优先。
3. renderer 使用统一回退，小程序接入同一图形。初始为并行account页面提供旧HEAD兼容的32px最小版本（已标为历史）；在并行工作提交 `2991795` / `c06f843` 后，对齐最新HEAD的48px View资料卡，只替换首字母回退。最终owned manifest直接复制account，不再使用override，旧版本/对比保留在历史目录。
4. 真实组件同内容/主题/尺寸对比及必要的回退行为测试；图片失败必须实际触发验证。
5. 独立检查代理审查，干净 task-only 临时副本使用实体离线依赖运行原 pnpm check 及相关生产构建；不再使用依赖跨根软链导致 Vite PDF worker 拒绝。
6. 更新头像的唯一设计合同，提交仅本任务变更，归档任务与日志。

验证需要完整 pnpm check、renderer 测试与 web/desktop 构建；miniapp test/typecheck/build 及本地图片产物。已知管理工作树中的 DOCX fixture 可能被环境改写，若出现，使用临时源码实体副本及 Git blob 原 fixture 验证，不改测试或安全规则。
