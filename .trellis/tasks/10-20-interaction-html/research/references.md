# Research: HTML编辑器参考来源及适用性

- Query: 核对本轮HTML编辑范围的固定GenOffice、Office for web/Google Docs原则及WeKnora适用边界
- Scope: mixed
- Date: 2026-10-20 Asia/Shanghai（实际抓取UTC 2026-10-19 17:58–17:59）

## Findings

### 参考优先级

本轮是文件编辑：固定GenOffice为主要行为来源；Office for the web/Google Docs提供工具分组、键盘与焦点原则；Mimir现行设计规范提供应用chrome与浅深token。WeKnora已按项目要求核对，但知识库内容预览与Markdown安全渲染不等于可执行HTML文件编辑，不能作为HTML/Ribbon的主样板。没有以WeKnora Markdown编辑器替代Office工具栏规范，也不在本轮改协议/业务。

### GenOffice固定版（主参考）

- 固定版本：`480548fd55f1be3593ee0d8e316a734751d58309`，来源`packages/office/vendor/UPSTREAM.json:18–22`，2026-10-16已同步；Apache-2.0。
- 本轮实际HTTP200核对固定tree，响应SHA256 `455a0085caaf357bf4ec195081934ee952fe393592bc9b12bcc402c4893464fa`。错误猜测`renderer/StylePanel.tsx`返回404；随后由tree找到正确`renderer/components/StylePanel.tsx`，未隐瞒失败或拿404当证据。
- [StylePanel.tsx](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/html/src/renderer/components/StylePanel.tsx)：`40`PxInput、`77`useDraft、`108`ImageSection、`161–162`明确“right-hand style inspector…every change previews live and lands in the source as one set_style op”。响应SHA256 `944bb2baffd2fa944e72b4bf7ce1d5ed67f53e6cee68eea44e1a5ef7f10b7913`。适用Mimir当前右Inspector与HtmlOp即时样式；不应复制原壳或绕过Mimir版本守卫。
- [Ribbon.tsx](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/html/src/renderer/components/Ribbon.tsx)：`38`ViewMode=`preview|split|source`、`48`三模式列表、`132`ribbon collapse、`147/164–166`演示/图片/表格/更多入口refs。SHA256 `d1a15da76012acdac27b339dc71c3f06907bb5edfb6f8ec584b3c2072d9a529c`。适用确认既有行为分类；Mimir以CompactToolbar和Shell统一呈现，不能照搬独立App外壳。
- [BriefCard.tsx](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/html/src/renderer/components/BriefCard.tsx)：`9`五色palette、`39`样本使用文档色而非chrome、`121/149–161`章节clone/edit/add/remove、`136–137`样式patch记录。SHA256 `2f7c1b12b30e14f32f0789d13dff29f1b4dcbbe1e6bddf8c93bd173ac5007f1a`。适用提纲方向样本保留作者色，应用深色不能反转作者页面。
- 本地vendored `source/cm-setup.ts`、`preview/inspector.js`、`document/ops.ts`、`packages/ui/src/image-dialogs.tsx/css`是实际消费版本，只读检查。Mimir新增chrome仅在非vendor层精修。

### Office for the web / Google Docs（原则参考）

- [Microsoft Keyboard shortcuts in Word](https://support.microsoft.com/en-us/accessibility/word/keyboard-shortcuts-in-word)，实际200，整响应SHA256 `72c4a9fd0c6ea874a1143feccc343c851f5b1bb775191e738ff16e1f47986f5c`。文中有独立Word for the web段，明确浏览器快捷键可能由浏览器处理，以及Ribbon tabs/groupings/items的焦点路径。原文：“The ribbon area groups together related options in tabs.” “Word for the web offers shortcuts called access keys to navigate the ribbon.” 适用分类可见、分组命令可达、键盘进入/退出、保留真实浏览器约束；不声称Mimir实现Office全部access keys。
- [Google Docs keyboard shortcuts](https://support.google.com/docs/answer/179738?hl=en)，实际200，响应SHA256 `260ef5fc6c9289e2053e34da02526311781c6764a8a5b2c3ba0b0f5438445058`。原文：“Use keyboard shortcuts in Google Docs to navigate, format, and edit.” 列有Find、Find and replace、Find again、Find previous。适用查找Enter/Shift+Enter、关闭后回编辑上下文、可达工具；不移植不存在的协作/评论功能。页面未给固定发布版本，以抓取时间/响应hash标识。

### WeKnora（本轮重新核对）

- [公开网站](https://weknora.weixin.qq.com/)本轮HTTP200，113529bytes，响应SHA256 `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe`。这里只做公开响应核对，未做登录后产品浏览器审查；网站本身没有可直接认定的版本号。
- [latest release API](https://api.github.com/repos/Tencent/WeKnora/releases/latest)本轮返回`v0.8.3`。tag经commits/v0.8.3解析为`3e22822c1d2397be730c458c7539d0eb8c113a24`。响应hash分别`163a964cc10c02fbca6dec0ad01f6fee50ffa0cc3f95957587c7df3b55fa9478`与`01cf54c5d9467c803927c9b6162afc9c0053172e7c87aebd9ad66121e67f2171`。
- 同时检查main当前HEAD=`eecfe4b3c8c34c94e9b559e5dd02187b4ae447cd`；本研究源码固定在release commit，**不能把release和main混为同一版本**。
- [KnowledgeBase.vue](https://github.com/Tencent/WeKnora/blob/3e22822c1d2397be730c458c7539d0eb8c113a24/frontend/src/views/knowledge/KnowledgeBase.vue)：`365–371`区分preview与编辑权限、`1498`从WikiBrowser打开source document preview、`1786`openManualEditor。响应SHA256 `c2e96f6cee2db8bc74d952f07bc584f9428026b3e5f797901a27bac760b1b59b`。适用“知识内容预览”和“编辑”职责分开、权限不因UI变化放宽；本轮不涉及库权限或Wiki操作，不照搬其editor。
- [documentPreviewMarkdown.ts](https://github.com/Tencent/WeKnora/blob/3e22822c1d2397be730c458c7539d0eb8c113a24/frontend/src/utils/documentPreviewMarkdown.ts)：`7`security导入、`12`isSafePreviewImageHref、`63–68`Markdown预处理和sanitize。响应SHA256 `041afb8656a7ac7cba587fe9a1b7b1a761d98668236d44f27d1877594c18da4a`。适用只读知识内容安全预览的说明；Mimir可执行原件通过opaque iframe sandbox隔离，不能以Markdown DOMPurify渲染替代HTML文件原件，也不能为了参照其安全预览擅自禁用原文件脚本/网络能力。

### 证据与相关规范

- `reference-evidence.json`保存实际请求URL、UTC时间、响应状态、完整响应SHA256/bytes、版本及原文件行号片段；同名`.txt`只保存摘录，文件头明确非完整响应，完整响应未留存，避免把摘录hash与完整响应hash混用。
- `source-hashes.json`保存本轮观察到的24项本地源码SHA256/bytes，未进行git操作，不等同于已证明commit精确快照；后续实现应由主会话冻结基线并核对。
- `.trellis/spec/project/design.md:8.4`Office分组工具和既有能力；`.trellis/spec/office/frontend/editors/pitfalls.md`HTML隐藏视图、缩放/计算尺寸与停止合同；`.trellis/spec/office/engine/conventions.md`vendor边界。

## Caveats / Not Found

- 本轮未登录WeKnora，不声称网站截图或交互与源码release逐像素一致。
- Office/Docs页面提供行为原则，不是HTML IDE的视觉规范；所有具体适配以Mimir当前真实组件与用户既有设计方向为准。
- 未升级GenOffice或WeKnora依赖，未修改本地vendor；外部引用仅为研究证据。
