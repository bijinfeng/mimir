# 图标修订稿 revision2 · 限定构建检查

2026-10-18。仅独立原型及本记录，无产品组件、API、业务、任务状态变更；实施子代理没有提交、冻结或推送。

入口：`http://127.0.0.1:5186/review.html?view=icons`。A是默认推荐候选，尚未获得用户选型或具体版本认可。

## 变更

- `original-icons.tsx`原样拆出现行图标（只增加评审尺寸参数）；before持续使用原实现。
- `file-icons.tsx`集中映射16类型；after可切A/B/原稿。列表/卡片沿用22px原槽位及既有行/卡高度，目录图标与业务未改。
- `icon-gallery.tsx/css`为独立评审视图：原稿/A/B横向比较，首六项Word/Excel/PPT/PDF/音频/视频；桌面逐项同框20/24/32px，窄屏尺寸切换；主题切换、来源与许可、列表卡片直达LIB-029。
- 29份官方SVG按固定Git blob校验、原件不修改；两套MIT原件随资源保存，全文通过raw import内嵌review.html。路径、commit、SHA256、16项映射和衍生色说明在`icon-assets.json`。B微信/GitHub明确混用Phosphor来源徽标；B table/xml/document作为Excel/代码/文本及未知映射，不虚构官方专属资产。
- A通过CSS使用浅深独立前景，官方双色透明度不变。B仅dark Word scoped path fill从#01579b调整至#64b5f6，其余内置配色保留，无整图滤镜。
- `versions/v1.html`原稿哈希仍为`a3f0f0053519810140a955d5d9fdbb727eded3a9661d2353b0282f473b21f281`，脚本每次检查不变性。

## 已执行

全部退出0：

1. `tsc -p prototype/tsconfig.json --noEmit`：独立原型类型检查。
2. `oxlint`：main、fixtures、file-icons、original-icons、icon-gallery、build及check-artifact。
3. `oxfmt --config prototype/format.json --ignore-path /dev/null --check`：上述变更源文件、icon-gallery.css及env.d.ts，共8文件。
4. `build.mjs`：1957模块，单文件review.html生成。JS约502KB，构建有500KB chunk建议；该原型刻意单文件内嵌素材以便离线审阅，不因此伪称零warning。
5. `check-artifact.mjs`：原58组/299状态链接仍完整；新增29份SVG SHA256/Git blob、无script/foreignObject/image/外链引用、16项映射、两个MIT全文打包、默认候选、三尺寸与v1不变性校验。
6. `git diff --check`限定prototype及本记录：通过。

构建HTML SHA256：`ce43cbea265b09b3fd75d9db9d0f3d02723ef1559f2e9a09d742750285dc2f40`。

## 验证边界

本子代理未操作浏览器；首屏可见性、浅深/390px实际SVG加载与切换、槽位几何由主会话集中抽验，独立checker另行记录。20px字母细小是取舍，保留文件名/后缀/来源文字；未宣称所有图标达到非文本3:1。299条链接继续只表示静态导航覆盖，不冒充299项GUI测试。冻结和最终用户审批由主会话完成，本版无产品实施授权。
