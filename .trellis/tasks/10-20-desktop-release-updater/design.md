# 技术设计：桌面发布与更新

## 状态与边界

待最终方案评审。一个任务承载完整生命周期：构建版本、更新元数据、运行时策略和发布验收必须一致；不拆为能单独宣称完成的子任务。实现及检查按 Trellis 子代理执行，主会话协调集成、规范、提交与归档。

源码与 Releases 均位于公开的 `bijinfeng/mimir`。首版保持 appId/productName/executableName/userData 约定。更新动作和状态权威在 Electron 主进程。新增随客户端分发的本地更新详情窗口与最小 IPC；本地主窗口只获得读取状态、打开更新窗口和回应主进程保存准备的能力。远端页面不安装 preload，不获取更新 IPC。原生菜单覆盖选择页、本地和云端；交互唯一细节见 `ux.md`。

## 构建/发布数据流

1. 新增独立 desktop release workflow。手动触发构建测试产物；`vX.Y.Z` tag 触发稳定版发布。统一 Node 22/.nvmrc 与仓库 pnpm 版本，冻结 lockfile。修正现有 CI 默认分支触发为 master。
2. 发布预检：读取 `apps/desktop/package.json` 版本，验证 tag 与版本完全一致，拒绝预发布/非法版本。不在 CI 中修改版本并伪造已提交状态；维护者先提交版本再打 tag。
3. 四个原生 runner 分别构建：macOS arm64、macOS x64、Windows x64、Linux x64。实现时核对可用 runner 标签与实际 process.arch，避免在 ARM runner 上部署 x64 宿主依赖。完整执行 server build → desktop build → server deploy → electron-builder，强制 `--publish never`；保留 pnpm 点目录和平台原生依赖的现有 afterPack 复制语义。
4. macOS 生成 DMG 和 ZIP；Windows 显式 NSIS；Linux AppImage。产物名称包含版本、平台和架构，不能重名。每个 runner 上传独立 Actions artifact；打包目录、资源、迁移、`.node` 依赖及应用启动需验证。
5. 单个汇总 job 下载四份产物，验证版本、文件存在、大小与 SHA-512。Windows `latest.yml`、Linux `latest-linux.yml` 各自唯一；两份 macOS `latest-mac.yml` 合并 files，保留含 arm64/x64 的唯一文件名，并以 ZIP 为兼容 path/sha512。拒绝版本不一致、重复文件名或文件引用缺失；不使用覆盖上传碰运气。
6. 只有所有任务成功才用最小 `contents: write` 权限创建/补全 draft Release；校验资产完整后发布为 stable/latest。其余构建 job 只有读权限，禁止独立并发发布。重跑已公开版本不得修改其资产；draft 重试需校验相同 tag/version，并只允许恢复本次任务产物。手动构建不发布、不改变 latest。

## 签名与包内策略

- 默认为测试签名模式，不配置 GitHub Secret 也能生成首版四平台安装包。macOS 保留 ad-hoc 签名；`afterPack` 的测试签名与 builder 正式签名区分清楚，避免覆盖正式签名。
- 包内生成固定更新能力标记（随应用元数据或受控 build define），用于区分 manual/automatic。无正式签名的 macOS 包永远走 manual，不用使用者环境变量或网页输入启用自动安装。
- 预留显式的正式 macOS 签名模式：Developer ID 证书和密码、Apple 公证凭据使用 Actions Secrets，在运行时不保留；要求配置齐备和真正执行签名、公证。未通过相关验证前不宣称可用，不自动将旧 ad-hoc 包切换成自动更新包。
- Windows 未签名包注明 SmartScreen/信誉限制；有证书时可再接入，不虚构已存在证书，不将签名失败忽略为成功。

## 更新控制器

新增主进程 update controller，平台适配与状态流分离，可通过注入 updater、调度器、原生交互、宿主关闭函数在 Node 测试。选择兼容 builder 26 的稳定 electron-updater 6.x，显式声明运行时依赖并验证打包 asar 中及应用实际启动时可解析（electron-vite 默认 externalizeDeps）。

固定 GitHub provider owner/repo 和稳定通道，构建生成 app-update.yml，不向页面开放 setFeedURL。`allowPrerelease=false`、`allowDowngrade=false`；开发态不请求安装，Linux 缺少 APPIMAGE/安装位置不可写时给出手动下载说明。

建议状态：disabled/manual/idle/checking/available/downloading/downloaded/installing/error。应用启动并有可显示窗口后延迟检查，随后每 6 小时检查；定时器 unref 并在退出时清理。check/download/install 同步去重，错误收敛为可重试状态，事件监听只注册一次；用户请求与后台检查共享同一控制器。退出后不出现迟到弹窗。

- Windows/Linux：默认自动检查并后台下载，可在详情窗口关闭后续自动下载；`autoInstallOnAppQuit=false`。下载完成只发一次非模态轻提示，用户点击后打开详情，绝不自动聚焦新窗口；标题栏和系统菜单保留状态。提示按版本持久去重，拒绝桌面通知不影响菜单入口。
- 独立更新详情窗口是第三个随包构建的 file:// HTML 入口，单例且脱离宿主可运行；独立最小 preload 仅向该 BrowserWindow 的主 frame 暴露固定更新动作和只读状态，主进程验证精确 wc.id/frame/URL，不将 setup 页信任规则扩大为任意本地路径。外链限制到官方仓库发布页，不直接渲染未净化 Release HTML。
- 本地标题栏和 About 页面复用主进程状态，主窗口接口仅允许打开详情、订阅只读状态及回答一次性保存准备；安装命令限专用更新窗口内显式操作。云端只用系统菜单/桌面通知进入本地窗口，不在远端网页运行更新控制。
- 关闭详情不取消下载；window-all-closed/主窗口普通关闭仍需兼容既有关闭主窗口即退出语义，不能因为额外详情窗无意让宿主常驻。更新安装准备阶段另有受控关闭路径。
- macOS manual：允许检查新版本，但 `autoDownload=false` 且不调用 quitAndInstall。主动作“下载 macOS 版”，打开固定官方来源的匹配架构资产；浏览器打开不代表下载完成，保持 manual/available 而非 downloaded。正式签名模式启用前验证 ZIP/元数据/签名/真实升级。
- 自动失败安静记录，手动检查在详情内明确反馈；暂无 Release 与“已是最新”区分。总量未知不计算百分比，已下载 100% 后校验完成前不允许安装；实际版本变更后才发送一次成功轻提示。

## 保存/窗口离开保护

现有 `UnsavedProvider`、`UnsavedGuard` 只处理应用内 runGuarded；仓库检索未发现 beforeunload/will-prevent-unload 注册。必须补齐窗口离开与更新握手，不能以“宿主正常关闭”代替“编辑器内容已保存”。

- 本地更新请求由主进程发起一次性 prepare request，绑定主窗口 wc.id/frame/导航 generation/requestId 和目标版本。renderer 在 UnsavedProvider 下复用真实 save/canSave/saveMode/dirty 契约，更新场景定制文案，不重建另一个保存状态源。
- 无改动才能直接确认；手动保存提供继续编辑/明确丢弃/保存后重启，自动保存不提供虚假丢弃，有/无可调用句柄分别处理。保存失败、保存期间再编辑、切换文档、窗口导航或过期响应使本次放行失效；保存过程中防止重复提交。
- renderer 响应不能独立触发安装，只有主进程持有用户从更新窗口发起的待执行请求才处理确认。为防确认后又编辑，准备离开阶段要限制新的编辑/导航；仍经窗口 beforeunload，拒绝关闭就中止更新请求并恢复使用。
- 通用窗口离开保护可在 renderer 中监听 beforeunload，由同步 ref 表示 dirty/正在写入；它不是远端安装桥。当前云端构建支持该保护时遵守阻止；旧云端能力未知时只允许用户先自行保存、再显式确认，不伪造已自动保存。不使用 executeJavaScript 读取远端 React 状态、不注入 preload。
- 流程先执行保存/窗口离开保护，再正常关闭主工作区，之后等待宿主关闭；保留独立更新详情窗口显示进度和错误。普通退出和安装准备的 window-all-closed/close 路径必须区分，取消离开不能误触发关闭宿主。

## 安装与宿主关闭

不能仅在 before-quit 中异步等待：已检查 6.x BaseUpdater.quitAndInstall 会先启动安装器，再调用 app.quit，现有 before-quit 已太晚。

提供共用、幂等的宿主关闭协调函数，普通退出沿用既有退出语义，更新路径先独占进入 preparing → 保存及窗口离开保护确认 → 关闭主工作区 → 等待宿主 HTTP/数据库关闭完成 → installing → 调用 quitAndInstall。更新关闭失败或超时必须中止安装、保持可诊断的受控退出/重启恢复路径，避免拿到已关闭一半的宿主继续假装正常使用；不得另开第二个宿主，不能把 timeout 当成功。对用户说明需要重新启动，保存明确错误。普通退出的现有 5 秒兜底不等价于更新安装成功条件。重复重启只允许一次调用，单实例锁保持不变。

## 验证与回滚

- 行为测试覆盖事件乱序、同帧重复、下载错误、稍后安装、同版提示持久去重、详情关闭重开、保存/关闭保护、清理及宿主关闭门；不只断言状态 enum。
- 产物测试检查 tag、架构、mac metadata 合并及引用 SHA-512、draft 发布不完整/已发布版本重跑规则。
- 实现阶段对本地标题栏/About 归档实际组件同内容/主题/尺寸的 HTML 前后对比；新增更新窗口归档全部状态并明确无旧版，保留既有对比稿。验证浅深/窄宽/键盘并用真实 Electron 检查焦点和通知。
- 本机可实际验证 macOS 构建和 manual 流程。Windows/Linux 由对应 GitHub runner 验证包启动，真实跨版本安装由环境可用性决定并单独记录。没有上一版更新器时，使用隔离的临时发布夹具验证并明确不是官方版本升级通过。
- 不修改 SQLite schema 或数据目录，回滚代码以恢复原包及更新入口。已发布不可变版本有问题则撤回 latest/发布修复版，不自动降级；涉及数据库迁移的旧版本回装必须遵从现有备份兼容性约定。
- 当前范围仅实现和本地验收、提交；实际推送、workflow_dispatch、打 tag 或公开发布需用户明确要求后执行。

## 主要风险

macOS 无证书会被 Gatekeeper 阻止、不能完成标准自动更新；Windows 无证书有信誉提示；GitHub 下载可达性依赖用户网络。Windows 和 Linux 的宿主依赖尚未验证。四平台依赖体积和安装成本需要真实 runner 证据。GitHub provider 与 builder 元数据必须选兼容版本，不能复制 v27 专属签名清单或新版 API。

## fnOS 原生流水线扩展

- 保留已启动 v0.1.1 基线；从下一稳定版本起，发布门包含四个桌面目标和 fnOS x86_64。桌面版本与 apps/fnos/manifest 的已提交版本须一致；仓库其他包版本不连带提升。
- 新 fnos-build.yml 为可复用原生 Ubuntu x64/Node22 工作流，允许手动构建 artifact；只读权限，固定官方 fnpack 工具版本和下载校验，不独立公开 Release。已有 fnOS build 继续负责 Web 前缀、宿主部署、原生 ELF/模块加载及真实 fpk 结构。设备安装验收不能用 Ubuntu 运行代替。
- 统一 stage contract：target fnos-x64、manual，产物 mimir-VERSION-fnos-x64.fpk 和 build-manifest.json，Actions artifact fnos-x64；汇总下载到 incoming/fnos-x64。fnOS 无 electron-updater yml，不改变桌面源和安装能力。
- desktop-release 调用 fnOS 工作流，aggregate 必须同时等待该 job 和四平台 build。全部真实字节、版本、大小、SHA256/SHA512 验证完成后才进入原有单写者 draft/publish；任何 fnOS 错误均阻止公开新 latest。
