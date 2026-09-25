# packages/office —— Office 文档的浏览器内编辑

这个包是 **vendored 代码 + 一层薄适配**：引擎与编辑器来自
[GenOffice](https://github.com/genspark-ai/genoffice)（Apache-2.0），
mimir 侧只加「打开 / 保存」的编排与样式裁剪。

**动手前先读这一页。** 它讲的都是「不知道就会毁掉几个月工作」的事。

---

## 目录形状

```
vendor/          vendored 的上游代码。**一律不改。** 同步会覆盖
  UPSTREAM.json    清单：commit、入口、跳过清单、文件列表（同步脚本维护）
  apps/docs/…      上游的文件，保持原目录形状（便于与上游对照）
src/
  docx.ts          适配层：openDocx → 编辑 → save
  index.ts         对外出口
  shims/i18n.ts    上游 i18n 的等价替代（同步时的改写指向它）
  generated/       样式裁剪产物（不进 git，由同步产出）
scripts/
  sync-upstream.mjs  从上游同步 vendor/（含闭包计算、改写、自检）
  trim-editor-css.mjs 从上游整份样式里裁出编辑器需要的部分
```

---

## 三条不能违反的规矩

### 1. `vendor/` 里的文件一律不改

需要改行为就在 `src/` 做。手改 vendor 的代价不是「下次同步冲突一下」——
是**每次同步都要重新解决同一处冲突**，而且上游一动那个文件你就得重看一遍。

上游依赖的两个东西（i18n、样式）已经用**机械改写**处理掉了，见
`sync-upstream.mjs` 的 `REWRITES`：改写是可重复的，所以每次同步都自动应用，
不算「手工修改」。要加新的改写，在那里加一条并写明理由。

### 2. 不要用 mimir 的严格度去检查 vendor

上游没开 `noUncheckedIndexedAccess`，mimir 开了。所以 vendored 文件顶部由
同步脚本机械加 `@ts-nocheck` + `eslint-disable` 横幅，`vendor/tsconfig.json`
是单独一份宽松配置。

**收紧类型检查的边界是 `src/`。** 那里是 mimir 自己的代码，按 mimir 的
规矩来。

### 3. 保存必须走补丁路径

`saveDocx` 有两种模式：逐块补丁（未改动的块原样复制 zip 条目）和整体重建。
**产品里只允许前者**——整体重建会丢掉我们没建模的东西（域代码、修订标记、
OLE 对象、自定义样式）。

`src/docx.test.ts` 有一条断言在守它：改一段后**只允许 `word/document.xml`
变化**。这条红了不要放宽断言，先查是不是保存路径退化了。

---

## 同步上游

```bash
git clone --depth 1 https://github.com/genspark-ai/genoffice /tmp/genoffice
node packages/office/scripts/sync-upstream.mjs --from /tmp/genoffice          # 同步
node packages/office/scripts/sync-upstream.mjs --from /tmp/genoffice --check  # 只报告差异
```

`--check` 用于定期看上游是否动了我们 vendored 的文件（输出非零退出码表示有差异）。

同步脚本会：重新计算闭包 → 应用改写与横幅 → 写入 vendor/ → 裁剪样式 →
更新 `UPSTREAM.json`。**它是幂等的**：连续跑两次，第二次「内容有差异 0 个文件」。

### 闭包是算出来的，不是列出来的

`UPSTREAM.json` 的 `entries` 是人工选的入口（编辑器、排版度量、文档状态），
`files` 由脚本从入口出发沿 import 图算出。所以**上游新增的依赖会自动进来**，
但**新功能不会**（那要改 `entries`）。

闭包算完后脚本会**自检**：每个被抽出的文件，它的每个相对导入都要能在闭包内
解析到；不满足就报错退出。这条自检是有代价换来的——解析不完整时是**静默**
跳过文件的，实测踩过两次：

| 症状 | 原因 |
|---|---|
| docx-engine 的 35 个文件全丢，闭包 93 → 56 | `.js` 后缀没映射回 `.ts`（改写产出 NodeNext 写法） |
| 9 个文件漏掉（watermark / protection / blank…） | 抓 import 的正则不允许跨行，而上游大量用多行 `export { … } from` |

两次都是「脚本成功退出、文件少了一批」。有自检之后同类失误会直接报错。

---

## 已知边界（POC 与产品的距离）

| 缺什么 | 说明 |
|---|---|
| **分页视图** | 分页引擎在闭包里，但接成「纸张一样的页面」还要容器与滚动逻辑。现在是连续流 |
| **工具栏** | 上游的 ribbon 没 vendored（那是它自己的办公壳）。要哪些能力是 mimir 的界面决策 |
| **大文档解析** | `parseDocx` 是同步重活，上游为它做了 worker（`parse-off-thread.ts`）。现在直接 await，大文档会卡主线程 |
| **保存冲突** | `PUT /api/documents/:id/file` 不校验 `If-Match`。单客户端可接受，多客户端会互相覆盖 |
| **xlsx / pptx** | 只验证了 docx。xlsx 走的是另一条路（还有 Rust 侧车与 Univer），pptx 未评估 |

样式裁剪（`trim-editor-css.mjs`）只保留 `.doc-*` / `.ProseMirror` / `.page-*` /
`.hf-*` 前缀的规则。**加新的编辑器 UI 时如果样式不生效，先看它是不是被裁掉了**——
那种失效是静默的（元素渲染出来但没样式）。
