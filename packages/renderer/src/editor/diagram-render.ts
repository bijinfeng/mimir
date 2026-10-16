/// <reference types="./wavedrom" />

/**
 * Fenced diagram renderers adapted from GenOffice (Apache-2.0),
 * genspark-ai/genoffice@480548fd55f1be3593ee0d8e316a734751d58309
 * apps/markdown/src/renderer/editor/{mermaid,wavedrom}.ts.
 */
import DOMPurify from 'dompurify'

export type DiagramLanguage = 'mermaid' | 'wavedrom'
export type DiagramResult = { ok: true; svg: string } | { ok: false; error: string }

function stripExternalUrls(value: string): string {
  return value.replace(/url\s*\(\s*(['"]?)(.*?)\1\s*\)/gi, (match, _quote: string, url: string) =>
    url.trim().startsWith('#') ? match : 'none',
  )
}

export function diagramLanguage(language: unknown): DiagramLanguage | null {
  return language === 'mermaid' || language === 'wavedrom' ? language : null
}

let mermaidLoader: Promise<(typeof import('mermaid'))['default']> | undefined
let waveLoader: Promise<[typeof import('wavedrom'), typeof import('json5')]> | undefined
let renderSequence = 0

function loadMermaid() {
  mermaidLoader ??= import('mermaid').then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'default',
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      suppressErrorRendering: true,
      maxTextSize: 50_000,
    })
    return mermaid
  })
  return mermaidLoader
}

function loadWaveDrom() {
  waveLoader ??= Promise.all([import('wavedrom'), import('json5')]).then(([wave, json5]) => [
    wave,
    json5.default,
  ])
  return waveLoader
}

/** SVG is displayed as an isolated image; sanitization also removes external resources. */
export function sanitizeDiagramSvg(svg: string): string {
  const clean = DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ['use'],
    FORBID_TAGS: ['foreignObject', 'script', 'image', 'a', 'animate', 'set'],
  })
  const parsed = new DOMParser().parseFromString(clean, 'image/svg+xml')
  const root = parsed.documentElement
  if (root.localName !== 'svg' || parsed.querySelector('parsererror')) {
    throw new Error('图形渲染器没有返回有效的 SVG')
  }
  for (const element of [root, ...root.querySelectorAll('*')]) {
    // Snapshot the live NamedNodeMap before removing attributes.
    const attributes = Array.from(element.attributes)
    for (const attribute of attributes) {
      if (
        attribute.name.toLowerCase().startsWith('on') ||
        ((attribute.localName === 'href' || attribute.localName === 'src') &&
          !attribute.value.startsWith('#'))
      ) {
        element.removeAttributeNode(attribute)
      } else if (/url\s*\(/i.test(attribute.value)) {
        attribute.value = stripExternalUrls(attribute.value)
      }
    }
  }
  for (const style of root.querySelectorAll('style')) {
    // Styles stay inside <img>; imported styles and URL resources are unnecessary.
    style.textContent = stripExternalUrls(
      (style.textContent ?? '').replace(/@import[^;{}]*(?:;|$)/gi, ''),
    )
  }
  // Mermaid uses width="100%"; use its viewBox for the correct image aspect ratio.
  const box = root
    .getAttribute('viewBox')
    ?.trim()
    .split(/[\s,]+/)
    .map(Number)
  if (box?.length === 4 && box.every(Number.isFinite) && box[2]! > 0 && box[3]! > 0) {
    const scale = Math.min(1, 4096 / box[2]!, 4096 / box[3]!)
    root.setAttribute('width', String(box[2]! * scale))
    root.setAttribute('height', String(box[3]! * scale))
  }
  return new XMLSerializer().serializeToString(root)
}

function waveSource(source: string, parse: (text: string) => unknown): object {
  const parsed = parse(source)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('WaveDrom 需要包含 signal、assign 或 reg 数组的 WaveJSON 对象')
  }
  const record = parsed as Record<string, unknown>
  if (
    !['signal', 'assign', 'reg'].some((key) => Array.isArray(record[key]) && record[key].length)
  ) {
    throw new Error('WaveDrom 需要非空的 signal、assign 或 reg 数组')
  }
  return parsed
}

export async function renderDiagram(
  language: DiagramLanguage,
  source: string,
): Promise<DiagramResult> {
  try {
    if (!source.trim()) throw new Error('图形源码为空')
    if (source.length > 50_000) throw new Error('图形源码不能超过 50,000 个字符')
    let svg: string
    if (language === 'mermaid') {
      const mermaid = await loadMermaid()
      ;({ svg } = await mermaid.render(`mimir-mermaid-${++renderSequence}`, source))
    } else {
      const [wave, json5] = await loadWaveDrom()
      const parsed = waveSource(source, (text) => json5.parse(text) as unknown)
      const tree = wave.renderAny(++renderSequence, parsed, wave.waveSkin)
      if (tree[0] !== 'svg') throw new Error('WaveDrom 没有生成图形')
      svg = wave.onml.stringify(tree)
    }
    return { ok: true, svg: sanitizeDiagramSvg(svg) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
