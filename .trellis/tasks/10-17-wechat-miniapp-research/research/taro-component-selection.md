# Taro 与小程序组件库选型补充

核对日期：2026-10-18。用户指定 Taro 5.0；本记录是选型建议，尚未确认组件库，也未进入产品实施。原生小程序技术规划需要在框架版本确认后调整。

## 版本证据

本轮直接读取 npm registry 的版本、dist-tags 和 peerDependencies，并核对官方发布及文档。依赖声明不等于构建或真机兼容测试；本轮没有运行 Taro 工程。

| 包 | 核对结果 | 对 Mimir 的影响 |
| --- | --- | --- |
| [@tarojs/taro](https://registry.npmjs.org/@tarojs/taro) | latest 为 4.3.0，2026-09-29 发布；版本列表没有 5.x。[官方 release](https://github.com/NervJS/taro/releases/tag/v4.3.0) 同样为 4.3.0 | 不能承诺 Taro 5.0 可安装或兼容，需确认用户指的是哪个版本来源 |
| [@nutui/nutui-react-taro](https://registry.npmjs.org/@nutui/nutui-react-taro) | 最高非预发布版本 3.0.20，2026-05-20 发布；latest 指向 4.0.0-beta.9，beta 指向 4.0.0-beta.10；3.0.20 声明 React 16.8 / 17 / 18 | 首选候选，使用 React Taro 专用包并锁定稳定版本，不直接依赖 latest，也不据此承诺 React 19 或 Taro 5 兼容 |
| [@taroify/core](https://registry.npmjs.org/@taroify/core) | latest 1.0.6，2026-08-16 发布；声明 Taro >=3、React ^18.2.0 | 备选。基于 Vant 设计语言，基础组件适合内容型应用；宽泛的 Taro peer 范围不代表实测 Taro 5 |
| [taro-ui](https://registry.npmjs.org/taro-ui) | latest 3.4.2，2026-09-25 发布 | 仍有更新，不能以停止维护为由排除；本项目优先比较 NutUI React Taro 与 Taroify |

NutUI [官方 React Taro 3.x 文档](https://nutui.jd.com/taro/react/3x/) 和 [源码 README](https://github.com/jdf2e/nutui-react) 提供 Taro 小程序、TypeScript、主题和按需使用的资料。Taroify [官方文档](https://taroify.com/) / [源码](https://github.com/taroify/taroify) 提供另一套 React Taro 基础组件方案。

## 建议及适用边界

优先采用 NutUI React Taro 的稳定版作为基础交互库，Taroify 为备选。现阶段建议验证组合为 Taro 4.3.0、React 18、NutUI React Taro 3.0.20；这是待工程验证的候选，不能写成已通过验收的依赖组合。若用户确有 Taro 5 的分支或预发布来源，先按该来源核对兼容性。

库只负责 Dialog、Popup、表单、选择器、Toast、Loading 等通用交互。知识库列表、问答、引用、阅读与 Markdown 编辑区由 Mimir 自己组合，统一字号、间距、边框、颜色和触控尺寸，保持当前紧凑、简单、内容优先的方向。组件库的默认演示页不作为页面设计模板。暂不混用两套基础组件库。

## WeKnora 复核

按项目要求再次核对 [官网](https://weknora.weixin.qq.com/)（HTTP 200，页面描述 v0.8.3）和 [固定源码 app.json](https://github.com/Tencent/WeKnora/blob/3e22822c1d2397be730c458c7539d0eb8c113a24/miniprogram/app.json)（raw HTTP 200）。版本为 v0.8.3，commit `3e22822c1d2397be730c458c7539d0eb8c113a24`，原生小程序三个页面为知识库、问答、设置。

它可继续用于知识库范围与问答流程参考；其原生实现不能证明 Taro 或 React 组件库兼容性，也不作为 Mimir 紧凑视觉风格的主要依据。具体产品证据及适用边界见 [主调研](miniapp-product-research.md)。
