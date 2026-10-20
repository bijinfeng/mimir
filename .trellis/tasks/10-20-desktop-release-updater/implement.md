# 执行计划

## 开始前

- [x] 用户批准最新完整方案及 ux.md，含已选轻提示、独立更新窗口、默认自动下载可关闭、保存保护后确认重启、macOS 手动更新和稳定 tag 发布。
- [x] 检查最新 git status，不包含其他任务改动；随后 task.py start。
- [x] 加载 Phase 2.1 并派发 trellis-implement，提示首行 Active task 指向本目录，明确职责、共享工作区及不得覆盖他人改动。

## 实现顺序

1. [x] 确定兼容 builder 26 的 electron-updater 6.x 稳定版本，声明运行时依赖并更新 lockfile，保持供应链 minimumReleaseAge 策略；确认依赖在 asar 中可解析。
2. [x] 实现纯逻辑可测的更新控制器和 native Electron 适配；严格限定新增 shared 契约/IPC 的作用面：独立本地更新窗口可发动作，本地主窗口只读状态/打开详情/回应保存准备；远端网页不装桥、不发安装。
3. [x] 实现独立更新详情 HTML/preload 入口、单例窗口、TitleBar/About 状态入口与系统菜单；主进程为唯一状态源。下载完成仅非模态轻提示，同版提示持久去重；自动下载开关、关闭重开、mac manual/开发态/非 AppImage 边界完整。
4. [x] 在现有 UnsavedProvider/Guard 下接入一次性准备重启请求、通用 beforeunload 和场景文案；覆盖自动/手动保存、有/无句柄、失败/迟到/新改动及旧云端能力未知。禁止远端安装桥，验证请求必须由主进程 pending intent 发起。
5. [x] 将宿主关闭抽成共用协调器，先关闭后启动安装器；覆盖失败、超时、重复和迟到事件，不削弱原单实例和普通退出逻辑。
6. [x] 更新 builder 配置，DMG+ZIP、NSIS、AppImage 及唯一命名、固定 GitHub publish/provider 和包内能力标记；预留显式正式 mac 签名模式并保持默认测试包可构建。
7. [x] 版本/产物校验及 mac 双架构元数据汇总脚本与行为测试，覆盖真实文件/哈希、非法 tag、文件缺失与跨架构冲突。
8. [x] 发布 workflow 四平台原生 runner，构建 job 只上传 artifact，不直接发布；汇总 job 单点 draft 完整上传后发布。手动触发仅测试构建；修复已有 CI master 分支。
9. [x] README/桌面运行规范更新发布操作、证书与 Secrets、系统提示、手动安装首版及验证边界。按照 ux.md 归档真实组件的浅深/窄宽状态与 TitleBar/About 前后 HTML 对比，保留旧稿。原生菜单/焦点实测和原生通知外部验证的状态分别记在 verification/results.md，不将组件图当系统通知证据。

## 验证命令及门

- [x] 更新器/退出协调器：`pnpm --filter @mimir/desktop test`（可在开发中用 Vitest 路径聚焦），包含 deferred promises 与 fake timer 的并发/失败、状态去重及安全退出验证；renderer/保存契约的受影响行为测试一并运行。
- [x] 发布脚本：`node --test <新增发布脚本测试>`；加入根 test 入口；校验使用 fixture 内容而非仅匹配 YAML 文本。
- [x] YAML 使用可用的 actionlint/语法工具检查，校验 workflow 权限、表达式、跨 job 版本及 artifact 关联；缺工具时说明替代检查和限制。
- [x] `pnpm check`，失败需定位，不用扩大排除/关闭规则来通过。
- [x] `pnpm --filter @mimir/server build`、`pnpm --filter @mimir/desktop build`、`pnpm desktop:build`（本机 mac 测试包），检查 app-update.yml、包内运行时依赖、宿主资源、DMG/ZIP 和架构信息。
- [x] 运行现有 `node apps/desktop/scripts/smoke.mjs`（以实际支持的 cwd/参数为准）确认真实 Electron 本地模式启动；原生菜单在选择页/本地/云端的入口人工验证，记录 mac 无证书只能手动更新。
- [x] 如需登录验证统一使用 admin@example.com / 12345678 / admin；不创建其他账号。
- [x] Windows/Linux runner 构建及安装验证、真实跨版本升级单独登记；未触发远端工作流不能当成通过。完成实现但外部验证欠缺时最终报告明确状态，不假称四平台自动更新均已验收。

## 检查与收尾

- [x] 派发 trellis-check 全范围检查，可修复所拥有改动并重跑受影响质量门；主会话核对 spec、版本/发布数据流与凭据边界。
- [x] 按实际变化更新唯一归属规范；只有重要实质取舍才追加决策。
- [x] 检查 git diff，将本任务代码、测试、规范与任务记录按功能及时提交，记录 commit；不混入他人改动，不推送。
- [x] 根据实际验收状态完成/保留任务，记录未验证平台与正式签名条件，执行 finish-work 日志流程。

## 风险文件与恢复点

- `src/main/index.ts` 的 before-quit/窗口菜单、详情单例和宿主句柄：更新器不得绕过保存/窗口关闭保护或提前执行安装，不得改变云端隔离边界；多窗口不能让普通关主窗口变成宿主常驻。
- `scripts/after-pack.mjs`：保留含 .pnpm 依赖资源复制，不让测试 codesign 覆盖正式签名。
- release workflow/元数据汇总：四个构建完成前不得公开新 latest；已公开资产不得被重跑覆盖。
- renderer UnsavedProvider/Guard：复用单一脏状态与保存句柄，不能为更新另设一份会漂移的脏状态；迟到响应/导航失效/旧云端路径要有行为测试。
- package/lockfile/builder 版本一致；失败时保留可诊断构建产物，在进入发布 job 前停止，无需改变用户数据。

## 最终质量门

2026-10-20：全仓 `pnpm check` exit 0；桌面端 109 项、renderer 634 项、Office 2774 项、根 Node 17 项（含发布脚本 11 项）通过。最终 mac ARM64 打包、包内原生模块校验和真实 packaged smoke A/B/C 通过；actionlint 通过。外部验收只完成登记，尚未执行 Windows/Linux/Intel runner 和真实升级。任务保持 in_progress，不归档；本轮不推送或发布。

工作提交：`fef57cca565a6d73f7ea3a2bb9eb6c5c0b4e32c5`。提交和记录由项目 AGENTS.md「每轮实现与验收完成后，及时提交」授权；任务保留进行中，不执行归档。

## GitHub 全流程验收（用户新授权）

- [x] 检查远端 master 和工作区，以 fast-forward 合并已有实现并推送。
- [ ] 运行 GitHub CI 和四目标原生构建，修复实际 runner 问题并复核。
- [ ] 创建首版和后续稳定补丁版，验证完整资产统一发布与匿名下载。
- [ ] 在真实 Windows 安装版、Linux AppImage 上通过独立外部驱动验证官方下载、普通退出不安装、显式重启安装及资料/模式保留。
- [ ] 验证 macOS 检查更新与手动下载路径，明确无证书自动安装边界。
- [ ] 复核新增测试/工作流，提交、推送规范与完整远端证据，按实际验收状态收尾。
