# PPTX 裁切操作栏与 Inspector 布局修正（2026-10-17）

主会话在 D 独立检查冻结后，从真实生产浏览器反馈两项具体缺陷，并明确授权本 checker 做局部修复。D 报告及其211项目标结果保留；本补记不冒充新构建浏览器通过。

## Findings (fixed)

### 1. 过高幻灯片把裁切主动作推到视口之外

- Evidence：root 实测文档 `Ij95zCDESupIbZgd` anisotropic37，1280×800，八把手可见，但“应用拖动裁切” bbox y909.64 /h24，编辑区结束于 y774。
- File：`packages/office/src/editors/pptx-picture-crop.css`。
- Issue：反馈栏 `position:absolute; top:calc(100% + 8px)` 放在整张幻灯片之后，额外120px margin只能增加滚动空间，不能保持动作可达。
- Fix：局部 overlay 改为单行 grid，SVG 与 feedback 共享完整幻灯片 grid area；feedback `align-self:end; position:sticky; top:auto; bottom:8px`，可在完整 grid area 内向上停靠于实际 stage scrollport。移除旧120px margin。SVG仍覆盖整张幻灯片，不变更画布坐标、手势、DOM/Escape、提交或 native writer。
- Regression：`PptxPictureCropCanvas.test.tsx` 加载实际 CSS，验证共享完整 grid area、sticky/bottom 与两种主动作的真实 DOM。原 CSS 下 computed display=block 先红；修复后通过。这是布局合同检查，happy-dom不能证明物理 bbox。
- Logs：红测 `/tmp/mimir-pptx-crop-dock-red-20261017.log`；最终目标见下。

### 2. Inspector 实际宽度不符合320px约定

- Evidence：root 实测420px宽窗口，Inspector x84→420，宽336px；源码 base 与 container 均声明340px。body内部滚动与footer可达，但宽度不合要求。
- File：`packages/office/src/editors/pptx-tools.css`。
- Fix：base/container 两处宽度均改320px，base显式 `box-sizing:border-box`。保留≤800px覆盖、max-width保留32px上下文、内部滚动和固定footer。
- Regression：`PptxEditor.workspace-views.test.tsx` 在真实形状/背景 Inspector 路径加载实际 CSS，验证 computed width320px、border-box以及原body/footer滚动合同。原 CSS 得到340px先红，日志 `/tmp/mimir-pptx-inspector-width-red-20261017.log`。

## Findings (not fixed)

- 无本片已确认而未修复的代码问题。
- root 仍需新构建后实测1280×800与420×500：裁切反馈栏 physical bbox在视口内、8把手/拖动/Enter/Escape和唯一primary可达，Inspector实际宽320px且内部滚动/footer未回退。未在本子任务运行浏览器或build，不能以computed-style测试宣称真实布局已验。
- 本片只改2份局部CSS和2个对应测试；没有公共Shell、native引擎、其他格式或服务端变化。无需因这些CSS改动重跑服务器或C1原生栅格，统一full/build由root处理。

## Verification

- Tests：PASS，最终 **3 files /69 tests**，13:03:54开始，26.09秒，exit0；`/tmp/mimir-pptx-crop-inspector-layout-freeze-20261017.log`。包括Canvas、实际Editor extended tools、workspace views。
- TypeCheck：PASS，Office `tsc --noEmit` exit0；`/tmp/mimir-pptx-crop-inspector-layout-types-20261017.log`。
- Lint：PASS，两份测试最终0诊断exit0；`/tmp/mimir-pptx-crop-inspector-layout-lint-20261017.log`。首次发现新增 node:path resolve import与既有promise回调同名warning，已将import显式alias resolvePath，未抑制规则。
- Format：PASS，2 CSS+2测试 `oxfmt --check`；styles `pnpm lint:styles` PASS；目标 `git diff --check` PASS。
- 没有新的 Antd 组件生产修改；D 最终三文件Antd结果保持。未运行full/build/生产browser/Desktop/模型，未暂存、提交、归档、上传或删除文件。

源码已冻结，待root生产浏览器复验。
