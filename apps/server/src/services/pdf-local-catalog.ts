/** Fixed GenOffice 480548fd PDF tools, sharing the working-copy local executor. */
const page = { type: 'integer', minimum: 1 },
  range = { type: 'string', minLength: 1, maxLength: 1000 },
  number = { type: 'number' },
  text = { type: 'string' },
  color = { type: 'string', pattern: '^#[a-fA-F0-9]{6}$' }
const tool = (
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[] = [],
) => ({
  name,
  description,
  inputSchema: { type: 'object', properties, required, additionalProperties: false },
})
export const pdfLocalTools = [
  tool(
    'replace_pages',
    '替换指定页面：会在当前编辑器请求用户选择来源 PDF 并确认继续。取消或版本变化保持画布。',
    { pages: range, source_pages: range },
    ['pages'],
  ),
  tool(
    'import_pages',
    '在指定页后插入另一份PDF选定页面，0为首页。请求用户选择来源PDF并确认继续。',
    { after_page: { type: 'integer', minimum: 0 }, source_pages: range },
    ['after_page'],
  ),
  tool(
    'insert_blank_page',
    '在当前工作副本插入与邻页同尺寸的空白页；after_page 0 为首页。需手动保存。',
    { after_page: { type: 'integer', minimum: 0 } },
    ['after_page'],
  ),
  tool(
    'set_page_size',
    '按比例将当前工作副本所有页调整至指定纸型，保留内容。preset 或 width/height 二选一。',
    {
      preset: { type: 'string', enum: ['A3', 'A4', 'A5', 'Letter', 'Legal'] },
      width: number,
      height: number,
    },
  ),
  tool(
    'crop_pages',
    '裁剪指定显示页面，left/top/right/bottom 为保留区域0–1比例。页码范围如1-3,5或all。',
    { pages: range, left: number, top: number, right: number, bottom: number },
    ['pages', 'left', 'top', 'right', 'bottom'],
  ),
  tool('extract_pages', '将当前工作副本指定页抽取为新PDF供下载，不改当前文件。', { pages: range }, [
    'pages',
  ]),
  tool(
    'split_pdf',
    '将当前工作副本按每份页数拆成多个新PDF供下载，不改当前文件。',
    { pages_per_file: page },
    ['pages_per_file'],
  ),
  tool(
    'split_pages',
    '将每页裁为2/4/9格，生成新PDF供下载。',
    { per_page: { type: 'integer', enum: [2, 4, 9] } },
    ['per_page'],
  ),
  tool(
    'merge_pages',
    '将当前工作副本每2–16页拼入一张纸，生成新PDF供下载。',
    {
      per_sheet: { type: 'integer', minimum: 2, maximum: 16 },
      direction: { type: 'string', enum: ['horizontal', 'vertical'] },
      separator: { type: 'boolean' },
    },
    ['per_sheet'],
  ),
  tool('get_outline', '读取当前工作副本原生PDF书签目录，返回标题、页码和层级。', {}),
  tool(
    'get_document_properties',
    '读取当前工作副本标题、作者、主题、关键词、水印、页眉页脚及绘图。',
    {},
  ),
  tool(
    'set_watermark',
    '替换每页文字水印，空文字清除此编辑器添加的水印。中文支持受字体覆盖限制。',
    {
      text,
      angle: number,
      opacity: { type: 'number', minimum: 0, maximum: 1 },
      color,
      size_ratio: { type: 'number', minimum: 0.02, maximum: 0.5 },
    },
    ['text'],
  ),
  tool('set_header_footer', '替换六槽页眉页脚；{page}/{total}为页码占位。省略槽位为空。', {
    ...Object.fromEntries(
      [
        'header_left',
        'header_center',
        'header_right',
        'footer_left',
        'footer_center',
        'footer_right',
      ].map((k) => [k, text]),
    ),
    page_number: { type: 'boolean' },
    start_at: { type: 'integer', minimum: 0 },
    font_size: number,
    color,
  }),
  tool(
    'add_form_mark',
    '添加静态矢量勾或叉，显示页左上角pt坐标；不会创建交互表单。',
    {
      page,
      kind: { type: 'string', enum: ['check', 'cross'] },
      anchor_text: text,
      placement: { type: 'string', enum: ['right', 'left', 'above', 'below'] },
      x: number,
      y: number,
      size: number,
      color,
    },
    ['page', 'kind'],
  ),
  tool(
    'set_metadata',
    '更新PDF标准文档属性，省略字段保留，空字符串清除。',
    {
      metadata: {
        type: 'object',
        properties: { title: text, author: text, subject: text, keywords: text },
        additionalProperties: false,
      },
    },
    ['metadata'],
  ),
  tool(
    'set_outline',
    '替换PDF原生书签目录。level0为顶层，每次只增一级，页码从1开始。',
    {
      entries: {
        type: 'array',
        maxItems: 500,
        items: {
          type: 'object',
          properties: { title: text, page, level: { type: 'integer', minimum: 0, maximum: 8 } },
          required: ['title', 'page'],
        },
      },
    },
    ['entries'],
  ),
]
