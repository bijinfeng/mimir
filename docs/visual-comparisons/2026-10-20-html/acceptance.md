# HTML 编辑器精修验收 · 2026-10-20

沿用户后续直接实施并留前后对比授权完成模块11。产品7个HTML文件及1个相关测试文件；保留既有语雀主题与Office外壳，未改vendor、共享原语或模型/写盘/原件协议。

## 结果

- 源码主题：在本地.mimir-html-cm桥接既有me角色到vendor所需变量，浅深模式语法、行号、选中和光标恢复主题。
- 实际宽度适配：纯布局容器按可用分栏宽度<800px上下排列；1280窗口中的690px编辑列，以及1100px编辑器扣除320px Inspector后的780px均确认上下排列。两栏仍常驻，hidden和缩放补偿不变。
- 插入：280px紧凑菜单，类型/图片URL/行列有可见名称，单一主操作，失败alert/成功status；实际行数9拒绝、改2后插入成功且保存/撤销变为可用。
- 查找：Escape、关闭按钮、再次切换及源码被隐藏后关闭均回原CodeMirror；5条新真实挂载回归确认源码/版本/原CM和iframe身份保持。真实浏览器查“知识”9处、下一匹配、Escape回cm-content。
- 写作：真实计数、错误和过期说明分组，动作允许换行。既有iframe临时显示匹配版本的草稿，源码仍为原文；268字符模拟失败后可明确保留，推进原文版本后保留禁用，丢弃可恢复。
- 规划与演示：长表单内部滚动、固定动作；280px编辑列中的247px提纲面板动作分两行，390px编辑列正常保持一行。390×360真实视口插入菜单底230.6px、动作底217.6px；演示操作条41px、iframe319px，Escape可退出。

## 存档与可复查证据

- comparison.html：8组真实配对原图、5组补充状态、92项交互入口及每行证据边界。所有配对同内容/同编辑区/同视口，图片像素与SHA见capture-manifest.json。
- demo/dist/before：冻结0c44cde产品源码；期间聊天起始页提交不改变HTML产品。demo/dist/after：本轮最终产品源码。两边同fixture、真实MimirProvider/theme bridge/HtmlEditor及iframe/Inspector/公开Agent handle，不用手绘组件或伪造消息。
- build-manifest.json：资源字节数/SHA及aggregate；每份source-manifest.json含87个实际构建源SHA。最终after源文件与工作树逐个核对无差异。
- browser-observations.json：实际几何、焦点、临时预览/恢复与草稿状态。download-verification.json：真实下载5166字节、doctype/尾换行保持、无预览检视脚本标记。
- CSS真实预览color:red/padding8px后保存仍禁用，取消恢复原色/0px。视图切只看预览后源码仍挂载且hidden；手机390px档位在200%缩放实际宽780px。
- 读取模拟失败可通过真实“重试”恢复；保存模拟等待/失败/再次成功沿真实按钮与IO状态，日志明确未写盘。

## 质量门

独立trellis-check未发现产品阻断问题，7文件97项定向测试、Office typecheck与作用域lint/format通过；见子任务check-report.md。

最终产品树 pnpm check exit0，原始输出full-check.txt。Office2716、Renderer591、Chat88、Desktop50、Server1365+local10+fnOS4及备份/宿主脚本通过；其他包全部通过。Storage原有2项跳过，未伪称执行。

5条新查找回归加入后，happy-dom在跨用例挂载时保留已卸载CM选区；afterEach明确清空range，避免测试环境污染。没有调整产品选区语义或降低断言。

## 未验与原有边界

92项为完整来源/入口/适用状态映射，非92次逐项GUI验收；coverage-map.json保留未逐项断言项目。广泛的格式/版本/取消/消息合同由既有行为测试支持，不以外观截图替代安全验证。

Demo读写库、提纲和写作服务为显式受控模拟，未连接真实模型或写数据库/原件；不等同实际知识库保存/重开/宿主离开守卫、原生Electron、本地文件选择、远程图片CORS或外部模型验收。本轮实际下载仅验证固定fixture导出。

原vendor裁切手柄缺键盘移动与短高模态限制仅记录，本轮未改vendor或声称修复。全屏支持/拒绝、独立新窗口及权限提示未在本轮逐项实测。HTML作者页面继续按原样渲染，深色源码不改变作者白底；sandbox/no-referrer保持，未增加allow-same-origin。

## 规范判断

本轮沿现有组件/容器/原件规则修复，未改变公共契约、新增产品能力或新主题角色；无需为验证流水扩写现行spec。构建/截图、短视口及独立审查记录留本任务与存档。
