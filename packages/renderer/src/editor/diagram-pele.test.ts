// @vitest-environment jsdom
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { renderDiagram } from './diagram-render'

// jsdom has no canvas; Pele uses its built-in text width fallback in this environment.
beforeAll(() => vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null))
afterAll(() => vi.restoreAllMocks())

const samples = [
  ['flowchart', 'flowchart LR\nA[开始] --> B[完成]', '开始'],
  [
    'long Chinese',
    'flowchart TD\nA[这是用于检查知识库中长中文标签换行与图表可读性的测试内容] --> B[完成]',
    '这是用于检查',
  ],
  [
    'sequence',
    'sequenceDiagram\nparticipant U as 用户\nparticipant S as 服务\nU->>S: 检索知识\nS-->>U: 返回结果',
    '检索知识',
  ],
  [
    'class',
    'classDiagram\nclass Document {\n+String title\n+save()\n}\nDocument --> Library',
    'Document',
  ],
  ['ER', 'erDiagram\nLIBRARY ||--o{ DOCUMENT : contains\nDOCUMENT {\nstring title\n}', 'LIBRARY'],
  ['state', 'stateDiagram-v2\n[*] --> Draft\nDraft --> Saved\nSaved --> [*]', 'Draft'],
  [
    'gantt',
    'gantt\ntitle 发布计划\ndateFormat YYYY-MM-DD\nsection 开发\n接入引擎 :a1, 2026-10-01, 2d\n验收 :after a1, 1d',
    '接入引擎',
  ],
  ['mindmap', 'mindmap\n  root((知识库))\n    文档\n    检索\n    对话', '知识库'],
  ['pie', 'pie title 文档来源\n"笔记" : 60\n"网页" : 40', '笔记'],
  ['subgraph', 'flowchart TB\nsubgraph 知识库\nA[笔记] --> B[检索]\nend\nB --> C[回答]', '笔记'],
  [
    'frontmatter',
    '---\ntitle: 知识检索\nconfig:\n  flowchart:\n    curve: linear\n---\nflowchart LR\nA[查询] --> B[结果]',
    '查询',
  ],
  [
    'init directive',
    '%%{init: {"theme":"dark","flowchart":{"curve":"linear"}}}%%\nflowchart LR\nA[查询] --> B[结果]',
    '查询',
  ],
] as const

it.each(samples)(
  'renders real Pele 1.6 %s syntax through the shared sanitizer',
  async (_name, source, label) => {
    const result = await renderDiagram('mermaid', source)
    if (!result.ok) throw new Error(result.error)
    expect(result.svg).toContain('<svg')
    expect(result.svg).toContain(label)
    expect(result.svg).not.toMatch(/foreignObject|<script|<image|<a\b/)
    const svg = new DOMParser().parseFromString(result.svg, 'image/svg+xml').documentElement
    expect(Number(svg.getAttribute('width'))).toBeGreaterThan(0)
    expect(Number(svg.getAttribute('height'))).toBeGreaterThan(0)
  },
)

it('disables real Pele click links before returning SVG', async () => {
  const result = await renderDiagram(
    'mermaid',
    'flowchart LR\nA[查询] --> B[结果]\nclick A "https://example.com" "外部链接"',
  )
  if (!result.ok) throw new Error(result.error)
  expect(result.svg).not.toMatch(/https:\/\/|<a\b/)
  expect(result.svg).toContain('查询')
})
