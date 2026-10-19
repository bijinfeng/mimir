# 设置交互精修 · 本地存档

双击`comparison.html`即可离线浏览，截图均使用相对路径；可切换场景和前后模式并打开原图。

21组同尺寸前后、60个可选场景、81份原始截图。真实产品与固定数据/模拟IO分开标记；详细覆盖、未验证的原生与外部操作、测试结果见acceptance.md。

- manifest.json：来源、尺寸、哈希和产品源码版本。
- measurements.json / before/states.json / after/states.json：真实渲染观测。
- states/evidence.json / form-evidence.json：隔离组件交互快照。
- checks：全仓检查与存档验证日志。
- 隔离交互演示源码：Trellis任务10-20-interaction-settings的gallery目录，归档后仍保留。
