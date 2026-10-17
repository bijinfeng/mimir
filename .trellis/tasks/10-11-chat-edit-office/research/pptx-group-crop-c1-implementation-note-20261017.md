# C1 实施边界补充

2026-10-17，root批准C1全片，继C0独立check冻结。

- 最小缺口：图片底图沿已缩放box旋转产生非等比shear误差，旧crop与底图均F·R；组图片没有画布入口或原子native box参数。
- 原生几何居于picture-placement纯函数：本地像素是未经过父组缩放的原生EMU框投影；父native chOff/chExt的S只应用一次，图片先R·F再父S，再父R·F。render/overlay/逆placement共用该函数。普通top-level同步改R·F。
- SVG第三可选source Slide由pptx-render.ts传入（root明确批准额外一行seam），从原生transform解析图片几何；保留2参数synthetic兼容，但synthetic反推不作为写回来源。子图片内容仍由当前renderer生成，外层以原生矩阵及框比例校正，图像clip/effects/opacity/原图不改。
- 原手势状态机只增加可选parent及parent ref的冻结key；确认native box和srcRect同manual_picture事务，目标失效/并发/取消保持零发布。
- 不改vendor/其他格式/sharedShell，不新增公开Agent工具。源像素保存、父/兄弟/共享媒体保持原件。root完整build/full/browser，实施者仅target types/static/tests。
- connector先核native updater可证明的边界；未知/无法可靠同步的实际attached目标显示准确原因并由宿主同样拒绝，不能无声遗留端点。
