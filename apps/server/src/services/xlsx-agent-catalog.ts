import { DOCX_CLIENT_TOOL_OUTPUT_SCHEMA } from '@mimir/shared'
import type { DocumentAgentCatalog } from './document-agent-catalog.js'
import type { ModelCallOptions } from './model.js'
import {
  PATTERN_TYPES,
  THEME_SLOT_NAMES,
} from '../../../../packages/office/vendor/packages/xlsx-gateway/src/domain/style-color.js'

const address = { type: 'string', pattern: '^[A-Z]{1,3}[1-9][0-9]{0,6}$' }
const range = {
  type: 'string',
  pattern: '^[A-Z]{1,3}[1-9][0-9]{0,6}(:[A-Z]{1,3}[1-9][0-9]{0,6})?$',
}
const value = { type: ['string', 'number', 'boolean', 'null'] }
const fillColorSchema = {
  anyOf: [
    { type: 'string', description: '#RRGGBB or theme shorthand, e.g. accent1+40%' },
    {
      type: 'object',
      required: ['theme'],
      properties: {
        theme: {
          anyOf: [
            { type: 'integer', minimum: 0, maximum: 11 },
            { type: 'string', enum: THEME_SLOT_NAMES },
          ],
        },
        tint: { type: 'number', minimum: -1, maximum: 1 },
      },
    },
  ],
}
const fillSchema = {
  anyOf: [
    { type: 'null' },
    {
      type: 'object',
      required: ['pattern', 'fg'],
      properties: {
        pattern: { type: 'string', enum: PATTERN_TYPES },
        fg: fillColorSchema,
        bg: fillColorSchema,
      },
    },
    {
      type: 'object',
      required: ['gradient'],
      properties: {
        gradient: {
          type: 'object',
          required: ['stops'],
          properties: {
            type: { type: 'string', enum: ['linear', 'path'] },
            angle: { type: 'number', minimum: 0, maximum: 360 },
            ...Object.fromEntries(
              ['left', 'right', 'top', 'bottom'].map((edge) => [
                edge,
                { type: 'number', minimum: 0, maximum: 1 },
              ]),
            ),
            stops: {
              type: 'array',
              minItems: 2,
              maxItems: 10,
              items: {
                type: 'object',
                required: ['position', 'color'],
                properties: {
                  position: { type: 'number', minimum: 0, maximum: 1 },
                  color: fillColorSchema,
                },
              },
            },
          },
        },
      },
    },
  ],
}

const operationSchema = {
  type: 'object',
  required: ['op'],
  description:
    '使用 op 指定操作，不使用 type；除 add_sheet/add_defined_name/delete_defined_name 外，sheetId 从 get_workbook_context 取得。',
  properties: {
    op: {
      type: 'string',
      enum: [
        'add_chart',
        'edit_chart',
        'add_shape',
        'edit_shape',
        'add_image',
        'delete_visual',
        'add_table',
        'add_table_row',
        'delete_table_row',
        'add_table_column',
        'delete_table_column',
        'delete_table',
        'add_pivot',
        'refresh_pivot',
        'set_cell',
        'set_formula',
        'clear_cell',
        'set_range',
        'clear_range',
        'fill_range',
        'copy_range',
        'convert_to_values',
        'set_hyperlink',
        'set_note',
        'protect_sheet',
        'add_conditional_format',
        'clear_conditional_formats',
        'set_data_validation',
        'add_defined_name',
        'delete_defined_name',
        'set_page_setup',
        'set_freeze',
        'add_sparkline',
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
        'delete_sheet',
        'duplicate_sheet',
        'set_sheet_hidden',
        'move_sheet',
        'sort_range',
        'find_replace',
        'set_filter',
        'clear_filter',
        'set_filter_criteria',
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
      type: ['array', 'null'],
      minItems: 1,
      maxItems: 500,
      items: {
        anyOf: [
          { type: 'array', minItems: 1, maxItems: 100, items: value },
          { type: 'string' },
          {
            type: 'object',
            required: ['field', 'agg'],
            properties: {
              field: { type: 'string' },
              agg: { type: 'string', enum: ['sum', 'count', 'average', 'max', 'min'] },
              numFmt: { type: 'string' },
              showDataAs: {
                type: 'string',
                enum: ['percentOfTotal', 'percentOfRow', 'percentOfCol'],
              },
              formula: { type: 'string' },
            },
          },
        ],
      },
      description: '二维行数组，例如 [["甲", 1], ["乙", 2]]',
    },
    source: { ...range, description: '填充/复制的来源区域' },
    sourceSheetId: { type: 'string', minLength: 1, description: '可选；省略时使用目标工作表' },
    target: {
      type: ['string', 'null'],
      description: '填充/复制目标范围；set_hyperlink 为URL或#Sheet!A1，null删除',
    },
    filterColumn: {
      type: 'string',
      pattern: '^[A-Za-z]{1,3}$',
      description: 'copy_range筛选匹配列（源范围内的列字母）',
    },
    filterValues: {
      type: 'array',
      items: { type: 'string' },
      maxItems: 100,
      description: 'copy_range保留的匹配值；与filterColumn一起提供',
    },
    text: {
      type: ['string', 'null'],
      maxLength: 32000,
      description: 'set_note 批注正文，null删除',
    },
    ref: {
      type: 'string',
      description: 'add_defined_name的公式或工作表限定引用，如 工作表!$A$1:$B$5',
    },
    rows: { type: 'integer', minimum: 0, maximum: 100, description: 'set_freeze冻结顶部行数' },
    columns: { type: 'integer', minimum: 0, maximum: 100, description: 'set_freeze冻结左侧列数' },
    chartType: {
      type: 'string',
      enum: ['column', 'bar', 'line', 'area', 'pie', 'doughnut', 'scatter', 'radar', 'combo'],
    },
    chartPath: { type: 'string', description: 'read_sheet_features返回的图表原件路径' },
    title: { type: 'string', maxLength: 255 },
    anchorCell: address,
    shapeType: {
      type: 'string',
      description: 'DrawingML形状名，如rect/roundRect/ellipse/triangle/diamond/textbox',
    },
    fillColor: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
    path: { type: 'string', description: '公开HTTP(S)的PNG/JPEG/GIF图片网址；禁止本机路径' },
    visualId: {
      type: 'string',
      description: 'read_sheet_features返回的对象ID；图表也可用chartPath',
    },
    tableName: { type: 'string' },
    columnName: { type: 'string' },
    style: { type: 'string', description: 'TableStyleMedium2等内置表格样式' },
    bandedRows: { type: 'boolean' },
    sourceRange: range,
    targetSheetId: { type: 'string' },
    rowFields: {
      anyOf: [
        { type: 'string' },
        { type: 'array', minItems: 1, maxItems: 8, items: { type: 'string' } },
      ],
    },
    columnField: {
      anyOf: [
        { type: 'string' },
        { type: 'array', minItems: 1, maxItems: 8, items: { type: 'string' } },
      ],
    },
    pageFields: { type: 'array', maxItems: 4, items: { type: 'string' } },
    groupings: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'object',
        required: ['kind', 'field'],
        properties: {
          kind: { type: 'string', enum: ['date', 'range'] },
          field: { type: 'string' },
          dateUnit: { type: 'string', enum: ['year', 'quarter', 'month'] },
          rangeStep: { type: 'number', exclusiveMinimum: 0 },
          rangeStart: { type: 'number' },
        },
      },
    },
    filters: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'object',
        required: ['kind', 'field', 'op'],
        properties: {
          kind: { type: 'string', enum: ['label', 'value'] },
          field: { type: 'string' },
          op: {
            type: 'string',
            enum: ['equal', 'contains', 'beginsWith', 'top', 'greaterThan', 'between'],
          },
          value: { type: 'string' },
          valueIndex: { type: 'integer', minimum: 0, maximum: 7 },
          count: { type: 'integer', minimum: 1, maximum: 10000 },
          from: { type: 'number' },
          to: { type: 'number' },
        },
      },
    },
    legend: { type: 'string', enum: ['none', 'right', 'bottom', 'top', 'left'] },
    dataLabels: { type: 'string', enum: ['none', 'value', 'percent', 'category-percent'] },
    grouping: { type: 'string', enum: ['clustered', 'stacked', 'percentStacked'] },
    axisTitles: {
      type: 'object',
      properties: { category: { type: ['string', 'null'] }, value: { type: ['string', 'null'] } },
    },
    seriesColors: { type: 'object', additionalProperties: { type: 'string' } },
    seriesData: {
      type: 'array',
      items: {
        type: 'object',
        required: ['index'],
        properties: {
          index: { type: 'integer' },
          name: { type: 'string' },
          valuesRange: range,
          categoriesRange: range,
          sheetId: { type: 'string' },
        },
      },
    },
    dataRange: range,
    targetCell: address,
    type: {
      type: 'string',
      enum: ['line', 'column', 'stacked'],
      description: 'add_sparkline迷你图类型',
    },
    color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
    orientation: { type: 'string', enum: ['portrait', 'landscape'] },
    paperSize: { type: 'integer', minimum: 1, maximum: 118 },
    scale: { type: 'integer', minimum: 10, maximum: 400 },
    fitToWidth: { type: 'integer', minimum: 0, maximum: 1000 },
    fitToHeight: { type: 'integer', minimum: 0, maximum: 1000 },
    margins: { type: 'string', enum: ['normal', 'wide', 'narrow'] },
    printGridlines: { type: 'boolean' },
    printHeadings: { type: 'boolean' },
    printArea: { type: ['string', 'null'] },
    printTitles: { type: ['string', 'null'] },
    header: {
      type: ['object', 'null'],
      properties: {
        left: { type: 'string' },
        center: { type: 'string' },
        right: { type: 'string' },
      },
    },
    footer: {
      type: ['object', 'null'],
      properties: {
        left: { type: 'string' },
        center: { type: 'string' },
        right: { type: 'string' },
      },
    },
    rowBreaks: { type: 'array', items: { type: 'integer', minimum: 1, maximum: 1048575 } },
    colBreaks: { type: 'array', items: { type: 'integer', minimum: 1, maximum: 16383 } },
    rule: {
      type: 'object',
      required: ['kind'],
      description:
        '条件格式规则。number用operator/value/可选value2；text用operator/text；blank用blank；duplicate可unique；top10用rank；formula用formula；以上需format。colorScale用minColor/maxColor；dataBar可color。',
      properties: {
        kind: {
          type: 'string',
          enum: [
            'number',
            'text',
            'blank',
            'duplicate',
            'top10',
            'formula',
            'colorScale',
            'dataBar',
          ],
        },
        operator: {
          type: 'string',
          enum: [
            'greaterThan',
            'greaterThanOrEqual',
            'lessThan',
            'lessThanOrEqual',
            'equal',
            'notEqual',
            'between',
            'notBetween',
            'contains',
            'notContains',
            'beginsWith',
            'endsWith',
          ],
        },
        value: { type: 'number' },
        value2: { type: 'number' },
        text: { type: 'string' },
        blank: { type: 'boolean' },
        unique: { type: 'boolean' },
        rank: { type: 'integer' },
        percent: { type: 'boolean' },
        bottom: { type: 'boolean' },
        formula: { type: 'string' },
        format: {
          type: 'object',
          properties: {
            fillColor: { type: 'string' },
            fontColor: { type: 'string' },
            bold: { type: 'boolean' },
            italic: { type: 'boolean' },
          },
        },
        minColor: { type: 'string' },
        midColor: { type: 'string' },
        maxColor: { type: 'string' },
        color: { type: 'string' },
      },
    },
    validation: {
      type: ['object', 'null'],
      description:
        '数据验证；null清除精确范围。list用values；listRef用range；numberBetween用min/max；dateBetween用start/end（ISO日期）；checkbox为0/1列表；formula用formula。',
      properties: {
        kind: {
          type: 'string',
          enum: ['list', 'listRef', 'numberBetween', 'dateBetween', 'checkbox', 'formula'],
        },
        values: { type: 'array', items: { type: 'string' } },
        range,
        min: { type: 'number' },
        max: { type: 'number' },
        start: { type: 'string' },
        end: { type: 'string' },
        formula: { type: 'string' },
      },
    },
    protected: { type: 'boolean', description: 'protect_sheet：true保护，false取消无密码保护' },
    format: {
      type: 'object',
      minProperties: 1,
      description:
        '至少一个格式字段。fill支持图案和渐变，颜色支持主题及tint；fill:null清除，省略保持，同操作fill优先于fillColor。',
      properties: {
        bold: { type: 'boolean' },
        italic: { type: 'boolean' },
        underline: { type: 'boolean' },
        strikethrough: { type: 'boolean' },
        fontFamily: { type: 'string' },
        fontSize: { type: 'number', minimum: 1, maximum: 409 },
        fontColor: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
        fillColor: { anyOf: [...fillColorSchema.anyOf, { type: 'null' }] },
        fill: fillSchema,
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
    column: { type: ['string', 'integer'], pattern: '^[A-Z]{1,3}$', description: '列字母，例如 B' },
    count: { type: 'integer', minimum: 1, description: '行/列数量；宽高和隐藏操作默认 1' },
    heightPoints: { type: 'number', minimum: 2, maximum: 409, description: '行高，单位磅' },
    widthPx: { type: 'number', minimum: 10, maximum: 2000, description: '列宽，单位像素' },
    hidden: { type: 'boolean' },
    name: {
      type: 'string',
      minLength: 1,
      maxLength: 255,
      description: '工作表名称最多31字符；命名范围名称最多255字符',
    },
    find: { type: 'string', minLength: 1 },
    replace: { type: 'string' },
    matchCase: { type: 'boolean' },
    wholeCell: { type: 'boolean' },
    byColumn: { type: 'string', pattern: '^[A-Z]{1,3}$' },
    order: { type: 'string', enum: ['asc', 'desc'] },
    hasHeader: { type: 'boolean' },
    position: { type: 'integer', minimum: 1, description: 'move_sheet 的目标页签位置，从 1 开始' },
  },
} as const

const tools = [
  {
    name: 'create_document',
    description:
      '创建新文件。默认xlsx；xlsx/csv将指定sheetId（默认当前工作表）的当前显示值导出成单表，不带公式和格式，禁止content。docx/pdf/md/html使用title和content创建新知识库文件。不会隐式保存或替换当前工作簿。',
    inputSchema: {
      type: 'object',
      properties: {
        format: {
          type: 'string',
          enum: ['xlsx', 'csv', 'docx', 'pdf', 'md', 'html'],
          default: 'xlsx',
        },
        title: { type: 'string', maxLength: 255 },
        sheetId: { type: 'string' },
        content: { type: 'string' },
      },
    },
  },
  {
    name: 'get_workbook_context',
    description: '读取当前未保存 XLSX 的工作表列表、当前选区与画布版本。编辑前先调用。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'read_range',
    description: '读取一个工作表中的矩形区域，最多 2000 个格子。range 使用 A1:B5 格式。',
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
    name: 'aggregate_range',
    description:
      '汇总当前未保存范围的非空、不同值、频数、数字总和/均值/最小/最大。最多100万格；公式使用缓存值并可能过期。',
    inputSchema: {
      type: 'object',
      required: ['range'],
      properties: {
        sheetId: { type: 'string' },
        range,
        topValues: { type: 'integer', minimum: 0, maximum: 50 },
      },
    },
  },
  {
    name: 'load_guide',
    description:
      '读取已接入操作的参数与限制指南。可用 writing、formatting、structure、data、formulas、charts、table、pivot。',
    inputSchema: {
      type: 'object',
      required: ['guides'],
      properties: {
        guides: {
          type: 'array',
          minItems: 1,
          maxItems: 8,
          items: {
            type: 'string',
            enum: [
              'writing',
              'formatting',
              'structure',
              'data',
              'formulas',
              'charts',
              'table',
              'pivot',
            ],
          },
        },
      },
    },
  },
  {
    name: 'read_formats',
    description: '读取当前未保存范围的已解析字形、字体、颜色、数字格式、对齐、边框。最多200格。',
    inputSchema: {
      type: 'object',
      required: ['range'],
      properties: { sheetId: { type: 'string' }, range },
    },
  },
  {
    name: 'read_sheet_features',
    description:
      '读取当前未保存工作表的自动筛选、条件格式、验证、合并、冻结、保护、打印、链接、图形/表格关系及工作簿命名范围。图形/表格只返回关系引用。',
    inputSchema: { type: 'object', properties: { sheetId: { type: 'string' } } },
  },
  {
    name: 'select_range',
    description: '选择并高亮当前工作表的范围；不修改原件。最多2000格。',
    inputSchema: {
      type: 'object',
      required: ['range'],
      properties: { sheetId: { type: 'string' }, range },
    },
  },
  ...(['trace_precedents', 'trace_dependents'] as const).map((name) => ({
    name,
    description:
      name === 'trace_precedents'
        ? '读取公式直接引用的A1单元格/范围和缓存值。命名范围、外部及动态引用不展开，返回限制。'
        : '查找工作簿中直接引用目标单元格的公式。命名范围、外部及动态引用不展开，返回限制。',
    inputSchema: {
      type: 'object',
      required: ['address'],
      properties: { sheetId: { type: 'string' }, address },
    },
  })),
  {
    name: 'propose_operations',
    description:
      '修改当前未保存的 XLSX。operations 中每项使用 op，不使用 type。例：{"operations":[{"op":"set_cell","sheetId":"sheet-1","address":"B3","value":"Agent验收"}]}。必填字段：set_cell=address,value；set_formula=address,formula；clear_cell=address；set_range=start（或 range）,values；clear_range/format_range/merge_cells/unmerge_cells=range（format_range 另需 format，如 {"bold":true}）；fill_range/copy_range=source,target；insert_rows/delete_rows/set_row_height/set_rows_hidden=row（插入/删除另需 count，高度另需 heightPoints，隐藏另需 hidden）；insert_cols/delete_cols/set_col_width/set_cols_hidden=column（插入/删除另需 count，宽度另需 widthPx，隐藏另需 hidden）；rename_sheet=name；add_sheet=name（不支持自定 rows/columns）。除 add_sheet 外，以上均需 sheetId。范围写入最多 2000 格；copy_range可指定sourceSheetId及filterColumn/filterValues，匹配行复制为缓存值；普通复制/填充保留源单元格样式、类型和相对公式。convert_to_values=range，移除公式并保留原始缓存类型（建议先重新计算，无缓存拒绝）。带地址关联结构的相交范围拒绝。填充/复制、行列、合并、尺寸及工作表管理操作须单独提交。delete_sheet=sheetId（删除有其他引用的工作表会拒绝）；duplicate_sheet=sheetId,可选 name；set_sheet_hidden=sheetId,hidden；move_sheet=sheetId,position（从1开始）。sort_range=range,byColumn,order,可选 hasHeader；移动完整单元格并平移相对公式，公式排序键需缓存结果，合并/表格/批注等绑定地址结构暂拒绝。set_filter=range；clear_filter 无额外字段；set_filter_criteria=column,values（字符串数组，null 清除该列条件）。find_replace=range,find,replace,可选 matchCase 和 wholeCell（仅文字格，不改公式和数值）。筛选和排序单项提交。工作表操作单项提交。set_hyperlink=sheetId,address,target（http/https/mailto/#表!A1，null删除）；set_note=sheetId,address,text（null删除，富文本/线程批注拒绝）；protect_sheet=sheetId,protected（无密码切换，密码保护无法取消）。三者单项提交；保护后内容写入拒绝。add_conditional_format=sheetId,range,rule；clear_conditional_formats=sheetId；set_data_validation=sheetId,range,validation（null清除，部分范围重叠拒绝）；add_defined_name=name,ref；delete_defined_name=name（两者不需sheetId，只管理工作簿级普通名称）；set_page_setup=sheetId及页面参数（scale和fitToWidth/Height互斥）；set_freeze=sheetId,rows,columns（0/0取消）；add_sparkline=sheetId,type,dataRange,可选targetCell/color。以上单项提交。对象与表格：add_chart=sheetId,chartType,dataRange,可选title/anchorCell；edit_chart=chartPath及标题/类型/图例/颜色/数据等；add_shape=sheetId,shapeType,anchorCell,可选text/fillColor；edit_shape=visualId及text/fillColor/anchorCell；add_image=sheetId,path（公开HTTP(S)图片）,anchorCell；delete_visual=visualId；add_table=sheetId,range,可选name/style/bandedRows；add_table_row/delete_table_row=sheetId,tableName,row,count；add_table_column/delete_table_column=sheetId,tableName,column,count，新增需columnName；delete_table=sheetId,tableName。结构化表操作影响整行或整列，与Excel插入删除一致。add_pivot=sheetId,sourceRange,targetCell,rowFields,values（field/agg）；可选targetSheetId/columnField/pageFields/name/groupings/filters；refresh_pivot=sheetId。上述单项提交；先read_sheet_features获取持久对象、表格及透视信息。',
    inputSchema: {
      type: 'object',
      required: ['operations'],
      properties: {
        operations: { type: 'array', minItems: 0, maxItems: 50, items: operationSchema },
        recalculate: {
          type: 'boolean',
          description:
            '单独重算当前工作簿须传operations:[]和recalculate:true。隔离的IronCalc刷新现有公式缓存；1904日期、共享/数组、外部引用及不支持的函数会明确失败；不会自动重算普通写操作。',
        },
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
      'create_document',
      'get_workbook_context',
      'read_range',
      'read_cells',
      'find_cells',
      'aggregate_range',
      'load_guide',
      'read_formats',
      'read_sheet_features',
      'select_range',
      'trace_precedents',
      'trace_dependents',
      'propose_operations',
    ]),
  }
}
