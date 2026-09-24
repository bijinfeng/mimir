# apps/server/AGENTS.md

服务端的区域规则。根目录的 `AGENTS.md` 仍然适用，这里只写这一层特有的。

---

## 这一层的结构

```
src/
├── index.ts        生产入口。起 @hono/node-server，监听端口
├── dev.ts          开发入口（Vite 的 dev server 调它）。只导出 app，不监听
├── boot.ts         启动准备 + 装配，两个入口共用
├── app.ts          路由装配。鉴权中间件在最外层，新增路由默认受保护
├── env.ts          环境变量集中校验。不要在其他地方直接读 process.env
├── db/             schema + 迁移
├── lib/            无状态的纯工具（文本、vault、HTTP 辅助）
├── plugins/        **装配层**：host.ts（唯一的跨边界文件）+ settings-store.ts
├── search/         检索的宿主适配层（注入 snippet 端口；编排在 @mimir/core）
├── services/       业务逻辑。文件与数据库的一致性在这一层保证
└── routes/         只做参数校验与调用 service，不写业务逻辑
```

分层的判断标准：**route 层不应该知道数据库的存在，service 层不应该知道 HTTP 的存在。**

**这一层是「宿主」，不是「核心」。** 插件实现在仓库根的 `plugins/*`
（独立 workspace 包），核心骨架在 `packages/core`。宿主只负责：路由、鉴权、
业务逻辑、数据库，以及**装配**（`src/plugins/host.ts`——全仓唯一同时 import
宿主与插件的文件）。

---

## 开发与构建都是 Vite

`pnpm dev` 是 `vite`，`pnpm build` 是 `vite build`（SSR 构建）。
配置在 `apps/server/vite.config.ts`，那里的注释写明了三条不能改的契约
（`preserveModules`、external、workspace 包内联）。

- **不要在入口里调 `serve()` 两次**：dev 入口只导出 app（`dev.ts`），
  监听由 Vite 的 dev server 做；生产入口才自己起服务（`index.ts`）
- **加新入口**（比如一个维护脚本）要在 `vite.config.ts` 的
  `rolldownOptions.input` 里加一行。产物必须保持与源码同深度——
  `lib/static.ts` 与 `db/migrate.ts` 的路径推导依赖它
- **改了这三条契约**：`src/test/plugins.test.ts` 的「构建配置」那组断言会拦下来。
  它们守的是「部署能不能起来」，不是「配置好不好看」

---

## 加一个插件实现

**先读 `docs/TECH.md` §7**（插件协议），简短版：

1. 在对应的插件包里加一个文件，实现那条接缝的运行接口
2. 在同一个包的 `index.ts` 的 `install(host)` 里注册一行

| 接缝 | 包 | 运行接口 |
|---|---|---|
| `capturer` | `plugins/capturer/` | `matches(url)` / `run(url)` |
| `parser` | `plugins/parser/` | `accepts` / `parse(input)` |
| `leg` | `plugins/leg/` | `run(ctx)`，返回**已排序**的 id 列表 |
| `provider` | `plugins/provider/` | `supports(role)` / `adapter(role)` / `probe(role)` |

**不要改 `apps/server/src/` 下的任何文件。** 宿主不认识具体实现，编排层只认
`@mimir/shared` 里的接口。如果你发现必须改宿主，那是接缝缺了东西——
该修接缝，而不是让宿主多知道一点。

**状态别自己编**：在声明里写 `requires`（缺哪些键就不能干活）与
`unavailable()`（其它阻塞原因），状态由 core 算成四态之一（§7.4）。

**权重怎么定**：`defaultWeight` 是初始猜测，用户在设置页能覆盖
（关键词 1.0、子串 0.6、向量 0.8）。别把它当成最优值写死。

### parser 的输入是两类，不是一类

`ParseInput` 是判别联合（`packages/shared/src/seams.ts`）：

```ts
| { type: 'html' | 'markdown' | 'text'; content: string }
| { type: 'docx' | 'xlsx' | 'pptx'; data: Uint8Array; filename?: string }
```

文本类拿到的是**已经解码好的字符串**——字节→字符串的解码在宿主
（`lib/text.ts` 的 `decodeUploadedText`），因为解码会失败（GBK 编码的 txt），
而那个失败要变成一句人话。**不要在 parser 里做解码**。

字节类（Office）是 ZIP 容器，自己读里面的 XML。`plugins/parser/src/ooxml.ts`
是共用的底座（zip 读取 + XML 抽文字）。

**新增一种可提取的格式要动两处**：这里的 `accepts`，以及
`@mimir/shared/src/files.ts` 的 `parseTargetFor` / `parseSupport`——
后者决定「界面说这个格式有没有正文」。只改一处会出现「服务端提取出了正文、
而前端以为没有正文因而不显示」，那种 bug 看起来像数据丢了。

## 上传的原件（`lib/uploads.ts` + `services/upload.ts`）

上传件是**第二类有文件真相的文档**（笔记是第一类）。三条不能忘的：

1. **`meta.json` 是上传件的 frontmatter**。改了标题 / 标签 / 目录后要**写回**
   它（`services/documents.ts` 的 `updateNote` 已经在做），否则重建索引会读回
   旧值——用户加的标签静默消失
2. **提取这一步只有一份实现**（`services/extract.ts`）。上传与重建索引都要它，
   而两处对失败的处理不同（一个存 `parse_error`、一个打日志）。别抄第二份：
   抄了就会出现「上传时提取成功、重建后失败」这种取决于路径的行为差异
3. **`parse_error` 只记「真的试过并失败」的原因**。「这个格式还没有实现」
   由 `parseSupport()` 在界面层表达（`NULL` + `planned`）。混成一句是在说谎

---

## 改 vault 或写入路径时必须做的事

`src/lib/vault.ts` 与 `src/services/documents.ts` 有一处容易搞错的地方：
**文件写入必须先于数据库写入**，理由见根 `AGENTS.md` 铁律 2。

**上传件是第二条写入路径**，同样要遵守，且多两条（`lib/uploads.ts`）：
`原件 → meta.json → 数据库`，删除时反过来（**先库后文件**——
永远不要让指针存在的时候指向一个不存在的东西）。

新增任何写入路径后，跑一次「文件 → 数据库」的往返测试
（`src/test/vault-roundtrip.test.ts` 与 `upload.test.ts` 的「重建索引能把
上传件找回来」），它们验证的是「删掉数据库能从文件重建」。

---

## 测试

- 集成测试用 `app.request()` 内存调用，不占端口
- **必须用 `mimir_test` 库和 `data/.test/` 目录**。`global-setup.ts` 会校验库名，
  但目录不会——写错会污染真实 vault
- 新增检索相关的行为时，加一条能说明「用户会看到什么」的断言，
  而不是只断言函数返回值

---

## 数据库

- 改 schema 后跑 `pnpm db:generate`，**迁移文件要一起提交**
- 迁移里需要扩展（`pg_trgm` / `vector`）时，在 `src/db/migrate.ts` 里建，
  不要写进迁移 SQL——顺序反了会建索引失败
- `documents` 表上的两个 GIN 索引是检索的基础，改 schema 时不要漏掉
