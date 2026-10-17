# Server PDF 保真用例预算

日期：2026-10-17。主会话授权针对全仓质量门中的Server PDF失败定向诊断，只修改该单例预算，不改全局配置或产品实现。

## 证据与判断

全仓日志 `/tmp/mimir-yuque-final-pnpm-check.log` 报原测试 `keeps native outlines, fields and original content through consecutive fills and page operations` 在5141ms失败；Server没有设置testTimeout，使用Vitest默认5秒。该递归运行随后因Office失败中止Server，因此没有打印完整Server异常，不能声称日志已经明确显示 `Test timed out`。

该例串行执行8轮真实表单修改，每轮重读native outlines；再写水印、复制/旋转/裁剪/纸型、混合页面操作和两次表单修改，最终由PDF.js独立校验两页文字、批注、目录与字段。所有异步工作已await，不存在可替换的固定sleep或静默轮询。定向原源码3项通过、全文件4.00秒（测试阶段约3.2秒），日志 `/tmp/mimir-yuque-server-pdf-preserving-before.log`。这支持并发下5秒预算余量不足的判断，不支持功能回归结论。

## 最小修改

仅 `apps/server/src/test/pdf-preserving-forms.test.ts`：该重型多阶段单例显式 `{ timeout: 20_000 }`，加两行成本注释；为保持字面量标题与小diff，标题缩为 `preserves native PDF through form and page edits`。所有测试体、原行为断言与其他两例完全保留。diff为3行增加、1行替换。未改Server全局预算，没有减少原生写入次数或独立读回。

写前SHA256核对基线 `b0416b7ec355f612989bfb432f46b5782dfc3848f932541303446a069dfdc82c`，未覆盖他人改动。

## 最终验证

最终源码执行该文件3项全部通过，单例耗时2377.13ms，其他两例492.67与75.31ms。完整日志 `/tmp/mimir-yuque-server-pdf-preserving-final.log`，机器结果 `/tmp/mimir-yuque-server-pdf-preserving-final.json`。

限定oxlint、oxfmt与git diff --check均退出0（lint日志 `/tmp/mimir-yuque-server-pdf-preserving-lint.log`）。已通知质量终验代理对当前源码运行原样完整 `pnpm check`；本报告不代替全仓通过结果。未提交。
