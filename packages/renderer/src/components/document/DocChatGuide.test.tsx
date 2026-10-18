import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { DocQuickAsks, QUICK_ASKS } from './DocChatGuide'

it('快捷问题直接交给发送入口，每次传入完整问题，不走编辑器预填', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const ask = vi.fn<(question: string) => void>()
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  try {
    await act(async () => root.render(<DocQuickAsks onAsk={ask} />))
    const buttons = host.querySelectorAll<HTMLButtonElement>('button')
    expect(buttons).toHaveLength(3)
    for (const [index, item] of QUICK_ASKS.entries()) {
      expect(buttons[index]?.textContent).toBe(item.label)
      await act(async () => buttons[index]!.click())
      expect(ask).toHaveBeenNthCalledWith(index + 1, item.question)
    }
    expect(host.querySelector('textarea')).toBeNull()
    expect(ask).toHaveBeenCalledTimes(3)
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})
