# 首轮19项集中修复回应

2026-10-18。对应 prototype-review-round1.md。仅陈述已实现的源码路径和限定静态验证，最终运行时复核由主会话/checker记录。

1. 容量：`longList`真实Array.from100条，双方同顺序；不再只改头部数字。
2. 加载/失效：LIB-006/019.loading初始骨架；zero-roots当前仍泛化空态，提案缺失根+创建；可返回有效目录或创建后恢复。
3. 完成/取消：新建/目录改名/目录删除/文档删除的success初始关闭弹窗并更新fixture；取消回原页面。KB创建编辑success/cancel同样关闭；未改保存无写请求。
4. 边界fixture：empty-child有路径；long-list100行；scrolled初始scrollTop240；long-excerpt长摘要；narrow-failed/narrow-hidden及hash直达390，低高度可切换。
5. 微状态：LIB-049画布外具体步骤；disabled给现有“节点不可用”条件下的新建文件夹禁用；pressed/hover/键盘都有可操作目标；F6结果工具可访问。
6. 当前保真：当前文档行为使用整行button、标题是span；文件夹行空白可进入、菜单拦截冒泡；格式glyph为本地复制当前材料SVG，不以统一FileText降级。
7. 状态列：含failed有独立“状态”表头/列；窄屏失败次行；文件夹卡片恢复“文件夹”chip。
8. 源数据：重跑generate-manifest.py读取research最新说明，LIB-032/045事实同步。
9. 导入位置：inline UploadPanel交接结构移到topbar前，与当前源结构一致。
10. 目录删除：移除目录入口与其参考资料子树4篇当前KB可见文档；全局保留的事实只说明，不造重新归库UI。当前错误toast仍供对比，提案准确清空归属。
11. KB删除：独立kb-delete模式，名称“设计工作台”；空/非空0/8fixture，后果不是“参考资料”；成功无其他库回创建引导。编辑名称+描述无图标；reconcile-error先模拟稳定ID对账后才允许保存。
12. 移动：两侧Select空值都保持现行“知识库根”标签，旁边解释实际清空folder，避免修改模块3已批准界面；加载/读取失败禁写；当前目标/未改直接关闭；read-refresh-error初始committed锁字段，仅重新读取，finish不重复写。
13. 详情菜单：当前目录禁用、可选其他目录、无folder时没有移出项；移动与撤销为具体交接模拟，不把两个动作都开同一表单。
14. 替换结果：parseOutcome单一状态驱动结果文案；无正文/提取失败按钮不会只改toast；失败可重新选择，同文件/原生取消边界明示。
15. 危险确认：mask不可关闭，取消初始焦点，pending禁关闭，错误保留对象可重试，双方保持基础确认合同。
16. 菜单键盘：打开聚焦第一可用item，触发器ArrowDown打开，菜单Arrow/Home/End遍历、Escape回原触发器。
17. 菜单到弹窗：openModal在菜单触发时保留原始trigger，不用即将卸载的menuitem覆盖；取消requestAnimationFrame回到仍连接的原更多按钮，缺失才fallback。
18. IME与单飞：提案Escape在composition时忽略，Enter composition不提交；requestLock ref同步单飞，新建笔记亦保护。当前目录表单缺口不假称已有。
19. hash约束：App初始化从readHash同时推导主题/尺寸/减少动效；直接390-dark就是暗色390，而不等再次点击导航。

附加集中修：默认全宽仅提案，当前行为说明折叠；并排默认上下同宽，宽屏足够时才双列。覆盖路径逐项明确，元数据不再用同一句泛化说明；27结构不冒充299种独立页面。静态检查详prototype-build.md。

最终文案收尾：知识库删除的当前侧保留 FolderSection 现行“文档移回库根”确认与成功提示，提案侧准确说明清空归属。删除确认中的实现说明移至画布外依据区；容量提示只保留最近100个文档与包含下级目录的信息，接口无总数/分页的限制保留在画布外。
