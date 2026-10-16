import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Worker } from 'node:worker_threads'
import type { XlsxRecalculation } from '@mimir/shared'
import { BoundedZip } from '../../../../packages/office/src/zip-bounds.js'
import { decodeXlsxXml } from '../../../../packages/office/src/xlsx-format.js'
import {
  assembleWithJsZip,
  assertOnlyTouchedEntriesChanged,
  createBufferEntrySource,
  planCellEditsToXlsx,
  type FormulaCachedValue,
  type SheetFormulaValues,
} from '../../../../packages/office/vendor/packages/xlsx-gateway/src/gateway/xlsx-gateway.js'
import {
  formatAddress,
  parseAddress,
} from '../../../../packages/office/vendor/packages/xlsx-gateway/src/domain/cell-address.js'

const require = createRequire(import.meta.url)
const LIMITS = {
  inputBytes: 2 * 1024 * 1024,
  totalBytes: 8 * 1024 * 1024,
  entryBytes: 4 * 1024 * 1024,
  parts: 500,
}
const MAX_CELLS = 20_000
const MAX_FORMULAS = 2_000
const TIMEOUT_MS = 20_000
let busy = false
interface FormulaTarget {
  sheet: number
  row: number
  column: number
  address: string
}
interface WorkerResult {
  bytes: Uint8Array
  types: number[]
  names: string[]
}

/** JavaScript worker source stays independent of Vite's SSR import rewriting. */
const WORKER_SOURCE = String.raw`(async () => {
  const { parentPort, workerData } = await import('node:worker_threads');
  try {
    const { readFile } = await import('node:fs/promises');
    const engine = await import(workerData.moduleUrl);
    await engine.default({module_or_path: await readFile(workerData.wasmPath)});
    const model = engine.Model.fromXlsx(workerData.bytes, 'Mimir', 'en', 'UTC', 'en');
    try {
      model.evaluate();
      const types = workerData.targets.map(({sheet,row,column}) => {
        if (!model.getCellContent(sheet,row+1,column+1).startsWith('=')) throw new Error('公式导入后丢失');
        if (model.getCellArrayStructure(sheet,row+1,column+1) !== 'SingleCell') throw new Error('数组或溢出公式尚不支持重算');
        return model.getCellType(sheet,row+1,column+1);
      });
      const bytes = model.toXlsx();
      parentPort.postMessage({bytes,types,names:model.getWorksheetsProperties().map(sheet => sheet.name)}, [bytes.buffer]);
    } finally {model.free();}
  } catch(error) {parentPort.postMessage({error:error instanceof Error ? error.message : String(error)});}
})()`

/** Abort/timeout terminates computation. JS heap limits do not cap WASM linear memory. */
export async function runXlsxRecalcWorker(
  bytes: Uint8Array,
  targets: FormulaTarget[],
  signal?: AbortSignal,
  timeoutMs = TIMEOUT_MS,
): Promise<WorkerResult> {
  if (signal?.aborted) throw new Error('XLSX 重算已取消；原件未修改')
  if (busy) throw new Error('公式引擎正在计算另一份工作簿，请稍后重试')
  busy = true
  let worker: Worker | undefined
  try {
    const modulePath = require.resolve('@ironcalc/wasm-xlsx')
    worker = new Worker(WORKER_SOURCE, {
      eval: true,
      workerData: {
        moduleUrl: pathToFileURL(modulePath).href,
        wasmPath: join(dirname(modulePath), 'wasm_bg.wasm'),
        bytes,
        targets,
      },
      resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 16 },
    })
    const active = worker
    return await new Promise<WorkerResult>((resolve, reject) => {
      const abort = () => reject(new Error('XLSX 重算已取消；原件未修改'))
      const timer = setTimeout(() => reject(new Error('XLSX 公式重算超时；原件未修改')), timeoutMs)
      const cleanup = () => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', abort)
      }
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted) abort()
      active.once('message', (message: WorkerResult & { error?: string }) => {
        cleanup()
        if (message.error) reject(new Error(`公式引擎无法重算：${message.error}`))
        else resolve(message)
      })
      active.once('error', (error) => {
        cleanup()
        reject(error)
      })
      active.once('exit', (code) => {
        cleanup()
        reject(new Error(`公式引擎未返回结果便退出（${code}）；原件未修改`))
      })
    })
  } finally {
    if (worker) await worker.terminate()
    busy = false
  }
}

function attribute(xml: string, name: string): string | undefined {
  const match = new RegExp(`(?:^|\\s)${name}=(?:"([^"]*)"|'([^']*)')`).exec(xml)
  return match ? decodeXlsxXml(match[1] ?? match[2] ?? '') : undefined
}
async function sheetsOf(zip: BoundedZip): Promise<Array<{ name: string; path: string }>> {
  const xml = (await zip.readText('xl/workbook.xml')) ?? ''
  const rels = (await zip.readText('xl/_rels/workbook.xml.rels')) ?? ''
  const paths = new Map<string, string>()
  for (const [, attrs = ''] of rels.matchAll(/<Relationship\b([^>]*)/g)) {
    const id = attribute(attrs, 'Id'),
      target = attribute(attrs, 'Target')
    if (id && target)
      paths.set(
        id,
        target.startsWith('/')
          ? target.slice(1)
          : target.startsWith('xl/')
            ? target
            : `xl/${target}`,
      )
  }
  return [...xml.matchAll(/<sheet\b([^>]*)/g)].map(([, attrs = '']) => {
    const name = attribute(attrs, 'name'),
      path = paths.get(attribute(attrs, 'r:id') ?? '')
    if (!name || !path || !/^xl\/worksheets\/[^/]+\.xml$/.test(path))
      throw new Error('重算仅支持标准工作表关系，图表页等结构尚未支持')
    return { name, path }
  })
}
function cachedValue(attrs: string, inner: string, engineType: number): FormulaCachedValue {
  const raw = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner)?.[1]
  if (raw === undefined) throw new Error('公式引擎未返回完整缓存，原件未修改')
  const value = decodeXlsxXml(raw),
    type = attribute(attrs, 't') ?? 'n'
  if (type === 'n' && engineType === 1 && value.trim() && Number.isFinite(Number(value)))
    return Number(value)
  if (type === 'b' && engineType === 4 && ['0', '1'].includes(value)) return value === '1'
  if (type === 'str' && engineType === 2) return value
  if (type === 'e' && engineType === 16) {
    if (['#NAME?', '#NIMPL!', '#ERROR!', '#SPILL!', '#CALC!'].includes(value))
      throw new Error(`公式引擎遇到未支持的函数或公式（${value}），原件未修改`)
    return { error: value }
  }
  throw new Error('公式缓存与引擎原始类型不一致；原件未修改')
}

export async function recalculateXlsx(
  bytes: Uint8Array,
  signal?: AbortSignal,
): Promise<{
  bytes: Uint8Array
  changedCells: string[]
  touchedEntries: string[]
  recalculation: XlsxRecalculation
}> {
  const source = await BoundedZip.open(bytes, LIMITS)
  await source.preflightAll()
  const workbook = (await source.readText('xl/workbook.xml')) ?? ''
  if (/\bdate1904\s*=\s*["'](?:1|true)["']/.test(/<workbookPr\b([^>]*)/.exec(workbook)?.[1] ?? ''))
    throw new Error('公式引擎尚不支持1904日期系统重算；原件与已有缓存保留')
  if (source.list('xl/externalLinks/').length) throw new Error('外部工作簿引用尚不支持重算')
  const sheets = await sheetsOf(source)
  const targets: FormulaTarget[] = []
  let cells = 0
  for (const [sheet, entry] of sheets.entries()) {
    const xml = (await source.readText(entry.path)) ?? ''
    cells += [...xml.matchAll(/<c\b/g)].length
    if (cells > MAX_CELLS) throw new Error('公式重算最多支持20000个已存储格子')
    for (const [, attrs = '', inner = ''] of xml.matchAll(
      /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g,
    )) {
      const formula = /<f\b([^>]*)(?:\/>|>)/.exec(inner)
      if (!formula) continue
      if (attribute(formula[1] ?? '', 't')) throw new Error('共享或数组公式尚不支持重算')
      const address = attribute(attrs, 'r')
      if (!address) throw new Error('公式缺少单元格地址，无法安全重算')
      const { row, column } = parseAddress(address)
      targets.push({ sheet, row, column, address })
      if (targets.length > MAX_FORMULAS) throw new Error('公式重算最多支持2000个公式')
    }
  }
  if (!targets.length) throw new Error('当前工作簿没有需要重算的公式')
  const output = await runXlsxRecalcWorker(bytes, targets, signal)
  if (
    output.names.join('\0') !== sheets.map((sheet) => sheet.name).join('\0') ||
    output.types.length !== targets.length
  )
    throw new Error('公式引擎工作表或公式集合不一致；原件未修改')
  const calculated = await BoundedZip.open(output.bytes, LIMITS)
  await calculated.preflightAll()
  const resultSheets = await sheetsOf(calculated)
  const values: SheetFormulaValues[] = []
  for (const [index, entry] of resultSheets.entries()) {
    const xml = (await calculated.readText(entry.path)) ?? ''
    const resultCells = new Map(
      [...xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)].map(
        ([, attrs = '', inner = '']) => [attribute(attrs, 'r'), { attrs, inner }],
      ),
    )
    values.push({
      sheetName: entry.name,
      cells: targets.flatMap((target, position) => {
        if (target.sheet !== index) return []
        const cell = resultCells.get(target.address)
        if (!cell || !/<f\b/.test(cell.inner)) throw new Error('公式引擎缺少目标公式缓存')
        return [
          {
            row: target.row,
            column: target.column,
            value: cachedValue(cell.attrs, cell.inner, output.types[position]!),
          },
        ]
      }),
    })
  }
  if (signal?.aborted) throw new Error('XLSX 重算已取消；原件未修改')
  const plan = await planCellEditsToXlsx(
    await createBufferEntrySource(Buffer.from(bytes)),
    [],
    // This fixed upstream planner only loads sheets named by mutations.
    // Empty structural journals seed cache-only sheets without editing structure.
    values
      .filter((sheet) => sheet.cells.length > 0)
      .map((sheet) => ({ sheetName: sheet.sheetName, ops: [] })),
    [],
    undefined,
    [],
    [],
    [],
    [],
    [],
    null,
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    values,
  )
  const replaced = new Map(plan.replaced)
  for (const [index, sheet] of values.entries()) {
    const path = sheets[index]!.path
    let xml = replaced.get(path)
    if (xml === undefined && sheet.cells.length)
      throw new Error('公式缓存补丁缺少工作表；原件未修改')
    for (const cell of sheet.cells) {
      if (cell.value !== '') continue
      const address = formatAddress(cell.row, cell.column)
      // The fixed gateway treats empty text like a missing cache. Preserve its
      // formula/attributes and explicitly encode the engine-typed empty string.
      xml = xml!.replace(
        new RegExp(`<c\\b([^>]*\\br="${address}"[^>]*)>([\\s\\S]*?)</c>`),
        (_match, attrs: string, inner: string) =>
          `<c${attrs.replace(/\st="[^"]*"/g, '')} t="str">${inner.replace(/<v\b[^>]*\/>|<v\b[^>]*>[\s\S]*?<\/v>/g, '')}<v></v></c>`,
      )
    }
    const writtenCells = new Map(
      [...(xml?.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g) ?? [])].map(
        ([, attrs = '', inner = '']) => [attribute(attrs, 'r'), { attrs, inner }],
      ),
    )
    for (const [position, target] of targets.entries()) {
      if (target.sheet !== index) continue
      const cell = writtenCells.get(target.address)
      const expected = sheet.cells.find(
        (value) => value.row === target.row && value.column === target.column,
      )?.value
      if (
        !cell ||
        !/<f\b/.test(cell.inner) ||
        JSON.stringify(cachedValue(cell.attrs, cell.inner, output.types[position]!)) !==
          JSON.stringify(expected)
      )
        throw new Error('公式缓存写回校验失败；原件未修改')
    }
    if (xml !== undefined) replaced.set(path, xml)
  }
  const patched = await assembleWithJsZip(Buffer.from(bytes), { ...plan, replaced })
  assertOnlyTouchedEntriesChanged(patched)
  if (signal?.aborted) throw new Error('XLSX 重算已取消；原件未修改')
  return {
    bytes: new Uint8Array(patched.buffer),
    changedCells: targets.map((target) => `${sheets[target.sheet]!.name}!${target.address}`),
    touchedEntries: [...patched.touchedEntries],
    recalculation: {
      engine: 'ironcalc-wasm-xlsx',
      engineVersion: '0.9.0',
      formulaCount: targets.length,
      warnings: ['已刷新现有公式的缓存；不支持1904日期、共享/数组公式、外部引用或全部Excel函数。'],
    },
  }
}
