# 文件格式图标 · revision2候选评审

2026-10-18；独立HTML规划内修订，无产品代码修改，任务保持planning。

## 本次交付

- [选型页](http://127.0.0.1:5186/review.html?view=icons)；[本地HTML](prototype/review.html)。
- 冻结：library-review-v1 revision2，SHA256 `ce43cbea265b09b3fd75d9db9d0f3d02723ef1559f2e9a09d742750285dc2f40`。源哈希见[version.json](prototype/version.json)。
- 原稿/A/B同格式、同尺寸、同背景比较；16类文件/资料，20/24/32px，浅深与390px。点击表头选候选，再点击“看列表/看卡片”查看实际应用。
- A：Phosphor duotone，轮廓统一、配色克制；B：Material Icon Theme，格式辨识更鲜明。**用户已回复“A”，选定Phosphor双色；第五模块最终实施范围仍待确认。**
- A浅深独立配色；B保留原色，仅深色Word提亮。Material缺少公众号/GitHub来源资产，明确复用Phosphor来源图标。名称后缀与来源文字仍保留，未知类别通用回退。
- 只改提案图标与评审工具；目录图标、业务、现有布局、行/卡高度保持。原58组299状态导航映射保留，不代表本轮全量GUI重测。

## 官方来源与许可

[研究及适用性](research/icon-refresh.md)记录固定commit、官方路径、MIT原文、尺寸/主题取舍和WeKnora增量检查。Phosphor `2b75f3ad12b420c9504ef05df8d2564a28f8500e`；Material `13025adc5ad10a5cc649528a2c1edec93069f1b9`。29份官方SVG原件本地保存、双哈希校验，两份MIT全文内嵌，离线审阅不依赖CDN。源/衍生配色/类型映射见[icon-assets.json](prototype/icon-assets.json)。

WeKnora沿用官网v0.8.3和固定main `2c0d8384398ca756ee414eef01b71caf91e2caa6`，不混称同版本。增量源码确认来源与文件格式分别判断及未知FILE回退；只借鉴语义，不照抄其图标。没有外部登录态GUI测试。

## 检查与实际抽验

- 独立lint/type/format/build/artifact均通过，无剩余原型阻断：[独立报告](verification/icon-review.md)、[构建报告](verification/icon-build.md)。单文件内嵌JS约502KB保留构建体积提示。
- 静态脚本和独立检查验证29 SVG、32个A/B映射、两个MIT全文及旧v1哈希不变。版本1保存在[versions/v1.html](prototype/versions/v1.html)，原哈希`a3f0f0053519810140a955d5d9fdbb727eded3a9661d2353b0282f473b21f281`，原源码见commit68a0972。
- 主会话浏览器实测16行，候选96个SVG，20/24/32实际盒子；浅深均渲染，390×844无页面横向溢出，窄屏24切32尺寸生效。桌面首屏可见Office/PDF/音视频。
- A/B实际列表各16图标，槽位22×22，原稿/A/B行高均56px；两套卡片均16项和22px图标。当前侧无候选SVG，13个原Material glyph加3个来源glyph保留。浏览器检查范围内无控制台error。
- [结构化抽验](verification/icons/browser-qa.json)、[浅色选型](verification/icons/gallery-light.png)、[深色选型](verification/icons/gallery-dark.png)、[390px](verification/icons/gallery-mobile.png)、[A卡片](verification/icons/cards-A.png)、[B卡片](verification/icons/cards-B.png)、[B列表](verification/icons/list-B.png)。
- 5个产品文件与本模块原基线哈希均相同：[基线复核](verification/icons/product-baseline-check.json)。无关并发改动不纳入本轮提交。

## 待用户决定

A已选定，HTML字节与哈希保持不变。确认第五模块最终实施范围后才实施；本轮不启动产品任务、不归档。20px格式字母细小是已披露取舍，不以图内文字或颜色作为唯一辨识。HTML仅演示本地虚构内容，不验证真实业务、原生文件动作或读屏，也不声称产品全仓门通过。
