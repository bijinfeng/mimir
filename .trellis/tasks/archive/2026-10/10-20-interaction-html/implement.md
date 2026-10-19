# 执行与验收
1. 完成真实基线缺陷确认、基线静态bundle与hash；可继续从冻结源码采集前图。
2. trellis-implement实施design定义的本地修复；遵循层级边界，相关HTML既有回归和新增查找回焦回归，lint/typecheck。
3. 根会话在宽/中/窄/短、浅深模式检查源码/预览/插入/Inspector/CSS/查找/规划/生成/演示；未验原生服务和vendor限制如实映射92项。
4. trellis-check独立审查并修复；gallery重建最终bundle。保存同场景同尺寸前后原图及离线HTML、可操作实际组件Demo、源/bundle/image SHA和验证记录。
5. 最终稳定树跑pnpm check，检查无其他会话变更混入；限定提交，不推送；记录commit、归档子任务与日志，更新父模块11但总任务仍未完成。
