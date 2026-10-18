import json
from pathlib import Path
root=Path(__file__).resolve().parent
inventory=json.loads((root/'../research/document-scenes.json').read_text())
tracks={
'entry':[1], 'empty':[2], 'loading':[3], 'read':[4,5], 'header':[6,7], 'navigation':[8,15],
'title':[9,10,11,12], 'save':[13], 'handoff':[14,57,58], 'outline':[16,17,18], 'citation':[19,20,21,22],
'menu':[23], 'tags':[24,25,26,27], 'folder':[28,29,30,31], 'ai-organize':[32], 'summary':[33,34], 'ai-tags':[35,36], 'stale-ai':[37],
'body':[38,39,40], 'links':[41,42], 'file':[43,44,49,50,51,52,53], 'media':[45,46,47,48], 'office':[54,55,56],
'assistant':[59,60,61,62,63,64,65,66], 'command':[67,68,69,70], 'guard':[71,72,73,74], 'layout':[75,76,77], 'accessibility':[78]}
track_by_id={f'DOC-{n:03}':t for t,ns in tracks.items() for n in ns}
labels={'idle':'默认','hover':'悬停','focus':'键盘焦点','pending':'等待请求','error':'失败恢复','success':'成功','loading':'读取中','ready':'就绪','narrow':'窄屏','dark':'深色','light':'浅色','retry':'重试','cancel':'取消','saved-read-error':'已保存但刷新失败','no-model':'未配置模型','network-error':'网络失败','not-found':'记录不存在','recovered':'恢复读取','blank':'空白标题','ime-enter':'输入法确认','ime-escape':'输入法取消','double-submit':'重复提交','draft-retained':'失败保留草稿','limit-200':'标题200字边界','no-folders':'无目录','current-noop':'当前目录不可重复移动','no-match':'未命中','cannot-save':'不能代为保存','save-from-guard-blocked':'共享守卫不能代存原件'}
scenes=[]
for item in inventory['items']:
 for state in item['states']:
  n=int(item['id'][4:]);track=track_by_id[item['id']]
  if n==2 and state=='route-library': track='entry'
  if n==3 and state=='resolved': track='reader'
  if n==4: track='read'
  if n==68: track='command'
  if n==37:track='stale-ai'
  source=item['source']
  scenes.append({'id':item['id']+'.'+state,'itemId':item['id'],'state':state,'stateLabel':labels.get(state,state.replace('-',' · ')),'title':item['label'],'track':track,'currentBehavior':item['current_behavior'],'proposal':item['target_behavior'],'source':source,'boundary':item['keyboard_and_exit']+' '+item['recovery']+' 业务请求均为HTML本地模拟，系统行为与完整编辑器交由对应宿主验证。','gap':item['gap'],'currentState':state in item['current_states'],'proposalState':state in item['proposal_states']})
(root/'scenes.json').write_text(json.dumps({'version':'document-review-v1','groups':len(inventory['items']),'scenes':scenes},ensure_ascii=False,indent=2)+'\n')
(root/'coverage.json').write_text(json.dumps({'source':'../research/document-scenes.json','groups':len(inventory['items']),'enumeratedStates':len(scenes),'countsAre':'静态可定位状态，不是浏览器测试次数','items':[{'id':i['id'],'source':i['source'],'states':[{'state':s,'entry':'review.html#scene='+i['id']+'.'+s,'renderTrack':track_by_id[i['id']],'currentState':s in i['current_states'],'proposalState':s in i['proposal_states'],'verification':'static-route; runtime QA representative only'} for s in i['states']]} for i in inventory['items']]},ensure_ascii=False,indent=2)+'\n')
print(f'{len(inventory["items"])} groups, {len(scenes)} states')
