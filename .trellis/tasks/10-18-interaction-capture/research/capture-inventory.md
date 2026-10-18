# Research: 收集与导入完整行为盘点

- Query: CaptureDialog / UploadPanel / AppShell / LibraryView 的所有入口、校验、等待、结果、关闭、失败恢复及跨端差异；供逐模块 HTML 对比稿使用。
- Scope: internal。竞品调研由主会话持有，本文没有读取外站，也没有使用共享浏览器。
- Date: 2026-10-18
- Snapshot: 当前工作目录源码（并非承诺某个 Git revision），`@mimir/renderer` 0.1.0；lockfile AntD 6.6.6，antd-style 4.1.0 (`pnpm-lock.yaml:236`)。未执行真实抓取、上传、桌面运行或新测试。行号以此日读取文件为准。

## Findings

### 1. 文件与规范入口

| 文件 | 作用 |
| --- | --- |
| `packages/renderer/src/components/CaptureDialog.tsx` | 540px 收集弹窗；链接来源判断、单次 mutation、4 阶段、260ms 自动交接、上传子面板 |
| `packages/renderer/src/components/UploadPanel.tsx` | 多选/目录选择/Dragger、逐个串行请求、逐文件结果、结果总数与首个成功文档入口 |
| `packages/renderer/src/components/UploadPanel.test.tsx` | 同帧重复选择 guard、等待期间无结果操作、全失败恢复、长后缀及错误可见两项测试 |
| `packages/renderer/src/routes/_app.tsx` | 全局 modal 状态、nonce 重挂载、焦点恢复、提示及打开文档 |
| `packages/renderer/src/components/library/LibraryView.tsx` | 目录/空页入口、添加菜单、独立整页拖放及 toast、当前目录落点 |
| `packages/renderer/src/components/NavSidebar.tsx` | 展开/紧凑/窄屏导航上的收集入口 |
| `packages/renderer/src/components/command-palette/items.tsx` | 命令面板“收集链接或文件”入口 |
| `packages/renderer/src/lib/app-shell-context.ts` | `{tab?,directory?,folder?}` 收集入口参数 |
| `packages/renderer/src/lib/unsaved.tsx`, `components/UnsavedGuard.tsx` | 当前页面未保存离开合同；收集成功的宿主回调未调用此 guard |
| `packages/renderer/src/lib/api.ts` | `capture.run()` JSON、`documents.upload()` multipart；没有上传百分比/abort/resume 参数 |
| `packages/shared/src/capture.ts`, `files.ts` | 来源、阶段、请求 schema、50×1024² 字节、格式与大小显示 |
| `apps/server/src/routes/capture.ts`, `services/capture.ts` | 抓取单请求编排、失败stage、canonical URL 去重及正文直接 ready 入库 |
| `apps/server/src/routes/files.ts`, `services/upload.ts`, `lib/multipart.ts` | 单文件 multipart、大小/空文件拒绝、Markdown→笔记、原件保留/尽力提取、201响应 |
| `apps/server/src/test/upload.test.ts`, `structure.test.ts`, `plugins.test.ts` | 存储/提取/格式/认证与来源测试证据 |
| `apps/desktop/src/main/host.ts`, `src/renderer/index.tsx` | 同源完整宿主与共享 renderer；无另一套上传弹窗 |

已读规范：`.trellis/workflow.md`；`.trellis/spec/project/rules.md`；`renderer/frontend/{index,conventions,pitfalls,forms}.md`；`server/backend/index.md`；`desktop/runtime/index.md`；`shared/contract/index.md`。表单规范明确：原件保存也算成功、完整错误可见、后缀保留、全失败可再选、同步批次锁、不得伪造百分比与后端 retry/undo 能力。

### 2. 稳定 ID 和场景文件约定

`capture-scenes.json` 是本盘点的机器可读状态表，`id` 不随文案调整；`group` 稳定为 `entry/url/stage/upload/directory/drop/result/lifecycle/layout`。它列的是最低覆盖单位，非要求在页面堆砌相同截图。一个交互路径可覆盖多个项，但 HTML 覆盖台账必须能由 ID 指到某一页面/状态/操作。`current` 是源码事实或明确未验证的浏览器行为，`proposal` 是建议，仅可进入“打磨后”版本，未经用户确认不能当作当前行为。

### 3. 所有宿主入口及落点

1. **展开导航“收集”**：`NavSidebar.tsx:136` 与 `:231`，先关闭窄屏 overlay，再 `onOpenCapture()`；AppShell `:400` 不传 options。默认 URL 页、知识库根。即使背景在某知识库/文档，不自动取该目录。
2. **紧凑导航“收集”**：`NavSidebar.tsx:356`，相同合同。窄屏只关 overlay，不先导航，不调用未保存 guard。
3. **命令面板“收集链接或文件”**：`command-palette/items.tsx:28`；宿主 `_app.tsx:428` 先拒绝 creatingNote/paletteGuard/pendingLeave/saving，再关闭 Palette，默认根目录URL弹窗。收集打开本身不离开背景文档。
4. **知识库添加菜单**：`LibraryView.tsx:192`、`:457`、`:814`；上传文件 `{tab:'upload',folder:folderPath}`；上传文件夹再带 `directory:true`；网页抓取 `{tab:'url',folder:folderPath}`。同菜单“直接编辑”创建笔记，**不是收集弹窗子流程**。
5. **知识库空状态“上传文件”**：`LibraryView.tsx:591`、`:606`；与菜单文件入口一致。
6. **整页拖放**：`LibraryView.tsx:306`、`:386`；`folderPath!==null` 才启用；与上面的弹窗是两条独立业务/UI路径。标签页不可拖上传。知识库 onboarding 无本页上传入口，但全局收集仍存在。
7. **每次重开**：`_app.tsx:166`、`:480` 用 Date.now nonce 做 key，重新读 initialTab/folder/directory；不能把“上次页签/结果/URL被持久恢复”写成事实。模态标题是 `收进「完整/目录/路径」` 或 `收进知识库根` (`CaptureDialog.tsx:294`)；无目标目录选择器。

### 4. 链接输入与校验精确事实

- 初始 label“网页链接”、placeholder `https://example.com/article`，autoFocus、allowClear，空时提示“支持网页、公众号文章、GitHub 仓库” (`CaptureDialog.tsx:340-369`)。空/全空白禁用抓取。
- `detectSource()` 只 trim 后检测 `^https?://`，**不是 URL 完整语法验证**；`https://`、`https://不是有效...` 仍可启用抓取，服务端 zod `.url().max(2000)` 再拒绝 (`shared/capture.ts:27`, `:80`)。客户端无 maxlength、没有字数计数/URL结构报错图标。
- 非空但无http(s)前缀提示 warning色“请输入以 http:// 或 https:// 开头的链接”；输入边框未设置 `status=error`，提示未 aria-describedby/aria-live 关联。
- `mp.weixin.qq.com` 子串识别为微信公众号，note“图片保留原链接，正文可离线阅读”；`github.com` 子串识别为GitHub仓库，note“收集仓库信息和 README”；否则“网页 · 提取网页正文”。这是子串匹配，非严格 hostname 验证 (`shared/capture.ts:84-98`)。
- 抓取/Enter 均提交 `url.trim()`；Enter handler 仅 `detected && !running`，没有 IME composition 检查或同步重复提交ref (`CaptureDialog.tsx:305-309`, `:350`)。不能声称已在原生IME环境通过。
- 等待时输入 disabled、primary loading+disabled；失败后输入保留可编辑，旧 failure/stages **在再次提交时清除**，不是编辑时清除 (`:222-225`)。更改来源会立即改变失败Alert的说明分支（按当前detected），可能与原请求原因错配。
- 前端 source本地判断，服务端也有 `/detect` 与 `/sources`，此弹窗没有调用这两个端点 (`routes/capture.ts:27`, `:73`)。

### 5. 抓取阶段、错误与成功

**严禁画成实时4阶段流。** `api.capture.run()` 是一个普通 JSON POST，pending期间 `stages=[]`，只把 fetch 行画为running，其余3行空圆点 (`CaptureDialog.tsx:219`, `:274`, `:375`)。`LoaderCircle` 只有图标，文件内未给旋转class/动画；是否受上层全局CSS影响未做浏览器验证。

- 服务端实际 fetch+extract（抓取实现和解析器）、assets、convert 后一次返回 (`services/capture.ts:68-181`)。fetch meta为体积+耗时；extract `N 字`；assets `N 张（保留原链接）`或“无图片”；convert“已统一为 Markdown”。图片**不下载本地** (`:138`)。正文直接 ready 入库，不存在确认后保存/收件箱步骤。
- fetch失败：service返回单失败stage；route抛400 `CAPTURE_FAILED`，details只 `{stage,label,note}` (`routes/capture.ts:61`)。
- extract失败：service确实有前序fetch done，但route **没把 stages 放进错误details**，前端onError只存 `{message,stage}`，所以前端不会保留fetch meta或勾 (`CaptureDialog.tsx:240`)，与源码“保留已完成阶段”注释不一致。HTML当前版须显示真实空前序，打磨后也不能凭空补出已完成数字。
- 指明failure.stage时显示4阶段，该阶段红叉；其他行普通圆点。无stage网络/保存异常，只显示warning Alert，通常无阶段区 (`:371`)。
- 失败正文原样显示：微信公众号优先说明“可能限制抓取…稍后重试，或在浏览器扩展中收集”；非公众号fetch“检查链接是否可访问”；extract“页面已获取，但未能提取正文”；assets/convert/未知stage无额外说明 (`:418-435`)。**扩展只是文案，没有打开扩展的按钮或安装流程**。
- 再点“抓取”是完整重新发起，不是stage续跑。没有单独retry按钮、取消抓取、停止、后台继续或进度百分比。
- 正常成功setStages，invalidate documents/counts（未invalidate folders），所有4行显示勾，底部“抓取完成”只带extract/assets meta (`:226`, `:439`)；API preview.title/excerpt **未显示**。260ms后reset并调用宿主onCaptured，自动关闭+打开文档；不是待用户点击“完成”的静态成功页。
- schema允许 `status:'failed'` + documentId partial success，但现有service只有fetch/extract失败且documentId=null；前端将任何存在result对象画勾，**不检查result.status** (`:401`)。assets/convert失败和保存部分成功应标为契约防御/待决提案，不能表述为可稳定复现的当前常规流程。
- schema允许documentId=null而stages=4：前端不auto-close，但显示完成，抓取按钮可再点。service若去重找不到旧记录可能返回null，是防御边界；不是新的“等待确认入库”。
- 服务端canonical去除fragment/utm/spm/from/share/ref/末尾斜杠，以canonical URL唯一索引查旧id，已存在不更新正文/目录 (`services/capture.ts:192`, `:261-276`)。响应没有`created`/重复标志；UI不能显示“已存在，已更新”或承诺移动目录。文件上传没有同名或内容dedup。响应丢失也不能断言该文件没保存：上传每次生成新ID，人工重选可能产生重复；预览须给“先到库中核对”出路，不承诺可安全重传。

### 6. 文件与目录上传精确状态机

**选择即开始、串行一文件一请求；没有先选暂存再点上传。** `Upload.Dragger` `multiple`、可目录模式、无accept，`beforeUpload`最后一文件触发`uploadAll`，return false关闭AntD自己的上传 (`UploadPanel.tsx:167-184`)。点击Dragger或正常文件drop可开始；目录选择依赖webkitdirectory与浏览器能力，未测原生文件/文件夹选择器。

- 默认Dragger图标ArrowUpFromLine22、标题“把文件拖到这里，或点击选择”；hint“单个文件不超过50 MB。Markdown导入为笔记，其他格式保存原件”（`formatBytes(50*1024²)`确实显示50 MB，非十进制配额）。directory标题“选择一个文件夹”，hint“保留目录结构，跳过空文件夹”。没有单独“选择文件”按钮或拖拽高亮局部自定义JS；内部hover/focus/drop样式交由AntD。
- `uploadActive`同步ref先挡重复批次；busy state驱动Dragger disabled并通知父modal锁闭 (`:82-86`)。后续选择不追加队列；新批次整体替换旧rows。
- 所有文件先pending，按选择序依次变uploading，再done/failed，失败不阻止后续 (`:88-153`)。行key `name-index` 支持同名但不去重。没有batch ID持久化。
- 前端只拦 `size>52,428,800`；等于50MiB允许，0字节照常发请求，由服务端拒绝“文件是空的”。错误显示完整message，非Error用“上传失败”。
- >0字符显示“已提取 X 字”（zh-CN千位格式）；0字符显示“原件已保存；可搜索状态见详情”，均绿色CircleCheck、算成功。parseError不在此面板细分，含未知格式/损坏/编码不支持；应去详情判断。**即使非空Markdown只有frontmatter、body为0，也返回note但UI目前说原件已保存，这是既有误导** (`services/upload.ts:112`, `UploadPanel.tsx:130-135`)。
- 行内pending无状态图标、有“等待上传”；uploading LoaderCircle+“上传中…”；done14px绿勾、failed14px红叉，错误detail红色。文件名展示webkitRelativePath或name，最后后缀独立flex-none；完整name在title。format通过`formatLabel(null,name)`主要后缀大写，并非MIME派生“Word”。size formatBytes (`:199-225`, `:263`)。
- 结果列表最大240px内部滚动；行flex、gap8、padding7×10、图标槽16px、name min-width80；detail桌面max180px、overflow-wrap:anywhere；≤600px行wrap，detail全行左缩24px (`:302-357`)。stem有ellipsis，extension保留，但异常长单后缀可超宽；长目录路径只能title看全。错误不应截断至无法恢复。
- 只有busy=false且全非pending才显示Alert与actions (`:76`, `:230`)。全成功success `N 个成功`；部分/全失败warning `N 个成功，M 个失败`，description“处理后可重新选择失败文件上传”。无系统内选失败项重试按钮。
- 首个成功文档是**整批完成后**才有主按钮 `打开《首个成功文件名》`，中间Typography.Text ellipsis完整title；不是每行可打开、也不是自动打开。全部失败无打开按钮。
- “继续上传”仅`setRows([])`，不自动开原生选择器；Dragger仍在，可重新选。用户直接点击Dragger开始新批次也替换旧rows。关闭后结果丢弃，已上传文件不撤销。
- 目录目标为`当前目标 + 所选目录首段 + 子路径`，首段保留（`UploadPanel.tsx:63`）。如目标“研究/草稿”，所选“论文集/2024/a.pdf”→“研究/草稿/论文集/2024”。每行显示完整相对文件路径。空目录无法生成File，不会创建empty folder实体。没有选择目录树预览/重命名/跳过规则配置。
- UploadPanel未调用queryClient.invalidateQueries；全部完成后如果只关闭弹窗，已有library/counts/folders查询没有显式刷新 (`UploadPanel.tsx:155`、`_app.tsx:489`)。对比稿必须把刷新行为提升列为待改提案，不能说当前已自动刷新。整页drop路径反而会invalidate三者。

### 7. 整页drop：不要漏掉第二条流程

`LibraryView.tsx:306-329`、`:389-413`：
- 只folder scope允许；Files类型进入计数器depth，显示覆盖层“松开即上传到这个知识库”；dragLeave计数为0撤层；dropEffect copy。覆盖层文案对“子目录”落点不精确，应在提案解释完整路径。
- drop从`dataTransfer.files`取扁平File[]，未遍历directory entries，未读取webkitRelativePath；**不能承诺拖文件夹保留树**。
- drop非空即调用独立串行循环；超限只累计failed，异常catch只累计failed。不是弹窗UploadPanel，无逐文件列表、busy指示、abort/cancel、理由面板或同步批次ref；用户重复drop可能并发两条批次。
- 全完成后invalidate documents/folders/counts；成功>0弹success“已收进 N 个文件”，失败>0再warning“M 个文件没能上传”；部分失败两toast；全失败只有warning。无成功后自动打开/首条打开按钮。
- 空FileList无请求，非Files类型不进入overlay；非folder scope drop不preventDefault（浏览器默认行为边界需实际测试）。
- 可提案**复用统一结果/队列UI**，但它改变现在“直接后台toast”的体验，必须在打磨后与审批范围明示。无后端改变也可复用UploadPanel UI，但当前未实现。

### 8. 生命周期、焦点、未保存保护与风险

- Modal `width=540`、destroyOnHidden；idle X/mask/Escape/footer可关闭（URL“取消”、upload“关闭”），调用reset清URL/stages/failure (`CaptureDialog.tsx:255-269`, `:286`)。并无“要放弃输入吗”确认或保存草稿。
- busy时X隐藏、mask/Escape禁用、footer按钮disabled，close函数再挡running/uploadBusy；不能画一个可点击“取消任务”然后假装服务端停止。
- **tabs未disabled** (`:318`)：URL busy可切upload并启动上传；upload busy切URL会卸载UploadPanel，异步请求继续但rows丢失，父uploadBusy直到原函数结束才恢复。再切回创建新UploadPanel及新guard；可能并发另一批。打磨后建议锁tabs或保留mount+只读切换，具体选择需批准。
- URL成功260ms期间running=false，可以关闭（reset清timer）；也可以再次提交、切tab或Enter，旧timer未在onMutate清理，存在迟到自动交接竞态。新modal nonce重挂载没有effect清timer；标准关闭会清。建议明确settling状态/锁交接，而不是编造后台任务。
- UI控件busy采用state，URL无同步提交ref；Enter组合键重复提交及IME属于待验证风险。
- 普通关闭后afterClose宿主尝试focus：带tab的library调用优先`[data-capture-trigger]`，否则保存的activeElement，失效再找library trigger或`[aria-label="收集"]` (`_app.tsx:176-190`)。成功交接先禁用恢复焦点flag，避免抢文档焦点。
- 宿主成功关闭后toast并`openDocument(id,folder?folder:all)` (`_app.tsx:489-505`)；openDocument本身直接navigate (`:268`)。这一支没有`runGuarded`，从有未保存Office/笔记背景发起全局收集会跳离，**不能在当前稿里画成已存在的未保存保护**。建议打开文档时走既有guard：继续编辑、手动模式丢弃、保存并离开、保存中、保存失败；自动模式不能承诺撤销已保存版本 (`unsaved.tsx:75`, `UnsavedGuard.tsx:60`)。
- 普通close不会删除任何已上传成功文件。pending无法关闭也不代表后台API可abort；刷新/页面卸载/切账号没有本模块专用恢复合同。
- folder是打开时捕获的字符串路径，不是稳定folder code；后台被改名/删除后ensureFolders可能重建旧路径。无落点有效性校验或冲突协调。这是范围风险，需主会话判断是否纳入提案。
- URLcanonical重复落旧记录时宿主仍toast“已收进目标”，但既有记录可能在其他目录；结果页scope用当前目标仍可打开旧id。不得凭这个提示宣称旧记录已移动。

### 9. 细节状态与版式验收清单

`capture-scenes.json`列出具体数据分支，以下是适用于各场景的正交细节，HTML须能实际交互：

- 所有button、tab、URLclear、Dragger：default / pointerhover / active pressed / keyboardfocus / disabled；边框hover不得改变宽高，图标SVG与文字中心稳定，错误区域出现不要挤出不可达footer。
- URL label/input/clear/段提示顺序；Tab/ShiftTab focus trap；Enter仅链接有效且无busy时；Esc关闭或busy被阻止；Segmented左右键/Space由AntD本身处理，当前浏览器未测。
- Dragger click/Enter/Space和原生filepicker cancel；模拟preview必须写“模拟选择/无真实上传”，不能把DOMFile事件mock当原生选择验收。
- Dragenter hover / child dragleave / full leave / dropFiles / nonFiles / disabled drop / repeateddrop；目录选择dialog的webkitdirectory能力在真实宿主各自验证。
- 390×844窄屏、1042×853桌面、低高度844×480、200%字号或zoom、浅深色、reducedmotion；modal长标题、长URL（含query）、长来源note、长单词错误、长多级目录、超长文件stem/后缀、同名双文件、无后缀、`.env`隐藏文件、中文/拉丁混合名、多行error、20+列表需都能读与滚动。
- 仅自定义上传行有600px响应式；CaptureDialog未定义自己body max-height/overflow/footer sticky或窄屏footer wrap，不能假定低高度已通过。sourcekind baseline flex无wrap、stageMeta marginleftauto无minwidth、previewMeta无wrap，均需实际检查溢出。
- 当前stage图标没有aria-label，各行没有role=status/live；上传结果有aria-label与aria-busy，行状态只文字，无aria-live。提案补状态朗读/错误关联是前端可用性改进，应明确列出。
- current/proposed同内容同尺寸；成功预览260ms可在比较器“冻结”但须注明真实产品自动跳转，不能把冻结场景看成当前产品能停留。并排前后页的原生checkbox/radio/button交互不能串状态。

### 10. 现有测试覆盖与缺口

- `UploadPanel.test.tsx:10`：两文件串行，重复change同帧不启动第二批；第二文件未返回时没有打开/继续按钮；结束后才出现。
- `UploadPanel.test.tsx:54`：全部网络失败保留完整错误、0成功1失败、后缀独立span、无打开、“继续上传”清结果。
- 没有找到CaptureDialog专用测试；AppShell测试直接mock该组件 (`routes/-app-shell.test.tsx:27`)；LibraryView测试是图标/卡片，不覆盖drop与宿主选目录。
- `apps/server/src/test/upload.test.ts:129`：请求体过大413；`:149`过压缩Office存原件parseError；`:173`原件字节；`:200`未知ZIP存原件0字符parseError=null；`:252`Markdown成为note+frontmatter；`:275`UTF8可搜；`:294`GBK保原件error；`:306`空文件400；之后Office/PDF提取与授权/下载覆盖。本文只读取，未重跑。
- `structure.test.ts:406`来源识别与invalidURL400；`plugins.test.ts:247`识别规则与注册抓取器一致。没有找到真实URL流式stage、busy切tab、迟到timer、上传闭窗刷新/未保存跳转保护的专门回归测试。

### 11. 当前事实 / 可审批提案 / 不支持能力分隔

**可做视觉提案**：目标位置小标题、统一source提示、stage静态4行的诚实等待说明、可读错误、稳定1px边框/焦点环、上传行密度/后缀/窄屏stack、结果总数/首个打开/继续选择、低高度body滚动footer可达、配对语义色、键盘focus与aria、相同state几何。

**需要明确审批的交互修复提案**：busy锁tab避免丢队列；成功交接防重复；URL完整校验/IME保护；上传结束刷新库计数/目录；整页drop复用逐项结果；成功打开前既有未保存guard；原件保存与Markdown空正文区分。它们不必改后端，但改变现行为，不能偷偷混为已验收视觉。

**没有现合同，不画假控件**：单文件进度百分比/速度/剩余时间、真正取消/暂停/恢复、断点续传、自动失败retry、单击重试失败项、撤销已入库、文件同名去重/覆盖选择、批量URL、多链接队列、可选择目标folder树、抓取实时SSE、多阶段断点恢复、图片已离线下载、上传保存预览确认、每行“打开”、原生OS授权/选择器样式复制。URLcanonical去重只服务端已有、响应未公开，不能扩成新UI能力。

## Caveats / Not Found

- 本研究是源代码/测试静态盘点；没有触碰主会话浏览器、无外网抓取/导入真实数据，也没有执行OS原生文件/目录选择、拖目录遍历或Electron验收。
- 类名/颜色/hover实际数值由现有AntD与主题合成，本文没有截图或计算像素；主会话必须用当前产品截图建立“当前”版证据，不能把手写近似称为像素还原。
- 所有服务器错误文案可能由插件/网络返回，不能穷举字符串；分类以stage+message及保存/未保存语义为准。
- 当前图中的失败assets/convert、partial saved response、null documentId、原生picker取消应分别标明契约防御/环境场景，不能伪称常规API响应可复现。
- 竞品 WeKnora（含版本证据）由主会话另外研究记录；本文不承担外部参考结论。
