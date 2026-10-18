# 基础组件交互对比 v1

用户审阅入口：`review.html`，完整样式和脚本均已内嵌，无CDN、无业务API。浏览器打开本地HTML，或从项目根目录运行：

```sh
python3 -m http.server 5180 --bind 127.0.0.1 --directory .trellis/tasks/10-18-interaction-foundations/prototype
```

浏览器访问 http://127.0.0.1:5180/review.html 。左栏12场景，状态选择器58种快照；当前/提案可独立操作，可切浅深、并排/单列和390px容器。窄屏通过上方场景选择器导航。点击“覆盖清单”查看范围与来源。

## 维护

```sh
node .trellis/tasks/10-18-interaction-foundations/prototype/build.mjs
pnpm --filter @mimir/renderer exec tsc --noEmit -p ../../.trellis/tasks/10-18-interaction-foundations/prototype/tsconfig.json
pnpm exec oxlint --no-ignore --deny-warnings .trellis/tasks/10-18-interaction-foundations/prototype/main.tsx .trellis/tasks/10-18-interaction-foundations/prototype/build.mjs
```

构建复用现有web依赖与renderer主题；`dist/`是临时生成物，不提交。开发源由Vite打包后内联为单文件；String.replace使用回调，避免bundle中的$&/$`/$'被当作替换模板。

批准以review.html的固定哈希为准，见父任务approval-ledger.json；认可后不要覆盖已认可版本，实质修订另升版本。当前仅提案，业务整页、Office专用面板与真实异步/原生宿主都在后续模块独立评审。
