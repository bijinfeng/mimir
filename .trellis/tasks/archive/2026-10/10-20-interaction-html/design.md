# HTML 编辑器精修设计

## 方向与边界
保持现有语雀方向及统一Office外壳。问题位于HTML格式层：真实编辑列690px时仍为左右各约345px；CodeMirror依赖的主题变量为空、语法颜色失效；关闭查找后焦点落BODY；插入表单仅有可访问名称，缺可见字段标签。

只改 packages/office/src/editors 的HtmlEditor、HtmlInsertMenu、HtmlWritingPreview与其本地CSS，按需添加行为回归；不改vendor、共享控件外观、主题调色板、业务/网络/保存/Agent协议。原件Envelope、版本检查、沙箱、临时预览与异步取消合同见research/gaps-and-contracts.md。

## 实施
- 插入：复用ToolbarPropertyForm可见字段，紧凑宽度且允许视口收缩，保持URL/表格验证及反馈，以一个primary表达提交。
- 源码：在mimir-html-cm局部桥接已有me变量至vendor需要的变量，保留作者预览白底。语法角色用已有主题角色，不创建新调色板。
- 分栏：以实际workspace/split可用宽度适配上下排列，Inspector打开后同样检查；源和iframe始终挂载，hidden与zoom合同不动。
- 查找：关闭回真实CodeMirror焦点，不更改共享FindBar。
- 生成：现有字符数/状态与动作分组，长错误换行，停止、部分保留、丢弃、过期拒绝不变；不虚构渲染草稿。
- 规划/演示：footer或bar必要时换行，短窗口内部滚动和退出可达；源码候选需浏览器确认。vendor裁切限制只记录。

## 证据
冻结基线0c44cde；期间chat提交不改变HTML产品。实际组件fixture使用真实MimirProvider/theme bridge/HtmlEditor，固定原件和可控IO/AI服务，不能等同真实写盘/模型验收。92条交互盘点与竞品固定版本见research。根会话负责真实截图配对、键盘/窄短/主题验证与离线viewer，独立checker负责回归审查。
