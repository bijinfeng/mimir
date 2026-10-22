import { afterEach, expect, it, vi } from 'vitest'

declare global {
  // eslint-disable-next-line no-var
  var __MIMIR_BASE_PATH__: string | undefined
}

afterEach(() => {
  delete globalThis.__MIMIR_BASE_PATH__
  vi.resetModules()
})

it.each([
  { runtime: '/app/mimir', prefix: '/app/mimir' },
  { runtime: '/', prefix: '' },
  { runtime: undefined, prefix: '' },
])('keeps pdf.js assets under the deployment prefix ($runtime)', async ({ runtime, prefix }) => {
  if (runtime !== undefined) globalThis.__MIMIR_BASE_PATH__ = runtime
  const { PDFJS_ASSETS } = await import('./pdfjs-assets')
  expect(PDFJS_ASSETS).toEqual({
    cmaps: `${prefix}/pdfjs/cmaps/`,
    standardFonts: `${prefix}/pdfjs/standard_fonts/`,
    wasm: `${prefix}/pdfjs/wasm/`,
  })
})
