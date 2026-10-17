# PPTX 图标图库补全（2026-10-17）

## 固定参考和适用范围

- GenOffice 本地核对仓库 `/tmp/mimir-genoffice-html-git`，`git rev-parse HEAD` 为 `480548fd55f1be3593ee0d8e316a734751d58309`。
- `apps/slides/src/renderer/insert-presets.ts` 的 `ICON_GALLERY` **精确28项**，是内置24px、1.5px描边的 SVG 路径，不是 Lucide 全库；`iconSvg()` 默认512px，生成透明PNG插入。中文名称取同版本 `i18n/ribbon/zh.ts:657–684`。上游预设颜色为404040/4472C4/ED7D31/70AD47/C00000/7030A0。
- 原 Mimir `PptxPictureTools.tsx` 使用24个Lucide图形，有28项中的替换与遗漏（如文档、文件夹、相机、音乐、云、锁、购物车、火箭），不能仅视为少4项。本次恢复全部28项原始几何，不引入任意别名。
- WeKnora官网 `https://weknora.weixin.qq.com/` 本次请求HTTP200（页面标题/主页 HTML可读取）；公开源 `https://api.github.com/repos/Tencent/WeKnora/git/ref/tags/v0.8.3` HTTP200，指向 `3e22822c1d2397be730c458c7539d0eb8c113a24`。同固定commit `README.md` 的 Overview 将其定位为企业文档理解、语义检索与推理的知识框架。适合知识库/Agent能力边界参考；没有证据表明其提供Office图标图库，因此本次不把WeKnora Markdown UI当Office工具栏模型。

## 实施

- 新 `pptx-icons.ts` 明确列出28项可信SVG几何、中文名称、英文/同义词检索及5个用途分组（8/6/6/5/3）。SVG输入验证来源对象、六位HEX颜色与像素尺寸，禁止动态外部SVG输入。
- 新 `PptxIconControls.tsx`，由 `PptxPictureTools.tsx` re-export，保留旧 `{slide,upload}` 接口；新增可选 `sourceKey/version/disabled/onCancel` 供Editor绑定当前文档、原生slide path与单调版本。
- 现有Inspector中，顶部搜索/分类，中央4列图形预览与中文标签独立滚动；底部固定选中预览、颜色、6–720磅尺寸和显式插入动作。遵循现有 `--me-*` 变量与Antd小控件，不扩出全宽表单。没有写入的选中、搜索和取消均不dirty。
- 图库仅1个Tab入口；方向键/首尾键更新选中并移动焦点；选中态保留可读标签。搜索可跨分类匹配，Escape先清搜索，再交给Inspector；嵌套控件先处理自身Escape。Antd Select、颜色、数字与插入按钮均显式禁用等待态。
- 一次点击先冻结图形/颜色/尺寸；PNG异步生成后重验文档/页/版本与mounted身份，切换或卸载取消rasterize并禁止upload。上传本身继续由现有Editor `applyPanelAsset`版本/取消守卫负责；PptxUpload合同无signal，忙时取消按钮禁用。失败保留草稿，不报告成功；同tick重复点击只提交一次。
- 无vendor改动，Cutout导出和实现保留原样。

## 验证与边界

- `pnpm --filter @mimir/office exec vitest run src/editors/PptxIconControls.test.tsx`：**9/9通过**。覆盖全部28名称与安全SVG、分组/搜索/roving、两级Escape与取消、透明PNG媒体/关系/尺寸两次原生保存读回、失败保草稿/重复提交、版本/页/文档变化，以及卸载后迟到处理。
- happy-dom没有Canvas渲染器；专项测试明确只stub `rasterizePptxSvg` 边界，传真实有效PNG字节验证原生图片路径，**没有将stub作为实际图标像素渲染证据**。真实浏览器图库宽/420px、选中图形和PNG512×512下载读回由主会话统一验收。
- 所属4个TS/TSX文件定向 `oxlint` 通过；定向 `oxfmt` 通过；`antd lint PptxIconControls.tsx --format json` issues=[]。
- 中间Office typecheck的图标相关错误已全部修正；本次最终运行仍显示两个并行改动错误（`PptxEditor.tsx` Stroke.color、`pptx-picture-crop.test.ts` ByteAnchor.spIndex），已告知主会话，不能据此宣称整个包gate通过。
