"""Build the archive from actual, paired browser screenshots (never mockups)."""
from pathlib import Path
import hashlib
import html
import json
import shutil
from PIL import Image

import subprocess
ROOT = Path(subprocess.check_output(['git','rev-parse','--show-toplevel'],cwd=Path(__file__).resolve().parent,text=True).strip())
TASK = Path(__file__).resolve().parent.parent
OUT = ROOT / 'docs/visual-comparisons/2026-10-20-xlsx'
PAIRS = [
 ('chart','图表创建与属性','浅色，1280×720视口、690×640编辑栏。同一原生工作簿和图表表单；观察字段布局、滚动与提交动作。'),
 ('image','图片来源与插入入口','浅色，1280×720视口、690×640编辑栏。同一原件和图片类型；原生文件选择与网址入口保留，隔离helper拒绝图片提交。'),
 ('table','结构化表创建','浅色，1280×720视口、690×640编辑栏。同一原件和表格表单，保留名称、样式与带状行选项。'),
 ('short-chart','短高窄屏 · 图表','浅色，390×400真实视口、390×400编辑栏。对比字段内部滚动与主操作可见性。'),
 ('short-image','短高窄屏 · 图片','浅色，390×400真实视口、390×400编辑栏。对比真实图片入口、字段与提交区。'),
 ('short-table','短高窄屏 · 表格','浅色，390×400真实视口、390×400编辑栏。对比字段滚动与实际创建操作。'),
 ('find','高级查找 · 200条截断','浅色，1280×720视口、690×640编辑栏。同一search原件，实际输入“项目”，保留200条真实匹配截断列表。'),
 ('find-dark','高级查找 · 深色','深色，1280×720视口、690×640编辑栏。同一search原件、“项目”查询与200条真实匹配结果。'),
 ('short-find','短高窄屏 · 查找结果','浅色，390×400真实视口、390×400编辑栏。同一search原件、“项目”查询，检验长结果局部滚动与上方筛选可达。'),
]
SUPPLEMENTS = {
 'chart-inserted': ('图表插入后的真实状态', '补充真实组件状态：使用本地隔离 Node helper 执行原生图表操作后的编辑画布；仅展示打磨后结果，不构成前后配对。'),
 'table-applied': ('结构化表创建后的真实状态', '补充真实组件状态：使用本地隔离 Node helper 创建结构化表后的画布与表格属性；仅展示打磨后结果，不构成前后配对。'),
 'pivot-preserved': ('成熟透视任务保留', '补充真实组件状态：原生工作簿中的成熟透视任务与既有数据、字段配置继续保留；本轮仅精修交互布局，具体执行与原件保留证据见验收记录。仅展示打磨后结果，不构成前后配对。'),
}

manifest = {'baseline': 'dcb9a40', 'date': '2026-10-20', 'pairs': [], 'supplements': [], 'images': []}
def record_image(path):
    size = Image.open(path).size
    manifest['images'].append({'path': str(path.relative_to(OUT)), 'width': size[0], 'height': size[1], 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    return size

for key, title, caption in PAIRS:
    sizes = [record_image(OUT / 'captures' / f'{key}-{variant}.jpg') for variant in ['before', 'after']]
    assert sizes[0] == sizes[1], (key, sizes)
    expected=(390,400) if key.startswith('short-') else (1280,720)
    assert sizes[0] == expected, (key, sizes[0], expected)
    manifest['pairs'].append({'key': key, 'title': title, 'caption': caption, 'dimensions': sizes[0], 'editorSize':[390,400] if key.startswith('short-') else [690,640], 'theme':'dark' if key=='find-dark' else 'light', 'fixture':'search' if 'find' in key else 'rich', 'searchQuery':'项目' if 'find' in key else None})
for path in sorted((OUT / 'captures').glob('*-after.jpg')):
    key = path.name.removesuffix('-after.jpg')
    if key in {pair[0] for pair in PAIRS}:
        continue
    record_image(path)
    title, caption = SUPPLEMENTS.get(key, (key, '补充真实组件状态；具体交互与验证边界见验收记录。'))
    manifest['supplements'].append({'key': key, 'title': title, 'caption': caption})
(OUT / 'capture-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
shutil.copy(TASK / 'gallery/build-manifest.json', OUT / 'build-manifest.json')
entries = manifest['pairs'] + manifest['supplements']
options = ''.join(f'<option value="{x["key"]}">{html.escape(x["title"])}</option>' for x in entries)
data = json.dumps(manifest, ensure_ascii=False)
page = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>XLSX 编辑器 · 真实前后对比</title>
<style>*{box-sizing:border-box}body{margin:0;font:14px/1.65 system-ui,sans-serif;color:#262626;background:#f7f8f8}header,main{max-width:1500px;margin:auto;padding:20px 28px}header{padding-bottom:4px}h1{font-size:24px;margin:0 0 6px}p{margin:6px 0;color:#595959}a{color:#007a45}nav,.controls{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin:12px 0}select,button{font:inherit;padding:7px 10px;border:1px solid #d6dad8;border-radius:6px;background:white;color:inherit}select{max-width:100%}button[aria-pressed=true]{background:#00834d;color:white;border-color:#00834d}.views{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:16px 0}figure{margin:0;min-width:0}figcaption{font-weight:600;margin-bottom:8px}figure img{display:block;width:100%;height:auto;background:white;border:1px solid #e8e8e8}.single{grid-template-columns:1fr;max-width:1280px;margin-inline:auto}.hidden{display:none!important}footer{margin-top:24px;padding-top:16px;border-top:1px solid #e8e8e8}button:focus-visible,a:focus-visible,select:focus-visible{outline:2px solid #00834d;outline-offset:3px}@media(max-width:800px){header,main{padding:16px}.views{grid-template-columns:1fr}.controls{gap:6px}h1{font-size:21px}}</style>
<header><h1>XLSX 编辑器 · 真实前后对比</h1><p>9组相同原件、主题、编辑区和视口的真实截图。基线dcb9a40；2026-10-20精修。</p><nav><a href="demo/dist/after/index.html?scene=rich">可操作 Demo</a><a href="demo/dist/before/index.html?scene=rich">基线 Demo</a><a href="interactions.html">完整交互索引</a><a href="acceptance.md">验收记录</a><a href="capture-manifest.json">截图指纹</a><a href="build-manifest.json">构建指纹</a><a href="browser-observations.json">交互实测</a></nav><p>图片可离线查看；Demo需本地HTTP服务。使用真实组件与原生XLSX，保存为页面内存模拟；开发Demo真实工具由隔离本地Node执行。静态默认不连接helper。入口映射不等于逐项浏览器验收。</p></header><main>
<div class="controls"><label>场景 <select id="scene">OPTIONS</select></label><button data-mode="compare" aria-pressed="true">并排</button><button data-mode="before" aria-pressed="false">打磨前</button><button data-mode="after" aria-pressed="false">打磨后</button></div><p id="caption"></p><div class="views"><figure id="before"><figcaption>打磨前</figcaption><a><img alt="打磨前真实截图"></a></figure><figure id="after"><figcaption>打磨后</figcaption><a><img alt="打磨后真实截图"></a></figure></div><footer><p>实际源码采集中的分类、控件、分组、动态模板及状态均在<a href="interactions.html">完整交互索引</a>中保留源码来源、进入步骤与验证边界。未改动的安全、原件保存和Agent合同由相关回归测试支持，截图不代替行为证明。</p></footer></main><script>
const data=DATA;const scene=document.querySelector('#scene');let mode='compare';const entries=[...data.pairs,...data.supplements];function render(){const item=entries.find(x=>x.key===scene.value)||entries[0];scene.value=item.key;document.querySelector('#caption').textContent=item.caption;const paired=data.pairs.some(x=>x.key===item.key);for(const kind of ['before','after']){const figure=document.getElementById(kind);figure.classList.toggle('hidden',(kind==='before'&&!paired)||(mode!=='compare'&&mode!==kind));const src='captures/'+item.key+'-'+kind+'.jpg';if(kind==='after'||paired){figure.querySelector('img').src=src;figure.querySelector('a').href=src}}document.querySelector('.views').classList.toggle('single',mode!=='compare'||!paired);document.querySelectorAll('[data-mode]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.mode===mode));b.disabled=!paired&&b.dataset.mode==='before'});history.replaceState(null,'','#'+item.key)}scene.addEventListener('change',()=>{if(!data.pairs.some(x=>x.key===scene.value))mode='after';render()});document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.mode;render()}));scene.value=location.hash.slice(1)||entries[0].key;render();
</script></html>'''.replace('OPTIONS', options).replace('DATA', data)
formatted=subprocess.run([str(ROOT/'node_modules/.bin/oxfmt'),'--stdin-filepath','comparison.html'],cwd=ROOT,input=page,text=True,capture_output=True,check=True)
(OUT / 'comparison.html').write_text(formatted.stdout)
print(f'Built {len(PAIRS)} matched pairs and {len(manifest["supplements"])} supplementary captures')
