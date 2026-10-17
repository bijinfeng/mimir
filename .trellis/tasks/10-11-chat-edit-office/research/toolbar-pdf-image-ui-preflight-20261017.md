# PDF 图片 Inspector 浏览器预验收

2026-10-17，root。当前 dev5173、文档 `I56PIa071_MpP1ts`，实际 viewport420×500；不是最终生产构建或真实 provider 验收。

- 图片来源上传/搜索/生成实际切换。未配置搜索显示 Brave Search 设置入口，未配置生成显示模型设置入口；对应执行及插入按钮禁用，没有真实 provider 调用。
- 上传经真实单文件 chooser 选择240×160 PNG，长中文文件名预览可见、标题可读；文件准备时保存/Undo/Redo仍禁用，未点击插入或保存。
- Inspector x100/y156/width320/bottom473.359；内部滚动区 client180/scroll649，top232/bottom412.359；单一固定主动作 x116/y425.359/width288/height32/bottom457.359。滚到预览文件名时主动作仍在视口内。
- 选择已有图片后，操作列表实际展示插入、替换、位置与尺寸、旋转、翻转、不透明度、去背景、裁切、删除共9项。裁切显示左/上/右/下百分比及小于100%说明。
- 将左裁切草稿改为10后按Escape，Inspector关闭且焦点实际回到 `PDF图片工具`；保存/Undo/Redo保持禁用。
- 早先对屏外radio `.check()`失败不计产品缺陷；改为作用域内可见标签点击后搜索/生成正常切换。

已实际查看截图（目录 `/Users/admin/.codex/visualizations/2026/10/16/01a142b8-e543-7780-8181-44e1e0f94f51`）：`pdf-image-generate-gate-420.jpg`、`pdf-image-upload-current-420.jpg`、`pdf-image-upload-filename-420.jpg`。待root统一生产构建后完成最终上传插入/保存重开及原生history；不将预验收写成最终通过。
