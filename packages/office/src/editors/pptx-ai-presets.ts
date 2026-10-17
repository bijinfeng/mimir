/** Prompt semantics: GenOffice 480548fd55f1be3593ee0d8e316a734751d58309,
 * slides i18n/ai/zh.ts and i18n/ribbon/zh.ts (Apache-2.0).
 * Mimir prepares an editable draft; it does not auto-run or attach a screenshot.
 */
export const PPTX_AI_LANGUAGES = [
  '英语',
  '简体中文',
  '繁体中文',
  '日语',
  '韩语',
  '法语',
  '德语',
  '西班牙语',
] as const
export type PptxAiLanguage = (typeof PPTX_AI_LANGUAGES)[number]
export type PptxAiPreset = 'beautify' | 'fact-check' | 'image' | 'spelling' | 'translate'
export interface PptxAiTarget {
  documentId: string
  slidePath: string
  /** Zero-based order in the current unsaved canvas. */
  slideIndex: number
  version: number
}
export function validPptxAiTarget(target: PptxAiTarget): boolean {
  return (
    Boolean(target.documentId.trim()) &&
    /^ppt\/slides\/slide[1-9]\d*\.xml$/.test(target.slidePath) &&
    Number.isSafeInteger(target.slideIndex) &&
    target.slideIndex >= 0 &&
    Number.isSafeInteger(target.version) &&
    target.version >= 0
  )
}
export function pptxAiPresetInstruction(
  preset: PptxAiPreset,
  target: PptxAiTarget,
  language?: PptxAiLanguage,
): string {
  if (!validPptxAiTarget(target)) throw new Error('请先打开可编辑的幻灯片')
  if (preset === 'translate' && !PPTX_AI_LANGUAGES.includes(language!))
    throw new Error('请选择翻译语言')
  const prompts: Record<PptxAiPreset, string> = {
    beautify: '美化这一页幻灯片：优化排版、配色和字体层级，使页面更专业美观，保留真实内容与原意。',
    'fact-check':
      '核查这份幻灯片的内容：检查数据、日期、名称和论断是否属实，指出并纠正错误。涉及外部事实时给出可核验的来源；没有足够依据的内容标注待核实，不要编造结论。',
    image:
      '根据这一页的内容生成一张相关配图，并插入到目标页的合适位置。先读取本页内容与布局；无法生成或插入时，请说明原因。',
    spelling:
      '逐页检查这份演示文稿的错别字、语法和标点：直接修正错误，保持版式与原意不变；最后按页简要汇报修改点，没有问题的页跳过。',
    translate: `把目标页的所有文本翻译成${language ?? ''}并替换原文，保持版式、字号和配色不变。`,
  }
  const stableId = `s_${target.slidePath.match(/slide(\d+)\.xml$/)![1]}`
  const page = `准备指令时的第 ${target.slideIndex + 1} 页（页面标识：${stableId}）`
  const scope =
    preset === 'spelling' || preset === 'fact-check'
      ? `检查范围为整个演示文稿；${page}是起始页。`
      : `请处理${page}。`
  return `${prompts[preset]}\n\n${scope}先读取当前未保存的内容和布局；若已调整页序，请按页面标识找到最新位置，再按当前页序读取。无法确认目标时停止修改并说明原因，不要改动后来选中的其他页。`
}
