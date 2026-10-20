# Desktop release validation

日期：2026-10-20。本机 macOS ARM64；版本 0.1.0。以下最终包包含质量检查最后冻结的运行时修复（安装错误恢复、空 Release 判定、关闭否决反馈与通知失败隔离）。验证结束后不再修改实现源码。

## 最终构建和真实运行

在仓库根目录执行下列完整命令，整体 exit 0。使用镜像只解决本机 Electron 二进制下载网络问题，不改变锁定版本或 Actions 下载源。

```sh
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ pnpm desktop:build > /tmp/mimir-desktop-complete-build.log 2>&1 &&
node apps/desktop/scripts/verify-package.mjs mac-arm64 0.1.0 &&
MIMIR_SMOKE_EXECUTABLE=/Users/admin/Desktop/mimir/apps/desktop/release/mac-arm64/mimir.app/Contents/MacOS/mimir \
node apps/desktop/scripts/smoke.mjs > /tmp/mimir-desktop-complete-smoke.log 2>&1
```

`verify-package` 输出：`Verified mac-arm64 package 0.1.0 (manual)`。验证包括 asar 入口、主/普通预加载/更新专用预加载、三个 HTML 入口、updater 依赖、固定 GitHub 更新配置、生产服务资源，以及真实加载 SQLite + sqlite-vec、Jieba 词典和 Canvas 原生依赖。

真实 Electron packaged smoke 全部通过：A 本地模式启动、真实生产渲染产物/样式、免登录令牌和文档/目录读取；B 首次启动选择页无需启动宿主；C 云端页面加载、拿不到桌面桥、没有启动本地宿主。最终实际执行的是生成包内的 Electron，可执行路径见上。源码构建结果和模拟 updater 测试不替代这些真实包验证。

日志：[desktop-build-final.log](desktop-build-final.log)、[desktop-packaged-smoke-final.log](desktop-packaged-smoke-final.log)。Electron 锁定版本 44.7.0；electron-builder 26.15.3；electron-updater 6.8.9。

## 最终产物与哈希

实际文件位于 `apps/desktop/release/`，没有复制大包进任务目录。最终应用为 `apps/desktop/release/mac-arm64/mimir.app`；默认 ad-hoc 签名，更新能力为 manual。

| 文件 | 精确字节数 |
|---|---:|
| mimir-0.1.0-mac-arm64.dmg | 481557958 |
| mimir-0.1.0-mac-arm64.zip | 516401153 |
| mimir-0.1.0-mac-arm64.dmg.blockmap | 500277 |
| mimir-0.1.0-mac-arm64.zip.blockmap | 514142 |
| latest-mac.yml | 503 |

```sh
node apps/desktop/scripts/release-artifacts.mjs stage apps/desktop/release /tmp/mimir-release-stage-final mac-arm64 0.1.0 manual
```

上述命令 exit 0；逐个验证实际资产名、架构、版本、大小、完整 SHA512 和更新元数据引用，并输出 SHA256。最终记录：[mac-arm64-build-manifest.json](mac-arm64-build-manifest.json)、[mac-arm64-latest.yml](mac-arm64-latest.yml)。旧 `/tmp/mimir-desktop-review/mimir.app` 的 ZIP 解压 CUA 快照与此最终包是独立快照，不能混用哈希。

## 脚本与配置验证

- `node --test apps/desktop/scripts/release-artifacts.test.mjs`：11/11，通过版本/元数据拒绝、真实文件篡改、双架构汇总、已发布版本不可变、draft 恢复、上传/摘要失败、缺失资产不发布等验证。
- `pnpm install --frozen-lockfile --offline`：通过。
- `oxlint` / `oxfmt` 对本轮发布脚本与 workflow 的定向检查通过；`git diff --check` 通过。最终全仓质量门由 quality_check 在打包完成、机器空闲后重新运行，详见其独立报告。
- `/tmp/mimir-actionlint/actionlint .github/workflows/desktop-release.yml .github/workflows/ci.yml`：actionlint v1.7.12，exit 0，无诊断；[desktop-actionlint-final.log](desktop-actionlint-final.log)。YAML 解析通过。
- Runner 标签来自官方 runner-images README commit `82d1b86ad393865982dd29535cb8d3adbc68e41e`（2026-10-19T14:08:36Z）：`macos-15` ARM64、`macos-15-intel` x64、`windows-2025` x64、`ubuntu-24.04` x64。来源：https://github.com/actions/runner-images/blob/82d1b86ad393865982dd29535cb8d3adbc68e41e/README.md

## 边界和后续验收

本轮未推送、未创建 tag、未触发远端 Actions、未发布 Release、未配置真实 secrets。Windows/Linux/macOS Intel 原生 runner 构建、Windows NSIS 安装后烟测、Linux 实际 AppImage 烟测已写入 workflow，尚未运行远端验证。没有正式 mac Developer ID 和公证凭据，因此本机 ad-hoc 包只能用于手动安装更新；签名/公证模式需凭据后验证。没有真实首发/后续版本，未执行真实跨版本自动升级、系统完成通知、公开 Release 下载或正式签名 mac 升级。本机通过不代表四系统升级已通过。
