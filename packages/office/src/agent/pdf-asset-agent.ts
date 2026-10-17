import type { PdfAssetData, PdfAssetOperation, PdfAssetReadiness } from '@mimir/shared'
export const PDF_EXTERNAL_IMAGE_TOOLS = ['image_search', 'generate_image'] as const
export interface PdfHostAssets {
  (input: {
    assetSessionId: string
    expectedVersion: number
    operation: PdfAssetOperation
    signal?: AbortSignal
  }): Promise<{ version: number; data: PdfAssetData }>
}
export interface PdfHostAssetPreview {
  (input: { assetSessionId: string; url: string; signal?: AbortSignal }): Promise<Blob>
}
export interface PdfHostAssetReadiness {
  (signal?: AbortSignal): Promise<PdfAssetReadiness>
}
