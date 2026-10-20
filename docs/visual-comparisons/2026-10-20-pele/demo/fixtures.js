export const cases = {
  flowchart: {
    title: '中文流程与条件分支',
    source:
      'flowchart LR\n A[收集资料] --> B{需要整理？}\n B -->|是| C[补充标签]\n B -->|否| D[保存]\n C --> D',
  },
  chinese: {
    title: '长中文标签',
    source:
      'flowchart LR\n A[这是用于检查中文长标签在知识库阅读列中的显示情况的测试节点] --> B[整理完成后继续连接相关资料]',
  },
  sequence: {
    title: '时序与循环',
    source:
      'sequenceDiagram\n participant U as 用户\n participant S as 知识库\n U->>S: 检索资料\n loop 逐条核对\n S-->>U: 返回引用\n end',
  },
  class: {
    title: '类图',
    source:
      'classDiagram\n Document <|-- Note\n class Document {\n +String title\n +save() void\n }\n class Note {\n +edit() void\n }',
  },
  er: {
    title: '实体关系',
    source:
      'erDiagram\n DOCUMENT ||--o{ CITATION : contains\n DOCUMENT {\n string title\n }\n CITATION {\n string source\n }',
  },
  state: {
    title: '状态图',
    source:
      'stateDiagram-v2\n [*] --> Draft\n Draft --> Saved: 保存\n Saved --> Draft: 编辑\n Saved --> [*]',
  },
  gantt: {
    title: '甘特图',
    source:
      'gantt\n dateFormat YYYY-MM-DD\n section 资料整理\n 收集 :a, 2026-10-20, 2d\n 整理 :b, after a, 3d',
  },
  mindmap: {
    title: '思维导图',
    source: 'mindmap\n root((知识库))\n  收集\n   网页\n   文件\n  整理\n   标签\n   目录',
  },
  pie: { title: '饼图', source: 'pie title 资料来源\n "网页" : 40\n "文件" : 35\n "笔记" : 25' },
  subgraph: {
    title: '嵌套方向与分组',
    source:
      'flowchart LR\n subgraph S[整理流程]\n direction TB\n A[收集] --> B[归档]\n end\n B --> C[引用]',
  },
  frontmatter: {
    title: '图表 frontmatter 配置',
    source: '---\nconfig:\n  theme: dark\n---\nflowchart LR\n A[资料] --> B[知识]',
  },
  directive: {
    title: '图表 init 指令',
    source: '%%{init: {"theme":"dark"}}%%\nflowchart LR\n A[资料] --> B[知识]',
  },
  error: { title: '错误与源码修复', source: 'this is invalid mermaid' },
  wavedrom: {
    title: 'WaveDrom 回归',
    language: 'wavedrom',
    source: "{signal:[{name:'clk',wave:'p....'},{name:'data',wave:'x.34x',data:['收集','整理']}]}",
  },
  code: {
    title: '普通代码块回归',
    language: 'javascript',
    source: "const knowledge = ['收集', '整理']",
  },
}

export function markdownOf(id) {
  const fixture = cases[id] ?? cases.flowchart
  return `## ${fixture.title}\n\n${'```'}${fixture.language ?? 'mermaid'}\n${fixture.source}\n${'```'}\n`
}
