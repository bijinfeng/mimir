# HTML 丰富提纲：浏览器组件验收

日期：2026-10-17。生产组件已验，独立 checker 继续收口数据边界；本报告不代表模型调用成功。

## 范围

用户明确先完成代码和浏览器，Desktop 自验，测试模型尚未配置。使用已有 `/tmp/mimir-html-planning-harness`，只导入仓库实际 `HtmlAgentPrompt` / `EditorShell` 与 CSS，页面可见标记“真实组件验收 · 示例数据，不调用模型”，本地端口4174。没有给产品加验收入口、没有上传或删除文件。

参考与版本见 `html-rich-brief-20261017.md`：固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` rich brief/redo/pin 语义；WeKnora v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24` 只适用能力权限边界，不作为 Office/规划面板视觉模板。

## 真实交互

- 三种视觉方向可选择，有可访问的 pressed 状态；选择另一方向替换整个 style，不把上一方向的字体/tokens/layout 偷带过去。
- 420×720 真视口：window.innerWidth420，document.scrollWidth420，侧栏320px（含边界），底部操作区域 y642–695，独立滚动；主张、标题、读者、视觉方向分组清楚。
- 高级配色折叠后，选“温暖纸张”，主色输入 #13579B，显式“使用颜色”后当前值和色块更新；重新展开再 Escape，只关闭颜色弹层，提纲仍在，焦点回“提纲主色”。
- 标题改“浏览器编辑的提纲”并确认，实际结果是 kind:confirmed，style.name=温暖纸张、primary=#13579B、body=宋体，旧方向的tokens/layout未残留；user_edited含style/style.palette.primary/meta.title；meta.title同步。
- 重新拟定、取消/停止/切源/过期结果和持久 pin 用真实句柄与服务专项覆盖。未用本地示例冒充已调用模型或真实Agent发起规划。

## 视觉验收

首轮宽/420同批检查发现方向按钮内层内容只占140px并居中，已让内部图文span占满宽度；配色行移除重复标签并显示当前RGB。第二轮确认截图完成，不继续可选打磨。

- `/Users/admin/.codex/visualizations/2026/10/16/01a142b8-e543-7780-8181-44e1e0f94f51/html-rich-brief-wide.png`
- `/Users/admin/.codex/visualizations/2026/10/16/01a142b8-e543-7780-8181-44e1e0f94f51/html-rich-brief-420.png`

宽屏最终DOM innerWidth1280，body.width1280，Inspector x959–1279、width320。CDP resize后先读取布局再截图，避免把前一420px backing surface当成1280px布局。临时设备尺寸已清除。

## 初始门禁

Office四文件59/59；Server HTML writer六项6/6；shared/server类型通过；Office类型在DOCX测试修正后通过。root目标lint0警告、格式通过。日志 `/tmp/mimir-rich-brief-{tests,server-tests,shared-types,server-types,office-types,lint}.log`。后续checker发现的边界与最终门禁以其独立报告为准，不将此初始结果相加冒充最终全仓结果。
