/** Run from repo root after MIMIR_PPTX_GROUP_FIXTURE_DIR targeted Vitest generation. */
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
const require = createRequire(resolve('apps/desktop/package.json'))
const { createCanvas, loadImage } = require('@napi-rs/canvas')
const directory = process.argv[2] ?? '/tmp/mimir-pptx-group-c0-20261017'
const results = []
function pivot(context, box, legacyChild = false) {
  context.translate(box.x + box.w / 2, box.y + box.h / 2)
  if (legacyChild) context.scale(box.flipH ? -1 : 1, box.flipV ? -1 : 1)
  context.rotate(box.rotationDeg * Math.PI / 180)
  if (!legacyChild) context.scale(box.flipH ? -1 : 1, box.flipV ? -1 : 1)
  context.translate(-box.w / 2, -box.h / 2)
}
function drawNodes(context, nodes, samples, legacyLeaf = true) {
  for (const node of nodes) {
    context.save()
    pivot(context, node.box, legacyLeaf && node.type !== 'group')
    if (node.type === 'group') drawNodes(context, node.children, samples, legacyLeaf)
    else {
      assert.equal(node.type, 'shape')
      context.fillStyle = node.fill.color
      context.fillRect(0, 0, node.box.w, node.box.h)
      const matrix = context.getTransform()
      for (const x of [0.2, 0.4, 0.6, 0.8]) for (const y of [0.2, 0.4, 0.6, 0.8]) {
        const px = x * node.box.w, py = y * node.box.h
        samples.push({ x: matrix.a * px + matrix.c * py + matrix.e,
          y: matrix.b * px + matrix.d * py + matrix.f, color: node.fill.color })
      }
    }
    context.restore()
  }
}
for (const kind of ['identity', 'parent45-flip', 'nested']) {
  const tree = JSON.parse(readFileSync(`${directory}/${kind}.json`))
  const svg = readFileSync(`${directory}/${kind}.svg`, 'utf8')
  const actual = createCanvas(tree.widthPx, tree.heightPx)
  const reference = createCanvas(tree.widthPx, tree.heightPx)
  const context = reference.getContext('2d')
  context.fillStyle = '#FFFFFF'
  context.fillRect(0, 0, tree.widthPx, tree.heightPx)
  const samples = []
  drawNodes(context, tree.nodes, samples)
  actual.getContext('2d').drawImage(await loadImage(Buffer.from(svg)), 0, 0)
  const pixels = actual.getContext('2d').getImageData(0, 0, actual.width, actual.height).data
  const expectedPixels = context.getImageData(0, 0, reference.width, reference.height).data
  let mismatchedPixels = 0
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels.slice(i, i + 4).some((value, channel) => Math.abs(value - expectedPixels[i + channel]) > 8)) mismatchedPixels++
  }
  let matchedSamples = 0
  for (const point of samples) {
    const i = (Math.floor(point.y) * actual.width + Math.floor(point.x)) * 4
    const expected = point.color.slice(1).match(/../g).map(value => parseInt(value, 16))
    assert.deepEqual(Array.from(pixels.slice(i, i + 3)), expected, `${kind} color at ${JSON.stringify(point)}`)
    matchedSamples++
  }
  assert.ok(mismatchedPixels / (actual.width * actual.height) < 0.002)
  writeFileSync(`${directory}/${kind}-actual.png`, actual.toBuffer('image/png'))
  writeFileSync(`${directory}/${kind}-reference.png`, reference.toBuffer('image/png'))
  results.push({ kind, matchedSamples, totalSamples: samples.length, mismatchedPixels,
    totalPixels: actual.width * actual.height })
}
// Reproduce the omitted-parent-transform defect using the same generated native tree.
{
  const kind = 'parent45-flip'
  const tree = JSON.parse(readFileSync(`${directory}/${kind}.json`))
  const parent = tree.nodes[0]
  const svg = readFileSync(`${directory}/${kind}.svg`, 'utf8').replace(
    /data-element-kind="group" transform="matrix\([^"]+\)"/,
    `data-element-kind="group" transform="translate(${parent.box.x} ${parent.box.y})"`,
  )
  const actual = createCanvas(tree.widthPx, tree.heightPx)
  actual.getContext('2d').drawImage(await loadImage(Buffer.from(svg)), 0, 0)
  writeFileSync(`${directory}/${kind}-legacy.png`, actual.toBuffer('image/png'))
  const expected = await loadImage(readFileSync(`${directory}/${kind}-reference.png`))
  const reference = createCanvas(tree.widthPx, tree.heightPx)
  reference.getContext('2d').drawImage(expected, 0, 0)
  const a = actual.getContext('2d').getImageData(0, 0, actual.width, actual.height).data
  const b = reference.getContext('2d').getImageData(0, 0, actual.width, actual.height).data
  let differences = 0
  for (let i = 0; i < a.length; i += 4) if (a.slice(i, i + 4).some((value, channel) => Math.abs(value - b[i + channel]) > 8)) differences++
  assert.ok(differences > 10000)
  results.push({ kind: 'legacy-parent45-flip', mismatchedPixels: differences })
}
// Known remaining child flip-order and nonuniform-scale shear references for C1.
const knownCorners = []
for (const kind of ['child37-flip', 'shear37']) {
  const tree = JSON.parse(readFileSync(`${directory}/${kind}.json`))
  const group = tree.nodes[0], child = group.children[0]
  const angle = child.box.rotationDeg * Math.PI / 180
  const cos = Math.cos(angle), sin = Math.sin(angle)
  function corner(x, y, mode) {
    let dx = x - child.box.w / 2, dy = y - child.box.h / 2
    if (mode === 'native') { dx /= 1.5; dy /= 2 }
    if (mode !== 'current') { dx *= child.box.flipH ? -1 : 1; dy *= child.box.flipV ? -1 : 1 }
    let rx = cos * dx - sin * dy, ry = sin * dx + cos * dy
    if (mode === 'current') { rx *= child.box.flipH ? -1 : 1; ry *= child.box.flipV ? -1 : 1 }
    if (mode === 'native') { rx *= 1.5; ry *= 2 }
    return { x: group.box.x + child.box.x + child.box.w / 2 + rx,
      y: group.box.y + child.box.y + child.box.h / 2 + ry }
  }
  const corners = [[0, 0], [child.box.w, 0], [child.box.w, child.box.h], [0, child.box.h]].map(
    ([x, y]) => ({ currentSvg: corner(x, y, 'current'), fixedUpstreamRender: corner(x, y, 'upstream'),
      nativeScaledRotation: corner(x, y, 'native') }),
  )
  knownCorners.push({ kind, parent: group.box, child: child.box, corners })
  const actual = createCanvas(tree.widthPx, tree.heightPx)
  actual.getContext('2d').drawImage(await loadImage(readFileSync(`${directory}/${kind}.svg`)), 0, 0)
  writeFileSync(`${directory}/${kind}-actual.png`, actual.toBuffer('image/png'))
  const reference = createCanvas(tree.widthPx, tree.heightPx), context = reference.getContext('2d')
  context.fillStyle = '#FFFFFF'; context.fillRect(0, 0, tree.widthPx, tree.heightPx)
  drawNodes(context, tree.nodes, [], false)
  writeFileSync(`${directory}/${kind}-upstream-reference.png`, reference.toBuffer('image/png'))
}
writeFileSync(`${directory}/known-child-and-shear-corners.json`, JSON.stringify(knownCorners, null, 2))
writeFileSync(`${directory}/raster-results.json`, JSON.stringify(results, null, 2))
console.log(JSON.stringify(results, null, 2))
