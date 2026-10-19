# 回答更多操作：验证记录

本轮沿用用户“小修复不建任务，直接修复”的选择。生产变更只涉及 MessageItem 的更多菜单及对应规范。

## 原因与修复

原菜单以绝对定位向上展开，位于消息列表 overflow-y:auto / overflow-x:hidden 的祖先内；不能通过增加 z-index 越过滚动区裁切。原实现还把关闭按钮作为第二个 menuitem，形成用户指出的独立“×”。

当前使用已有 Ant Design Dropdown，默认 portal 到 body，自动避让 viewport 边界；菜单只有“导出 Markdown”。菜单类挂在实际浮层根上，容器 padding=0，紧凑尺寸 160×32px。没有放开消息滚动区的 overflow，也没有新增依赖或修改发送、模型、附件、SDK 运行流程。

## 真实产品验证

- 同一会话、深色主题、1280×720、scrollTop=180：原菜单 top=-36.25px、height=74px，被上方滚动边界裁切；当前菜单 top=8px、height=32px，完整可见且不在 article 内。
- 触发器继续上移至 top≈14.75px：菜单自动避让至 top=48px，完整向下展开。
- 鼠标和 Enter 均能打开；Escape 收起并回焦原触发器；Tab 收起并继续到下一个可聚焦控件；点击输入框收起并保持输入框焦点。
- 实际点击导出产生“回答.md”，文件 UTF-8 内容与当前回答逐字一致；菜单关闭、触发器回焦且提示“已导出”。

## 边界验证

280px 浅色侧栏复用生产 ChatPanel、真实主题和 Dropdown。固定资料与内存 IO 仅为布局 fixture，不声称外部模型调用。菜单完整位于侧栏内，只有一个业务动作，没有独立关闭项，无内部横向溢出。

metrics.json 保存实际尺寸与交互验证结果，render-manifest.json 保存原图尺寸、哈希与生产源码哈希。浏览器原始 JPEG 截图转为真正 PNG，只改变编码，不缩放；预览单独裁切，点击可查看完整原图。

## 自动检查

Ant Design CLI 已按项目 v6 查询 Dropdown API 和示例；修改后 antd lint 无问题，聊天包 typecheck 通过。完整 `pnpm check` exit 0：4867 项通过、2 项既有 Storage 跳过；详见 logs/check.txt。新存档生成后再次运行 lint、样式守卫和全仓格式检查，均通过，详见 logs/final-lint-format.txt。日志仅清理终端颜色和行尾空白。未降低检查规则、修改超时或排除产品代码。
