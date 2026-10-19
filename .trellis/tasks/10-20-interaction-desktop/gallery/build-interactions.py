#!/usr/bin/env python3
"""Archive exact Desktop source and searchable inventory, never claim GUI passes."""
from pathlib import Path
import hashlib
import html
import json
import subprocess

G = Path(__file__).resolve().parent
R = Path(subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], cwd=G, text=True).strip())
O = R / 'docs/visual-comparisons/2026-10-20-desktop'
B = '53285bbdeaa17475e04aae517f07c957776cb6b6'
inventory = json.loads((G.parent / 'research/interaction-inventory.json').read_text())
paths = [item['path'] for item in inventory['files']]
paths += ['packages/renderer/src/components/settings/ClientSection.tsx', 'packages/shared/src/desktop.ts']
snapshots = {}
for variant in ['before', 'current']:
    rows = []
    for path in paths:
        raw = subprocess.check_output(['git', 'show', B + ':' + path], cwd=R) if variant == 'before' else (R / path).read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        lines = raw.decode().splitlines()
        target = O / 'sources' / variant / (path.replace('/', '__') + '.html')
        target.parent.mkdir(parents=True, exist_ok=True)
        body = ''.join(f'<li id="L{n}"><pre>{html.escape(line) or " "}</pre></li>' for n, line in enumerate(lines, 1))
        page = f'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>{html.escape(path)}</title><style>body{{font:13px/1.65 monospace;margin:20px;background:#fafbfa;color:#252a26}}ol{{white-space:pre;overflow:auto;padding-left:5em;background:white}}pre{{margin:0;font:inherit}}li:target{{background:#d7f3e2}}header{{overflow-wrap:anywhere}}</style><header><a href="../../interactions.html">Desktop来源索引</a><h1>{html.escape(path)}</h1><p>{variant}真实源码 · SHA256 {digest}</p></header><ol>{body}</ol></html>'
        target.write_text(page)
        rows.append({'path': path, 'sha256': digest, 'bytes': len(raw), 'lines': len(lines), 'html': str(target.relative_to(O))})
    snapshots[variant] = rows
current = {item['path']: item for item in snapshots['current']}
markers = {
    'DESK-SETUP-READ': 'const [loadFailure, setLoadFailure]',
    'DESK-SETUP-LOCAL': '<span className={styles.optionName}>本地使用',
    'DESK-SETUP-CLOUD': '<span className={styles.optionName}>连接服务器',
    'DESK-SETUP-SUBMIT': 'const submit = async',
    'DESK-SETUP-CANCEL': '{canCancel && (',
    'DESK-SETUP-FEEDBACK': '{loadFailure ? (',
    'DESK-SETUP-CHROME': "<WindowControls omit={['maximize']}",
    'DESK-TITLEBAR': 'export function TitleBar(',
    'DESK-WINDOW-CONTROLS': 'export function WindowControls(',
    'DESK-ABOUT': 'const boot = useQuery(',
    'DESK-CLIENT-ENTRY': 'export function ClientSection(',
    'DESK-MENU': 'Menu.buildFromTemplate([',
    'DESK-CLOUD-FAIL': "'did-fail-load',",
    'DESK-UNTRUSTED': 'async function confirmUntrustedSwitch(',
    'DESK-MODE-CHOOSE': "ipcMain.handle('mimir:mode-choose',",
    'DESK-MODE-ACTIVATE': "ipcMain.on('mimir:mode-activate',",
    'DESK-BOOT': 'async function main():',
    'DESK-NAV-BOUNDARY': 'const guardedSessions = new WeakSet',
    'DESK-PRELOAD': 'boot: (): Promise<DesktopBootInfo',
}
scene_map = {
    'DESK-SETUP-READ': 'setup-loading', 'DESK-SETUP-LOCAL': 'setup-local',
    'DESK-SETUP-CLOUD': 'setup-cloud', 'DESK-SETUP-SUBMIT': 'choose-pending',
    'DESK-SETUP-CANCEL': 'setup-cloud', 'DESK-SETUP-FEEDBACK': 'choose-failure',
    'DESK-SETUP-CHROME': 'setup-first', 'DESK-TITLEBAR': 'titlebar',
    'DESK-WINDOW-CONTROLS': 'window-controls', 'DESK-ABOUT': 'about-long',
}
rows = []
for item in inventory['surfaces']:
    path = item['source']['file']
    marker = markers[item['id']]
    matches = [n for n, text in enumerate((R / path).read_text().splitlines(), 1) if marker in text]
    assert len(matches) == 1, (item['id'], matches)
    line = matches[0]
    rows.append({**item, 'evidenceStatus': 'source-only', 'browserStatus': 'not-asserted-here',
                 'source': {'path': path, 'line': line, 'sha256': current[path]['sha256'], 'url': current[path]['html'] + '#L' + str(line)},
                 'sourceLineMeaning': 'Exact current marker verified once in file; original research line retained separately.',
                 'sourceMarker': marker, 'originalResearchSource': item['source'],
                 'scene': scene_map.get(item['id']),
                 'demoBoundary': 'Real renderer component with simulated bridge; native result unverified' if item['id'] in scene_map else 'Native or shared carrier path; no equivalent fake HTML interaction provided'})
data = {'baseline': B, 'sourceMappingOnly': True, 'inventoryDate': inventory['date'],
        'count': len(rows), 'countMeaning': 'Surface families with overlapping state/control arrays; neither independent action count nor GUI passes.',
        'sourceSnapshots': snapshots, 'groups': rows, 'nativeOnly': inventory['native_only']}
for target in [G / 'coverage-map.json', O / 'coverage-map.json']:
    target.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
(O / 'research-inventory.json').write_text(json.dumps(inventory, ensure_ascii=False, indent=2) + '\n')
page = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Desktop完整来源与交互索引</title><style>*{box-sizing:border-box}body{margin:0;font:14px/1.65 system-ui;color:#252a26;background:#f7f8f8}header,main{max-width:1200px;margin:auto;padding:20px}h1{font-size:24px}a{color:#007849}nav,.filters{display:flex;gap:12px;flex-wrap:wrap}article{padding:16px;margin:12px 0;background:white;border:1px solid #dde4df;border-radius:8px;overflow-wrap:anywhere}h2{font-size:16px;margin:0}input{font:inherit;padding:8px;max-width:100%;width:340px}pre{white-space:pre-wrap;font:12px/1.5 monospace}.meta{color:#69716a;font-size:12px}:focus-visible{outline:2px solid #00834d;outline-offset:3px}</style><header><h1>Desktop完整来源与交互索引</h1><p>19类真实源码界面与运行路径；来源记录不等于逐项GUI验收。浏览器Demo使用真实组件和模拟桥，不能证明原生窗口行为。</p><nav><a href="comparison.html">真实前后对比</a><a href="demo/dist/after/index.html?scene=setup-first">当前可操作Demo</a><a href="demo/dist/before/index.html?scene=setup-first">基线Demo</a><a href="coverage-map.json">完整映射与源码指纹</a><a href="research-inventory.json">原始研究索引</a><a href="demo/README.md">证据边界</a></nav><p>真实窗口默认1440×900，未设置最小宽高；390×400仅压力检查。原生菜单、系统控件、拖动、导航、配置持久化和宿主启动须原生验证。</p><div class="filters"><input id="query" type="search" aria-label="搜索交互" placeholder="搜索界面、状态、控件或源码"><span id="count" role="status"></span></div></header><main id="list"></main><script>const data=DATA;const $=s=>document.querySelector(s);function add(p,t,s){const e=document.createElement(t);e.textContent=s;p.append(e);return e}function render(){const q=$('#query').value.toLowerCase(),rows=data.groups.filter(r=>JSON.stringify(r).toLowerCase().includes(q));$('#count').textContent=rows.length+'类来源';$('#list').replaceChildren();for(const r of rows){const c=add($('#list'),'article','');c.id=r.id;add(c,'h2',r.surface);add(c,'p',r.id+' · source-only · GUI结果见独立验收记录').className='meta';const s=add(c,'a',r.source.path+':'+r.source.line);s.href=r.source.url;add(c,'p','状态：'+r.states.join('；'));add(c,'p','入口：'+r.controls.join('；'));add(c,'p',r.note);if(r.scene){const a=add(c,'a','打开真实组件Demo（模拟桥）');a.href='demo/dist/after/index.html?scene='+r.scene}add(c,'p',r.demoBoundary);const d=add(c,'details','');add(d,'summary','原始来源与验收条件');add(d,'pre',JSON.stringify(r,null,2))}}$('#query').addEventListener('input',render);render();</script></html>'''.replace('DATA', json.dumps(data, ensure_ascii=False).replace('</script', '<\\/script'))
(O / 'interactions.html').write_text(page)
print(f'{len(rows)} source surface families; {len(paths)} exact source files in each variant; GUI claims excluded.')
