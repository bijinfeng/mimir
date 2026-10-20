# 更新交互的实际组件归档

日期：2026-10-20。此目录的 HTML 来自 React 实际挂载的 `TitleBar`、`AboutPage`、`UpdatePage` 与生产 `MimirProvider`，保存 DOM 和生成的 CSS。PNG 为 Chrome 155 对这些 HTML 的渲染，使用 CDP 明确设置 CSS 视口与 1× 像素比例；不是设计手绘稿，也不是原生 Electron 安装/通知的证明。

## 原有组件的前后对比

- `before-{light,dark}-{920,390}.{html,png}`：修改之前的 TitleBar 与 AboutPage。
- `after-{light,dark}-{920,390}.{html,png}`：修改之后的同一组组件；版本均为 0.1.0、使用方式均为本地使用，高度均为 600px。新增入口的状态夹具为已下载 0.2.0，旧组件没有该功能。
- 宽度 390 / 920，浅深外观都保留；已有其他任务的比较稿未覆盖。

## 新增窗口

没有旧版。`new-{state}-{light,dark}-{600,360}.{html,png}` 全部是新增组件的状态夹具，版本与说明由显式模拟桥提供，并非实际已发布或下载的更新。600px 页面高 680px；360px 页面高 480px。

| state | 覆盖 |
| --- | --- |
| idle / checking / current / unpublished | 初始、检查中、最新、暂无发布 |
| available | 发现更新，自动下载关闭 |
| downloading / unknown | 已知总量的真实比例、未知总量只显示已下载量 |
| preparing / downloaded / restarting | 准备、明确重启安装、准备重启 |
| blocked / cloud | 未保存返回文档、旧云端显式确认已保存 |
| recovery | 工作区关闭失败，仅提供恢复说明，无失效的文档/安装入口 |
| error | 下载/校验失败与重新下载 |
| manual / disabled | macOS 手动下载、开发态 |
| long | 长版本与长说明的折行和局部滚动 |

`contact-{light,dark}-{600,360}.png` 是上述 17 个状态的总览；单张原图同目录保留。`layout-metrics.json` 记录 76 个页面的真实视口、滚动宽度、主区和 footer 几何：无横向溢出；新增页面主区填满视口，所有底部操作均在视口内。

## 验证与边界

- 浏览了四张状态总览及主要单张，确认浅深外观、长说明、窄窗口按钮折行、底部操作常驻。
- 组件行为测试覆盖：默认聚焦标题、Esc 关闭、同帧重复请求、失败恢复、初始 IPC 迟到、状态读取重试、关闭重开、只读入口、未知总量、100% 仍不可安装、macOS 手动、保存阻塞、旧云端确认、宿主失败恢复、偏好主进程回写、说明安全文本展示。
- 对实际变更源码执行一次 `impeccable detect --json`，结果 `[]`，见 `impeccable-detect.json`。
- 实现的普通文本说明不渲染 Release HTML，不编造更新亮点。
- 运行 `pnpm --filter @mimir/desktop test src/renderer`（32 个测试，不含一次性归档脚本）、桌面 typecheck、所改源码 oxlint。
- 键盘/读屏的组件语义可以由测试核实；真实拖动、原生菜单、通知、窗口焦点和安装升级由主会话补充实际 Electron 证据。此目录不能证明跨平台安装升级通过。

## 生成方式

`capture-components.test.tsx.txt` 是归档时的一次性 Vitest 源，复制到 `apps/desktop/src/renderer/components/visual-capture.test.tsx` 后运行对应测试，生成 after 与新增状态 HTML，再删除临时测试，避免普通测试改写历史证据。before 是改动前同一组件挂载方式的快照；最初缺少 `#root` 的归档宿主标记已校正以还原生产高度链，组件 DOM/CSS 未重画。

`capture-chrome.mjs.txt` 保存同批 Chrome CDP 捕获脚本；使用隔离临时 profile，不使用个人浏览器会话。首轮 CLI 视口夹紧和归档容器问题的无效截图已经替换；最终图采用实际 `#root` 与准确视口。contact sheet 由各原图等比缩小拼接。
