# R2a 实施边界

最小缺口在服务端范围原件执行器：目前普通复制/移动只搬 raw cell，R1 对相交 merge/hyperlink 全拒绝。本片新增私有 `xlsx-range-structures.ts` 规划冻结原生结构，并只在该规划验证后向 R1 开放完整包含的合并/链接；保留 CF/DV/批注/表格/筛选/未知扩展守卫。

预计修改：新 helper（命名空间、范围、关系及补丁）；`xlsx-range-features.ts` 窄许可；`xlsx-agent-range.ts` 普通无筛选复制接线；`xlsx-manual-ops.ts` 移动接线；native/current-handle 测试。保留公开 DSL、Office UI、排序算法及 vendor。不改 `copy_format` 格式刷语义：它是固定源证明仅基础样式的格式刷，不是 Univer 特殊粘贴“格式”；当前公开 copy_range 无特殊粘贴参数。本片填充/筛选复制仍拒绝相交结构。

仅支持完全包含的标准合并与链接：复制保源，移动用冻结快照，目标完整覆盖、部分相交拒绝；跨表外链分配关系身份，内部链接仅支持工作表限定的固定 A1 位置，原位置不平移。保留合法未引用关系，避免误删其他引用。未知属性/扩展、重复/重叠结构、关系歧义拒绝。校验和写入均不发网络。

固定 GenOffice/Univer 与 WeKnora 证据复用 `xlsx-range-structure-migration-plan-20261017.md` 的已下载同日缓存，不声称重新联网。先运行新 native 红例，再实现并跑受影响回归与 types/static；真实浏览器交 root。
