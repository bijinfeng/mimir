# 图标规划证据 · 2026-10-21

## 竞品检查

- WeKnora 官网：https://weknora.weixin.qq.com/，2026-10-21 实际请求，HTML 描述标明 v0.8.3，引用 `/docs/_home/brand/weknora-original.png` 与 `/docs/favicon.ico`。
- 公开源码：https://github.com/Tencent/WeKnora ，实查 HEAD `e0c28bef3562de7d2d78d6c1fa480a045468a40f`（2026-10-20T14:06:21Z），最新 release v0.8.3（2026-10-14T07:53:24Z）。
- 具体代码：https://github.com/Tencent/WeKnora/blob/e0c28bef3562de7d2d78d6c1fa480a045468a40f/website-docs/homepage/app/brand-logo.tsx ，BrandLogo 渲染 945×650 的完整原稿，并由外围裁去空白。源码树另有 `frontend/public/favicon.ico`、`docs/images/logo.png` 和 `misc/intro-video/assets/logo-{dark,light}.png`。
- 适用性：品牌完整图与小尺寸图标应分开准备，跨明暗场景提供一致图形。该组件只证明官网原稿的展示方式，不能据此断言它在各平台的小尺寸效果；不复制其图形或知识库页面。
- Obsidian（视觉领域主参考）：https://obsidian.md/ 实际 HTML 中同一主标识用于 header、下载入口及应用图标展示；含 `obsidian-logo-gradient.svg`，应用底板展示使用约 20% 圆角。release API 显示 v1.14.4（2026-10-05T17:03:28Z）。
- 适用性：学习独立轮廓在图标与页面标记间延续的做法，不复制紫色水晶图形或渐变。图标轮廓优先，底板、光影和裁切由平台适配。

## 原创方向推导

机制：使用者把分散资料收进自己的知识库，再通过检索与引用重新使用。使用场景：同一人从桌面、浏览器、NAS 启动器和微信进入自己的资料。

常见但不足的解法：外框加字母、脑形、AI 火花和普通书本轮廓。新图形需要在无文字、无色彩和 16px 环境中成立。

按领域共鸣排序的七种候选系统：

1. 资料夹的索引切口：通过负形让资料归位；蓝黑与纸白，紧凑直角及单个切口。熟悉易懂，但常见。
2. 手装书的折页：两页在脊线汇合；深蓝与浅蓝，斜切外形。
3. 光学取景的收束：从视野中提取焦点；海蓝与白，单孔实形。可能误读为相机。
4. 石印藏书章：个人所有权；朱红与白，印章负形。小尺寸偏密。
5. 图书馆书挡：分开的内容靠拢；群青与白，成对结构。易像通用文件夹。
6. 层叠页签：快速回到保存位置；琥珀与墨色，错位叠片。单色层次有限。
7. 连续折带：两次内折组成紧凑的双峰轮廓，隐约联系 mimir 的 m；海蓝与冰白，宽笔画和开放的中部负形。表达汇拢且能独立成为应用标识；需防止退化成普通字母 M。

Impeccable direction seed `c1aad718` 指向第 7 项。两次正常网络环境调用均为 degraded，未返回挑战方案或 quality-bar boards；本轮只采用自主设计及实际尺寸预览，不称为完整风格库比较。

## 跨端技术证据

- 主形：`packages/renderer/src/components/BrandMark.tsx`。
- 网页及桌面 favicon：`apps/{web,desktop}/public/favicon.svg`。
- 桌面生成器：`apps/desktop/scripts/make-icons.ts`，读取 web favicon 的单 path 后生成 PNG/ICO/ICNS。目前填充色与留白在生成器中维护。
- fnOS：`apps/fnos/app/ui/images/icon_{64,256}.png`；打包入口 `scripts/build-fnos.mjs`。
- 小程序：`apps/miniapp/src/pages/login/index.tsx` 与 `src/components/ui.tsx` 现用文字 m，且这些文件本轮开始时已有未提交变更。
- 回归：`packages/renderer/src/theme/design.test.ts` 守住两个 favicon 与 BrandMark 的路径一致性。实施时保留并扩展必要的资源同步验证，避免用弱化测试迁就新来源。

## 限制

规划预览不是系统安装、fnOS 安装或微信后台上传的实测证据；这些环境的最终行为在资源接入后另行记录。不声称商标检索或名称排他性验证。

## 主题绿修订 · 用户审阅后

用户确认折带图形并要求以绿色贴合产品主题。`packages/renderer/src/theme/tokens.ts` 的浅深 colorPrimary 均为 `#00834d`，强调文字深色值为 `#6bdaa5`；`apps/miniapp/src/app.scss` 的 NutUI 主色同为 `#00834d`。第二轮以此为配色事实来源，反白改用纯白，旧海蓝稿保留；形状路径与第一轮逐字校验相同。

## 渡鸦方向 · 用户选择

用户在主题绿稿后提出动物标识并明确选择“渡鸦”。新稿保持现行绿、纯白及深色强调绿，以原创单色 SVG 侧身鸟形表达；翅膀与眼部为负形，完整楔形尾部替代分叉尾。前两稿仍归档。本轮为设计探索及模拟预览，没有增加竞品能力或实机验证结论。

## 第四轮：紧凑渡鸦

用户在语雀对比后要求“再来一版”。新增 `proposals/round-4-raven/`，无眼、较平头顶、厚喙、饱满胸背、短楔尾及缩短翼部负形，配色仍为 #00834d / #FFFFFF。加入第三/四轮同色同尺寸对照；旧稿保留。此轮是本地矢量修订，不新增外部研究，沿用前文语雀与 WeKnora 的已记录证据。未修改产品资源，仍在 planning，具体新轮廓未获批准。

## 第五轮：用户要求更圆润

用户否决第四轮，原话“还是不行，棱角太多了，我想要更圆润一点”。新建 `proposals/round-5-raven/`，重画圆头、弧形喙、无折角颈部、圆尾及圆角翼部负形，保持绿色/白色。第四轮保留，新增同色同尺寸对比。更圆润会弱化渡鸦的尖喙与楔尾特征，需由用户审阅形态取舍。沿用已有语雀及 WeKnora 证据，不新增外部研究。仅规划资源，任务未开始实施。

## 第六轮：从具象圆润鸟形转为抽象符号

用户原话“圆润是有了，但是有点丑啊，可以抽象一点的”。新增 `proposals/round-6-abstract-raven/`，命名“弧翼”：以两块圆润弧面和一道开放留白概括喙与翼部方向，去除完整头腹、尾巴及封闭翼孔。配色不变，第五轮保留。物种直观辨识减弱，具体符号待审阅。沿用现有语雀及 WeKnora 研究证据，本轮为原创本地矢量探索，不新增外部研究。产品资源未修改，任务仍为 planning。

## 第七轮：恢复鸟形识别度

用户反馈第六轮“过度抽象了”。新增 `proposals/round-7-raven/`，恢复清楚的圆头、厚喙和小眼点，保留开放弧形翼线，弱化肚子与独立尾部。色彩不变，第六轮保留，新增第六/七轮同尺寸对比。第七轮轮廓待审阅，沿用已有语雀与 WeKnora 研究证据，不新增外部研究。未接入产品，仍在 planning。

## 第七轮定稿确认

用户明确确认：“这个版本非常不错，就用这个版本”。记录为具体第七轮几何及配色已批准，不再迭代造型。最终实施范围与验收摘要归档于 `final-review.md`，PRD/设计/实施计划同步收敛；产品资源尚未替换。
