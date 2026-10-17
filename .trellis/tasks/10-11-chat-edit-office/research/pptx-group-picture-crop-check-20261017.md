# C1 直接组合图片画布裁切独立检查（2026-10-17）

Active task：`.trellis/tasks/10-11-chat-edit-office`。对照批准的 `office-crop-remaining-plan-20261017.md` §C1、C0 独立证据及 `pptx-group-picture-crop-implementation-20261017.md`。本片独立检查完成，源码冻结交 root 浏览器/full gates；不是全部工具完成记录。

## 检查范围

逐读 native source picture placement、生产 renderSlide→SVG 接缝、既有 Canvas 手势、Group Inspector/Editor 状态与异步提交、strict manual box schema、原生工作副本 writer 与 server host。没有子代理、vendor修改、XLSX修改、提交/暂存、上传/删除。

固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`，WeKnora 沿 approved research 同日 v0.8.3 / `3e22822c1d2397be730c458c7539d0eb8c113a24` 公开源码缓存证据；本次是代码复核，未称重新联网。Office矩阵不以WeKnora Markdown为依据。

## Findings (fixed)

### 1. 新 source 渲染接缝漏掉深层图片的祖先缩放

- File：`packages/office/src/pptx-svg.ts`。
- Issue：C1给所有层级图片传native parent，但 picturePlacement.localMatrix用raw立即parent的ext/chExt。嵌套group.box已烘焙祖先缩放，图片反而只乘立即原生parent比例。在现有37°原生图外包无旋转2×祖先组后，首角SVG x=1235.489967639，正确2×直接映射为920.957779826，偏314.532px。
- Fix：SVG局部映射使用当前render parent实际childScale + native chOff，再与图片nativeMatrix组合；保留未经过祖先缩放的原生picture局部框。直接组写入与Canvas授权不变；不扩deep crop。
- `pptx-group-svg.test.ts` 新nested-source回归先红后绿。只是防止本片渲染回归，不宣称任意深层非等比旋转组已获得完整Office affine写能力。

### 2. 合法空白或数字前导零可绕过 attached guard

- File：`packages/office/src/pptx-group-picture-crop-guard.ts`。
- Issue：原正则只认紧邻的 `id="..."`。`id = "..."` 是合法XML，原代码仍允许改变带连接线图片的frame。前导零表示同一原生整数ID，也不应漏判。
- Fix：接受等号两侧XML空白，并归一化数字身份/允许连接属性前导零。UI与host沿同一guard拒绝；数值srcRect保留原框仍可用。
- 原生native-crop测试包含compact/spaced/leading-zero三种；spaced先红，修复后UI reason与native写同时拒绝、模型精确不变。

### 3. 不完整或歧义 off/ext 仍让画布入口看似可用

- File：同一guard。
- Issue：原守卫仅计数off/ext节点，缺失或重复x/y/cx/cy、非整数值未在UI预检拒绝；缺属性要到writer准备补丁时才报错，重复属性则仍歧义。
- Fix：每个必要属性必须恰好出现一次、为安全整数；cx/cy须正。未知原生属性依旧opaque保留，实际未知内容不被重建。缺失/重复/坏值返回具体“图片原生定位属性不完整”原因。
- native测试扩充duplicate-position-attribute、invalid-position-attribute，全部拒绝且零模型变化；已有duplicate-off/missing-attr继续通过。

本检查仅追加修改以上2个生产文件和 `pptx-group-svg.test.ts`、`pptx-group-picture-native-crop.test.ts`，未额外改Editor/shared/schema/host/vendor。

## 路径核验

- 直接图片：child原生R·F → parent原生S → parentR·F；原始EMU off/ext作为局部框，未从quarter-swapped placed box逆猜native尺寸。
- 非等比37°、90°及flat camera：纯几何独立EMU参照涵盖父0/30/45/90/270°、四flip、子0/37/90/270°、四flip、均匀/1.5×2和960/1440。inverse、retained source点和EMU舍入界通过。
- clip/ghost/底图/handles沿同一图片矩阵；提交中心通过child nativeMatrix，写入的box仍为child原生坐标，父组/兄弟/其他ZIP不变。
- private strict schema只允许srcRect伴随box、signed32坐标与positive32尺寸；未扩大public Agent词汇。原生writer也parse schema；失败在工作副本内，接受前无发布。
- 实际Editor一次manual_picture→一次版本/历史；save→Undo/save→Redo/save全ZIP精确；第二次裁切重新绑定；pending Escape abort→迟到host零publish；切页返回不复活草稿。
- source bytes/document/workspace/page/ref/group/version检查与Canvas width/height key共同失效草稿；Canvas卸载取消signal，自有busy不自取消。没有把组件mock当实际浏览器。

## 实际 SVG 栅格与查看

独立生成目录 `/tmp/mimir-pptx-group-c1-check-20261017/`，未覆盖root的原始上传fixture目录。使用实际生产renderSlide输出，macOS sips解SVG，NAPI读PNG；独立Canvas原生EMU transform不调用产品matrix helper。

```sh
MIMIR_PPTX_GROUP_CROP_FIXTURE_DIR=/tmp/mimir-pptx-group-c1-check-20261017 pnpm --filter @mimir/office exec vitest run src/pptx-group-picture-native-crop.test.ts
node .trellis/tasks/10-11-chat-edit-office/research/pptx-group-crop-raster-20261017.mjs /tmp/mimir-pptx-group-c1-check-20261017
```

复跑exit0：anisotropic37、quarter90、identity（仅child rotation=0）、flat-camera，每份裁前64+裁后64点通过RGB差≤3，共**512点**；每份64保留像素前后相同，共**256点**。日志 `/tmp/mimir-pptx-c1-independent-raster-20261017.log`，目录内raster-results.json。

实际view_image查看anisotropic37裁前/后：四色半透明网格呈斜切平行四边形，裁后显示更小保留区域、网格仍与原保留源像素重合；共享的另一顶层图片及文本位置未变。属于ImageIO SVG与独立OOXML/Canvas参照，不是PowerPoint/LibreOffice或生产浏览器截图。

## Findings (not fixed)

- Attached connector仍明确不支持frame改变。当前只保护该实际目标，不笼统拒绝非等比37°普通图片；后续端点几何实现前保留UI+host拒绝以及数值保框回退。此为批准的有限能力，必须保留在台账。
- 深层/MC/身份歧义/媒体picture写入继续沿guard拒绝；synthetic SVG兼容分支不是native写授权。普通非图片shape叶子的既有F·R及非等比近似仍在C1外，不能借图片修复声明全部Office几何一致。
- root负责真实1280/420×500：320px Inspector内滚、画布与8把手、固定唯一primary、Escape/回焦，以及生产浏览器37°非等比裁切save/Undo/Redo下载复核；公共spec同步也由root协调。
- 最终Office类型复检被并行 `DocxEditor.password.test.tsx:63` 的 TS2524（await不能用于参数默认值）阻断。已通知root，未修改密码owner文件。无C1诊断。
- 无其他已确认而未修复的C1代码缺陷。

## Verification

- Office专项：PASS，**9 files /109 tests**，`/tmp/mimir-pptx-c1-independent-final-20261017.log`。
- Server host专项：PASS，**1 file /19 tests**，`/tmp/mimir-pptx-c1-independent-server-final-20261017.log`。
- TypeCheck：shared/server独立通过；Office此前独立与修复后复检通过，最后冻结复检FAIL，仅外部 `DocxEditor.password.test.tsx:63` TS2524一条，无C1诊断。见 `/tmp/mimir-pptx-c1-independent-office-types-freeze-20261017.log`；此前通过日志 `/tmp/mimir-pptx-c1-independent-office-types-final-20261017.log`。没有反复重跑以掩盖并行错误，没有改XLSX或密码owner代码。
- Scoped oxlint：17个相关源码/测试路径无诊断，最后guard/native测试再检查无诊断；`/tmp/mimir-pptx-c1-independent-lint-20261017.log`。
- Scoped format：17路径通过，最后两文件再检通过；本检查修改4文件均已格式化。
- Antd：3个UI文件逐个运行，均issues=[]、partial=false；一次误传多个文件的CLI调用返回参数错误，改为逐文件后通过，不算产品问题。
- Script syntax与本检查4文件diff whitespace：通过。
- 未跑全套Office/server、build、browser/Desktop或真实模型；不重跑已知480技能lint，不扩大XLSX范围。
