# Taro 与小程序组件库选型补充

核对及决策日期：2026-10-18。用户在 Taro 5.0 消息核验后确认采用 Taro 4.3.0 + React 18 + NutUI React Taro 4.0.0-beta.10，技术规划已从原生方案调整为 Taro React。任务仍为 planning，尚未进入产品实施；依赖组合尚未经过工程构建或真机验证。

## 版本证据

本轮直接读取 npm registry 的版本、dist-tags 和 peerDependencies，并核对官方发布及文档。依赖声明不等于构建或真机兼容测试；本轮没有运行 Taro 工程。

| 包 | 核对结果 | 对 Mimir 的影响 |
| --- | --- | --- |
| [@tarojs/taro](https://registry.npmjs.org/@tarojs/taro) | latest 为 4.3.0，2026-09-29 发布；版本列表没有 5.x。[官方 release](https://github.com/NervJS/taro/releases/tag/v4.3.0) 同样为 4.3.0 | 用户已确认采用 4.3.0，核心包、CLI 与平台 / 框架插件统一锁定版本 |
| [@nutui/nutui-react-taro](https://registry.npmjs.org/@nutui/nutui-react-taro) | 最高非预发布版本 3.0.20；本轮再次核对最新 4.0 为 4.0.0-beta.10，2026-10-16T12:26:10.540Z 发布；latest 仍指向 beta.9，beta 指向 beta.10；beta.10 声明 React 16.8 / 17 / 18 | 按用户选择锁定 4.0.0-beta.10，不直接依赖 latest，也不据此承诺 React 19 或 Taro 5 兼容 |
| [@taroify/core](https://registry.npmjs.org/@taroify/core) | latest 1.0.6，2026-08-16 发布；声明 Taro >=3、React ^18.2.0 | 备选。基于 Vant 设计语言，基础组件适合内容型应用；宽泛的 Taro peer 范围不代表实测 Taro 5 |
| [taro-ui](https://registry.npmjs.org/taro-ui) | latest 3.4.2，2026-09-25 发布 | 仍有更新，不能以停止维护为由排除；本项目优先比较 NutUI React Taro 与 Taroify |

NutUI [官方 React Taro 3.x 文档](https://nutui.jd.com/taro/react/3x/) 和 [源码 README](https://github.com/jdf2e/nutui-react) 提供 Taro 小程序、TypeScript、主题和按需使用的资料。Taroify [官方文档](https://taroify.com/) / [源码](https://github.com/taroify/taroify) 提供另一套 React Taro 基础组件方案。

## 建议及适用边界

现行确认组合为 Taro 4.3.0 + React 18 + `@nutui/nutui-react-taro@4.0.0-beta.10`，取代前轮 NutUI 3.0.20 建议及待核实的 Taro 5.0 意向。React 18 的具体补丁版本在基础构建验证后锁定。本轮未安装依赖、构建工程或执行真机验证，不能写成已通过验收的组合。

库只负责 Dialog、Popup、表单、选择器、Toast、Loading 等通用交互。知识库列表、问答、引用、阅读与 Markdown 编辑区由 Mimir 自己组合，统一字号、间距、边框、颜色和触控尺寸，保持当前紧凑、简单、内容优先的方向。组件库的默认演示页不作为页面设计模板。暂不混用两套基础组件库。

## 用户提供的 Taro 5.0 消息核验

2026-10-18 用户提供 [掘金文章](https://juejin.cn/post/7515475567283044388)，页面 HTTP 200，可读取正文。标题为《Taro 5.0前瞻：基于HarmonyOS 5的元服务编译架构设计原理解析》，页面标注 2025-06-15，作者“黑马波哥”，个人资料标注“讲师 @传智播客(黑马程序员)”。这是一篇第三方前瞻文章，页面没有 Taro 官方 5.0 发布公告、官方实现 commit 或可安装 5.0 包的链接；不能将其当作官方路线承诺或已发布版本。

具体核对：

- 文章 §9 列出编译时间 15s → 4.2s、包体积 2.1MB → 680KB、运行时 3800 → 9200 ops/s，但正文没有基准仓库、测量方法、设备和版本依据，不能用于 Mimir 的性能预估或验收。
- 文章 §3 / §8 展示 `ReactToArkTransformer` 与 `harmony.metaService` 等示例，未链接对应官方实现。它们不能直接作为本项目构建配置或 API 契约。
- 真正的官方鸿蒙文章 [《Taro on Harmony C-API 版本正式开源》](https://github.com/NervJS/taro-docs/blob/d911a8ec2bb2e36be69ff80d0602e4539f74f6e6/blog/2025-05-16-taro-harmony-c-api.md)（2025-05-16，固定文档仓库 commit `d911a8ec2bb2e36be69ff80d0602e4539f74f6e6`）元信息明确为 `tags: [v4, harmony]`，描述 React 运行时、CSSOM / TaroElement 与 C++ 渲染管线，使用 `@tarojs/plugin-platform-harmony-cpp` 和 `taro build --type harmony_cpp`。这是已公布的鸿蒙平台适配，不能据此推导 Taro 5.0 已发布；HarmonyOS 5 的系统版本也不等于 Taro 主版本。
- 再次读取 [核心包 npm 元数据](https://registry.npmjs.org/@tarojs/taro) 与 [CLI npm 元数据](https://registry.npmjs.org/@tarojs/cli)：两者 `latest` 均为 4.3.0，`beta` 均为 4.3.1-beta.3，`alpha` 均为 4.3.1-alpha.4，完整 versions 中均无 `5.*`。GitHub [正式发布 v4.3.0](https://github.com/NervJS/taro/releases/tag/v4.3.0) 日期为 2026-09-29，`main/package.json` 读取时同样为 4.3.0。
- 官方文档仓库完整树响应 `truncated: false`，博客目录未发现 5.0 发布文档。官网及文档站本轮直连超时；使用上述 GitHub 固定源码作为官方文章证据，不能声称官网全文已成功检索。搜索引擎结果受无命中 / 验证限制，不作为否定消息真实性的依据。

结论：截至本轮核对，官方发布渠道没有可安装的 Taro 5.x 正式版或预发布版；该掘金文章不足以证实官方 5.0 版本或路线。核验后建议的 Taro 4.3.0 + React 18 + NutUI React Taro 4.0.0-beta.10 已获用户确认。鸿蒙专用能力不进入首版微信小程序范围。

## WeKnora 复核

按项目要求再次核对 [官网](https://weknora.weixin.qq.com/)（HTTP 200，页面描述 v0.8.3）和 [固定源码 app.json](https://github.com/Tencent/WeKnora/blob/3e22822c1d2397be730c458c7539d0eb8c113a24/miniprogram/app.json)（raw HTTP 200）。版本为 v0.8.3，commit `3e22822c1d2397be730c458c7539d0eb8c113a24`，原生小程序三个页面为知识库、问答、设置。

它可继续用于知识库范围与问答流程参考；其原生实现不能证明 Taro 或 React 组件库兼容性，也不作为 Mimir 紧凑视觉风格的主要依据。具体产品证据及适用边界见 [主调研](miniapp-product-research.md)。
