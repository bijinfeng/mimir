import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  pptxDeckPlanSchema,
  pptxGenerateDeckSchema,
  pptxRegenerateSlideSchema,
  pptxInsertWebImageSchema,
  pptxReplaceImageSchema,
} from '@mimir/shared'
import {
  createBlankPptx,
  openPptx,
  savePptx,
  insertBlankSlide,
  deleteElement,
  elementDurableId,
  matchesElementRef,
  setSlideSize,
} from '../../../../packages/office/vendor/packages/pptx-engine/src/index.js'
import {
  runTxn,
  type Op,
} from '../../../../packages/office/vendor/packages/pptx-ops/src/ops/index.js'
import type { PptxHostRequest, PptxHostResult } from './pptx-agent-host.js'
import { activeStorage } from '../plugins/host.js'
import { callChat, modelReady } from './model.js'
import { fetchDocxImage } from './docx-image-fetch.js'
import { generateDocxImage } from './docx-image-generation.js'
import { analyzeDocxMedia } from './docx-media-analysis.js'
import { braveImageSearch } from './docx-brave-search.js'

const hex = z.string().regex(/^#[a-f\d]{6}$/i)
const templateSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    topic: z.string().max(6000),
    style: z.string().trim().min(1).max(12000),
    createdAt: z.iso.datetime(),
  })
  .strict()
const templatePrefix = 'templates/pptx/'
const templateKey = (name: string) =>
  `${templatePrefix}${createHash('sha256').update(name).digest('hex')}.json`
const generated = new Map<string, { documentId: string; dataUrl: string; expires: number }>()
const cancel = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new Error('PPTX 操作已取消；画布未修改')
}
const json = (text: string): unknown => {
  try {
    return JSON.parse(text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, ''))
  } catch {
    throw new Error('生成结果不是完整JSON，画布未修改；请重试')
  }
}
const probePayload = (value: string, probe: ImageProbe) => {
  if (value.length > 12 * 1024 * 1024) throw new Error('图片超过8 MiB')
  const found = /^data:image\/(?:png|jpeg);base64,([a-zA-Z\d+/]+={0,2})$/.exec(value)
  if (!found) throw new Error('当前图片须为PNG或JPEG')
  const bytes = new Uint8Array(Buffer.from(found[1]!, 'base64'))
  return { bytes, ...probe(bytes) }
}
type ImageProbe = (bytes: Uint8Array) => { ext: 'png' | 'jpg'; width: number; height: number }
function coverCrop(imageRatio: number, frameRatio: number) {
  return imageRatio > frameRatio
    ? { l: (1 - frameRatio / imageRatio) / 2, r: (1 - frameRatio / imageRatio) / 2, t: 0, b: 0 }
    : { l: 0, r: 0, t: (1 - imageRatio / frameRatio) / 2, b: (1 - imageRatio / frameRatio) / 2 }
}
async function imagePayload(url: string, documentId: string, probe: ImageProbe) {
  if (url.startsWith('mimir-generated://')) {
    const item = generated.get(url)
    if (!item || item.documentId !== documentId || item.expires < Date.now())
      throw new Error('生成图片已过期或不属于此文档，请重新生成')
    return probePayload(item.dataUrl, probe)
  }
  const downloaded = await fetchDocxImage(url)
  return probePayload(downloaded.dataUrl, probe)
}

async function readTemplate(name: string) {
  return templateSchema.parse(
    JSON.parse(new TextDecoder().decode(await activeStorage().read(templateKey(name)))),
  )
}

const elementSchema = z
  .object({
    kind: z.enum([
      'textbox',
      'rect',
      'roundRect',
      'ellipse',
      'triangle',
      'diamond',
      'rightArrow',
      'chevron',
    ]),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    w: z.number().positive().max(1),
    h: z.number().positive().max(1),
    text: z.string().max(6000).optional(),
    fontSize: z.number().min(8).max(160).optional(),
    fontFamily: z.string().max(100).optional(),
    bold: z.boolean().optional(),
    color: hex.optional(),
    fill: z.union([hex, z.literal('none')]).optional(),
  })
  .strict()
  .refine((v) => v.x + v.w <= 1.001 && v.y + v.h <= 1.001, '对象超出页面')
const pageSchema = z
  .object({
    background: hex,
    elements: z.array(elementSchema).min(1).max(40),
    notes: z.string().max(12000).default(''),
    images: z
      .array(
        z
          .object({
            url: z.url(),
            x: z.number().min(0).max(1),
            y: z.number().min(0).max(1),
            w: z.number().positive().max(1),
            h: z.number().positive().max(1),
          })
          .strict()
          .refine((v) => v.x + v.w <= 1.001 && v.y + v.h <= 1.001, '图片超出页面'),
      )
      .max(8)
      .default([]),
  })
  .strict()

async function modelJson(documentId: string, prompt: string, signal?: AbortSignal) {
  if (!(await modelReady('chat'))) throw new Error('请先配置可用的聊天模型')
  cancel(signal)
  const output = await callChat({
    role: 'chat',
    source: 'chat',
    refId: documentId,
    stream: false,
    messages: [{ role: 'user', content: prompt }],
    systemPrompts: [
      '你是演示文稿设计作者。只返回要求的JSON，不加围栏。准确保留提供的事实，不编造数字。',
    ],
    ...(signal ? { abortSignal: signal } : {}),
  })
  cancel(signal)
  if (output.length > 200000) throw new Error('生成结果过大，画布未修改')
  return json(output)
}

async function generatedPage(
  request: PptxHostRequest,
  page: z.infer<typeof pptxRegenerateSlideSchema>,
  style: string,
  probe: ImageProbe,
) {
  const result = pageSchema.parse(
    await modelJson(
      request.documentId,
      `设计一页原生可编辑幻灯片。统一风格：${style}\n标题：${page.title ?? ''}\n布局：${page.layout ?? ''}\n内容：${page.brief}\n可用图片URL（仅可从中选择）：${JSON.stringify(page.image_urls)}\nJSON格式：${JSON.stringify(z.toJSONSchema(pageSchema))}\n坐标为页面比例0–1，保留页边距，文字必须在框内且字号可读。使用多个内容区域、恰当对比与层级，不要把全文堆进一个框。`,
      request.signal,
    ),
  )
  if (result.images.some((item) => !page.image_urls.includes(item.url)))
    throw new Error('生成页引用未提供的图片，画布未修改')
  const images = await Promise.all(
    result.images.map(async (item) => ({
      ...item,
      payload: await imagePayload(item.url, request.documentId, probe),
    })),
  )
  cancel(request.signal)
  return { ...result, images }
}

/** Each action stages bytes only; no vault write. Failed or stopped generation cannot alter the canvas. */
export async function applyPptxService(
  request: PptxHostRequest,
  probe: ImageProbe,
): Promise<PptxHostResult> {
  if (request.ops.length !== 1) throw new Error('PPTX 专用工具每次只接受一组参数')
  const readResult = (data: unknown): PptxHostResult => ({
    bytes: request.bytes,
    records: [],
    version: request.expectedVersion,
    sampleData: false,
    changed: false,
    data,
  })
  const input = request.ops[0]
  cancel(request.signal)
  if (request.action === 'plan_deck') return readResult(pptxDeckPlanSchema.parse(input))
  if (request.action === 'save_style_template') {
    const fields = templateSchema.omit({ createdAt: true }).parse(input)
    await activeStorage().write(
      templateKey(fields.name),
      JSON.stringify({ ...fields, createdAt: new Date().toISOString() }),
    )
    return readResult({ name: fields.name, saved: true })
  }
  if (request.action === 'list_style_templates') {
    z.object({}).strict().parse(input)
    const keys = await activeStorage().list(templatePrefix)
    if (keys.length > 500) throw new Error('样式模板超过500项，请先整理模板')
    const items = await Promise.all(
      keys
        .filter((key) => /^templates\/pptx\/[a-f\d]{64}\.json$/.test(key))
        .map(async (key) =>
          templateSchema.parse(
            JSON.parse(new TextDecoder().decode(await activeStorage().read(key))),
          ),
        ),
    )
    return readResult({
      templates: items.map(({ name, topic, createdAt }) => ({ name, topic, createdAt })),
    })
  }
  if (request.action === 'generate_image') {
    const fields = z
      .object({ prompt: z.string().trim().min(1).max(2000) })
      .strict()
      .parse(input)
    const output = await generateDocxImage(fields.prompt, request.documentId)
    cancel(request.signal)
    for (const [key, item] of generated) if (item.expires < Date.now()) generated.delete(key)
    while (generated.size >= 8) generated.delete(generated.keys().next().value!)
    const url = `mimir-generated://${randomUUID()}`
    generated.set(url, {
      documentId: request.documentId,
      dataUrl: output.dataUrl,
      expires: Date.now() + 20 * 60 * 1000,
    })
    return readResult({ url, expiresInMinutes: 20 })
  }
  if (request.action === 'analyze_media') {
    const fields = z
      .object({
        mediaUrls: z.array(z.url().max(2000)).min(1).max(4),
        requirements: z.string().trim().min(1).max(4000),
      })
      .strict()
      .parse(input)
    const images = await Promise.all(fields.mediaUrls.map((url) => fetchDocxImage(url)))
    const media = images.map((image) => ({
      mimeType: image.mimeType,
      data: image.dataUrl.split(',')[1]!,
    }))
    const result = await analyzeDocxMedia({
      documentId: request.documentId,
      instruction: fields.requirements,
      kind: media.length === 1 ? 'image' : 'video',
      media,
    })
    cancel(request.signal)
    return readResult(result)
  }
  const opened = await openPptx(request.bytes)
  if (request.action === 'insert_web_image' || request.action === 'replace_image') {
    const replacing = request.action === 'replace_image'
    const fields = replacing
      ? pptxReplaceImageSchema.parse(input)
      : pptxInsertWebImageSchema.parse(input)
    const slide = opened.deck.slides[fields.slideIndex]
    if (!slide) throw new Error('幻灯片已失效')
    const payload = await imagePayload(fields.url, request.documentId, probe)
    cancel(request.signal)
    const original =
      'sourceId' in fields
        ? slide.elements.find((item) => matchesElementRef(item, fields.sourceId!))
        : undefined
    if (request.action === 'replace_image' && (!original || original.type !== 'picture'))
      throw new Error('目标图片已失效')
    const frame =
      original?.transform.offset ??
      (() => {
        if (!('x' in fields)) throw new Error('插入图片需要完整位置和尺寸')
        return {
          x: Math.round(fields.x * 9525),
          y: Math.round(fields.y * 9525),
          cx: Math.round(fields.w * 9525),
          cy: Math.round(fields.h * 9525),
        }
      })()
    const target = {
      slide: fields.slideIndex,
      ...(original ? { el: elementDurableId(original) ?? original.id } : {}),
    }
    const ops: Op[] = [
      {
        op: original ? 'replacePicture' : 'addPicture',
        target,
        bytes: payload.bytes,
        ext: payload.ext,
        ...(original ? {} : { offset: frame }),
        ...('keepCrop' in fields && fields.keepCrop ? { keepSrcRect: true } : {}),
      },
    ]
    const transaction = runTxn(opened, { ops, isolation: 'atomic' })
    if (!transaction.applied) throw new Error(transaction.failures?.[0]?.error ?? '图片未应用')
    const insertedId = original?.id ?? slide.elements.at(-1)?.id
    if (!insertedId) throw new Error('图片插入未返回有效对象')
    if (!('keepCrop' in fields) || !fields.keepCrop) {
      const crop = coverCrop(payload.width / payload.height, frame.cx / frame.cy)
      const cropped = runTxn(opened, {
        ops: [
          {
            op: 'setPictureSrcRect',
            target: { slide: fields.slideIndex, el: insertedId },
            srcRect: crop,
          },
        ],
        isolation: 'atomic',
      })
      if (!cropped.applied) throw new Error(cropped.failures?.[0]?.error ?? '图片裁切未应用')
    }
    return {
      bytes: await savePptx(opened),
      records: transaction.records ?? [],
      version: request.expectedVersion + 1,
      changed: true,
      sampleData: false,
    }
  }
  let plan: z.infer<typeof pptxDeckPlanSchema>,
    mode: 'replace' | 'append' | 'single',
    singleIndex = 0,
    dataSource: string | undefined
  if (request.action === 'regenerate_slide') {
    const fields = pptxRegenerateSlideSchema.parse(input)
    if (!opened.deck.slides[fields.slideIndex]) throw new Error('幻灯片已失效')
    plan = {
      core_hook: fields.title ?? fields.brief.slice(0, 200),
      style: fields.style ?? '',
      pages: [
        {
          title: fields.title ?? '重新设计',
          brief: fields.brief,
          layout: fields.layout ?? '根据内容安排',
          image_queries: fields.image_urls,
        },
      ],
    }
    mode = 'single'
    singleIndex = fields.slideIndex
    dataSource = fields.dataSource
  } else if (request.action === 'generate_deck') {
    const fields = pptxGenerateDeckSchema.parse(input)
    const style = fields.style_template
      ? (await readTemplate(fields.style_template)).style
      : fields.style
    mode = fields.insert_mode
    dataSource = fields.dataSource
    if (fields.pages)
      plan = {
        core_hook: fields.core_hook ?? fields.topic ?? fields.pages[0]!.title,
        style: style ?? '清晰的信息层级、克制配色、可读字体和一致页边距',
        pages: fields.pages,
      }
    else {
      const count = fields.approx_pages ?? 8
      const pages: z.infer<typeof pptxSlidePlanSchemaLocal>[] = []
      let core = fields.core_hook ?? fields.topic!,
        unified = style ?? ''
      for (let start = 0; start < count; start += 12) {
        const batch = Math.min(12, count - start)
        const draft = pptxDeckPlanSchema.parse(
          await modelJson(
            request.documentId,
            `规划主题：${fields.topic}，共${count}页，本批必须恰好生成第${start + 1}–${start + batch}页，恰好${batch}页。参考材料：${fields.context ?? ''}\n统一风格：${unified}，叙事锚点：${core}。之前标题：${pages.map((page) => page.title).join('；')}。JSON格式：${JSON.stringify(z.toJSONSchema(pptxDeckPlanSchema))}`,
            request.signal,
          ),
        )
        if (draft.pages.length !== batch) throw new Error('模型规划页数不完整，画布未修改')
        pages.push(...draft.pages)
        core = draft.core_hook
        unified ||= draft.style
      }
      plan = { core_hook: core, style: unified, pages }
    }
  } else throw new Error('PPTX 专用工具无效')
  // Specific figures must have an explicit provenance; never silently invent production data.
  if (/\d+(?:[.,]\d+)?\s*(?:%|％|万|亿|元|美元|USD|RMB)/i.test(JSON.stringify(plan)) && !dataSource)
    throw new Error('具体数字须声明 dataSource 来源')
  let output = opened
  if (mode === 'replace') {
    output = await openPptx(await createBlankPptx())
    setSlideSize(output, opened.deck.size.cx, opened.deck.size.cy)
  }
  for (let index = 0; index < plan.pages.length; index++) {
    cancel(request.signal)
    const page = plan.pages[index]!
    const urls: string[] = []
    for (const query of page.image_queries) {
      if (/^https?:\/\//.test(query)) urls.push(query)
      else {
        const found = await braveImageSearch({ query, maxResults: 1 })
        if (found.results[0]?.imageUrl) urls.push(found.results[0].imageUrl)
      }
    }
    const spec = await generatedPage(
      request,
      {
        slideIndex: index,
        title: page.title,
        brief: page.brief,
        layout: page.layout,
        image_urls: urls,
      },
      plan.style,
      probe,
    )
    const at =
      mode === 'single'
        ? singleIndex
        : mode === 'replace' && index === 0
          ? 0
          : output.deck.slides.length
    if (at === output.deck.slides.length && !insertBlankSlide(output, at - 1))
      throw new Error('无法新增生成页')
    const slide = output.deck.slides[at]!
    if (mode === 'single') {
      const oldElements = slide.elements.slice()
      for (const element of oldElements)
        if (!deleteElement(output, slide, element.id)) throw new Error('无法替换当前页对象')
    }
    const size = output.deck.size
    const ops: Op[] = [
      { op: 'setBackground', target: { slide: at }, kind: 'solid', color: spec.background },
      ...(mode === 'single' ? [{ op: 'setAnimations', target: { slide: at }, items: [] }] : []),
    ]
    for (const el of spec.elements)
      ops.push({
        op: 'addElement',
        target: { slide: at },
        kind: el.kind,
        offset: {
          x: Math.round(el.x * size.cx),
          y: Math.round(el.y * size.cy),
          cx: Math.round(el.w * size.cx),
          cy: Math.round(el.h * size.cy),
        },
        fill: el.fill ?? 'none',
        ...(el.text
          ? {
              paragraphs: el.text.split('\n').map((text) => ({
                runs: [
                  {
                    text,
                    fontSize: el.fontSize ?? 24,
                    color: el.color ?? '#202124',
                    fontFamily: el.fontFamily ?? 'Arial',
                    bold: el.bold ?? false,
                  },
                ],
              })),
              bodyPr: { autoFit: 'shrink' },
            }
          : {}),
      })
    for (const image of spec.images)
      ops.push({
        op: 'addPicture',
        target: { slide: at },
        bytes: image.payload.bytes,
        ext: image.payload.ext,
        offset: {
          x: Math.round(image.x * size.cx),
          y: Math.round(image.y * size.cy),
          cx: Math.round(image.w * size.cx),
          cy: Math.round(image.h * size.cy),
        },
      })
    ops.push({ op: 'setNotes', target: { slide: at }, text: spec.notes })
    const result = runTxn(output, { ops, isolation: 'atomic' })
    if (!result.applied) throw new Error(result.failures?.[0]?.error ?? '生成页未应用')
    // Picture creation reparses the slide; use transaction identities, never array positions.
    const pictures = (result.records ?? []).filter((record) => record.op.op === 'addPicture')
    for (let i = 0; i < spec.images.length; i++) {
      const image = spec.images[i]!,
        id = pictures[i]?.created?.[0]
      if (!id) throw new Error('生成图片缺少对象标识')
      const cropped = runTxn(output, {
        ops: [
          {
            op: 'setPictureSrcRect',
            target: { slide: at, el: id },
            srcRect: coverCrop(
              image.payload.width / image.payload.height,
              (image.w * size.cx) / (image.h * size.cy),
            ),
          },
        ],
        isolation: 'atomic',
      })
      if (!cropped.applied) throw new Error(cropped.failures?.[0]?.error ?? '生成图片裁切失败')
    }
  }
  cancel(request.signal)
  return {
    bytes: await savePptx(output),
    records: [],
    version: request.expectedVersion + 1,
    sampleData: dataSource === 'sample',
    changed: true,
    data: { pages: plan.pages.length, style: plan.style, topic: plan.core_hook },
  }
}
// Keep the page inferred type local without a second shape definition.
const pptxSlidePlanSchemaLocal = pptxDeckPlanSchema.shape.pages.element
