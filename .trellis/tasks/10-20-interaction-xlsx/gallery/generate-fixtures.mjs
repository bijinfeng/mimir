import { createRequire } from 'node:module'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
const gallery = dirname(fileURLToPath(import.meta.url))
const repo = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  cwd: gallery,
  encoding: 'utf8',
}).trim()
const require = createRequire(resolve(repo, 'apps/web/package.json'))
const esbuild = createRequire(require.resolve('vite/package.json'))('esbuild')
const modules = [
  'editors/xlsx-pivot-test-fixture.ts',
  'editors/xlsx-validation-test-fixture.ts',
  'editors/xlsx-fill-test-fixture.ts',
  'xlsx-shape-preview-fixture.test-helper.ts',
]
const result = await esbuild.build({
  stdin: {
    contents: modules
      .map((m) => `export * from ${JSON.stringify(resolve(repo, 'packages/office/src', m))}`)
      .join('\n'),
    resolveDir: repo,
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
  target: 'node22',
  tsconfigRaw: { compilerOptions: { verbatimModuleSyntax: false } },
  plugins: [
    {
      name: 'preserve-fixture-source-dir',
      setup(build) {
        build.onLoad({ filter: /\.tsx?$/ }, async ({ path }) => ({
          contents: readFileSync(path, 'utf8').replaceAll(
            'import.meta.dirname',
            JSON.stringify(dirname(path)),
          ),
          loader: path.endsWith('.tsx') ? 'tsx' : 'ts',
        }))
      },
    },
  ],
})
// Bundle is build-time-only; bytes below are the native builder output used by both variants.
const generatedPath = resolve('/private/tmp', 'mimir-xlsx-fixture-generator-dcb9a40.cjs')
writeFileSync(generatedPath, result.outputFiles[0].contents)
const loaded = require(generatedPath)
const outputs = {
  pivot: 'xlsxPivotFixture',
  'cross-sheet': 'xlsxCrossSheetPivotFixture',
  validation: 'xlsxValidationFixture',
  fill: 'xlsxFillFixture',
  objects: 'xlsxShapePreviewFixture',
}
const entries = []
const origin = 'packages/office/vendor/apps/docs/tests/pagination-corpus/xlsx-fixture.xlsx'
copyFileSync(resolve(repo, origin), resolve(gallery, 'fixtures/rich.xlsx'))
entries.push({ file: 'rich.xlsx', source: origin, generation: 'byte-identical copy' })
for (const [name, fn] of Object.entries(outputs)) {
  const fixture = await loaded[fn]()
  writeFileSync(resolve(gallery, 'fixtures', name + '.xlsx'), fixture.bytes)
  entries.push({
    file: name + '.xlsx',
    sourceFunction: fn,
    source: modules.find((m) =>
      name === 'objects'
        ? m.includes('shape-preview')
        : name === 'validation'
          ? m.includes('validation')
          : name === 'fill'
            ? m.includes('fill')
            : m.includes('pivot'),
    ),
    generation: 'existing native test fixture builder; no UI simulation',
  })
}
const JSZip = createRequire(resolve(repo, 'packages/office/package.json'))('jszip')
const searchZip = await JSZip.loadAsync(readFileSync(resolve(gallery, 'fixtures/rich.xlsx')))
const rows = Array.from(
  { length: 240 },
  (_, i) =>
    `<row r="${i + 1}"><c r="A${i + 1}" t="inlineStr"><is><t>项目 ${String(i + 1).padStart(3, '0')} 真实检索记录</t></is></c><c r="B${i + 1}"><v>${i + 1}</v></c><c r="C${i + 1}"${i === 1 ? ' t="e"' : ''}><f>${i === 1 ? '1/0' : `B${i + 1}*2`}</f><v>${i === 1 ? '#DIV/0!' : (i + 1) * 2}</v></c></row>`,
).join('')
searchZip.file(
  'xl/worksheets/sheet1.xml',
  `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:C240"/><sheetData>${rows}</sheetData></worksheet>`,
)
const wb = await searchZip.file('xl/workbook.xml').async('string')
searchZip.file(
  'xl/workbook.xml',
  wb.replace(
    '</sheets>',
    '<sheet name="第二表无旧结果" sheetId="2" r:id="gallerySearch2" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></sheets>',
  ),
)
const rel = await searchZip.file('xl/_rels/workbook.xml.rels').async('string')
searchZip.file(
  'xl/_rels/workbook.xml.rels',
  rel.replace(
    '</Relationships>',
    '<Relationship Id="gallerySearch2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet-search.xml"/></Relationships>',
  ),
)
searchZip.file(
  'xl/worksheets/sheet-search.xml',
  '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:B2"/><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>第二表独立数据</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>与上表不同的说明</t></is></c></row></sheetData></worksheet>',
)
const ct = await searchZip.file('[Content_Types].xml').async('string')
searchZip.file(
  '[Content_Types].xml',
  ct.replace(
    '</Types>',
    '<Override PartName="/xl/worksheets/sheet-search.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
  ),
)
writeFileSync(
  resolve(gallery, 'fixtures/search.xlsx'),
  await searchZip.generateAsync({ type: 'uint8array' }),
)
entries.push({
  file: 'search.xlsx',
  source: origin,
  generation:
    'native OOXML adapter: 240 matching text rows, numeric/formula/error caches; independent second sheet. No UI simulation.',
})
for (const item of entries) {
  const data = readFileSync(resolve(gallery, 'fixtures', item.file))
  item.bytes = data.length
  item.sha256 = createHash('sha256').update(data).digest('hex')
}
const manifest = {
  baseline: 'dcb9a40',
  generatedAt: new Date().toISOString(),
  files: entries,
  builders: modules.map((path) => ({
    path: 'packages/office/src/' + path,
    sha256: createHash('sha256')
      .update(readFileSync(resolve(repo, 'packages/office/src', path)))
      .digest('hex'),
  })),
}
writeFileSync(resolve(gallery, 'fixture-manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log('Generated ' + entries.length + ' native XLSX originals')
