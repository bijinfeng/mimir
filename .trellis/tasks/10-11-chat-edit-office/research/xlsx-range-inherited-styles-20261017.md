# XLSX 原生复制/移动继承样式补齐（2026-10-17）

## 范围与依据

承接 `xlsx-structured-clipboard-plan-20261017.md` 的宿主样式缺口，不改 Office/shared/vendor，不接管另一 agent 的浏览器剪贴板控制器；无上传删除、提交、暂存、归档或全仓构建。

固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` / Univer 0.25.1 真实内部剪贴板会合成来源默认/行/列/单元格样式，不能仅复制显式 `<c>` 后让目标行列决定外观。具体源码位置与缓存版本已在上述方案记录。WeKnora v0.8.3 / `3e22822c1d2397be730c458c7539d0eb8c113a24` 的官网与公开源码证据同见方案；其 sandbox 能力门控适用于真实能力提示，不定义 XLSX 原生样式或公式迁移，未用作 Office 工具栏主模型。

## 实现

- 新增 server 内窄 helper `xlsx-range-styles.ts`，从原件一次读取行列样式，按显式 cell `s` → `customFormat=1/true` 的 row `s` → column `style` → `0` 解析 cellXfs 引用。显式 `s=0` 优先，缺失/false 的 row customFormat 不生效。复用现有支持单双引号的属性读取，不重新序列化样式、主题或工作表。
- `copy_range` / `fill_range` 共用的原始格复制循环以及 `move_range` 在克隆后物化来源 `s`。无 `<c>` 空洞也生成带样式的空格，包括明确 `s=0`，避免吸收目标行列底色。原单元格正文、类型、缓存、共享字符串与 inline rich runs 原样保留；公式仍沿原复制平移/移动引用迁移路径。来源 XML 先冻结，重叠移动不读取已覆盖目标。
- 原格式刷 styleAt 抽取后复用同一规则，修复忽略 row customFormat 的行为。格式刷既有去除目标富文本覆盖、保留内容语义不变。
- `convert_to_values` 不进入新样式路径。保护、2000 格、表格/规则/合并/批注、共享/数组/溢出公式等原有守卫保持。

## 文件

生产：`apps/server/src/services/xlsx-range-styles.ts`、`xlsx-agent-range.ts`、`xlsx-manual-ops.ts`。

验证：新 `apps/server/src/test/xlsx-range-styles.test.ts`；更新 `xlsx-agent-range.test.ts`、`xlsx-manual-ops.test.ts` 中目标默认格现在显式 `s=0` 的原生断言。

## 验证

- 新 7 条真实 host / ZIP / 独立 XML DOM 回归：同表复制、跨表复制、同表移动、跨表移动、重叠移动；来源显式零、row customFormat=1/true/0/省略、column 继承、原不存在的行和格、显式空格、目标相反的行列样式；格式刷同规则；复制后跨表移动的第二次保存与重开。
- 每格核对目标原生 `s`，保留源 inline `<rPr>` 的主题色/tint、共享字符串索引、公式及缓存；非目标 row/cols/扩展保留，未 touched ZIP entry 逐字节相等。第二次重开分别比较 styles/sharedStrings/theme/customXml 原字节，版本只增一次。
- 三文件 **34/34**：xlsx-range-styles、xlsx-agent-range、xlsx-manual-ops。另 host+fill 两文件 **44/44**；总 5 文件 **78/78**，不是全仓完成声明。
- Server tsc、6 目标文件 oxlint（零 warning/error）/oxfmt、目标 `git diff --check` 均通过。

## 边界与交接

本片修原生目标保真，未改变 Office `xlsx.ts` 对来源行列继承样式的画布解析。若新 HTML 系统导出只取浏览器 cell.format，其来源继承样式仍可能是未表达子集；已通知 root 结合另一 agent 的实现处理，不能以浏览器来源预览代替原件 ZIP 证据。完整 HTML 导入、跨文档资源重映射、规则/合并等迁移及浏览器验收均由统一剪贴板后续工作负责。

全仓 check 已有的技能脚本 lint 阻断未复跑；无模型和 Desktop 验收声明。
