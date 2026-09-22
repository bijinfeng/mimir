# @mimir/shared

前后端共享的契约层：zod schema + 推导出的 TypeScript 类型。

**为什么单独一个包**：API 的请求/响应形状只定义一次，服务端用它做运行时校验，
前端用同一份定义做类型。避免两边各写一遍类型然后慢慢漂移。

M0 只定义，不包含业务逻辑。

## 发布方式：源码，没有构建步骤

`exports` 直接指向 `src/index.ts`。这个包**不编译**——编译责任在使用方：

| 使用方 | 谁编译 |
|---|---|
| `apps/web`（开发与生产）| Vite |
| `apps/server`（开发）| tsx |
| `apps/server`（生产）| tsdown，打进 `dist` |

两个直接后果：

1. **不要给这个包加 `build` 脚本，也不要让别的脚本依赖它的产物。**
   加了就等于把编译时机重新变成一个需要排序的隐性约束。
2. **服务端不能 `tsc` 直出。** Node 不执行 `node_modules` 里的 `.ts`
   （`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`），所以 shared 的源码
   必须被编译进服务端产物。理由与取舍见 `docs/DECISIONS.md` D-023。

改 schema 后两侧都会立即生效，不需要任何重启或重建。
