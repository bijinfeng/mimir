---
version: 1
slug: "src-components-marketing-officialsite-tsx"
primary_target: "src/components/marketing/OfficialSite.tsx"
related_targets: []
---

# 官网 `/` surface brief

Mode: Persuade. 面向首次认识 Mimir 的个人知识工作者，目标是理解知识收集与引用核对价值并进入工作区。只使用明确标注的示例资料；官网不读取个人知识，不调用模型。用户已在方案页选 question，执行路径 code。

## Direction contract

THESIS: 用一个具体问题同时讲清答案和出处，再让完整工作区证明日常使用方式；避免用同尺寸功能卡片代替产品证明。

OWN-WORLD: 继承 apps/web/DESIGN.md 的白灰工作面、细边、工作台绿、系统中文字体、现有品牌标识；在正常室内阅读情境下保持平静清晰，浅深色跟随既有外观。

STORY: 访客看到已保存资料如何回答自己的问题，点击引用核对原文，理解数据归属与两种使用方式，最后进入现有工作区。

FIRST VIEWPORT: 1440px 下约 1200px 主列；顶栏品牌与产品/部署/GitHub 导航。上部左列为两行大标题、短说明和开始使用/页内说明，右列为具体问题、回答与引用。下部出现真实工作台。390px 依次显示标题、行动、问题演示，保持引用可用。

FORM: 已选“问题带路”，候选序位 4，seed 6119dc63。草图留档于 .trellis/tasks/10-20-mimir-official-site/drafts/question.html。代表性交互为“从答案回原文”：点击引用展开/定位示例段落，收起后恢复焦点；短暂高亮承载动效，reduced-motion 直接显示。

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

实施门禁：需用户在最终规划摘要后明确批准。验收含 1440/390px 浅深外观、真实组件对比归档、受保护路由与桌面入口保持、全仓质量门和生产构建。普通品牌延伸保留既有 DESIGN.md，仅补官网特有策略。
