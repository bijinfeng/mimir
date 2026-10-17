# PPTX 图片来源格式最小实现计划（2026-10-17）

## 缺口与边界

现有宿主 imageInfo 及选择器只允许 PNG/JPEG；PPTX 原件读取虽列 TIFF，却直接返回 Chromium 无法显示的 TIFF data URL。本片接通 PNG/JPEG/GIF/BMP/WebP/TIFF 的真实格式/尺寸/MIME校验、原字节写入与浏览器显示。所有源码读取和保存继续以原 archive 为真相；仅 TIFF 显示解码转 PNG。GIF/WebP 的动态原件原字节保留，去背景结果明确为静态 PNG。系统剪贴板保持 PNG/JPEG；不扩深层组、组内拖裁切、效果或 Agent op 白名单，不改 vendor、不加依赖。

## 文件所有权与实施次序

1. 新 `packages/shared/src/pptx-image.ts` 与定向 tests：纯字节元信息、常量/MIME/扩展名/格式说明、容器边界和 TIFF IFD 预检，shared index 唯一导出接缝。现8MiB/16384单边；TIFF与解码有像素预算，选择最大安全页，尺寸选择策略必须前后相同。
2. 新 server `pptx-image-info.ts` 共用验证入口，host/manual-upload 移除 png/jpg 二选一 MIME，普通组图片 helper 接受受控 ext 类型。原生 insert/replace/fill/background/group replacement 与 malformed 原子拒绝 tests。保持原字节，MIME以内容为准且非空声明须相符。
3. 新 Office `pptx-image-display.ts` 与 tests：现有 utif2 解码，仅 decode 预选页，Canvas 输出 PNG，仅显示；非 TIFF直接原dataURL。同步 `readMediaDataUrls` 保留；pptx.ts 的 open/edit/replace 三处 async prepareDisplayMedia，replace 在全部准备完后重核 signal/revision 并一次发布。JPEG EXIF本片不扩展，沿既有像素语义并保留真实字节，若专项暴露方向问题再单独确认。
4. 新本地选图预览 hook/helper，统一文件/内容/尺寸失败和迟到取消；PptxEditor两入口、AssetControls填充、GroupPictureControls替换沿现有布局接入。原文件传host，预览仅使用显示URL，TIFF策略与动画静态化文案放相关工具内。去背景使用现有预览显示源，限制原样保留。
5. 定向 native/UI/display/history、shared/office/server types、目标lint/format/Antd/styles/diff，编译checkpoint交root。禁止fullOffice/Webbuild；生产宽/420/短高、下载原字节及history由root与独立checker收口。无真实模型、Desktop用户自验，不提交/暂存/归档/删测试件。

## 参考证据

沿 `pptx-group-picture-next-20261017.md` 固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`，再次核对 `insert.ts:450–458` 的六来源格式白名单；`slides-main.ts:2459` TIFF尺寸来自解码；`tiff-decode.ts:36–77` IFD尺寸预算/最大安全页选择/仅解码选页；`session-state.ts:440–468` 仅显示PNG、原件字节不变。浏览器实现不引入 Electron nativeImage/Node PNG 库。

本次 WeKnora 官网实际 HTTP200/113529 bytes，已有 v0.8.3 快照；固定公开源码 `3e22822c1d2397be730c458c7539d0eb8c113a24/internal/agent/tools/definitions.go` 本次实际重新获取成功（前片超时缓存事实不追改）。35–49行 capability 注册原则适用，未提供Office图片格式或工具栏合同，不作为主要格式依据。

## 独立检查后的编码与面板边界

IFD 预算不能约束 UTIF 内层 Deflate/JPEG 的独立分配，CCITT/LZW 畸形输入也缺可靠守卫；本片最终限定未压缩/PackBits，并检查实际条/瓦片展开量、颜色×位深×通道和私有 tag 白名单，明确拒绝其他 TIFF 编码。未增加依赖或自制复杂解压器。真实浏览器还发现图片填充的 Apply 被预览挤出面板，改独立 body 内滚与固定单一 footer。最终证据和实际限制以 `pptx-image-formats-check-20261017.md` 为准。
