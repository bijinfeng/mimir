# XLSX R2b 普通范围规则迁移：生产浏览器验收

2026-10-17 root，统一测试账号，5180正式预览；Web `/tmp/mimir-toolbar-r2b-cfb-web-20261017.log` exit0，1091输入起止不变。前置独立检查Server16文件454/454、Office8文件79/79通过，报告 `xlsx-range-rule-migration-r2b-check-20261017.md`。

## 固定样本

正式测试会重新生成ZIP时间戳，root在checker完成后复制 `/tmp/mimir-xlsx-range-rules-browser-baseline-20261017.xlsx`，SHA256 `947d3528ed03261b9177096feb34778a9bb10dbfeca66d2806d04038fa0c063e`。正常chooser上传验收库KY635Y，新文档 `OpHn2kSChZt6DvbB`。未改旧R2a样本，未删除。

## 跨表复制和实际规则执行

1280×800，数据!A1:B2（5/6/7/8，q:前缀CF与DV）→复制所选范围→切目标表→E5→粘贴。准备快照和切表无dirty/history；粘贴一次成功，保存到库并立即浏览器下载。

- 四个目标格实际CSS背景rgb(217,234,211)、font-weight700；不是只检查原生XML没有显示。
- `/tmp/mimir-xlsx-range-rules-browser-copy-20261017.xlsx`：仅目标sheet2.xml和workbook calcPr变。目标CF E5:F6、公式E5>0、dxfId0、stopIfTrue1、priority8；已有J10 priority7、源q:CF/DV和全部其余部件精确保留。DV E5:F6、whole/greaterThan0、promptTitle验证/请输入正整数完整保留。
- 双击E5实际显示迁移后的输入提示，输入-1并应用明确“输入不符合…文档未修改”，保存持续禁用。Escape恢复5；一次Undo即撤回整个copy，说明非法草稿没有新增历史。Undo/save/download整件等于baseline；Redo/save/download整件等于首次copy。

## 小屏同表重叠移动

420×500，工作表→选择工作表→数据，A1:B2→剪切→目标B2→粘贴。保存后源值成为B2=5/C2=6/B3=7/C3=8，A1/B1/A2清空；CF范围B2:C3/公式B2>0，DV范围B2:C3/原提示完整。相对copy工件只sheet1.xml变化；跨表copy结果、样式和其他部件保持精确。

moveUndo/save/download整件等于copy工件；moveRedo/save/download整件等于首次move。Escape关闭面板并回焦折叠“剪贴板”。reload后B2:C3数值持续、保存/Undo/Redo禁用，当前库保持move重做状态。

## 即时固定工件与SHA256

共同前缀 `/tmp/mimir-xlsx-range-rules-browser-`、后缀 `-20261017.xlsx`：

| 工件 | 整件SHA256 |
| --- | --- |
| baseline、copy-undo | 947d3528ed03261b9177096feb34778a9bb10dbfeca66d2806d04038fa0c063e |
| copy、copy-redo、move-undo | 4846ba220b3eb596b2933e3fe0d4ab7c49b86237329efa4a5c0288f33e4b71a9 |
| move、move-redo | cf45dd1b58a31c8b07db253b893634f45d0c3846690e1817f0905034a98e1ce9 |

截图位于 `/Users/admin/.codex/visualizations/2026/10/16/01a142b8-e543-7780-8181-44e1e0f94f51/`：`xlsx-range-rules-copy-final-1280-20261017.png`、`xlsx-range-rules-move-final-420-20261017.png`。420实际scrollWidth420，Inspector x100/y178/w320/h295.36，固定主操作可见；沿R2a滚动body/焦点合同。使用原始指定区域截图避免IAB缩略缩放。

本报告验证普通copy/move，未声称特殊粘贴、外部Excel/OS互操作或模型端到端。固定GenOffice及WeKnora缓存版本沿R2b实施报告，无新竞品HTTP调研声明。R2b浏览器通过后root已明确释放原生产接缝给R3，实现特殊粘贴仍未完成，总任务in_progress。


### 最终截图文件真实性复核

420截图补证：旧同名图实查为空白，已用captureBeyondViewport=false重取并实际查看正常420×500图。补图展示已保存move结果及剪贴板面板（未选范围、主动作禁用），不冒充再次执行move；原操作/原生/hash证据仍为上文工件。未修改或保存文档。
