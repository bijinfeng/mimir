#!/usr/bin/env python3
"""Build a strict real-screenshot comparison; every pair must be physically present."""
from pathlib import Path
import hashlib,html,json,shutil,subprocess
from PIL import Image
G=Path(__file__).resolve().parent
R=Path(subprocess.check_output(['git','rev-parse','--show-toplevel'],cwd=G,text=True).strip())
O=R/'docs/visual-comparisons/2026-10-20-desktop'
scenes=json.loads((G/'capture-scenarios.json').read_text())
manifest={'baseline':'53285bbdeaa17475e04aae517f07c957776cb6b6','date':'2026-10-20','evidence':'Real Desktop component screenshots; matched bridge fixture/theme/platform/viewport; no native execution claims','pairs':[],'supplements':[],'images':[],'supersededEvidence':[]}
for row in scenes:
 for variant in ['before','after']:
  path=O/row[variant]
  if not path.exists():raise SystemExit(f'Missing actual {variant} capture: {path}')
  actual_image=Image.open(path)
  size=list(actual_image.size)
  assert size==row['viewport'],(path,size,row['viewport'])
  manifest['images'].append({'path':row[variant],'width':size[0],'height':size[1],'actualMediaType':Image.MIME[actual_image.format],'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
 manifest['pairs'].append(row)
known={x['path'] for x in manifest['images']}
for path in sorted((O/'captures').iterdir()):
 if path.suffix.lower() not in {'.png', '.jpg', '.jpeg'}:continue
 if str(path.relative_to(O)) in known:continue
 actual_image=Image.open(path)
 size=actual_image.size
 manifest['supplements'].append({'key':path.stem,'title':path.stem,'caption':'补充真实组件状态；仅打磨后，不构成前后配对。','after':str(path.relative_to(O))})
 manifest['images'].append({'path':str(path.relative_to(O)),'width':size[0],'height':size[1],'actualMediaType':Image.MIME[actual_image.format],'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
for path in sorted((O/'captures/superseded').glob('*')):
 if not path.is_file():continue
 actual_image=Image.open(path)
 manifest['supersededEvidence'].append({'path':str(path.relative_to(O)),'width':actual_image.width,'height':actual_image.height,'actualMediaType':Image.MIME[actual_image.format],'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'reason':'Viewport-application race; retained original bytes, excluded from matched pairs and GUI pass counts.'})
manifest_text=json.dumps(manifest,ensure_ascii=False,indent=2)+'\n'
manifest_formatted=subprocess.run([str(R/'node_modules/.bin/oxfmt'),'--stdin-filepath','capture-manifest.json'],cwd=R,input=manifest_text,text=True,capture_output=True,check=True)
(O/'capture-manifest.json').write_text(manifest_formatted.stdout)
options=''.join(f'<option value="{html.escape(x["key"])}">{html.escape(x["title"])}</option>' for x in manifest['pairs']+manifest['supplements'])
data=json.dumps(manifest,ensure_ascii=False).replace('</script','<\\/script')
page='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Desktop客户端 · 真实前后对比</title><style>*{box-sizing:border-box}body{margin:0;font:14px/1.65 system-ui,sans-serif;color:#262a27;background:#f7f8f8}header,main{max-width:1500px;margin:auto;padding:20px 28px}header{padding-bottom:4px}h1{font-size:24px;margin:0 0 6px}p{margin:6px 0;color:#595f5b}a{color:#007a45}nav,.controls{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin:12px 0}select,button{font:inherit;padding:7px 10px;border:1px solid #d6dad8;border-radius:6px;background:white;color:inherit}select{max-width:100%}button[aria-pressed=true]{background:#00834d;color:white;border-color:#00834d}.views{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:16px 0}figure{margin:0;min-width:0}figcaption{font-weight:600;margin-bottom:8px}figure img{display:block;width:100%;height:auto;background:white;border:1px solid #e3e8e5}.single{grid-template-columns:1fr;max-width:1100px;margin-inline:auto}.hidden{display:none!important}footer{margin-top:24px;padding-top:16px;border-top:1px solid #e8e8e8}button:focus-visible,a:focus-visible,select:focus-visible{outline:2px solid #00834d;outline-offset:3px}@media(max-width:800px){header,main{padding:16px}.views{grid-template-columns:1fr}.controls{gap:6px}h1{font-size:21px}}</style><header><h1>Desktop客户端 · 真实前后对比</h1><p>8组相同模拟桥数据、主题、平台和视口的真实组件渲染。基线53285bb；2026-10-20精修。</p><nav><a href="demo/dist/after/index.html?scene=setup-first">可操作Demo</a><a href="demo/dist/before/index.html?scene=setup-first">基线Demo</a><a href="interactions.html">完整来源与交互索引</a><a href="acceptance.md">验收记录</a><a href="capture-manifest.json">截图指纹</a><a href="build-manifest.json">构建指纹</a><a href="browser-observations.json">交互实测</a><a href="demo/README.md">运行与证据边界</a></nav><p>图片可离线查看；可操作Demo需本地HTTP服务。桥仅内存模拟；未运行原生IPC、菜单、导航、持久化或宿主启动。源码映射不等于逐项GUI验收。真实窗口默认1440×900且未设最小尺寸，390×400仅压力检查。</p></header><main><div class="controls"><label>场景 <select id="scene">OPTIONS</select></label><button data-mode="compare" aria-pressed="true">并排</button><button data-mode="before" aria-pressed="false">打磨前</button><button data-mode="after" aria-pressed="false">打磨后</button></div><p id="caption"></p><div class="views"><figure id="before"><figcaption>打磨前</figcaption><a><img alt="打磨前真实组件截图"></a></figure><figure id="after"><figcaption>打磨后</figcaption><a><img alt="打磨后真实组件截图"></a></figure></div><footer><p>对比只证明截图中可见布局。真实组件使用受控模拟桥；原生窗口动作、拖动、系统菜单、导航和配置持久化须另做原生验收。未验路径见验收记录。</p></footer></main><script>const data=DATA;const scene=document.querySelector('#scene');const entries=[...data.pairs,...data.supplements];let mode='compare';function render(){const item=entries.find(x=>x.key===scene.value)||entries[0];scene.value=item.key;const paired=data.pairs.some(x=>x.key===item.key);document.querySelector('#caption').textContent=paired?item.theme+' · '+item.platform+' · 视口'+item.viewport.join('×')+' · '+item.steps:item.caption;for(const variant of ['before','after']){const figure=document.getElementById(variant);figure.classList.toggle('hidden',(variant==='before'&&!paired)||(mode!=='compare'&&mode!==variant));if(item[variant]){figure.querySelector('img').src=item[variant];figure.querySelector('a').href=item[variant]}}document.querySelector('.views').classList.toggle('single',mode!=='compare'||!paired);document.querySelectorAll('[data-mode]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.mode===mode));b.disabled=!paired&&b.dataset.mode==='before'});history.replaceState(null,'','#'+item.key)}scene.addEventListener('change',()=>{if(!data.pairs.some(x=>x.key===scene.value))mode='after';render()});document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.mode;render()}));scene.value=location.hash.slice(1)||entries[0].key;render();</script></html>'''.replace('OPTIONS',options).replace('DATA',data)
formatted=subprocess.run([str(R/'node_modules/.bin/oxfmt'),'--stdin-filepath','comparison.html'],cwd=R,input=page,text=True,capture_output=True,check=True)
(O/'comparison.html').write_text(formatted.stdout)
for name in ['build-manifest.json','license-manifest.json','baseline-build-freeze.json','capture-scenarios.json']:
 raw=(G/name).read_text()
 if name=='capture-scenarios.json':
  raw=subprocess.run([str(R/'node_modules/.bin/oxfmt'),'--stdin-filepath',name],cwd=R,input=raw,text=True,capture_output=True,check=True).stdout
 (O/'demo'/name).write_text(raw)
shutil.copyfile(G/'build-manifest.json',O/'build-manifest.json')
print(f'Built {len(manifest["pairs"])} real matched pairs, {len(manifest["supplements"])} supplements; all dimensions/hash checks passed.')
