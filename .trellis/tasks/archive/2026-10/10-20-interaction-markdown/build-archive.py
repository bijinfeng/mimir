"""Build an offline viewer from actual browser captures, never synthetic UI."""
import hashlib
import json
import subprocess
from pathlib import Path
from PIL import Image

repo = Path(subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], text=True).strip())
archive = repo / 'docs/visual-comparisons/2026-10-20-markdown'
records = json.loads((archive / 'captures.json').read_text())
images = []
cases = {}
for record in records:
    path = archive / record['file']
    data = path.read_bytes()
    with Image.open(path) as image:
        width, height = image.size
    images.append({**record, 'width': width, 'height': height, 'sha256': hashlib.sha256(data).hexdigest()})
    item = cases.setdefault(record['key'], {'key': record['key'], 'label': record['label'], 'scene': record['scene'], 'ids': record.get('ids', []), 'fixture': record.get('fixture', {'width': record.get('w', 1100), 'height': record.get('h', 760)}), 'theme': record.get('theme', 'light')})
    item[record['side']] = {'file': record['file'], 'width': width, 'height': height}
for item in cases.values():
    if 'before' in item and 'after' in item:
        assert (item['before']['width'], item['before']['height']) == (item['after']['width'], item['after']['height']), item['key']
for row in json.loads((archive / 'coverage.json').read_text())['coverage']:
    key = row['id']
    cases[key] = {'key': key, 'label': key + ' · ' + row['requirement'], 'scene': row['scene'], 'ids': [key], 'fixture': {'width': 1100, 'height': 760}, 'theme': 'light', 'detail': True}
manifest = {
    'baseline': '46a2120',
    'sourceCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
    'pairCount': sum('before' in c and 'after' in c for c in cases.values()),
    'captures': images,
    'boundary': '真实Markdown组件与宿主视觉；IO由隔离Demo模拟，真实产品截图单独标识。不代表原生文件选择或真实模型服务验收。',
}
(archive / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
payload = json.dumps(list(cases.values()), ensure_ascii=False).replace('<', '\\u003c')
html = '''<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Markdown笔记编辑器精修 · 渲染存档</title>
<style>
* {box-sizing:border-box} body {margin:0;background:#f7f8f8;color:#262626;font:14px/1.6 system-ui,sans-serif} button,input,select {font:inherit} button,select {cursor:pointer} a {color:#007746} header {display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding:18px 24px;background:#fff;border-bottom:1px solid #e7e9e8} h1 {font-size:20px;margin:0} header p {margin:0;color:#595959} .layout {display:grid;grid-template-columns:260px minmax(0,1fr);min-height:calc(100vh - 94px)} aside {padding:16px;background:#fff;border-right:1px solid #e7e9e8} input {width:100%;padding:8px;border:1px solid #bfc5c1;border-radius:6px} nav {display:grid;gap:4px;margin-top:12px;max-height:calc(100vh - 190px);overflow:auto} nav button {border:0;background:transparent;text-align:left;padding:8px 10px;border-radius:6px;color:inherit} nav button:hover, nav button[aria-current=true] {background:#eff0f0} nav small {display:block;color:#6b6b6b} main {min-width:0;padding:20px} .controls {display:flex;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:16px} select {padding:6px 10px;border:1px solid #bfc5c1;background:white;border-radius:6px} #description {margin:0 0 16px;color:#595959} #screens {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;align-items:start} figure {margin:0;min-width:0} figcaption {margin-bottom:8px;font-weight:600} .image-scroll {overflow:auto;max-height:80vh;background:#fff;border:1px solid #e7e9e8} img {display:block;width:100%;height:auto} #screens[data-original=true] img {width:auto;max-width:none} #screens[data-mode=before] figure:last-child,#screens[data-mode=after] figure:first-child {display:none} #screens:not([data-mode=compare]) {grid-template-columns:minmax(0,1fr)} .missing {padding:24px;color:#595959} :focus-visible {outline:2px solid #00a35f;outline-offset:2px} @media(max-width:760px) {.layout {grid-template-columns:1fr} aside {border-right:0;border-bottom:1px solid #e7e9e8} nav {max-height:170px} main {padding:16px} #screens {grid-template-columns:1fr} header {padding:16px}}
</style></head><body>
<header><h1>Markdown 笔记编辑器精修</h1><p>真实组件前后渲染存档 · 基线 46a2120</p></header>
<div class="layout"><aside><input id="filter" aria-label="筛选交互场景" placeholder="搜索场景或 MD 编号"><nav id="navigation" aria-label="交互场景"></nav></aside><main>
<div class="controls"><label>查看 <select id="mode"><option value="compare">前后对比</option><option value="before">打磨前</option><option value="after">打磨后</option></select></label><label><input id="original" type="checkbox" style="width:auto"> 原尺寸</label><a id="demo" href="demo/dist/after/index.html">打开可操作 Demo</a><a href="acceptance.md">验收记录</a><a href="coverage.json">74 项覆盖清单</a></div>
<p id="description"></p><div id="screens" data-mode="compare"><figure><figcaption>打磨前</figcaption><div class="image-scroll" id="before"></div></figure><figure><figcaption>打磨后</figcaption><div class="image-scroll" id="after"></div></figure></div>
<p>截图展示真实组件；Demo 的保存、图片、属性和模型服务均为本地模拟。真实产品补充图与隔离场景分开登记，未验证的原生与外部服务见验收记录。</p>
</main></div><script>
const scenes=PAYLOAD; const byId=id=>document.getElementById(id); let current;
function choose(key) {current=scenes.find(s=>s.key===key)||scenes[0]; if(!current)return; history.replaceState(null,'','#'+encodeURIComponent(current.key)); byId('description').textContent=current.label+' · '+current.ids.join(' / '); byId('demo').href='demo/dist/after/index.html?scene='+encodeURIComponent(current.scene)+'&prepare=1&theme='+current.theme+'&width='+current.fixture.width+'&height='+current.fixture.height; for(const side of ['before','after']) {const host=byId(side);host.replaceChildren();host.classList.remove('missing');const data=current[side];if(data){const img=new Image();img.src=data.file;img.alt=current.label+' '+(side==='before'?'打磨前':'打磨后');host.append(img)}else{host.textContent=current.detail?'此项请打开实际组件 Demo；覆盖与未验证边界见 acceptance.md 和 coverage.json。':'真实产品补充证据，未配对';host.classList.add('missing')}} for(const button of byId('navigation').children)button.setAttribute('aria-current',String(button.dataset.key===current.key))}
function list() {const q=byId('filter').value.toLowerCase();byId('navigation').replaceChildren();for(const s of scenes.filter(s=>(s.label+s.key+s.ids.join(' ')).toLowerCase().includes(q))){const b=document.createElement('button');b.dataset.key=s.key;b.textContent=s.label;const small=document.createElement('small');small.textContent=s.ids.join(' · ');b.append(small);b.onclick=()=>choose(s.key);b.setAttribute('aria-current',String(current?.key===s.key));byId('navigation').append(b)}}
byId('filter').oninput=list;byId('mode').onchange=()=>byId('screens').dataset.mode=byId('mode').value;byId('original').onchange=()=>byId('screens').dataset.original=String(byId('original').checked);list();choose(decodeURIComponent(location.hash.slice(1)));
</script></body></html>'''.replace('PAYLOAD', payload)
(archive / 'comparison.html').write_text(html)
print(json.dumps({'pairs':manifest['pairCount'],'images':len(images),'scenes':len(cases)},ensure_ascii=False))
