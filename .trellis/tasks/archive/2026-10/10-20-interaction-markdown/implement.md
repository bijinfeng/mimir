# 执行计划

1. [x] 建档、读规范、确认授权和干净基线；打开真实产品编辑器。
2. [x] 完整来源盘点与WeKnora/固定GenOffice参考；冻结基线和实际组件gallery。
3. [x] 先捕捉基线全部代表场景，再按边界实施，保持业务语义。
4. [x] 独立检查；修复并完成相关行为回归。
5. [x] 同场景前后截图、交互Demo、全覆盖索引、浏览器几何与焦点验收。
6. [x] 跑pnpm check；更新有必要的唯一规范、限定提交、归档与日志。

质量命令：pnpm --filter @mimir/renderer test、pnpm --filter @mimir/office test、pnpm check；只补行为合同回归，不写镜像CSS测试。回滚仅本模块产品提交，不删除前后证据。共享树其他会话改动独立保留。
