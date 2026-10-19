import JSZip from 'jszip'
import { expect, it } from 'vitest'
import { preserveDocxDirectoryEntries } from './docx-archive-save.js'

it('removes synthesized parent records without removing existing or newly created parts', async () => {
  const source = new JSZip()
  source.file('docProps/custom.xml', '<custom>keep</custom>', { createFolders: false })
  source.file('deep/nested/opaque.bin', new Uint8Array([0, 1, 255]), { createFolders: false })
  source.folder('explicit/empty')
  const original = await source.generateAsync({ type: 'uint8array' })
  const writer = await JSZip.loadAsync(original)
  writer.file('docProps/custom.xml', '<custom>keep</custom>')
  writer.file('deep/nested/opaque.bin', new Uint8Array([0, 1, 255]))
  writer.file('word/document.xml', '<document>edited</document>')
  writer.file('new/media/image.bin', new Uint8Array([3, 2, 1]))
  const saved = await writer.generateAsync({ type: 'uint8array' })
  const output = await JSZip.loadAsync(await preserveDocxDirectoryEntries(original, saved))
  expect(Object.keys(output.files).toSorted()).toEqual(
    [...Object.keys(source.files), 'word/document.xml', 'new/media/image.bin'].toSorted(),
  )
  for (const [path, part] of Object.entries(writer.files).filter(([, entry]) => !entry.dir))
    expect(await output.file(path)!.async('uint8array')).toEqual(await part.async('uint8array'))
})

it('returns the exact candidate when its directory records already match the source', async () => {
  const source = new JSZip()
  source.file('word/document.xml', '<document/>')
  const original = await source.generateAsync({ type: 'uint8array' })
  expect(await preserveDocxDirectoryEntries(original, original)).toBe(original)
  source.file('word/document.xml', '<document>edited</document>', { createFolders: false })
  const saved = await source.generateAsync({ type: 'uint8array' })
  expect(await preserveDocxDirectoryEntries(original, saved)).toBe(saved)
})
