import { ChatClient, fetchServerSentEvents } from '/tmp/mimir-tanstack-v5/probe/node_modules/@tanstack/ai-client/dist/esm/index.js';
import { writeFile } from 'node:fs/promises';
const result={date:'2026-10-19',versions:{client:'0.39.2',ai:'0.68.0'},checks:{}};
let captured;const observed=[];const customs=[];
const chunks=[
{type:'RUN_STARTED',threadId:'test-thread',runId:'run-1'},
{type:'REASONING_START'},{type:'REASONING_MESSAGE_START',messageId:'r1',role:'assistant'},
{type:'REASONING_MESSAGE_CONTENT',messageId:'r1',delta:'Reasoning text'},
{type:'REASONING_MESSAGE_END',messageId:'r1'},{type:'REASONING_END'},
{type:'STATE_SNAPSHOT',snapshot:{count:1}},{type:'STATE_DELTA',delta:[{op:'replace',path:'/count',value:2}]},
{type:'ACTIVITY_SNAPSHOT',messageId:'a1',activityType:'progress',content:{count:1}},
{type:'ACTIVITY_DELTA',messageId:'a1',activityType:'progress',patch:[{op:'replace',path:'/count',value:2}]},
{type:'RAW',event:{provider:'sample'}},
{type:'CUSTOM',name:'mimir.citations',value:{roundId:'1',citations:[]}},
{type:'TEXT_MESSAGE_START',messageId:'m1',role:'assistant'},
{type:'TEXT_MESSAGE_CONTENT',messageId:'m1',delta:'Hello'},
{type:'TEXT_MESSAGE_END',messageId:'m1'},
{type:'RUN_FINISHED',threadId:'test-thread',runId:'run-1'}];
const sse=chunks.map(x=>'data: '+JSON.stringify(x)+'\n\n').join('');
const client=new ChatClient({threadId:'test-thread',connection:fetchServerSentEvents('http://localhost/fixture',{credentials:'include',body:{base:'static'},fetchClient:async (_url,init)=>{captured={body:JSON.parse(init.body),credentials:init.credentials,signal:!!init.signal};return new Response(sse,{headers:{'Content-Type':'text/event-stream'}})}}),onChunk:c=>observed.push(c.type),onCustomEvent:(name,data)=>customs.push({name,data})});
await client.sendMessage('test',undefined,{body:{conversationId:'persisted',runConfig:{deepReasoning:true,documentId:'doc-1'}}});
result.checks.sse={captured,observed,customs,messages:client.getMessages()};client.dispose();
let release;let started;const start=new Promise(r=>started=r);const hold=new Promise(r=>release=r);let requests=0;const queueContexts=[];
const queued=new ChatClient({threadId:'queue-test',connection:{async *connect(messages,data,signal,context){requests++;queueContexts.push({data:structuredClone(data),context:structuredClone(context)});yield {type:'RUN_STARTED',threadId:'queue-test',runId:context.runId};if(requests===1){started();await hold;}yield {type:'RUN_FINISHED',threadId:'queue-test',runId:context.runId};}}});
const first=queued.sendMessage('first');await start;const nested={deepReasoning:false,documentId:'A'};await queued.sendMessage('second',undefined,{body:{runConfig:nested}});nested.documentId='mutated-after-queue';const queuePublic=queued.getQueue();release();await first;result.checks.queue={public:queuePublic,requests:queueContexts};queued.dispose();
let abortStarted;const ready=new Promise(r=>abortStarted=r);const stopped=new ChatClient({threadId:'stop-test',connection:{async *connect(_m,_d,signal,context){yield {type:'RUN_STARTED',threadId:'stop-test',runId:context.runId};abortStarted();await new Promise(r=>signal.addEventListener('abort',r,{once:true}));}}});const sending=stopped.sendMessage('first');await ready;await stopped.sendMessage('second',undefined,{body:{runConfig:{documentId:'A'}}});const before=stopped.getQueue();stopped.stop();await sending;result.checks.stop={before,after:stopped.getQueue(),status:stopped.getStatus()};stopped.dispose();
await writeFile(new URL('./probe-result.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify({sseEvents:observed.length,parts:result.checks.sse.messages.map(m=>m.parts.map(p=>p.type)),requestKeys:Object.keys(captured.body),queueSecondBody:queueContexts[1]?.data,stop:result.checks.stop},null,2));
