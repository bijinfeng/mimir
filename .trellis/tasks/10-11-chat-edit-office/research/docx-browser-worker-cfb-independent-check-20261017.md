# E1U CFB 浏览器 Worker 独立复核

2026-10-17，正式 `trellis-check`。结论：**本次精确补丁与 Office 定向门通过，可供 root 统一 Web 构建和真实产品浏览器复验。** 未发现需再返工的生产代码问题；不代表六格式工具矩阵或真实产品验收完成。

## 原失败与审查范围

保留 root 真实浏览器 Standard/Agile 正文修改后保存 `damaged`、原件未发布的证据，以及 owner 的未补丁相同 bundle 两项失败日志 `/tmp/mimir-e1u-standard-bundle-original-red-20261017.log`。先前直接 Node CommonJS 依赖测试通过无法覆盖该问题。本 checker 未改写原失败报告、测试断言或生产算法。

读取任务 check manifest、PRD/design/implement 的现有范围和 Office/project 规范，审查 owner 报告 `docx-encryption-browser-worker-fix-20261017.md` 与最终七文件 freeze。此次是既有缺陷复核，沿用固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 和已有 WeKnora v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24` 核对边界；WeKnora 不作为本地 Office 加密实现参照，没有声称新 HTTP 调研。

## Findings (fixed)

- File: `.trellis/spec/office/engine/conventions.md`
- Issue: 现有 Worker/测试规范未记录 Node CommonJS 的 `require` 会掩盖浏览器 CFB 空导出这一静默坑。
- Fix: 经 root 明确授权，只新增两段：实际生产 bundler + `.mjs` ESM + 无 `require`/`Buffer`/`process` 的回归边界；外部两格式修改正文、Agile 写出、另 Worker 完整读回及独立密码/HMAC 校验。未改既有安全边界或产品合同。

## Findings (not fixed)

没有未修复的本次生产代码发现。以下是验证边界，未以代码修改掩盖：

- 最终 frozen/offline install 未通过：缺供应链 registry 完整元数据 `@ant-design/cssinjs-utils`，发生于 “Lockfile is up to date, resolution step is skipped” 之后，freeze 未变。本 checker 未安装依赖或绕过门。若 root 的最终统一门需重新安装，由 root 处理网络/元数据；不能记为 frozen install PASS。
- 真实主产品的新 Web 构建及 1280×800/420×500 Standard/Agile 保存、下载、重开、Undo/Redo、可见取消按钮由 root 接续。当前仅定向自动化及第三方读取器通过，不把临时 harness 或 mounted Editor 记作主产品浏览器验收。
- 未运行 Server（由 XLSX checker 持有）、完整 Office、全仓 `pnpm check`、Desktop 或真实模型/供应商；不声称这些通过。

## 代码与依赖审查

- 精确补丁只移除 `typeof require !== 'undefined' &&`，保留 `module` 与 `DO_NOT_EXPORT_CFB` 两条件，未改 CFB 算法/许可证/vendor、未加全局 shim。
- Checker 独立 VM 比较原版和实际安装版，断言两文件除该一处替换外全字节相同：原版无 require 时 writer 不导出；补丁版正常导出 `utils.cfb_new`；补丁版设置 `DO_NOT_EXPORT_CFB` 时仍不导出，三项均通过。
- Patch SHA256 `5b02abc642b912c2733bdbe59d2bd3faef6e3b69386fb54774b226faec77729f` 与 workspace/lock/实际 pnpm 包目录一致，实际 `cfb.js` SHA256 `bcac6ea77e7072ea6cd0b04927fb7c2b3a90e1ffc341ed0abe947ead3bcd269a`。
- `pnpm patch-commit --config.ignoreScripts=true` 的成功日志已读；实际 patched 依赖由该次安装生成。最终 lock 只保留正式生成的 patch/hash/reference/snapshot 与已存在的 Vite 8.3.4 importer，diff 6 insertions/2 deletions；现有多 YAML document 结构未变，没有新增或捏造 package resolution。Owner 移除过 patch-commit 顺带的无关 optional peer 归一化；最终 frozen/offline 缺元数据如实保留，不宣称成功。
- Vite 仅为 Office devDependency `catalog:`，已有 8.3.4 与完整既有 peer identity；没有版本升级。既有 `@ironcalc/wasm-xlsx@0.9.0` 精确 minimumReleaseAge 例外及 1440 分钟门保持。
- 新 bundle 测试真正通过 Vite browser build 编译 production entry/core，`.mjs` bridge 明确拒绝 require，清除 Buffer/process，使用真实线程消息和 transfer。原件、正文修改和加密不被 mock。两格式分别经历不同 Worker 的打开、写出与完整解密读回。
- Opening secondary 按钮提供可见「取消」children，原可访问名、清密码和 cancel 回调保持；实际 Editor 的打开 helper 对可见文字有断言，其他 primary 无重复文案。

## Verification

- **Lint: PASS**，直接 `node_modules/.bin/oxlint` 检查三 TS/TSX，exit0，无诊断；日志 `/tmp/mimir-cfb-independent-lint-20261017.log`。
- **TypeCheck: PASS**，直接 Office `tsc --noEmit -p packages/office/tsconfig.json`，两次 exit0；最终日志 `/tmp/mimir-cfb-independent-types-20261017.log`。
- **Format: PASS**，三 TS/TSX、Office manifest、workspace/lock 格式检查 exit0，scoped diff check exit0；日志 `/tmp/mimir-cfb-independent-{format,diff}-20261017.log`。
- **Tests: PASS，9 文件 200/200**，实际执行 E0 core/check/container/native/XML/controller、E1 session17、bundle2、实际 Editor13；日志 `/tmp/mimir-cfb-independent-tests-20261017.log`，exit0，14.57s。更早 bundle+Editor 独立窄跑 15/15 亦通过。一次最初命令引用不存在的 root Vitest binary，exit127，随后改用 Office 已安装直接 binary；不把初次命令算作测试执行或产品失败。
- **独立第三方互通: PASS**。Checker 亲自对上述 200 项运行新生成的两个产物执行缓存官方 `msoffcrypto-tool==5.4.2`，`verify_password=True`、`verify_integrity=True`，完整输出与对应 plain 全字节相等。使用现有 Codex Python，无新依赖。日志 `/tmp/mimir-cfb-independent-interop-20261017.log`：
  - Standard 来源：7680B cipher / 4063B plain，plain SHA256 `232afb8a2a47633a0cdffc959e6b3801b652fd28633b56a7ecbfec4235a4400b`。
  - Agile 来源：14336B cipher / 10294B plain，plain SHA256 `8d5edd99e572d4298b718ea11363cccbc52299757f94cf544d661eed21416a76`。
  - plain ZIP 的生成时间会使 SHA 随测试运行改变；每次 oracle 比较的都是本次对应完整预期，不拿历史 SHA 代替读取。
- **Freeze: PASS，7/7**。复核前后 `shasum -a 256 -c /tmp/mimir-e1u-standard-fix-freeze-20261017.sha256` 均匹配。Lock SHA256 `cb28e912a1f5dc552faea1211630b7979682c1f093755e340b0557baa8acca5f`，workspace `c2ceb68e934949738d194445c574d02890319e931794802cde4a67d6c02ef91b`。本 checker 仅另写本报告与授权 spec 两段；新增 spec 后该整文件 SHA256 `3234c4ade9934521c1e96f06fc5c3a8af1580c94f7ab9449477dc2c345754ccc`。

所有本 checker 测试/类型/lint 进程已结束。未改生产文件、manifest、lock、其他 agent 的 dirty 内容；未暂存、提交、归档、上传、删除测试件或启动常驻服务。root 可以使用这份冻结内容构建下一版浏览器验收。
