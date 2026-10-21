# 独立检查与提交准入 · 2026-10-21

## 结论

允许进入本任务提交。代码审阅无未解决的产品问题；最终原 `pnpm check` 在干净临时副本 **exit 0**。没有修改测试断言、超时、跳过项、Vite 安全规则或产品依赖。

验证基线为 `013bb68`，先在 `/Users/admin/.codex/worktrees/icon-verification/mimir` 核验 task-only 改动，再复制到 `/tmp/mimir-icon-full-verification`（日志 canonical 路径 `/private/tmp/...`）执行最终门禁。核对 28 项任务产品/规范/派生资源路径，临时副本与验证 worktree 逐字一致。最终 docs 与规范空行整理也已同步后再执行原门禁。

## 最终质量门

工作目录 `/tmp/mimir-icon-full-verification`，执行命令：

```sh
PATH=/Users/admin/Library/pnpm/store/v11/links/@/pnpm/12.4.2/f6c04c51569ad17329595648978a95bb61c85b87174d5701d9eef91259f69e26/node_modules/@pnpm/exe.darwin-arm64:$PATH npm_config_workspace_concurrency=1 pnpm check
```

- 退出码：0；lint、样式守卫、format、全仓 typecheck、全仓测试及末尾根 Node 脚本组全部实际执行。
- 调度说明：`npm_config_workspace_concurrency=1` 被 pnpm 12 忽略，实查 `config get workspaceConcurrency` 为 undefined，日志也显示并行；本次通过的是原默认调度，不能声称串行通过。另实查 `pnpm_config_workspace_concurrency=1` 才返回 1，但没有再重跑全检。
- Office：235 文件 / 2778 测试通过。
- Renderer：86 文件 / 640 测试通过。
- Server：123 文件 / 1368 测试通过；本地模式 10、fnOS 模式 5、SQLite 备份 Node 测试 2 全过。
- Desktop：15 文件 / 125 测试通过，包含新增品牌生成/容器/安全区测试。
- Miniapp：8 测试通过；Chat 88、Provider 31、Storage 13 测试通过。Storage 既有 2 项条件跳过，未新增跳过；Web 既有配置无独立测试，exit 0。
- `pnpm test` 的 `&& node --test ...` 根脚本组确已执行：80 / 80 通过。
- 临时副本采用 `pnpm install --offline --frozen-lockfile` 的本地实体依赖树，1945 包复用、0 下载。系统 pnpm 11 的离线自举曾失败，最终明确使用已安装 pnpm 12.4.2；没有变更依赖版本。

## 历史失败及环境诊断

两次验证 worktree 中的原 `pnpm check` 均 exit 1，不能写成通过：

1. `/tmp/mimir-icon-check-full.log`：Office 232 文件通过、3 失败，2772 测试通过、6 失败；失败为 DOCX 加密三文件的明文 fixture 字节不相等。Server 还出现上传/附件 5s 失败输出，后被 Office 非零终止。
2. `/tmp/mimir-icon-check-final.log`：Office 231 文件通过、4 失败，2770 测试通过、8 失败；7 项为同类 fixture 字节差异，另 1 项为 `DocxEditor.encryption.test.tsx` 的异步发布等待断言。Server Office 提取与附件测试出现 5s 失败输出。

检查开始时这些 fixture 未修改，测试过程中两份明文 DOCX 被环境另行添加 `docProps/custom.xml`：例如 agile 从 Git HEAD 11995 字节变为 12470 字节、standard 从 3939 变为 4414 字节；另有 vendor `06-with-footnotes.docx` 改写。相关测试仅读取 fixture，写入的是 `/tmp` 产物，没有向源 fixture 写回。外部改写的具体软件归因未证实，不将其写为产品缺陷。

仅恢复验证副本受污染 fixture 的 Git HEAD 字节后，DOCX 三测试文件 39 / 39 通过；约一分钟后 worktree fixture 再次变化，故未循环恢复或修改测试。Server 上传/附件两个整文件降低文件调度并发独立重跑 63 / 63 通过。

临时副本从原 Git blob 恢复这三份 fixture，测试末尾再次逐字核对仍一致。临时软链依赖曾使三个 PDF suite 因跨根 `Denied ID` 无法收集（其余 232 文件 / 2754 测试通过）；改为本地实体依赖后，最终原门禁全部通过。单包临时副本曾因缺根 tsconfig 无法收集，这类设置失败未作为产品测试结论。

不得将验证 worktree 中被环境改写的 Office fixture 纳入本品牌提交。

## 图标与平台验证

- 用户批准的第七轮 `mark.svg` 与 `assets/brand/mimir-mark.svg` 逐字相同。
- `icons` 两次执行完成；测试逐字核验全部 13 项派生资源和重复生成一致性。
- ICO 7 档、ICNS 11 条目录的尺寸与 PNG 载荷完整性通过；fnOS 四处 64/256px 与 miniapp 本地 128px、头像 1024px 均受实际字节/尺寸测试覆盖。
- 头像保持完整正方形，白鸟在圆形安全区内；眼点为真实透明留白。BrandMark 的 currentColor、size、title/装饰图像语义有真实渲染测试。
- Web、Desktop、Miniapp 构建各 exit 0；构建后的两端 favicon 与生成输出逐字一致。微信产物 7 页、670 模块、471956 原始字节（460.9 KiB），原生 Image 组件及本地 PNG 进入产物的校验通过。
- fnOS package/build 测试 8 / 8 通过；根全部 80 项也再次覆盖相关打包路径。
- 人工实看实际组件前后截图：深色样本（16–64px、导航、标题栏）、浅色官网、390px 深色登录、浅色 Setup、小程序 Gate/login 的 H5 实际组件渲染，以及实际平台资源与头像圆形遮罩。抽查同内容、同尺寸、同主题，无裁切或布局回归；16px 眼点较弱但喙与翼线保留，符合批准边界。
- 小程序截图是 H5 实际组件渲染；没有将它当作微信真机。没有实测系统安装图标缓存、fnOS 安装或微信开发工具/设备；没有上传、上架或发布。

## 日志指纹

原始日志保留于本机 `/tmp`，仅记录路径和 SHA-256，不复制巨大的二进制差异输出。

| 原始日志 | SHA-256 |
|---|---|
| `/tmp/mimir-icon-check-full.log` | `fb910832644f26c81f2afdadbd3b0ae98c5cb2a20322a8a949cca80550b96183` |
| `/tmp/mimir-icon-check-final.log` | `0ee4703d902f43733a90b060a3b06cbd1545032e27c68326cc50e193b0fbfece` |
| `/tmp/mimir-icon-check-temp-full.log` | `7d14e8f78502a5f5a9ea29d4eb101d39740460c282784add661660828fc4bfb6` |
| `/tmp/mimir-icon-check-temp-install.log` | `e76b186f190de8063df600df14bdd64a57a969f23b6a109dafeecd7cf4d7e865` |
| `/tmp/mimir-icon-check-office-restored.log` | `d77116241b509cfb74bf5efc2fed70228184ed8a1e7d63b7ca3eb62860cf2a5e` |
| `/tmp/mimir-icon-check-office-temp-workspace.log` | `b237f1d96ff9b3293270574178077e3a9640125eebcc9fd00398c22845210d7a` |
| `/tmp/mimir-icon-check-server-restored.log` | `2f60b0687086131492b711e8411321b6cad68ca6c3f9cbcbd88aec268ca471ba` |
| `/tmp/mimir-icon-check-web-build.log` | `ccb96bdfe2de75baa85c406f585827770e806280465f886562bbdc71f3cdda0e` |
| `/tmp/mimir-icon-check-desktop-build.log` | `3d170dc6e9c34694a6befd0e888fe628152621f3a20a5cef73fb014eaeb9bea1` |
| `/tmp/mimir-icon-check-miniapp-build.log` | `0d38ddf92e7276b8c7217b1f368d40a05372508e108fb88711c61e0a98a62019` |
| `/tmp/mimir-icon-check-generation.log` | `22e751c6f2489ba59cc1fe8107428bc7f4f0ddb1bd629ca0cec49d2337b2cfbc` |
| `/tmp/mimir-icon-check-root-tests.log` | `2d1a3dce8057418e04fb9b59c1286df2ac612c122334fe28ee62f0cf47c019dc` |
