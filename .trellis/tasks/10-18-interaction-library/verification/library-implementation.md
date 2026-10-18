# Library 实现代理报告

2026-10-18，按冻结 revision2 `ce43cbea265b09b3fd75d9db9d0f3d02723ef1559f2e9a09d742750285dc2f40` A 分支。未提交，由主会话协调GUI、独立复核、规范及提交。

## 实现

- `LibraryView.tsx/style.ts`：列表与卡片共享既有更多菜单；操作不冒泡；菜单动作保持当前类型条件，无新移动/改名命令。目录先行、对齐状态/时间/32px动作列，700/480容器断点44px目标。头部/内容按实际画布3.2cqw；字号及浅深色消费冻结稿局部角色，不改全局theme。
- 知识库根身份保持；描述真实测量截断并展开、长路径折叠/展开、名称后缀保留、长标签/详情可查看。100条说明不伪报total。
- scope切换保留旧结果时说明旧来源，旧目录项和文档同源；标签切目录不会混入新子目录。缓存文档/目录刷新失败分别说明并重读；无缓存失败阻断；标签不被无关目录失败遮挡。缺失子目录、零知识库旧scope和空标签各有准确恢复。
- `FolderNameModal.tsx`：500px局部弹窗、inline校验、IME/ref单飞、pending禁关闭/取消/输入、失败留稿及重试；重命名走被操作对象同父级move，失败重读目录校准，retrySafe=false、状态不明阻止盲重试。阻断说明不会因改草稿消失。退出afterClose回真实trigger。
- `SourceReplaceDialog.tsx`：500px弹窗先选择/重选文件，明确覆盖后果，再显式替换；原生取消保留前次File；请求单飞，失败重试保留同一File和目标ID。按parseError/charCount报告原件已保存与正文结果；不宣称请求失败时未保存。
- 删除文件/笔记/网页资料后果分别准确；目录/知识库删除明确保留文档但清空归属并离开知识库筛选。`FolderSection.tsx`仅两条删除文案。
- `document-name.ts`集中原有展示后缀逻辑；`library-tokens.ts`/`library-dialog-styles.ts`限定冻结稿局部排版、色彩及弹窗样式（新样式object syntax）。FileFormatIcon由图标代理拥有，LibraryView只接入。

## 验证

- Renderer相关回归：`./node_modules/.bin/vitest run src/components/library src/components/nav/FolderSection.test.tsx src/components/KnowledgeBaseCreateModal.test.tsx --maxWorkers=2`：8文件47项全部通过（含图标代理测试）。
- 新增行为覆盖：IME/229/同帧单飞/等待关闭锁、错误留稿/unsafe retry、显式替换/原生取消模拟/原File重试/空正文与解析失败、列表菜单不打开、失效目录/空标签、scope混源、文档/目录缓存错误、删除对象和三类后果、新建笔记单飞。
- 限定oxlint通过；限定oxfmt检查通过；AntD 6.6.6 `info → demo` 查询 Modal/Input/Dropdown/Button/Empty，最终 LibraryView/FolderNameModal/SourceReplaceDialog 的 `antd lint`均0问题。
- Renderer `tsc --noEmit`仅既有外部失败：`src/lib/agent-media.check.test.ts:12` TS2550 `Promise.withResolvers`，没有本模块类型错误。未改该文件。
- 限定`git diff --check`通过。

## 主会话仍须验证

- 实际浏览器对照冻结稿（相同画布/内容）、浅深、390px、低高度、hover几何、菜单键盘和回焦。
- 实际原生chooser/取消/下载、真实替换响应和服务端文件内容不能由happy-dom合成事件证明。
- 模块2统一知识库创建/编辑、模块3守卫/命令及模块4导入交接继续沿用其合同；原生系统/Electron/读屏未由代理验收。
- 47项相关回归不是299状态逐一GUI测试；全仓门与其他会话阻断由主会话如实记录。

## 主会话GUI一次集中确认后的限定修正

仅`LibraryView.tsx/style.ts`：常态目录提示为“含当前目录及其下级文档”；body局部8px滚动条并保留stable gutter，按冻结稿绘制2px底色thumb边框；sectionHead最小33px恢复面包屑24px+底距8px+边框1px的纵向节奏。两文件限定oxlint/oxfmt与diff检查通过；`vitest run src/components/library --maxWorkers=2`：6文件33项通过。实际像素尺寸由主会话确认。

## 窄屏冻结规则补齐（主会话390px集中GUI发现）

本次仅补获批 `review.css:1464–1621` 的700/480规则，不改导航。主内容均以`page`的实际inline-size容器为依据；`LibraryView.tsx:93`的ResizeObserver同步实际宽度，700px以下使用“新建”合并入口及窄布局位置，非按浏览器总宽推断。原宿主52px导航保持。

| 冻结几何/触点 | 产品落点 |
| --- | --- |
| <=480头部/内容/位置栏16px | `LibraryView.style.ts:132,158,492`，均container query |
| 标题25px/1.4、描述13px | `LibraryView.style.ts:183,202`，局部具名尺寸 |
| meta gap4×12、toolbar bottom14、section top10 | `LibraryView.style.ts:264,370,431` |
| 布局标签12px/左右5px/图文gap4 | `LibraryView.style.ts:398`，Segmented语义子节点 |
| 普通窄按钮左右10px/gap5 | `LibraryView.style.ts:162` |
| 700px卡片最小250、480px卡片gap12 | `LibraryView.style.ts:507,511` |
| 480px行左右8px；更多触点44px保留 | `LibraryView.style.ts:834`及既有700px44px规则 |
| 弹窗top24、左右10、padding18、标题15、字段16、footer top12 | `library-dialog-styles.ts:7–13,65–70`，弹窗保留body portal，因此其宿主为整个viewport；通过局部root类约束，不更改全局Modal |

变更文件：LibraryView.tsx/style.ts（实际容器布局）、library-tokens.ts（批准窄尺寸）、library-dialog-styles.ts（局部弹窗）、FolderNameModal.tsx/SourceReplaceDialog.tsx（挂局部root并去掉写死top）。未新增镜像单元测试。

验证：限定oxlint无问题、oxfmt通过、diff检查通过；library回归6文件33项通过；Renderer tsc仍只有既有agent-media.check.test.ts:12 TS2550。新的实际GUI几何由主会话一次集中复核。
