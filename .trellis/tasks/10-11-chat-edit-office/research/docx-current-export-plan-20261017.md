# DOCX 当前草稿副本导出最小切片

2026-10-17。GenOffice固定480548fd55f1be3593ee0d8e316a734751d58309，本地checkout对应App.tsx:5732的onSaveAs调用save(true)，沿当前编辑器状态构建原生文件；Mimir头部下载保存原件，不能替代未保存草稿导出。现DocxEditor:save聚合live notes/comments以及设计/list/reference attrs，使用session.save补丁写回，应复用相同构建输入生成本地DOCX，不调用io.save/markSaved、不修改dirty或历史。

WeKnora官网/公开源码同日缓存证据沿research/xlsx-structured-clipboard-plan-20261017.md：官网HTTP200快照、v0.8.3固定3e22822c1d2397be730c458c7539d0eb8c113a24 definitions.go，按sandbox能力注册工具；没有DOCX快照另存执行器，只适用能力诚实，不作为Office文件工具栏主参考。

最小缺口在当前画布→原生字节→显式下载。root独占DocxEditor最小事件与视图分类导出入口、新docx-output helper及真实组件原件回归；不改source保存、server/renderer/vendor。点击时冻结doc JSON与保存参数；构建期间文档/句柄/版本改变或卸载则拒绝旧下载；同tick重复点击互斥、明确构建错误。存在未定AI流式草稿时要求先处理；下载成功不将知识库标已保存。

验证实际编辑正文与主题/底色后的导出ZIP，io.save零调用、dirty/history保持；再次修改导出更新；undo/redo仍有效；迟到/错误/重复触发不下载。宽/420真实浏览器可见入口与下载独立读取。绘图/视图/保护对比不包含在本片完成声明。
