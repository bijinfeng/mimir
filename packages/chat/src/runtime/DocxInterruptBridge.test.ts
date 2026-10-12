import { describe, expect, it, vi } from 'vitest'
import type { ChatDocxAgent } from '../types.js'
import type { ChatIo } from './io.js'
import { executeDocxTool, executeWritingTool } from './DocxInterruptBridge.js'

function handle(version: () => number, execute: ChatDocxAgent['execute']): ChatDocxAgent {
  return {
    documentId: 'doc-1',
    getVersion: version,
    getContext: () => ({}),
    freezeSelection: () => ({ from: 0, to: 0, text: '' }),
    execute,
    undoRound: () => true,
  }
}

describe('DOCX 外部工具桥', () => {
  it('在网络请求前冻结版本，图片返回后按旧版本插入且不回传图片字节', async () => {
    let currentVersion = 2
    const execute = vi.fn<ChatDocxAgent['execute']>(async (_name, _input, options) => {
      if (options.expectedVersion !== currentVersion) throw new Error('画布已改变')
      return { ok: true, changed: true, version: 3, summary: '已插入图片' }
    })
    const agent = handle(() => currentVersion, execute)
    const generator = vi.fn<() => Promise<{ dataUrl: string; mimeType: string }>>(async () => {
      currentVersion = 3 // 人工编辑发生在生成图片期间
      return { dataUrl: 'data:image/png;base64,cG5n', mimeType: 'image/png' }
    })

    await expect(
      executeDocxTool(
        agent,
        { name: 'generate_image', input: { prompt: '蓝色海浪', maxWidthPx: 640 } },
        'round-1',
        2,
        new AbortController().signal,
        generator,
      ),
    ).rejects.toThrow('画布已改变')
    expect(generator).toHaveBeenCalledWith('doc-1', '蓝色海浪', expect.any(AbortSignal))
    expect(execute).toHaveBeenCalledWith(
      'generate_image',
      { dataUrl: 'data:image/png;base64,cG5n', mimeType: 'image/png', maxWidthPx: 640 },
      { expectedVersion: 2, roundId: 'round-1', signal: expect.any(AbortSignal) },
    )
  })

  it('普通块工具使用发送时的版本，而非中断到达时的新版本', async () => {
    const execute = vi.fn<ChatDocxAgent['execute']>(async () => ({ ok: true, changed: false }))
    const agent = handle(() => 8, execute)
    await expect(
      executeDocxTool(
        agent,
        {
          name: 'replace_blocks',
          input: { startBlockIndex: 1, endBlockIndex: 1, html: '<p>X</p>' },
        },
        'round-2',
        5,
        new AbortController().signal,
      ),
    ).rejects.toThrow('文档已在指令发送后变化')
    expect(execute).not.toHaveBeenCalled()
  })

  it('外链图片经受控下载后才传给 Office，期间人工编辑会被拒绝', async () => {
    let currentVersion = 1
    const execute = vi.fn<ChatDocxAgent['execute']>(async (_name, _input, options) => {
      if (options.expectedVersion !== currentVersion) throw new Error('画布已改变')
      return { ok: true, changed: true, version: 2 }
    })
    const fetchImage = vi.fn<() => Promise<{ dataUrl: string; mimeType: string }>>(async () => {
      currentVersion = 2
      return { dataUrl: 'data:image/png;base64,cG5n', mimeType: 'image/png' }
    })
    await expect(
      executeDocxTool(
        handle(() => currentVersion, execute),
        { name: 'insert_picture', input: { url: 'https://example.com/image.png', width: 120 } },
        'round-3',
        1,
        new AbortController().signal,
        undefined,
        false,
        fetchImage,
      ),
    ).rejects.toThrow('画布已改变')
    expect(execute.mock.calls[0]?.[1]).toEqual({
      dataUrl: 'data:image/png;base64,cG5n',
      mimeType: 'image/png',
      width: 120,
    })
  })
})

describe('DOCX 流式写作草稿', () => {
  it('逐段写入预览，完成后按发送时版本提交一次并复位修订模式', async () => {
    let draft = ''
    const commitDraft = vi.fn<NonNullable<ChatDocxAgent['commitDraft']>>(
      async (_roundId, options) => {
        expect(options?.expectedVersion).toBe(4)
        return { ok: true, changed: true, version: 5, summary: '已写入' }
      },
    )
    const modes: boolean[] = []
    const agent: ChatDocxAgent = {
      ...handle(
        () => 4,
        async () => ({}),
      ),
      getContext: () => ({ text: '尚未保存的画布正文' }),
      beginDraft: () => {
        draft = ''
      },
      appendDraft: (_id, delta) => {
        draft += delta
      },
      commitDraft,
      getDraft: () => draft,
      setRevisionMode: (mode) => {
        modes.push(mode)
      },
    }
    const write = vi.fn<NonNullable<ChatIo['writeDocxDocument']>>(
      async (_input, _signal, onDelta) => {
        onDelta('<p>第一段</p>')
        onDelta('<p>第二段</p>')
      },
    )
    const result = await executeWritingTool(
      agent,
      { instruction: '写两段' },
      'round-write',
      4,
      new AbortController().signal,
      write,
      true,
    )
    expect(draft).toBe('<p>第一段</p><p>第二段</p>')
    expect(write.mock.calls[0]?.[0]).toMatchObject({
      documentId: 'doc-1',
      context: '尚未保存的画布正文',
    })
    expect(commitDraft).toHaveBeenCalledOnce()
    expect(modes).toEqual([true, false])
    expect(result).toMatchObject({ changed: true, version: 5 })
  })

  it('流式失败时保留画布草稿供用户决定', async () => {
    let draft = ''
    const agent: ChatDocxAgent = {
      ...handle(
        () => 1,
        async () => ({}),
      ),
      beginDraft: () => {
        draft = ''
      },
      appendDraft: (_id, delta) => {
        draft += delta
      },
      getDraft: () => draft,
      commitDraft: vi.fn<NonNullable<ChatDocxAgent['commitDraft']>>(async () => ({ ok: true })),
    }
    await expect(
      executeWritingTool(
        agent,
        { instruction: '长文' },
        'round-write',
        1,
        new AbortController().signal,
        async (_input, _signal, onDelta) => {
          onDelta('半截草稿')
          throw new Error('连接中断')
        },
        false,
      ),
    ).rejects.toThrow('连接中断')
    expect(agent.getDraft?.('round-write')).toBe('半截草稿')
    expect(agent.commitDraft).not.toHaveBeenCalled()
  })
})
