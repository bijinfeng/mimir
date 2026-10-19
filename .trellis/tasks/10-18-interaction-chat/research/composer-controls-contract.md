# 输入框内模型、思考强度与范围：边界核查

日期：2026-10-19。用户最新原话：「但是输入框里的模型和思考强度选择还有知识库范围都是需要的」。这是对 v3 控件位置的修订，非实施授权。

## 固定证据

官方来源仍为 assistant-ui/assistant-ui commit `a587b2838f2d644549d216098d54cfbeedfac522`，MIT。新增原件和 SHA256 见 `composer-controls/source-manifest.json`；完整许可沿用同 commit 的 `vendor-full-thread/LICENSE`。

- `prototype/v3/vendor/packages/ui/src/components/react/assistant-ui/elements/thread.aui.tsx:134–137`：ThreadProps 只有 components/autoFocus；没有 Composer/toolbar slot。
- 同文件 `:246` 直接挂内部 Composer；`:497–607` 的 Composer/ComposerAction 不导出。把组件作为 children 传给 Thread 不能插入输入框，不能用 DOM 注入、Portal 定位或 CSS 覆盖绕开。
- `composer-controls/model-selector.aui.tsx`：官方 ModelSelector 直接注册 modelName/reasoningEffort 到 ModelContext，支持受控 value/effort。该官方入口存在，不应声称官方完全没有模型或思考强度组件。
- `composer-controls/model-selector.tsx`：公开 models、value/onValueChange、effort/onEffortChange；ModelSelectorEffort 原生展示各选项，默认样式可以原样使用。它不自动实现 Mimir 的“标准/深入”业务语义，不能未经映射把两者等同于 provider reasoningEffort。
- Mimir 现行模型两条全局绑定只读/设置管理、主对话标准/深入、侧栏标准、范围与Agent及队列冻结等合同不因视觉改造改变。用户本次要求保留位置与能力，不自动授权新增任意模型切换行为。

## 具体修订建议，尚待确认

仅允许 Composer 底部工具栏做有限组合，将模型、思考强度、知识库范围放回输入框内；优先官方 ModelSelector/Effort 与官方通用选择基础件，业务数据/权限/请求参数来自 Mimir。输入、附件、发送/停止继续使用官方组件及默认样式，不覆盖颜色、边框、间距；消息、Markdown、reasoning、tool-call 与动作维持官方原件。

这会放宽 v3 的“整个 Thread 源码完全不动、不做任何本地组合”约束，必须如实记为输入区业务扩展，不能宣称未修改的完整 Thread。用户确认这一边界后另建 v4 HTML，保留 v1/v2/v3，具体效果仍需认可后才能实施。当前没有新增 v4 或修改产品代码。

## 项目参考复核

本研究沿用同日、同任务已固定的 WeKnora 官网 v0.8.3 / HTTP200 及公开源码 `2c0d8384398ca756ee414eef01b71caf91e2caa6`；具体证据在 `vendor-full-thread/weknora-reference-recheck.json`。其知识库/Agent能力分工用于检查范围语义，不能替代 assistant-ui 官方组件或作为本轮自绘样式依据。本次不涉及 Office 工具栏。
