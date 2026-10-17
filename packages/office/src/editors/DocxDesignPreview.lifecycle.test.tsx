/** @vitest-environment happy-dom */
import { act, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Editor } from '@tiptap/core'
import { afterEach, expect, it, vi } from 'vitest'
import { editorExtensions } from '../../vendor/apps/docs/src/renderer/editor/extensions.js'
import { openDocx } from '../docx.js'
import { DocxDesignPreview, DocxThemePreviewExtension } from './DocxDesignPreview.js'
import { designFixture } from './docx-design-test-fixture.js'

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))

it('skips all preview effects for a destroyed editor during StrictMode remount', async () => {
  const session = await openDocx(await designFixture())
  const editor = new Editor({
    extensions: [...editorExtensions, DocxThemePreviewExtension],
    content: session.content,
  })
  editor.destroy()
  expect(editor.isDestroyed).toBe(true)
  const host = document.createElement('div')
  document.body.append(host)
  const errors: unknown[] = []
  const root = createRoot(host, { onUncaughtError: (error) => errors.push(error) })
  const onError = vi.fn<(message: string) => void>()
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  cleanups.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  await act(async () => {
    root.render(
      <StrictMode>
        <DocxDesignPreview
          editor={editor}
          session={session}
          options={{}}
          sections={session.sections}
          dark={false}
          onError={onError}
        />
      </StrictMode>,
    )
  })
  expect(errors).toEqual([])
  expect(onError).not.toHaveBeenCalled()
  expect(host.querySelector('.mimir-docx-page-borders')).toBeNull()
})
