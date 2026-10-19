#!/usr/bin/env python3
"""Complete heterogeneous PDF source index. Source records are not GUI pass counts."""
from pathlib import Path
import hashlib, html, json, subprocess
G=Path(__file__).resolve().parent
R=Path(subprocess.check_output(['git','rev-parse','--show-toplevel'],cwd=G,text=True).strip())
O=R/'docs/visual-comparisons/2026-10-20-pdf'
B=Path('/private/tmp/mimir-pdf-baseline-53285bb')
S=json.loads((G.parent/'research/source-inventory.json').read_text())
collections=['tabs','groups','surfaces','controls','labelDeclarations','dynamicFamilies','stateBranches','stateHooks']
paths={
 'PdfTextInsertPanel.tsx':'编辑 → 文字组 → 插入文字；在真实页面点击位置。',
 'PdfTextMarkupPanel.tsx':'编辑 → 文字组 → 定位原文；先在真实画布选择并核验原生整段文字。',
 'PdfFormPanel.tsx':'编辑 → 表单组 → 交互表单。',
 'PdfDrawingCanvas.tsx':'绘制 → 画布绘图组 → 打开画布绘图；在真实页面绘制草稿。',
 'PdfSignatureCanvas.tsx':'绘制 → 签名组 → 签名与印章。',
 'PdfOcrControls.tsx':'视图 → 扫描文字组 → 识别扫描文字；OCR模型与本机运行条件另验。',
 'PdfLocalPanel.tsx':'页面 → 文档工具组 → 页面、绘图与文档属性；按工具类别切换。',
 'PdfImagePanel.tsx':'编辑 → 图片组 → PDF图片工具；外部服务在此Demo明确拒绝。',
 'PdfImageExportControls.tsx':'视图 → 页面图像组 → 导出页面图像。',
 'PdfRedactionPanel.tsx':'编辑 → 涂黑副本组 → 标记涂黑副本。',
}

snapshots={}
for variant,source,inventory in [('before',B,json.loads((G/'baseline-source-inventory.json').read_text())),('current',R,S)]:
 records=[]
 for record in inventory['sourceFiles']+inventory['supportingFiles']:
  path=record['path'];raw=(source/path).read_bytes();digest=hashlib.sha256(raw).hexdigest()
  assert digest==record['sha256'],f'Stale {variant} inventory {path}'
  if variant=='before':assert raw==subprocess.check_output(['git','show','53285bb:'+path],cwd=R)
  lines=raw.decode().splitlines();body=''.join(f'<li id="L{n}"><pre>{html.escape(line) or " "}</pre></li>' for n,line in enumerate(lines,1))
  target=O/'sources'/variant/(Path(path).name+'.html');target.parent.mkdir(parents=True,exist_ok=True)
  page=f'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>{html.escape(path)}</title><style>body{{font:13px/1.65 monospace;margin:20px;background:#fafbfa;color:#252a26}}ol{{white-space:pre;overflow:auto;padding-left:5em;background:white}}pre{{margin:0;font:inherit}}li:target{{background:#d7f3e2}}header{{overflow-wrap:anywhere}}</style><header><a href="../../interactions.html">完整来源索引</a><h1>{html.escape(path)}</h1><p>{variant}真实源码 · SHA256 {digest}</p></header><ol>{body}</ol></html>'
  target.write_text(page);records.append({'path':path,'sha256':digest,'bytes':len(raw),'lines':len(lines),'html':str(target.relative_to(O))})
 snapshots[variant]=records
hashes={x['path']:x for x in snapshots['current']}
rows=[]
for collection in collections:
 for item in S[collection]:
  path=item['file'];name=Path(path).name
  fixture='forms' if 'Form' in name else 'image' if 'Image' in name else 'annotations' if name=='PdfEditor.tsx' else 'text'
  label=item.get('label') or item.get('binding') or item.get('condition') or item.get('expression') or item.get('description') or item.get('component') or collection
  rows.append({'id':item['id'],'kind':collection,'title':label,'source':{'path':path,'line':item['line'],'endLine':item['endLine'],'sha256':hashes[path]['sha256'],'url':hashes[path]['html']+'#L'+str(item['line'])},'fixture':fixture,'demoQuery':f'?scene={fixture}&width=690&height=640&helper=1','entry':paths.get(name,'通过真实Ribbon的开始／编辑／页面／绘制／视图分类与对应具名命令组进入；按原件和当前选择满足来源条件。'),'evidenceStatus':'source-only','browserStatus':'unverified','originalSourceRecord':item})
assert len(rows)==len({x['id'] for x in rows})
data={'baseline':'53285bbdeaa17475e04aae517f07c957776cb6b6','sourceMappingOnly':True,'counts':S['counts'],'count':len(rows),'countMeaning':'分类、命令组、界面、控件、标签声明、动态来源族、JSX状态分支、state hook分别保留，存在异质和嵌套记录，不是独立动作总数或GUI通过数。Select审计为控件的重叠子集，不能重复相加。','sourceSnapshots':snapshots,'selectAudit':S['selectAudit'],'groups':rows}
(O/'coverage-map.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n');(G/'coverage-map.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n');(O/'research-inventory.json').write_text(json.dumps(S,ensure_ascii=False,indent=2)+'\n')
page='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PDF完整来源与交互索引</title><style>*{box-sizing:border-box}body{margin:0;font:14px/1.65 system-ui;color:#252a26;background:#f7f8f8}header,main{max-width:1200px;margin:auto;padding:20px}h1{font-size:24px}a{color:#007849}nav,.filters{display:flex;gap:12px;flex-wrap:wrap}article{padding:16px;margin:12px 0;background:white;border:1px solid #dde4df;border-radius:8px;overflow-wrap:anywhere}h2{font-size:16px;margin:0}input,select{font:inherit;padding:8px;max-width:100%}pre{white-space:pre-wrap;font:12px/1.5 monospace}.meta{color:#69716a;font-size:12px}:focus-visible{outline:2px solid #00834d;outline-offset:3px}</style><header><h1>PDF完整来源与交互索引</h1><p id="summary"></p><nav><a href="comparison.html">真实前后对比</a><a href="demo/dist/after/index.html?scene=text&helper=1">当前可操作Demo</a><a href="demo/dist/before/index.html?scene=text&helper=1">基线Demo</a><a href="coverage-map.json">完整映射与源码指纹</a><a href="research-inventory.json">原始研究索引</a></nav><p>固定PDF原件由真实PDF.js画布渲染。保存仅为页面内存模拟；本地工具须启动5213隔离Node宿主。外部模型、远程素材、OCR资源、系统文件权限和打印另验。源码记录不代表逐项GUI验收。</p><div class="filters"><input id="query" type="search" aria-label="搜索来源" placeholder="搜索标签、组件、源码"><select id="kind" aria-label="类型"><option value="">全部来源类型</option></select><span id="count" role="status"></span></div></header><main id="list"></main><script>const data=DATA;const $=s=>document.querySelector(s);$('#summary').textContent=data.count+'条异质来源记录。'+data.countMeaning;for(const kind of [...new Set(data.groups.map(x=>x.kind))]){const o=document.createElement('option');o.value=o.textContent=kind;$('#kind').append(o)}function add(p,t,s){const e=document.createElement(t);e.textContent=s;p.append(e);return e}function render(){const q=$('#query').value.toLowerCase(),kind=$('#kind').value,rows=data.groups.filter(r=>(!kind||r.kind===kind)&&JSON.stringify(r).toLowerCase().includes(q));$('#count').textContent=rows.length+'项';$('#list').replaceChildren();for(const r of rows){const c=add($('#list'),'article','');c.id=r.id;add(c,'h2',r.title);add(c,'p',r.id+' · '+r.kind+' · source-only / GUI未逐项验收').className='meta';const s=add(c,'a',r.source.path+':'+r.source.line);s.href=r.source.url;add(c,'p',r.entry);const a=add(c,'a','打开真实组件，按上述路径进入');a.href='demo/dist/after/index.html'+r.demoQuery;const d=add(c,'details','');add(d,'summary','原始记录与来源条件');add(d,'pre',JSON.stringify(r,null,2))}}$('#query').addEventListener('input',render);$('#kind').addEventListener('change',render);render();</script></html>'''.replace('DATA',json.dumps(data,ensure_ascii=False).replace('</script','<\\/script'))
(O/'interactions.html').write_text(page)
print(f'{len(rows)} heterogeneous records; {len(snapshots["current"])} current and {len(snapshots["before"])} exact baseline source snapshots; source-only.')
