# GitHub 原生构建、发布与更新验收

2026-10-20，用户明确授权合并 master 并在 GitHub 验证整个更新流程。

## 已执行

- origin/master 与原 master 同为 0a41e65，工作区干净；无其他远端新增提交需要合并。
- `git switch master`、`git merge --ff-only codex/desktop-release-updater`、`git push origin master` 成功，master 到 e66c2c3。
- 仓库默认分支 master，公开可见。此前无 v* tag 或正式 Release。
- 原生手动构建：[39377657202](https://github.com/bijinfeng/mimir/actions/runs/39377657202)。
- 合并后 CI：[39377655808](https://github.com/bijinfeng/mimir/actions/runs/39377655808)。

## 验收顺序

1. 四目标原生构建、包资源验证、真实 smoke 和产物汇总；手动 workflow 不发布。
2. 发布首版稳定 v0.1.0，再发布后续补丁版 v0.1.1；不移动已公开版本或覆盖资产。
3. Windows NSIS 与 Linux AppImage 从官方公开资产安装旧版，真实界面驱动发现/下载、普通退出不安装、显式安装重启和资料/模式保留。
4. 无正式签名凭据的 macOS 验证检查及官方手动下载路径，不能声称自动安装。

结果在运行完成后补全；尚未取得的远端/真实系统结果均不视为通过。

## 首轮失败与修复

手动构建 39377657202：版本门通过，四个原生目标在 desktop build 同因缺少 ignored `editor.css` 失败；aggregate/publish 跳过，未创建公开 Release。修复在共用 renderer Vite buildStart 调用现有生成器；删除本机生成物后真实构建成功，独立 checker 的 3 项回归、typecheck/lint/format 通过。详见 github-build-fixes.md 和 github-initial-build.json。
