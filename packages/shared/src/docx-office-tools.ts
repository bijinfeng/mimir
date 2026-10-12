/** Local DOCX operations backed by the live Office editor. Names and fields follow
 * GenOffice 480548fd55f1be3593ee0d8e316a734751d58309; execution validates
 * the complete input before changing the document. */
const revisionSelector = {
  all: { type: 'boolean' },
  ids: { type: 'array', items: { type: 'string' } },
  author: { type: 'string' },
  type: { type: 'string', enum: ['insertion', 'deletion', 'formatting', 'move'] },
  blockIndex: { type: 'integer' },
  blockRange: { type: 'array', items: { type: 'integer' }, minItems: 2, maxItems: 2 },
  before: { type: 'string' },
} as const
const noteAnchor = {
  blockIndex: { type: 'integer' },
  afterText: { type: 'string' },
  text: { type: 'string' },
} as const
const empty = { type: 'object', properties: {}, required: [] } as const
const length = { type: ['string', 'number'] } as const
const blockIndexes = { type: 'array', items: { type: 'integer' }, minItems: 1 } as const
const opFields = {
  op: {
    type: 'string',
    enum: [
      'setFont',
      'setMatchedFont',
      'setParagraphFormat',
      'setHeadingLevel',
      'findReplace',
      'deleteBlocks',
      'moveBlocks',
      'setList',
      'clearList',
      'setImageProperties',
      'insertToc',
      'setParagraphAttrs',
      'setOutlineLevel',
      'stepIndent',
      'stepHangingIndent',
    ],
  },
  target: {
    type: 'object',
    description:
      'Required for most ops: {blockIndexes:[0,1]}. Optional for findReplace/setMatchedFont; setImageProperties targets image blocks.',
    properties: { blockIndexes, nodeType: { type: 'string', enum: ['image'] } },
  },
  blockIndexes: {
    ...blockIndexes,
    description: 'moveBlocks source indexes; use instead of target',
  },
  afterBlockIndex: {
    type: 'integer',
    description: 'moveBlocks/insertToc destination; -1 means document start',
  },
  text: { type: 'string', description: 'setMatchedFont exact matching text' },
  find: { type: 'string', description: 'findReplace search text' },
  replace: { type: 'string', description: 'findReplace replacement; empty string deletes match' },
  matchCase: { type: 'boolean', description: 'findReplace/setMatchedFont case matching' },
  bold: { type: 'boolean' },
  italic: { type: 'boolean' },
  underline: { type: 'boolean' },
  strike: { type: 'boolean' },
  color: { type: ['string', 'null'], description: 'setFont/setMatchedFont #RRGGBB; null clears' },
  highlight: { type: ['string', 'null'] },
  fontSize: { type: ['number', 'null'], description: 'Font size in points' },
  fontFamily: { type: ['string', 'null'] },
  baseline: { type: ['string', 'null'], enum: ['superscript', 'subscript', 'none', null] },
  link: { type: ['object', 'null'], properties: { url: { type: 'string' } } },
  align: {
    type: ['string', 'null'],
    description: 'Paragraph: left/center/right/justify; image: left/center/right',
  },
  lineSpacing: { type: ['number', 'null'] },
  indentLeft: { type: ['number', 'null'] },
  indentRight: { type: ['number', 'null'] },
  indentFirstLine: { type: ['number', 'null'] },
  spaceBefore: { type: ['number', 'null'] },
  spaceAfter: { type: ['number', 'null'] },
  pageBreakBefore: { type: 'boolean' },
  shadingFill: { type: ['string', 'null'] },
  borders: { type: ['string', 'null'] },
  level: { type: 'integer', description: 'Heading 0–6; outline 0–9' },
  kind: { type: 'string', enum: ['bullet', 'number'] },
  widthPx: { type: ['number', 'null'] },
  heightPx: { type: ['number', 'null'] },
  attrs: {
    type: 'object',
    description:
      'setParagraphAttrs patch of paragraph formatting only. Internal DOCX identity, XML, style, comment, and revision fields cannot be changed.',
    minProperties: 1,
    additionalProperties: false,
    properties: {
      align: { type: ['string', 'null'], enum: ['left', 'center', 'right', 'justify', null] },
      lineSpacing: { type: ['number', 'null'] },
      lineRule: { type: ['string', 'null'], enum: ['auto', 'atLeast', 'exact', null] },
      lineRawTwips: { type: ['number', 'null'] },
      snapToGrid: { type: ['boolean', 'null'] },
      indentLeft: { type: ['number', 'null'] },
      indentRight: { type: ['number', 'null'] },
      indentFirstLine: { type: ['number', 'null'] },
      spaceBefore: { type: ['number', 'null'] },
      spaceAfter: { type: ['number', 'null'] },
      spaceBeforeAuto: { type: ['boolean', 'null'] },
      spaceAfterAuto: { type: ['boolean', 'null'] },
      contextualSpacing: { type: ['boolean', 'null'] },
      pageBreakBefore: { type: 'boolean' },
      bidi: { type: 'boolean' },
      shadingFill: { type: ['string', 'null'] },
      borders: { type: ['string', 'null'] },
    },
  },
  delta: { type: 'integer', enum: [-1, 1], description: 'stepIndent/stepHangingIndent direction' },
} as const

export const DOCX_OFFICE_TOOLS = [
  {
    name: 'apply_ops',
    description:
      'Apply up to 50 validated formatting/structure operations atomically. Available ops: setFont, setMatchedFont, setParagraphFormat, setHeadingLevel, findReplace, deleteBlocks, moveBlocks, setList, clearList, setImageProperties, insertToc, setParagraphAttrs, setOutlineLevel, stepIndent, stepHangingIndent. Structural delete/move/TOC operations must run alone.',
    inputSchema: {
      type: 'object',
      properties: {
        ops: {
          type: 'array',
          minItems: 1,
          maxItems: 50,
          items: {
            type: 'object',
            properties: opFields,
            required: ['op'],
          },
        },
        dryRun: { type: 'boolean' },
      },
      required: ['ops'],
    },
  },
  {
    name: 'read_revisions',
    description: 'Read pending tracked revisions and their current positional IDs.',
    inputSchema: empty,
  },
  {
    name: 'accept_changes',
    description: 'Accept selected pending tracked revisions; only when requested by the user.',
    inputSchema: { type: 'object', properties: revisionSelector, required: [] },
  },
  {
    name: 'reject_changes',
    description: 'Reject selected pending tracked revisions; only when requested by the user.',
    inputSchema: { type: 'object', properties: revisionSelector, required: [] },
  },
  { name: 'read_comments', description: 'List comment threads and anchors.', inputSchema: empty },
  {
    name: 'reply_comment',
    description: 'Reply to a comment thread.',
    inputSchema: {
      type: 'object',
      properties: { parentId: { type: 'string' }, text: { type: 'string' } },
      required: ['parentId', 'text'],
    },
  },
  {
    name: 'resolve_comment',
    description: 'Resolve a comment thread.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'add_comment',
    description: 'Add a comment anchored to a block or exact text.',
    inputSchema: {
      type: 'object',
      properties: {
        blockIndex: { type: 'integer' },
        text: { type: 'string' },
        occurrence: { type: 'integer' },
        comment: { type: 'string' },
        author: { type: 'string' },
        initials: { type: 'string' },
      },
      required: ['blockIndex', 'comment'],
    },
  },
  {
    name: 'delete_comment',
    description: 'Delete a comment or thread.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, withReplies: { type: 'boolean' } },
      required: ['id'],
    },
  },
  {
    name: 'insert_footnote',
    description: 'Add a footnote after text in a block or at its end.',
    inputSchema: { type: 'object', properties: noteAnchor, required: ['blockIndex', 'text'] },
  },
  {
    name: 'insert_endnote',
    description: 'Add an endnote after text in a block or at its end.',
    inputSchema: { type: 'object', properties: noteAnchor, required: ['blockIndex', 'text'] },
  },
  {
    name: 'delete_note',
    description: 'Delete a footnote or endnote and its reference mark.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['footnote', 'endnote'] },
        id: { type: 'string' },
      },
      required: ['kind', 'id'],
    },
  },
  {
    name: 'edit_note',
    description: 'Replace exact text inside an existing footnote or endnote.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['footnote', 'endnote'] },
        id: { type: 'string' },
        find: { type: 'string' },
        replace: { type: 'string' },
        matchCase: { type: 'boolean' },
      },
      required: ['id', 'find', 'replace'],
    },
  },
  {
    name: 'read_notes',
    description: 'List footnotes and endnotes with IDs and anchors.',
    inputSchema: empty,
  },
  {
    name: 'insert_chart',
    description: 'Insert a native Word bar, line, or pie chart with real data.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['bar', 'line', 'pie'] },
        title: { type: 'string' },
        categories: { type: 'array', items: { type: 'string' } },
        series: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              values: { type: 'array', items: { type: ['number', 'null'] } },
            },
            required: ['values'],
          },
        },
        afterBlockIndex: { type: 'integer' },
      },
      required: ['kind', 'categories', 'series'],
    },
  },
  {
    name: 'edit_chart',
    description:
      'Edit title, categories, or values of an existing chart without changing data point counts.',
    inputSchema: {
      type: 'object',
      properties: {
        blockIndex: { type: 'integer' },
        title: { type: 'string' },
        categories: { type: 'array', items: { type: ['string', 'null'] } },
        series: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              index: { type: 'integer' },
              name: { type: 'string' },
              values: { type: 'array', items: { type: ['number', 'null'] } },
            },
            required: ['index'],
          },
        },
      },
      required: ['blockIndex'],
    },
  },
  {
    name: 'set_header_footer',
    description:
      'Set default, first-page, or even-page header/footer text. {PAGE} and {NUMPAGES} become page fields.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['header', 'footer'] },
        text: { type: 'string' },
        view: { type: 'string', enum: ['default', 'first', 'even'] },
      },
      required: ['kind', 'text'],
    },
  },
  {
    name: 'set_page_setup',
    description:
      'Change paper, orientation, margins, columns, or page numbering. Current editor supports a single-section source document.',
    inputSchema: {
      type: 'object',
      properties: {
        section: { type: 'integer' },
        blockIndex: { type: 'integer' },
        paper: { type: 'string' },
        width: length,
        height: length,
        orientation: { type: 'string', enum: ['portrait', 'landscape'] },
        margins: {
          type: 'object',
          properties: {
            top: length,
            right: length,
            bottom: length,
            left: length,
            header: length,
            footer: length,
            gutter: length,
          },
        },
        columns: {
          type: 'object',
          properties: { count: { type: 'integer' }, spacing: length },
          required: ['count'],
        },
        titlePg: { type: 'boolean' },
        pageNumberStart: { type: ['integer', 'null'] },
        pageNumberFormat: { type: 'string' },
      },
      required: [],
    },
  },
  {
    name: 'insert_section_break',
    description: 'Insert the first section break in a single-section source document.',
    inputSchema: {
      type: 'object',
      properties: {
        afterBlockIndex: { type: 'integer' },
        type: { type: 'string', enum: ['nextPage', 'continuous', 'evenPage', 'oddPage'] },
      },
      required: ['afterBlockIndex'],
    },
  },
  { name: 'list_styles', description: 'List document styles.', inputSchema: empty },
  {
    name: 'define_style',
    description: 'Create or update a paragraph, character, or table style.',
    inputSchema: {
      type: 'object',
      properties: {
        styleId: { type: 'string' },
        name: { type: 'string' },
        type: { type: 'string', enum: ['paragraph', 'character', 'table'] },
        basedOn: { type: ['string', 'null'] },
        next: { type: ['string', 'null'] },
        quickFormat: { type: 'boolean' },
        paragraph: {
          type: 'object',
          properties: {
            align: { type: ['string', 'null'], enum: ['left', 'center', 'right', 'justify', null] },
            spaceBefore: length,
            spaceAfter: length,
            lineSpacing: { type: ['number', 'null'] },
            indentLeft: length,
            indentRight: length,
            firstLineIndent: length,
            keepNext: { type: 'boolean' },
            keepLines: { type: 'boolean' },
            pageBreakBefore: { type: 'boolean' },
            outlineLevel: { type: ['integer', 'null'] },
          },
        },
        run: {
          type: 'object',
          properties: {
            bold: { type: 'boolean' },
            italic: { type: 'boolean' },
            underline: { type: 'boolean' },
            strike: { type: 'boolean' },
            caps: { type: 'boolean' },
            smallCaps: { type: 'boolean' },
            color: { type: ['string', 'null'] },
            highlight: { type: ['string', 'null'] },
            fontSize: { type: ['number', 'null'] },
            fontFamily: { type: ['string', 'null'] },
            eastAsiaFontFamily: { type: ['string', 'null'] },
          },
        },
      },
      required: ['styleId'],
    },
  },
  {
    name: 'insert_text_box',
    description: 'Insert a floating text box anchored after a block.',
    inputSchema: {
      type: 'object',
      properties: {
        afterBlockIndex: { type: 'integer' },
        text: { type: 'string' },
        width: length,
        height: length,
        x: length,
        y: length,
        anchor: { type: 'string', enum: ['paragraph', 'page'] },
        wrap: { type: 'string', enum: ['topAndBottom', 'none'] },
        fill: { type: ['string', 'null'] },
        borderColor: { type: ['string', 'null'] },
        fontSize: { type: 'number' },
        align: { type: 'string', enum: ['left', 'center', 'right', 'justify'] },
        bold: { type: 'boolean' },
        color: { type: 'string' },
      },
      required: ['text', 'width', 'height', 'x', 'y'],
    },
  },
] as const
