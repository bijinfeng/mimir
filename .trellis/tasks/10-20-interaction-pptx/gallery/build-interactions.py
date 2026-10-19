#!/usr/bin/env python3
"""Archive complete AST source records and honest real-component entry hints."""
from pathlib import Path
import hashlib,html,json,subprocess
G=Path(__file__).resolve().parent
R=Path(subprocess.check_output(['git','rev-parse','--show-toplevel'],cwd=G,text=True).strip())
I=G.parent/'research/source-inventory.json'
S=json.loads(I.read_text())
OUT=R/'docs/visual-comparisons/2026-10-20-pptx'
collections={'tabs':'tab','groups':'group','surfaces':'surface','staticControls':'static-control','dynamicLabels':'dynamic-template','dynamicFamilies':'dynamic-family','states':'state'}
snapshots=[{'path':x['path'],'sha256':hashlib.sha256((R/x['path']).read_bytes()).hexdigest(),'bytes':(R/x['path']).stat().st_size} for x in S['sourceFiles']]
hashes={x['path']:x['sha256'] for x in snapshots}
for snapshot in snapshots:
 path=snapshot['path'];lines=(R/path).read_text().splitlines()
 body=''.join(f'<li id="L{n}"><pre>{html.escape(line) or " "}</pre></li>' for n,line in enumerate(lines,1))
 page=f'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{html.escape(path)}</title><style>body{{font:13px/1.65 monospace;color:#252a26;background:#fafbfa;margin:20px}}header{{font-family:system-ui;overflow-wrap:anywhere}}ol{{white-space:pre;overflow:auto;padding:12px 12px 12px 5em;background:white;border:1px solid #dde3de}}li{{padding-left:12px}}pre{{margin:0;font:inherit}}li:target{{background:#e0f3e7;outline:1px solid #55a477}}a{{color:#007849}}</style><header><a href="../../interactions.html">返回完整来源索引</a><h1>{html.escape(path)}</h1><p>当前真实源码只读存档 · SHA256 {snapshot["sha256"]}</p></header><ol>{body}</ol></html>'
 target=OUT/'sources/current'/(Path(path).name+'.html');target.parent.mkdir(parents=True,exist_ok=True)
 formatted=subprocess.run([str(R/'node_modules/.bin/oxfmt'),'--stdin-filepath',target.name],cwd=R,input=page,text=True,capture_output=True,check=True);target.write_text(formatted.stdout)

# These are genuine public Ribbon paths. Source-driven conditions remain explicit;
# no private component state or generated element selector is injected.
paths={
 'PptxInsertControls.tsx':'插入 → 公式／图示／艺术字／动态字段，选择对应具名工具。',
 'PptxAdvancedControls.tsx':'选中原生图表 → 对象 → 图表；或幻灯片 → 备注与放映。',
 'PptxDeckControls.tsx':'幻灯片 → 尺寸与版式／主题／页脚／分节与批注。',
 'PptxObjectControls.tsx':'先在画布选择适用对象，再进入对象或开始分类的对应具名组。',
 'PptxViewControls.tsx':'视图 → 演示文稿视图／画布视图。',
 'PptxMasterControls.tsx':'视图 → 母版编辑。',
 'PptxOutputControls.tsx':'视图 → 导出与打印。',
 'PptxShowControls.tsx':'幻灯片 → 放映。',
 'PptxFillControls.tsx':'先选择形状 → 对象 → 形状填充；背景从幻灯片 → 背景进入。',
 'PptxAssetControls.tsx':'插入 → 音视频／录屏；对象 → 图片填充；幻灯片 → 导入。',
 'PptxTableControls.tsx':'插入 → 对象 → 表格；或在table原件选择原生表格。',
 'PptxShapeGallery.tsx':'插入 → 形状库。',
 'PptxZoomControls.tsx':'插入 → 缩放导航。',
 'PptxAiControls.tsx':'开始 → AI编辑，或幻灯片 → 检查与翻译。隔离Demo不连接生成服务。',
 'PptxClipboardControls.tsx':'开始 → 剪贴板。',
 'PptxCommentControls.tsx':'幻灯片 → 分节与批注 → 管理批注。',
}
rows=[]
for collection,kind in collections.items():
 for n,item in enumerate(S.get(collection,[]),1):
  path=item['file'];basename=Path(path).name;label=item.get('label') or item.get('description') or item.get('expression') or item.get('key') or kind
  fixture='load-error' if kind=='state' and 'load failure' in item.get('description','') else 'load-pending' if kind=='state' and 'loading' in item.get('description','') else 'chart' if 'Chart' in basename or basename=='PptxAdvancedControls.tsx' else 'table' if 'Table' in basename else 'groups' if 'Group' in basename else 'image' if any(x in basename for x in ['Picture','Crop','Cutout']) else 'rich'
  if basename=='PptxEditor.tsx':
   nearest=max([x for x in S['groups'] if x['line']<=item['line']],key=lambda x:x['line'],default=None)
   entry=f"进入{nearest['tab']}分类 → {nearest['label']}具名组；按当前文稿和选择条件查找当前标签。" if nearest else '通过真实编辑器的公开Ribbon、画布或状态入口查找该源码标签。'
  else:entry=paths.get(basename,'通过对应具名Ribbon组或画布上下文进入此组件；准确条件见保留的原始源码记录。')
  rows.append({'id':f'PPTX-{kind.upper()}-{n:03}','kind':kind,'title':label,'component':item.get('component'),'source':{'path':path,'line':item['line'],'sha256':hashes[path],'archiveSourceUrl':'sources/current/'+basename+'.html#L'+str(item['line'])},'fixture':fixture,'entrySteps':[entry,'窄编辑列先打开对应具名命令组，再选择同名工具。','hover、焦点、忙态与键盘按真实控件适用；无对应交互时为N/A。'],'demoQuery':f'?scene={fixture}&width=690&height=640','evidenceStatus':'source-only','browserStatus':'unverified','boundaries':['源码记录不等于可点击动作或GUI已通过；分组、状态、选项和值不得累加成动作总数。','静态Demo默认不连接helper；加helper=1且本地5210服务运行才执行真实原生工具；库保存只在当前页面内存。','外部服务、Agent生成、远程图片明确拒绝；设备录屏、系统权限、打印与外部播放器须另验。'],'originalSourceRecord':item})
assert len(rows)==sum(len(S.get(c,[])) for c in collections)
result={'baseline':'3b5d912','inventoryPath':str(I.relative_to(R)),'inventorySha256':hashlib.sha256(I.read_bytes()).hexdigest(),'counts':S['counts'],'count':len(rows),'countMeaning':'分别保留分类、命令组、界面、静态标签、动态模板、动态来源族和状态分支；不是GUI通过数，也不是独立动作总数。Select审计是控件子集，单独保留不重复相加。','sourceSnapshots':snapshots,'selectAudit':S['selectAudit'],'sourceMappingOnly':True,'groups':rows}
(G/'coverage-map.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
data=json.dumps(result,ensure_ascii=False).replace('</script','<\\/script')
page='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PPTX完整来源与交互索引</title><style>*{box-sizing:border-box}body{margin:0;background:#f7f8f8;color:#242824;font:14px/1.65 system-ui}header,main{max-width:1200px;margin:auto;padding:20px}h1{font-size:24px;margin:0}a{color:#007849}nav,.filters{display:flex;gap:12px;flex-wrap:wrap;margin:14px 0}input,select{padding:8px;font:inherit;border:1px solid #ccd4cf;border-radius:6px}article{background:white;border:1px solid #dfe5e1;border-radius:8px;padding:16px;margin:12px 0;overflow-wrap:anywhere}h2{font-size:16px;margin:0 0 6px}.meta{color:#69716a;font-size:12px}details{margin-top:8px}pre{white-space:pre-wrap;font:12px/1.5 monospace}a:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid #00834d;outline-offset:3px}</style><header><h1>PPTX完整来源与交互索引</h1><p id="summary"></p><nav><a href="comparison.html">真实前后对比</a><a href="demo/dist/after/index.html?scene=rich">当前真实组件Demo</a><a href="demo/dist/before/index.html?scene=rich">基线真实组件Demo</a><a href="coverage-map.json">完整机器可读映射</a><a href="research-inventory.json">研究原始索引</a></nav><p>每项保留源码路径与指纹、真实原件、公开进入路径和未验边界。源码映射不代表已完成浏览器验收；实际浏览器结果见验收记录。页面不伪造私有状态。</p><div class="filters"><input id="query" type="search" aria-label="搜索交互标签与源码" placeholder="搜索标签、组件、源码"><select id="kind" aria-label="来源类型"><option value="">全部类型</option></select><span id="count" role="status"></span></div></header><main id="list"></main><script>const data=DATA;const $=s=>document.querySelector(s);$('#summary').textContent=data.count+'条分类来源记录。'+data.countMeaning;for(const kind of [...new Set(data.groups.map(x=>x.kind))]){const o=document.createElement('option');o.value=o.textContent=kind;$('#kind').append(o)}function add(parent,tag,text,cls){const x=document.createElement(tag);x.textContent=text;if(cls)x.className=cls;parent.append(x);return x}function render(){const q=$('#query').value.toLowerCase(),kind=$('#kind').value;const rows=data.groups.filter(x=>(!kind||x.kind===kind)&&JSON.stringify(x).toLowerCase().includes(q));$('#count').textContent=rows.length+'项';$('#list').replaceChildren();for(const r of rows){const card=add($('#list'),'article','');card.id=r.id;add(card,'h2',r.title);add(card,'div',r.id+' · '+r.kind+' · source-only / GUI未逐项验收','meta');const sourceLink=add(card,'a',r.source.path+':'+r.source.line+' · 查看当前真实源码');sourceLink.href=r.source.archiveSourceUrl;add(card,'p','SHA256 '+r.source.sha256,'meta');const a=add(card,'a','打开当前真实组件（按步骤进入）');a.href='demo/dist/after/index.html'+r.demoQuery;const ol=add(card,'ol','');r.entrySteps.forEach(s=>add(ol,'li',s));const d=add(card,'details','');add(d,'summary','完整原始记录与边界');add(d,'pre',JSON.stringify(r,null,2))}}$('#query').addEventListener('input',render);$('#kind').addEventListener('change',render);render();</script></html>'''.replace('DATA',data)
for p,content in [(G/'interactions.html',page),(OUT/'interactions.html',page),(OUT/'coverage-map.json',json.dumps(result,ensure_ascii=False,indent=2)+'\n'),(OUT/'research-inventory.json',I.read_text()),(OUT/'demo/interactions.html',page.replace('href="demo/','href="').replace("a.href='demo/dist/","a.href='dist/").replace('sourceLink.href=r.source.archiveSourceUrl','sourceLink.href="../"+r.source.archiveSourceUrl').replace('href="comparison.html"','href="../comparison.html"').replace('href="research-inventory.json"','href="../research-inventory.json"')),(OUT/'demo/coverage-map.json',json.dumps(result,ensure_ascii=False,indent=2)+'\n')]:
 p.parent.mkdir(parents=True,exist_ok=True)
 formatted=subprocess.run([str(R/'node_modules/.bin/oxfmt'),'--stdin-filepath',p.name],cwd=R,input=content,text=True,capture_output=True,check=True)
 p.write_text(formatted.stdout)
print(f'Built {len(rows)} distinct source records with {len(snapshots)} file snapshots; source-only, GUI unverified.')
