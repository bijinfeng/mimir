# 设置隔离交互验收

使用真实Renderer分区组件和MimirProvider，固定数据取自隔离测试实例并去除会话/密钥。`main.jsx`替换本页面全部设置IO，所有写入、探测、下载、头像上传和Desktop桥均为模拟；不连接真实服务。正常Web页面、真实路由滚动与截图证据另见docs/visual-comparisons/2026-10-20-settings。

从仓库根目录执行`pnpm --filter @mimir/web exec vite --config <本目录绝对路径>/vite.config.mjs --port 5197 --strictPort`。配置通过git确定仓库根，任务归档后仍可运行。`?section=models&state=normal&width=520`选择真实分区、模拟状态和内容列宽度；页头提供导航。loading保持未结算；pending通过“完成模拟请求”显式结算，没有固定延时。

`GALLERY_SOURCE_ROOT`可指向基线源码根来复现before；本轮基线是7b61836，四个样式/组件使用该提交源码。截图没有用旧主题假造before。

边界：模拟响应只验证布局和已有交互反馈，不证明供应商连接、真实账户/密钥写入、S3存储、维护任务、导出文件、Electron模式切换。头像使用临时生成的几何测试图，只验证裁切呈现/取消，不代表真实原生文件选择器或上传链路已验收。
