# 知识库与目录 · 独立 HTML 评审

预览 `review.html`，默认完整根目录列表、仅打磨后。顶部可切当前/打磨后/同宽上下对比、浅深色、390px、低高度、200%文字、减少动效。左侧58个覆盖项，299个状态可直接定位；不把状态链接数量称为浏览器测试数量。

- 页面内均为虚构样例，不请求业务接口，不读写产品或真实存储。
- 当前侧依据当前源码与 `../verification/baseline/` 截图；不是给每个状态都截图的像素重建。当前材料图标复制到 `assets/`，不依赖产品代码。当前真实绿色聚焦来自并发主题token，提案使用已认可的中性细焦点。
- 前后初始样例、尺寸、排序、来源一致。100条场景真实生成100条，低高度/长列表可滚动。正常页面8篇，参考资料子树4篇。
- 原型27种渲染结构（`checks.json`列表）与58条语义轨道覆盖299状态链接；自然hover/focus等共享画面，`coverage.json`提供具体操作和预期。静态脚本只检验链接/映射完整，不假称运行时全量通过。
- 请求由提交触发；下方“评审模拟”显式选择成功或失败。F6跳到结果工具，Shift+F6返回画面；不运行计时器假装后台请求。
- 对照当前保留缺口：列表无文档更多、新建/改名等待未锁取消及Enter、空标签错误文案、失效子目录泛化为空、旧scope数据无提示、替换原件无自定义等待、目录删除“回库根”错误承诺、资料删除成功文案错误。
- 提案采纳P01–P07。P08明确本轮不新增浏览页移动/重命名，仍由已认可文档命令/详情菜单触发；当前移动下拉空值仍标“知识库根”，两侧都说明实际是清空folder，不擅自重做模块3。
- 删除目录后的文档保留，但清空folder后不再显示在当前KB；无重新归库、无回收站UI、无新增恢复能力。
- 完整知识库统一编辑复用模块2、文档命令复用模块3、收集导入复用模块4。这里展示准确交接、关键恢复及对象后果，不替代这些模块的完整验收。
- 原生文件选择/取消/拖入、剪贴板、下载结果、读屏、Electron与服务端真实成功均须宿主另验；原型只演示和标明边界。

构建：`node .trellis/tasks/10-18-interaction-library/prototype/build.mjs`

静态映射检查：`node .trellis/tasks/10-18-interaction-library/prototype/check-artifact.mjs`

更新catalog后：`python3 .trellis/tasks/10-18-interaction-library/prototype/generate-manifest.py`

类型：`packages/renderer/node_modules/.bin/tsc -p .trellis/tasks/10-18-interaction-library/prototype/tsconfig.json --noEmit`

格式：根oxfmt须显式使用本目录format.json（根配置忽略任务材料），不修改根配置。

版本待主会话批量GUI验收后冻结，本轮没有产品实施授权。
