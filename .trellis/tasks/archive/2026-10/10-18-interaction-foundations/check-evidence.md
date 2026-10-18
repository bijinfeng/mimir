# 基础组件 v1 独立复核（2026-10-18）

复核范围限定为 change-boundary.md 的已认可基础组件实现；未修改冻结原型、主题令牌、已有脏设计规范、Office、其他会话文件。核对了 check.jsonl 的设计/表单/主题契约与 document 子层约定。

## Findings (fixed)

- `SettingControl.tsx`：清除秘密配置在请求前清空了用户输入，失败后却称草稿已保留。移除提前清空，成功回调仍清空；新增“清除失败保留秘密草稿，再次清除成功才清空”测试，同时断言秘密不出现在状态正文。
- `UploadPanel.tsx`：busy 只在重渲染后禁用入口，同一轮选择事件能并发替换批次。增加同步 ref 锁，批次完成后释放；加强原测试为同一轮两次选择，仍只执行原批次的两个请求。
- `LibraryView.tsx` / `FolderSection.tsx`：删除文件夹/知识库 mutation 的错误 toast 与新确认框 inline 错误重复。移除两个局部 onError toast；错误仍由确认框显示且保留同一对象与重试。
- `KnowledgeBaseCreateModal.tsx`：主会话实际 720px 视口中页脚落到视口外，原型要求内容内部滚动。使用 AntD v6 的 container/body 语义类，容器限制为视口高度减 48px、正文内部滚动，居中显示。没有全局样式覆盖；实际几何和窄屏由主会话浏览器验收。

## Findings (not fixed)

没有未处理的任务内代码问题。全仓质量门、实际浏览器浅深/窄屏验收、forms.md 现行合同同步和任务元数据由主会话完成，本复核不提前宣称完成。

## 代码路径核对

- 知识库创建使用同步 submitting ref 防同一轮 Enter/按钮重复请求；失败保留名称、描述、图标，名称错误关联到字段，pending 阻止取消。Input 的组合态 Enter 由实际 rc input 处理，设置 InputNumber 则已有显式 nativeEvent.isComposing 防护。
- 设置开关失败恢复 persistedValue，重试保存上次尝试值；文本/数字保持显式 Save/Enter，无 blur 保存；服务器刷新不覆盖脏草稿；秘密不回显服务端值。
- 实查 AntD 6.6.6 `ActionButton.js` 的同步 clickedRef：危险确认双击只执行一次；加强相应测试。实查 `useModal/index.js` 的 then 启用 silent 模式，ActionButton 对已展示的失败拒绝不产生未处理拒绝。拒绝仍保留确认框，重试成功才发布 confirmed。
- 上传保持串行请求、真实成功/失败计数；无正文但原件保存成功仍为成功，无新增重传 API、进度或撤销能力。DocumentHeader 保留原菜单动作，Escape/选择关闭并回焦；Office 保存合同不变。

## Verification

- Lint：限定 13 个产品代码/测试文件 `pnpm exec oxlint ...` exit 0；修改的 Modal/SettingControl/UploadPanel 的 AntD CLI lint 均 0 issues。
- Format：限定 13 文件 `pnpm exec oxfmt --check ...` exit 0。
- TypeCheck：`pnpm --filter @mimir/renderer typecheck` exit 0；日志 `/tmp/mimir-foundations-check-types.log`。
- Tests：5 文件 21 项通过（KnowledgeBaseCreateModal、SettingControl、UploadPanel、confirm-danger、DocumentHeader）；日志 `/tmp/mimir-foundations-check-tests.log`。
- `git diff --check -- packages/renderer/src/components` exit 0。
- 冻结 HTML SHA256 仍为 `a4ca817e948b1e24a39daf85d2ed7ab7e04f54548f4b1ea9e075a367f2014789`。

复核完成后停止写入，交回主会话进行全仓门与最终提交。
