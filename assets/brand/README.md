# Mimir 品牌资源

`mimir-mark.svg` 是用户批准的第七版渡鸦原始路径，64×64，evenodd 镂空。
`brand.json` 是品牌展示配色；不会覆盖界面主题 token。

运行 `pnpm --filter @mimir/desktop icons` 同步生成 renderer 几何模块、两份自适应
favicon、桌面 PNG/ICO/ICNS、fnOS 四处 PNG、小程序本地 PNG 与导出资源。
不要手工修改派生文件。生成器使用桌面包已有的 `@napi-rs/canvas`，无需增加依赖。

- 组件用 currentColor，保留辅助功能名称与装饰性用法。
- 桌面及 fnOS 沿用圆角底板和 .82 留白比例；各尺寸直接栅格化。
- `exports/miniapp-avatar.png` 为 1024×1024 完整正方形，供后台上传。
- `exports/app-icon.svg` 为通用底板预览。圆形裁切由使用平台完成。

本地生成与浏览器渲染不代表系统安装、fnOS 或微信真机验收；不自动上传或发布。
