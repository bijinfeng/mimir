# GitHub real-update harness independent review

2026-10-20；范围：`.github/workflows/desktop-update-verify.yml`、`apps/desktop/scripts/update-smoke{,-lib,.test}.mjs`、`update-smoke-native.ps1`、根 test 入口，以及 fresh-checkout Office CSS 生成修复。此记录是源代码审查和定向门，不是远端升级通过证明。

## 已修复

- 根 `package.json` 的 test 命令加入 `update-smoke.test.mjs`，让辅助协议回归持续进入质量门。
- 真实按钮操作改为可见、启用且中心点 hit-test 通过后由 CDP 发送鼠标事件；不使用 `button.click()` 绕过遮挡或隐藏状态。测试主动切换窗口只属于外部驱动操作，不证明通知焦点行为。
- 原脚本取消一次真实保存后，等待自动保存完成，再从干净编辑器重试；无法覆盖“保存并重启”。补充第二次真实输入并再次暂停真实 PATCH：实际点击更新重试和“保存并重启”，等待保存中，确认安装文件仍未更换，再放行真实 HTTP。升级后必须逐字匹配该 PATCH 正文、标题、标签、目录及 local 模式。
- Windows 除验证首版安装包匿名下载 SHA-256 外，还读取生产 `app-update.yml` 指定的 updater cache 与 `update-info.json`，校验真实 updater 下载缓存安装包的字节数和官方 target SHA-256；Linux 升级后 AppImage 校验 target SHA-256。
- 自动重启验证必须观察所有旧 Mimir PID 消失及全新 PID 出现；仅观察任意 Mimir 进程仍存活可能把旧进程退出阶段误算成自动重启。后续仍须重新启动已安装程序，验证 currentVersion 恰为 target 和保留文档可见。

## 产品问题（代码已修复，原生验收待执行）

`electron-builder.yml` 原配置 `oneClick:false/runAfterFinish:false` 与 `quitAndInstall(false,true)` 不能保证 Windows 完成更新后启动。锁定的 electron-builder 26.15.3 `NsisTarget.configureDefines` 对 assisted + false 定义 `HIDE_RUN_AFTER_FINISH`；`templates/nsis/assistedInstaller.nsh` 因而移除 StartApp/Run 完成页选项。`installSection.nsh` 对 assisted 安装仅在 silent 时执行 force-run；当前更新不是 silent。

实现代理已将 `runAfterFinish:true` 落地，保留 `oneClick:false` 和运行时 `quitAndInstall(false,true)`。审查者独立核对最终 diff 和锁定 builder 26.15.3 源码：assisted 分支不再定义 `HIDE_RUN_AFTER_FINISH`，完成页保留默认 Run 选项并通过 `StartApp` 启动；首次 `/S` 因无 `--force-run` 不会走 `installSection.nsh` 的 silent 启动分支。现有保存准备、真实窗口关闭、宿主关闭后安装顺序均未修改，`autoInstallOnAppQuit=false` 继续存在。

新增 native-updater 回归直接断言 `autoInstallOnAppQuit=false`，dispose 不触发安装；实现代理报告相关回归 36/36 通过，本次补审未重复重型测试。代码问题已修复；新的配置仍需远端实际向导验收，不能将旧配置构建视作修复后的证据。

## 独立通过的定向门

- `pnpm --filter @mimir/renderer exec vitest run vite-preset.test.ts`：3/3，实际 CSS 生成/可用样式与生成失败导致构建失败。
- `pnpm --filter @mimir/renderer typecheck`：exit 0。
- renderer 两文件 oxlint 与 oxfmt check：exit 0。
- E2E 三个 mjs 的 oxlint、四个源码/根 package/workflow 的 oxfmt check：exit 0。
- `node --check apps/desktop/scripts/update-smoke.mjs`：exit 0。
- `node --test apps/desktop/scripts/update-smoke.test.mjs`：6/6，稳定版本/官方资产限制、实际字节哈希、bounded polling、CDP 乱序/关闭/异常失败。
- `/tmp/mimir-actionlint/actionlint .github/workflows/desktop-update-verify.yml`（v1.7.12）：exit 0。
- `git diff --check`：exit 0。

CSS 修复使用既有生成器，在共享 Vite preset 的 buildStart 阶段、导入解析前执行；绝对脚本路径 + `process.execPath` 支持原生平台，无 shell 插值，失败立即终止构建。原作者已另外记录删除 ignored editor.css 后实际桌面构建成功；本审查独立跑上述三项定向门，未重复重型打包。

## 尚未验证 / 不能声称

- Windows/Linux workflow 真实官方双版本升级、Windows PowerShell/UIAutomation 实际交互以及 NSIS 新配置原生向导仍须远端执行；本机未模拟为成功。
- CDP 可证明文件页面与生产按钮/状态，不证明原生通知投递或系统焦点；脚本结果明确保留该限制。
- macOS ad-hoc 包仍为手动更新，不在自动安装 matrix 中。
- 本子代理依主会话要求未另跑全仓 pnpm check；远端 CI 和主会话负责最终完整门。
- 未提交、推送、创建 tag 或发布 Release；交主会话集成。

## AppImage 文件名补审（代码已修复，原生重跑待执行）

第二轮真实 Linux 日志 `github-linux-smoke-failed.log` 同时包含 builder 输出 `release/mimir-0.1.0-linux-x86_64.AppImage`、包内容校验通过和 smoke 试图启动 `linux-x64.AppImage` 的 ENOENT，根因是 builder 对 AppImage `${arch}` 的扩展名专属转换。

独立检查 `package.mjs`：在现有原生平台/架构断言之后，以 `nativeArtifactName(process.arch)` 将唯一文件名中的架构固定为 Node 的 x64/arm64；继续由 builder 解析 version/os/ext 宏，没有改二进制目标架构，也未放松 publish 前的四目标文件/哈希检查。实际 build 入口使用该 config override，修复覆盖了 smoke、stage 和公开 Release 的统一文件名契约。

独立运行 `node --test apps/desktop/scripts/release-artifacts.test.mjs` 12/12 通过；新增回归调用锁定 builder 的真实 `computeArtifactName`，复现旧 AppImage x86_64 映射，并验证修复后 mac 双架构 DMG/ZIP、Windows EXE、Linux AppImage 的实际宏展开。两个文件 oxlint/oxfmt check 和 git diff check 均通过。仅文档补审，无其他源码修改。真实 Linux AppImage 启动/升级仍需新构建远端验收。

## Windows 资源与干净 CI 修复补审

本轮生产源码范围：`deploy-server.mjs`、`after-pack.mjs`、`resource-tree.mjs`；测试/宿主准备：新资源测试、根 test 入口、Office Vitest config、CI 中文系统字体安装。独立审查未修改上述源码。

- 生产 deploy 单独使用 `--node-linker hoisted`，没有改变仓库根依赖布局或供应链策略。afterPack 完成点目录复制后检查整个 server 树；只对 canonical root 内的相对文件别名执行一次物化，拒绝目录链接、绝对/越界目标、坏链接和特殊文件。没有采用解引用依赖图、修改版本解析或默许 runner 路径残留。
- 新资源行为测试真实迁移目录、删除源树，再 require 两份嵌套依赖版本及隐藏 dist 内嵌模块；拒绝各类不可移植链接。独立运行资源+发布脚本 17/17 通过。
- Office config 在 suite collection 前同步执行已提交生成器，绝对路径与 process.execPath 不依赖 shell；失败传播，不改变 timeout、测试范围或断言。CI 安装 `fonts-noto-cjk` 是原生字体宿主准备；真实 PDF 字形覆盖拒绝、中文换行及保存断言未放松。
- 已检查实现代理 `github-ci-fixes.md` 及 Ubuntu 官方 TTC 的真实 vendor/PDFium 诊断证据；它支持字体缺失这一因果判断，不能替代新的 Ubuntu CI。
- 受影响七文件 oxlint/oxfmt check 与 CI actionlint 独立通过。`git diff --check` 通过。实现代理真实迁移 43551 文件/零链接及 SQLite/vec/Jieba/dict/Canvas 加载记录已核对，本审查未重复重型打包，亦未声称 Windows 安装通过。

最终全仓 `pnpm check` 已在无其他本机打包竞争时完成，**exit 0**；完整输出保留 `github-local-pnpm-check.log`，末行 `FINAL_EXIT_CODE=0`。未更改任何 timeout、规则或排除。

实际通过：Office 235 files/2774 tests、renderer 85/636、server 122/1365 + local 10 + fnOS 4 + SQLite backup Node 2、desktop 12/110，根 Node 29（含新增资源及发布/E2E辅助测试）。Storage 中两个需显式 S3 环境的既有 integration 用例按原配置 skipped，不是本轮新增跳过；真实 S3 另由 CI 专项执行。lint、styles、format、全部 workspace typecheck 均通过。

本报告覆盖本轮冻结的资源与 CI 修复；随后其他代理新增的 macOS manual smoke 文件不在此次独立源码审查范围。实际四平台 runner、NSIS 和官方跨版本更新仍按主会话远端验收记录判断。

## macOS manual smoke 独立补审

独立检查 `manual-update-smoke.mjs` / `.test.mjs` 与 `mac-manual-update-plan.md`：固定匿名官方稳定版及精确架构 URL、大小/SHA-256，启动/替换路径均为一次 mkdtemp 下代码拥有的 app 副本，userData 显式隔离；先正常窗口关闭并验证主进程 code 0/无 signal，再手工替换 ZIP 内 app。相同 userData 重启后验证 target 版本、manual 能力、local 模式及完整原文档，留存真实 renderer HTML/PNG。没有直接调用安装器、伪造保存响应、触碰已安装 /Applications 客户端或宣称自动更新。

补审修复：TitleBar 原 `button.click()` 改为可见/启用/中心点 hit-test 后 CDP 真实鼠标事件；下载按钮可见性断言增加启用及布局/visibility 检查。新增 helper 测试加入根 test 命令。2/2 helper 测试、受影响 mjs oxlint、三文件 oxfmt check、Node syntax、git diff check 通过。

此前完整 `pnpm check` exit 0 记录保持；本次只追加上述定向门，未重复全仓。实际官方双版本尚待发布后执行，不把脚本/辅助测试视作真实手工替换已通过。按钮未点击打开系统浏览器、Gatekeeper/quarantine/公证、原生通知焦点仍为明确限制；Node 官方 ZIP 下载只能验证手工替换分发链。

## Windows ASAR 路径校验独立补审

已核对锁定 `@electron/asar 3.4.1` 源码：listFiles 使用宿主 path.join 构造显示名，extractFile/getFile 遍历按 path.sep 切分。原 POSIX 展示名后缀检查在 Windows 可产生假阴性；新 helper 统一将输入的两种分隔符转为本机规范路径，再读取真实 ASAR entry，覆盖外层 package、根 updater、main、preload 和三个 renderer HTML。

新校验直接验证根依赖的真实 name/version 及 main 非空字节，规范化后不允许 main 逃出 updater 目录；外层 dependencies 声明或其他模块的嵌套 updater 均不足以通过。没有更改 updater 打包策略/版本，也没有仅删除有问题的检查。

独立运行真实 ASAR fixture 回归 6/6 通过；三个 mjs oxlint、四文件 oxfmt check、入口 Node syntax、git diff check 通过；根 test 入口已保留此前条目并追加新测试。未重复全仓检查，此前全仓 exit 0 的记录保留。此补审仅确认跨平台读取修复与严格内容检查；真正 Windows archive、已安装客户端及升级仍由下一轮原生 runner 验收。源码无新增审查问题，可冻结提交。

## Node 22 worker 与 CI 调度独立补审

已独立检查冻结的 `chat-attachment-prepare.ts`、新增真实 heap exhaustion 回归、CI workspace 调度配置，以及 `github-ci-second-fixes.md` 的证据与边界。无新增代码问题，无源码修改。

- 仅 source `.ts` 入口且现有 extensionOf 分类为 PDF 时，解析父包已声明的固定 pdfjs 主/worker 两模块 URL，在同一个受限 worker 内、tsx 注册前执行原生 ESM import。随后仍执行真实 source worker 和纯 parser，沿同一锁定 PDF.js 路径处理原字节；没有选择旧 dist、伪造提取结果或更改 MIME/签名/扫描件拒绝逻辑。
- compiled `.js` 分支不做预载、不注册 tsx；worker 192MB old/16MB young 与30秒准备预算不变，取消/超时及 finally termination 路径未修改。Node22真实 OOM 测试断言错误拒绝且线程已终止，不能把崩溃算成功。
- 锁定 pnpm 12.4.2 独立运行 `PNPM_CONFIG_WORKSPACE_CONCURRENCY=1 pnpm config get workspace-concurrency` 返回 `1`。配置仅作用 CI 的完整 pnpm check，串行 workspace，无测试删减或 timeout 调整；是否解决 GitHub 争用仍待远端结果。

独立验证使用 **Node22.23.1**：

- `worker-heap-probe.mjs --preload` 真实PDF结果精确为 `PDF attachment`，parsed时 used heap 36,178,256 bytes（在原预算内）。
- 实际 `chat-attachments.test.ts` 聚焦 Office/PDF真实提取与扫描/损坏拒绝、真实 heap OOM拒绝/termination、timeout/abort后可继续准备：**3/3通过**；其余27项本次由 -t 未选，不是产品配置新增跳过。作者另有完整143项证据。
- `node node_modules/typescript/bin/tsc --noEmit` 通过。
- 两TS文件 oxlint、三文件 oxfmt check、CI actionlint、git diff check 通过。

此前全仓 exit0 日志保持，但它使用本机Node25，不能替代本轮新增Node22门；本次未重跑全仓。源码可冻结提交。新GitHub完整CI、Postgres/S3专项、原生构建及真实升级仍由主会话验收。


## 最终 Node22 串行完整质量门

按主会话要求，仅启动一次完整门：PATH 前置 `/Users/admin/.nvm/versions/node/v22.23.1/bin`，`PNPM_CONFIG_WORKSPACE_CONCURRENCY=1 pnpm check`。实际版本在日志首部记录为 **Node v22.23.1 / pnpm 12.4.2 / workspace-concurrency 1**。已结束且 **FINAL_EXIT_CODE=0**，完整日志 `github-local-node22-pnpm-check.log` 已关闭写入。

lint/styles/format、全部 workspace typecheck、全部现行测试入口均通过：Office 2774、renderer 636、Server 1366（含新增真实OOM拒绝/termination）+local10/fnOS4/SQLite备份2、desktop110及根Node43。既有需显式S3环境的integration skip保持原样，无新增跳过、排除、超时或内存放宽。此结果证明本机Node22串行完整门通过；GitHub runner的Postgres/S3、正式资产及实际升级结果仍单独以远端证据验收。

## fnOS 同版发布集成独立窄审

已审 `release-artifacts.mjs/.test.mjs`、`publish-release.mjs`、desktop release workflow 接口、README 及 `fnos-release.md`。无新增代码问题，本审查未修改实现文件。

- `targets` 保持四个Electron目标；`releaseTargets` 独立加入 `fnos-x64`（linux/x64/manual/FPK）。版本门要求已提交 desktop package 与 fnOS manifest 唯一、无填充版本完全匹配 stable tag。
- 每个stage及aggregate验证目标键、platform、arch、version、mode和regular非空资产实际字节size/SHA256/SHA512。五目标缺一、FPK篡改或身份不符时输出目录尚未创建。FPK不产生或引用Electron YAML/blockmap。
- 最终manifest强制FPK完整；publish实际入口在remote mutation前验证本地下载目录的regular file、size及两种hash。draft全部上传后逐件size/SHA256核验，FPK上传/摘要失败不能公开；已公开资产不可变。
- desktop aggregate显式needs原四目标和fnos复用job，下载接口是`fnos-x64`；当前fnos-build workflow_call的version输入及artifact名与之匹配，manual dispatch仍不发布。
- README与报告明确FPK经fnOS系统管理，不代表Electron自动更新，也未把fixture字节当作真实可安装FPK。

独立 **Node22.23.1 release脚本18/18通过**；三个mjs lint、四文件format、git diff check通过。native fnOS build冻结后，两个workflow经actionlint v1.7.12与oxfmt联合检查均exit0；artifact保留期已由实现者统一为14天。此前全仓门保留，当前集成新增部分以本轮定向门为准。

## fnOS 原生链独立补审

按主会话追加范围，独立检查 `build-fnos.mjs`、`fnos-fnpack.mjs`、`fnos-artifacts.mjs`、`fnos-native.mjs`、`verify-fnos.mjs`、两份fnOS测试、源manifest、根test入口、最终复用workflow及两份README/`fnos-build.md`。无新增实现问题，本次仅补验收记录。

- 原生Linux x64/Node22门在构建/验证入口均存在；固定官方fnpack 1.2.3 URL、SHA256与ELF检查，构建前再次核验。版本取已提交desktop与fnOS源manifest，最终FPK内manifest再核对appname/version/platform/runtime，不以文件名代替内容检查。
- 仅生产部署使用hoisted，复用有限资源finalizer；构建和重新解包后均实际加载SQLite/vec/Jieba字典/Canvas，验证所选原生模块位于包内、为Linux x86_64 ELF，不接受仓库依赖回退。FPK路径和符号/硬链接检查先于解包；真实FPK内宿主与Web独立解包再验证，测试配置在FPK生成之后写入忽略的验证目录。
- 真实Socket烟测通过原生命周期脚本安装/启动/停止；请求覆盖健康、Web、未登录401、HTTP/HTTPS登录Cookie Path/Secure与已登录文档读取，凭据使用统一 `admin@example.com / 12345678`。只读权限构建job中不注入发布凭据，外层timeout45分钟和HTTP15秒预算保留。
- workflow顺序为真实打包→解包/原生模块/Socket烟测→stage真实字节hash→上传，五目标汇总/发布门保持；根test保留旧入口并加入新增fixture测试。README与报告均区分Ubuntu宿主验证与fnOS设备安装。

独立运行 `/Users/admin/.nvm/versions/node/v22.23.1/bin/node --test scripts/fnos-build.test.mjs scripts/fnos-package.test.mjs`：**8/8通过**。七个mjs的oxlint、上述七文件加两workflow和根package.json共十文件oxfmt、两个workflow actionlint均exit0。本轮无TypeScript源码变化；此前Node22完整typecheck通过，本次不重复重型全仓门。规范同步建议已交主会话：architecture §8.6.1与desktop releases-updates须反映固定工具、验证入口和五目标发布。

本机为macOS ARM64，未执行当前真实Linux fnpack或真实FPK Socket烟测；这两项等待GitHub runner。五目标公开发布/匿名下载及fnOS设备首装、HTTPS内嵌入口和覆盖升级保留资料，仍须各自真实证据，不以8项fixture/生命周期测试代替。
