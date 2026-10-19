import json
from pathlib import Path
root=Path(__file__).resolve().parent
package=json.loads((root/'../../research/chat-package-inventory.json').read_text())
host=json.loads((root/'../../research/chat-host-inventory.json').read_text())
tracks=['empty','sidebar','draft','history','messages','scroll','composer','send','scope','scope','strength','model','usage','queue','stop','trace','reasoning','markdown','code','tool','citations','save','copy','failure','failure','failure','failure','recovery','recovery','sources','files','images','audio','agent','agent-stop','agent-resume','agent-media','agent-draft','agent-undo','agent-create','agent-history','snapshot','snapshot-validation','snapshot-queue','snapshot-retry','agent-service']
hosttracks=['empty','send','history','history-error','history-nav','navigation','search-handoff','draft','citation-handoff','save','scope','model','layout','sidebar','sidebar','draft','sidebar-lifetime','sidebar-overlay','citation-handoff','capability','capability','agent-boundary','snapshot','agent-service','agent-end']
labels={'empty':'开始提问','sidebar':'文档助手','draft':'草稿交接','history':'历史会话','messages':'消息层级','scroll':'消息滚动','composer':'输入与键盘','send':'发送与生成','scope':'检索范围','strength':'思考强度','model':'全局模型','usage':'上下文容量','queue':'追问队列','stop':'停止生成','trace':'检索过程（提案删除）','reasoning':'模型思考','markdown':'回答正文','code':'代码复制','tool':'工具消息','citations':'原文引用','save':'存为笔记','copy':'复制结果','failure':'分类失败','recovery':'重试恢复','sources':'外部来源','files':'附件消息','images':'图像消息','audio':'音频消息','history-error':'读取恢复','history-nav':'历史导航','navigation':'导航交接','search-handoff':'搜索交接','citation-handoff':'引用交接','layout':'主题布局','sidebar-lifetime':'助手保活','sidebar-overlay':'助手覆盖','capability':'编辑能力','agent-boundary':'执行边界','agent':'Agent执行','agent-stop':'Agent停止','agent-resume':'工具续轮','agent-media':'媒体选择','agent-draft':'部分草稿','agent-undo':'画布回退','agent-create':'新文档交接','agent-history':'工具历史','snapshot':'截图草稿','snapshot-validation':'截图校验','snapshot-queue':'截图队列','snapshot-retry':'带图恢复','agent-service':'格式工具交接','agent-end':'运行结束'}
proposals={
'empty':'保留问候与输入的居中舞台；标题23px/常规字重、细边框输入盒，给出键盘提示。短高与放大时完整内容可滚动。',
'sidebar':'保留本篇范围和三枚直接发送的快捷问；清晰分开指南、能力状态与输入，侧栏固定标准强度。',
'draft':'把交接内容保留为可编辑草稿，不自动发送；同草稿只消费一次，新草稿显式替换。失效截图保留原因与文字。',
'history':'骨架、实际消息和错误各自清楚；失败不退化为新对话空态，切换与刷新保留会话寻址合同。',
'messages':'按问题、正文、依据、动作分层；真实模型思考与实际工具调用复用官方组件，自定义检索过程完全移除；动作仅用于最后一条成功非空回答。零内容流失败仍显示恢复入口。',
'scroll':'保留离底才显的返回按钮和输入区分隔，焦点可见且图标居中；减少动态时直接滚动。',
'composer':'使用批准字段色：默认#e7e9e8、hover#bfc5c1、focus#00a35f，始终1px且无叠加光晕。保留Enter发送/生成中排队、Shift+Enter换行和IME守卫。',
'send':'空闲发送/运行停止共用32px位置，生成中可编辑且Enter排队。建立与校验失败保留问题；原型只手工模拟请求结算。',
'scope':'范围菜单明确加载、失败、空、选项；长标题省略且可获完整名称，选中标签可移除。保持本轮范围而不变更知识库。',
'strength':'标准/深入各用现有全局角色模型；选择和焦点明确。侧栏隐藏入口并始终标准发送。',
'model':'两条全局绑定只读展示，勾号紧随名称、同名保留读屏角色；管理模型明确交接设置页，不新增会话级切换。',
'usage':'仅有真实记账才展示，用量浮层保持清楚的分母和来源说明；无数据不伪造0，侧栏不补容量入口。',
'queue':'首条排队稳定成行，生成中Enter排队、鼠标停止；取回/停止/失败按现有语义还原首条，队列范围在入队时冻结。',
'stop':'用户停止用中性提示，部分正文可回看；和模型失败卡互斥，不为停止回答开放成功动作。',
 'trace':'按用户明确选择完全删除自定义 mimir.trace：不展示检索步骤、轮次、工具计数、耗时或替代过程行。七个旧状态保留当前列和来源，打磨后统一标为删除；首个正文前仅使用官方消息运行指示。',
'reasoning':'仅当模型实际返回 reasoning part 时，原样复用固定版本 assistant-ui 官方 ReasoningRoot/Trigger/Content/Text；保留官方流式开合、手动控制与内部滚动，不把检索事件转成思考。',
'markdown':'沿用真实Markdown层级，代码/表格各自横向滚动，正文链接可键盘访问；流式半截保留稳定行高。',
'code':'保留语言头和复制按钮，复制成功/失败分别反馈。当前实现复制失败静默，提案补可见失败与手动复制出路。',
 'tool':'仅实际 tool-call 使用固定版本 assistant-ui 官方 ToolFallback Root/Trigger/Content/Args/Result/Error；保留原始参数与结果，沿用官方英文文案、状态图标与开合，不由检索计数伪造工具调用。',
'citations':'通栏脚注式引用保留标题、原文摘要与命中通道；1px焦点不改变几何，长标题与未知通道诚实展示。',
'save':'只保存最后成功非空回答，保存中禁用重复提交，失败回答保留并可重试；成功动作转为打开笔记，不等同原件保存。',
'copy':'成功和失败反馈可辨；只检索复制原文和来源，普通回答仅复制正文；不复制工具JSON或错误原文。',
'failure':'四类失败各自保留真实可用出路，暂未实现的动作明确禁用。历史未知强度统一按标准重试，提示与实际参数一致。',
'recovery':'分类失败与连接中断互斥。空parts连接失败仍可重试/取回；历史重试固定标准并明确提示，只检索按当前实现回全库。',
'sources':'URL来源与没有链接的文档来源区分，安全新标签页与读屏提示保留；没有可跳转地址不画伪链接。',
'files':'文件名与下载动作独立对齐，安全协议才能下载；超长名称不挤走下载按钮，保留MIME图标合同。',
'images':'图片限制为容器内最大320px，读取失败明确提示，可通过原图交接恢复；当前图片没有错误状态与max-width:100%，提案补齐。',
'audio':'音频仍是可下载文件chip；按MIME区分，不新增主对话录音、通用上传或原生播放。',
'history-error':'将过度保证的当前错误文案收敛为“暂时无法读取这段对话，请重试”；重复失败保留清楚恢复入口。',
'history-nav':'沿已批准导航外壳保留加载、首次错误、缓存刷新失败和相对时间；当前项与长标题可定位，不新增改名/删除。',
'navigation':'窄栏保留64px紧凑导航，临时抽屉与未保存离开守卫分别处理；不更改长期折叠偏好。',
'search-handoff':'“只预填问题，不自动发送”与箭头、按钮同轴居中；等待/IME禁用，确认离开后才预填新对话。',
'citation-handoff':'同篇原地高亮，跨篇遵守未保存守卫；主对话打开原文后可返回原会话，真实定位归文档模块。',
'layout':'主对话850px列含40px边距、助手400px含16px边距；浅深主题统一继承，窄屏换行不遮住发送键。',
'sidebar-lifetime':'同篇隐藏保持会话运行，重开返回相同草稿；关闭不等于停止。离开当前文档释放旧运行时并拒绝迟到写入。',
'sidebar-overlay':'按文档容器宽度进入覆盖态，Tab循环、Escape层级和回焦保持；减少动态取消宽度过渡。',
'capability':'明确检测/错误/无模型/无画布/无执行器/就绪，错误可重试；AI修订只影响DOCX下一轮，工具就绪不等于自动保存。',
'agent-boundary':'只让当前同篇同格式的就绪句柄执行；草稿检查句柄没有写授权，主对话只读；失效结果显示具体原因。',
'agent':'保持中断结束后执行和去重；桥状态作为独立能力区，工具诊断作为消息部件，不把执行状态塞入伪正文。',
'agent-stop':'停止中/成功/失败分开反馈；已经落画布修改仍未保存，有部分写作草稿时保留/丢弃选择，不自动回退。',
'agent-resume':'明确“工具已执行，正在续传结果”；仅重发缓存不重跑工具，重试loading防重入，版本变化拒绝旧提交。',
'agent-media':'只在工具明确请求时呈现图片/音频/视频选择，原图读取和系统取消都有边界；不新增主对话附件上传。',
'agent-draft':'中断后明确部分草稿仍在画布；保留/丢弃沿原合同，提案增加进行中防重入，失败保留选择，过期拒绝覆盖。',
'agent-undo':'回退只作用本轮；后续人工修改时明确不能安全回退。提案增加处理中防重入，失败不假称撤销或保存。',
'agent-create':'文件真实创建后才给打开入口；已保存但解析失败单独提示。取消后不自动跳转，也不删除已创建文件。',
'agent-history':'历史仅展示工具名、状态和是否修改画布，不重现Args/Result。待处理中断只能打开原件核对或取消，不能伪恢复执行。',
'snapshot':'单页内存截图与文字一起交接，移除保持文字。无模型仍可预览，发送前需真实视觉及执行能力，图片为原型示意。',
'snapshot-validation':'目标、视觉、数量、PNG尺寸、容量与内存上限分别给具体原因；关提示不会绕过下次发送校验，原图文保持可见。',
'snapshot-queue':'入队冻结图文/目标，派发重新校验；空输入自动恢复，有新草稿时保留新输入并在失败消息保留原截图，不泛化为所有取回路径。',
'snapshot-retry':'重试定位失败轮原截图，失效要求重新准备；禁止只检索丢图，移除本附件校验不清普通传输错误。',
'agent-service':'媒体、写作、当前画布和导出保留现有工具合同；原型只展示共用桥交接，不新增格式工具或模型服务。',
'agent-end':'结束/失败/停止均刷新导航；画布改动标记未保存，人工继续编辑会让旧结果失效，不新增聊天自动保存。'
}
def recipe(track):
 return dict(sidebar=False,phase='complete',menu='none',dialog='none',draft='',queued='',scope=False,deep=False,snapshot=False,snapshotIssue='',failure='',searchOnly=False,saving=False,saved=False,copyStatus='idle',loadError=False,docsRead='loaded',historyRead='loaded',capability='',revision=False,hidden=False,navOpen=False,viewingSource=False,agentStage='completed',manualChanged=False,noVision=False,noModel=False,longModel=False,sameModel=False,usage=False,longTitle=False,longFile=False,unknownChannel=False,noHref=False,unsafeFile=False,docx=False,trace=True,traceOpen=False,reasoning=False,reasoningOpen=False,richText=False,media=False,noCitations=False,emptyAnswer=False,saveError=False,multiTurn=False,scrollAway=False,historyMode=False,guarded=False,canSave=False,searchBlocked=False,agentChanged=False,toolName='update_document',toolOpen=False,mediaKind='image',autofocus=False,snapshotOnlyError=False,trackBoundary='',special='',specialState='',currentDefect='')
def chat_ui(n,s,track):
 u=recipe(track)
 if n in [2,34,35,36,37,38,39,40,42,43,44,45,46]:u.update(sidebar=True,scope=True,capability='ready')
 if n in [1,2,3,7,9,10,11,12,13,42,43]:u.update(phase='empty',trace=False)
 if n==1:
  u.update(autofocus=True,scope=s=='document');u['phase']='searching' if s=='sent' else 'empty';u['special']='short' if s=='overflow' else ''
 if n==2:
  u.update(phase='complete' if s=='answered' else 'empty',snapshot=s=='snapshot')
 if n==3:
  u.update(draft='关于这篇里这段：“知识的价值在于联系。”' if s not in ['context'] else '',scope=s in ['context','replacement'],special='draft-consume',specialState=s,snapshot=s=='snapshot-rejected',snapshotIssue='截图对应的文档、页面或版本已变化，请重新点击“美化本页”。' if s=='snapshot-rejected' else '')
 if n==4:
  u.update(phase='loading' if s=='loading' else 'empty' if s in ['new','missing'] else 'complete',loadError=s=='rejected',special='history',specialState=s)
 if n==5:
  u.update(phase='searching' if s=='placeholder' else 'stopped' if s=='empty-settled' else 'error' if s=='blocked' else 'complete',multiTurn=s=='last',emptyAnswer=s in ['placeholder','empty-settled'],failure='timeout' if s=='blocked' else '')
 if n==6:u.update(scrollAway=s in ['away','focus','return'],multiTurn=True,special='scroll',specialState=s)
 if n==7:u.update(draft='' if s in ['empty','focus','escape-idle'] else '第一行问题\n第二行补充说明' if s=='multiline' else question,autofocus=s in ['focus','typed','ime'],special='composer',specialState=s)
 if n==8:u.update(phase={'ready':'empty','creating':'creating','running':'streaming','completed':'complete','create-failed':'error','guard-rejected':'empty'}[s],draft=question if s in ['ready','guard-rejected'] else '',failure='stream' if s=='create-failed' else '',emptyAnswer=s=='create-failed',snapshotIssue='发送前校验未通过，草稿仍在。' if s=='guard-rejected' else '',special='send',specialState=s)
 if n==9:u.update(menu='none' if s in ['all','dismiss'] else 'scope',docsRead=s if s in ['loading','error','empty'] else 'loaded')
 if n==10:u.update(scope=s!='remove',longTitle=s=='long',menu='scope' if s=='replace' else 'none',phase='streaming' if s=='queued' else 'empty',queued=followup if s=='queued' else '')
 if n==11:u.update(deep=s=='deep',menu='strength' if s=='menu' else 'none',sidebar=s=='hidden')
 if n==12:u.update(deep=s=='reasoning',menu='model' if s in ['menu','missing','same-name','long','manage'] else 'none',noModel=s=='missing',longModel=s=='long',sameModel=s=='same-name')
 if n==13:u.update(usage=s!='hidden',menu='usage' if s in ['popover','unknown-input'] else 'none',special='usage',specialState=s)
 if n==14:u.update(phase='stopped' if s=='stop' else 'error' if s=='failed' else 'searching' if s=='auto' else 'streaming',queued=followup if s in ['queued','multiple'] else '',draft=followup if s in ['retrieve','stop','failed'] else '',failure='stream' if s=='failed' else '',special='queue',specialState=s)
 if n==15:u.update(phase='streaming' if s=='stop' else 'error' if s=='failure-distinct' else 'stopped',failure='offline' if s=='failure-distinct' else '',emptyAnswer=s=='empty',draft=followup if s=='after' else '',special='stop',specialState=s)
 if n==16:u.update(phase='searching' if s=='waiting' else 'streaming' if s in ['live','manual'] else 'complete',trace=s!='absent',traceOpen=s in ['live','scroll'],searchOnly=s=='search',special='trace',specialState=s)
 if n==17:u.update(reasoning=s!='empty',reasoningOpen=s in ['live','toggle','long'],phase='streaming' if s=='live' else 'complete',special='reasoning',specialState=s)
 if n==18:u.update(richText=True,phase='streaming' if s=='partial' else 'complete')
 if n==19:u.update(richText=True,copyStatus='copied' if s=='copied' else 'error' if s=='failure' else 'idle',special='code',specialState=s,currentDefect='code-copy' if s=='failure' else '')
 if n==20:u.update(special='tool',specialState=s,toolOpen=s in ['expanded','long'],agentStage='running' if s=='running' else 'failed' if s=='failed' else 'completed',phase='streaming' if s=='running' else 'complete',toolName='search_knowledge')
 if n==21:u.update(noCitations=s=='empty',unknownChannel=s=='channels',special='citations',specialState=s)
 if n==22:u.update(saving=s=='saving',saved=s in ['saved','open'],saveError=s=='error',phase='stopped' if s=='hidden' else 'complete')
 if n==23:u.update(copyStatus='copied' if s=='success' else 'error' if s=='failure' else 'idle',searchOnly=s=='search-only')
 if n in [24,25,26,27]:u.update(phase='error',failure={24:'quota',25:'timeout',26:'truncated',27:'offline'}[n],historyMode=s=='history',snapshot=s=='snapshot',sidebar=s=='snapshot',special='failure',specialState=s)
 if n==28:u.update(phase='searching' if s=='retry' else 'error',failure='' if s=='retry' else 'stream',draft=question if s=='refill' else '',queued=followup if s=='queued' else '',emptyAnswer=s=='zero',special='stream-error',specialState=s,currentDefect='zero-stream' if s=='zero' else '')
 if n==29:u.update(phase='streaming' if s=='running' else 'error',failure='timeout',historyMode=s in ['current-config','history-mode'],deep=s=='current-config',searchOnly=s=='search-scope',special='historical-retry',specialState=s,currentDefect='historical-mode' if s in ['current-config','history-mode'] else '')
 if n in [30,31,32,33]:u.update(media=True,special={30:'sources',31:'files',32:'images',33:'audio'}[n],specialState=s,noHref=s in ['document','fallback'],unsafeFile=s=='unsafe',longFile=s=='focus',currentDefect='image-broken' if s=='broken' else '')
 if n==34:u.update(phase='streaming' if s in ['execute','resume'] else 'complete',agentStage={'execute':'running','resume':'submitting','failed':'failed','invalid-round':'stale','unsupported':'unsupported','dedupe':'completed'}[s],special='agent-progress',specialState=s)
 if n==35:u.update(phase='stopped',agentStage='failed' if s=='cancel-error' else 'cancelled',agentChanged=True,special='agent-draft' if s=='draft' else 'agent-stop',specialState=s)
 if n==36:u.update(agentStage={'failed':'resubmit','ready':'resubmit','retrying':'submitting','success':'completed','stale':'stale','again':'resubmit'}[s],agentChanged=True,manualChanged=s=='stale',special='agent-resume',specialState=s)
 if n==37:u.update(agentStage='running' if s not in ['stale','document-image'] else 'stale' if s=='stale' else 'failed',phase='streaming',mediaKind='audio' if 'audio' in s else 'video' if 'video' in s or s=='processing' else 'image',special='agent-media',specialState=s)
 if n==38:u.update(agentStage='stale' if s=='stale' else 'completed',special='agent-draft',specialState=s,agentChanged=s=='keep')
 if n==39:u.update(special='agent-undo',specialState=s,agentChanged=True,manualChanged=s=='unsafe')
 if n==40:u.update(special='agent-create',specialState=s,agentStage='failed' if s=='invalid' else 'cancelled' if s=='stopped-after' else 'completed')
 if n==41:u.update(special='agent-history',specialState=s,agentStage='cancelling' if s=='cancelling' else 'awaiting' if s in ['pending','open','cancel-error'] else s,agentChanged=True)
 if n==42:u.update(snapshot=s!='other',draft='请在保持信息完整的前提下美化这页幻灯片。',phase='complete' if s=='sent' else 'empty',noVision=s=='no-model',special='snapshot',specialState=s)
 if n==43:
  issues={'target':'截图对应的文档、页面或版本已变化，请重新点击“美化本页”。','vision':'截图美化需要可用的聊天模型并启用视觉输入，请前往模型设置。','multiple':'每轮美化只能附一页截图，请移除多余截图。','invalid':'截图PNG无效：请使用不超过5MiB、1280×1920及2457600像素的真实PNG。','full':'已有 4 份截图等待发送，请先处理队列中的草稿。'}
  u.update(snapshot=True,draft='请美化这一页的排版。',snapshotIssue=issues.get(s,''),special='snapshot-validation',specialState=s)
 if n==44:u.update(snapshot=True,draft='我正在写一个新的问题，请保留这段文字。' if s=='stale-new' else '请美化第3页。' if s in ['retrieve','stale-empty'] else '',phase='streaming' if s in ['freeze','dispatch','tampered'] else 'error',queued='请美化第3页。' if s in ['freeze','dispatch','tampered'] else '',snapshotIssue='排队截图与原草稿不符，请重新准备。' if s=='tampered' else '截图来源已变化，原图文已保留。' if s in ['stale-empty','stale-new'] else '',failure='stream' if s=='stale-new' else '',special='snapshot-queue',specialState=s)
 if n==45:u.update(snapshot=True,phase='error',failure='stream',draft='请美化第3页。' if s in ['refill','search'] else '',snapshotIssue='截图目标已失效，请重新点击“美化本页”。' if s=='expired' else '截图美化不能只检索，请保留图片并设置视觉模型。' if s=='search' else '截图校验失败，移除只清本附件提示。' if s=='remove-validation' else '',special='snapshot-retry',specialState=s)
 if n==46:u.update(special='agent-service',specialState=s,toolName={'read-write':'update_document','image-generate':'generate_image','original-attachment':'read_original_attachment','original-media':'analyze_video','stream-writing':'write_document','export-sheet':'create_document','invalid':'update_document'}[s],toolOpen=True,agentStage='failed' if s=='invalid' else 'running' if s in ['image-generate','stream-writing'] else 'completed')
 return u
question='怎样把零散收藏整理成能反复使用的知识？'
followup='请把这些建议整理成一份三步行动清单。'
def host_ui(n,s,track):
 u=recipe(track)
 if n in [14,15,16,17,18,19,20,21,23,24,25] or n==22 and s!='main':u.update(sidebar=True,scope=True)
 if n==1:u.update(phase='complete' if s=='existing' else 'empty',draft=question if s=='prefill' else '',autofocus=s!='existing')
 if n==2:u.update(phase={'new':'empty','created':'searching','streaming':'streaming','failure':'error'}[s],draft=question if s=='new' else '',failure='stream' if s=='failure' else '')
 if n==3:u.update(phase='loading' if s in ['loading','switch'] else 'complete',special='history',specialState=s)
 if n==4:u.update(loadError=s!='recovered' and s!='retry',phase='loading' if s=='retry' else 'complete')
 if n==5:u.update(historyRead=s if s in ['loading','empty','error','stale','retry'] else 'loaded',longTitle=s=='long',phase='empty')
 if n==6:u.update(phase='empty',navOpen=s=='overlay',dialog='guard' if s=='guard' else 'none',guarded=s in ['guard','cancel'])
 if n==7:u.update(phase='empty',dialog='none' if s=='draft' else 'guard' if s=='guard' else 'search',draft='' if s=='empty' else question,searchBlocked=s=='blocked')
 if n==8:u.update(phase='searching' if s=='created' else 'empty',draft=question if s in ['memory','sidebar'] else '',sidebar=s=='sidebar',scope=s=='sidebar',special='draft-lifetime',specialState=s)
 if n==9:u.update(viewingSource=s in ['document','plain'],special='citation-handoff',specialState=s)
 if n==10:u.update(saving=s in ['lookup','save'],saved=s in ['success','open'],saveError=s in ['none','failure'],special='save-host',specialState=s)
 if n==11:u.update(phase='empty',menu='scope',docsRead='loading' if s in ['loading','retry'] else s if s in ['empty','error'] else 'loaded')
 if n==12:u.update(phase='empty',menu='model' if s in ['bound','missing','manage'] else 'usage' if s=='usage' else 'none',noModel=s=='missing',usage=s=='usage',sidebar=s=='nousage')
 if n==13:u.update(phase='empty',sidebar=s=='sidebar')
 if n==14:u.update(phase='empty',longTitle=s=='long')
 if n==15:u.update(phase='searching' if s=='ask' else 'empty',autofocus=s=='focus')
 if n==16:u.update(phase='empty',draft='关于这篇里这段：“知识的价值，在于这些联系能够随着阅读与写作逐渐生长。”' if s!='preset' else '整理当前文档的标题层级，让结构更清楚。')
 if n==17:u.update(phase='streaming' if s=='streaming' else 'complete',hidden=s in ['hidden','streaming','focus'],special='sidebar-lifetime',specialState=s)
 if n==18:u.update(phase='empty',special='sidebar-overlay',specialState=s)
 if n==19:u.update(viewingSource=s=='same',guarded=s in ['cross','guard','cancel'],dialog='guard' if s=='guard' else 'none')
 if n==20:u.update(phase='empty',capability=s if s in ['loading','error','nomodel','nocanvas'] else 'ready',docx=True,revision=s=='on')
 if n==21:u.update(phase='empty',capability='loading' if s=='retry' else s)
 if n==22:u.update(capability='ready' if s in ['same','enabled'] else 'nocanvas' if s!='main' else '',agentStage='stale' if s=='stale' else 'completed',special='agent-boundary',specialState=s,phase='empty')
 if n==23:u.update(phase='empty',draft='请在保持内容完整的前提下美化第3页。',snapshot=True,noVision=s in ['preview','blocked'],snapshotIssue='截图对应的文档、页面或版本已变化，请重新点击“美化本页”。' if s=='stale' else '',special='snapshot',specialState=s)
 if n==24:u.update(capability='ready',special='agent-service',specialState=s,mediaKind='video' if s=='media' else 'image',agentStage='failed' if s=='invalid' else 'cancelled' if s=='cancel' else 'running',toolName={'cancel':'update_document','image':'generate_image','media':'analyze_video','invalid':'read_image','create':'create_document','write':'write_document'}[s],toolOpen=True)
 if n==25:u.update(phase='stopped' if s=='stop' else 'error' if s=='failure' else 'complete',failure='offline' if s=='failure' else '',manualChanged=s=='manual',agentChanged=s in ['dirty','manual'],special='agent-end',specialState=s)
 return u
allgroups=[]; scenes=[]; coverage=[]
for kind,data,trackmap in [('chat',package,tracks),('host',host,hosttracks)]:
 for g in data['groups']:
  n=int(g['id'].split('-')[1]);track=trackmap[n-1]
  allgroups.append(dict(id=g['id'],title=g['title'],trackLabel=labels[track],track=track,firstScene=g['states'][0]['id'],stateLabels=' '.join(s['label'] for s in g['states'])))
  entry=g.get('entry',' / '.join(g.get('controls',[])))
  paths=' → '.join(g.get('transitions',[])) or entry
  mapped=[]
  for state in g['states']:
   short=state['id'].split('.',1)[1]
   ui=chat_ui(n,short,track) if kind=='chat' else host_ui(n,short,track)
   ui['trackBoundary']= 'Office / 原生 / API 为模拟交接' if ('agent' in track or 'snapshot' in track) else ''
   scenes.append(dict(id=state['id'],groupId=g['id'],label=state['label'],state=short,track=track,description=state['description'],source=g['source'],current=state['description'],proposed=proposals[track],proposedStatus='removed' if track=='trace' else 'retained',boundary=g['boundary'],path=paths,ui=ui))
   mapped.append(dict(state=short,label=state['label'],entry='review.html#scene='+state['id'],track=track,proposedStatus='removed' if track=='trace' else 'retained',ui=ui,source=g['source'],proof='source recipe + rendered component binding; not a GUI test'))
  coverage.append(dict(id=g['id'],title=g['title'],states=mapped))
(root/'scenes.json').write_text(json.dumps(dict(version='chat-review-v2',groupCount=len(allgroups),stateCount=len(scenes),groups=allgroups,scenes=scenes),ensure_ascii=False,indent=2)+'\n')
(root/'coverage.json').write_text(json.dumps(dict(version='chat-review-v2',groups=len(allgroups),states=len(scenes),items=coverage,meaning='Source-backed scene and component mappings, not 379 GUI executions.',preservedBoundaries=['no product imports','no business requests','no local persistence','global model bindings readonly','main chat readonly','sidebar standard reasoning','native/Office/API simulated only']),ensure_ascii=False,indent=2)+'\n')
print(f'{len(allgroups)} groups / {len(scenes)} state routes generated')
