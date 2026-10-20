# 实施与验收记录

## 交付范围

- Pele 固定 1.6.0，`pele/lazy` 动态加载；关闭 links/images。
- Pele 导入、解析、渲染或 SVG 校验失败时调用原 Mermaid strict 渲染；两引擎共享 SVG 净化和现有图片隔离。
- Markdown codeBlock、NodeView、编辑与存储协议不变；WaveDrom 和普通代码块回归通过。
- 现行契约写入 `.trellis/spec/renderer/frontend/editor/conventions.md`。
- 真实前后 HTML、120 组截图、12 张拼图、几何数据、508 个资产的 SHA-256 与已知限制见 `docs/visual-comparisons/2026-10-20-pele/`。

## 已完成验证

- 4 个相关测试文件共 35 项通过，覆盖真实 Pele 12 类样例、真实 Mermaid 回退、错误与安全边界、源文保真和漂移。
- 真实浏览器完成 2 引擎 × 15 样例 × 2 主题 × 2 组件宽度，共 120 组；无页面/预览横向溢出，预期错误 8 组。全部截图通过 12 张拼图复核。
- 真实编辑器按钮验证错误恢复、撤销、读取 Markdown 和重新载入，重开前后 Markdown 字符串完全一致；未冒充后端持久化测试。
- Renderer 完整测试：82 文件 / 616 项通过。
- 源码与维护的归档脚本通过格式和差异空白检查；保留打包产物中的上游模板字符串空白，不改写已执行资产。508 个归档资产哈希复核通过。

## 完整质量门环境与复核

共享工作区有并行官网任务；首次 `pnpm check` 在其截断 HTML / 未格式化对比文件处停止，本轮未修改这些路径。

隔离验证以 `188bd88973acd78878bb496c9d99a007e8c4134d` 为基线，仅复制本轮 7 个产品/测试/规范/依赖文件和任务、对比归档。7 个文件逐字节与源工作区核对一致。独立 `pnpm install --frozen-lockfile --offline` 复用缓存，无下载；workspace 模块与 Pele/Vitest 的 realpath 均在隔离目录中。

干净工作区需要先执行既有 `node packages/office/scripts/trim-editor-css.mjs` 生成被忽略的 Office 样式。隔离目录中另发现 3 个已有 DOCX 样例出现额外 CWM 自定义属性；使用源工作区与 Git HEAD 一致的原始字节恢复，未编辑源工作区样例，未改任何测试断言。

一次完整运行的 lint、样式守卫、格式、全部 16 包类型检查和其余包测试均通过，但 server `structure.test.ts:70` 的目录 frontmatter / 重建索引测试超过原 5 秒限制。该次各包结果：Office 235 文件 / 2774 项、renderer 82 / 616、chat 8 / 88、provider 2 / 31、storage 1 / 13（另跳过 2），server 121 文件通过 / 1 文件失败，1364 项通过 / 1 项超时。

单独重跑完整 `structure.test.ts`：20 / 20 通过，5.22 秒总耗时，测试执行约 0.37 秒。同机有其他会话 Vitest 并发执行，因此随后使用 `PNPM_CONFIG_WORKSPACE_CONCURRENCY=1 pnpm check` 顺序运行包检查；该配置通过 pnpm 12 的 config get 验证有效。未减少检查范围、放宽超时或修改产品/测试配置。

隔离目录后续再次出现 CWM 元数据改写，Office 的 7 项严格字节比对失败，因此未把隔离质量门记为通过，也没有放宽断言。共享工作区随后 `pnpm format:check` 已通过（2111 文件）；原始 DOCX 样例仍逐字节等于 Git HEAD，最终改在共享工作区顺序运行完整质量门。

最终共享工作区 **`VITEST_MAX_WORKERS=1 pnpm check` 通过，退出码 0**。该完整运行由同仓库并行官网会话启动，Pele 产品/测试/依赖文件逐字节等于已审阅版本。本轮新启动的重复检查在进入 server 测试前停止，避免共用 `data/.test` 相互干扰；没有把中止运行记为通过。

实际工具退出证据：会话 `01a1574a-688a-7f01-9a15-559e900de15c` 的 commandExecution `exec-72ca550e-74cd-4b6a-b8cc-514ffaceafee`，status=completed、exitCode=0。完整日志 `docs/visual-comparisons/2026-10-20-official-site/full-check.txt` 含全部静态检查、16 包类型检查及测试最终结果，末尾 Node 脚本 6/6、fail 0。独立 check 子代理与主会话分别核对日志及实际退出记录。

最终 Office 235 文件 / 2774 项、renderer 84 / 628、server 122 / 1365，以及 local 10、fnOS 4、backup 2、Desktop 7 / 57、chat 8 / 88、provider 2 / 31、storage 13（2 项既有跳过）、miniapp 8 与仓库 Node 脚本均通过。未调整产品代码、断言、超时或排除项来推进验收。

R1–R5 / A1–A5 已完成。已知中文长标签与主题限制作为本次试用结论保留，未宣称性能收益或完整替代 Mermaid。
