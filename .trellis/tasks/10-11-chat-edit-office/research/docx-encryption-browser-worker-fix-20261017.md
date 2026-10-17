# E1U 浏览器 Worker 加密写出返工

2026-10-17。实施和 7 个生产/测试/manifest 文件已冻结，交正式独立 checker；真实产品浏览器复验由 root 持有。本报告不代表完整工具矩阵完成。

## 缺陷与真实证据

root 在最新 production build 对官方 Standard 和 Agile 测试原件输入现有密码 `Password1234_`，全选替换为含中文的正文后保存均失败，错误为固定 damaged，原件未发布、dirty 保留。官方原件 no-op 导出仍完整精确。旧测试只对这些官方原件验证打开/no-op，实际正文保存用合成 fixture；新增官方原件 mounted Editor + production Worker 两条正文替换保存用例在旧 Node helper 中仍为绿，不能覆盖真实浏览器红项。

临时 production harness 位于 `/tmp/mimir-e1u-standard-harness-20261017`，独立预览 `http://127.0.0.1:5184/`，复用实际 Editor/web React compiler/production Worker，只操作官方测试件，不写知识库。root 用真实 CUA 打开、填正文、保存，显式下载了精确待加密 plain：`/tmp/mimir-e1u-standard-browser-native-plain-20261017.docx`，4355B，SHA256 `52211fa3180bbf77cd8a1832604ea5d7d31c5e28d8a7272795db5288e249387c`，Python ZIP CRC 验证正常。同浏览器主线程算法成功；仅诊断测试 Worker 允许显示原始 stack，定位为 `TypeError Cannot read properties of undefined (reading 'cfb_new')`，阶段 encrypt core。产品 Worker 仍只回固定错误码，没有泄漏异常、明文或密码。

根因是 `cfb@1.2.2/cfb.js` 最后导出多要求 `typeof require !== 'undefined'`。Rolldown 的浏览器 Worker 产物保留该判断，真实 Worker 没有 require，故 CommonJS module.exports 留空。先前重放 browser bundle 时，临时 `.js` 文件在 Node 中按 CommonJS 加载，Node 注入的 lexical require 掩盖了缺陷；改为 `.mjs` 后准确重现同一错误。仅将 Buffer/process/self 调成浏览器样式不够。

## 最小修复与文件

- `patches/cfb@1.2.2.patch`：官方固定版本的精确单行补丁，只去掉额外 require 条件，保留 module 与 DO_NOT_EXPORT_CFB 条件、原许可证和所有 CFB 算法。
- `pnpm-workspace.yaml`：注册该精确 patch，保留已有 patch、minimumReleaseAge 和既有例外/其他改动。
- `pnpm-lock.yaml`：仅 CFB patch hash/引用/snapshot 与 Office Vite importer；没有版本升级。patch 由 `pnpm patch-commit` 正式生成，文件 SHA256 `5b02abc642b912c2733bdbe59d2bd3faef6e3b69386fb54774b226faec77729f` 与 lock 相同。
- `packages/office/package.json`：仅增加测试所需 devDependency `vite: catalog:`，使用仓库已有 8.3.4；保留 E1S encryption-envelope export。
- `src/docx-encryption-bundle.test.ts`：Vite 实际 browser pipeline 打包 production Worker，再由真正 `.mjs` ESM Worker 执行；bridge 明确断言 require 不存在、去掉 Buffer/process，使用真实模块工作线程与完整 request/transfer，不替换算法。两条官方 Standard/Agile decrypt→中文正文 native ZIP→Agile encrypt→第二 Worker decrypt 全字节一致；产出独立密码/HMAC oracle 工件。
- `src/editors/DocxEditor.encryption.test.tsx`：保留全部原 11 项，新增两条官方原件 mounted Editor 中文正文替换保存；现有打开 helper 顺带断言取消按钮有可见文字。
- `src/editors/DocxEncryptionControls.tsx`：Opening secondary 按钮增加可见 children「取消」，保留 aria-label「取消本地打开」。该文件另两按钮均为 primary，仍仅图标 children，未加入重复文案或改变 320px Inspector。

没有修改 E0/E1 算法、session/controller/Editor 保存逻辑、E1S、XLSX、vendor 或共享 spec。未提交、暂存、归档、上传/删除产品文件；临时 harness 仅官方合成资料，不供用户文件使用。`.pnpm-store/` 为已存在的本地依赖缓存，不纳入本轮文件。

## 验证

- 原未补丁 CFB 通过明确 Vite alias 跑**同一新增两条** bundle regression：2/2 FAIL damaged，exit1，`/tmp/mimir-e1u-standard-bundle-original-red-20261017.log`。alias 仅用于证明红项，已移除；最终源码无旧依赖路径。
- 精准 patch 后新增 bundle：2/2 PASS；最终纯 fixture helper hoist 后再次 2/2 PASS，`/tmp/mimir-e1u-standard-bundle-final-20261017.log`。
- 限定 9 文件：**200/200 PASS**，exit0，`/tmp/mimir-e1u-standard-focused-20261017.log`。包括 bundle2、session17、actual Editor13、E0 core/native/container/XML/independent/controller。后续仅新测试内 fixture hoist 消除 lint warning，无生产修改。
- Office `tsc --noEmit`：exit0，`/tmp/mimir-e1u-standard-final-types-20261017.log`。
- 最终 3 TS/TSX oxlint 零诊断、匹配 5 文件 oxfmt PASS、tracked scoped git diff --check PASS，日志 `/tmp/mimir-e1u-standard-final-{lint,format}-20261017.log`。新文件空白另由格式器覆盖。
- **第三方互通 PASS**：缓存官方 `msoffcrypto-tool==5.4.2`，既有 Codex Python runtime，password verify + Agile HMAC verify + 完整解密与预期 plain 相等。脚本 `/tmp/mimir-e1u-standard-bundle-interop-20261017.py`，日志同名 `.log`，exit0，无新依赖安装。
  - Standard 来源产物：7680B cipher / 4063B plain，plain SHA256 `e2f5ec57178d0149243b3024cc773bf972428982ffe3aa4bf1ef9e33194411d1`。
  - Agile 来源产物：14336B cipher / 10294B plain，plain SHA256 `2eca2987b5ab32065d6c123d45c4235ea3df8c235cc889502bcec999373ce4e1`。
  - 工件 `/tmp/mimir-docx-browser-bundle-{standard,agile}-20261017.docx` 和对应 `-plain-20261017.docx`；均现有官方合成测试密码。
- 临时 harness 用补丁重新 production build exit0，`/tmp/mimir-e1u-standard-harness-fixed-build-20261017.log`；主产品统一 Web build、1280/420 浏览器保存/导出/重开复验由 root 执行，不能以这个独立 harness 替代产品验收。

## 安装与锁文件边界

最初 offline install 因旧 workspace electron-builder 元数据未缓存退出。frozen/offline 解析明确显示 lock up to date、resolution skipped，随后供应链检查缺少完整 registry metadata（先 @acemir/cssom，后 @ant-design/cssinjs-utils）退出；不是 patch 不匹配，也没有绕过供应链门。

随后 `pnpm patch`/`pnpm patch-commit ... --config.ignoreScripts=true` 正式成功（exit0；下载0；固定版本），安装了 patched CFB 与已有 Vite 链接。它顺带归一化全仓 Vitest 可选 peers；本轮开始 lock 没有 dirty，故保留原始 lock 的所有其他部分，仅留下必要 6 insertions/2 deletions。再次 frozen/offline 因上述供应链完整元数据缺失退出，lock 前后 SHA256 均 `cb28e912a1f5dc552faea1211630b7979682c1f093755e340b0557baa8acca5f`，无新安装树/锁变更。正式 checker 无需再次安装；全仓最新 gate 由 root 统一执行，不能宣称 frozen/offline install PASS。

7 文件冻结 SHA 清单：`/tmp/mimir-e1u-standard-fix-freeze-20261017.sha256`。本轮 Office runner 全部结束；Server runner未使用。临时 5184 preview 保留供 root 真浏览器复验。

## 参考与待补规范

这是既有契约缺陷修复，沿用已读 E1U plan/implementation/check 的固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 与同日缓存 WeKnora v0.8.3 / `3e22822c1d2397be730c458c7539d0eb8c113a24`；WeKnora 仅适用于知识库门控，不是本地 Office 加密依据，本轮没有新的 HTTP 调研声称。

建议 root 在唯一 Office pitfall 归属记录：Node 原始 CommonJS 依赖测试或把 browser bundle 作为 `.js` 加载会掩盖真实 Worker 缺失 require 的导出问题；边界回归应使用实际 browser bundler 产物和 `.mjs` ESM，再验证完整加密/第三方解密，不只检查 API 存在。共享规范由 root 持有，本轮不代改。
