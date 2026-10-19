# 登录与恢复交互验收

真实源组件与Root/Login路由，只有auth IO与Desktop桥为模拟。不会创建真实账号、修改密码或向服务发送表单。

从仓库根目录运行：

```sh
pnpm --filter @mimir/web exec vite --config "$PWD/.trellis/tasks/10-20-interaction-login/gallery/vite.config.mjs" --port 5196 --strictPort
```

归档后将路径换为本README所在目录的vite.config.mjs。基线源码可用`GALLERY_SOURCE_ROOT`指定，必须包含`packages/renderer/src`；本轮冻结ad72328。静态构建已保存在`docs/visual-comparisons/2026-10-20-login/demo/dist/{before,after}`，从本地静态HTTP服务打开index.html即可，无须Vite或后端。

`scene`可选login/signup/setup-loading/setup-error/local/root-offline/root-http/auth-error/long-error/pending/load-error；`theme=light|dark`；`platform=browser|desktop`。顶部完成/失败按钮结算受控Promise；失败按钮仅用于支持失败恢复的初始化/根错误场景。注册仅使用标准测试账号数据进行模拟，成功页明确标注模拟IO。Desktop标题栏和桥调用计数不代表原生窗口/IPC已验。

真实截图通过目标标签页CDP尺寸覆盖与原始PNG捕获，逐项校验innerWidth/innerHeight与图片尺寸。浏览器级viewport控制在多标签页时可能作用于其他标签页，不能据文件名推断尺寸。原始几何/AX证据见layout-metrics.json。
