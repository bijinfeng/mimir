# 文档模块实施与验收记录

2026-10-18。用户明确批准“开始实施吧，每个打磨点都要还原到位，不要有遗漏和偏差”。实施依据 document-review-v1，HTML SHA256 `2a3aafb4277c37bd06e38ae94ecec085e0f31a062b88e25a000042e5cbdb220d` 未改变。

## 交付与覆盖

- 78组422状态集合核对无遗漏/重复/额外ID；303项 implemented、104项 preserved、15项 host-boundary。这是源码映射分类，不是422次GUI通过。
- 共享文档宿主实现阅读层级、标题确认/取消与GET-only读取恢复、标签/目录失败恢复、版本化移动撤销、实际DOM大纲/引用反馈、内部链接守卫、临时AI结果隔离、原网页入口、媒体错误降级、按容器宽度覆盖的文档助手、命令与未保存保护。
- 48px头部、正文/标题角色和局部焦点样式沿冻结稿；390px弹窗实测 left62/top24/width318，18px内边距、12px圆角、15px标题。最后去除默认8px上下margin使实际top符合24px。
- Office仅增加Markdown内容底部插槽4行，双链、AI结果、标题与正文位于同一滚动容器；内部编辑工具保留真实Office组件。
- 独立复核修复10类缺口，见[实施复核](verification/implementation-review.md)。[逐项映射](verification/implementation-coverage.json)与[真实浏览器实测](verification/implementation-browser-qa.md)分开记录。
- [本地HTML证据页](verification/implementation-browser/review.html)保留同内容批准稿/实装截图与窄屏/失败恢复证据；原批准HTML持续保存在prototype中。

## 检查结果

| 检查 | 结果 |
|---|---|
| Renderer完整回归 | 72文件569项通过，22:12:24开始，33.27秒；`/tmp/mimir-document-independent-renderer-final.log` |
| 独立最终局部回归 | 3文件18项通过；最后margin-block CSS调整后命令/守卫2文件19项通过 |
| 本任务限定lint/format | 通过，含最终DocumentDialog.style.ts |
| 全仓样式守卫 | 通过 |
| Office类型检查 | 通过 |
| Office完整回归 | 229文件2707项中2706通过，PdfEditor.content一项settle超时/false；原测试单独重跑15/15通过，不当作完整套件通过 |
| Renderer类型检查 | 范围外`agent-media.check.test.ts:12 TS2550 Promise.withResolvers`与ES2023 lib不匹配 |
| pnpm -r typecheck | 范围外miniapp editor对void调用catch（157/158/160行）阻塞 |
| pnpm check | 已尝试两次，范围外miniapp/其他并发代码lint错误阻塞；未通过 |
| 全仓format | 范围外`.impeccable/config.json`、server miniapp-auth和SQLite迁移元数据4文件未通过 |
| 冻结版本、状态集合、diff空白 | 通过 |

完整门日志保存在本地verification/*.log（忽略的大日志不强制加入提交），核心结果在此与独立报告持久记录。未更改并发小程序、服务端、全局主题或技能迁移文件，也未降低校验规则。

## 实测与边界

真实浏览器执行同内容桌面、390px、低高度、浅深主题、标题保存后读取失败与只重读恢复、标签失败、子菜单两层Escape、助手覆盖/隐藏/回焦、只读原网页链接及媒体失败卡片。临时Fetch夹具提供相同正文和故障；没有真实后端写入，结束已清除拦截和尺寸覆盖，恢复浅色与真实“mimir 产品说明”。

OS IME、读屏、Electron关闭、原生播放/拖动/全屏、下载落盘完成、各Office内部工具及真实写入尚未执行，保留宿主验证边界；不声称完全像素等同或所有枚举状态GUI通过。原型外置模拟条/Office工具示意与产品真实字数条/工具区属于既定宿主差异。

本轮实施与限定验证已交付；因完整`pnpm check`未通过，任务仍为`in_progress / implemented_verified_global_gate_pending`，不归档，不推送。按AGENTS提交节奏只提交本任务代码/测试/规范/记录，实施commit `675e6aefeac9c1edf6849200047e7d943000412b` 已登记于task.json和父台账。

## 大纲定向返修与补验

用户指出 DOC-009.idle 右侧选中条目未还原到位。本轮比对发现原产品 border0/block/30px、通用背景与颜色以及标题继承行高偏离冻结稿。恢复 inline-flex/1px透明边框/32px实高、36px步长、171px内容宽及固定局部浅深色；focus外圈2px+offset2px，hover/focus无盒尺寸变化。笔记固定侧列保留，读取分支沿批准稿sticky。

实测点击第三节后曾因IO仅含变化项而被第四项抢占；改为完整标题集/实际阅读锚点与rAF滚动联动。文末scrollTop719被夹紧、第三节距滚动根顶部36.77px时，保持明确点击第三节；向上滚240px后scrollTop479正确回第二节。再回顶部，首项正确选中。深色普通#a3a9b3、选中#91c7a7/背景#282c33/细线#4b9c71；浅色对应冻结稿。悬停与键盘Tab焦点的条目矩形均171×32，未发生位移。

独立trellis-check复核并修复联动，3文件11项相关回归通过；lint/format/样式守卫/diff通过，Renderer tsc仍仅范围外TS2550。此前569项全套结果是返修前记录，未当作返修后全套重跑。新[大纲同尺寸截图](verification/implementation-browser/outline-comparison.png)、[联动截图](verification/implementation-browser/outline-third-active.png)和最终metrics已保存；冻结稿未修改。
