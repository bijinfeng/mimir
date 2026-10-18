# 知识库与目录浏览管理 · 规划交付

2026-10-18；仅规划。产品代码未修改，task 保持 planning，未启动实施。

## 冻结版本

- library-review-v1 revision1；approval=pending。
- [交互HTML](prototype/review.html)，预览 http://127.0.0.1:5186/review.html 。
- SHA256：`a3f0f0053519810140a955d5d9fdbb727eded3a9661d2353b0282f473b21f281`。
- [版本与源哈希](prototype/version.json)、[覆盖映射](prototype/coverage.json)、[静态检查](prototype/checks.json)。HTML 修改必须重新冻结并提交用户评审。

## 覆盖与方案

58组覆盖：50组当前能力或缺口、8组提案及边界；299个可定位状态，27种渲染结构。共享 hover/focus 等状态提供实际操作步骤。299是导航映射数量，不代表299个独立页面或全量浏览器验收。

涵盖首次引导、知识库身份与统一编辑、工具条、列表/卡片、标签、目录路径与操作、文档已有菜单、替换与删除、加载/空/失败恢复及小屏。保持已认可语雀方向。列表补齐卡片已有更多入口，目录表单就地校验与请求锁定，查询/空标签/失效定位信息准确，替换反馈可见，删除后果与当前服务一致。沿用模块2统一知识库编辑、模块3文档命令、模块4收集导入交接。

删除目录/知识库保留文档但清空归属，文档会离开该知识库筛选；不承诺移回同库根目录。本版不新增权限、批量、回收站、分页或后端能力，浏览页不新增移动/重命名命令。

## 验证证据

- 源盘点独立复核：[inventory-check](verification/inventory-check.md)。
- WeKnora官网v0.8.3、公开main固定commit `2c0d8384398ca756ee414eef01b71caf91e2caa6`，不声称两者是同版；Obsidian官方help固定commit `08ef563f07b78dd589f19b1583d089c1e2d2377c`。20份证据及适用边界见[参考研究](research/reference-review.md)。未作外部登录态产品测试。
- 原型独立 lint、type、format、build、artifact映射和差异检查通过。检查者重建哈希一致，无剩余原型范围阻断：[最终独立报告](verification/prototype-check.md)。首轮与第二轮历史完整保留。
- 产品代表基线截图见[baseline](verification/baseline/README.md)。本轮5个产品文件基线哈希全部未变：[product-unchanged](verification/product-unchanged.json)。其他会话的主题等未提交修改不纳入本任务。
- 主会话GUI抽验记录：[browser-qa](verification/browser-qa.json)。实测目录名称校验；pending字段和关闭锁定；失败留稿及重试；新增空目录保留原目录；第二目录改名保留2篇文档；删除目标和计数绑定、取消初始焦点；删除后仅清空目标归属；菜单ArrowDown/Escape及弹窗取消回焦；添加按钮hover前后尺寸和1px边框不变、16px图标居中；浅深桌面、390px、844×480低高度；替换原件保存但无正文；真实100行及列表滚动；标签空态。
- 最终冻结版补验：KB删除当前错误“回库根”与提案准确清空归属的对比；容量说明无API术语；390px更多按钮44×44且无页面横向溢出；新建知识库更新标题并进入0文档空态。最终同尺寸浅色桌面当前/提案截图已保存。

[最终当前](verification/prototype/final-before.png) · [最终打磨后](verification/prototype/final-after.png) · [同宽上下对比](verification/prototype/final-comparison.png)。更早GUI截图属于检查过程，不全部对应最终hash；最终小屏44px修正以最终版DOM实测为准。评审控件名为“并排对比”，桌面宽度下实际采用同宽上下排列以保留产品布局。

## 验证边界与下一步

HTML使用本地虚构数据和显式请求结果工具，无业务接口写入。静态映射不等于运行时覆盖；浏览器采用代表路径抽验。原生文件选择/取消/拖入、下载、剪贴板、OS输入法、读屏、Electron与真实服务端成功均留到实施后的宿主验收，HTML不充当这些能力的证明。

本轮纯规划不重复跑产品全仓测试；不宣称全仓门通过。模块4记录的小程序lint与外部Renderer TS2550阻断仍保留。

用户认可此精确版本后才进入产品实施。实施前刷新并发工作基线，按冻结稿逐项还原，相关业务回归、真实宿主与必要质量门通过后限定提交。本任务当前不归档。
