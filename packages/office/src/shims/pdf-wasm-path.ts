/**
 * GenOffice PDF's main-process writer expects Electron's resourcesPath as a
 * fallback. Mimir runs that writer in the authenticated server for both the
 * browser and desktop app, so the server resolves its deployed npm assets.
 * This module is Node-only and must never be imported by the browser editor.
 */
let paths: { pdfium: string; harfbuzz: string } | null = null

export function configurePdfWasmPaths(next: { pdfium: string; harfbuzz: string }): void {
  if (!next.pdfium || !next.harfbuzz) throw new Error('PDF WASM 资源路径未配置')
  paths = next
}

export function pdfiumWasmPath(): string {
  if (!paths) throw new Error('PDFium WASM 资源未就绪')
  return paths.pdfium
}

export function hbSubsetWasmPath(): string {
  if (!paths) throw new Error('HarfBuzz WASM 资源未就绪')
  return paths.harfbuzz
}
