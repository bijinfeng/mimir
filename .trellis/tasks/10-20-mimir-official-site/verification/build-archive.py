"""Archive real browser captures; raw snapshots come from CUA DOM observations."""
from pathlib import Path
import base64
import hashlib
import html
import json
import mimetypes
import re
from PIL import Image

ROOT = Path(__file__).resolve().parents[4]
ARCHIVE = ROOT / 'docs/visual-comparisons/2026-10-20-official-site'
CAPTURES = ARCHIVE / 'captures'
records = []
for source in sorted(CAPTURES.glob('*.json')):
    observation = json.loads(source.read_text())
    if 'html' not in observation:
        continue
    assert '[Truncated]' not in observation['html'], source.name
    assert '[Truncated]' not in observation['css'], source.name
    assert observation['html'].rstrip().endswith('</html>'), source.name
    markup = re.sub(r'<script\b[^>]*>[\s\S]*?</script>', '', observation['html'], flags=re.I)
    markup = markup.replace('</head>', '<style>' + observation['css'] + '</style></head>')
    def asset(match):
        attr, url = match.groups()
        path = ROOT / url.lstrip('/')
        if path.is_file() and attr == 'src':
            mime = mimetypes.guess_type(str(path))[0] or 'application/octet-stream'
            return attr + '="data:' + mime + ';base64,' + base64.b64encode(path.read_bytes()).decode() + '"'
        return attr + '="http://127.0.0.1:5173' + url + '"'
    markup = re.sub(r'(src|href)="(/[^\"]*)"', asset, markup)
    target = source.with_suffix('.html')
    target.write_text('<!doctype html>\n' + markup)
    png = source.with_suffix('.png')
    if png.exists():
        with Image.open(png) as screenshot:
            width, height = screenshot.size
            if screenshot.format != 'PNG':
                screenshot.save(png, format='PNG')
        data = png.read_bytes()
        assert (width, height) == (observation['width'], observation['height']), source.name
        records.append({'name': source.stem, 'viewport': [width, height], 'theme': observation['theme'], 'url': observation['url'], 'png': 'captures/' + png.name, 'rendered_html': 'captures/' + target.name, 'sha256': hashlib.sha256(data).hexdigest()})
(ARCHIVE / 'capture-manifest.json').write_text(json.dumps(records, ensure_ascii=False, indent=2) + '\n')
page = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Mimir 官网 · 真实渲染对比</title><style>
*{box-sizing:border-box}body{margin:0;padding:28px;font:15px/1.7 system-ui,sans-serif;background:#f7f8f8;color:#262626}h1{font-size:26px;margin:0 0 8px}p{max-width:80ch;color:#595959}nav{display:flex;flex-wrap:wrap;gap:12px;margin:24px 0}a{color:#007a45}section{margin:40px 0}h2{font-size:20px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px}figure{margin:0;min-width:0}img{width:100%;display:block;border:1px solid #d8dcda}figcaption{margin-bottom:8px}.narrow{max-width:850px}.narrow img{max-width:390px}@media(max-width:700px){body{padding:16px}.pair{grid-template-columns:1fr}}
</style><h1>Mimir 官网 · 真实渲染对比</h1><p>这是新增官网：此前根路径进入登录页，改后根路径显示产品介绍。每组保持相同主题和尺寸；截图与静态 HTML 均来自实际 React 页面。旧页面和新页面的内容因入口职责变化而不同，未伪造旧版官网。HTML 保留渲染样式，交互请在运行中的官网验证。</p><nav>'''
for theme in ['light', 'dark']:
    for size in ['wide', 'narrow']:
        name = theme + '-' + size
        page += '<a href="#' + name + '">' + name + '</a>'
page += '</nav>'
for theme in ['light', 'dark']:
    for size in ['wide', 'narrow']:
        name = theme + '-' + size
        page += '<section id="' + name + '" class="' + size + '"><h2>' + name + '</h2><div class="pair">'
        for phase, title in [('before', '之前：登录入口'), ('after', '之后：产品官网')]:
            path = 'captures/' + phase + '-' + name
            page += '<figure><figcaption>' + title + ' · <a href="' + path + '.html">静态渲染 HTML</a></figcaption><a href="' + path + '.png"><img loading="lazy" alt="' + html.escape(title + ' ' + name) + '" src="' + path + '.png"></a></figure>'
        page += '</div></section>'
page += '<footer><a href="README.md">覆盖说明与验证结果</a> · <a href="capture-manifest.json">尺寸、来源及哈希</a></footer></html>'
(ARCHIVE / 'comparison.html').write_text(page)
print('Archived', len(records), 'real viewport captures.')
