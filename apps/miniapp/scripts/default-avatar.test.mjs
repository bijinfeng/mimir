import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { renderDefaultAvatar } from '../../../scripts/generate-default-avatar.mjs'

test('native avatar PNG stays identical to the shared SVG raster', async () => {
  const png = await readFile(new URL('../src/assets/avatar/default-avatar.png', import.meta.url))
  assert.deepEqual(png, await renderDefaultAvatar())
  assert.equal(png.readUInt32BE(16), 144)
  assert.equal(png.readUInt32BE(20), 144)
})
