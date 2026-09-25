// @ts-nocheck -- vendored from GenOffice（Apache-2.0）；不要手改，见 vendor/UPSTREAM.json
/* eslint-disable -- vendored，风格由上游决定 */
/** Fetch the bytes behind a one-shot handoff URL from the main process (see main/byte-handoff.ts). */
export async function fetchDocBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`document bytes unavailable (${res.status})`)
  return new Uint8Array(await res.arrayBuffer())
}
