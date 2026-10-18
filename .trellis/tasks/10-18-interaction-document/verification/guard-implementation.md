# 文档守卫与命令实施交接

批准基准：document-review-v1，SHA256 `2a3aafb4277c37bd06e38ae94ecec085e0f31a062b88e25a000042e5cbdb220d`。本记录为实现/组件回归证据，不代表逐状态浏览器验收。

## 实现

- `UnsavedGuard.tsx`：一般文档按 canSave 呈现真实动作。Office 无代存入口，只能继续到实际工具栏保存或明确丢弃；自动保存笔记不提供丢弃已落库版本。保留 module4 收集交接的结果保留合同。标题上下文、内联等待/错误、首焦继续、组合输入防误确认/关闭、取消回焦使用真实 AntD。
- `DocumentDialog.style.ts`：只供文档守卫/命令的 480px、12px 圆角、24px 留白、17px 标题、32px 基础按钮；窄屏18px留白/15px标题/40px控件，低高度正文滚动与页脚可达。色彩来自现有语义 token，字号使用明确局部角色；不改全局主题。
- `DocumentCommandModal.tsx/.style.ts`：按冻结稿无额外副标题或 X，保留 Escape/取消回焦；13px标签、12px辅助；保存名称/移动文档文案；目录加载/错误时保留禁用的选择字段和原选中值，读失败不是空目录；空归属“未归入目录”，不虚构知识库根。明确已写入后只重试 GET，字段草稿/IME/等待防重/旧文档晚回包合同继续复用。
- `lib/unsaved.tsx`：同步单次保存锁，等待不替换离开目标；false/throw 保留原 dirty 和导航；旧版本写入不能清除期间新改动，编辑器串行 flush 到 clean 才放行。`setSave` 可选第4参 editorId 精确区分真正换文档与同提交周期 effect 临时注销/注册；真正换文档使旧保存完成失效，未重注册的注销在微任务确认后清理。不能只用微任务识别编辑器归属。
- 最小宿主接线：`_app.tsx` 读取已有 query cache 给守卫标题，无新请求；`OfficeSourceEditor.tsx` 注册传 doc.id。NoteEditor 的同类 doc.id 接线由 core worker 承担。

## 执行验证

2026-10-18，Renderer cwd 直接二进制：

```
./node_modules/.bin/vitest run src/editor/markdown-save.test.tsx src/components/UnsavedGuard.test.tsx src/components/document/DocumentCommandModal.test.tsx src/theme/design.test.ts
```

结果：4 文件、139 测试通过，其中守卫10、命令9、实际 Markdown 保存11，设计守卫109。可控 promise 守住失败、在途、更新版本、真正切篇晚回包和同文档同提交重注册边界，无固定延时。曾发现并修复过严 setSave(null) 清状态导致的 Markdown7项回归；最终同上述4文件一起复测通过。

限定9个改动文件 oxlint、oxfmt --check、git diff --check 通过。AntD6 API 先查询，`antd lint` 两个组件均 0 问题。Renderer `tsc --noEmit` 仅报告范围外已知 `src/lib/agent-media.check.test.ts:12` Promise.withResolvers TS2550，未抑制诊断。

## 留待主会话与独立检查

- `implementation-coverage.json` 精确78组422条状态，保留每组源合同与每状态 HTML 路径、要求、落点、所有权、状态、证据。当前 core175 / visual191 为待各 owner 回填；guard相关51条为实现/保留证据，DOC074的5条为宿主边界。不能据此宣称422条GUI通过。
- 主会话负责真实桌面/窄屏/浅深/低高度/组合输入交互截图、全仓质量门；独立检查负责跨模块完整性和视觉还原复核。
- 浏览器 Back/原生刷新/关页/Electron现有能力边界保留；没有新增全局 router blocker 或伪系统对话框。Office原件内部保存及原生交互未在本组件测试中证明。
- 未提交代码，未改冻结原型。
