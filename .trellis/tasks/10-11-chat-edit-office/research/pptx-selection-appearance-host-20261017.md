# PPTX 批量图片填充宿主接缝（2026-10-17）

固定GenOffice480548fd55f1be3593ee0d8e316a734751d58309：packages/pptx-ops/src/ops/element-ops.ts的setImageFill及pptx-engine/src/index.ts原生实现支持直接group成员和media去重；此为手动not-ai-callable，不开放通用apply_ops白名单。WeKnora官网与v0.8.3/3e22822c1d2397be730c458c7539d0eb8c113a24 definitions.go沿本片已核HTTP200，证据/tmp/mimir-group-flip-weknora-{site.html,definitions.go}，只适用KB/Agent能力门控，不提供Office填充控件或原生图像写回模型。

新增shared selection arm要求明确targets，每项elementId/group，1–200，不接受任意URL或原生XML；texture仅八固定资产与既有hash，current逐对象取得当前media。宿主先严格解析全部目标与别名去重，再单txn写入；shape-fill能力判断与UI共用，拒绝混入line/connector，避免写后模型无fill造成假mixed。字节preflight和signal双端复验后发布；响应仅一条compact manual_fill记录，不将PNG/Uint8Array按每目标重复写入消息。

Editor以当前published version、active页、selectionBinding及panelWriteAbort调用manual_fill，取消/切目标/关闭/切文档/并发版本迟到不得覆盖画布；组件级真实host挂载5/5和独立server4/4覆盖上述闭环、别名重复、各自不同media与compact响应。整体检查与浏览器证据见pptx-selection-fill-check-20261017.md及横向连续日志最新复杂批量外观段。
