# PPTX 图库形状的画布点击与拖绘

2026-10-17。只补现行 96 回调矩阵第 15 项的画布几何交互。图库仍使用现有紧凑 Inspector；根会话负责 Editor、共享导出/action、Agent/HTTP 接线及浏览器验收。本代理不改 vendor、模型白名单、原 shape presets、其他格式或矩阵。

## 参考证据

- GenOffice 固定 `480548fd55f1be3593ee0d8e316a734751d58309`，本次对 `/tmp/mimir-genoffice-html-git` 执行 `git rev-parse HEAD` 再核。`apps/slides/src/renderer/draw-shape.ts`：3 屏幕 px 以内视为点击；默认 96×96 渲染 px，直线/单箭头/双箭头默认 96×0；Shift 将闭合形状约束为正方、连接线约束到最近 45°；左拖和上拖分别产生 flipH/flipV。
- `SlideCanvas.tsx:1140–1175`：只有超过屏幕阈值才画临时预览，鼠标释放时提交；`insert-actions.ts:36–72`：原生 addElement 后对真实新增 ID 执行镜像，最后选择新增对象。`App.tsx:1463–1482`：gallery 选取进入 drawMode，提交后退出。Mimir 维持图库选择与更改已有形状的用途，以显式“在画布绘制所选形状”进入此模式，同时保留“直接插入”供无鼠标用户操作。
- WeKnora 站点 `https://weknora.weixin.qq.com/` 本次 HEAD 请求 10 秒超时，没有收到页面，未记成功。公开源码固定 v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24` 的 `internal/agent/tools/definitions.go`，已核已有固定副本 `/tmp/mimir-pptx-weknora-definitions.go`；该文件定义 search_knowledge/read_document/list_documents、wiki 和 sandbox 类工具，没有 Office 形状几何或 Ribbon 交互，不作为本片主要语义参考。此次另尝试从同一固定 commit 重新抓取源码，10 秒超时且零字节，未产生新文件；沿已有固定版本证据，不把失败访问写成成功。

## 实现与接口

- `packages/shared/src/pptx-shape.ts`：固定 109 kind 严格 schema，输入仅 kind/slide/整数 EMU offset/连接线 flipH/flipV；不接受 XML、客户端元素 ID、任意 DSL。闭合形状须正宽高，连接线允许单轴为零，但不能两轴均零。固定枚举与既有图库由测试核对一致。
- `apps/server/src/services/pptx-manual-shape.ts`：`applyPptxManualShape(request: PptxHostRequest): Promise<PptxHostResult>`。先在私有 opened 上运行原 addElement，读取真实创建对象的 durableId，然后原生 flipElements，最后一次 save/ZIP preflight、取消复核，返回 changed=true、一个新版本。内部原语的 records 合并，但宿主只接一次响应/一个 history；失败或取消不发布私有字节。没有扩展普通 apply_ops 的预算。
- `pptx-shape-insert.ts`：屏幕到渲染坐标、点击阈值/默认尺寸、Shift 约束/方向及渲染 px 到原生 EMU 的纯适配。闭合形状拖绘最小 2 渲染 px；不把水平/垂直连接线硬撑成斜线。
- `PptxShapeInsertCanvas.tsx`：`PptxShapeInsertCanvasProps` 持有 documentId/slideKey/slide/version/kind、渲染 width/height 与原生 slideWidth/slideHeight、disabled，以及 `apply(input, expectedVersion, signal)`、onExit/onBusy。与原画布同尺寸的 SVG 覆盖层，原生图库轮廓虚线预览，仅 pointerup 提交一次；auto focus、分层 Escape、取消按钮。第二指针、pointercancel、capture 丢失、失焦、页面/文档/版本/kind/disabled 变化、卸载均取消草稿或 abort；请求晚到不显示旧失败、不触发退出回调。root 的 disabled 必须排除本绘制自身的 busy，否则自取消。
- `PptxShapeGallery.tsx` 和已有/新增 CSS：现有选中态、搜索、方向键及固定底部动作继续使用；新增 typed `onDrawShape?: (kind: PptxManualShape['kind']) => void`。连接后主动作进入画布，次动作仍能直接插入；按钮正文只显示一次。画布提示紧凑贴底并有可见取消，保持图稿上下文；宽/420 的最终目视由根会话完成。

## 已验证

- Office 两文件 20/20：Gallery 原生形状/样式/读回与新增 typed draw 回调、单击/缩放拖动/Shift/端点方向、预览不调用写入、一次提交、第二指针/取消/失焦、目标变更、Escape 先于 Inspector、重复提交与迟到失败、window blur/disabled/卸载 abort。
- Server `pptx-manual-shape.test.ts` 8/8：真实原生形状与五种连接线，flipH/flipV、箭头端头、水平/垂直零轴、版本仅加一、原生保存两次、无关 ZIP entries 保留、固定109枚举与非法 XML/元素ID/尺寸拒绝、缺页与取消。
- 目标 Oxlint、10 个 TS/TSX/CSS Oxfmt、Gallery/Canvas 的 Ant Design lint（0 issues）、全仓样式反引号检查、目标 diff 检查通过。日志 `/tmp/mimir-shape-canvas-tests.log`、`/tmp/mimir-shape-service-tests.log`。
- Office/server typecheck 最终均 exit 0；首轮并行接口未完的临时阻断已随段落适配落盘消失。日志 `/tmp/mimir-shape-office-tsc.log` 与 `/tmp/mimir-shape-server-tsc.log`。

## 待根会话验收

真实浏览器：图库进入模式后 Inspector 收起、宽/420 可见状态、真实拖绘/单击落点、Shift 约束与左/上箭头、Escape 仅退出绘制并返回入口焦点；保存→撤销/保存→重做/保存下载读回；异步切页/视图取消；一次手势一个 history。Desktop 由用户自验，未配置真实模型暂不验模型调用，不将此切片记作全部工具完成。产品文件已交根会话接线，无提交、暂存或归档。
