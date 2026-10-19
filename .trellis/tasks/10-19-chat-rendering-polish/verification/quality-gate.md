# 最终质量门

2026-10-19；产品代码冻结后最终完整检查及两端构建exit 0。日志保留在logs/。

| 检查 | 结果 |
| --- | --- |
| pnpm check | PASS：lint、样式守卫、format、全仓typecheck、全套测试及Node脚本检查 |
| 全部测试 | 4867 passed，2个既有Storage测试skipped；没有新增跳过 |
| Chat | 8 files / 88 passed，含真实SDK/HTTP/SSE、队列/保稿/附件/Agent与展示回归 |
| Renderer | 75 files / 581 passed |
| Office | 230 files / 2709 passed |
| Server | 正常1365 + local10 + fnOS4 + SQLite Node2，均passed |
| Desktop | 7 files / 50 passed |
| 其余 | provider31、storage13、miniapp8、根Node脚本6 passed |
| pnpm --filter @mimir/web build | PASS |
| pnpm --filter @mimir/desktop build | PASS |
| 独立复核 | PASS，含单行工具栏增量与Server测试预算调整 |
| fixture消息契约 | 28组合/56条真实messageSchema.parse；原生部件通过实际SDK类型检查 |
| 实际浏览器与离线HTML | PASS，具体边界见coverage.md；23对截图尺寸成对一致，全部图片链接存在 |

## 发现与处理

1. 初轮pnpm check：Server附件测试一条串行5次真实解析加17MiB ZIP压缩在默认5秒预算下超时，Office当轮2709通过。将这一条矩阵的显式预算设为与相邻Office/PDF矩阵一致的30秒；全部断言和cleanup保留，未改全局超时。单文件29项通过；最终完整Server全部通过。
2. 第二轮：PDF原文替换用例在内部3秒settle中没有等到宿主应用与保存解锁；此前全套和此后单文件15项均通过。独立静态复核无法证明业务根因，因此未改Office代码、未延长该等待、未降低断言。停止额外构建/检查并发后再完整执行pnpm check，最终全仓exit0，Office2709全部通过。此证据不能证明已根除PDF测试的偶发性。
3. 浏览器确认已存笔记hover颜色被外层动作选择器覆盖，已修特异性。浅色实际hover/focus维持链接绿且30×30几何不变。
4. 用户实际反馈窄栏工具换行，已按容器宽度改成单行，实际399px及fixture390/320/280px无换行或页面横向溢出；完整名称仍保留在title/aria。
5. fixture Supplemental初版flex固有宽溢出，已在同源before/after均修容器width/min-width并重捕相关场景；不把夹具问题误归为产品运行层问题。

lint仍有仓库既有warnings，构建仍提示PDF静态/动态import同时存在；exit均为0。本轮未降低规则或增加lint排除。
