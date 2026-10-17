/** Actual SVG raster vs independent native OOXML Canvas transforms; no product matrix import. */
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
const { createCanvas, loadImage } = createRequire(resolve('apps/desktop/package.json'))('@napi-rs/canvas')
const directory = process.argv[2] ?? '/tmp/mimir-pptx-group-c1-20261017'
const image = await loadImage(readFileSync(`${directory}/source-grid.png`))
const results = []
function sourceTransform(context, data, picture) {
  const vp = data.viewport, parent = data.parent, p = picture.transform, o = p.offset
  const group = parent.offset, ch = data.childOffset
  context.scale(vp.width / vp.slideWidth, vp.height / vp.slideHeight)
  context.translate(group.x + group.cx / 2, group.y + group.cy / 2)
  context.rotate(parent.rot / 60000 * Math.PI / 180)
  context.scale(parent.flipH ? -1 : 1, parent.flipV ? -1 : 1)
  context.translate(-group.cx / 2, -group.cy / 2)
  context.scale(group.cx / ch.cx, group.cy / ch.cy)
  context.translate(-ch.x, -ch.y)
  context.translate(o.x + o.cx / 2, o.y + o.cy / 2)
  const mirror = picture.scene3d?.cameraRot
  // Fixture's known flat camera lon180, lat0, rev30. No generic camera inference.
  if (mirror) { assert.equal(mirror.lon, 10800000); assert.equal(mirror.lat, 0) }
  context.rotate((p.rot / 60000 - (mirror?.rev ?? 0) / 60000) * Math.PI / 180)
  context.scale(p.flipH !== !!mirror ? -1 : 1, p.flipV ? -1 : 1)
  context.translate(-o.cx / 2, -o.cy / 2)
}
for (const kind of ['anisotropic37', 'quarter90', 'identity', 'flat-camera']) {
  const data = JSON.parse(readFileSync(`${directory}/${kind}.json`))
  const samples = []
  for (const u of [.325,.375,.425,.475,.525,.575,.625,.675]) for (const v of [.225,.275,.375,.425,.475,.558333333,.608333333,.625]) samples.push({u,v})
  let firstActual
  const stats = {kind, matchedSamples:0, sameRetainedPixels:0, totalSamples:samples.length}
  for (const cropped of [false,true]) {
    const canvas = createCanvas(960,720), actual = canvas.getContext('2d')
    const base = `${directory}/${kind}${cropped ? '-cropped' : ''}`
    // NAPI's SVG decoder drops even a minimal embedded PNG. macOS ImageIO
    // rasterizes the actual standalone SVG; NAPI only reads the resulting PNG.
    execFileSync('/usr/bin/sips', ['-s', 'format', 'png', `${base}.svg`, '--out', `${base}-system.png`])
    actual.drawImage(await loadImage(readFileSync(`${base}-system.png`)),0,0)
    const reference = createCanvas(960,720), context = reference.getContext('2d')
    context.fillStyle = '#FFFFFF'; context.fillRect(0,0,960,720)
    const picture = cropped ? { ...data.picture, srcRect:data.value.srcRect,
      transform: { ...data.picture.transform, offset:data.value.box } } : data.picture
    sourceTransform(context,data,picture)
    const raw = context.getTransform(), crop = picture.srcRect, o = picture.transform.offset
    const left = crop?.l ?? 0, top = crop?.t ?? 0, remainingW = 1-left-(crop?.r ?? 0), remainingH=1-top-(crop?.b ?? 0)
    context.save(); context.beginPath(); context.rect(0,0,o.cx,o.cy); context.clip()
    context.globalAlpha=picture.opacity ?? 1
    context.drawImage(image,-o.cx*left/remainingW,-o.cy*top/remainingH,o.cx/remainingW,o.cy/remainingH)
    context.restore()
    if (!cropped) {
      const sx=data.viewport.width/data.viewport.slideWidth, sy=data.viewport.height/data.viewport.slideHeight
      const expected=[raw.a/sx,raw.b/sx,raw.c/sy,raw.d/sy,raw.e,raw.f]
      expected.forEach((coefficient,index)=>assert.ok(Math.abs(coefficient-data.geometry.matrix[index])<(index < 4 ? 1e-6 : 0.0002),`overlay vs native matrix ${kind}/${index}: ${coefficient} vs ${data.geometry.matrix[index]}`))
    }
    const rawPixels=actual.getImageData(0,0,960,720).data, expectedPixels=context.getImageData(0,0,960,720).data
    writeFileSync(`${directory}/${kind}${cropped?'-cropped':''}-actual.png`,canvas.toBuffer('image/png'))
    writeFileSync(`${directory}/${kind}${cropped?'-cropped':''}-native-reference.png`,reference.toBuffer('image/png'))
    let matched=0, retained=0
    for (const point of samples) {
      const px=(point.u-left)*o.cx/remainingW, py=(point.v-top)*o.cy/remainingH
      const x=raw.a*px+raw.c*py+raw.e, y=raw.b*px+raw.d*py+raw.f
      const offset=(Math.floor(y)*960+Math.floor(x))*4
      const pixel=Array.from(rawPixels.slice(offset,offset+4)), expected=Array.from(expectedPixels.slice(offset,offset+4))
      assert.ok(pixel.every((value,index)=>Math.abs(value-expected[index])<=3),`${kind} ${cropped} pixel ${point.u},${point.v}: ${pixel} vs ${expected}`)
      matched++
      if(cropped) { const before=Array.from(firstActual.slice(offset,offset+4)); if(pixel.every((value,index)=>Math.abs(value-before[index])<=3))retained++ }
    }
    if(!cropped)firstActual=rawPixels
    else {stats.matchedSamples=matched;stats.sameRetainedPixels=retained;assert.equal(retained,samples.length)}

  }
  results.push(stats)
}
writeFileSync(`${directory}/raster-results.json`,JSON.stringify(results,null,2))
console.log(JSON.stringify(results,null,2))
