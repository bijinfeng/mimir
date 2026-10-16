# Mimir 语雀风格静态稿索引

日期：2026-10-17。用户已认可知识库、文档、设置三张浅色宽屏稿并要求继续。本轮补齐深色与窄屏关键状态；当前仍为 planning，最终实施摘要见 ../final-review.md。

## 代表页面

| 页面 | 浅色（已认可方向） | 深色（本轮补充） |
| --- | --- | --- |
| 知识库 | [01-knowledge-base.png](01-knowledge-base.png) | [04-knowledge-base-dark.png](04-knowledge-base-dark.png) |
| 文档 | [02-document.png](02-document.png) | [05-document-dark.png](05-document-dark.png) |
| 设置 | [03-settings.png](03-settings.png) | [06-settings-dark.png](06-settings-dark.png) |

六张宽屏图片的原始导出尺寸均为2560×2048。深色沿用已确认布局，采用中性深灰与绿色操作，是Mimir适配设计。

## 390px关键状态

| 状态 | 图片 | 评审重点 |
| --- | --- | --- |
| 知识库 | [07-mobile-knowledge-base.png](07-mobile-knowledge-base.png) | 52px紧凑导航、单列卡片、现有新建动作收纳 |
| 文档 | [08-mobile-document.png](08-mobile-document.png) | 正文换行、两行工具区、命令标签、无右侧大纲 |
| 设置 | [09-mobile-settings.png](09-mobile-settings.png) | 分区Select、标签在输入框上方、模型行堆叠、保存 / 取消 |
| 展开导航 | [10-mobile-navigation.png](10-mobile-navigation.png) | 约280px覆盖层、X关闭、遮罩、底部账号 |
| 汇总预览 | [mobile-overview.png](mobile-overview.png) | 由以上四张最终图片缩放拼接，仅用于概览 |

窄屏稿采用390×844 CSS像素固定画板，输出以2倍像素保留为780×1688 PNG。生成工具原生导出固定为2560×2048，因此将画板固定在左上，画板外用灰色标记；交付图只裁去画板外区域，没有把宽屏画面压缩成窄屏。完整源图保存在 exports/mobile/。初次宽屏拉伸的错误稿与中间稿保存在 iterations/，不作为交付依据。

## 生成来源

生成工具：Stitch，项目ID：9385498917258451388。JSON文件保存提示与工具返回的资源信息。

| 最终产物 | 资源 / 源记录 |
| --- | --- |
| 浅色知识库 | screens/5d5baa3c987f4e2fa294fa8ff4cb5fd4；sidebar-correction.stitch.json |
| 浅色文档 | screens/fa256415f9e24b53b91393e2f76e9370；refinement.stitch.json |
| 浅色设置 | screens/067805bcb46446b59afd9ac33a05dbc5；refinement.stitch.json |
| 深色知识库 | screens/cc8fc36c94b343f7b8df846d8b7759dd；dark.stitch.json |
| 深色文档 | screens/a4fba0063b8e4334ba78184d7f0ac551；dark.stitch.json |
| 深色设置 | screens/bc2667403453420daa32464acc7172fc；dark.stitch.json |
| 窄屏知识库 | screens/19319c606af043de8851290ebb7c019f；mobile-final.stitch.json |
| 窄屏文档 | screens/04e7e8648b5447d8aa06b7adf4189613；mobile-final.stitch.json |
| 窄屏设置 | screens/9f32119a2dd948668c9ce0ff0fca5f6b；mobile-final.stitch.json |
| 窄屏导航 | screens/b84dc57974c3408eab646a2cd42929a8；mobile-final.stitch.json |

完整资源名前缀均为 projects/9385498917258451388/。早期01/02/03-*.stitch.json、mobile.stitch.json与mobile-correction.stitch.json保留过程溯源，最终图片以本索引为准。

## 视觉检查与边界

新增七张最终稿已逐张打开检查：深色页面的文字、表面、卡片 / 表单与右边界可见；窄屏正文换行、输入框 / 卡片右边界、侧栏底部与关闭按钮完整。已校正移动画板宽度、补回导航展开控制与编辑器命令标签。页内滚动及工具条局部横向滚动仍需在真实实现中验证。

基础颜色、状态、焦点与响应式正式计划以 ../research/appearance-responsive-contract.md 和 ../visual-plan.md 为准；生成工具附带的自动色阶 / 圆角档位不直接成为Mimir token契约，图标与精确状态使用现有共享组件统一。

这些是静态规划产物，没有实现或验证上传、保存、模型调用、键盘操作、滚动、焦点恢复或真实响应式。主题算法处理后的实际CSS与控件对比度留待实施检查，不能以图片或计划纯色计算替代。

## 参考与演示内容

- 来源为语雀公开知识库 / 阅读页截图与测量，研究报告见 ../research/yuque-design-study.md。语雀个人工作台 / 实际编辑器 / 设置 / 深色没有登录态实测；本稿为Mimir适配，不宣称精确复制这些页面。
- 语雀采样品牌绿为#00b96b；按钮计划#00834d为白字对比度校准的Mimir建议值。浅色元信息从初稿#737373校准为#6b6b6b。
- 本任务已核查WeKnora官网与v0.8.3固定源码，适用性与版本证据已落盘；不使用其Markdown编辑器作为Office工具栏主模型。
- 保留单用户产品事实、笔记直接编辑、现有文件视图偏好与Office命令能力，不加入团队协作或分享功能。
- 库名、文件名、日期、计数与供应商均为演示内容；api.example.com、示例模型不是本机配置，密钥仅画遮罩。
