# 独立原型构建与限定检查

2026-10-18，实施子代理仅写本任务 prototype/ 与本记录。没有修改产品、任务状态、父任务或日志，没有提交或推送。

- 来源：research/library-scenes.json 的58项/299状态，scenes.json及coverage.json均实时刷新current_behavior与源码引用。
- 交互结构：27种可见渲染结构、58条语义轨道、299条可直达状态URL。自然hover/focus等共享画面；coverage给出具体触发路径和预期。此数字不代表299次浏览器测试。
- 默认完整根目录列表，仅打磨后全宽；对比选项改为同宽上下，超2060px才并排，不把desktop挤成390px。
- 真实容量fixture100篇、常规8篇、参考资料子树4篇。前后同内容和尺寸。删除子树后该4篇从本库消失，保留全局文档、不承诺回当前库根。
- HTML无产品导入/业务网络请求/真实存储。原生文件选择、拖入、剪贴板与下载、完整已批准模块的实际行为仍需宿主验收。

限定检查全部退出0：

1. `node .../prototype/build.mjs`：Vite1922模块；生成单文件review.html，约493KB（含内联CSS和本地材料图标）。
2. `node .../prototype/check-artifact.mjs`：58项与299状态逐一对齐、源码元数据更新、entry/expected存在、无外链脚本CSS、无业务请求/产品导入；哈希写checks.json。脚本只声明静态映射完整。
3. `packages/renderer/node_modules/.bin/tsc -p .../prototype/tsconfig.json --noEmit`：通过。
4. 根`node_modules/.bin/oxlint`限定main.tsx、fixtures.ts、build.mjs、check-artifact.mjs：0错误0警告。
5. 根`node_modules/.bin/oxfmt --config .../prototype/format.json --ignore-path /dev/null --check`限定上述源码、env.d.ts与review.css：全部格式通过。独立format.json继承根格式偏好但不带任务忽略项，未修改根配置。
6. `git diff --check -- .trellis/tasks/10-18-interaction-library/prototype`：通过（原型尚为未跟踪文件，主会话提交前仍须审查新增内容）。

本子代理未打开浏览器，不以构建或源码检查代替主会话GUI、读屏或原生宿主证据。主会话和独立checker完成复核后冻结version.json，本记录时frozen=false、approval=pending。没有为规划原型重跑产品全仓检查；既有产品外部门问题归属仍按模块4记录。
