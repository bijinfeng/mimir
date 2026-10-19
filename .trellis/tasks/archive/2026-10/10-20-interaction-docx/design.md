# 设计与变更边界

## 证据与差距

真实before组件在390×640窄视口“插入→表格、图片与链接→图表”后，菜单仍expanded且覆盖Inspector标题（captures/phone-chart-before.jpg）；690编辑栏中插入图表动作top678超出body bottom613，须滚到末尾。Style已有sticky动作，但仍与长表单/说明同滚动，selector不在PropertyForm语境。

## 最小设计

- 保留320px Inspector外壳、现行标签与两列PropertyForm、主题角色与全部原有参数/动作。只为旧 Chart/Textbox/Page/Watermark/Note/Style引入DOCX局部属性面板布局：独立滚动body与同级固定动作区。动作允许换行，状态文本有界且不挤掉按钮；每个当前任务最多一个primary。水印保持文字/图片/移除既有能力；不得以新流程隐去旧入口。
- advancedMenu通用路径在解析origin/section后先收所属展开组，再打开Inspector；保留live trigger/section/tab回焦机制。
- 查找关闭（Escape/关闭/再次切换）待bar卸载后preventScroll回原PM，不触发正文事务；不抢用户在面板外主动转移的焦点。
- 补齐Privacy重新读取与停止生成副本两个空白按钮的可见文案；现有Design应用动作明确primary。

## 归属与合同

DocxAdvancedControls.tsx承载旧表单与局部面板布局；DocxStyleControls.tsx只重排选项与动作；DocxEditor.tsx承载折叠菜单和Find回焦；docx-tools.css负责新局部布局；Privacy/Design只修按钮呈现。必要新增DOCX局部布局文件可合理使用，禁止修改共享Shell、vendor、引擎写入/保护/加密/Agent/IO合同。

所有场景保留唯一EditorContent、session/版本/dirty/history；改变布局不改body attrs或页面几何，不把CSS装饰写回原件。前后使用冻结6f6af4c与同fixture真实构建，源码清单及图像hash保存在archive。

## 验证与回退

真实挂载测试覆盖查找关闭回原PM且无文档变化、折叠菜单关闭且回live入口、旧表单操作参数与单次应用、空白按钮可见。浏览器宽/690/390与短高、浅深、长期滚动及保存失败恢复。现有DOCX保真/保护/导出回归及最终全仓pnpm check必须通过。只回退本轮局部文件可撤回，不引入数据迁移。
