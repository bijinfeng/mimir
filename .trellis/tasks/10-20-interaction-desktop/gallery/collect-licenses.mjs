/** Read the actual frozen build graph; emit standalone original package notices. */
import { createRequire } from 'node:module'
import { dirname,resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync,readdirSync,writeFileSync,mkdirSync,statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
const gallery=dirname(fileURLToPath(import.meta.url))
const repo=execFileSync('git',['rev-parse','--show-toplevel'],{cwd:gallery,encoding:'utf8'}).trim()
const require=createRequire(resolve(repo,'apps/desktop/package.json'))
const {build}=await import(require.resolve('vite'))
const target=resolve(repo,'docs/visual-comparisons/2026-10-20-desktop/demo/licenses')
mkdirSync(target,{recursive:true})
process.env.GALLERY_SOURCE_ROOT='/private/tmp/mimir-desktop-baseline-53285bb'
const hash=data=>createHash('sha256').update(data).digest('hex')
const packages=new Map()
await build({configFile:resolve(gallery,'source-before/vite.config.mjs'),logLevel:'silent',build:{outDir:'/private/tmp/mimir-desktop-license-audit-dist',emptyOutDir:true},plugins:[{name:'gallery:dependency-licenses',generateBundle(){
 for(const id of this.getModuleIds()){
  const file=id.split('?')[0],position=file.lastIndexOf('/node_modules/')
  if(position<0)continue
  const suffix=file.slice(position+14).split('/'),count=suffix[0]?.startsWith('@')?2:1
  const root=file.slice(0,position+14)+suffix.slice(0,count).join('/')
  try{
   const raw=readFileSync(resolve(root,'package.json')),info=JSON.parse(raw),key=info.name+'@'+info.version
   if(packages.has(key))continue
   const licenses=[]
   for(const name of readdirSync(root).filter(entry=>/^(licen[cs]e|notice)([.\-_]|$)/i.test(entry))){
    const path=resolve(root,name);if(!statSync(path).isFile())continue
    const bytes=readFileSync(path),filename=key.replaceAll('/','__')+'--'+name+'.txt'
    writeFileSync(resolve(target,filename),bytes)
    licenses.push({originalName:name,archive:'licenses/'+filename,sha256:hash(bytes),bytes:bytes.length})
   }
   packages.set(key,{name:info.name,version:info.version,license:info.license??null,packageJsonSha256:hash(raw),licenses})
  }catch{}
 }
}}]})
const result={scope:'Packages appearing in the actual frozen Vite module graph, including graph modules later tree-shaken; not an assertion of rendered UI coverage.',baseline:'53285bbdeaa17475e04aae517f07c957776cb6b6',lockfileSha256:hash(readFileSync(resolve(repo,'pnpm-lock.yaml'))),packages:[...packages.values()].toSorted((a,b)=>a.name.localeCompare(b.name))}
writeFileSync(resolve(gallery,'license-manifest.json'),JSON.stringify(result,null,2)+'\n')
writeFileSync(resolve(target,'../license-manifest.json'),JSON.stringify(result,null,2)+'\n')
console.log(`Saved ${result.packages.length} actual build-graph package records and original license notices; frozen published resources untouched.`)
