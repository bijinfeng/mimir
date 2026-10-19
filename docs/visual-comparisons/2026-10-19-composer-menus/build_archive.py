"""Archive real browser captures; normalize encoding without resizing pixels."""
from pathlib import Path
import hashlib
import html
import json
from PIL import Image

root = Path(__file__).resolve().parent
for path in root.glob('*.png'):
    with Image.open(path) as source:
        pixels = source.convert('RGB')
    pixels.save(path, format='PNG', optimize=True)

pairs = [('trigger', '工具顺序与模型触发器'), ('model', '模型列表'),
         ('effort', '思考强度'), ('scope', '知识库范围')]
previews = root / 'previews'
previews.mkdir(exist_ok=True)
sections = []
for key, label in pairs:
    figures = []
    for state, caption in [('before', '修改前'), ('after', '修改后')]:
        name = f'{state}-{key}.png'
        with Image.open(root / name) as image:
            # The actual document-assistant panel occupies the rightmost 400px.
            image.crop((image.width - 400, 580, image.width, image.height)).save(previews / name, optimize=True)
        figures.append(f'<figure><figcaption>{caption}</figcaption><a href="{name}" target="_blank"><img src="previews/{name}" alt="{html.escape(label)} · {caption}"></a></figure>')
    sections.append(f'<section><h2>{label}</h2><div class="pair">'+''.join(figures)+'</div></section>')
extras = []
for name, label in [('narrow-long-model','280px · 长模型名'),('narrow-long-scope','280px · 长范围标题'),
                    ('narrow-effort-keyboard','280px · 键盘聚焦'),('320-dark','320px · 深色'),
                    ('390-light','390px · 浅色'),('main-light','主对话 · 浅色')]:
    extras.append(f'<a href="{name}.png" target="_blank">{label}</a>')
(root / 'comparison.html').write_text('''<!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>对话工具栏与菜单 · 前后对比存档</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f5f7f6;color:#242824;font:14px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif}main{max-width:960px;margin:auto;padding:28px 24px 48px}h1{font-size:24px;margin:0 0 10px}h2{font-size:18px;margin:28px 0 12px}p{margin:8px 0;color:#57645b}a{color:#007a45;text-underline-offset:3px}a:focus-visible{outline:2px solid #00894f;outline-offset:2px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px}figure{margin:0;background:#fff;border:1px solid #dde3df;border-radius:6px;overflow:hidden}figcaption{padding:10px 14px;font-weight:600}img{width:100%;height:auto;display:block}nav{display:flex;flex-wrap:wrap;gap:12px 20px}small{color:#647269}@media(max-width:650px){.pair{grid-template-columns:1fr}main{padding:20px 14px}}
</style><main><h1>对话工具栏与菜单</h1>
<p>左侧：附件、知识库范围。右侧：模型、思考强度、发送。模型触发器按内容收缩，菜单去掉外围留白，选中标记预留位置。</p>
<p>真实产品截图的局部预览；点击查看完整原图。菜单最初共用 258px；当前短列表为 176px，思考强度为 128px。长内容可增长至容器限定上限。</p>
<small>2026-10-19 · 基线 e5c39a3 · 同尺寸真实产品截图。修改前分别记录在对应反馈到达时：范围截图已应用去外圈内边距；触发器截图已应用菜单宽度修复。图片不随后续代码变化。</small>
'''+''.join(sections)+'''<section><h2>补充边界验证</h2><p>下列场景使用生产 ChatPanel 与当前主题，固定长名称和内存 IO，不连接真实模型。</p><nav>'''+''.join(extras)+'''</nav><p><a href="metrics.json">实际尺寸与键盘验证记录</a> · <a href="verification.md">质量检查说明</a></p></section></main></html>''')
manifest = []
for path in sorted(root.glob('*.png')):
    with Image.open(path) as image:
        dimensions = list(image.size)
    manifest.append({'file':path.name,'dimensions':dimensions,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
(root / 'render-manifest.json').write_text(json.dumps({'baseline':'e5c39a3','productSource':'packages/chat/src/composer/ComposerMenus.tsx','sourceSha256':hashlib.sha256((root.parents[2] / 'packages/chat/src/composer/ComposerMenus.tsx').read_bytes()).hexdigest(),'captures':manifest},ensure_ascii=False,indent=2)+'\n')
