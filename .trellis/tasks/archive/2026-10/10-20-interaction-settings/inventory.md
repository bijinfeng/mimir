# 当前证据与改动边界

基线commit 7b61836。已捕获10个Web分区深色1280px真实截图，模型1100/600px，分区切换滚动复现；来源为当前源码及本地真实服务。

## 已证实缺口

1. 在模型页滚动到1122px后切到“支持能力”，新分区仍为scrollTop284px，标题y=-244px，入口在屏外。原因包括复用main以及TanStack Router在onRendered按相同selector回放旧元素缓存；单纯key重建未通过浏览器验收。最终以section作key、分区专属data-scroll-restoration-id和此次分区导航resetScroll:false隔离缓存，保留外部导航焦点与URL合同。
2. 模型供应商标题“供应商2 个”没有分隔；披露按钮只有文字和旋转箭头，没有aria-expanded/controls。补计数间距和正确语义，展开/收起保留30px稳定命中高度。
3. 供应商卡片、统计格、能力列表和账号行按viewport响应，而当前设置body被工作区栏和分区栏占宽。改为已存在settings-content容器的实际宽度；确认中等窗口、长名称和地址不挤压操作。
4. 供应商行的多重按钮边框挤占视觉，使用已有Antd text动作保留全部可见动作；为重复动作补供应商上下文的可访问名称。保存/删除/测试语义保持。
5. 可见长地址/文件名按局部容器换行；不靠根页面横向滚动掩盖。

## 预期文件

- `_app.settings.tsx`：分区切换滚动容器身份。
- `settings.style.ts`：设置局部几何、容器断点、标题计数/披露、长内容。
- `ProviderList.tsx`：供应商动作/计数/披露语义。
- `AccountSection.style.ts`：账号profile在实际窄容器适配。
- 仅在发现真实必要回归时补对应交互测试；不添加镜像CSS断言。

其余分区本轮不为制造差异而改动。11分区全部纳入覆盖清单；Desktop桥/原生操作另行区分。无运行时、数据、鉴权、存储迁移或模型语义变更。

## 路由恢复复验

最终真实1100×760：模型main从0滚到1181，再切支持能力后scrollTop=0、h2.y=40，焦点仍在“支持能力”。新增`routes/-settings-scroll.test.tsx`覆盖同分区保留位置、跨分区节点身份与恢复selector隔离、replace/scope/resetScroll及导航焦点。
