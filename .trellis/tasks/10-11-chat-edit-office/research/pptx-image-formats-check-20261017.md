# PPTX 图片来源格式独立检查与修复

2026-10-17；active task `10-11-chat-edit-office`。已读本片计划/实施交接、当前任务与 Office engine/editors/shell、shared contract、server 规范。实现者冻结后接管必要修复；未改 vendor、DOCX、PDF，没有上传/删除/提交/暂存/归档。生产浏览器与最终构建由 root 执行。

## 结论

六来源原件路径、仅 TIFF 显示转 PNG、JPEG 显示方向副本、异步宿主原子发布检查完成。独立检查修复了 TIFF 解码预算与静默黑图、合法 JPEG marker fill 下漏中性化 EXIF，以及真实浏览器发现的图片填充主操作不可见。产品已冻结交 root 统一构建与面板复验。TIFF 支持范围明确限定为下述可验证子集，不宣称所有 TIFF 压缩兼容。

## 全套 unknown codec 失败的原因与闭环

root 的 `/tmp/mimir-group-views-redaction-office-full-20261017.log`：全 Office 161 文件，160 文件1657项通过，唯一失败 `pptx-image-info.test.ts:99`，把两页 TIFF Compression 改65000后期望抛错，实际没有抛错。**这不是文案不匹配**：当时执行的元信息路径没有把不支持的压缩编码排除出候选安全页。只校验 IFD 尺寸/字节范围仍会放行未知编码；UTIF 对未知压缩仅记录日志，像素转换可能产出黑图。

该全套08:05:18启动于在途变更期间；实现者随后08:06:32的unknown-codec guard专项24/24通过。独立检查没有把这次全套改称全绿，也未再跑全套。最终 `pptx-image-info.test.ts` 保留原65000回归，新增安全专项进一步断言65000及不受限编码在进入 `UTIF.decode` 前就被拒绝；最终目标6文件68/68通过。

## 另发现的确定缺陷与修复

### TIFF 预算、编码与显示真实性

- 已读实际 utif2 4.1.0：`UTIF.js:180` 的 compression8/32946 使用 `pako.inflateRaw` 独立物化实际压缩输出；6/7内部 JPEG 解码也按流内 SOF 分配，外层 IFD 像素检查无法约束。CCITT 依赖动态行数组，LZW 畸形字典路径也无可靠终止守卫。本片按 root 确认采用最小可靠范围：只接受未压缩1/PackBits32773，不新增依赖或复杂解压器。
- `packages/shared/src/pptx-image.ts`：TIFF 全文件 tag 预算；颜色×位深×通道、浮点样本、planar/fill-order/predictor精确组合；按 UTIF 同样规则选 strip 或 tile，校验块数、原始条字节和 PackBits 每条完整展开量，拒绝短流、溢出、缺字节和超预算。未知/不受控编码给出“导出为未压缩或 PackBits 编码的常规 TIFF”的恢复提示。
- UTIF对 white-is-zero2bit、black-is-zero4bit等组合没有完整转换分支，原宽泛位深白名单会静默黑图；现在在像素分配前拒绝不支持组合。已支持的常规灰度、RGB、调色板及CMYK组合仍按实际转换能力与预算执行。
- `packages/office/src/pptx-image-display.ts`：选页工作副本只交图像tag白名单给 UTIF。仅屏蔽递归 Exif/SubIFD/MakerNote不够，私有相机Make/RAW tag还能重定向解码器；原archive所有tag和字节保持不变。仍只解码选中页。
- 新 `pptx-tiff-safety.test.ts` 使用小型真实TIFF容器，raw与PackBits实际像素一致，9种未知/不受控编码、8种错误样本组合、4种坏PackBits及短raw/块数错误均在进入UTIF前拒绝；不生成大压缩炸弹。

### JPEG 方向

合法 JPEG marker 之间可有重复FF填充；原显示中性化遍历未跳过它，会遗漏后面的EXIF。已补跳过并保留界限检查，真实EXIF6夹具插入合法填充的回归确认仅显示副本改变、原件和尺寸不变。

### 图片填充主操作

root420浏览器证据：面板top217/bottom693.36，Apply y796.91–820.91，wide也不可见，截图 `pptx-image-formats-420-before-fix.png`。根因是预览/选项与Apply在同一整体滚动表单，没有独立动作区。

`PptxAssetControls.tsx` 与局部 `pptx-tools.css` 改为fieldset flex列、独立 body 内滚和固定单一 footer；父图片填充Inspector体不再整体滚动。保留原选项、真实比例预览、忙碌禁用和当前宽度；不通过单独缩小图片隐藏问题。实际组件回归确认预览在body、唯一Apply在footer、选择预览不上传、连续点击只一次上传；420/短高实际几何由root复验。

## 路径审查与保留边界

- manual-picture 插入/替换与 manual-asset 插入/替换/填充/背景/直接组替换共享真实内容验证，原File/原字节传host；文件名不能冒充内容，假MIME拒绝。
- PNG/JPEG/GIF/BMP/WebP保留原显示数据，JPEG只中性化显示EXIF。GIF与animatedWebP保存动画原件；去背景文案明确静态PNG，不把普通替换冒称静态化。
- `pptx.ts` 的 read/edit初始化均等显示媒体准备完才返回。replaceFromHost先准备nextArchive/nextPages/nextSlides/nextSize/nextMedia，最后检查signal/revision再同步一次发布；延迟OffscreenCanvas回归证明取消/版本变化不发布新archive/media。
- 本地文件准备检查signal、真实Image解码及自然尺寸，hook身份阻止旧file读取复活，卸载取消；顶层路径还检查会话句柄、页与版本。原组图换页慢宿主回归保持version0/clean/无history。
- Agent图片服务和系统剪贴板仍只有PNG/JPEG，本片六来源指本地图片工具。BMP只未压缩/位域；TIFF不含BigTIFF，只显示最大的受支持安全页，保留所有原页/原媒体。未知原生TIFF保留bytes但不发布不可解码URL；没有DOM的Node测试不能代表浏览器显示PNG。

## 最终检查

- Office **6文件68/68**：metadata/display、TIFF安全、新图片填充、组图控件与实际组图Editor；`/tmp/mimir-pptx-image-formats-check-tests.log`。
- 实际顶层 `PptxEditor.test.tsx` **7/7**，78非目标跳过：PNG/JPEG/GIF/BMP/animatedWebP插入→SVG→保存重开，原媒体逐字节；另旧replace/error。测试宿主按真实ext调用原生引擎，不再把所有数据标PNG；`/tmp/mimir-pptx-image-formats-check-editor.log`。
- Server格式/旧host2文件36/36，加实际 `pptx-group-picture-host.test.ts`18/18，合计 **54/54**；`/tmp/mimir-pptx-image-formats-check-host.log`、`...-group-host.log`。最初命令误写不存在的 `pptx-group-picture.test.ts`，已单独补跑真实文件，未计为已跑。
- shared/server tsc各退出0；`/tmp/mimir-pptx-image-formats-check-{shared,server}-types.log`。Office tsc本片新增测试类型已清，最终阻断仅并行新增 `DocxInkControls.tsx` 的pressed/onClick/ColorPicker/NumberField API等11处外片错误，已通知root；`...-office-types.log`。root协调该owner与最终build，不能把本片Office类型写全绿。
- 7个目标TS/TSX oxlint零输出；8文件oxfmt通过；AssetControls antd issues=[]、partial=false；目标diff check通过。日志 `/tmp/mimir-pptx-image-formats-check-{lint,format,antd}.log`。未跑全仓pnpm check或重复全Office/Web build。

## 文件与接续

本检查者产品：shared `pptx-image.ts`、Office `pptx-image-display.ts`、`editors/PptxAssetControls.tsx`、`editors/pptx-tools.css`。测试：`pptx-tiff-safety.test.ts`新增、`pptx-image-display.test.ts`、`PptxImageFormats.test.tsx`、`PptxEditor.test.tsx`。同步engine现行合同与本片计划；其他实施文件保持冻结。

root已回报浏览器验证TIFF顶层插入/背景/组替换，以及包括animatedWebP/EXIF6在内8种原媒体保存不变；这是root证据，本检查者未重复操作浏览器。仍待修复后图片填充footer在wide/420/短高的可见性、实际应用与关闭回焦，及统一build。Desktop用户自验，无模型配置验收。

参考沿本片计划的固定GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`，WeKnora v0.8.3/固定源码 `3e22822c1d2397be730c458c7539d0eb8c113a24` 仅能力门控适用。独立检查未重新联网，不把实施者抓取事实记作本检查者新研究。
