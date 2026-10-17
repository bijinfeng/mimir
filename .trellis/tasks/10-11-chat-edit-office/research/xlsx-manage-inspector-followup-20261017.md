# XLSX 对象管理 Inspector 真实短窗问题与修正计划

2026-10-17 root。用户明确补工具同时注意样式交互；当前localhost5180 production Webbuild验收发现实际失败，批准独立formal implement→check→root browser补片。

## 证据

文档PK4FilufzKIRoO1G，原生6形状fixture。1280当前渐变旋转/自定义路径/noFill可见，edit_shape填蓝保存只改drawing-preview.xml与既有gateway calcPr workbook.xml。420×500管理面板截图xlsx-manage-before-420.png：header随body滚动被裁切，应用形状属性在scroll body视口外，选中形状仍紧接展示空的已有结构化表整套表单。原生渐变打开palette将白色标为当前色，实际无此solid填充。

## 实施边界

- 仅XlsxObjectControls及所属局部CSS/独立管理helper/tests，必要XlsxEditor具名最小接缝；不改server/DV/pivot/native writer/vendor。
- 管理区按对象/结构化表任务清晰选择，只展示当前任务表单；无结构化表用紧凑空态，不摆无效行号等字段。保留图表/形状/图片/表格既有编辑删除等真实能力。
- 与已有Inspector一致：320px，header固定，tabs/当前选择可达，body内部滚动，当前表单唯一固定primary（图表编辑/形状应用/图片替换/表格操作按当前模式），删除等次动作准确且不会误提交。保留忙态/失效/确认/Escape分层/回焦。
- 当前native gradient/theme/noFill/unsupported不能fallback白色冒称当前值。明确当前填充类别/当前色，未操作不写fill；palette只对真实solid命中selected。
- 源/页/目标/版本变化取消旧草稿，已有freeze/host/action/history行为不回退；真实Editor单次发布/无操作零dirty/保存UndoRedo native条目保持。
- 目标tests/types/static/Antd；root统一build+1280/420×500真实截图。只文案修复已由V checker完成，不重复覆盖。保留其他dirty文件，无提交暂存归档删件。
