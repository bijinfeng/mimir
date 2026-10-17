import {
  DOCX_CLIENT_TOOL_OUTPUT_SCHEMA,
  pptxImageGenerationSchema,
  pptxMediaAnalysisSchema,
  pptxChartEditOpSchema,
  pptxDeckPlanSchema,
  pptxGenerateDeckSchema,
  pptxRegenerateSlideSchema,
  pptxInsertWebImageSchema,
  pptxReplaceImageSchema,
  pptxClarificationSchema,
} from '@mimir/shared'
import { z } from 'zod'
import { braveImageSearch, braveSearchReady, braveWebSearch } from './docx-brave-search.js'
import { docxImageReady } from './docx-image-generation.js'
import { docxMediaReadiness } from './docx-media-analysis.js'
import {
  OP_DOCS,
  opVocabulary,
} from '../../../../packages/office/vendor/packages/pptx-ops/src/op-docs.js'
import type { DocumentAgentCatalog } from './document-agent-catalog.js'
import type { ModelCallOptions } from './model.js'

const baseTools = [
  {
    name: 'read_slide',
    description: '读取当前未保存的 PPTX 幻灯片和元素。slide 是从 0 开始的页序号；省略时读当前页。',
    inputSchema: { type: 'object', properties: { slide: { type: 'integer', minimum: 0 } } },
    outputSchema: DOCX_CLIENT_TOOL_OUTPUT_SCHEMA,
  },
  {
    name: 'apply_ops',
    description: `在当前未保存 PPTX 上原子执行固定版 GenOffice 操作。先 read_slide 获取持久元素 ID；不确定参数时调用 load_guide。示例：{ops:[{op:'setFill',target:{slide:0,el:'read_slide返回的ID'},fill:'#245A9B'}]}。可调用操作：\n${opVocabulary()}`,
    inputSchema: {
      type: 'object',
      properties: {
        ops: {
          type: 'array',
          minItems: 1,
          maxItems: 50,
          items: {
            type: 'object',
            required: ['op'],
            properties: {
              op: {
                type: 'string',
                enum: Object.entries(OP_DOCS)
                  .filter(([, doc]) => doc.aiCallable !== false && !doc.pending)
                  .map(([name]) => name),
              },
              target: {
                type: 'object',
                properties: { slide: { type: ['integer', 'string'] }, el: { type: 'string' } },
                required: ['slide'],
              },
            },
          },
        },
      },
      required: ['ops'],
    },
    outputSchema: DOCX_CLIENT_TOOL_OUTPUT_SCHEMA,
  },
  {
    name: 'edit_chart',
    description:
      '编辑现有图表。先 read_slide 读取 target 和现有数据；patch 可修改标题、类型、类别、多个系列、图例、数据标签、轴标题和配色。修改数字须声明 dataSource。导入图表首次转换需用户知情后传 confirmImport:true，可能简化特殊格式。',
    inputSchema: z.toJSONSchema(pptxChartEditOpSchema.omit({ op: true })),
    outputSchema: DOCX_CLIENT_TOOL_OUTPUT_SCHEMA,
  },
  {
    name: 'load_guide',
    description:
      '按组读取固定版 GenOffice PPTX 操作指南；group 为 text、element、insert、table、slide 或 deck。',
    inputSchema: {
      type: 'object',
      properties: {
        group: { type: 'string', enum: ['text', 'element', 'insert', 'table', 'slide', 'deck'] },
      },
    },
    outputSchema: DOCX_CLIENT_TOOL_OUTPUT_SCHEMA,
  },
] as unknown as NonNullable<ModelCallOptions['tools']>

const object = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
})
const serviceTools = [
  {
    name: 'execute_slide_script',
    description:
      '在一页真实几何快照上运行固定版受限同步脚本并原子应用。els含id/type/text/x/y/w/h/rotation及颜色，canvas含w/h；单位px。函数setBox(id,{x?,y?,w?,h?,rotation?})、moveBy(id,dx,dy)、resizeBy(id,dw,dh)、setText(id,string或paragraphs)、setStyle(id,{fontSize?,color?,bold?,italic?,underline?,fontFamily?,align?})、setFill(id,color或none)、setStroke(id,{color,widthPt}或null)、log；支持循环/数组/Math，禁止网络/全局对象/动态代码。先使用els计算；示例：els.filter(e=>e.type==="text").forEach(e=>moveBy(e.id,12,0))。整段失败不会改画布。返回layoutAudit检查越界、重叠及文字溢出；若本次修改导致问题，立即以实际几何修复，最多两轮，不得宣称未解决的问题已完成。',
    inputSchema: object(
      {
        slideIndex: { type: 'integer', minimum: 0 },
        code: { type: 'string', maxLength: 30000 },
        explanation: { type: 'string', maxLength: 60 },
      },
      ['slideIndex', 'code'],
    ),
  },
  {
    name: 'insert_web_image',
    description:
      '将公开HTTP(S)图片、attachment://原文件名（用户选择原文件）或generate_image返回的mimir-generated引用插入当前画布。位置尺寸为px，按比例填充并居中裁切；不得提供本机路径。',
    inputSchema: z.toJSONSchema(pptxInsertWebImageSchema),
  },
  {
    name: 'replace_image',
    description:
      '原位替换已有图片，保留位置、层级、边框和效果。sourceId来自read_slide。默认按比例居中裁切；相同像素几何的替换可keepCrop:true。',
    inputSchema: z.toJSONSchema(pptxReplaceImageSchema),
  },
  {
    name: 'ask_clarification',
    description:
      '在编辑器显示演示需求选择并等待用户回答；不要在消息中重复问卷。需求明确时直接执行。',
    inputSchema: z.toJSONSchema(pptxClarificationSchema),
  },
  {
    name: 'plan_deck',
    description:
      '记录并向用户返回叙事锚点、统一风格和逐页提纲。此工具只规划；下一步generate_deck才写画布。',
    inputSchema: z.toJSONSchema(pptxDeckPlanSchema),
  },
  {
    name: 'regenerate_slide',
    description:
      '根据brief重新设计一页，保留其余页。先read_slide，逐字保留需要保留的真实内容；可传真实image_urls。新页由聊天模型生成原生可编辑对象，失败不改画布。',
    inputSchema: z.toJSONSchema(pptxRegenerateSlideSchema),
  },
  {
    name: 'generate_deck',
    description:
      '从topic+approx_pages自动分批规划并逐页生成原生可编辑演示文稿，也可直接提供pages。insert_mode为replace或append。图片关键词经真实搜索解析；无图片服务时可传已知URL或空列表。逐页显示临时预览；全完成一次更新画布，停止或后页失败可由用户明确保留已完成页或丢弃，确认前原画布不变。具体数字须声明dataSource。style_template复用已保存样式。',
    inputSchema: z.toJSONSchema(pptxGenerateDeckSchema),
  },
  {
    name: 'save_style_template',
    description: '把本轮规划/生成的统一样式存为可复用模板。',
    inputSchema: object({ name: { type: 'string', minLength: 1, maxLength: 100 } }, ['name']),
  },
  {
    name: 'list_style_templates',
    description: '列出已保存样式模板名称、主题和时间；可用于generate_deck的style_template。',
    inputSchema: object({}),
  },
]

export async function pptxAgentCatalog(): Promise<DocumentAgentCatalog> {
  const [search, image, media] = await Promise.all([
    braveSearchReady(),
    docxImageReady(),
    docxMediaReadiness(),
  ])
  const client = [
    ...baseTools,
    ...serviceTools.map((tool) =>
      Object.assign({}, tool, { outputSchema: DOCX_CLIENT_TOOL_OUTPUT_SCHEMA }),
    ),
    ...(image
      ? [
          {
            name: 'generate_image',
            description:
              '使用已配置图片模型生成新图片，返回有效20分钟的受控图片引用；再用insert_web_image或replace_image落画布。支持aspectRatio离散尺寸；GPT Image支持referenceImageUrls（公开URL或attachment://原文件名）及transparentBackground真实透明PNG；DALL-E不支持这两项，须切换模型。',
            inputSchema: z.toJSONSchema(pptxImageGenerationSchema),
            outputSchema: DOCX_CLIENT_TOOL_OUTPUT_SCHEMA,
          },
        ]
      : []),
    ...(media.vision || media.audio
      ? [
          {
            name: 'analyze_media',
            description:
              '分析原始媒体。kind=image可用mediaUrls公开图片/attachment://原文件名；kind=audio或video将请用户选择本地原文件。音频须转录服务；视频默认抽取4个时间点画面，不含声音，includeAudio:true同时转录可解码的音轨且须转录配置。视频最长120秒/32MiB；源文件不入知识库。不要传本机路径。',
            inputSchema: z.toJSONSchema(pptxMediaAnalysisSchema),
            outputSchema: DOCX_CLIENT_TOOL_OUTPUT_SCHEMA,
          },
        ]
      : []),
  ]
  const external = search
    ? ['web_search', 'image_search'].map((name) => ({
        name,
        description:
          name === 'web_search'
            ? '查询公开网页事实，返回真实标题、URL和摘要。'
            : '查找真实图片；选择imageUrl交给insert_web_image。',
        inputSchema: object(
          {
            query: { type: 'string', minLength: 1, maxLength: 500 },
            maxResults: { type: 'integer', minimum: 1, maximum: 10 },
          },
          ['query'],
        ),
        execute: name === 'web_search' ? braveWebSearch : braveImageSearch,
      }))
    : []
  return {
    format: 'pptx',
    systemPrompt:
      '你是Mimir的PPTX编辑助手。先读取当前未保存画布；修改现有元素可execute_slide_script。元素ID和页序号须来自当前画布。生成前收集真实材料并规划；不得编造数字，示例数据必须说明。只按工具真实结果报告，失败/取消/冲突时不得声称已修改。编辑只更新画布，用户手动保存。',
    tools: [...client, ...external] as unknown as NonNullable<ModelCallOptions['tools']>,
    clientToolNames: new Set(client.map((tool) => tool.name)),
    unavailableTools: [
      ...(!search
        ? [
            { name: 'web_search', reason: '请在网络搜索设置配置Brave密钥' },
            { name: 'image_search', reason: '请在网络搜索设置配置Brave密钥' },
          ]
        : []),
      ...(!image ? [{ name: 'generate_image', reason: '请配置图片生成模型' }] : []),
      ...(!media.vision && !media.audio
        ? [{ name: 'analyze_media', reason: '请配置视觉模型或音频转录服务' }]
        : []),
    ],
  }
}
