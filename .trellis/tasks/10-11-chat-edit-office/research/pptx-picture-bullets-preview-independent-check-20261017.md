# PPTX 图片项目符号 SVG 预览：独立检查

2026-10-17；checker `/root/r3_bullets_independent_check`，按 root 明确分派，仅检查 `pptx-svg.ts` 和 `pptx-picture-bullets-preview.test.ts` 最小修复；不修改其他生产文件，不重复已由 root 验证的原生写入/history。

## Findings (fixed)

- `packages/office/src/pptx-picture-bullets-preview.test.ts`：原真实 native 用例分别证明“8 个 image 存在”和“group matrix 存在”，尚未精确断言图片嵌在实际 group child 内。补充 XML 结构断言：两个顶层各 2 PNG，两个直接组成员各 2 JPEG；group 的实际 15° matrix 全六值与已知原件几何吻合，两个 child 的相对 translate 正确。420/960 宽均通过。此为检查证据补强，没有生产修改。

## 生产审读

`pptx-svg.ts:textLayout` 的原 `run.text === ''` 过滤确实提前吞掉上游 `buBlip` 的 `GlyphRun {text:'', image,...}`。将普通空文过滤移至既有 image 分支之后可恢复绘制，仍使用原 widthPx、ascentPx/基线、offset、转义和样式 flush。图片仍打断同样式文字合并，空普通文字仍跳过；顶层、组合和其他共用文字适配沿同一路径，没有新媒体获取或异步缓存。

已查正式 native fixture → `openPptx`/`openPptxForEdit` → `renderSlide`/SVG：PNG/JPEG、两个顶层/两个直接组员、百分比/固定点数大小、原图纵横比、悬挂缩进、正文不重叠、换行首行一次、未解析图片 dot fallback、12 次重复渲染无 Image/bitmap/DOM/ObjectURL/fetch、只读原件与 dirty/version 不变、A→B→A 同路径不同媒体 URL 均有具体断言。长期合同未变化，本片无需额外 spec 修改。

## Verification

- Tests：直接 Office `node_modules/.bin/vitest run src/pptx-picture-bullets-preview.test.ts src/pptx-svg.test.ts src/pptx-group-svg.test.ts src/pptx-image-display.test.ts src/editors/pptx-picture-bullets.test.ts`，首轮与增强后均 **5 files 41/41，exit0**。最终日志 `/tmp/mimir-picture-bullets-preview-independent-final-tests-20261017.log`。
- TypeCheck：Office 直接 `node_modules/.bin/tsc --noEmit` **exit0**；`/tmp/mimir-picture-bullets-preview-independent-types-20261017.log`。
- Lint：两文件 scoped `oxlint` **exit0**；`/tmp/mimir-picture-bullets-preview-independent-lint-20261017.log`。
- Format / diff：两文件 `oxfmt --check` 和 `git diff --check` **exit0**；对应 `/tmp/mimir-picture-bullets-preview-independent-{format,diff}-20261017.log`。
- 独立只读真实产品保存件：使用当前正式 reader/render 重新打开 `/tmp/mimir-pptx-bullets-browser-group-jpeg-20261017.pptx`，SHA256 `a3296526cd51ad816a1dbf7049aaefc73fa787bbc16d26ffcd8752ad3197369a`；在 960/420 宽均实际输出 **8 个非零尺寸 SVG image，4 PNG+4 JPEG**。version=0、dirty=false、源 SHA 不变。非复用 owner 输出；日志 `/tmp/mimir-picture-bullets-preview-independent-native-20261017.log`。

## Findings (not fixed) / 剩余验收

未发现其他生产或类型/静态问题。本检查证明正式 reader/layout/SVG 和应用资源行为；浏览器内部解码/缓存不在零应用资源断言内。实际产品 1280×800/420×500 新构建后的图符显示、选区和整体视觉由 root 继续验证，不能以 SVG 数量替代浏览器视觉完成。

固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 的 reader/layout 是本修复技术依据。WeKnora 复用任务已核缓存 v0.8.3 / `3e22822c1d2397be730c458c7539d0eb8c113a24`（官网 SHA256 `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe`，definitions SHA256 `3aae03dc09c5c5261e71df3e9ee4fba9ad457cf632c817e4ea7ae1312f5bcae0`）；其 KB/Agent 能力门控不适用于 DrawingML buBlip/SVG，本片没有新远端访问或模型成功声明。

## 冻结

- 生产 `pptx-svg.ts` SHA256 **`63e048bbf69f49a4b5cbf49b6f62dfd339957bb09b6295be06d663dfd3298c91`**，与 owner 冻结完全一致。
- 增强测试 SHA256 **`ed83174187bf6193a5c048f302426eeb6d69f5f1b26bdb45eac2f5111bc2c48c`**。
- 两项快照 `/tmp/mimir-pptx-picture-bullets-preview-independent-freeze-20261017.sha256`。
- 所有本人测试/类型/静态/只读 native 命令均已退出，无在途进程，无新依赖/vendor/提交/上传/删除操作；root 继续统一生产 build、浏览器与全仓门禁。
