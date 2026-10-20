# GitHub 干净环境 CI 修复

2026-10-20。对应失败 run `39378386495`，原始日志 `github-ci-check-failed.log`。本轮只修改 Office 测试启动配置与 CI 系统字体准备，不修改 PDF 生产实现、不改 vendor、不放宽/跳过原测试、不增超时。

## 1. DOCX 测试缺 generated/editor.css

原始证据：20 个 Office suite 在导入 `DocxEditor.tsx` 时找不到 `../generated/editor.css`。该文件本来就是 gitignored 生成物；新共享 renderer Vite buildStart 插件只覆盖 web/desktop 构建，独立 Office Vitest 不经过它。之前本机已有同步/构建产物掩盖了缺失。

修复：`packages/office/vitest.config.ts` 加入配置加载阶段同步执行既有 `scripts/trim-editor-css.mjs`，在任何 suite collection/模块解析前从已提交 vendor CSS 生成一次。子进程失败直接终止，不使用旧文件；跨平台文件路径用 fileURLToPath，不依赖 shell、预先 build 或远程 sync。

干净目录验证：在 `/tmp/mimir-office-clean-test` 只复制该配置、既有生成脚本、已提交 vendor styles.css 和一个 CSS 导入 fixture；没有 generated 目录，没有执行 build/sync。`vitest run --root ... --config ...` 在 suite collection 前生成 CSS，断言 `.ProseMirror` 与 `.page-dark` 存在，1/1 通过。临时目录缺 type:module 的提示与项目无关；真实包已有 type:module。项目内真实 `DocxEditor.export` + `DocxEditor.encryption` 2 files / 20 tests 通过。

## 2. PDF 中文 insert_text 在 Ubuntu 返回 ok=false

路径：`PdfEditor.content.test.tsx:1350` → `layoutPdfTextInsert` → locked vendored `applyTextInserts` → `fallbackFontFor`。该原生插字分支必须读取可覆盖全部字符的 **系统 sfnt 字体** 后嵌入 PDFium；会扫描 `/usr/share/fonts`、`/usr/local/share/fonts`、`~/.fonts`，支持 ttf/otf/ttc/otc 与 TTC 单字面提取。拉丁字体无法覆盖中文时明确拒绝 `the replacement contains characters no available font can draw`。本机 macOS 的 Arial Unicode/PingFang 使原测试通过；CI workflow 原先完全没有准备中文系统字体。服务器其他中文功能使用随包 woff2 的独立 writer，不能证明这条 vendored 插字路径具备系统字体。

证据验证：暂存独立 diagnostic（源见 `ci-diagnostics/font-probe.md`，执行后已从产品 src 删除）只替换系统字体索引及屏蔽 OS fallback 字体文件，仍调用真实已锁定 vendor + PDFium/HarfBuzz + 同样中文/Times/粗斜体/宽150/右对齐 layout。

- 空索引条件：真实调用明确拒绝 no available font can draw，诊断 1/1 通过 (`github-ci-no-cjk-font-probe.log`)。
- 实际 Ubuntu 字体条件：从 Ubuntu 官方 archive 下载 `fonts-noto-cjk_20230817+repack1-3_all.deb`，提取 `usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc`，给真实 vendor 提供其中 SC face。实际 TTC 提取、字形覆盖、PDFium 嵌入和原生度量均成功，wrappedText 含换行、width=150，诊断 1/1 通过 (`github-ci-ubuntu-noto-font-probe.log`)。
- 官方包 URL：`https://archive.ubuntu.com/ubuntu/pool/main/f/fonts-noto-cjk/fonts-noto-cjk_20230817+repack1-3_all.deb`。
- 包 SHA-256：`7d64b985f6fe128c99eae5610d5c047338e572bdcfb2bb09736be01b824a7f6c`。
- TTC SHA-256：`b76b0433203017ca80401b2ee0dd69350349871c4b19d504c34dbdd80541690a`。

修复：`.github/workflows/ci.yml` 在 pnpm check 前用 apt 安装 `fonts-noto-cjk`，并记录 `fc-match 'Noto Sans CJK SC'`。这是保持真实中文字体断言所需的测试宿主准备；未把字体伪造为可用、未替换 Unicode 输出或绕过原字体覆盖拒绝。正式产品在没有可覆盖所输入字符的系统字体时仍按原契约明确拒绝，而不是丢字保存。

原有完整 `PdfEditor.content.test.tsx` targeted 重跑结果见 `github-ci-pdf-content-targeted.log`。此修复需要新的 GitHub CI 实际通过后才能宣称远端质量门通过。

## 检查

- Office CSS fresh-directory fixture：1/1 通过。
- 原中文生命周期专项：1/1 通过（其余14个未选，并非跳过原质量门）。
- Docx export/encryption：2 files / 20 tests 通过。
- 无系统 CJK/实际 Ubuntu TTC 诊断各1/1通过。
- oxlint、oxfmt、actionlint v1.7.12：通过。
- Office typecheck 与完整 PDF content targeted：最终结果附于下方，未运行重型全仓并发。

## 参考与边界

本次为既有代码的干净 CI 环境修复，不新增产品功能或 broad research。延用任务 `research/distribution-evidence.md` 已记录的 WeKnora v0.8.3 / main `8dab7550f5069ef80877a65b52dc5483c45f7827` 证据；其 Go/Rust workflow 不决定本项目 PDF 字体或 Vitest 生成物生命周期。生成物仍被忽略，不同步/修改 vendor。其他代理的 Windows 链接修复不在本轮文件所有权内。

最终 targeted 结果：完整 `PdfEditor.content.test.tsx` 15/15 通过（10.31s），Office `tsc --noEmit` 通过。`git diff --check` 通过。所有临时诊断已从产品源码移除；本轮未提交/推送，等待主会话集成与远端 CI 验收。
