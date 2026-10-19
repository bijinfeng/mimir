import type { AssistantRuntime, ThreadRuntime, RunConfig } from '@assistant-ui/react'

type Intent = { runConfig: RunConfig; attachments: readonly unknown[]; kind: 'composer' | 'append' }
type Freeze = (intent: Intent) => RunConfig

/** Research-only public API decorator. No core, queue, store, DOM or renderer mutation. */
export function guardRuntime(raw: AssistantRuntime, freeze: Freeze, rejected: (error: unknown) => void): AssistantRuntime {
  const threads = new WeakMap<object, ThreadRuntime>()
  function forward<T extends object>(target: T, overrides: Record<string, unknown>): T {
    const methods = new Map<PropertyKey, unknown>()
    return new Proxy(target, {
      get(object, key) {
        if (typeof key === 'string' && key in overrides) return overrides[key]
        const value = Reflect.get(object, key, object)
        if (typeof value !== 'function') return value
        if (!methods.has(key)) methods.set(key, value.bind(object))
        return methods.get(key)
      },
    })
  }
  function thread(t: ThreadRuntime): ThreadRuntime {
    const found = threads.get(t)
    if (found) return found
    const c = t.composer
    const composer = forward(c, {
      send: (options?: Parameters<typeof c.send>[0]) => {
        const state = c.getState()
        if (!state.canSend || state.submission) return
        try {
          c.setRunConfig(freeze({ kind: 'composer', runConfig: state.runConfig, attachments: state.attachments }))
        } catch (error) { rejected(error); return }
        return c.send(options)
      },
    })
    const wrapped = forward(t, {
      composer,
      append: (input: Parameters<typeof t.append>[0]) => {
        const message = typeof input === 'string' ? { content: [{ type: 'text' as const, text: input }] } : input
        if ((message.role ?? 'user') !== 'user') return t.append(input)
        try {
          const runConfig = freeze({ kind: 'append', runConfig: message.runConfig ?? {}, attachments: message.attachments ?? [] })
          return t.append({ ...message, runConfig })
        } catch (error) { rejected(error); return }
      },
    })
    threads.set(t, wrapped)
    return wrapped
  }
  const list = forward(raw.threads, {
    main: thread(raw.threads.main),
    getById: (id: string) => thread(raw.threads.getById(id)),
  })
  return forward(raw, { threads: list, thread: thread(raw.thread) })
}
