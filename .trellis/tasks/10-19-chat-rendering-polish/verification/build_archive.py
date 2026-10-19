"""Build a portable, offline comparison from real browser captures."""
from pathlib import Path
from PIL import Image
import hashlib
import json

root = Path(__file__).resolve().parent
shots = root / 'screenshots'
# The browser's native screenshot API emits JPEG bytes. Normalize the file
# encoding without resizing pixels, so the archived .png extension is accurate.
for path in shots.rglob('*.png'):
    with Image.open(path) as image:
        pixels = image.convert('RGB')
    pixels.save(path, format='PNG', optimize=True)

labels = {
    'reading': '正文排版', 'reading-bottom': '代码、引用与动作',
    'process': '思考与工具', 'process-expanded': '展开的思考与工具',
    'states': '过程、终局与媒体', 'states-bottom': '媒体与协议内容',
    'failure': '失败与恢复', 'empty': '新对话', 'loading': '历史读取',
    'history-error': '历史读取失败',
}
pairs = []
for path in sorted((shots / 'before').glob('*.png')):
    after = shots / 'after' / path.name
    if not after.exists():
        raise ValueError(f'Missing after capture: {path.name}')
    with Image.open(path) as left, Image.open(after) as right:
        if left.size != right.size:
            raise ValueError(f'Paired capture dimensions differ: {path.name}')
        size = list(left.size)
    stem, theme, layout = path.stem.rsplit('-', 2)
    pairs.append({
        'id': path.stem,
        'label': f"{labels[stem]} · {'浅色' if theme == 'light' else '深色'} · {'主对话' if layout == 'main' else '文档侧栏'}",
        'before': f'screenshots/before/{path.name}',
        'after': f'screenshots/after/{path.name}',
        'size': size,
    })
previews = root / 'previews'
previews.mkdir(exist_ok=True)
for item in pairs:
    if not item['id'].endswith('-sidebar'):
        continue
    for kind in ['before', 'after']:
        original = root / item[kind]
        target = previews / f'{kind}-{original.name}'
        with Image.open(original) as image:
            width, height = image.size
            panel_width = round(390 * width / 1220)
            left = (width - panel_width) // 2
            image.crop((left, 0, left + panel_width, height)).save(target, optimize=True)
        item['preview' + kind.title()] = str(target.relative_to(root))
pairs.sort(key=lambda item: (item['id'] != 'reading-light-main', item['id']))
products = [
    {'label': path.stem.replace('product-', ''), 'path': f'screenshots/{path.name}'}
    for path in sorted(shots.glob('product-*.png'))
]
files = []
for path in sorted(shots.rglob('*.png')):
    with Image.open(path) as image:
        size = list(image.size)
    files.append({'path': str(path.relative_to(root)), 'size': size,
                  'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
manifest = {
    'date': '2026-10-19',
    'baselineCommit': 'b124c34',
    'fixture': 'real production ChatPanel/parts + official TanStack UI + actual renderer theme; in-memory IO and fixed messages',
    'sameGallerySource': True,
    'galleryMainSha256': 'bba885568c53f2f6f99bbc487fca3500edf711c498dc2de38e2b39766a7c93bd',
    'galleryStyleSha256': '5e953b5c26c72796883a5aad06fa541d1eae232bbef256695281144b7bce2920',
    'beforeBundleSha256': '9c2d68a9853e58e47e4ce31194d748c15bcce3c4375913f7ac393ab80e458a8e',
    'afterBundleSha256': 'f87600c9e9cc74627acb408add848c3cb27fd7920712944d2895ddeb46dbfb3f',
    'sharedCssBundleSha256': '3d716c59b76796f1a8be0ea8425fd19bab7162a87a2b5e95eda2642e303a34e1',
    'viewport': [1220, 900],
    'captureNote': 'Two sidebar state captures are emitted by the browser API at 1205x889; each before/after pair has identical pixel dimensions. No screenshots were resized.',
    'pairs': pairs, 'productEvidence': products, 'files': files,
}
(root / 'render-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
html = r'''<!doctype html>
<html lang="zh-CN">
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>对话渲染 · 前后对比存档</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f6f7f7;color:#242824;font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif}header{padding:24px 32px;background:#fff;border-bottom:1px solid #e7e9e8}h1{font-size:22px;letter-spacing:-.5px;margin:0 0 6px}p{margin:0;color:#68716a}a{color:#007a45}nav{position:sticky;top:0;z-index:1;display:flex;gap:12px;align-items:center;flex-wrap:wrap;background:#ffffffed;padding:14px 32px;border-bottom:1px solid #e7e9e8}select,button{font:inherit;border:1px solid #dfe3e0;background:#fff;border-radius:6px;padding:7px 12px;color:inherit;cursor:pointer}select{max-width:100%}button:hover{background:#f3f5f4}button:focus-visible,select:focus-visible{outline:2px solid #00894f;outline-offset:2px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:18px;padding:24px 32px}figure{margin:0;background:#fff;border:1px solid #e2e6e3;border-radius:8px;overflow:hidden}figcaption{padding:12px 16px;font-weight:600;border-bottom:1px solid #e7e9e8}figcaption small{font-weight:400;color:#7a827c;margin-left:8px}figure button{display:block;border:0;padding:0;width:100%;border-radius:0;cursor:zoom-in}figure img{display:block;width:100%;height:auto}.pair.side figure img{width:auto;max-width:100%;margin:auto}.details{padding:0 32px 32px}details{background:#fff;padding:16px;border:1px solid #e2e6e3;border-radius:8px}summary{cursor:pointer;font-weight:600}.evidence{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;margin-top:16px}.evidence img{width:100%;display:block}.evidence figcaption{font-size:12px}dialog{width:96vw;max-width:none;height:94vh;padding:12px;border:1px solid #dfe3e0;border-radius:10px}dialog::backdrop{background:#151915ad}dialog img{display:block;max-width:none;margin:14px auto}dialog .viewer{overflow:auto;height:calc(100% - 46px)}#meta{font-size:12px;color:#7a827c;margin-left:auto}@media(max-width:800px){header,nav{padding:18px}.pair{grid-template-columns:1fr;padding:18px;gap:16px}.details{padding:0 18px 18px}#meta{margin-left:0}}
</style>
<header><h1>对话渲染 · 前后对比</h1><p>2026-10-19 · 真实生产组件，同内容、同主题、同尺寸。侧栏使用居中裁切预览；点击截图可查看完整原图。</p><p>对比场景使用固定资料和内存 IO；下面另列实际产品中的 HTTP/SSE、附件、保存与侧栏验收。可离线打开，截图不会随以后代码变化。</p></header>
<nav><label for="scene">对比场景</label><select id="scene"></select><button id="previous">上一个</button><button id="next">下一个</button><span id="meta"></span><a href="coverage.md">覆盖与验证记录</a></nav>
<main class="pair"><figure><figcaption>修改前<small>基线 b124c34</small></figcaption><button class="zoom" aria-label="放大修改前截图"><img id="before" alt="修改前真实渲染"></button></figure><figure><figcaption>修改后<small>本轮实现</small></figcaption><button class="zoom" aria-label="放大修改后截图"><img id="after" alt="修改后真实渲染"></button></figure></main>
<section class="details"><details><summary>实际产品验收截图</summary><p>隔离的本地服务与测试账号；模型输出由本地可控供应商返回，使用真实产品请求、上传和持久化路径。并非外部模型质量评估。</p><div class="evidence" id="products"></div></details></section>
<dialog id="zoom"><button id="close">关闭（Esc）</button><div class="viewer"><img id="large" alt="截图原始尺寸"></div></dialog>
<script>
const pairs=__PAIRS__;
const products=__PRODUCTS__;
const scene=document.querySelector('#scene');
for(const item of pairs){const option=document.createElement('option');option.value=item.id;option.textContent=item.label;scene.append(option)}
function render(){const item=pairs.find(p=>p.id===scene.value)||pairs[0];scene.value=item.id;document.querySelector('.pair').classList.toggle('side',item.id.endsWith('-sidebar'));for(const kind of ['before','after']){const img=document.querySelector('#'+kind);img.src=item['preview'+kind[0].toUpperCase()+kind.slice(1)]||item[kind];img.dataset.full=item[kind];}document.querySelector('#meta').textContent=`${item.size.join(' × ')} px · ${pairs.indexOf(item)+1} / ${pairs.length}`;history.replaceState(null,'','#'+item.id)}
scene.value=decodeURIComponent(location.hash.slice(1));scene.addEventListener('change',render);
for(const [id,step] of [['previous',-1],['next',1]])document.querySelector('#'+id).addEventListener('click',()=>{scene.selectedIndex=(scene.selectedIndex+step+pairs.length)%pairs.length;render()});
const dialog=document.querySelector('#zoom');
function show(src){document.querySelector('#large').src=src;dialog.showModal()}
for(const button of document.querySelectorAll('.zoom'))button.addEventListener('click',()=>show(button.querySelector('img').dataset.full||button.querySelector('img').src));
document.querySelector('#close').addEventListener('click',()=>dialog.close());
for(const item of products){const figure=document.createElement('figure');const caption=document.createElement('figcaption');caption.textContent=item.label;const button=document.createElement('button');button.setAttribute('aria-label','放大实际产品 '+item.label);const img=document.createElement('img');img.alt=item.label;img.src=item.path;img.loading='lazy';button.append(img);button.addEventListener('click',()=>show(img.src));figure.append(caption,button);document.querySelector('#products').append(figure)}
render();
</script></html>'''
html = html.replace('__PAIRS__', json.dumps(pairs, ensure_ascii=False)).replace('__PRODUCTS__', json.dumps(products, ensure_ascii=False))
(root / 'comparison.html').write_text(html)
print(f'Archived {len(pairs)} paired scenes and {len(products)} product screenshots')
