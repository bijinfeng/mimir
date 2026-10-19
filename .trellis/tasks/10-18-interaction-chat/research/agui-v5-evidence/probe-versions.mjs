import fs from 'node:fs/promises';const root=process.cwd(),p=root+'/.trellis/tasks/10-18-interaction-chat/research/agui-v5-evidence/';
const a=await import(root+'/node_modules/.pnpm/@ag-ui+core@0.0.59/node_modules/@ag-ui/core/dist/index.mjs');const b=await import(root+'/node_modules/.pnpm/@ag-ui+core@1.0.0_zod@4.6.7/node_modules/@ag-ui/core/dist/schemas.js');
const probes=[
 ['cancelled-run','RunFinishedEventSchema',{type:'RUN_FINISHED',threadId:'t',runId:'r',outcome:{type:'cancelled'}}],
 ['tool-multimedia-result','ToolCallResultEventSchema',{type:'TOOL_CALL_RESULT',messageId:'m',toolCallId:'tc',content:[{type:'image',source:{type:'url',value:'https://example.com/image.png'}}]}],
 ['user-file-source','UserMessageSchema',{id:'u',role:'user',content:[{type:'document',source:{type:'file',value:'provider-file-id'}}]}],
 ['resume-cancelled','ResumeEntrySchema',{interruptId:'i',status:'cancelled'}],
 ['reasoning-role','ReasoningMessageSchema',{id:'r',role:'reasoning',content:'摘要'}],
 ['protocol-version','RunAgentInputSchema',{threadId:'t',runId:'r',protocolVersion:'1.0',messages:[],tools:[],context:[],state:{}}]
];const out=[];for(const [id,k,v]of probes){const row={id,input:v};for(const [version,sdk]of [['0.0.59',a],['1.0.0',b]]){const r=sdk[k].safeParse(v);row[version]=r.success?{accepted:true,parsed:r.data}:{accepted:false,issues:r.error.issues.map(i=>({path:i.path,message:i.message}))};}out.push(row)}await fs.writeFile(p+'version-probes.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out,null,2));
