# Research: 页面视觉审计（设置页重点）

- Query: 哪些已截图页面的视觉层级、密度和空状态最影响商业产品的观感，如何沿现有 token 与设计契约修正？
- Scope: internal
- Date: 2026-10-10

## Findings

本轮以任务 `audit/07-settings-models.jpg`、`audit/14-settings-retrieval.jpg` 至 `audit/21-settings-760.jpg` 为主，辅看 `audit/02-library.jpg`、`audit/03-document.jpg`、`audit/05-chat-empty.jpg`、`audit/08-settings-appearance.jpg`。以下截图是本任务改动前的基线；已发生的文案修改以当前代码为准。截图表明页面并非配色错误，主要观感问题是**重复的浅边框容器、空内容占据主视觉、主操作缺少权重**。建议优先处理前三项。

### P1 · 模型空状态把未完成感放在首屏中心

`audit/07-settings-models.jpg` 中，供应商面板大片留白、居中的 antd 空托盘图标与最底部的虚线“添加供应商”组成首屏主视觉；下方四条尚不可用的任务分配反而比添加入口更占空间。当前代码仍然用 `Empty.PRESENTED_IMAGE_SIMPLE`，然后以 `Button type="dashed" block` 放置添加动作（`packages/renderer/src/components/settings/ProviderList.tsx:55-93`）；任务分配无条件渲染四行（`ModelsSection.tsx:104-130`）。这让完成配置的第一步看起来像一个次要附加动作。

建议在无供应商时把供应商区改成紧凑、明确的单个空状态：一个短标题/结果句和 `primary` 添加按钮，按钮紧贴说明；有供应商后再用现有列表形态。保留任务分配的四个角色，但在空态下用一条简洁前置说明或收起不可选表单，直到添加供应商后再展开。复查 760px 下按钮与角色控件排列。无需新增颜色或图标系统；保留设计契约要求的“供应商在上、任务分配在下”和级联选择器（`.trellis/spec/project/design.md` §8.11.1）。

### P1 · 存储分区把同一选择呈现了两遍

`audit/16-settings-storage.jpg` 的“本地磁盘 / S3”先以单选框呈现，再紧接两条同名状态块，之后另有“当前生效”键值面板和“验证”面板。当前文案虽已简化，`StorageSection.tsx:68-135` 仍渲染单选组、每个后端的状态块，并在技术详情里再次列“当前存储”；`StorageSection.tsx:177-215` 的测试连接独立成一张面板。重复行线和浅灰标题条把一个主要决策拆成多张类似的表，视觉上显得臃肿。

建议把每个后端的选项、名称、状态和必要原因合成同一条可选项，当前选择只显示一次；把“测试连接”紧贴当前选择或配置区。**切换不迁移文件**的风险句仍贴近切换动作，不能折进技术详情。实现上可沿用 antd `Radio`、现有 `StatusBadge` 和 token 色对，不需要另造大卡片样式。技术路径和目录继续留在 `TechnicalDetails`。这符合 PRD R6 的“当前状态 → 可执行动作 → 必要后果”，且不改变存储契约。

### P1 · 统计全零时，一整年的灰格压过真正的信息

`audit/18-settings-stats.jpg` 中四项汇总均为 0，热力图占据约半个可见内容区，仍画满全年浅灰小格；下面“按角色”只有空记录。结果像未加载完成的报表，用户需要读小字才知道暂无用量。当前 `StatsSection.tsx:114-132` 始终渲染 `UsageHeatmap`，其无数据配色映射仍画空格（`UsageHeatmap.tsx:136-147`）；每格大小固定为 11px，图例还占一行（`UsageHeatmap.tsx:80-83`、`StatsSection.style.ts:116-161`）。

建议在 `totals.calls === 0` 且没有任何未知用量时，热力图面板呈现紧凑空状态和明确下一步（例如指向模型配置），不渲染整年空格。若有调用但供应商未返回 token，用现有斜线“未知用量”语义，**不能按零处理**；真实有记录时保留目前热力图与图例。这样不触碰统计口径，并让有数据的图继续符合 `.trellis/spec/project/design.md` §8.12 的形态。

### P2 · 账号与外观的单项内容被拉成整列宽的“表格面板”

`audit/20-settings-account.jpg`、`audit/21-settings-760.jpg` 与 `audit/08-settings-appearance.jpg` 中，账号只包含头像、名称、邮箱，外观只有一个三选一控件，却都占满 760px 内容列并使用与复杂配置相同的标题条/边框。账号输入结束后右侧是较大的无功能空白，登出按钮又孤立地落在面板之外（`AccountSection.tsx:55-85`，`AccountSection.style.ts:12-16,62-98`）；外观的说明还单独成第二个盒子。共用 `Panel` 统一形态很有价值，但这两页不需要把少量字段表现成一张宽表（`settings.style.ts:102-143`）。

建议保留设置页的 760px 内容列和分区导航，只给这种单组、少字段分区增加较紧凑的内部排版：头像与姓名/邮箱形成明确两列；把登出归到账号操作区并用间距或分隔表达风险；外观把模式选择与必要说明合成一个面板。可先在现有 `Panel` 内做，不必修改全局 `Panel` 宽度。需同时看 760px 和深色，避免为了缩窄而让字段拥挤。

### 跨页视觉约束

`settings.style.ts:31-39` 将设置内容限宽 760px，`:102-143` 的面板统一用 `token.colorBgContainer`、`token.colorBorderSecondary` 与 `token.tintList`，`:159-205` 的键值行以一条浅分隔线扫读。这些基础结构和 `.trellis/spec/project/design.md` §0、§3、§8 的中性、内容优先原则一致。应改变**信息排列和空状态密度**，不要增加装饰色、阴影或每区一套独立组件。九个分区、`?section=`、窄宽下拉仍由 `routes/_app.settings.tsx:63-73,169-208` 保持。

## Files Found

- `.trellis/tasks/10-10-ui-ux-audit/audit/07-settings-models.jpg`：模型无供应商时的首屏。
- `.trellis/tasks/10-10-ui-ux-audit/audit/14-settings-retrieval.jpg`—`21-settings-760.jpg`：检索、订阅、存储、插件、统计、数据、账号及窄宽设置页截图。
- `packages/renderer/src/components/settings/ProviderList.tsx`、`ModelsSection.tsx`：模型列表空态与任务分配。
- `packages/renderer/src/components/settings/StorageSection.tsx`：存储选择、状态和连接测试。
- `packages/renderer/src/components/settings/StatsSection.tsx`、`UsageHeatmap.tsx`、`StatsSection.style.ts`：统计空态、热力图和图例。
- `packages/renderer/src/components/settings/AccountSection.tsx`、`AccountSection.style.ts`、`settings.style.ts`：账号与设置共用版式。
- `packages/renderer/src/routes/_app.settings.tsx`：九分区导航、URL 与窄屏下拉。

## Related Specs

- `.trellis/spec/project/design.md` §0、§3、§5.4、§8.11.1、§8.12、§8.14、§8.15：内容优先、token、列宽、模型/统计/账号形态及设置文案。
- `.trellis/spec/renderer/frontend/index.md` 与 `conventions.md`：Web/桌面共用 renderer、antd 与主题规则。
- `.trellis/tasks/10-10-ui-ux-audit/prd.md` R5/R6 和 `design.md`：文案、九分区、技术详情与必要后果。

## External References

无。本轮依据项目实测截图、代码与现行设计规范。

## Caveats / Not Found

- 这些截图拍于文案改动之前；尤其订阅、插件、数据页已被并行修改。本轮没有把已由文案精简解决的问题重复列为视觉缺陷。
- 未实测最新代码在深色、760px 以下、桌面壳或有模型/有用量/有多供应商状态的实际画面；建议实施后做同条件复拍。这里只对**截图所示状态**下结论。
- 文档阅读助手的完整“快速上手指南”按用户最新要求保留，本轮不建议删改。
