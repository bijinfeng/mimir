# DOCX 个人信息清理：工具栏与可撤销意图

2026-10-17 root。P native 实现已交独立复查，本片不能以 native 清理替代可见入口。沿已批准全工具范围，无新增产品目标。

## 证据与边界

固定GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 的实际 `packages/docx-engine/src/patch.ts:1743–1960`：removePersonalInfo 在最终ZIP清理已知元数据。Mimir `docx.ts` 已从私有原件读取真实settings flag，最终native清理并受保护权限限制。现有Editor导出与保存已经共用该finalizer；缺口是显式开关、原生当前状态与可撤销意图。

WeKnora官网/公开源复用本日固定缓存：v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24`，官网SHA256 `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe`、definitions `3aae03dc09c5c5261e71df3e9ee4fba9ad457cf632c817e4ea7ae1312f5bcae0`。不宣称重新联网。这里只借鉴真实能力门控；Office设置语义来自GenOffice，视觉沿项目320px Inspector。

## 最小实施合同

- 审阅的保护/隐私语义位置提供具名入口，避免新增同级Ribbon组；320px Inspector，单列明确开关/当前状态，内部滚动和固定单一“应用设置”。Esc/关闭回live入口，窄屏先收折叠菜单。
- 当前值须来自session私有原件的只读状态和当前history意图；不从可变public parsed决定安全策略。可以给session增加只读boolean获取，任何public字段不得授权finalizer。原件未设置/false/true拼写零操作必须保持精确。
- 意图用有界PM根属性、同一history事务存boolean或null，密码无关。沿现有design extension等既有root-attribute模式，物化save/export时统一映射到`removePersonalInfo`，不扩大公开Agent DSL。PM投影/保护检查须精确排除自有附加属性且不弱化正文检查。若需要独立attribute extension则最小注册，禁止vendor改动。
- 只切草稿不dirty；显式应用一次history/dirty/版本；相同值no-op。Undo/Redo连同原生settings最终保存正确；关闭面板不丢已应用意图，换文档清理草稿/晚读。导出当前副本应用意图但不清dirty/基线。
- 文案准确说明清理作者、修订/批注署名和公司等已知文件元数据；不承诺删除正文、customXml、自定义属性或二进制中的个人信息。关闭开关不恢复已清理姓名，Undo只恢复设置意图/当前会话基线语义，不能声称磁盘清理可逆。
- 受保护/修改密码/强制修订准确禁用并显示原因，不能靠privacy入口绕过P finalizer。失败/过期不发布、不改变history。
- 代码所有权：新PrivacyControls及其CSS/tests、DocxEditor最小入口/extension/save-options物化、docx.ts最小只读状态、必要root attribute helper。不得动P scanner算法、T recorder、E0 crypto、server。

## 必须验证

真实Editor 从原生false/true读值，显式开关-保存-撤销保存-重做保存，每次解ZIP检查settings/已知metadata/非目标entry；至少false→true实际清理、true→false保留署名、相同值no-op、保护拒绝、当前副本导出、换源/晚读/正文变化取消、单history。root最新构建做1280与420×500实际截图/焦点/内部滚动/固定主动作验收。正式独立check后才算本片通过。
