import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const root=process.cwd();const p=root+'/.trellis/tasks/10-18-interaction-chat/research/';
const a=await import(root+'/node_modules/.pnpm/@ag-ui+core@0.0.59/node_modules/@ag-ui/core/dist/index.mjs');
const b=await import(root+'/node_modules/.pnpm/@ag-ui+core@1.0.0_zod@4.6.7/node_modules/@ag-ui/core/dist/schemas.js');
const client=await import(root+'/node_modules/.pnpm/@ag-ui+client@0.0.59/node_modules/@ag-ui/client/dist/index.mjs');
const req=createRequire(root+'/node_modules/.pnpm/@ag-ui+client@0.0.59/node_modules/@ag-ui/client/package.json');const {from,lastValueFrom}=req('rxjs');
const c=JSON.parse(await fs.readFile(p+'agui-v5-interaction-catalog.json','utf8'));const rows=[];
for(const x of c.items.filter(x=>x.example.events.length)){
 const row={id:x.id,eventCount:x.example.events.length,schema059:[],schema100:[],sequence059:null};
 for(const e of x.example.events){for(const [v,s] of [['schema059',a.EventSchemas],['schema100',b.EventSchema]]){if(!s){row[v].push({error:'schema unavailable'});continue;}const r=s.safeParse(e);if(!r.success)row[v].push({type:e.type,issues:r.error.issues.map(i=>({path:i.path,message:i.message}))});}}
 try{await lastValueFrom(from(x.example.events).pipe(client.transformChunks(),client.verifyEvents()));row.sequence059='pass';}catch(e){row.sequence059={error:String(e.message)};}
 rows.push(row);
}
const result={date:'2026-10-19',scope:'schema and 0.0.59 transform/verify only, not TanStack/Mimir product integration',rows};await fs.writeFile(p+'agui-v5-evidence/example-validation.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(rows.filter(x=>x.schema059.length||x.schema100.length||x.sequence059!=='pass'),null,2));
