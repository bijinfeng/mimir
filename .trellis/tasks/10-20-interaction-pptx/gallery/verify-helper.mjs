import {readFileSync,writeFileSync} from 'node:fs'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url)
const {openPptx}=require('/private/tmp/mimir-pptx-gallery-fixtures-3b5d912.cjs')
const bytes=readFileSync(new URL('./fixtures/rich.pptx',import.meta.url))
const records=[]
for(const variant of ['before','after']){
 const response=await fetch(`http://127.0.0.1:5210/${variant}/ops`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({documentId:'gallery-pptx-0',bytes:bytes.toString('base64'),expectedVersion:0,ops:[{op:'addElement',target:{slide:0},kind:'rect',offset:{x:100000,y:100000,cx:1000000,cy:500000},paragraphs:[{runs:[{text:'原生写入校验'}]}]}]})})
 const result=await response.json()
 if(!response.ok)throw new Error(JSON.stringify(result))
 const output=new Uint8Array(Buffer.from(result.bytes,'base64'));const opened=await openPptx(output)
 const found=opened.deck.slides[0].elements.some(el=>JSON.stringify(el).includes('原生写入校验'))
 if(!found||result.version!==1)throw new Error('Native content/version verification failed')
 records.push({variant,status:response.status,nativeBytes:output.length,version:result.version,nativeContentFound:found,scope:'isolated exact product native host; fixture identity substitution; no IO persist'})
}
const denied=await fetch('http://127.0.0.1:5210/after/ops',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({documentId:'real-document-denied',bytes:bytes.toString('base64'),expectedVersion:0,ops:[]})})
records.push({path:'nonfixture identity',status:denied.status,error:(await denied.json()).error})
if(denied.status!==400)throw new Error('Expected rejection')
writeFileSync(new URL('./helper-smoke-verification.json',import.meta.url),JSON.stringify(records,null,2)+'\n')
console.log(records)
