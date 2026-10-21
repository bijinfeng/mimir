# 折带 · 第一轮规划稿

- `preview.html` 为完整提案，支持浅深色场景切换；`preview-light.png` / `preview-dark.png` 为 1440px 截图，`preview-mobile.png` 为 390px 截图。
- `mark.svg` / `app-icon.svg` 是本轮推荐矢量稿，未接入产品。
- `render.mjs` 生成提案并使用当前仓库已有的 Playwright 与本机 Chrome 截图。默认 Playwright 浏览器未安装，改用系统 Chrome，未安装额外浏览器。
- 共进行了两轮合并检查；确认 1440px 浅深色、390px 无横向溢出、单色/反白与圆形主体完整。390px 下网页模拟窗口的长标签换行会挤压下面的模拟导航，此为设计板内缩略场景，不是产品移动网页验证结果。
- 本轮只验证规划稿，没有跑产品集成质量门，也未验证系统安装、fnOS 或微信真机。
- `Manrope.ttf` 仅用于提案展示，来自 https://github.com/google/fonts/tree/main/ofl/manrope ，许可证见 `Manrope-OFL.txt`；产品字体没有变更。
- 提案脚本和 JSON 位于项目默认忽略的 Trellis 任务目录，针对这些文件的 oxfmt 调用因输入被忽略而未运行；未修改项目格式化排除规则。
- 最终真实组件 before/after 对比将在批准接入后另存 `docs/visual-comparisons/2026-10-21-brand-icon/`，不把本模拟图标记成产品验收证据。
