import type { DocumentSummary } from '@mimir/shared'
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { MimirProvider } from '../../theme/MimirProvider'
import { getThemeMode, setThemeMode } from '../../theme/appearance'
import { FileFormatIcon, fileFormatOf } from './FileFormatIcon'

const file: Pick<DocumentSummary, 'kind' | 'mime' | 'fileExtension' | 'title'> = {
  kind: 'file',
  mime: 'application/octet-stream',
  fileExtension: null,
  title: '报告',
}

describe('approved Phosphor file formats', () => {
  it('keeps each supported file family and an unknown fallback', () => {
    for (const [extension, format] of [
      ['DOCX', 'word'],
      ['doc', 'word'],
      ['odt', 'word'],
      ['rtf', 'word'],
      ['xlsx', 'excel'],
      ['csv', 'excel'],
      ['ods', 'excel'],
      ['pptx', 'powerpoint'],
      ['odp', 'powerpoint'],
      ['pdf', 'pdf'],
      ['md', 'note'],
      ['htm', 'html'],
      ['png', 'image'],
      ['mp3', 'audio'],
      ['mp4', 'video'],
      ['7z', 'archive'],
      ['tsx', 'code'],
      ['txt', 'text'],
      ['bin', 'unknown'],
    ] as const)
      expect(fileFormatOf({ ...file, fileExtension: extension })).toBe(format)
  })

  it('recognizes MIME and existing filename fallbacks when an extension is unavailable', () => {
    for (const [mime, format] of [
      ['application/pdf', 'pdf'],
      ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'word'],
      ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'excel'],
      ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'powerpoint'],
      ['text/html', 'html'],
      ['text/markdown', 'note'],
      ['text/plain', 'text'],
      ['IMAGE/PNG', 'image'],
      ['audio/mpeg', 'audio'],
      ['video/mp4', 'video'],
      ['application/zip', 'archive'],
    ] as const)
      expect(fileFormatOf({ ...file, mime })).toBe(format)
    expect(fileFormatOf({ ...file, title: '报告.DOCX', mime: null })).toBe('word')
    expect(fileFormatOf({ ...file, title: '报告', mime: null })).toBe('unknown')
  })

  it('keeps note, web, WeChat and GitHub source identity before file-like metadata', () => {
    for (const kind of ['note', 'web', 'wechat', 'github'] as const)
      expect(
        fileFormatOf({
          ...file,
          kind,
          title: '说明.pdf',
          fileExtension: 'pdf',
          mime: 'application/pdf',
        }),
      ).toBe(kind)
  })

  it('renders only fixed static paths, never interpolating names or extensions into SVG', async () => {
    const malicious = '<image href="https://invalid.example/a" onerror="alert(1)"/>'
    await mount(<FileFormatIcon doc={{ ...file, title: malicious, fileExtension: malicious }} />)
    expect(host!.querySelector('[data-format="unknown"]')).not.toBeNull()
    expect(host!.querySelector('script,image,use,a')).toBeNull()
    expect(host!.innerHTML).not.toContain(malicious)
    expect(host!.innerHTML).not.toContain('invalid.example')
    expect(
      [...host!.querySelectorAll('svg *')].every(
        (element) => element.tagName.toLowerCase() === 'path',
      ),
    ).toBe(true)
  })
})

let root: ReturnType<typeof createRoot> | undefined
let host: HTMLDivElement | undefined
const originalMode = getThemeMode()

async function mount(children: ReactNode) {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(<MimirProvider>{children}</MimirProvider>))
}

afterEach(async () => {
  if (root) await act(async () => root!.unmount())
  root = undefined
  host?.remove()
  host = undefined
  setThemeMode(originalMode)
})

it('uses the approved theme colors without changing the 22px icon slot or creating a focus target', async () => {
  setThemeMode('light')
  await mount(<FileFormatIcon doc={{ ...file, fileExtension: 'docx' }} className="format-test" />)
  const icon = host!.querySelector<HTMLElement>('[data-format="word"]')!
  expect(icon.getAttribute('aria-hidden')).toBe('true')
  expect(icon.classList.contains('format-test')).toBe(true)
  expect(icon.querySelector('svg')?.getAttribute('focusable')).toBe('false')
  expect(icon.querySelector('path[opacity="0.2"]')).not.toBeNull()
  expect(icon.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 256 256')
  expect(icon.querySelector('svg')?.getAttribute('fill')).toBe('currentColor')
  expect(icon.querySelector('[tabindex],title')).toBeNull()
  expect(getComputedStyle(icon).width).toBe('22px')
  expect(getComputedStyle(icon).height).toBe('22px')
  expect(['#4c75a6', 'rgb(76, 117, 166)']).toContain(getComputedStyle(icon).color)
  await act(async () => setThemeMode('dark'))
  expect(['#8aafd6', 'rgb(138, 175, 214)']).toContain(getComputedStyle(icon).color)
  expect(getComputedStyle(icon).width).toBe('22px')
  expect(getComputedStyle(icon).height).toBe('22px')
})
