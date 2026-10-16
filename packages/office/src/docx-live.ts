import type { SaveOptions } from '../vendor/packages/docx-engine/src/patch.js'
import type { HfPartInfo, SectionInfo } from '../vendor/packages/docx-engine/src/types.js'
import {
  isPictureWatermark,
  pictureWatermarkPreviewImage,
  readWatermarkShape,
  watermarkParagraphXml,
} from '../vendor/packages/docx-engine/src/watermark.js'
import type { DocxSession } from './docx.js'

/** Use the same shape geometry as the save path; leave unrelated header images intact. */
export function withLiveWatermark(
  headerFooter: DocxSession['headerFooter'],
  watermark: SaveOptions['watermark'],
  sections: SectionInfo[],
): DocxSession['headerFooter'] {
  if (watermark === undefined) return headerFooter
  const settings = sections[0]?.settings
  const marginBox = settings
    ? {
        widthPt: (settings.pageWidth - settings.marginLeft - settings.marginRight) / 20,
        heightPt: (settings.pageHeight - settings.marginTop - settings.marginBottom) / 20,
      }
    : null
  const image =
    watermark === null
      ? null
      : isPictureWatermark(watermark)
        ? pictureWatermarkPreviewImage(watermark, marginBox)
        : readWatermarkShape(watermarkParagraphXml(watermark))
  const part = (source: HfPartInfo | null, required = false): HfPartInfo | null => {
    if (!source && !required) return null
    const images = (source?.images ?? []).filter((item) => !item.watermark && !item.wordArt)
    if (image) images.push(image)
    return { ...(source ?? { text: '', hasPageNumber: false, paras: [] }), images }
  }
  return {
    ...headerFooter,
    header: part(headerFooter.header, true),
    headerFirst: part(headerFooter.headerFirst, headerFooter.titlePg),
    headerEven: part(headerFooter.headerEven, headerFooter.evenAndOdd),
  }
}
