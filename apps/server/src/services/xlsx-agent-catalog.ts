import { DOCX_CLIENT_TOOL_OUTPUT_SCHEMA } from '@mimir/shared'
import type { DocumentAgentCatalog } from './document-agent-catalog.js'
import type { ModelCallOptions } from './model.js'

const address = { type: 'string', pattern: '^[A-Z]{1,3}[1-9][0-9]{0,6}$' }
const range = {
  type: 'string',
  pattern: '^[A-Z]{1,3}[1-9][0-9]{0,6}(:[A-Z]{1,3}[1-9][0-9]{0,6})?$',
}
const value = { type: ['string', 'number', 'boolean', 'null'] }

const operationSchema = {
  type: 'object',
  required: ['op'],
  description:
    '使用 op 指定操作，不使用 type；除 add_sheet 外，sheetId 从 get_workbook_context 取得。',
  properties: {
    op: {
      type: 'string',
      enum: [
        'set_cell',
        'set_formula',
        'clear_cell',
        'set_range',
        'clear_range',
        'fill_range',
        'copy_range',
        'format_range',
        'insert_rows',
        'delete_rows',
        'insert_cols',
        'delete_cols',
        'merge_cells',
        'unmerge_cells',
        'set_row_height',
        'set_col_width',
        'set_rows_hidden',
        'set_cols_hidden',
        'rename_sheet',
        'add_sheet',
      ],
    },
    sheetId: {
      type: 'string',
      minLength: 1,
      description: '工作表 ID，例如 sheet-1；不是工作表名称',
    },
    address: { ...address, description: '单格地址，例如 B3' },
    value: { ...value, description: '单元格值；公式请用 set_formula' },
    expectedValue: value,
    formula: { type: 'string', pattern: '^=', description: '以 = 开头，例如 =SUM(A1:A3)' },
    expectedFormula: { type: 'string' },
    start: { ...address, description: 'set_range 左上角，例如 A1' },
    range: { ...range, description: '区域，例如 A1:B5' },
    values: {
      type: 'array',
      minItems: 1,
      maxItems: 500,
      items: { type: 'array', minItems: 1, maxItems: 100, items: value },
      description: '二维行数组，例如 [["甲", 1], ["乙", 2]]',
    },
    source: { ...range, description: '填充/复制的来源区域' },
    sourceSheetId: { type: 'string', minLength: 1, description: '可选；省略时使用目标工作表' },
    target: { ...range, description: '填充目标区域或复制目标左上角' },
    format: {
      type: 'object',
      minProperties: 1,
      description: '至少一个格式字段。颜色建议使用 #RRGGBB；图案/渐变填充暂不可用。',
      properties: {
        bold: { type: 'boolean' },
        italic: { type: 'boolean' },
        underline: { type: 'boolean' },
        strikethrough: { type: 'boolean' },
        fontFamily: { type: 'string' },
        fontSize: { type: 'number', minimum: 1, maximum: 409 },
        fontColor: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
        fillColor: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
        numberFormat: { type: 'string' },
        horizontalAlign: { type: 'string', enum: ['left', 'center', 'right'] },
        verticalAlign: { type: 'string', enum: ['top', 'center', 'bottom'] },
        wrapText: { type: 'boolean' },
        textRotation: { type: ['integer', 'string'], description: '-90 到 90 度，或 vertical' },
        indent: { type: 'integer', minimum: 0, maximum: 250 },
        border: {
          type: 'object',
          required: ['type'],
          properties: {
            type: { type: 'string', enum: ['all', 'top', 'bottom', 'left', 'right', 'none'] },
            color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
          },
        },
      },
    },
    row: { type: 'integer', minimum: 1, description: '从 1 开始的行号' },
    column: { type: 'string', pattern: '^[A-Z]{1,3}$', description: '列字母，例如 B' },
    count: { type: 'integer', minimum: 1, description: '行/列数量；宽高和隐藏操作默认 1' },
    heightPoints: { type: 'number', minimum: 2, maximum: 409, description: '行高，单位磅' },
    widthPx: { type: 'number', minimum: 10, maximum: 2000, description: '列宽，单位像素' },
    hidden: { type: 'boolean' },
    name: { type: 'string', minLength: 1, maxLength: 31, description: '新的工作表名称' },
  },
} as const

const tools = [
  {
    name: 'get_workbook_context',
    description: '读取当前未保存 XLSX 的工作表列表、当前选区与画布版本。编辑前先调用。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'read_range',
    description: '读取一个工作表中的矩形区域，最多 1000 个格子。range 使用 A1:B5 格式。',
    inputSchema: {
      type: 'object',
      required: ['range'],
      properties: { sheetId: { type: 'string' }, range: { type: 'string' } },
    },
  },
  {
    name: 'read_cells',
    description: '按地址读取至多 100 个单元格，包括文字和公式。',
    inputSchema: {
      type: 'object',
      required: ['addresses'],
      properties: {
        sheetId: { type: 'string' },
        addresses: { type: 'array', minItems: 1, maxItems: 100, items: { type: 'string' } },
      },
    },
  },
  {
    name: 'find_cells',
    description:
      '在当前未保存的 XLSX 全工作簿或指定工作表查找值和公式。普通文本不区分大小写；regex=true 用 JavaScript 正则；errors_only=true 查找缓存公式错误。返回工作表、地址、当前显示文字、公式及是否截断。公式缓存尚未重算。默认最多 50 项，最多 200 项。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '查找文字或正则；仅 errors_only=true 时可省略' },
        regex: { type: 'boolean' },
        look_in: { type: 'string', enum: ['values', 'formulas', 'both'] },
        sheetId: { type: 'string', description: '省略时搜索整个工作簿' },
        errors_only: { type: 'boolean' },
        max_results: { type: 'integer', minimum: 1, maximum: 200 },
      },
    },
  },
  {
    name: 'propose_operations',
    description:
      '修改当前未保存的 XLSX。operations 中每项使用 op，不使用 type。例：{"operations":[{"op":"set_cell","sheetId":"sheet-1","address":"B3","value":"Agent验收"}]}。必填字段：set_cell=address,value；set_formula=address,formula；clear_cell=address；set_range=start（或 range）,values；clear_range/format_range/merge_cells/unmerge_cells=range（format_range 另需 format，如 {"bold":true}）；fill_range/copy_range=source,target；insert_rows/delete_rows/set_row_height/set_rows_hidden=row（插入/删除另需 count，高度另需 heightPoints，隐藏另需 hidden）；insert_cols/delete_cols/set_col_width/set_cols_hidden=column（插入/删除另需 count，宽度另需 widthPx，隐藏另需 hidden）；rename_sheet=name；add_sheet=name（不支持自定 rows/columns）。除 add_sheet 外，以上均需 sheetId。范围写入最多 2000 格；copy_range 不支持筛选变体。填充/复制、行列、合并、尺寸及工作表管理操作须单独提交。其他上游操作尚未接入。先读取工作表和目标格。',
    inputSchema: {
      type: 'object',
      required: ['operations'],
      properties: {
        operations: { type: 'array', minItems: 1, maxItems: 50, items: operationSchema },
      },
    },
  },
].map((tool) =>
  Object.assign(tool, { outputSchema: DOCX_CLIENT_TOOL_OUTPUT_SCHEMA }),
) as unknown as NonNullable<ModelCallOptions['tools']>

export function xlsxAgentCatalog(): DocumentAgentCatalog {
  return {
    format: 'xlsx',
    systemPrompt:
      '你是 Mimir 的 XLSX 编辑助手。先读取当前未保存的工作簿和目标单元格。只使用工具描述中已接入的操作。工具失败、取消或版本冲突时不得声称已修改。修改只更新画布，用户需要手动保存。',
    tools,
    clientToolNames: new Set([
      'get_workbook_context',
      'read_range',
      'read_cells',
      'find_cells',
      'propose_operations',
    ]),
  }
}
