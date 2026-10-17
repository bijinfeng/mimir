# PDF 视觉签名 S1：浏览器、手势与原生保存验收

2026-10-17，root，localhost5180最终生产构建。测试账号admin@example.com，仅代码与浏览器，Desktop用户自验，无真实模型调用。视觉签名不包含数字证书，不自动签署任何真实协议。

## 范围与原件

计划/实现/检查见 pdf-signature-{plan,implementation,check}-20261017.md，最终UI见pdf-form-signature-ui-check-20261017.md。固定GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 与WeKnora v0.8.3固定证据沿计划；WeKnora只适用能力门控，不是Office外观主参考。

合成三页夹具 `/tmp/mimir-pdf-signature-fixture-20261017.pdf` 3530bytes，库ID `08HpgPE_117f_BSs`。原页1含customer/confirmed表单、带颜色与flags原生书签及外来Ink；页2Rotate90/offsetCrop/Media原点偏移，页3Rotate180与小纸型。测试图片 `/tmp/mimir-signature-transparent-20261017.png`、`/tmp/mimir-signature-white-20261017.jpg`。本报告保存均作用于这个合成测试件，保留文件。

## 真实手势/三输入

- 1280×720：原生鼠标在canvas手写2笔，准备放置后真实点击纸面、拖50×20屏幕px、角部等比resize，应用一次并保存。
- `/tmp/mimir-pdf-signature-browser-ink-saved-20261017.pdf` 9225bytes，独立pdf-lib+reader核验2个InkList与158.67×41.94pt矩形。表单可编辑、foreignInk不变，原书签C/F保留；Poppler渲染目视正确。
- 一次Undo→save，`...-ink-undo-20261017.pdf`与3530byte原件整文件精确；Redo→save，`...-ink-redo-20261017.pdf`与9225byte签名版精确。
- 实际420×500输入“张三 Li”/楷体，页2显式居中、应用保存，`...-typed-saved-20261017.pdf`30428bytes；Poppler中文和Latin无裁字、旋转方向正确。
- 真实chooser上传透明PNG（保留原色），页2点纸应用保存，`...-png-saved-20261017.pdf`37681bytes；渲染红笔透明背景、底下原生线仍可见。
- 真实chooser上传JPEG，页3明确选择“黑白去浅底”，点纸应用保存，`...-all-saved-20261017.pdf`43971bytes；Poppler黑线无白色底框。四签名重读成功。

以上省略号文件名前缀为 `/tmp/mimir-pdf-signature-browser`。nativeJSON为同前缀 `-ink-native-20261017.json` / `-all-native-20261017.json`；渲染PNG见同前缀typed/png/jpeg-saved-20261017.png。

## 最终构建重开编辑、删除和表单共存

1. 重载四签名保存件，通过实际“编辑→表单→交互表单”，窄屏菜单关闭，Inspector头部无遮挡。字段body内部滚动，footer与body同级，应用按钮y397.36–429.36（500高内）。修改customer为“Keep editable QA”，实际应用、保存，`...-form-saved-20261017.pdf`42995bytes，native4签名及原表单/外来Ink/书签均正确。
2. “绘制→签名→调整手写签名1”，当前x97.8显示正确，经精确位置改x105→应用→保存，`...-adjust-saved-20261017.pdf`48457bytes。native x=105，另外三个签名结构完全相同，表单/原外来Ink/书签C/F/Dest保持。
3. 页2删除签名2，native `...-delete-saved-20261017.pdf`41430bytes仅剩三个目标签名，其他签名完全相同。一次撤销→保存，`...-delete-undo-20261017.pdf`与48457byte调整前版本**整文件精确相同**。当前库fixture已恢复四签名，customer为QA、首签名x105。
4. 最终420×500、Rotate90页输入测试姓名，仅准备并点“放在页面中央”：实际草稿滚到可见纸面，应用按钮文字为白色、取消可见，动作区y333.80–461.36。随后取消，零新增签名/dirty。手动点和拖不自动scroll由真实Editor专项覆盖。
5. 宽1280×720最后侧栏截图，320px紧凑Inspector、当前页两签名调整/删除入口与固定准备动作正常。临时viewport已清理。

native最终form/adjust/deleteJSON均在同前缀文件，独立脚本 `/tmp/mimir-signature-browser-inspect-20261017.mts`。保存文件通过已授权实际UI写入后HTTP取回做独立检查；不是冒称全部是浏览器下载。

## 发现并已修复

- forms/annotations折叠菜单留在Inspector上方：入口close后再开面板。
- form Apply掉到500高屏幕下方：字段body内滚，footer固定。
- 签名说明span CSS污染Ant主按钮：selector收窄，实际白字确认。
- 显式center放置后草稿在900px宽纸面屏外：对真实box一次center/center scroll，实际420确认；不改变手动定位/拖动滚动行为。

## 门禁与边界

- 最终全Office **177文件1844/1844 exit0**，`/tmp/mimir-office-full-toolbar-ui-final-20261017.log`。
- Server最终全套 default90文件737/737、local10/10、fnos4/4、node backup2/2，`/tmp/mimir-server-full-signature-final-20261017.log`。
- 最终Webbuild exit0，`/tmp/mimir-toolbar-browser-ui-final-web-20261017.log`。
- native21/21、server49/49、Office52/52、最后UI42/42与3包types/targetstatic见checker报告；不重复累加为独立总数。全仓480既有技能lint阻断保留。

截图绝对目录 `/Users/admin/.codex/visualizations/2026/10/16/01a142b8-e543-7780-8181-44e1e0f94f51`：`pdf-signature-inspector-confirmed-wide.jpg`、`pdf-signature-center-confirmed-420.jpg`、`pdf-forms-inspector-confirmed-420.jpg`。旧final-420表单/typed-placement截图属于修前证据，不作当前结论。

仅自有可验证Ink/Stamp可调整/删；外来签名保持。Crop超Media、UserUnit!=1等明确拒绝新放置/变换、允许受验证读取删除。签名仅手动，不在模型自动工具目录；数字证书/签名库/OCR仍未实现，整体仍in_progress。
