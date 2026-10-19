"""Build the archive from actual, paired browser screenshots (never mockups)."""
from pathlib import Path
import hashlib
import html
import json
import shutil
from PIL import Image

ROOT = Path.cwd()
TASK = ROOT / '.trellis/tasks/10-20-interaction-docx'
OUT = ROOT / 'docs/visual-comparisons/2026-10-20-docx'
PAIRS = [
    ('style', '样式定义与应用', '1100×640编辑区，1280×720视口。目标有可见名称，长表单独立滚动，动作固定；未改定义时应用选区为主操作。'),
    ('chart', '图表 · 深色窄栏', '690×640编辑区，1280×720视口。保留分类和系列字段，提交从滚动末尾移至固定动作区。'),
    ('phone-chart', '手机宽度 · 面板入口', '390×640真实视口。打开属性前收起原工具菜单，面板标题与提交动作可见。'),
    ('textbox', '文本框属性', '690×640编辑区，1280×720视口。尺寸、位置、环绕、文字和颜色全部保留，独立滚动与固定插入动作。'),
    ('page', '页面与节', '690×640编辑区，1280×720视口。页面设置固定应用；分节符原有独立操作继续可达。'),
    ('watermark', '文字与图片水印', '690×640编辑区，1280×720视口。保留文字、图片和移除三个入口，动作分级且可换行。'),
    ('notes', '原生脚注与尾注管理', '690×640编辑区，1280×720视口。原件包含20条脚注；面板入口收起父菜单，修改与删除保留。'),
    ('design', '主题设计草稿', '690×640编辑区，1280×720视口。同一Facet草稿，应用设计明确主操作。作者页面及原件颜色规则保持。'),
    ('find', '查找与替换', '690×640编辑区，1280×720视口。同一“段”查询与2个匹配；Escape回焦由真实交互记录证明，截图记录栏布局保持。'),
]
SUPPLEMENTS = {
    'chart-inserted': ('真实插入图表', '真实点击主操作后画布出现图表，保存与撤销启用。'),
    'short-textbox': ('短高文本框', '390×360真实视口。面板内部滚动，固定插入动作保持可达。'),
    'notes-applied': ('原生脚注替换', '通过实际查找/替换和应用动作修改原生脚注，未简化原件写入路径。'),
    'privacy-stale': ('个人信息 · 过期设置', '正文变化使设置过期，可见“重新读取设置”按钮保留恢复路径。'),
    'view-navigation': ('文档导航与视图', '现有导航、Web/打印/阅读与唯一正文编辑器的回归记录。'),
}

manifest = {'baseline': '6f6af4c', 'date': '2026-10-20', 'pairs': [], 'supplements': [], 'images': []}
def record_image(path):
    size = Image.open(path).size
    manifest['images'].append({'path': str(path.relative_to(OUT)), 'width': size[0], 'height': size[1], 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    return size

for key, title, caption in PAIRS:
    sizes = [record_image(OUT / 'captures' / f'{key}-{variant}.jpg') for variant in ['before', 'after']]
    assert sizes[0] == sizes[1], (key, sizes)
    manifest['pairs'].append({'key': key, 'title': title, 'caption': caption, 'dimensions': sizes[0]})
for path in sorted((OUT / 'captures').glob('*-after.jpg')):
    key = path.name.removesuffix('-after.jpg')
    if key in {pair[0] for pair in PAIRS}:
        continue
    record_image(path)
    title, caption = SUPPLEMENTS.get(key, (key, '补充真实组件状态；具体交互与验证边界见验收记录。'))
    manifest['supplements'].append({'key': key, 'title': title, 'caption': caption})
(OUT / 'capture-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
shutil.copy(TASK / 'gallery/build-manifest.json', OUT / 'build-manifest.json')
shutil.copy(TASK / 'gallery/README.md', OUT / 'demo/README.md')
entries = manifest['pairs'] + manifest['supplements']
options = ''.join(f'<option value="{x["key"]}">{html.escape(x["title"])}</option>' for x in entries)
data = json.dumps(manifest, ensure_ascii=False)
page = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DOCX 编辑器 · 真实前后对比</title>
<style>*{box-sizing:border-box}body{margin:0;font:14px/1.65 system-ui,sans-serif;color:#262626;background:#f7f8f8}header,main{max-width:1500px;margin:auto;padding:20px 28px}header{padding-bottom:4px}h1{font-size:24px;margin:0 0 6px}p{margin:6px 0;color:#595959}a{color:#007a45}nav,.controls{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin:12px 0}select,button{font:inherit;padding:7px 10px;border:1px solid #d6dad8;border-radius:6px;background:white;color:inherit}select{max-width:100%}button[aria-pressed=true]{background:#00834d;color:white;border-color:#00834d}.views{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:16px 0}figure{margin:0;min-width:0}figcaption{font-weight:600;margin-bottom:8px}figure img{display:block;width:100%;height:auto;background:white;border:1px solid #e8e8e8}.single{grid-template-columns:1fr;max-width:1280px;margin-inline:auto}.hidden{display:none!important}footer{margin-top:24px;padding-top:16px;border-top:1px solid #e8e8e8}button:focus-visible,a:focus-visible,select:focus-visible{outline:2px solid #00834d;outline-offset:3px}@media(max-width:800px){header,main{padding:16px}.views{grid-template-columns:1fr}.controls{gap:6px}h1{font-size:21px}}</style>
<header><h1>DOCX 编辑器 · 真实前后对比</h1><p>9组相同原件、主题、编辑区和视口的真实截图。基线6f6af4c；2026-10-20精修。</p><nav><a href="demo/dist/after/index.html?scene=rich">可操作 Demo</a><a href="demo/dist/before/index.html?scene=rich">基线 Demo</a><a href="interactions.html">完整交互索引</a><a href="acceptance.md">验收记录</a><a href="capture-manifest.json">截图指纹</a><a href="build-manifest.json">构建指纹</a><a href="browser-observations.json">交互实测</a></nav><p>图片可离线查看；Demo需本地HTTP服务。使用真实组件与原生DOCX，宿主读写为明确模拟。入口映射不等于逐项浏览器验收。</p></header><main>
<div class="controls"><label>场景 <select id="scene">OPTIONS</select></label><button data-mode="compare" aria-pressed="true">并排</button><button data-mode="before" aria-pressed="false">打磨前</button><button data-mode="after" aria-pressed="false">打磨后</button></div><p id="caption"></p><div class="views"><figure id="before"><figcaption>打磨前</figcaption><a><img alt="打磨前真实截图"></a></figure><figure id="after"><figcaption>打磨后</figcaption><a><img alt="打磨后真实截图"></a></figure></div><footer><p>所有分类、控件、动态入口与生命周期状态均在<a href="interactions.html">完整交互索引</a>中保留源码来源、进入步骤与验证边界。未改动的安全、原件保存和Agent合同由相关回归测试支持，截图不代替行为证明。</p></footer></main><script>
const data=DATA;const scene=document.querySelector('#scene');let mode='compare';const entries=[...data.pairs,...data.supplements];function render(){const item=entries.find(x=>x.key===scene.value)||entries[0];scene.value=item.key;document.querySelector('#caption').textContent=item.caption;const paired=data.pairs.some(x=>x.key===item.key);for(const kind of ['before','after']){const figure=document.getElementById(kind);figure.classList.toggle('hidden',(kind==='before'&&!paired)||(mode!=='compare'&&mode!==kind));const src='captures/'+item.key+'-'+kind+'.jpg';if(kind==='after'||paired){figure.querySelector('img').src=src;figure.querySelector('a').href=src}}document.querySelector('.views').classList.toggle('single',mode!=='compare'||!paired);document.querySelectorAll('[data-mode]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.mode===mode));b.disabled=!paired&&b.dataset.mode==='before'});history.replaceState(null,'','#'+item.key)}scene.addEventListener('change',()=>{if(!data.pairs.some(x=>x.key===scene.value))mode='after';render()});document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.mode;render()}));scene.value=location.hash.slice(1)||entries[0].key;render();
</script></html>'''.replace('OPTIONS', options).replace('DATA', data)
(OUT / 'comparison.html').write_text(page)
print(f'Built {len(PAIRS)} matched pairs and {len(manifest["supplements"])} supplementary captures')
