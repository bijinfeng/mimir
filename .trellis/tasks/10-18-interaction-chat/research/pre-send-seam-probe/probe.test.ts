import { createServer } from 'node:http'
import type { ServerResponse } from 'node:http'
import { act, createElement, useMemo } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it } from '/Users/admin/Desktop/mimir/packages/chat/node_modules/vitest/dist/index.js'
import { AssistantRuntimeProvider, ComposerPrimitive, ThreadPrimitive, SuggestionPrimitive, type AssistantRuntime } from '@assistant-ui/react'
import { useAgUiRuntime, useAgUiInterrupts, useAgUiSubmitInterruptResponses } from '@assistant-ui/react-ag-ui'
import { HttpAgent } from '@ag-ui/client'
import { guardRuntime } from './runtime-facade'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, ResizeObserver: class { observe(){} unobserve(){} disconnect(){} }, IntersectionObserver: class { observe(){} unobserve(){} disconnect(){} } })
const frame = (x: unknown) => `data: ${JSON.stringify(x)}\n\n`
const cleanup: (()=>Promise<void>|void)[]=[]
afterEach(async()=>{ for(const c of cleanup.splice(0).reverse()) await c() })
async function until(test:()=>boolean) { for(let n=0;n<200;n++){ if(test())return; await act(async()=>{await new Promise(r=>setTimeout(r,5))}) }; throw new Error('condition timeout') }
async function setup(mode:'queue'|'interrupt'='queue', attachmentAdapter?:any) {
 const requests:any[]=[]; let release:()=>void=()=>{}; const opened=new Set<ServerResponse>();
 const server=createServer(async(req,res)=>{
  let body=''; for await(const c of req)body+=String(c); const input=JSON.parse(body); requests.push(input); const index=requests.length;
  if(mode==='interrupt'&&index===2){res.writeHead(503);res.end('resume unavailable');return}
  res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});opened.add(res);res.on('close',()=>opened.delete(res));
  const finish=()=>{res.write(frame({type:'TEXT_MESSAGE_START',messageId:`a${index}`,role:'assistant'}));res.write(frame({type:'TEXT_MESSAGE_CONTENT',messageId:`a${index}`,delta:'ok'}));res.write(frame({type:'TEXT_MESSAGE_END',messageId:`a${index}`}));res.end(frame({type:'RUN_FINISHED',runId:input.runId,threadId:input.threadId}))}
  res.write(frame({type:'RUN_STARTED',runId:input.runId,threadId:input.threadId}));
  if(mode==='interrupt'&&index===1){res.write(frame({type:'TOOL_CALL_START',toolCallId:'read-1',toolCallName:'fake_read'}));res.write(frame({type:'TOOL_CALL_ARGS',toolCallId:'read-1',delta:'{}'}));res.write(frame({type:'TOOL_CALL_END',toolCallId:'read-1'}));res.end(frame({type:'RUN_FINISHED',runId:input.runId,threadId:input.threadId,outcome:{type:'interrupt',interrupts:[{id:'client_read-1',reason:'tanstack:client_tool_execution',metadata:{kind:'client_tool',toolName:'fake_read',input:{}}}]}}));return}
  if(mode==='queue'&&index===1)release=finish;else finish();
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address() as any;
 cleanup.push(async()=>{for(const r of opened)r.end();await new Promise<void>(r=>server.close(()=>r()))})
 const agent=new HttpAgent({url:`http://127.0.0.1:${address.port}`});
 let guarded!:AssistantRuntime;let original!:AssistantRuntime;let selected='A';let blocked=false;let pending:any[]=[];let submit!:(r:any[])=>Promise<void>;const frozen:any[]=[];const errors:any[]=[];
 function Observer(){pending=useAgUiInterrupts() as any;submit=useAgUiSubmitInterruptResponses();return null}
 function App(){const raw=useAgUiRuntime({agent,adapters:attachmentAdapter?{attachments:attachmentAdapter}:undefined,unstable_enableMessageQueue:true,suggestions:[{prompt:"suggested"}],logger:{error:()=>{}}});original=raw;
  const runtime=useMemo(()=>guardRuntime(raw,(intent)=>{if(blocked)throw new Error('stale');const entry={selected,kind:intent.kind,text:raw.thread.composer.getState().text};frozen.push(entry);return {...intent.runConfig,custom:{...intent.runConfig.custom,documentId:'doc',version:1,selection:selected,roundId:`round-${frozen.length}`}}},e=>errors.push(e)),[raw]);guarded=runtime;
  return createElement(AssistantRuntimeProvider,{runtime},createElement(Observer),createElement(ComposerPrimitive.Root,null,createElement(ComposerPrimitive.Input,{'data-testid':'input'}),createElement(ComposerPrimitive.Send,{'data-testid':'send'},'Send')),createElement(ThreadPrimitive.Suggestions,null,()=>createElement(SuggestionPrimitive.Trigger,{send:true,'data-testid':'suggest'},'Suggestion')))
 }
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);await act(async()=>{root.render(createElement(App))});cleanup.push(async()=>{for(const r of opened)r.end();await act(async()=>{await new Promise(r=>setTimeout(r,20));root.unmount()});host.remove()})
 return {requests,frozen,errors,host,original:()=>original,runtime:()=>guarded,select:(s:string)=>{selected=s},block:()=>{blocked=true},pending:()=>pending,submit:(r:any[])=>submit(r),release:()=>release()}
}
async function clickSend(p:Awaited<ReturnType<typeof setup>>,text:string){await act(async()=>{p.runtime().thread.composer.setText(text)});await act(async()=>{(p.host.querySelector('[data-testid=send]') as HTMLButtonElement).click()})}
it('public runtime facade freezes before default official send and queue dispatch; queue captures independent contexts',async()=>{
 const p=await setup();expect(p.runtime().thread).toBe(p.runtime().threads.main);
 await clickSend(p,'one');await until(()=>p.requests.length===1&&p.runtime().thread.getState().isRunning);expect(p.frozen).toEqual([{selected:'A',kind:'composer',text:'one'}]);
 p.select('B');await act(async()=>{p.runtime().thread.composer.setText('two');p.runtime().thread.composer.send()});
 p.select('C');await act(async()=>{p.runtime().thread.composer.setText('three');p.runtime().thread.composer.send()});
 expect(p.runtime().thread.composer.getState().queue).toHaveLength(2);expect(p.frozen.map(x=>x.selected)).toEqual(['A','B','C']);
 p.select('D');await act(async()=>p.release());await until(()=>p.requests.length===3&&!p.runtime().thread.getState().isRunning);
 expect(p.requests.map(r=>r.forwardedProps.runConfig.selection)).toEqual(['A','B','C']);expect(p.frozen).toHaveLength(3);expect(p.runtime().thread.getState().extras).toBe(p.original().thread.getState().extras)
})
it('official suggestion uses guarded public append, while rejection leaves composer send draft intact',async()=>{
 const p=await setup();p.select('suggestion-context');await act(async()=>{(p.host.querySelector('[data-testid=suggest]')as HTMLButtonElement).click()});await until(()=>p.requests.length===1);
 expect(p.frozen[0].kind).toBe('append');expect(p.requests[0].forwardedProps.runConfig.selection).toBe('suggestion-context');
 p.block();await act(async()=>{p.runtime().thread.composer.setText('keep draft');p.runtime().thread.composer.send()});expect(p.runtime().thread.composer.getState().text).toBe('keep draft');expect(p.requests).toHaveLength(1);expect(p.errors).toHaveLength(1);await act(async()=>p.release());await until(()=>!p.runtime().thread.getState().isRunning)
})
it('same AGUI extras owns interrupts; local patched failed resume restores pending interrupt and does not refreeze',async()=>{
 const p=await setup('interrupt');await clickSend(p,'execute');await until(()=>p.pending().length===1);
 const responses=[{interruptId:'client_read-1',status:'resolved',payload:{ok:true}}];let failed=false;await act(async()=>{try{await p.submit(responses)}catch{failed=true}});expect(failed).toBe(true);await until(()=>p.pending().length===1);expect(p.frozen).toHaveLength(1);
 await act(async()=>{await p.submit(responses)});await until(()=>p.pending().length===0&&!p.runtime().thread.getState().isRunning);expect(p.requests).toHaveLength(3);expect(p.frozen).toHaveLength(1);expect(p.requests[2].resume).toEqual(responses)
})

it('freezes before asynchronous attachment finalization; later selection changes do not replace runConfig',async()=>{
 let releaseAttachment!:()=>void;let started=false;const gate=new Promise<void>(r=>{releaseAttachment=r});
 const adapter={accept:'text/plain',async add({file}:any){return {id:'attachment-1',type:'document',name:file.name,contentType:'text/plain',file,status:{type:'requires-action',reason:'composer-send'}}},async send(a:any){started=true;await gate;return {...a,status:{type:'complete'},content:[{type:'text',text:'attachment fixture'}]}},async remove(){}};
 const p=await setup('queue',adapter);await act(async()=>{await p.runtime().thread.composer.addAttachment(new File(['fixture'],'fixture.txt',{type:'text/plain'}));p.runtime().thread.composer.setText('with file');p.runtime().thread.composer.send()});
 await until(()=>started);expect(p.frozen[0].selected).toBe('A');p.select('B');await act(async()=>releaseAttachment());await until(()=>p.requests.length===1);expect(p.requests[0].forwardedProps.runConfig.selection).toBe('A');await act(async()=>p.release());await until(()=>!p.runtime().thread.getState().isRunning)
})
