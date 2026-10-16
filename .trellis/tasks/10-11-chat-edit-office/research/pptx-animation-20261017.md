# PPTX 动画剩余工具补全

2026-10-17。范围为动画图库、追加与清除、自动逐段、五种运动路径、切换全部，以及编辑画布内悬停/键盘聚焦/整页预览。根会话整合 Editor、共享导出和 action/HTTP 接缝；本记录的组件和服务证据不代替真实浏览器验收。

## 固定参考与适用性

- GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`，本次再次以 `/tmp/mimir-genoffice-html-git` 的 `git rev-parse HEAD` 核对。
- `apps/slides/src/renderer/animation-actions.ts`：`animDefaultDur` 定义出现/消失/媒体 0ms，spin/grow/bounce/motionPath 2000ms，pulse/teeter 1000ms，其余 500ms；`applyAnimation` 仅替换所选对象的全部效果，none 只移除，`addAnimation` 保留原效果；逐段仅在真实段落数大于 1 时拆分，单段仍为整对象。路径动作只追加，不随逐段开关拆分。
- `components/Ribbon.tsx:310–325`：向右、向下、对角线、圆形四段 cubic+Z、折线五条精确路径；1546 起 hover dwell 350ms 与 leave 清理；动画页中区分图库、追加、路径和预览，切换页提供应用全部。
- `animation-play.ts` 与 `components/AnimatedSlide.tsx`：onClick/withPrev/afterPrev 时间依赖，语义段落独立状态，M/L/C/Z 路径采样，播放状态与编辑数据分开。Mimir 沿用自己的 SVG/WAAPI 层，并通过真实段落 `<g>` 分组适配，不引入 Konva 或第二份文稿模型。
- WeKnora v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24`：已核本地固定证据 `/tmp/mimir-pptx-weknora-definitions.go` 的 `search_knowledge`、`read_document`、`list_documents`、wiki/sandbox 工具；没有 Office 动画/原生 timing/Ribbon 模型，不作为本片工具语义依据。本次 `curl -IL --max-time 10 https://weknora.weixin.qq.com/` 超时且未收到站点内容；不记作站点成功访问。

## 实现边界

- `pptx-animation.ts` 定义专属 `manual_animation` 手动合同：`animation` 的 replace/add/remove 和 `transition-all`。不接收 XML、任意 DSL 或客户端段落计数，不改变模型原来的 50 项批次白名单。
- `pptx-manual-animation.ts` 从当前原件按持久 ID 解析对象、真实段落和当前切换；长文本一次生成 native timing，所有页一次 atomic transaction；5000 项资源预算。媒体效果只接受真实视频/音频，手动段落定位检查真实段数。路径限定完整 M/L/C/Z 绝对坐标语法。
- 其他对象的 timing 与 unknown preset XML 交给固定引擎保留；必要的 cTn ID 重编号属于结构维护，测试以去除这些纯 ID 差异后的完整未知效果 XML 比较，不把原效果简化为替代写法。
- 输出与输入逐 ZIP entry 比较，真实 no-op 返回原字节、空记录、不增版本；成功修改只增一次版本，供宿主单一 history 快照。save 输出再次做 ZIP 预算预检，取消或失败不发布私有工作副本。
- `SlidePlaybackControls` 用效果/时间线/切换/备注四个可键盘切换的分类。图库点击即替换，底部独立按钮追加并显示当前待加效果/时长；复杂参数折叠；切换全部为底部固定动作。pending 提供取消，切换文稿/版本卸载 abort，根会话记忆分类以免每次修改跳回效果。
- `PptxAnimationPreview` 只临时操作现有编辑 SVG；350ms hover/focus 预览、leave/blur、页面/版本/选择变化、Escape、画布点击、窗口失焦、结束与卸载恢复原 style 并取消全部动画与待启动 timer。后续效果在真正开始时才创建，避免 backwards fill 反向覆盖同对象的前一效果。减少动态效果偏好时取消路径/旋转运动。
- `pptx-svg.ts` 唯一新增几何无关分组是 `data-pptx-paragraph`；同一语义段落的视觉折行仍在同组，原坐标、文字和 SVG IDs 不变。

## 验证

- Server `src/test/pptx-manual-animation.test.ts`：6 项。60 个真实段落拆分超过原 50 项限制、55 页切换全部、精确五路径追加、清除所选不改 sibling unknown preset、保存两次、保留无关 ZIP entry、原生 transition/advTm8000 经 add→add→reorder→replace→remove→两次保存、stale/media/非法路径/XML/取消原子拒绝、ZIP no-op 的 bytes/version/records。
- Office `PptxAnimationControls.test.tsx`：6 项，加已有 `pptx-svg.test.ts` 10 项。真实模型段数与 SVG 语义段分组、默认时长与圆形实际曲线、替换/清除/追加差异、350ms hover/focus/leave/blur不写、pending单请求及卸载取消、版本失效不重播、Escape与自然结束/窗口失焦准确恢复、同对象延迟效果真正开始后才播放、reduced motion。
- 最终收口：Office/server/shared `typecheck` 均通过；服务专项 6/6、Office 两文件 16/16 再次通过，日志分别为 `/tmp/mimir-animation-final-server-tests.log` 与 `/tmp/mimir-animation-final-office-tests.log`。九个相关 TS/TSX 文件 Oxlint、九个自有文件 Oxfmt、Gallery/AdvancedControls antd lint 与定向 `git diff --check` 均通过。产品文件已冻结交根会话实机验收。
- 三种子集的实际浏览器、宽区/420px样式、保存/撤销重做与放映对比由根会话补证；不在这里提前记通过。

## 保留的边界

SVG 动画预览为浏览器效果近似；unknown PowerPoint preset 保留原生字节，预览按已解析的近似 effect。媒体命令的原生写入已覆盖，但本片编辑 SVG 预览不自动发声或启动嵌入媒体；媒体交互播放仍由现有媒体播放器操作，完整放映媒体时间线仍须单列后续实现/验收。此次不因动画工具入口补齐而宣布全部 PPTX 或全部编辑器完备。
