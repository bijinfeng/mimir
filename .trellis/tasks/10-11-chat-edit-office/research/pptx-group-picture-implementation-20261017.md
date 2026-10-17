# PPTX 直接组合图片实施与专项检查（2026-10-17）

## 状态与范围

本片代码与专项检查完成，生产文件已交根会话冻结。**真实生产浏览器宽屏/420px、上传后原件与下载历史尚由根会话验收；本报告不代表这部分通过。** 本实现者的 CUA `iab` 不可用，`getState` 返回浏览器空列表与 Mac 锁屏；遵守用户 Desktop 自验决定，没有绕过锁屏使用其他 UI 技术。

支持一个顶层组合内的一个直接普通图片成员：当前不透明度、四边数值裁切/重置、PNG/JPEG 替换，以及保持原图尺寸的去背景 PNG 回写。普通替换清除旧裁切，去背景由服务器再次比较原图与新图尺寸后保留裁切。深层组合、媒体封面、兼容分支、不安全/歧义原生结构拒绝；组内画布拖裁切、图片格式扩展与模型工具词汇不在本片。

## 参考与适用性

沿 `pptx-group-picture-next-20261017.md` 的已核版本与源码：GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 的 `groupChildSlices` / `patchGroupChildXml`、原生图片透明度/替换与资源清理语义。父组合 XML 是保存真相，不能仅改子对象模型，也不能解组再重组。

WeKnora 官网本轮研究实际 HTTP 200，版本缓存 v0.8.3；公开源码固定 `3e22822c1d2397be730c458c7539d0eb8c113a24`，本轮源码重抓超时，使用前序取得的 definitions.go 缓存。只借用能力与权限真实绑定的原则；没有 PPTX/OOXML 组合图片合同，不作为工具栏主模型。具体路径、行号与网络限制见前述研究报告。

## 文件与接缝

| 位置 | 改动 |
| --- | --- |
| `packages/shared/src/pptx-picture.ts`（新）、`index.ts`、`document-agent.ts` | 私有 `manual_picture` 严格 schema：单成员、有限不透明度、四边比例与对边和约束，至少一个变更字段；host action 加枚举。 |
| `packages/shared/src/pptx-agent.ts` | 既有 picture upload 增加可选 group；指定 group 必须指定 elementId。保留原上传 MIME、大小与格式边界。 |
| `packages/office/src/pptx-picture-edit.ts`（新） | 唯一顶层父组合/直接普通图片/完整 blipFill 和 blip 预检；局部 opacity/crop 更新；替换原生媒体关系并同步父 XML、子模型及结构脏标记；使用整页前后 XML 清理引用。 |
| `apps/server/src/services/pptx-manual-picture.ts`（新）、`pptx-agent-host.ts` | 验身份/版本/ZIP 后新开工作副本；单输入原子处理、取消复验、有界保存；changed 只递增一次，noop 返回原 bytes/version；返回一条无图像 payload 的小记录。 |
| `apps/server/src/services/pptx-manual-upload.ts` | 既有资产端点的 group picture 分支；keepCrop 在服务端读原图实际尺寸重验；普通顶层插入/替换沿原事务。 |
| `packages/office/src/agent/pptx-agent.ts` | 私有手动动作复用当前 handle 的 expectedVersion/lifetime/signal/host publication/round history；不增加模型固定 op 白名单或 GROUP_OPS。 |
| `packages/office/src/editors/PptxGroupPictureControls.tsx`、`pptx-group-picture-controls.css`（新） | “外观 / 替换 / 去背景”紧凑页签；真实当前值、原图/处理预览、局部草稿与显式应用；独立滚动和固定动作；失败保留草稿、同步锁、防重入、切目标/关面板/换页签取消。 |
| `packages/office/src/editors/PptxEditor.tsx` | 单独解析 depth=1 的普通图片目标；新“组合图片”上下文 Ribbon/Inspector；保留旧 selectedObject 的 depth=0 限制。绑定文档、slide path、durable selection、version；接私有 manual_picture 与现有 hostAsset。无素材宿主时禁用替换和去背景。 |
| `PptxGroupPictureControls.test.tsx`、`PptxEditor.group-picture.test.tsx`、`pptx-group-picture-test-fixture.ts`（新） | 真组件/真 Editor/真宿主和原生 fixture、history、取消接缝；测试夹具与浏览器导出共用。 |
| `apps/server/src/test/pptx-group-picture-host.test.ts`（新） | 原生存储、资源保真、拒绝、session history 与迟到结果专项。 |

没有改 vendor、renderer API 或上传路由；既有 multipart JSON 及共享类型可直接传 group。

## 发现并修正的具体问题

1. 只检查 `<p:blipFill>` 开标签时，crop patcher 可对缺失闭合标签静默 no-op，而 opacity 继续写入。新增拒绝复现后改为唯一完整 fill/blip 预检，失败发生在添加媒体前。
2. 复用原生替换时若把空 extLst 的清理扩大到整张图片，会删除 spPr 的非目标扩展。实际测试以独立 extLst 复现；清理现在只发生在选中 blip 内，并仅在移除 SVG 扩展后清空该 blip 的空列表。旧 link/SVG 关系及失去引用的 SVG 媒体移除，共享 PNG 保留。
3. 数字框在 blur/Enter 才提交，按“已提交 dirty”禁用 Apply 会挡住首击。面板只在真实数字输入时保持 Apply 可达，沿共享按钮 mousedown 的 blur 提交最新值；actual Editor 按独立 mousedown → click 验证，首次即写 62%，没有第二次点击补救。
4. 图片文件可通过 MIME 选择但实际不能解码。真实 img error 清除替换草稿、回到当前源、就地报告错误且不上传；去背景解码/生成失败也给出明确错误，不永久停留在准备状态。

## 专项结果

- Office：4 文件 **26/26**。`PptxGroupPictureControls.test.tsx` 8 项 + actual `PptxEditor.group-picture.test.tsx` 3 项；同时跑既有 selection tools 与 group selection，确认接缝无回归。日志 `/tmp/mimir-pptx-group-picture-ui-tests.log`。
- Server：2 文件 **27/27**，新组图片 17 项 + 既有组翻转 10 项。日志 `/tmp/mimir-pptx-group-picture-host-tests.log`。最后只补小 record/断言后新片 **17/17** 再绿，日志 `/tmp/mimir-pptx-group-picture-record-tests.log`。
- shared、Office、Server `tsc --noEmit` 均通过，日志 `/tmp/mimir-pptx-group-picture-{shared,office,server}-types.log`。
- 15 个 TS/TSX 文件 oxlint 零警告/错误；16 个文件 oxfmt check 通过。最后 record 两文件另行格式化/lint 通过。日志 `/tmp/mimir-pptx-group-picture-{all-lint,format,record-lint}.log`。
- 新组件、组件测试、Editor 专项测试分别执行 `antd lint <file> --format json`，三者 issues=[]/partial=false。CLI 只接受一个路径；首次多路径调用被参数校验拒绝后逐个正确执行。
- styles 反引号检查、目标 git diff check 通过。未跑全量 Office、Web build 或全仓 pnpm check；共享工作区原有脏改动保持。

### 原生与交互证据

- 初始 opacity 37%、L10/R15/T5/B20 的裁切正确读回；opacity+crop 一次发布，重复相同值 noop；恢复 100% 移除 alphaModFix 而保留裁切与阴影等其它 XML。
- 非等比/旋转/翻转/非零 chOff 的父变换、子 frame、同组兄弟 slice 保持；opacity/crop 仅目标 slide 改变，保存重开两次稳定。
- 普通替换清裁切，keepCrop 保裁切；两者保持 frame/opacity/描边/效果及其它非目标 XML。共享媒体保留、反复替换不增长孤儿；旧 SVG/link 清理限定目标，非目标扩展保留。
- schema、错误 parent/child、多输入、duplicate model/XML、missing nvId、media、deep、MC、missing blip、unclosed fill、尺寸不等及预取消均拒绝，不发布部分工作副本。
- actual handle/Editor 的保存后 undo/redo 所有非目录 ZIP entry 精确恢复；保存后第二次原生重开稳定。manual/asset 均一次写入、成员 durable selection 保持。
- pending ref 阻止重复提交，失败保草稿可重试；target/version remount、tab、Escape 取消；自身 busy 更新不误取消；cancel/并发人工编辑/dispose 拒绝 late host response，dirty/version/history 保持。
- cutout 专项使用实际去背景算法和受控 canvas mock，核查处理结果 alpha=0、编码尺寸保持2×2与 PNG/keepCrop 标记。它不是实际浏览器 PNG 编码的替代证据。

## 根会话浏览器验收夹具与剩余工作

原生夹具：`/tmp/mimir-pptx-group-picture-20261017.pptx`，manifest 同名 `.json`。由共用 fixture helper 通过独立临时 Vitest 导出；导出测试不计入产品质量测试数字。

- 两页；第一页父组合名「组合图片验收」、直接图片名「产品图片」。300×200 PNG 初始37%透明度，四边10/15/5/20%；父45°/flipH、非零chOff、非等比，目标虚线描边与阴影。
- 第一页组外图片和第二页共享原 PNG；父 XML 有 `untouched-group-sentinel-20261017`。
- 该导出件 refs：`{slide:0,group:"e_94cd9e40",elementId:"e_0e016b8b"}`；再次导出会生成新 creationId，以 manifest 为准。
- 从“对象 → 对象选择与格式”点「产品图片」，再点 Ribbon「组合图片」。也可在画布 Alt 点选直接成员后使用此入口。
- 根会话仍需标准账号上传、生产构建1280/420与矮视口截图、原生下载/crop/替换/去背景及保存history浏览器闭环。独立 checker 可直接检查本报告所列16个产品/测试文件；没有把模拟组件页等同生产验收。
- `/tmp/mimir-pptx-group-picture-harness` 的4197 Vite页使用实际组件与示例状态，页面明确标示不调用模型或宿主；本实现者没有获得浏览器截图，根会话可不用此页，直接验production。

图片来源仍为现有 PNG/JPEG，8MiB/16384单边限制保留；去背景另有1200万像素预算。keepCrop 必须服务器能解析原图格式/实际尺寸；其它原件来源不能用前端假尺寸绕过。深层/MC/媒体封面、组内 canvas crop、来源格式扩展按后续单独合同处理。没有真实模型调用；Desktop 用户自验。无暂存、提交、归档、上传或删除。
