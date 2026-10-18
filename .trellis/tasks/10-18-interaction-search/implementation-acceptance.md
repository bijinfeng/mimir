# 搜索模块 v1 产品实施验收

2026-10-18，用户“实施吧”批准。冻结 HTML SHA256：`0e8a90da0c37c509f8fcda8027c9f01bac5f58607c45db83f10d41f8fb950535`，原型未改。产品实施已落地并限定提交；任务保持 `in_progress`，全仓质量门未通过，不归档。

## 实施结果

- 搜索面板按批准的中性选中、薄边框、两行片段、路径、完整信息展开和固定底部落实；浅深、390px窄屏、844×390低高度实际验证。
- 最近使用完整12ID笔记子集，读取/真空/部分失败/401与重试分别反馈；保留原403/404过滤。检索按确认后的组合输入，保持trim两字符门槛、500字和最多6处独立chunk，不改排序/后端。
- 宿主控制所有动作的关闭。新建、命中、最近、返回、AI经过既有guard；取消保留搜索输入。新建同步单飞，成功聚焦正文，失败保留面板；响应丢失提示无法确认结果，不承诺幂等重试。AI只沿原scope预填，不发送。
- 文档命令绑定发起ID，重命名/移动/查找补等待、失败草稿、IME和焦点交接。元数据成功后刷新失败保留活编辑器与正文，提供仅GET恢复。保留移动8秒撤销与原片段定位。
- 检查修复快捷键Alt边界、命令弹窗CtrlK包含与重试焦点。未保存确认取消后的实际动画最终回到原AI动作按钮（有效焦点），输入仍保留；搜索重试立即回到输入，异步成功不抢后来移动的焦点。

## 16组覆盖对应

152项仍是盘点覆盖项，不是152个独立页面，也不声明逐项真实GUI执行。

| 组 | 产品验证依据 |
|---|---|
| entry | Palette/App快捷键与取消/交接DOM回归；真实桌面/窄屏入口及关闭 |
| recents | 最近12、部分/401、读取恢复DOM回归；实际最近列表 |
| input | IME/229/repeat、500上限DOM回归；实际输入/清空 |
| query | 查询隔离、缓存失败、键鼠等待、重试焦点回归；实际阻断搜索并恢复 |
| hits | 独立chunk身份/完整信息回归；实际五处命中、展开与正文定位 |
| selection | 稳定key增删、箭头/Enter与鼠标统一等待回归；实际键盘与44px关闭按钮 |
| new-note | 可控promise单飞/guard/失败回归；实际创建、正文聚焦与断网反馈 |
| capture | 宿主受控关闭/交接回归；收集后续完整业务归下一模块 |
| context | note/file/只读/读取失败DOM能力矩阵；实际笔记上下文 |
| rename | 等待/错误/身份/刷新只读恢复回归；实际重命名 |
| move | 目录读取/错误/草稿回归；实际移动与8秒内撤销 |
| find | 两字符、IME/Enter回归；实际单字错误、有效查找、CtrlK不叠窗 |
| open-hit | guard与citation字段回归；实际正文命中高亮 |
| ai | 取消不写draft/确认后预填回归；实际新对话scope与问题，无自动发送 |
| guard | App可控promise取消/失败/单飞回归；实际自动保存确认、保存失败留在文档与取消保留输入 |
| layout | 实际浅深桌面、390×844、844×390；低高度内部滚动与底部可达 |

真实浏览器记录与截图见 [product-browser-qa.json](verification/product-browser-qa.json)。独立全范围检查见 [independent-check.md](verification/independent-check.md)。原生Electron、OS输入法、触屏软键盘、读屏与200%缩放未验证，不能用DOM回归替代。

## 质量门

| 检查 | 结果 |
|---|---|
| 本轮14个Renderer文件lint/format，AntD lint | 通过 |
| `pnpm lint:styles` | 通过 |
| `pnpm -r typecheck` | 全仓通过；最终快捷键修正后Renderer再次通过 |
| 定向回归 | 5文件33项通过；最后IME微调后DocModal9项再次通过 |
| 完整Renderer | 57文件490项通过，`--maxWorkers=2`；首次全仓高负载下nav-collapse超时，结束其他进程后确认通过，未提高超时 |
| `pnpm check`（最终树） | 失败：其他小程序原型7个lint错误，流水线在lint终止 |
| `pnpm format:check`（最终树） | 失败：仅其他工作`.impeccable/config.json` |
| `pnpm test` | 失败：Office加密测试2项settle断言失败，Office为228文件/2705项通过；递归bail导致server未完成与根node测试未执行。Renderer随后独立完整通过，不把此称为全仓测试通过 |

Office失败：`DocxEditor.encryption.test.tsx` 的 external standard / external agile 两个实际worker测试，`settle`未达到完成条件。仅记录实测失败，不推断是否由负载导致、不修改外模块或超时。

最终门输出保存在 `verification/logs/`。现行合同同步至项目 `product.md` 与文档层 `conventions.md`，不改其他会话的主题tokens、设计规范、Office fixtures、小程序、技能配置等工作。

## 后续门

外部小程序lint、Impeccable配置格式与Office加密测试问题由其任务处理后，重跑`pnpm check`；通过后才能完成归档。其他模块仍需先交HTML并获用户认可。
