from pathlib import Path
import json,hashlib
R=Path('.trellis/tasks/10-18-interaction-chat/research');p=R/'agui-v5-interaction-catalog.json';c=json.loads(p.read_text());by={x['id']:x for x in c['items']}
by['UI-027']['v4Groups']+=['CHAT-018'];by['UI-012']['v4Groups']+=['CHAT-033'];by['UI-022']['v4Groups']+=['CHAT-035','CHAT-036'];by['UI-015']['v4Groups']+=['HOST-011'];by['UI-013']['v4Groups']+=['HOST-012']
for x in c['items']:
 if x['id']=='AGUI-REASON-007':x['interactions']=x['interactions'][:1];x['interactions'][0]['expected']='仅检查opaque引用，不生成可展开明文、复制或解码控件'
S={'type':'RUN_STARTED','threadId':'demo-thread','runId':'demo-run'};F={'type':'RUN_FINISHED','threadId':'demo-thread','runId':'demo-run','outcome':{'type':'success'}}
by['AGUI-RUN-002']['exampleVariants']=[{'id':'success','title':'正常完成','events':[S,F],'schema':'both','expected':'success'},{'id':'interrupt','title':'等待确认','events':[S,{**F,'outcome':{'type':'interrupt','interrupts':[{'id':'i1','reason':'approval','message':'是否继续？'}]}}],'schema':'both','expected':'interrupt-pending'},{'id':'cancelled','title':'已取消（1.0专用）','events':[S,{**F,'outcome':{'type':'cancelled'}}],'schema':'1.0.0-only','expected':'0.0.59 rejects; never success'}]
by['AGUI-TOOL-005']['exampleVariants']=[{'id':'success','title':'工具完成','events':by['AGUI-TOOL-005']['example']['events'],'schema':'both','expected':'complete'},{'id':'failed','title':'工具出错结果','events':[S,{'type':'TOOL_CALL_START','toolCallId':'t1','toolCallName':'demo'},{'type':'TOOL_CALL_END','toolCallId':'t1'},{'type':'TOOL_CALL_RESULT','messageId':'tr1','toolCallId':'t1','content':'{"error":"工具失败"}'},F],'schema':'both','expected':'JSON content error needs registered tool semantics; AGUI result has no standard error flag'}]
by['AGUI-STATE-002']['exampleVariants']=[{'id':'valid-patch','title':'合法修改','events':by['AGUI-STATE-002']['example']['events'],'schema':'both','expected':'count=2'},{'id':'invalid-path','title':'找不到补丁目标','events':[S,{'type':'STATE_SNAPSHOT','snapshot':{'count':0}},{'type':'STATE_DELTA','delta':[{'op':'replace','path':'/missing/value','value':2}]},F],'schema':'shape-valid, apply-invalid','expected':'retain previous state and surface debug diagnostic'}]
extra=[
 ('AGUI-FLOW-001','运行事件顺序与终局约束',['first-event-invalid','nested-run','after-terminal','valid-next-run'],'根run正常第一帧RUN_STARTED；一轮单个RUN_FINISHED或RUN_ERROR。已结束run不能继续CUSTOM；新run可另起。RUN_ERROR本身的客户端容错另见原始verify，不把回放容错作为服务端合法输出。'),
 ('AGUI-FLOW-002','流分片和显式三段归一',['explicit-triad','chunk-only','mixed-conflict','missing-first-id'],'TEXT/TOOL/REASONING CHUNK需先归一化；首chunk需身份、tool名称；无ID续片接当前stream；冲突角色/名称/重复消息避免生成双份。RAW不等价于普通可见消息。'),
 ('AGUI-FLOW-003','归属ID、嵌套子Agent与关闭',['correct-parent','unknown-parent','duplicate-id','subagent-pending','root-finished-too-early'],'区分threadId/runId/messageId/toolCallId/subagentRunId；根run不能假装子run完成；tool result关联原调用；子Agent挂起对应根interrupt。'),
 ('AGUI-FLOW-004','补丁六类操作、activity替换与错误恢复',['add','remove','replace','move','copy','test','replace-false','invalid-op'],'STATE_DELTA.delta与ACTIVITY_DELTA.patch使用不同字段；activity replace=false不覆盖已有；坏补丁保留已有数据/诊断；不能将state注入HTML。'),
 ('AGUI-FLOW-005','0.0.59与1.0取消终态兼容',['old-rejects-cancelled','new-accepts-cancelled','host-abort'],'核心schema实测0.0.59拒绝cancelled outcome，1.0接受。新UI采用TanStack时须证明真实终态映射；不能将停止当success。'),
 ('AGUI-FLOW-006','多媒体工具结果和file source版本差异',['string-result','parts-result','data-source','url-source','file-handle'],'0.0.59工具结果仅string、input source仅data/url；1.0工具结果可ContentPart[]并新增file handle。file handle不允许fetch当URL。'),
 ('AGUI-FLOW-007','恢复请求而非虚构INTERRUPT事件',['interrupted','resume-prepared','resolved','cancelled','expired','unknown','missing-entry'],'不存在INTERRUPT/RESUME标准事件。用RUN_FINISHED.outcome + 下一次RunAgentInput.resume。拒绝审批是resolved+payload.approved=false；cancelled是放弃回答。'),
 ('AGUI-FLOW-008','未知扩展和不可执行生成UI',['unknown-custom','unknown-activity','unknown-part','unsafe-link','opaque-reasoning'],'CUSTOM/activity未知类型保留诊断边界不执行；core没有generative-ui/source/file/data/quote标准ContentPart，禁止任意组件名自动执行。'),
]
for id,title,states,notes in extra:
 c['items'].append({'id':id,'title':title,'category':'protocol-boundary','events':[],'states':states,'interactions':[{'action':'选择合法/非法样本并检查累计状态','keyboard':'Tab选择样本；Enter/Space播放；Escape关闭详情','from':states[0],'to':states[-1],'expected':notes},{'action':'重置到最后合法状态','keyboard':'Enter/Space','from':states[-1],'to':states[0],'expected':'不自动重发有副作用工具或丢弃已接收消息'}],'boundary':{'kind':'protocol-conformance','status':'planning-probe','visible':False,'notes':notes},'evidence':['.trellis/tasks/10-18-interaction-chat/research/agui-v5-evidence/version-probes.json','.trellis/tasks/10-18-interaction-chat/research/agui-v5-evidence/official-core-1.0.3-types.ts'],'example':{'events':[]}})
m={}
for x in c['items']:
 for g in x.get('v4Groups',[]):m.setdefault(g,[]).append(x['id'])
for x in c['v4Parity']['routesDetail']:
 x['catalogIds']=m.get(x['source']['groupId'],[])
 assert x['catalogIds'],x['id']
latest=json.loads((R/'agui-v5-evidence/official-event-inventory.json').read_text());c['protocolVersions']['officialCoreVersion']=latest['version'];c['eventCounts']['official-'+latest['version']]=latest['count'];c['eventSets']['official-'+latest['version']]=latest['events'];c['counts']['items']=len(c['items']);c['counts']['protocolBoundaryItems']=len(extra);c['version']='agui-v5-catalog-3';c['examplePolicy']='example.events are event envelope samples; actual host effects and full state coverage need live demo/real integration verification. exampleVariants declare version and intentional-invalid boundaries.'
assert len({x['id'] for x in c['items']})==len(c['items'])
p.write_text(json.dumps(c,ensure_ascii=False,indent=2)+'\n')
print(c['counts'])
