/** Constrain both axes together; independent min/max heights distort the crop frame. */
export function pptxGroupPicturePreviewFrame(width: number, height: number) {
  const naturalRatio = width / height
  const aspectRatio =
    width > 0 && height > 0 && naturalRatio > 0 && Number.isFinite(180 * naturalRatio)
      ? naturalRatio
      : 1.5
  return { aspectRatio, maxWidth: 180 * aspectRatio }
}
