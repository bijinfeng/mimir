import { createRequire } from 'node:module'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
const gallery = dirname(fileURLToPath(import.meta.url))
const repo = execFileSync('git', ['rev-parse', '--show-toplevel'], {cwd:gallery,encoding:'utf8'}).trim()
const require = createRequire(resolve(repo,'apps/web/package.json'))
const esbuild = createRequire(require.resolve('vite/package.json'))('esbuild')
const bundled = await esbuild.build({stdin:{contents:`export * from '${repo}/packages/office/vendor/packages/pptx-engine/src/index.ts';export {runTxn} from '${repo}/packages/office/vendor/packages/pptx-ops/src/ops/index.ts'`,resolveDir:repo},loader:{'.md':'text'},bundle:true,platform:'node',format:'cjs',write:false,tsconfigRaw:{compilerOptions:{verbatimModuleSyntax:false}}})
const bundlePath='/private/tmp/mimir-pptx-gallery-fixtures-3b5d912.cjs'
writeFileSync(bundlePath,bundled.outputFiles[0].contents)
const {openPptx,savePptx,runTxn,elementDurableId}=require(bundlePath)
const base=new Uint8Array(readFileSync(resolve(gallery,'fixtures/title-layout.pptx')))
const manifest=[]
for(const name of ['table','chart','groups','rich']){
 const opened=await openPptx(base)
 const ops=[]
 if(name==='table'||name==='rich')ops.push({op:'addTable',target:{slide:0},rows:3,cols:3,offset:{x:700000,y:2500000,cx:5000000,cy:1600000}})
 if(name==='chart'||name==='rich')ops.push({op:'addChart',target:{slide:0},kind:'bar',title:'季度营收',categories:['Q1','Q2','Q3'],series:[{name:'收入',values:[12,18,22]},{name:'成本',values:[5,7,9]}],offset:{x:name==='rich'?5000000:900000,y:1500000,cx:3500000,cy:2500000}})
 if(name==='groups'||name==='rich')ops.push(...[0,1].map(index=>({op:'addElement',target:{slide:0},kind:'rect',offset:{x:500000+index*1500000,y:4200000,cx:1200000,cy:500000},paragraphs:[{runs:[{text:index?'交互验证':'Mimir 演示',fontSize:20}]}]})))
 const result=runTxn(opened,{ops,isolation:'atomic'})
 if(!result.applied)throw new Error(JSON.stringify(result.failures))
 if(name==='groups'){
  const els=opened.deck.slides[0].elements.slice(-2).map(elementDurableId)
  const grouped=runTxn(opened,{ops:[{op:'groupElements',target:{slide:0},els}],isolation:'atomic'})
  if(!grouped.applied)throw new Error(JSON.stringify(grouped.failures))
 }
 const bytes=await savePptx(opened);const reopened=await openPptx(bytes)
 writeFileSync(resolve(gallery,'fixtures',name+'.pptx'),bytes)
 manifest.push({name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),slides:reopened.deck.slides.length,types:reopened.deck.slides[0].elements.map(x=>x.type)})
}
for(const name of ['title-layout','formatted-text','image-deck','empty-deck']){const bytes=readFileSync(resolve(gallery,'fixtures',name+'.pptx'));manifest.push({name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),source:`packages/office/tests/fixtures/${name}.pptx`})}
writeFileSync(resolve(gallery,'fixture-manifest.json'),JSON.stringify(manifest,null,2)+'\n')
console.log(manifest)
