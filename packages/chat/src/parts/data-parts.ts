import type { Citation, FailureKind, Trace } from '@mimir/shared'
import { useAuiState } from '@assistant-ui/react'

/**
 * mimir 的三样业务数据在**消息 parts** 里的读取口。
 *
 * ## 它们是 data part，这一点是本次架构的支点
 *
 * trace / citations / failure 曾经是**另一条数据流**：服务端推自定义事件
 * → `use-mimir-chat-events` 收进 state → `RoundResult.tsx` 的 `resolveRound`
 * 按**位置**把实时那份与落库那份对齐（那个文件 80 行注释就是在解释为什么
 * 只能按位置、不能按 id）。现在两条路径同一个形状：
 *
 *  - 实时：服务端 CUSTOM 事件 → 引擎把它们变成 canonical data part
 *  - 历史：`runtime/history.ts` 把落库字段转成同名的 data part
 *
 * 于是「同一轮的结果」与「这条消息」不再需要对逻辑——消息在哪，依据就在哪。
 *
 * ## 为什么读 parts 而不是注册 data 渲染器
 *
 * 引擎提供了 `makeAssistantDataUI`（按 part 名注册渲染器），方案里也验证过
 * 它能命中。**这里不用它，因为位置对不上**：注册的渲染器在 **parts 顺序**
 * 里就地渲染，而服务端先发 CUSTOM（trace、引用）、后发正文——那一渲染顺序
 * 会把引用块放到**回答上方**。本仓的设计是「检索过程在回答上方、引用与
 * 失败在回答下方」（`docs/PRD.md` §5.2/§5.6，原型实测过的版式）。
 *
 * 想把注册渲染器摆回正确位置就得让消息根变成 flex 容器再用 order 重排，
 * 而 flex 会取消外边距折叠——正文里 `p { margin: 12px 0 }` 的段间距会从
 * 12px 变成 24px，整块 markdown 的节奏都跟着变。那是一次**看不见的排版
 * 改动**，而它的验证只能在浏览器里做。
 *
 * 所以走「按顺序显式渲染」：三个块是消息根的普通块级子元素，
 * markdown 的块仍是同一层（Parts 渲染 Fragment，不额外包 div）——
 * 版式与搬迁前逐像素一致，而顺序由 JSX 决定。
 *
 * ## 名字与服务端一致
 *
 * `mimir.trace` / `mimir.citations` / `mimir.failure` 与
 * `packages/shared/src/conversations.ts` 的 `EVENT_*` 常量同源，
 * 改名字只改那一处。
 */

/** 最后一个 `mimir.trace`（一轮会发两份：先检索份、后整轮份，后者覆盖前者） */
export function useTracePart(): Trace | null {
  return useAuiState((state) => {
    let found: Trace | null = null
    for (const part of state.message.parts) {
      if (part.type === 'data' && part.name === 'mimir.trace') {
        found = (part.data as { trace?: Trace }).trace ?? null
      }
    }
    return found
  })
}

/** 这一轮命中的引用（一条消息只有一份） */
export function useCitationsPart(): Citation[] {
  return useAuiState((state) => {
    for (const part of state.message.parts) {
      if (part.type === 'data' && part.name === 'mimir.citations') {
        return (part.data as { citations?: Citation[] }).citations ?? EMPTY
      }
    }
    return EMPTY
  })
}

/**
 * 失败分类。
 *
 * 落库**只存分类**（`packages/shared/src/conversations.ts` 的 messageSchema
 * 只有 text / trace / citations / failure），原始错误文本没有存——
 * 所以历史会话里的失败卡 `detail` 为空，退回 `FAILURE_UI` 的预设说明。
 * 这与搬迁前一致（那时 realtime 那份才有 `failureDetail`）。
 *
 * ## 选择器必须返回**状态里已存在的引用**（实测踩过：无限渲染，页面白屏）
 *
 * `useAuiState` 建立在 `useSyncExternalStore` 上，快照比较是 `Object.is`。
 * 第一版在这里的选择器里直接 `return { kind, detail }` ——字面量每次调用都是
 * 新对象，状态没变快照却「变了」，React 进入订阅-重渲染循环，报
 * `Maximum update depth exceeded` 并把整页交给错误边界（`<AssistantMessage>`
 * 一渲染就炸，带失败 part 的历史会话必现）。所以选择器只取 part.data
 * 这个**已存在的对象引用**，展示用的 `{ kind, detail }` 在选择器外组装——
 * 那里每次渲染新建对象没有关系。
 */
export function useFailurePart(): { kind: FailureKind; detail: string } | null {
  const data = useAuiState((state) => {
    for (const part of state.message.parts) {
      if (part.type === 'data' && part.name === 'mimir.failure') {
        return part.data as { failure?: FailureKind; message?: string }
      }
    }
    return null
  })

  if (data?.failure === undefined) return null
  return { kind: data.failure, detail: data.message ?? '' }
}

/** 这条消息的纯文本（正文，不含 data part） */
export function textOfParts(parts: readonly { type: string; text?: string }[]): string {
  let text = ''
  for (const part of parts) {
    if (part.type === 'text' && typeof part.text === 'string') text += part.text
  }
  return text
}

/** 空引用数组的稳定身份：每次返回新数组会让下游的依赖判断每次都变 */
const EMPTY: Citation[] = []
