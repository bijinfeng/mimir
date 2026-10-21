# 小程序业务页 · 2026-10-20

模块 28 的第二组。按用户要求改用 Taro H5 做快速视觉打磨，真实服务端数据（本地 HTTPS 代理），同一 390×844 视口、同一账号、同一天的文档；不是静态 mock。

## 页面

| 页面 | 修改 |
| --- | --- |
| 问答 | 输入区改用 NutUI Segmented + TextArea；内容高度收进 tabbar 上方；空态居中；范围选择改用 NutUI Picker |
| 知识库 | 标签选择改用 NutUI Picker；H5 tabbar 隐藏空图标占位；保留真实文档列表 |
| 我的 | 用 NutUI Avatar + 资料卡；去掉重复的连接状态行 |
| 收集链接 | URL 输入改用 NutUI Input；主操作全宽并补支持范围说明 |
| 阅读 | 品牌 token 补到 `:root`，修掉 NutUI 主操作在 H5 变成红色；正文 15px |
| 编辑笔记 | 标题/标签/正文改用 NutUI Input + TextArea；正文区域固定可滚动，工具条不再压住正文 |

## 组件库替换

- 已改用 NutUI：Button、Input、TextArea、Picker、Segmented、Empty、Loading、Avatar。
- 保留 Taro 的 View/Text/ScrollView/Image 作为跨端布局与内容原语；tabbar 仍是原生配置。
- H5 预览关闭 pxtransform，确保 390px 下是 1:1 px，不把 rem 缩放误当产品字号。

## 证据

- `before/`：当前工具链、旧产品代码，390×844。
- `after/`：同一内容/主题/尺寸，改后代码。
- 本地服务端 `MIMIR_MINIAPP_ENABLED=1`；通过 `https://127.0.0.1:3443` 代理到 `http://localhost:3000`；测试账号 `admin@example.com`。
