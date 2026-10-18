# 第五模块产品浏览器验收

2026-10-18，主会话执行。批准来源 revision2 A；冻结 HTML 未修改。真实 Web UI 消费可控 API 样例，写请求由浏览器 Fetch 拦截返回，不把模拟结果称为后端写入通过。

## 已实际抽验

- 16类文件/来源图标；桌面浅深列表与卡片、390×844窄屏、1280×480低高度。
- 列表与卡片的菜单入口；笔记、文件、网页及目录删除文案均查看后取消，未做真实删除。
- 目录名称非法斜杠就地报错；等待时 Escape/取消锁定；模拟500保留草稿；模拟成功后刷新并回到入口。
- 缺失子目录显示不存在及恢复入口；空标签有准确空态。
- 通过真实文件选择事件选取本地无害txt样例；选中不发请求，显式提交后才PUT。等待时禁止取消/重选，模拟500保留文件；同ID重试后的parseError提示原件已保存、正文提取失败。
- 100条上限与长描述：明确最多100条，展开/收起可达，低高度头部与正文内部滚动。
- 浅深主要动作默认/hover/移出位置与尺寸相同。最终浅色添加文档为107.125×32px，border始终1px；暗色证据见hover-dark.json。
- 最终390px弹窗top24、padding18、input16px；focus为1px中性边框及2px轻轮廓、无box-shadow，见narrow-dialog-final.json。
- 取消后已移除所有Fetch拦截和临时viewport，恢复浅色列表。真实API读取“开始使用”及其“mimir 产品说明”正常，见product-real-final.png；侧栏独立的对话读取失败仍如实显示。

## 最终视觉证据

browser/product-list-light-final.jpg 与 reference-list-light.jpg为桌面列表；desktop-list-final.json记录1280视口、256侧栏、标题28/35、行高56、padding8×12及实际列宽。实际内容容器使用cqw，避免视口宽冒充内容宽。

browser/product-card-light-final.jpg / desktop-card-final.json为最终浅色卡片；product-list-light-390.jpg及folder-dialog-light-390.jpg为最终窄屏。最终HTML对照入口为browser/comparison.html。

早期list-metrics.json、card-metrics.json、product-list-light.jpg、product-list-dark.jpg、product-card-dark.jpg、product-card-dark-390.jpg是修正前的过程证据，不作为最终像素一致证明。深色及低高度截图证明当时交互抽验，后续共享布局修正由最终浅色证据与源码复核补充。

## 限制

58组/299状态是静态覆盖映射，不是299次GUI测试。未测真实后端写入、实际下载/拖入、原生取消选择、OS输入法、触屏硬件、读屏或Electron；单元测试中的IME事件不代表系统输入法已测。未声称逐状态像素一致。
