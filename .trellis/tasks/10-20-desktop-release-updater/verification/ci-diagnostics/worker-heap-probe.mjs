import { Worker } from 'node:worker_threads'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
const root = fileURLToPath(new URL('../../../../../apps/server/', import.meta.url))
const require = createRequire(root + 'package.json')
const { PDFDocument, StandardFonts } = require('pdf-lib')
const doc = await PDFDocument.create()
const page = doc.addPage()
page.drawText('PDF attachment', { font: await doc.embedFont(StandardFonts.Helvetica) })
const data = await doc.save()
const compiled = process.argv.includes('--compiled')
const registerTsx = !compiled || process.argv.includes('--loader')
const source = `(async()=>{
const {parentPort,workerData}=await import('node:worker_threads');
const {getHeapStatistics}=await import('node:v8');
const phase=(name)=>parentPort.postMessage({name, heap:getHeapStatistics(),execArgv:process.execArgv});
phase('initial');
try {
let load=(url)=>import(url);
if(workerData.tsx){
 if(workerData.preload){for(const url of workerData.nativeImports)await import(url);phase('native-pdf');}
 const {register}=await import(workerData.tsx);
 if(workerData.scoped){const scoped=register({namespace:'attachment'});load=(url)=>scoped.import(url,workerData.entry);}
 else register();
 phase('tsx');
}
const {inspectChatAttachment}=await load(workerData.entry);phase('entry');
await load(workerData.parserModule);phase('parser');
const result=await inspectChatAttachment('a.pdf','application/pdf',workerData.data);phase('parsed');
parentPort.postMessage({result});
}catch(e){parentPort.postMessage({error:e.stack});}
})()`
const worker = new Worker(source, {
  eval: true,
  execArgv: [],
  workerData: {
    entry: pathToFileURL(
      root +
        (compiled
          ? 'dist/services/chat-attachment-worker.js'
          : 'src/services/chat-attachment-worker.ts'),
    ).href,
    parserModule: pathToFileURL(
      root + (compiled ? 'dist/plugins/attachment-parser.js' : 'src/plugins/attachment-parser.ts'),
    ).href,
    preload: process.argv.includes('--preload'),
    scoped: process.argv.includes('--scoped'),
    nativeImports: [
      'pdfjs-dist/legacy/build/pdf.mjs',
      'pdfjs-dist/legacy/build/pdf.worker.mjs',
    ].map((x) => pathToFileURL(require.resolve(x)).href),
    tsx: registerTsx ? require.resolve('tsx/esm/api') : undefined,
    data,
  },
  resourceLimits: { maxOldGenerationSizeMb: 192, maxYoungGenerationSizeMb: 16 },
})
worker.on('message', (m) => {
  console.log(JSON.stringify(m))
  if (m.error) process.exitCode = 1
  if (m.result || m.error) worker.terminate()
})
worker.on('error', (e) => {
  console.error(e)
  process.exitCode = 1
})
