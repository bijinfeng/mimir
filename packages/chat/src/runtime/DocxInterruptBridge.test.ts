import { describe, expect, it, vi } from 'vitest'
import type { ChatDocxAgent } from '../types.js'
import type { ChatIo } from './io.js'
import { executeDocxTool, executeWritingTool, executeBridgeTool } from './DocxInterruptBridge.js'

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

function createToolOptions(agent: ChatDocxAgent, input: unknown) {
  const created = vi.fn<(id: string) => void>()
  const create = vi.fn<NonNullable<ChatIo['createDocxDocument']>>(async (request) => ({
    documentId: 'new-doc',
    title: request.title,
    format: request.format,
    parseError: null,
  }))
  return {
    agent,
    tool: { name: 'create_document', input },
    roundId: 'create-round',
    expectedVersion: 3,
    signal: new AbortController().signal,
    batchChanged: false,
    revisionMode: false,
    createDocxDocument: create,
    requestMediaSource: async () => {
      throw new Error('unused')
    },
    setProgress: () => {},
    onCreatedDocument: created,
  }
}
describe('cross-format new document bridge', () => {
  it('uses the fixed upstream PDF default and preserves raw content without editing the canvas', async () => {
    const execute = vi.fn<ChatDocxAgent['execute']>()
    const value = createToolOptions(
      { ...handle(() => 3, execute), format: 'pdf' },
      { title: '报告', content: '<p><strong>内容</strong></p>' },
    )
    expect(await executeBridgeTool(value)).toMatchObject({
      ok: true,
      changed: false,
      version: 3,
      data: { format: 'pdf', documentId: 'new-doc' },
    })
    expect(value.createDocxDocument).toHaveBeenCalledWith(
      {
        documentId: 'doc-1',
        title: '报告',
        format: 'pdf',
        content: '<p><strong>内容</strong></p>',
      },
      expect.any(AbortSignal),
    )
    expect(execute).not.toHaveBeenCalled()
    expect(value.onCreatedDocument).toHaveBeenCalledWith('new-doc')
  })
  it('exports the current worksheet values as a file without leaking bytes into model output', async () => {
    const exportSheet = vi.fn<NonNullable<ChatDocxAgent['exportSheet']>>(async () => ({
      bytes: new Uint8Array([65, 44, 66]),
      mimeType: 'text/csv',
      fileName: '工作表.csv',
    }))
    const value = createToolOptions(
      {
        ...handle(
          () => 3,
          async () => ({}),
        ),
        format: 'xlsx',
        exportSheet,
      },
      { type: 'csv', sheetId: 'sheet-2' },
    )
    const result = await executeBridgeTool(value)
    expect(exportSheet).toHaveBeenCalledWith('csv', 'sheet-2')
    expect(value.createDocxDocument.mock.calls[0]?.[0]).toMatchObject({
      format: 'csv',
      title: '工作表',
      file: expect.any(File),
    })
    expect(JSON.stringify(result)).not.toContain('65,44,66')
    expect(result).toMatchObject({ ok: true, changed: false })
  })
  it('rejects stale exports before uploading and rejects content for worksheet exports', async () => {
    let version = 3
    const agent: ChatDocxAgent = {
      ...handle(
        () => version,
        async () => ({}),
      ),
      format: 'xlsx',
      exportSheet: async () => {
        version++
        return {
          bytes: new Uint8Array([1]),
          fileName: 'A.xlsx',
          mimeType: 'application/octet-stream',
        }
      },
    }
    const value = createToolOptions(agent, {})
    await expect(executeBridgeTool(value)).rejects.toThrow('导出期间文档已变化')
    expect(value.createDocxDocument).not.toHaveBeenCalled()
    version = 3
    await expect(
      executeBridgeTool(createToolOptions(agent, { content: 'new data' })),
    ).rejects.toThrow('不接受 content')
  })
  it('does not navigate after cancellation while the newly created file remains accessible', async () => {
    const controller = new AbortController()
    const value = createToolOptions(
      {
        ...handle(
          () => 3,
          async () => ({}),
        ),
        format: 'pdf',
      },
      { title: '新文件', content: '<p>内容</p>' },
    )
    value.signal = controller.signal
    value.createDocxDocument.mockImplementation(async () => {
      controller.abort()
      return { documentId: 'new-doc', title: '新文件', format: 'pdf', parseError: null }
    })
    await expect(executeBridgeTool(value)).rejects.toThrow('已保存到知识库')
    expect(value.onCreatedDocument).not.toHaveBeenCalled()
  })
})

it('forwards DOCX aspect choices and rejects invalid values before any generator call', async () => {
  const execute = vi.fn<ChatDocxAgent['execute']>(async () => ({
    ok: true,
    changed: true,
    version: 4,
  }))
  const generate = vi.fn<NonNullable<ChatIo['generateDocxImage']>>(async () => ({
    dataUrl: 'data:image/png;base64,cG5n',
    mimeType: 'image/png',
  }))
  const agent = handle(() => 3, execute),
    signal = new AbortController().signal
  await executeDocxTool(
    agent,
    { name: 'generate_image', input: { prompt: '海', aspectRatio: '4:3' } },
    'r',
    3,
    signal,
    generate,
  )
  expect(generate).toHaveBeenCalledWith('doc-1', '海', signal, '4:3')
  generate.mockClear()
  await expect(
    executeDocxTool(
      agent,
      { name: 'generate_image', input: { prompt: '海', aspectRatio: 'bogus' } },
      'r',
      3,
      signal,
      generate,
    ),
  ).rejects.toThrow(/Invalid option/)
  expect(generate).not.toHaveBeenCalled()
})

it('binds original PPTX attachments to the current tool request and rejects filename mismatch or source changes', async () => {
  let version = 3
  const execute = vi.fn<ChatDocxAgent['execute']>(async () => ({
    ok: true,
    changed: true,
    version: 4,
  }))
  const agent = { ...handle(() => version, execute), format: 'pptx' as const }
  const file = new File([new Uint8Array([1, 2, 3])], 'logo.png', { type: 'image/png' })
  const value = {
    ...createToolOptions(agent, { slideIndex: 0, url: 'attachment://logo.png' }),
    tool: { name: 'insert_web_image', input: { slideIndex: 0, url: 'attachment://logo.png' } },
    requestMediaSource: async () => file,
  }
  await executeBridgeTool(value)
  expect(execute).toHaveBeenCalledWith(
    'insert_web_image',
    value.tool.input,
    expect.objectContaining({
      expectedVersion: 3,
      attachments: [{ name: 'logo.png', mimeType: 'image/png', bytes: new Uint8Array([1, 2, 3]) }],
    }),
  )
  execute.mockClear()
  await expect(
    executeBridgeTool({
      ...value,
      requestMediaSource: async () => new File(['x'], 'other.png', { type: 'image/png' }),
    }),
  ).rejects.toThrow('logo.png')
  await expect(
    executeBridgeTool({
      ...value,
      requestMediaSource: async () => {
        version++
        return file
      },
    }),
  ).rejects.toThrow('已变化')
  expect(execute).not.toHaveBeenCalled()
})

it('analyzes original audio/video through the existing user-file IO with explicit visual/audio scope and no canvas edit', async () => {
  let version = 3
  const execute = vi.fn<ChatDocxAgent['execute']>()
  const agent = { ...handle(() => version, execute), format: 'pptx' as const }
  const file = new File(['video'], 'demo.mp4', { type: 'video/mp4' })
  const analyze = vi.fn<NonNullable<ChatIo['analyzeDocxMedia']>>(async () => ({
    text: '画面与音轨分析',
  }))
  const value = {
    ...createToolOptions(agent, {}),
    tool: {
      name: 'analyze_media',
      input: { kind: 'video', requirements: '总结', includeAudio: true },
    },
    requestMediaSource: async () => file,
    analyzeDocxMedia: analyze,
  }
  expect(await executeBridgeTool(value)).toMatchObject({
    ok: true,
    changed: false,
    data: { sourceName: 'demo.mp4', scope: 'visual_frames_and_audio', text: '画面与音轨分析' },
  })
  expect(analyze).toHaveBeenCalledWith(
    { documentId: 'doc-1', instruction: '总结', kind: 'video', source: file, includeAudio: true },
    value.signal,
  )
  expect(execute).not.toHaveBeenCalled()
  analyze.mockImplementationOnce(async () => {
    version++
    return { text: 'late' }
  })
  await expect(executeBridgeTool(value)).rejects.toThrow('已变化')
})
