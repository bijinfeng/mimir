// @ts-nocheck -- vendored from GenOffice（Apache-2.0）；不要手改，见 vendor/UPSTREAM.json
/* eslint-disable -- vendored，风格由上游决定 */
/**
 * Reusable Range: Blink fixes up every live Range on each DOM removal, so
 * per-word probe Ranges make later ProseMirror re-renders crawl. Do not nest.
 */
export function rangeSlot(): () => Range {
  let range: Range | undefined
  return () => (range ??= document.createRange())
}
