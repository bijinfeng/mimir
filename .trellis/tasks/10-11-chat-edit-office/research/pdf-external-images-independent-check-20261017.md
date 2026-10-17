# PDF 外部图片工具独立检查 — 2026-10-17

检查角色：正式 `trellis-check`，直接审查与修复，无子代理。范围为已冻结的 PDF `image_search` / `generate_image`、手动图片 Inspector、私有素材引用和原生插入/替换桥；不改 OCR、文字参数、DOCX、XLSX、vendor、凭据或知识库原件，不 stage/commit/归档/删除。

## Findings (fixed)

- File: `apps/server/src/services/pdf-images.ts:366`
- Issue: 新增可选 signal 后，原生 `read` 分支仅在入口检查取消。真实 PDF 检查开始后立即 abort，仍返回成功的图片快照；此分支没有走写入路径末尾的取消检查。部分预检完成后也会继续进入原生写入，直到末尾才拒绝输出。
- Fix: 读取/页几何返回后核对 signal；写路径在安全预检、图片快照、几何和像素提取后、进入 native 编辑前及编辑完成后补取消复核。仍保留现有结构守卫与最终读回，不发布任何已取消结果。
- Regression: `apps/server/src/test/pdf-external-assets.test.ts:124` 用真实 PDF/native 图片读取启动后立即取消。先在原实现复现 `promise resolved {images:...} instead of rejecting`，修复后返回 `AbortError`。首次红日志 `/tmp/mimir-pdf-assets-read-cancel-regression-20261017.log`；最终绿色见下面 server 日志。

## Findings (not fixed)

没有发现本切片尚未修复的代码缺陷。以下是验证和部署限制，不能计作已通过：

- 测试账号未配置 Brave/图片生成供应商。测试中真实鉴权、路由、原生 PDF、保存与历史执行，外部供应商按测试文件局部 mock；没有真实生成、真实搜索质量、额度或真实 Agent 模型续轮成功的证据。
- 宽屏与实际 420×500 的浏览器外观、Inspector 几何、下拉弹层和 Escape 回焦由根会话另验。本检查没有控制浏览器，组件 style 420×500 和 DOM 断言不能代替浏览器布局证据。Desktop 按用户选择自行验收。
- registry 为有界进程私有临时内存。多进程切换无法共享引用，需重新生成；20 分钟语义通过注册/解析时惰性清理执行。未扩大为分布式素材保存。
- 搜索缩略图由浏览器以 no-referrer/lazy 加载公开结果地址；真正插入仍走服务端受限下载与 PNG/JPEG 完整解码。看见缩略图不等于该资源一定可安全插入。原生安全守卫拒绝的 PDF 仍会明确失败。
- 全仓 `pnpm check` 的已知 bundled-skill lint 基线不在本切片范围，未重复全仓 check/fullsuite/build。统一重型门禁归根会话。

## 实际路径核对

- 共享 strict schema 保持 snake_case：搜索 query trim、max_results 1–10/default8；生成 prompt trim、固定八种 aspect_ratio/default auto；未知键拒绝。
- catalog async 独立使用 Brave 和图片模型配置状态，两组互不依赖；缺配置从本轮工具清单移除并给出真实设置原因。服务仍由原 provider 插件构造适配器、TanStack SDK 执行及原 usage 收口记账。
- assetTool 在内容执行、captureState 和 round checkpoint 前分支；pending 页面和插字不会被素材准备物化，不改 bytes/version/history/dirty。人工/Agent 版本推进、Undo、Stop、dispose 取消并拒绝迟到结果；Editor 再验原 handle 与版本；源变化建立新 UUID 会话。
- 已鉴权 JSON host 先以流式字节限制16KiB，再 strict parse，核对实际 PDF。生成引用严格匹配 UUID，绑定真实 principal + document + asset session，20 分钟 TTL、单源4项/global8项/64MiB、FIFO、字节双向克隆；无通用协议下载或公开 GET。preview 复用同作用域，返回 no-store/nosniff PNG/JPEG，浏览器只创建并释放 Blob URL。
- 原 images multipart 只在可信 transport 接受 assetSessionId，解析私有引用为新的本地 image 操作后才交原生；insert/replace 真正写入且保留目标 footprint/layer。普通 URL 仍沿原 DNS pin/SSRF/重定向/体积/MIME 防护，调用 signal 传到 Node request。
- 生成真实解码 PNG/JPEG/尺寸和像素预算后才注册；返回 requestedRatio 与实际宽高/ratio。GPT 与 DALL-E3 按供应商尺寸映射；DALL-E2 非方形预拒绝；旧 DOCX/PPTX 未传 options 的默认 size 保持不变。
- Brave fetch 组合调用取消和10秒 timeout，SDK收到 abortSignal 和60秒 timeout。真实本地 Node HTTP 断连测试验证 raw request 取消会传给等待中的 provider mock；这不冒充真实外部服务调用。
- 图片来源切换、等待/取消、配置失败/重查、错误/空结果、选中态和生成预览存在；外部来源只有一个固定底部 primary，长内容沿既有 Inspector 内滚。source/page/selected/historyVersion 组成 child key，切换卸载取消请求并释放预览；普通 busy 重渲染不会作废自己的准备请求。
- 现行合同 `.trellis/spec/shared/contract/pdf-agent.md` §16 已覆盖该行为。本次是既有取消合同的局部修复，无新增现行契约，不再追加重复规范。外部参考沿既有批准方案：GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 为文件工具依据；WeKnora v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24` 仅作通用配置门控参考，本检查未开展新的竞品研究。

## Verification

- Lint: **pass**。本 slice TS/TSX 目标 `pnpm exec oxlint ...` exit0；`/tmp/mimir-pdf-assets-independent-lint-20261017.log`。目标 oxfmt check、样式 backticks 守卫、`git diff --check` 通过；`/tmp/mimir-pdf-assets-independent-format-20261017.log`。未改 UI，因此不另做 antd API 变更。
- TypeCheck: **pass**。Office、server、renderer 均 exit0，server 在修复后重新通过；`/tmp/mimir-pdf-assets-independent-{office,server,renderer}-ts-20261017.log`。
- Tests: **pass**。独立 server 8文件 **35/35**，`/tmp/mimir-pdf-assets-independent-server-20261017.log`；独立 Office 4文件 **15/15**，`/tmp/mimir-pdf-assets-independent-office-20261017.log`。
  - Server: external-assets、external-assets-route、catalog、Brave、generation、image-fetch、agent-route、text-block-route。
  - Office: external-images Editor、asset-agent、原 agent、原 images Editor。
  - 首次并行启动 Office 受 Vitest 共享 cache 清理 `ENOTEMPTY` 影响，随后顺序重跑通过；`--cacheDir` 为该 Vitest CLI 不支持的选项，已放弃，没有改配置或删除缓存。最终绿色来自正常命令。

PDF slice 生产文件已释放。`PdfEditor.tsx` / `pdf-agent.ts` 先行通知根会话可接 OCR；本 reviewer 后续仅修改 server `pdf-images.ts` 和新增回归测试。
