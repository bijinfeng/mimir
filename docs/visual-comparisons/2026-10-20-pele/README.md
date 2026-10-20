# Pele 试用真实组件对比

入口：`review.html`。需要通过静态 HTTP 服务打开，ES module 不保证支持 `file://`。两侧固定同内容、主题、尺寸与编辑模式；样例、主题、宽度和模式在顶栏同步选择。iframe 内的控件用于各侧独立检查保存、重开与错误恢复，独立操作后需重新选择顶栏条件才能恢复相同内容。

## 真实与模拟边界

- 真实：Mimir `createExtensions()`、`DiagramCodeBlock` NodeView、`renderDiagram`、`useContentStyles`、`MimirProvider` 与 Tiptap `useEditor` / `EditorContent`。
- before 的图表入口冻结自 `188bd88973acd78878bb496c9d99a007e8c4134d`；after 使用本轮产品代码。构建时仅切换原图表 NodeView 与渲染模块，其他组件、fixture 和样式保持相同。
- 不连接服务端、不登录、不写入知识库。“读取 Markdown / 从已读源码重开”实际调用 Tiptap 序列化和 setContent，用于节点行为验证，不代表后端写盘与刷新浏览器重开已验。
- 不模拟图形结果：两侧均执行真实图形库，预览等待和错误反馈来自产品代码。
- 宿主主题固定为查询参数选择，Pele 不会自动继承穿过隔离图片的宿主 CSS 变量；本轮不增加内联 SVG 或主题机制。

## 重建与查看

从仓库根执行：

```sh
python3 docs/visual-comparisons/2026-10-20-pele/demo/build-archive.py
python3 -m http.server 5207 --bind 127.0.0.1
```

打开 `http://127.0.0.1:5207/docs/visual-comparisons/2026-10-20-pele/review.html`。
静态产物保存于 `demo/dist/{before,after}/`，不依赖临时源码或运行中的 Vite。重建时从 Git 读取冻结模块，按当前依赖锁文件重新编译。按哈希保留的归档资产用于复核本轮实际运行结果；旧对比目录不覆盖。

## 覆盖与结果

固定样例见 `demo/fixtures.js`；实际检查及限制见 `acceptance.md`。未完成的检查不视为通过。
