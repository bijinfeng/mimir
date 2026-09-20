# apps/web/AGENTS.md

前端的区域规则。根目录的 `AGENTS.md` 仍然适用，这里只写这一层特有的。

---

## 这一层的结构

```
src/
├── main.tsx         挂载点。ConfigProvider / AntApp / QueryClient 都在这里
├── router.tsx       路由实例（routeTree.gen.ts 是生成物，不要手改）
├── routes/          页面。根路由承担鉴权守卫
├── components/      可复用组件
├── editor/          Tiptap 扩展配置与保真测试
└── lib/             API 客户端 / Query 配置 / 路由 context
```

---

## 鉴权

守卫在 `routes/__root.tsx` 的 `beforeLoad`，**不在每个页面各写一遍**。

新增页面时不需要加守卫——但如果你要放行某个路径（比如回调页），
改的是那一处，而不是在页面里绕过。漏一个未鉴权页面在自托管暴露公网时
等于把整个知识库交出去。

---

## React Compiler

已开启。它会在构建期自动插入记忆化，所以**不要手写 `useMemo` / `useCallback` / `memo`**——
写了也不会更差，但会让人以为需要它们。

两条必须遵守的规则：

### 不要抑制 React 规则

抑制 hook 规则会让编译器**跳过整个组件**，而且不报错。正确做法是改代码结构。

### 只读一次的初始值用 ref 承接

```ts
// ✗ 放进依赖数组 → 每次保存回写都重建实例（编辑器会丢光标）
// ✗ eslint-disable 排除 → React Compiler 跳过整个组件
// ✓ ref 快照：符合 Rules of React，且只在挂载时取一次
const initialBodyRef = useRef(doc.body)
useEffect(() => {
  const editor = new Editor({ content: initialBodyRef.current, ... })
  return () => editor.destroy()
}, [])
```

**ref 的声明顺序必须在用它的 effect 之前**，否则报
`react-compiler(Immutability)` 并静默跳过优化。

想看编译器有没有跳过某个组件，把 `vite.config.ts` 的 `compiler.logDiagnostics`
打开构建一次。

---

## 编辑器

Tiptap 的 markdown 往返**不是无损的，但是幂等的**——首次保存会把内容整理成
编辑器的规范形，之后不再变化。改 `editor/extensions.ts` 后必须跑
`pnpm test`，`drift.test.ts` 会验证幂等性没被破坏。

**扩展不要重复引入**：`StarterKit` 已经内置 `codeBlock` 与 `link`。
重复引入会触发 `Duplicate extension names` 警告，且配置会被其中一份覆盖——
不报错，只是行为不对。

---

## 调后端

API 客户端在 `lib/api.ts`。三条约定：

1. 一律 `credentials: 'include'`——鉴权走 cookie
2. 服务端错误外壳统一是 `{ error: { code, message } }`，抛 `ApiRequestError`，
   调用方只需要 catch 一种形状
3. 请求/响应的类型从 `@mimir/shared` 来，**不要在前端重新定义一遍**

改了 API 契约要先改 `packages/shared`，那是前后端唯一的真相来源。

---

## 样式

组件样式走 antd 的 token（`ConfigProvider` 里配），不新引入 CSS 方案。
`styles/global.css` 只放三件事：重置、字体、编辑器正文排版。
