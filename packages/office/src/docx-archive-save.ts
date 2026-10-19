import JSZip from 'jszip'

/** OPC parts do not require directory records; retain only the source's explicit ones. */
export async function preserveDocxDirectoryEntries(
  original: Uint8Array,
  saved: Uint8Array,
): Promise<Uint8Array> {
  const [source, output] = await Promise.all([JSZip.loadAsync(original), JSZip.loadAsync(saved)])
  const added = Object.keys(output.files).filter(
    (path) => output.files[path]!.dir && !source.files[path]?.dir,
  )
  if (!added.length) return saved
  // JSZip.remove(directory) also removes its child parts. Only drop the record.
  for (const path of added) delete output.files[path]
  return output.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}
