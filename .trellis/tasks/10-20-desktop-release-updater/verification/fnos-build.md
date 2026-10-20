# fnOS 原生构建与包内验证

日期：2026-10-20。当前本地环境为 macOS ARM64；本记录不将本地脚本测试当作 Linux 原生打包或 fnOS 实机通过。

## 官方工具与参考证据

- 官方工具说明：<https://developer.fnnas.com/docs/cli/fnpack/>，本次访问 HTTP 200，页面实际链接固定 Linux amd64 版本 <https://static2.fnnas.com/fnpack/fnpack-1.2.3-linux-amd64>。
- 本次下载并校验 `fnpack 1.2.3`：SHA-256 `54b97fa7b70968c4d05c79840f5daeff508957d0bb2062fdb0376d00d9615c93`；`file` 识别为静态 Linux x86-64 ELF，BuildID `044b07cb080960f546032ad919c0c804587b7a64`。脚本固定 URL 和校验值，构建前再次校验，不从 PATH 寻找不明工具。
- 按项目调研规则核对 WeKnora 官网 <https://weknora.weixin.qq.com/>（HTTP 200）和公开源码 <https://github.com/Tencent/WeKnora>，当前发布参考为 [v0.8.3](https://github.com/Tencent/WeKnora/releases/tag/v0.8.3)。现有任务研究记录的源码快照为 `8dab7550f5069ef80877a65b52dc5483c45f7827`；其 `.github/workflows/app.yml` 是 Go/Rust 桌面构建，不提供 fnpack 原生包契约。可参考其原生 runner 分工，不能用于证明 Mimir FPK 结构、Node 原生依赖或 fnOS 安装行为。
- 旧任务 `10-11-fnos-native-platform` 的 `fnpack 1.2.3` / QEMU Node22 解包与 Socket 记录及本地旧 `mimir.fpk` 只作为历史结构参考；没有重新命名成当前版本或当作本次产物。

## 可执行契约

- 只在原生 Linux x86_64 / Node22 构建，复用工作流为 Ubuntu 24.04；不生成 ARM 包。
- 已提交桌面版本与 fnOS 源 manifest 必须完全相同。最终包 manifest 再验证 `appname=mimir`、相同 version、`platform=x86`、`install_dep_apps=nodejs_v22`，容许官方 fnpack 输出的对齐空格，拒绝重复字段。
- 仅生成物使用 hoisted deploy；根安装策略、锁文件和安全策略不变。资源 finalizer 复用桌面实现，不递归完整解引用整棵依赖树。
- 输出 `mimir-VERSION-fnos-x64.fpk`。官方 fnpack 真实打包后只接受一个 FPK。
- stage 前解包外层 tar 与 app.tgz，拒绝路径逃逸和链接，验证持久独立的服务端/迁移/Web 内容、原生模块真实加载和 ELF CPU；从解包目录通过生命周期脚本启动真实 Unix Socket 宿主。
- smoke 验证健康页、Web 入口、未登录拒绝、HTTP 与代理 HTTPS 登录 Cookie 的 Path/Secure、携带 Cookie 的文档请求。临时测试账号统一为 `admin@example.com / 12345678`，验证配置在 FPK 生成后写入忽略目录，最终停止宿主。
- `fnos-build.yml` 只读仓库、上传 `fnos-x64` artifact；版本经桌面 release helper 验证。调用方汇总同版五目标；fnOS 使用 manual 更新能力，不产生 Electron 更新元数据。

## 本地检查

- `node --test scripts/fnos-build.test.mjs scripts/fnos-package.test.mjs`：8/8 通过，真实 tar 嵌套夹具覆盖解包、错版本和符号链接拒绝；既有安装测试覆盖配置不泄密与幂等。
- 所有本轮 fnOS JavaScript `oxlint`：通过。
- 所有本轮 fnOS JavaScript、工作流、根 package.json `oxfmt --check`：通过。
- `actionlint .github/workflows/fnos-build.yml`：通过。
- `git diff --check`：通过。
- 根 `test` 入口已加入 `scripts/fnos-build.test.mjs`，保留原有全部测试。

原始聚焦测试日志：`fnos-targeted-tests.log`。全仓质量门由主会话集成后记录。

## 待远端执行与设备边界

原生 Linux 真实完整构建、FPK 解包与 Socket smoke 本地尚未执行，等待 GitHub Actions 记录；本机架构门会拒绝伪造结果。五目标 Release、匿名 FPK 下载及发布资产哈希以主会话远端验收记录为准。

真正 fnOS 设备上的应用中心安装、首次配置、图标入口、最低系统版本、HTTPS 网关、覆盖升级与资料保留仍需实机证据。Ubuntu 宿主 smoke 通过也不代表这些设备验收已完成。

## GitHub 原生构建通过

修复干净检出路由生成后，master `5d8924f` 对应完整五目标手动 [39387632456](https://github.com/bijinfeng/mimir/actions/runs/39387632456) 的 `fnos / build` 已完成 success。真实官方 fnpack FPK 构建、解包/原生模块/Unix Socket 宿主和认证验收、stage及上传全部执行成功；实际步骤结果见 github-fnos-native-success.json，日志单独保存。此时四客户端矩阵仍在执行，未公开 Release；匿名正式资产分发和 fnOS 真机覆盖升级尚未取得证据。

## 正式 v0.1.3 同版发布与匿名分发

`c402ec5` 对应 [39397577723](https://github.com/bijinfeng/mimir/actions/runs/39397577723) 全部success：fnOS与四客户端、aggregate和publisher均通过，15项资产一次公开于 [v0.1.3](https://github.com/bijinfeng/mimir/releases/tag/v0.1.3)。发布器使用自身短期GITHUB_TOKEN完成create/upload/digest/publish，无人工创建草稿或额外workflow权限。

- 正式资产：`mimir-0.1.3-fnos-x64.fpk`，asset ID `658881928`。
- 匿名curl从GitHub公开下载URL实际获取 **170577623 bytes**，HTTP200，平均约1134493 bytes/s；未提供cookie、PAT或Authorization。
- 随后匿名REST读取正式tag元数据，完整下载文件SHA256与公开asset digest均为 `63fc06369b2419af3ce433809680787c97af1bd6688a336320b845e83b236117`。
- 记录：`public-v0.1.3-release.json`、`public-v0.1.3-fpk.json`、`github-v013-published.json`。第一次匿名REST碰到当前出口每小时quota耗尽，09:49:54Z重置后正常通过；该限流未被当成权限或安装结果。

该结果证明真实原生FPK、统一正式发布和匿名文件分发；fnOS设备的应用中心安装、覆盖升级和资料保留仍未实测，前述设备边界不变。

## 正式 v0.1.4 同版发布与匿名分发

[39402594994](https://github.com/bijinfeng/mimir/actions/runs/39402594994) attempt2整体success，五目标、aggregate和publisher均通过，15资产正式公开于[v0.1.4](https://github.com/bijinfeng/mimir/releases/tag/v0.1.4)。原始tag固定127d4b7，未移动或覆盖公开资产。

匿名公开浏览器URL实际下载`mimir-0.1.4-fnos-x64.fpk`，大小 **170577526 bytes**，SHA256 **6d2896401949129658d10a11fe03757643b8d903df06e96b3dc7e92d55b38dc4**，与GitHub asset ID `659016028` 的公开digest完全一致。当前本机github.com曾3次连接超时，curl原样重试后成功，不含PAT或cookie；未将短暂网络故障冒充包校验问题。记录public-v0.1.4-release.json、public-v0.1.4-fpk.json及github-v014-published.json。fnOS设备的安装/升级仍未实测。
