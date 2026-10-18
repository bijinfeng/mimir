# Research: 文件格式图标更新候选

- Query: 用户不满意现有文件格式图标；比较官方现成 SVG 家族，供本轮 HTML 真实视觉选择。
- Scope: mixed（官方源、许可证、固定 SVG 及离线尺寸/主题渲染；不改产品或 prototype）
- Date: 2026-10-18

## Findings

### 建议

优先在 HTML 展示 **A：Phosphor duotone 文件家族 + 同家族来源徽标**；同时完整保留 **B：Material Icon Theme 原生格式图标**作真实对照。A 的折角、线条与轻填充更容易统一到当前语雀方向，且不必增加彩色底块或手工拼字徽标；B 格式识别直接，但颜色、实心程度、画布比例差异较大。最终让用户看同场景实际 HTML 决定，不把本报告当选型批准。

A 不是直接使用一套浅深共用低饱和色：离线渲染已显示暗色背景下会偏暗，应提供单独更亮的暗色前景；20px 的 DOC/XLS/PPT/PDF 字母都小，不可只靠图内文字辨识。B 的深蓝 Word 在暗色也偏暗。两套都需要旁边文件名/类型文字，不以颜色作为唯一信息。

### 固定版本与许可证核实

| 候选 | 官方仓库与固定版本 | 实际许可证核实 | 本地 SVG 适用性 |
|---|---|---|---|
| A | [phosphor-icons/core](https://github.com/phosphor-icons/core)，commit [2b75f3ad12b420c9504ef05df8d2564a28f8500e](https://github.com/phosphor-icons/core/tree/2b75f3ad12b420c9504ef05df8d2564a28f8500e)，2026-01-06T21:28:48Z | 固定版根目录 [LICENSE](https://github.com/phosphor-icons/core/blob/2b75f3ad12b420c9504ef05df8d2564a28f8500e/LICENSE)：MIT，Copyright (c) 2023 Phosphor Icons。保存 `icon-evidence/phosphor-LICENSE.txt`。不只依据 GitHub metadata 判断。 | MIT 明文允许使用、修改、分发和销售副本，需保留版权和许可声明。选定 SVG 可随本地资源打包，无需运行时 CDN、图标字体或安装整库。 |
| B | [material-extensions/vscode-material-icon-theme](https://github.com/material-extensions/vscode-material-icon-theme)，commit [13025adc5ad10a5cc649528a2c1edec93069f1b9](https://github.com/material-extensions/vscode-material-icon-theme/tree/13025adc5ad10a5cc649528a2c1edec93069f1b9)，2026-10-13T05:19:33Z | 固定版根目录 [LICENSE](https://github.com/material-extensions/vscode-material-icon-theme/blob/13025adc5ad10a5cc649528a2c1edec93069f1b9/LICENSE)：**MIT**，Copyright (c) 2025 Material Extensions。保存 `icon-evidence/material-LICENSE.txt`。没有因为名称含 Material 就假定 Apache/Google 授权。 | 同样可商用、修改和本地分发，保留声明。原始 SVG 有固定填色；采用前应统一外层尺寸并检查主题，不能假设 `currentColor` 能直接控制颜色。 |

以上是代码和图形资源许可证结论，不表达品牌合作或官方背书。无需引入 VS Code 扩展本身。

版本元信息、许可证 API 原响应及实际解码文本都保存在 `icon-evidence/`；完整源/许可/哈希映射见 `icon-evidence/source-manifest.json`。树检索 `truncated=false`；只保留相关路径快照，未复制整个图标仓库。

### 格式覆盖与准确官方路径

A 前缀 `assets/duotone/`，B 前缀 `icons/`；表中均为官方树已核实存在的路径，不把 `.docx` 等扩展名误当官方文件名。

| Mimir 对象/格式 | A：Phosphor | B：Material Icon Theme | 说明 |
|---|---|---|---|
| Word / DOC / DOCX | `file-doc-duotone.svg` | `word.svg` | 适配现有文档格式分类，不改打开能力。 |
| Excel / XLS / XLSX / CSV（可按现有分类） | `file-xls-duotone.svg`；CSV 可用 `file-csv-duotone.svg` | `table.svg` | B 没有本报告确认的 `excel.svg`，使用实际 `table.svg`。是否细分 CSV 由当前格式语义决定。 |
| PPT / PPTX | `file-ppt-duotone.svg` | `powerpoint.svg` | 不改变 Office 编辑边界。 |
| PDF | `file-pdf-duotone.svg` | `pdf.svg` | 保留 PDF 类别。 |
| Markdown | `file-md-duotone.svg` | `markdown.svg` | 笔记来源与上传 Markdown 可共用格式形状，但需要类型文字区分。 |
| HTML 文件 | `file-html-duotone.svg` | `html.svg` | “HTML 文件”不等于“网页来源”。 |
| 普通文本 | `file-text-duotone.svg` / `file-txt-duotone.svg` | `document.svg` | B generic document 是合理回退，不冒称专属 TXT 资产。 |
| 通用代码 | `file-code-duotone.svg` | `xml.svg`（候选通用代码形状） | B 的 `xml.svg`本意是 XML；作为其他代码回退须标注映射，不伪称官方 generic-code。优先按现有代码分类。 |
| 图片 | `file-image-duotone.svg` | `image.svg` | A 也有 PNG/JPG/SVG 专属文件，不必无范围地细分。 |
| 音频 | `file-audio-duotone.svg` | `audio.svg` | 不改变播放器能力。 |
| 视频 | `file-video-duotone.svg` | `video.svg` | B 是实心场记板，A 是纸张/摄像机语义。 |
| 压缩包 | `file-zip-duotone.svg` / `file-archive-duotone.svg` | `zip.svg` | 选一种保持库内一致。 |
| 未识别文件 | `file-duotone.svg` | `document.svg` | 保留通用回退，不能显示空白。 |

下面是**来源**，应与文件格式分开，不要全显示成“本地文档”：

| 来源 | A：同家族准确路径 | B 的诚实选择 |
|---|---|---|
| 普通网页 | `assets/duotone/globe-hemisphere-west-duotone.svg` | 可用官方 `icons/http.svg`；仍需“网页”文字，不能误读成 HTML 本地文件。 |
| 微信公众号 | `assets/duotone/wechat-logo-duotone.svg` | 固定 Material 树未找到 `icons/wechat.svg`，可明确混用 A 的官方 WeChat 图标并记录跨库来源，或保留现有来源 glyph；不能用 document 假装专属公众号图标。 |
| GitHub | `assets/duotone/github-logo-duotone.svg` | 固定 Material 树没有 `icons/github.svg` / `github_light.svg`，可明确混用 A 的来源徽标。若主会话另找到官方不同名称，应重新固定证据，不猜测。 |

`material-source-candidates.json` 明确记录不存在的候选：`icons/code.svg`、`world.svg`、`github.svg`、`github_light.svg`、`wechat.svg`、`file.svg`、`browser.svg`、`text.svg`。官方树里的 `folder-github.svg` 是文件夹图标，不能直接冒充 GitHub 网页来源。

已把 A 三个来源 SVG 原件保存为 `phosphor-{globe,wechat,github}.svg`；原路径/commit 在 `extra-source-map.json`。`phosphor-selected-tree.json` / `material-selected-tree.json` 包含可用 GitHub blob URL，便于避开 raw 域名超时获取。

### 20 / 24 / 32px 与浅深可读性

已用本地 Sharp 对官方原 SVG 做离线栅格样本，查看 [size-theme-samples.png](icon-evidence/size-theme-samples.png)。实测样本包括 Word、Excel、PPT、PDF、图片、视频，B 额外有 HTML；A HTML 下载当时超时，图中空位是**证据缺口**，官方树已确认格式存在。没有把这张 PNG 当成浏览器/实际页面验收。

测试背景固定白色 `#fff` / 深色 `#1b1d21`。A 样本只替换 `currentColor` 为候选克制格式色，源 SVG 原件未修改；B 使用原始内置颜色。颜色不是已批准 token，且 A 样本故意保留同一颜色以暴露暗色风险。

| 尺寸 | A 离线观察 | B 离线观察 | 对 HTML 的建议 |
|---|---|---|---|
| 20px | 纸张轮廓可辨，DOC/XLS/PPT/PDF 字母非常小；image/video 的小图形也较细。 | 大部分实心轮廓更强，PDF/Word 内部细节仍小。 | 只用于密集辅助行；旁边保留名称/类型，不以内部字母作为唯一辨识依据。 |
| 24px | 家族结构更容易保持一致，格式文字仍是辅助。 | 识别直接，Word/Excel/PPT 实心程度一致，但 HTML/Video 的外形不同。 | 适合目录列表候选；需要在真实行高和 hover 背景检验视觉居中。 |
| 32px | 细节、折角与 duotone 更清楚，留白比 B 多。 | 更饱满、鲜明，可能抢文档标题注意力。 | 适合卡片候选；同外框不等于同视觉重量，允许按全家族统一规则适配，不逐个随意拉伸。 |
| 浅色 | A 低饱和色较安静；20% 的浅填充只能作辅助。 | 原生高饱和暖色/绿色突出。 | 提供当前/两方案真实对照，不预先给 A 美化而故意削弱 B。 |
| 深色 | A 使用同一克制色时整体偏暗，需要专用暗色前景。 | Word 原色 `#01579b` 在深色偏暗；PDF/PPT 更醒目。 | 每套都提供浅深等量检查；必要的主题调整必须标为衍生版本，保留原件/许可。 |

A 多数 `viewBox=0 0 256 256`、`fill=currentColor`，含 `opacity=0.2` 浅层；B 并非同一画布：本次 `word/html/video` 为32，`table`为24，且有固定 fill。不能用 source SVG 画布单位推导 CSS 像素，应统一外层20/24/32显示并使用 `object-fit:contain` / 等比例布局。

不建议再补一套 Tabler：本轮两套已覆盖真实格式+来源，对比目标足够明确。引入第三套会增加风格与选择成本；如最终两套均被用户否定，再研究。

### WeKnora 检查与语义复用

沿用已完成参考版本：官网 https://weknora.weixin.qq.com/ 当日显示 v0.8.3，GitHub release v0.8.3；源码固定 `2c0d8384398ca756ee414eef01b71caf91e2caa6`。官网、release 和之前的源码证据见 `reference-evidence/` 与 `reference-review.md`，本次没有重复大抓取。

增量检查固定源码：

- [DocumentFileIcon.vue:1-16](https://github.com/Tencent/WeKnora/blob/2c0d8384398ca756ee414eef01b71caf91e2caa6/frontend/src/views/knowledge/components/DocumentFileIcon.vue#L1-L16)：manual/url 走纸张+edit/link 小徽标；其他文件交给 ArtifactFileIcon。`:24-41` 来源图标固定32×38、URL和manual分色。可借鉴“来源与文件格式分别判断”，不照抄其纸张+徽标视觉。
- [ArtifactFileIcon.vue:5-10](https://github.com/Tencent/WeKnora/blob/2c0d8384398ca756ee414eef01b71caf91e2caa6/frontend/src/views/chat/components/ArtifactFileIcon.vue#L5-L10) 按文件名调用共享 SVG 工具；[artifactFileIcon.ts:5-15](https://github.com/Tencent/WeKnora/blob/2c0d8384398ca756ee414eef01b71caf91e2caa6/frontend/src/utils/artifactFileIcon.ts#L5-L15) 通过类型/扩展名生成统一纸张，扩展名仅允许1–4字母数字，未知回退 FILE。复用“统一映射、未知回退、不注入文件名”的原则，不复刻手工文件轮廓+标签条。
- 已有 `reference-evidence/DocumentListView.vue:320-341`：文件名、来源/大小/更新时间仍用文字明确呈现。因此新图标是辅助，不能移除来源文字，也不能将 URL/GitHub/公众号一律归成上传文件。

### 与当前模块的约束

`LibraryView.tsx:61-71` 当前引入本地 Material Symbols Rounded 格式 SVG，`LibraryView` 的来源和扩展名映射仍是业务边界。用户此次只要求图标候选，不授权由此修改打开/下载/替换/删除能力。当前知识库图标选择已被用户移除，不能把“文件格式图标改版”误扩展为重新加入知识库图标选择。

HTML 应包含同一真实列表/卡片、全部已有类别与未知回退；两候选均显示20/24/32、浅深和长文件名，同一尺寸/数据/背景，并明确 B 的混合来源徽标及任何衍生色值。方案先审批，产品仍不改。

## Files found

- `icon-evidence/{phosphor,material}-head.json` / `*-repo.json` — 官方仓库和固定 commit。
- `icon-evidence/{phosphor,material}-license.json` / `*-LICENSE.txt` — 实际许可证 API 证据与解码文本。
- `icon-evidence/{phosphor,material}-selected-tree.json` — 固定树中格式路径与 blob URL。
- `icon-evidence/material-source-candidates.json` — B 补充准确路径及未找到项。
- `icon-evidence/*.svg` — 成功取回的官方 SVG 原件；原路径见各 source-map。
- `icon-evidence/size-theme-samples.png` / `size-theme-samples-notes.txt` — 离线尺寸与主题样本及限制。
- `icon-evidence/weknora-DocumentFileIcon.vue` / `weknora-ArtifactFileIcon.vue` / `weknora-artifactFileIcon.ts` — WeKnora 增量固定源码证据。
- `packages/renderer/src/components/library/LibraryView.tsx` — 当前图标引入与业务分类，只读。

## Related specs

- 本任务 `prd.md` — 先完整 HTML、等具体版本批准才改产品。
- 父任务 `module-map.md:24-38` — 同数据同尺寸与原生边界。
- `.trellis/spec/project/rules.md` — 不增加非目标能力；结论标证据/时间/条件。
- `.trellis/spec/renderer/frontend/index.md` — 前端规范入口。

## Caveats / Not Found

- raw.githubusercontent.com 本次多次超时，已对关键源改用 GitHub API blob/contents；失败下载不等于格式不存在，路径存在以固定官方树为证。
- B 没有确认公众号/GitHub独立来源图标；混用需公开记录，不声称是单一 Material 图标家族。
- 离线 PNG 验证的是 SVG 轮廓与尺寸，不是实际 Chromium 字体/抗锯齿、鼠标/焦点或完整页面效果；最终由真实 HTML 评审。
- 两套都不能证明图片/音频/视频文件可以编辑；图标只标类别，能力继续服从 Mimir 当前合同。
