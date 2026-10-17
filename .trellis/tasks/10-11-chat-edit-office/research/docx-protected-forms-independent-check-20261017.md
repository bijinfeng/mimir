# DOCX P1-F 原生复选框：独立检查

2026-10-17。依据批准的 `docx-protection-p1-next-20261017.md` §5、`implement.md` 和实施交接，直接复核并局部自修；无嵌套代理，未改 vendor、其他格式、服务端、公开工具目录或图片 crop 并行文件。代码已冻结并释放本片共享文件。

## Findings (fixed)

1. **行末 checkbox 的鼠标边界** — `packages/office/src/editors/docx-protection.ts`。
   - 原 `coordsAtPos(to)` 默认向后取坐标；恰在换行边界时可取下一行起点，使实际 glyph 点击不能命中。
   - 明确 `from,+1` 与 `to,-1`，两边都向 glyph 内部解析。真实 Editor 点击回归模拟该边界，修复前无法切换，修复后通过。日志 `/tmp/mimir-forms-hit-boundary-red-20261017.log`。
2. **绑定数据/类型冲突的 SDT 被当作普通 checkbox** — `packages/office/src/docx-protected-forms.ts`。
   - 原 mapper 只判断 checkbox 和 lock；`w:dataBinding` 及同一个 sdtPr 中的 `w:text` 仍可切换。当前 native 保存仅写 checked/glyph，不同步自定义 XML 数据，不能宣称这种控件填写成功。
   - 对 SDT 原生 Word 属性仅接受当前可证明的 checkbox 辅助属性，数据绑定、冲突类型和未知 Word 行为保持只读；外部 namespace 的 opaque 扩展继续原样保留。两项拒写回归在修复前红、修复后绿。日志 `/tmp/mimir-forms-sdt-binding-red-20261017.log`。
3. **原件初始已勾选的 supplementary glyph 缺少直接回归** — `packages/office/src/docx-protected-forms.test.ts`。
   - 补初始 🟢（2 个 UTF-16 单元）到 ☐（1 个）的切换，三个相邻 SDT 含重复及缺失 ID，后接 legacy 控件；独立定位、保存重开及三次 Undo 回整件原 bytes 均通过。

## 实际路径核对

- `writable` 仍是正文权限，forms-only 始终 false；PM 插件按完整规范化状态差量验证，不按 marks、glyph、TRACK_IGNORE/history meta 授权。正文、属性、非法 marks、普通方框、混合法/非法事务和附加 SaveOptions 均拒绝。
- 原生 occurrence 来自私有原件与真实 schema nodeSize；相邻 legacy 和重复/缺失 SDT ID 不合并身份。锁定、禁用、区域/节级权限、嵌套/复杂结构、SDT/altChunk 后不确定块映射均只读。公开 content/originalBytes 修改不能扩大原生权限。
- 保存从私有原件重放局部 checked/glyph 补丁；未知 shell、settings、非目标 ZIP 内容保留。真正 no-op/复原状态返回原始整件 bytes；两次保存、重开、保存后的 PM Undo/Redo及并发保存快照的 dirty 基线回归通过。
- Inspector 采用原 320px 容器，内部滚动 body、固定唯一 primary；真实按钮提供键盘 Space 的原生按钮语义，glyph 点击保持正文 readonly。这里只核对代码及真实 Editor 组件测试；实际浏览器 Space/坐标/420×500 不能由 happy-dom 冒充。
- 源切换安全代码路径：Inspector 绑定 session 对象、savedFormsState 绑定 session 对象，保存完成须仍是同一 agentHandle；useSource 取消过期 load，useParsed 以原 bytes 身份隔离解析。此次未新增真实浏览器 A→B→A 验收，仍由 root 调度。

## Findings (not fixed)

无剩余已确认的本片生产缺陷。下列是验收/范围边界，不是测试已通过声明：

- root 继续实际 1280/420×500、Space、glyph、Escape、保存下载与独立原生脚本、A→B→A 浏览器验收，以及统一全 Office suite/Web build。
- `.trellis/spec/office/engine/conventions.md` 需要 root 同步 P1-F 现行合同：正文/forms能力分离、私有 occurrence/完整 PM 比较、checked/glyph 窄补丁、绑定/复杂控件拒写、forms保存指纹与 PM 历史。该文件由 root 维护，本 checker 不并写。
- 密码核验/管理、forced tracked changes、复杂容器或数据绑定完整填写不属于本片；未新增 Agent checkbox tool。
- 未执行真实模型/provider/Desktop 验收；Desktop 由用户自行验收。

## Verification

- Tests：**7 files / 166 tests PASS**, exit 0。`/tmp/mimir-forms-independent-final-tests-20261017.log`。覆盖 forms、实际 DocxEditor protection、P0、C1/C2、Agent 和 advanced controls。
- TypeCheck：Office `tsc --noEmit` **PASS**, exit 0。`/tmp/mimir-forms-independent-final-types-20261017.log`。
- Lint：本片10个 TS/TSX 文件 oxlint **PASS**, exit 0，无诊断。`/tmp/mimir-forms-independent-final-lint-20261017.log`。
- Format：本片11文件 oxfmt --check **PASS**。`/tmp/mimir-forms-independent-final-format-20261017.log`。
- 样式 guard、局部 diff --check **PASS**。`/tmp/mimir-forms-independent-final-styles-20261017.log`、`/tmp/mimir-forms-independent-final-diff-20261017.log`。
- ProtectionControls antd lint **0 issues**。`/tmp/mimir-forms-independent-final-antd-20261017.json`。
- 全仓 `pnpm check` 未重复运行：root 已登记 skills 范围现有 480 lint 问题；重型全套与构建由 root 统一。

固定 GenOffice 和 WeKnora 的版本/具体源码与适用性沿批准研究 §8，本片独立检查没有宣称新的竞品调研结果。
