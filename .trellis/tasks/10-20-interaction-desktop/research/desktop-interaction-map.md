# Research: Desktop 表面、入口与原生分支

- Query: 模块 16 的真实交互边界和实现落点是什么？
- Scope: internal
- Date: 2026-10-20

## Findings

完整机器索引见 `interaction-inventory.json`：27 个 desktop 源码/测试文件的路径、行数和 SHA-256；19 个实际表面/流程记录，每条附条件、控件与验证类别。它是源码清单，不能作为 GUI 通过数量。两条 HTML 入口也在文件清单中。

| 表面 | 来源与模式 | 真实交互/分支 |
| --- | --- | --- |
| 首启/更换使用方式 | `apps/desktop/src/renderer/setup/SetupPage.tsx:49` | 桥缺失；mode.get 等待/失败重试/null 首启/本地切换/云端切换及预填；alive 避免卸载后更新 |
| 本地/服务器选项 | `SetupPage.tsx:203` | 原生 button + aria-pressed；pending 禁用；选择清除失败；切到服务器自动聚焦地址 |
| 提交、返回及反馈 | `SetupPage.tsx:111`、`:268` | 地址空时 CTA 禁用；choose 返回 ok:false/reject/success；成功再单向 activate；pending note；已有模式可返回，首次无返回 |
| 首启窗口栏 | `SetupPage.tsx:146` | 共用 WindowControls，omit maximize；macOS 系统红绿灯，其他平台自绘最小化/关闭 |
| 应用标题栏 | `components/TitleBar.tsx:61` | 平台缺失返回 null；showToggle 条件；折叠/展开图标、名称与 aria-expanded；品牌及中间区域拖动 |
| 窗口控件 | `components/WindowControls.tsx:47` | 缺桥/macOS 不渲染；omit；首次读取最大化真值；订阅宿主最大化/还原；卸载取消订阅 |
| 关于客户端 | `routes/about.tsx:65` | query 等待 Skeleton；失败/null 错误 + 重试；成功显示版本与本地/云端模式；仅本地桌面路由存在 |
| 设置 › 客户端 | `packages/renderer/src/components/settings/ClientSection.tsx:30` | boot 等待/失败重试；local/cloud 文案、cloud origin；更换使用方式；外层按 desktop 平台隐藏整个分区 |
| 应用原生菜单 | `apps/desktop/src/main/index.ts:525` | 更换方式 CmdOrCtrl+Shift+M、退出；编辑 undo/redo/cut/copy/paste/selectAll；云端保持系统菜单栏可用 |
| 云端加载失败框 | `main/index.ts:477` | 忽略子框架、-3、setup/non-cloud；重试/更换/退出；取消等同退出；销毁窗口不弹框 |
| 不可信请求确认框 | `main/index.ts:378` | 默认/取消均“取消”；批准后才能执行同一模式 activate；正常云端无 preload，保留纵深边界 |
| 启动故障与激活故障 | `main/index.ts:630`、`:667` | 激活错误 showErrorBox；启动宿主准备错误日志+原生框+退出；无/坏配置则进 setup |
| 配置与进程生命周期 | `main/config.ts:39`、`main/index.ts:701` | 原子写入；第二实例恢复/聚焦；关窗即退出；宿主优雅关闭与 5 秒上限 |

### 不可改变的合同

- `preload/index.ts:15` 是 boot、mode、window、quit 的窄桥；云端不注入，不把 BrowserWindow、路径或本地令牌暴露给页面。
- `main/index.ts:599` 先归一化、探活，再写配置；`choose` 与 `activate` 继续两阶段，不能合并为“点了就导航”。
- `main/index.ts:209` 跨 surface **先创建新窗口再关闭旧窗口**；Session 不可只靠 loadURL 改换。
- `main/cloud.ts` 支持用户不写协议并根据内外网补协议；不要把地址 Input 包进会拦下此类值的原生 URL validity 提交流程。
- 关于页不增加 OS 路径、端口、日志信息；设置客户端入口本轮优先沿用已有 renderer 精修，不复制选择表单。

### 相关 specs

`.trellis/spec/desktop/runtime/{index,conventions,pitfalls}.md`：三段构建、file setup、窗口/信任/Session 边界、no-drag。
`.trellis/spec/project/design.md` §0、§5–7、§8.12–15、§10：紧凑密度、44px 标题栏、真实状态、键盘焦点、共享 provider。
`.trellis/spec/project/{rules,quality}.md`：规则不抑制、全仓检查、实际运行效果验证。

## Caveats / Not Found

- 本研究未运行原生 GUI；任何尺寸、焦点或路径尚未测量的项目均在建议文件标成待验证。
- about 路由当前 component 为文件内部函数；归档可在构建阶段导出/变换真实源码或走完整桌面路由，不能手绘一个声称“真实组件”的 about。
- 桥在模块求值时固定（`renderer/lib/desktop-bridge.ts`）；HTML 档案必须先注入受控桥，再 import 真实组件，避免无桥分支误当产品故障。
