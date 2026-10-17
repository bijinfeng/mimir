# PDF 图片面板：当前任务与版本读回

2026-10-17 root，真实生产420×500检查发现，不能只凭早期check绿灯保留问题。

## 具体证据/最小缺口

当前Doc I56PIa071_MpP1ts，1280/420生产旧冻结build。`pdf-image-flip-extra-420.png`显示翻转任务仍出现上传/搜索/生成三个来源，挤出翻转方向字段，主按钮虽固定可达，但任务层次不准确。来源只对插入/替换有意义。

实际flip→save→Undo→save后native整件与baseline精确（3048B），但当前面板一直显示“第1页·0张图片”、目标只剩插入新图；Redo→save又回2张。源码PdfEditor snapshot绑定bytes，history回退使现有imageList失效；PdfImagePanel把undefined snapshot冒充0，不能称已读取无图。需要在当前面板可见且版本失效时读取当前图片（不修改document/history），并准确显示pending/失败/未读状态。

第一次flip应用时曾页面soft状态重置回开始分类且无history，原因未证明；稳定重试成功，已加CDP观察，成功路径无frameNavigated，仅200图片/asset和主动取消read。不要猜已修或删该记录。与PPTX媒体先前同类偶发事件一起保留最终门禁观察。

## 所有权/合同

仅 PdfImagePanel/PdfEditor 图片snapshot生命周期及相关 tests/CSS；不动OCR/正文/表单/PPTX/server/vendor。将operation抬为source-independent当前任务或等价最小结构，按任务选择参数：target→operation→仅insert/replace时source→当前参数，固定单一primary。外部search/generate不绕过目标/operation/版本绑定，切来源/任务/页/目标及时销毁旧asset与选择，不允许切回后旧selection复活。插入原图目标和替换现有目标表意明确。现有九操作及真实参数不减少。

history变更时仅imagesOpen需要刷新；绑定source/byte/version/page、busy互斥，关闭/换源/人工动作取消，异步read不覆盖新版本/不推进history/dirty。避免同次操作自身snapshot发布后再次重复read；未知snapshot不是0张。失败保留明确刷新路径。

相关参考沿pdf-image-inspector-upload-followup与pdf-external-images-next-plan固定GenOffice和WeKnora同日证据，本片是已支持操作UI纠正，无新增外部功能研究。

必须真实Editor tests：flip/saveUndo时保持panel，重新读当前bytes2图；读失败不显示0；迟到/关闭/source不覆盖；九任务只有素材任务出现来源；Search/Generate无配置准确门控、旧asset身份失效、一次执行/history。正式check→新build→root1280/420截图/焦点/保存UndoRedo原生闭环。
