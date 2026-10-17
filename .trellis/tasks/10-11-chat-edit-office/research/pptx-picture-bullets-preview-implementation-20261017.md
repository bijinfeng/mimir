# PPTX 图片项目符号预览实施结果

2026-10-17；代码冻结，待正式独立检查与 root 生产构建/浏览器。计划见 `pptx-picture-bullets-preview-plan-20261017.md`。

## 修复与文件

- `packages/office/src/pptx-svg.ts`：只移动普通空文字 run 的过滤位置，改为先处理原有 `run.image` 分支。上游 buBlip run 正是空文字+真实图片 URL，以前被提前 continue 吞掉；原有图宽/图高/基线、样式 flush、段落身份及顶层/组共用通路全部保留。
- 新 `packages/office/src/pptx-picture-bullets-preview.test.ts`：6 项有意义回归，独立 native DrawingML fixture 经正式 reader/render；不依赖 `/tmp` 临时文件。
- 计划与本结果报告；未改长期产品契约/spec、vendor、native writer、PptxEditor、deck预览组件、共享服务、其他格式或 checker 持有文件。

## 验证

旧生产代码运行新增测试：**5 失败/1 通过**，失败均为实际 SVG 缺失 image，保留 `/tmp/mimir-pptx-picture-bullets-preview-before-20261017.log`。

最终定向 **6 文件56/56，exit0**：

```sh
cd packages/office
./node_modules/.bin/vitest run src/pptx-picture-bullets-preview.test.ts src/pptx-svg.test.ts src/pptx-group-svg.test.ts src/pptx-image-display.test.ts src/editors/pptx-picture-bullets.test.ts src/pptx.test.ts
```

日志 `/tmp/mimir-pptx-picture-bullets-preview-tests-20261017.log`。Office `./node_modules/.bin/tsc --noEmit` **exit0**，日志 `/tmp/mimir-pptx-picture-bullets-preview-types-20261017.log`；两个源码/测试文件 scoped oxlint 零警告/错误、oxfmt check 与 `git diff --check` 通过。

覆盖：空text图片不被过滤且打断普通text合并；真实PNG顶层/JPEG直接组、420/960宽、125%及12pt固定大小、3:2原图比例、悬挂缩进和body避免重叠、换行只首行一个符号、真实group矩阵、原media缺失沿既有dot fallback、12次重复render无Image/createImageBitmap/document.createElement/ObjectURL/fetch分配、session version/view/media/dirty不变与全ZIP无改动、A→B→A原生host替换相同media path而不同实际JPEGURL不串源。已有image-display专测继续证明取消与陈旧异步媒体准备不发布。

中间测试纠正了测试自身单位（tree.scale是视口比例而非EMU→px，使用fitWidthPx/slide.cx）与SVG两位小数边界容差；A→B→A比较image属性而非每次parse新生成的临时element id。types补齐构造用render tree的必填fill/background/flip属性；这些不是新增生产缺陷。

## root 原件的直接证据

只读打开 `/tmp/mimir-pptx-bullets-browser-group-jpeg-20261017.pptx`：

- 原件 SHA256 `a3296526cd51ad816a1dbf7049aaefc73fa787bbc16d26ffcd8752ad3197369a`。
- 正式 `renderSlide` 在960和420宽都输出 **8 个真实 `<image>`**，4 PNG+4 JPEG，对应两个顶层与两个直接组成员各两段。
- 960宽：首段27×18px、第二段20.25×13.5px；420宽按比例11.8125×7.875及8.859375×5.90625px。坐标、MIME与每个实际URL哈希均保存。
- version 0→0、dirty=false，原文件SHA保持不变。

产物：

- `/tmp/mimir-pptx-picture-bullets-preview-evidence-20261017.json`
- `/tmp/mimir-pptx-picture-bullets-preview-960-20261017.svg`
- `/tmp/mimir-pptx-picture-bullets-preview-420-20261017.svg`
- `/tmp/mimir-pptx-picture-bullets-preview-evidence-20261017.mts`（只读生成脚本）
- `/tmp/mimir-pptx-picture-bullets-preview-native-20261017.log`

生产文件 SHA256：`pptx-svg.ts` `63e048bbf69f49a4b5cbf49b6f62dfd339957bb09b6295be06d663dfd3298c91`；新test `09ce44ba373944c1c887c7746e49002cb7665c20372a53891429c913937b1bf3`。

## 资源与剩余验收

本片没有新解码器、浏览器节点构造、ObjectURL/bitmap或异步缓存；SVG直接引用当前session已准备的data URL，浏览器正常管理image DOM生命周期。不能把零应用资源分配测试说成浏览器内部codec缓存已测。真正生产文档 `SqKd4s64itsUDl1_` 新构建reload后，仍须root实际1280/420观察PNG/JPEG图符、选中目标/正文关系和保存/history原件；本实施者未操作浏览器，不声称视觉验收完成。独立checker与全套重型门禁由root统一。

原媒体codec harness仍保留 http://127.0.0.1:5185/，PID88426，未停其他服务。无新增依赖、模型请求、上传或删除；未stage/commit/archive。
