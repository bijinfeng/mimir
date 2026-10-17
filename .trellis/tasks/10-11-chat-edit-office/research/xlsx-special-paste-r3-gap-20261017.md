# 固定 GenOffice 特殊粘贴剩余参数

2026-10-17 root，只记录确定差距与后续顺序，尚未实施或据此宣称全部工具齐全。

固定GenOffice480548fd55f1be3593ee0d8e316a734751d58309 `apps/sheets/src/renderer/ribbon-actions.ts:317–340` 有普通copy/cut/paste及五种真实Univer命令：value、formula、format、col-width、besides-border。官方Univer0.25.1源码缓存见R2原计划，format实际包括merge。Mimir `xlsx-clipboard.ts`当前普通内部copy/move和valuesOnly；copy_format是scalar格式刷，不能代称完整特殊粘贴。

后续R3在R2b冻结后补明确粘贴模式：仅值（含公式缓存）、仅公式、格式（含merge及相应CF/DV hook实际语义）、列宽、除边框外；对内部/外部剪贴板能力、cut特殊mode、平铺和目标矩形须逐项与真实上游commands/hook核对。先出精确设计，再派implementation；不要在缺来源时假定空格跳过或转置属于固定支持。必要本地strict schema/host执行器与Compact Ribbon可发现菜单，模式选择纯准备，一次粘贴一次history；不能每格回调伪造原子。原生无关部件保真、2000格/保护/过期/abort/DV守卫、1280/420/focus/单份按钮文案照旧。

WeKnora沿同日v0.8.3/3e22822c1d2397be730c458c7539d0eb8c113a24缓存及R2计划SHA。它无Office特殊粘贴writer，KB门控可借鉴，主语义仍Office/GenOffice，未重新联网。
