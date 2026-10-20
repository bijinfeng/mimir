# 官网最终验收

## 交付

已按用户批准的“问题带路”方案实现公开 Web `/` 官网，包含示例问题/回答/引用、真实组件工作台、收集检索闭环、数据归属、部署、FAQ 和工作区入口。继承现有品牌与浅深主题。无后端、数据库、模型或个人内容接口改动。

## 验收矩阵

| 标准 | 证据 | 状态 |
| --- | --- | --- |
| AC1：首屏与公开访问 | 四组实际首页截图；路由 API 故障测试；首页业务 API 请求为零 | 通过 |
| AC2：引用与键盘 | CitationDemo 交互测试、浏览器展开/焦点/Escape 验证，44×44 关闭目标 | 通过 |
| AC3：产品事实与内容 | 内容审阅、仓库文档链接、能力/模型/同步限制说明 | 通过 |
| AC4：响应式与主题 | 1440×900 / 390×844 浅深色无横向溢出；减少动效 computed animationName=none | 通过 |
| AC5：路由兼容 | public-home、root recovery、basepath 与登录流程测试；统一测试账号实际登录验证 | 通过 |
| AC6：质量门与归档 | 两端生产构建、15 组完整 HTML/PNG、尺寸与 SHA-256；最终全仓检查见下文 | 通过 |

## 独立复核

- `code-review.md`：Trellis check 已执行涉及范围 lint/format/renderer typecheck 与 12 条引用/路由测试，修复关闭目标尺寸。
- `finish-review.md`：原轮提出 header glyph 图标问题，改用 Lucide ArrowUpRight；最终四种首屏截图有效，评分 `disposition: ship`。
- `design-system-review.md`：现有 DESIGN.md 与 sidecar 继续适用，不改全局设计规则。

## 运行结果

- Web production build：通过，最终 OfficialSite 29.54kB / gzip 10.23kB；WorkbenchDemo 11.31kB / gzip 4.19kB。
- Desktop production build：通过；默认工作区入口保持原行为。
- 最终 `VITEST_MAX_WORKERS=1 pnpm check`：通过，退出码 0。包含全仓 lint、样式、格式、各包类型检查与全部测试；Office 235 文件 / 2774 用例，renderer 84 文件 / 628 用例，server 主集 122 文件 / 1365 用例全部通过，本机/fnOS/备份与 Desktop 及开发进程/打包脚本测试亦通过。Storage 原有 2 条环境相关跳过保留。
- 两端构建保留既有编辑器共享 chunk、React Compiler 与 wavedrom eval 等警告；官网无新增编译诊断。

首次全仓检查：lint、样式、格式和类型通过；Office 共 235 文件，234 文件 / 2766 用例通过，PdfEditor.blocks 8 条在 5s 轮询期限内未就绪。同一文件降低并发后 8/8 通过，未改代码。第二次以 `VITEST_MAX_WORKERS=2` 重跑时，Vitest 环境变量覆盖服务端原有单 worker 设置，导致共享测试库相关失败；这次运行不作为服务端验收结果。最终改为 `VITEST_MAX_WORKERS=1 pnpm check`，保留全部断言，日志分别保存为 full-check-attempt-1、full-check-attempt-2 和 full-check。

归档传输曾截断长字符串，已改用完整分段 DOM/CSSOM 补采；15 组生成 HTML 均完整闭合、无截断标记、尺寸与清单一致。旧登录入口截图保持原样，旧的其他任务对比未改动。

提交前差异空白校验覆盖本轮手写代码、文档、测试与渲染归档；原始 Obsidian 下载快照（保留 SHA-256）及原样终端日志保留其上游行尾空白，不改写研究证据或终端输出。

## 提交边界

仅官网 marketing、Web 入口/共享路由、必要测试与产品规范、方案选择记录和官网验收归档。并行 Pele 的 editor、依赖/锁文件、任务与对比不纳入本提交。未推送或发布。工作提交哈希由会话日志记录。
