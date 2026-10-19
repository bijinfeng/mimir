from pathlib import Path
import json,hashlib
P=Path('.trellis/tasks/10-18-interaction-chat');R=P/'research';E=R/'agui-v5-evidence'
manifest=json.loads((E/'local-schema-manifest.json').read_text());items=[]
def event(t,**v):return {'type':t,**v}
S=event('RUN_STARTED',threadId='demo-thread',runId='demo-run');F=event('RUN_FINISHED',threadId='demo-thread',runId='demo-run',outcome={'type':'success'})
text=[event('TEXT_MESSAGE_START',messageId='answer',role='assistant'),event('TEXT_MESSAGE_CONTENT',messageId='answer',delta='这是来自知识库的回答。'),event('TEXT_MESSAGE_END',messageId='answer')]
tool=[event('TOOL_CALL_START',toolCallId='tool-1',toolCallName='search_documents',parentMessageId='answer'),event('TOOL_CALL_ARGS',toolCallId='tool-1',delta='{"query":"知识库"}'),event('TOOL_CALL_END',toolCallId='tool-1'),event('TOOL_CALL_RESULT',messageId='tool-result-1',toolCallId='tool-1',content='{"matches":2}',role='tool')]
reason=[event('REASONING_START',messageId='reason-1'),event('REASONING_MESSAGE_START',messageId='reason-1',role='reasoning'),event('REASONING_MESSAGE_CONTENT',messageId='reason-1',delta='先理解用户的问题。'),event('REASONING_MESSAGE_END',messageId='reason-1'),event('REASONING_END',messageId='reason-1')]
think=[event('THINKING_START',title='思考中'),event('THINKING_TEXT_MESSAGE_START'),event('THINKING_TEXT_MESSAGE_CONTENT',delta='旧版思考文本'),event('THINKING_TEXT_MESSAGE_END'),event('THINKING_END')]
base_ev=str(E/'core-0.0.59-types.d.ts');one_ev=str(E/'core-1.0.0-types.d.ts')
def add(id,title,cat,events,states,actions,notes='',status='planned',visible=True,kind='agui',example=None,evidence=None):
 interactions=[]
 for a in actions:
  if isinstance(a,str):a=(a,'按钮 Enter/Space',states[0],states[-1],a+'后状态可观察；不自动执行真实网络或画布操作')
  interactions.append(dict(zip(['action','keyboard','from','to','expected'],a)))
 items.append({'id':id,'title':title,'category':cat,'events':events,'states':states,'interactions':interactions,'boundary':{'kind':kind,'status':status,'visible':visible,'notes':notes},'evidence':evidence or [base_ev,one_ev],'example':{'events':example or []}})
def ev(id,t,title,cat,states,seq,notes='',visible=True,status='planned',acts=None):
 add(id,title,cat,[t],states,acts or [('播放事件','Enter/Space',states[0],states[-1],'逐条事件驱动右侧状态；显示当前事件与累计结果'),('单步与重置','Enter/Space',states[-1],states[0],'单步不跳过终态；重置清除本次演示状态')],notes,status,visible,example=[S]+seq+[F] if t not in ['RUN_STARTED','RUN_FINISHED','RUN_ERROR'] else seq)
ev('AGUI-RUN-001','RUN_STARTED','运行开始','run',['idle','running'],[S]+text+[F],'只能开启本轮一次；相同threadId/runId归属，不在视图里伪造额外模型轮。')
ev('AGUI-RUN-002','RUN_FINISHED','运行完成 / 暂停 / 取消','run',['running','success','interrupt','cancelled'],[S]+text+[F],'outcome success/interrupt两版本可见；cancelled仅core1.0.0，本地0.0.59未纳入其结果union。中断不是成功。')
ev('AGUI-RUN-003','RUN_ERROR','运行失败','run',['running','error','retry-ready'],[S]+text[:2]+[event('RUN_ERROR',message='连接失败',code='NETWORK')],'RUN_ERROR是错误终局；停止为独立状态。失败回复不可存成笔记。')
ev('AGUI-STEP-001','STEP_STARTED','步骤开始（数据）','step',['idle','step-running'],[event('STEP_STARTED',stepName='retrieve'),event('STEP_FINISHED',stepName='retrieve')],'协议定义步骤生命周期，不规定过程卡；产品默认不渲染调试步骤，不恢复mimir.trace。',False)
ev('AGUI-STEP-002','STEP_FINISHED','步骤完成（数据）','step',['step-running','step-complete'],[event('STEP_STARTED',stepName='retrieve'),event('STEP_FINISHED',stepName='retrieve')],'同名步骤需对应start，数据检查页展示，正常消息不新增步骤卡。',False)
for i,(t,title,st) in enumerate([('TEXT_MESSAGE_START','文本开始',['idle','empty-message']),('TEXT_MESSAGE_CONTENT','文本流式增量',['empty-message','streaming']),('TEXT_MESSAGE_END','文本结束',['streaming','complete']),('TEXT_MESSAGE_CHUNK','文本便捷分片',['idle','streaming','complete'])],1):
 seq=text if i<4 else [event('TEXT_MESSAGE_CHUNK',messageId='answer',role='assistant',delta='这是'),event('TEXT_MESSAGE_CHUNK',delta='分片回答。')]
 ev(f'AGUI-TEXT-{i:03}',t,title,'text',st,seq,'CHUNK是上游便捷格式，需要与显式START/CONTENT/END归一化，不能重复渲染。' if i==4 else 'messageId保持关联；半截Markdown不得阻塞输入或丢失已到正文。')
for i,(t,title,st) in enumerate([('TOOL_CALL_START','工具调用开始',['idle','arguments-streaming']),('TOOL_CALL_ARGS','工具参数增量',['arguments-streaming','arguments-ready']),('TOOL_CALL_END','参数接收结束',['arguments-streaming','executing']),('TOOL_CALL_CHUNK','工具便捷分片',['idle','arguments-streaming','executing']),('TOOL_CALL_RESULT','工具结果',['executing','complete','error'])],1):
 seq=tool if i!=4 else [event('TOOL_CALL_CHUNK',toolCallId='tool-1',toolCallName='search_documents',parentMessageId='answer',delta='{"query":'),event('TOOL_CALL_CHUNK',delta='"知识库"}'),tool[-1]]
 ev(f'AGUI-TOOL-{i:03}',t,title,'tool',st,seq,'TOOL_CALL_END只表示参数结束，不代表工具执行成功。Args/Result折叠及错误状态是UI映射；不能从工具名自动获得画布执行权。',acts=[('逐条接收参数/结果','Enter/Space',st[0],st[-1],'显示半截JSON与完整参数，不提前执行未完成参数'),('展开/收起工具细节','Enter/Space',st[-1],st[-1],'保留v4默认折叠，展开显示Args/Result且焦点稳定')])
for i,(t,title,st) in enumerate([('REASONING_START','推理区间开始',['idle','reasoning-running']),('REASONING_MESSAGE_START','推理消息开始',['reasoning-running','reasoning-empty']),('REASONING_MESSAGE_CONTENT','推理正文增量',['reasoning-empty','reasoning-streaming']),('REASONING_MESSAGE_END','推理文本结束',['reasoning-streaming','reasoning-message-complete']),('REASONING_MESSAGE_CHUNK','推理便捷分片',['idle','reasoning-streaming','reasoning-complete']),('REASONING_END','推理区间结束',['reasoning-running','reasoning-complete']),('REASONING_ENCRYPTED_VALUE','加密推理（不展示原文）',['idle','opaque-stored'])],1):
 seq=reason
 if i==5:seq=[reason[0],event(t,messageId='reason-1',delta='推理摘要'),reason[-1]]
 if i==7:seq=reason+[event(t,subtype='message',entityId='reason-1',encryptedValue='opaque-provider-token')]
 ev(f'AGUI-REASON-{i:03}',t,title,'reasoning',st,seq,'只显示模型实际提供的明文；encryptedValue作为opaque续传数据，禁止解码、复制、伪造或画成思考正文。' if i==7 else '保留v4思考手动开合/空/长内容/结束状态；禁止重造检索过程摘要。',i!=7,acts=[('接收推理事件','Enter/Space',st[0],st[-1],'更新实际推理状态'),('展开/收起','Enter/Space',st[-1],st[-1],'仅明文可展开，加密只显示协议边界')])
for i,t in enumerate(['THINKING_START','THINKING_END','THINKING_TEXT_MESSAGE_START','THINKING_TEXT_MESSAGE_CONTENT','THINKING_TEXT_MESSAGE_END'],1):
 ev(f'AGUI-LEGACY-{i:03}',t,'旧版思考 '+t,'legacy',['legacy-received','normalized-or-unsupported'],think,'core0.0.59 deprecated；core1.0.0已移除。仅兼容探针可演示；新服务禁止发送。不凭此新建第二套思考组件。',False,'legacy')
ev('AGUI-STATE-001','STATE_SNAPSHOT','共享状态快照','state',['empty-state','snapshot-applied'],[event('STATE_SNAPSHOT',snapshot={'query':'知识库','count':0})],'替换共享state；不是助手正文，禁止自动把整个state渲染成卡。',False)
ev('AGUI-STATE-002','STATE_DELTA','共享状态 JSON Patch','state',['snapshot-applied','patched','invalid-patch'],[event('STATE_SNAPSHOT',snapshot={'query':'知识库','count':0}),event('STATE_DELTA',delta=[{'op':'replace','path':'/count','value':2}])],'RFC6902 add/remove/replace/move/copy/test；错误路径/原型污染须拒绝，不默默重置共享状态。',False)
ev('AGUI-STATE-003','MESSAGES_SNAPSHOT','会话消息快照','state',['empty-messages','history-loaded','updated-snapshot'],[event('MESSAGES_SNAPSHOT',messages=[{'id':'u1','role':'user','content':'如何组织知识库？'},{'id':'a1','role':'assistant','content':'按主题建立索引。'}])],'替换完整消息列表；保持ID身份，不与实时消息双份叠加。历史与实时呈现同形。')
ev('AGUI-ACTIVITY-001','ACTIVITY_SNAPSHOT','活动数据快照','activity',['no-activity','activity-stored','unknown-activity'],[event('ACTIVITY_SNAPSHOT',messageId='activity-1',activityType='demo.progress',content={'done':0,'total':2})],'activityType是应用自定义类型，协议没有默认进度组件。Mimir当前未定义白名单→只在协议沙盒看数据，产品不凭空展示。',False,'unsupported')
ev('AGUI-ACTIVITY-002','ACTIVITY_DELTA','活动数据 JSON Patch','activity',['activity-stored','activity-patched','invalid-patch'],[event('ACTIVITY_SNAPSHOT',messageId='activity-1',activityType='demo.progress',content={'done':0,'total':2}),event('ACTIVITY_DELTA',messageId='activity-1',activityType='demo.progress',patch=[{'op':'replace','path':'/done','value':1}])],'先有对应messageId/activityType快照；后续patch不接到正文。未注册类型不执行生成UI。',False,'unsupported')
ev('AGUI-EXT-001','RAW','供应商原始事件','extension',['received','ignored-by-visible-ui'],[event('RAW',source='demo-provider',event={'type':'provider.heartbeat'})],'只作为受限数据检查；禁止任意HTML/JS渲染。RAW不等于错误，不创造产品组件。',False)
ev('AGUI-EXT-002','CUSTOM','命名业务事件','extension',['received','known-dispatched','unknown-ignored'],[event('CUSTOM',name='mimir.citations',value={'citations':[]})],'CUSTOM只是扩展信封；只有白名单Mimir业务事件有产品语义，未知名称不报假成功或显示JSON。')
sub=[event('SUBAGENT_STARTED',subagentRunId='sub-1',name='researcher',description='查找资料'),event('TEXT_MESSAGE_START',messageId='sub-answer',role='assistant',subagentRunId='sub-1'),event('TEXT_MESSAGE_CONTENT',messageId='sub-answer',delta='找到两份资料。',subagentRunId='sub-1'),event('TEXT_MESSAGE_END',messageId='sub-answer',subagentRunId='sub-1'),event('SUBAGENT_FINISHED',subagentRunId='sub-1',outcome={'type':'success'})]
for i,(t,title,st) in enumerate([('SUBAGENT_STARTED','子Agent启动',['idle','subagent-running']),('SUBAGENT_FINISHED','子Agent完成/挂起',['subagent-running','success','suspended']),('SUBAGENT_ERROR','子Agent失败',['subagent-running','error'])],1):
 seq=sub if i!=3 else sub[:-1]+[event(t,subagentRunId='sub-1',message='子任务失败',code='DEMO')]
 ev(f'AGUI-SUB-{i:03}',t,title,'subagent',st,seq,'subagentRunId是一次调用身份；不能把子Agent终态误当根run结束，嵌套需parentSubagentRunId。Mimir目前无多Agent可执行宿主，数据沙盒展示，不宣称已接通。',False,'unsupported')
# Message representations and envelopes are distinct from SDK UI parts.
for id,title,states,notes,acts in [
 ('AGUI-MSG-001','消息角色与历史边界',['developer','system','user','assistant','tool','activity','reasoning'],'两版本共有7个消息role；system/developer为上下文，不显示成用户气泡；reasoning/activity有独立语义。',['逐一选择角色']),
 ('AGUI-MSG-002','正文与富文本',['plain','markdown','partial-markdown','code','table','link','long-content'],'Markdown/代码块/表格是text渲染，不是独立AGUI事件。复制失败与链接安全由宿主实现。',['切换文本样本','复制代码','打开安全链接']),
 ('AGUI-MSG-003','图片内容',['loading','loaded','broken','open-original','unsafe-url'],'user content支持image，v1.0工具结果也可多媒体；图片缩略与原图交互保留v4。',['打开原图','模拟读取失败']),
 ('AGUI-MSG-004','音频内容',['loading','ready','playing','paused','error','unsupported-mime'],'协议携带audio源，不规定播放器；v4现为文件/音频呈现，增加播放器行为需单独认可。',['播放/暂停沙盒样例','模拟无效来源']),
 ('AGUI-MSG-005','视频内容（能力边界）',['supported-source','unsupported-renderer','unsafe-source'],'core支持video并不等于当前Mimir聊天已有视频播放能力；沙盒明确标注未接通，不新增产品承诺。',['切换来源样本']),
 ('AGUI-MSG-006','文档内容 / UI文件附件',['pending','ready','expired','download','unsafe-url'],'AGUI类型叫document，assistant-ui的file/source/image/audio是SDK视图part；不能一一冒充协议type。标准临时附件生命周期另有24个v4状态。',['查看文档名称','下载安全来源','模拟过期']),
 ('AGUI-MSG-007','来源引用 / data映射',['known-citations','unknown-data','source-url','source-document'],'source/file/data/generative-ui/quote不是core ContentPart枚举。来源来自mimir.citations或SDK映射；未知data禁止展示任意对象。',['选择引用','键盘跳转依据']),
 ('AGUI-MSG-008','多媒体来源信封',['data-source','url-source','file-source','unsafe-source'],'0.0.59为data/url；1.0 PartSource还有file source。大小/MIME/安全URL与模型视觉能力是宿主守卫。',['切换来源','拒绝不安全来源']),
 ('AGUI-ENV-001','请求信封 / 身份关联',['new-run','parent-run','resume-run','invalid-id'],'RunAgentInput含threadId/runId/messages/tools/context/state/forwardedProps/resume；1.0 protocolVersion新增。不能用模型显示名代替真实绑定ID。',['查看请求','模拟不匹配身份拒绝']),
 ('AGUI-ENV-002','metadata / usage / 能力声明',['metadata-present','usage-present','unknown-keys','capability-missing'],'metadata为附加信息，不自动出UI。usage是运行记账，缺失/null不得当0；capabilities声明不是已实现证明。',['切换账本样本','查看不可用原因']),
]:add(id,title,'content' if id.startswith('AGUI-MSG') else 'envelope',[],states,acts,notes,kind='protocol-shape',example=[S]+text+[F])
# HITL/resume is RUN_FINISHED outcome plus a new request, never an imaginary INTERRUPT event.
for id,title,states,actions,notes in [
 ('AGUI-HITL-001','中断与待确认工具',['running','interrupt-pending','expanded'],'查看中断/展开工具','RUN_FINISHED outcome.type=interrupt含非空interrupts；暂停后不继续追加本轮事件。工具审批不能由普通addToolResult偷换。'),
 ('AGUI-HITL-002','确认/拒绝/取消中断',['pending','resolved','cancelled','expired'],'确认或取消','resume为下一个run输入；entry包含interruptId/status/payload。UI批准/拒绝应映射payload或cancelled按工具合同，不把拒绝伪装成功。'),
 ('AGUI-HITL-003','客户端工具 / 画布版本守卫',['pending','validating','executing','stale','failed'],'校验并执行','Mimir原始文档/版本/轮次/源寿命守卫保留；重复interruptId不得再次执行；无执行句柄不能降级执行。'),
 ('AGUI-HITL-004','工具结果续传失败恢复',['tool-complete','resume-sending','resume-failed','retrying','resumed'],'重送缓存结果','续轮HTTP失败可重送缓存工具结果，不能重跑有副作用的画布工具；重试前复核当前画布版本。'),
 ('AGUI-HITL-005','多个/过期/未知中断',['multiple-pending','expired','unknown','partially-addressed'],'选择中断并测试恢复','每个待处理中断都须有对应resume；未知/过期/缺条目要诚实阻止，禁止双重提交。'),
 ('AGUI-HITL-006','停止与画布已修改',['executing','cancel-requested','cancelled','partial-draft','cancel-failed'],'停止/保留/丢弃/回退','Abort、取消中断、保留写作草稿、回退本轮画布是不同动作；停止不能声称自动撤销已执行修改。'),
]:add(id,title,'hitl',['RUN_FINISHED','RUN_STARTED','TOOL_CALL_RESULT'],states,[actions],notes,kind='protocol-and-host',example=[S,event('RUN_FINISHED',threadId='demo-thread',runId='demo-run',outcome={'type':'interrupt','interrupts':[{'id':'interrupt-1','reason':'tool-approval','message':'是否执行此工具？','toolCallId':'tool-1'}]})])
# Explicit business extensions, with the trace retirement shown as an invariant.
for id,name,title,states,notes in [
 ('MIMIR-001','mimir.conversation','会话真实ID交接',['temporary','created','url-retained'],'保留真实会话ID与正在进行流，禁止更新URL导致重挂载丢消息。'),
 ('MIMIR-002','mimir.citations','依据列表与原文导航',['empty','list','hover','focus','navigate'],'保留来源通道、摘要、原文定位、返回对话及跨文档未保存守卫。'),
 ('MIMIR-003','mimir.failure','分类失败与恢复出路',['rate-limit','timeout','truncated','network','retry','restore','search-only'],'失败先于RUN_ERROR发送；失败与停止互斥；受限操作/截图只检索禁止不隐藏原因。'),
 ('MIMIR-004','mimir.documentAgent','跨格式Agent状态',['running','completed','failed','stopped','stale'],'保留多格式Agent/媒体/创建文档/续传/画布版本守卫，当前规范documentAgent优先。'),
 ('MIMIR-005','mimir.docxAgent','DOCX历史兼容状态',['historical','mapped','unsupported-stale'],'仅历史兼容；不得与documentAgent双重显示或绕开权限。'),
 ('MIMIR-006','mimir.trace','检索自定义过程完全删除',['event-received','not-rendered','not-reconstructed'],'用户已明确删除。live/history/schema/UI全链退出，不从STEP/STATE/ACTIVITY重新构造同款过程卡。'),
]:add(id,title,'business',['CUSTOM'],states,['播放已知业务事件','切换未知事件检查'],notes,'removed' if name=='mimir.trace' else 'planned',name!='mimir.trace','mimir-custom',example=[S,event('CUSTOM',name=name,value={}),F],evidence=['packages/shared/src/conversations.ts:172','packages/chat/src/runtime/history.ts:52','packages/chat/src/parts/data-parts.ts:106','apps/server/src/services/assistant-stream.ts:286'])
# Host interactions preserve v4 semantics despite changing view library.
host=[
 ('UI-001','输入编辑、换行、输入法',['empty','focus','typing','multiline','composing'],'输入 / Enter / Shift+Enter / Escape','Enter发送，Shift+Enter换行；IME组合确认不误发送；空闲Escape不丢草稿。','CHAT-007'),
 ('UI-002','发送、准备与参数冻结',['ready','preparing','running','complete','rejected'],'点击发送 / Enter','发送开始即冻结文字/附件/范围/deepReasoning；异步附件完成后不得读取新设置。','CHAT-008,ATT-001'),
 ('UI-003','停止生成与部分回答',['streaming','stopping','stopped','empty-stopped','error'],'点击停止 / Escape层级','保留部分正文；错误不能显示已停止；pending附件取消保留原草稿。','CHAT-015'),
 ('UI-004','追问队列与取回',['running','queued-A','queued-B','dispatch-A','restore','failure'],'生成中Enter排队 / 取回','A/B保留入队冻结参数；后改C不影响A/B。停止/失败按v4取回首条，用户新草稿不能被覆盖。','CHAT-014,CHAT-044'),
 ('UI-005','滚动、回底与焦点',['pinned','scrolled-away','new-content','scroll-bottom','keyboard-focus'],'滚离底部 / 回到底部','用户离底时不抢滚动，回底按钮键盘可用；流更新不抢输入焦点。','CHAT-006'),
 ('UI-006','消息编辑与分支切换',['view','editing','cancelled','saved','branch-prev','branch-next'],'编辑 / 保存 / 取消 / 前后分支','保留v4官方编辑和分支交互；需明确真实消息树与API能力，不能只改展示文字。','CHAT-005'),
 ('UI-007','复制回答/代码与失败反馈',['idle','copying','copied','failed'],'点击复制','复制成功短暂反馈；失败明确重试，代码仅复制正文。失败/未完Agent不开放不适用动作。','CHAT-019,CHAT-023'),
 ('UI-008','重新生成与历史重试',['complete','retry-ready','running','failed'],'重新生成 / 重试','按v4上一问定位并使用明确冻结/当前参数合同；运行中不得并发覆盖。','CHAT-029'),
 ('UI-009','推理与工具折叠',['collapsed','expanded','running','complete','empty','long'],'Enter/Space开合','初始开合和结束行为与v4一致；手动选择不被流更新反复重置。','CHAT-017,CHAT-020'),
 ('UI-010','临时附件上传、移除、取消',['preparing','ready','failed','removed','cancelled','expired'],'添加文件 / 移除 / 取消准备','与知识库永久导入分离；pending不可假装已发送，失败保留可恢复内容。','ATT-001'),
 ('UI-011','附件限制、能力与历史',['unsupported','size-limit','count-limit','total-limit','text-limit','no-vision','search-only','history-expired'],'选择边界文件 / 查看原因','24个v4 ATT状态全保留；拟定大小不能宣传为已接API政策；历史过期明确不能恢复本地字节。','ATT-001'),
 ('UI-012','图片/文件预览与安全下载',['thumbnail','expanded','load-error','safe-link','unsafe-link'],'预览 / 关闭 / 下载','Esc关闭后回到原触发器；仅安全来源可开，坏图可恢复；禁止javascript/file任意协议。','CHAT-031,CHAT-032'),
 ('UI-013','模型只读菜单和管理入口',['closed','open','missing','same-name','long-name','manage-model'],'打开菜单 / Tab / Arrow / Escape','展示全局chat/reasoning绑定，只读；管理跳转。不能变成临时任意模型切换。','CHAT-012'),
 ('UI-014','标准/深入思考强度',['standard','deep','side-standard-disabled','open','dismiss'],'选择标准/深入','deepReasoning是角色路由布尔值，不是provider reasoningEffort；侧栏固定标准。','CHAT-011'),
 ('UI-015','范围全库/单文档',['all','single','loading','empty','error','long-title','replace','remove'],'打开范围 / 选择单文档 / 取消','最近20候选，全库或单篇；不是多知识库多选。焦点和原草稿稳定；重试读取诚实。','CHAT-009,CHAT-010'),
 ('UI-016','容量用量浮层',['missing','partial-null','known','open','closed'],'打开用量 / Escape','未知用量不假报0；数据浮层关闭回焦，窄栏不溢出。','CHAT-013'),
 ('UI-017','回答保存笔记',['eligible','saving','saved','failed','open-note','ineligible'],'保存 / 打开笔记 / 重试','只保存已落库成功回答；写入失败可重试；不得把错误正文保存成笔记。','CHAT-022,HOST-010'),
 ('UI-018','历史读取、列表、切换',['loading','empty','loaded','selected','error','cached-refresh-error'],'选择会话 / 重读','切换真实历史与首次建会话区分；历史失败不伪装暂无会话，正在流保留。','CHAT-004,HOST-002,HOST-003,HOST-004,HOST-005'),
 ('UI-019','空态、快捷建议与草稿交接',['empty','suggestion-focus','prefill','sent','consumed','expired'],'点建议 / 新建 / 预填','建议append也要冻结参数；宿主草稿一次消费，刷新寿命边界如实展示。','CHAT-001,CHAT-002,CHAT-003,HOST-001,HOST-007,HOST-008,HOST-015'),
 ('UI-020','侧栏开关、导航、抽屉与离开保护',['wide','narrow','drawer','hidden-running','reopened','unsaved','return-focus'],'开关助手 / Tab循环 / Escape','关闭保活且生成继续；覆盖态焦点循环、Esc层级与关闭回焦，未保存确认保留。','HOST-006,HOST-014,HOST-016,HOST-017,HOST-018'),
 ('UI-021','引用导航与跨篇守卫',['source-list','hover','keyboard-focus','same-doc','cross-doc','unsaved'],'打开依据 / 返回','来源pill是UI语义，不是AGUI Source事件；保留原文定位与取消离开。','CHAT-021,CHAT-030,HOST-009,HOST-019'),
 ('UI-022','Agent能力、句柄与轮次寿命',['detecting','failed','no-model','no-executor','canvas-not-ready','ready','stale'],'检测 / 重试 / 开始执行','主对话只读上下文不等于执行句柄；文档/版本/格式/轮次全部匹配才执行。','CHAT-034,CHAT-046,HOST-020,HOST-021,HOST-022,HOST-025'),
 ('UI-023','Agent截图冻结/取回/失败隔离',['draft','removed','frozen','queued','stale','restore-empty','restore-busy','failed'],'截图发送 / 排队 / 取回 / 重试','真实PNG受源页/版本/视觉/执行器/尺寸/四份保护约束；通用附件不冒充截图。','CHAT-042,CHAT-043,CHAT-044,CHAT-045,HOST-023'),
 ('UI-024','Agent媒体选择与原件分析',['picker-open','cancelled','selected','analyzing','failed','source-changed'],'选择媒体 / 取消 / 分析','本地媒体原件与聊天附件分离；选择期间画布变化拒绝执行。','CHAT-037,CHAT-046,HOST-024'),
 ('UI-025','Agent部分草稿、回退与新文档交接',['partial','keep','discard','rollback','created','saved-unparsed','open','stale'],'保留 / 丢弃 / 回退 / 打开新文档','真实画布是否已改如实说明，后续人工修改阻止旧回退；解析失败不丢已保存文件。','CHAT-038,CHAT-039,CHAT-040'),
 ('UI-026','Agent历史与取消待处理',['pending','completed','failed','cancelled','cancel-failed'],'打开原文档 / 取消待处理','历史仅工具名和状态摘要；不可在普通历史消息中自动执行工具。','CHAT-041'),
 ('UI-027','主题、窄屏、减少动态与可访问性',['light','dark','narrow','long-label','zoom','reduced-motion'],'切换主题 / 窄容器 / 键盘全遍历','只换视觉，组件状态/可操作性/语义/焦点/布局稳定都保持；无hover抖动。','HOST-013'),
 ('UI-028','失败分类、只检索与放回输入框',['rate-limit','timeout','truncated','network','retry','restore','search-only','blocked'],'重试 / 放回输入框 / 只检索','截图/Agent模式禁止的操作要明确原因；恢复图文与目标，已有新草稿不覆盖。','CHAT-024,CHAT-025,CHAT-026,CHAT-027,CHAT-028'),
 ('UI-029','标准聊天附件与Agent入口隔离',['normal-chat','agent-disabled','snapshot-only','switch-mode'],'切换宿主场景','标准附件纳入规划；Agent当前只认可截图或受控媒体，不把KB导入当附件或越过执行边界。','ATT-001'),
 ('UI-030','检索旧过程永久退役',['legacy-history','legacy-live','no-trace-ui'],'载入旧trace样本','不渲染、不重建mimir.trace；真实reasoning/tool保留。','CHAT-016'),
]
for id,title,states,actions,notes,groups in host:
 add(id,title,'host-interaction',[],states,[actions],notes,kind='host',evidence=['.trellis/tasks/10-18-interaction-chat/prototype/v4/thread-extended.tsx','.trellis/tasks/10-18-interaction-chat/prototype/v4/main.tsx','.trellis/tasks/10-18-interaction-chat/prototype/v4/composer-send-intent.ts','.trellis/tasks/10-18-interaction-chat/prototype/v4/scenes.json']);items[-1]['v4Groups']=groups.split(',')
sc=json.loads((P/'prototype/v4/scenes.json').read_text());print(type(sc['scenes']).__name__)
parity=[]
for x in sc['scenes']:
 parity.append({'id':x.get('id'), 'title':x.get('label',x.get('title','')), 'source':x,'status':'must-preserve-or-explicit-boundary','verified':False})
covered=set(t for x in items for t in x['events']);events=set(manifest['0.0.59']['events']);assert events<=covered,events-covered
out={'version':'agui-v5-catalog-1','date':'2026-10-19','scope':'planning; protocol catalog plus v4 interaction parity, no product implementation','protocolVersions':{'client':'@ag-ui/client + core 0.0.59','server':'@tanstack/ai 0.68.0 uses @ag-ui/core 1.0.0','officialCommit':'81b2aa46a194ee07a3b215cae1f733f68e5d2927'},'eventCounts':{v:len(x['events']) for v,x in manifest.items()},'eventSets':{v:x['events'] for v,x in manifest.items()},'principles':['AGUI is an event/data protocol, not a fixed component library','TanStack runtime extensions and Mimir CUSTOM do not become standard AGUI events','No event present does not imply implemented engine or host capability','All v4 routes retained; 403 entries are coverage requirements, not 403 executed browser tests','mimir.trace must be removed, never reconstructed from steps or state'],'items':items,'v4Parity':{'version':'chat-review-v4','groups':72,'routes':403,'reviewSha256':'72e2ca29620a90e6dc2a777a7621ddbda0511a79589423279378ef8c3c9128ce','threadSha256':'5ed483d87152181feb52f39571ba1ea2fe375404ea9f7eb61b66a99a5ff0af7e','routesDetail':parity},'counts':{'items':len(items),'eventItems':36,'hostItems':len(host),'v4Routes':len(parity)}}
(R/'agui-v5-interaction-catalog.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n');print(json.dumps(out['counts']))
