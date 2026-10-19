import { act, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  afterEach,
  expect,
  it,
} from '../../../../../packages/chat/node_modules/vitest/dist/index.js'
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  ThreadPrimitive,
  SuggestionPrimitive,
  useExternalStoreRuntime,
} from '@assistant-ui/react'
import type { AssistantRuntime, AppendMessage, ThreadMessageLike } from '@assistant-ui/react'
import { guardRuntime } from './runtime-facade'
import { freezeComposerIntent, readComposerIntent } from './composer-send-intent'
import type { ComposerToolbarState } from './composer-toolbar'
Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true,
  ResizeObserver: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
  IntersectionObserver: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
})
function renderSuggestion() {
  return (
    <SuggestionPrimitive.Trigger send id="suggest">
      Suggest
    </SuggestionPrimitive.Trigger>
  )
}
const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})
async function until(predicate: () => boolean) {
  for (let n = 0; n < 100; n++) {
    if (predicate()) return
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2))
    })
  }
  throw new Error('timeout')
}
async function setup(running = false, pending = false, queueEnabled = true) {
  let selected: ComposerToolbarState | undefined = {
    scope: 'A',
    deep: true,
    sidebar: false,
    searchOnly: false,
    documents: ['A', 'B', 'C'],
    documentsStatus: 'loaded',
    modelRoles: { chat: 'Qwen3', reasoning: 'DeepSeek R1' },
  }
  let runtime!: AssistantRuntime
  let release!: () => void
  let started = false
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const events: Array<{ lane: string; intent: ReturnType<typeof readComposerIntent> }> = []
  const errors: unknown[] = []
  function consume(lane: string, message: AppendMessage) {
    events.push({ lane, intent: readComposerIntent(message.runConfig) })
  }
  function Harness() {
    const raw = useExternalStoreRuntime<ThreadMessageLike>({
      messages: [],
      convertMessage: (message) => message,
      isRunning: running,
      suggestions: [{ prompt: 'suggested' }],
      adapters: {
        attachments: {
          accept: 'text/plain',
          async add({ file }) {
            return {
              id: 'file',
              type: 'document' as const,
              name: file.name,
              file,
              contentType: file.type,
              status: { type: 'requires-action' as const, reason: 'composer-send' as const },
            }
          },
          async send(attachment) {
            started = true
            if (pending) await gate
            return {
              ...attachment,
              status: { type: 'complete' as const },
              content: [{ type: 'text' as const, text: 'fixture' }],
            }
          },
          async remove() {},
        },
      },
      queue: queueEnabled
        ? {
            items: [],
            steerItems: [],
            enqueue(message) {
              consume('enqueue', message)
            },
            steer(message) {
              consume('steer', message)
            },
            move() {},
            edit() {},
            remove() {},
          }
        : undefined,
      async onNew(message) {
        consume('new', message)
      },
    })
    const [guarded] = useState(() =>
      guardRuntime(
        raw,
        ({ runConfig, kind }) => freezeComposerIntent(runConfig, selected, kind),
        (error) => errors.push(error),
      ),
    )
    useEffect(() => {
      runtime = guarded
    }, [guarded])
    return (
      <AssistantRuntimeProvider runtime={guarded}>
        <ComposerPrimitive.Root>
          <ComposerPrimitive.Input />
          <ComposerPrimitive.Send id="send">Send</ComposerPrimitive.Send>
        </ComposerPrimitive.Root>
        <ThreadPrimitive.Suggestions>{renderSuggestion}</ThreadPrimitive.Suggestions>
      </AssistantRuntimeProvider>
    )
  }
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(<Harness />)
  })
  cleanups.push(async () => {
    await act(async () => root.unmount())
    host.remove()
  })
  return {
    events,
    errors,
    host,
    runtime: () => runtime,
    select(scope: string, deep = false, sidebar = false) {
      selected = { ...selected!, scope, deep, sidebar }
    },
    notReady() {
      selected = undefined
    },
    release,
    started: () => started,
  }
}
it('actual official Send captures A before asynchronous attachment finalization, despite later C', async () => {
  const p = await setup(false, true)
  await act(async () => {
    await p
      .runtime()
      .thread.composer.addAttachment(new File(['fixture'], 'fixture.txt', { type: 'text/plain' }))
    p.runtime().thread.composer.setText('with file')
  })
  await act(async () => {
    ;(p.host.querySelector('#send') as HTMLButtonElement).click()
  })
  await until(p.started)
  p.select('C')
  expect(p.events).toHaveLength(0)
  await act(async () => p.release())
  await until(() => p.events.length === 1)
  expect(p.events).toEqual([
    { lane: 'enqueue', intent: { scope: 'A', deep: true, kind: 'composer' } },
  ])
})
it('running enqueue and steer consume independent A/B snapshots after draft moves to C', async () => {
  const p = await setup(true)
  await act(async () => {
    p.runtime().thread.composer.setText('one')
    p.runtime().thread.composer.send({ steer: false })
  })
  p.select('B')
  await act(async () => {
    p.runtime().thread.composer.setText('two')
    p.runtime().thread.composer.send({ steer: true })
  })
  p.select('C')
  expect(p.events).toEqual([
    { lane: 'enqueue', intent: { scope: 'A', deep: true, kind: 'composer' } },
    { lane: 'steer', intent: { scope: 'B', deep: false, kind: 'composer' } },
  ])
})
it('actual official suggestion uses append freeze; sidebar always false and rejected readiness keeps draft', async () => {
  const p = await setup(false, false, false)
  p.select('B', true, true)
  await act(async () => {
    ;(p.host.querySelector('#suggest') as HTMLButtonElement).click()
  })
  await until(() => p.events.length === 1)
  expect(p.events[0]).toEqual({ lane: 'new', intent: { scope: 'B', deep: false, kind: 'append' } })
  p.notReady()
  await act(async () => {
    p.runtime().thread.composer.setText('keep draft')
    p.runtime().thread.composer.send()
  })
  expect(p.runtime().thread.composer.getState().text).toBe('keep draft')
  expect(p.events).toHaveLength(1)
  expect(p.errors).toHaveLength(1)
})
