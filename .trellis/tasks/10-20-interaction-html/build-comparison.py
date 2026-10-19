from pathlib import Path
import hashlib
import html
import json
import shutil
from PIL import Image

ROOT = Path.cwd()
TASK = ROOT / '.trellis/tasks/10-20-interaction-html'
OUT = ROOT / 'docs/visual-comparisons/2026-10-20-html'
pairs = [
    ('wide-light', '宽编辑列 · 源码主题', '1100×640 编辑区，1280×720 视口；语法、行号、选中与光标沿现有主题角色。'),
    ('narrow-dark', '中编辑列 · 深色分栏', '690×640 编辑区，1280×720 视口；根据编辑区实际宽度上下排列，作者页面保持原配色。'),
    ('inspector', '元素属性 · 扣除面板后的分栏', '1100×640 编辑区，1280×720 视口；属性面板占320px，剩余780px分栏上下排列。'),
    ('insert-table', '插入表格 · 标签与主操作', '690×640 深色编辑区，1280×720 视口；菜单280px、行列可见名称与明确主操作。'),
    ('writing-partial', '部分草稿 · 状态与动作', '690×640 编辑区，1280×720 视口；同一268字符模拟增量后失败，既有iframe临时预览，源码尚未写入。'),
    ('brief-short', '长提纲 · 短高回归', '390×440 编辑区，1280×720 视口；12章节长输入、内部滚动与固定动作。此组主要记录既有行为保持。'),
    ('brief-280', '最窄提纲 · 动作换行', '280×360 编辑区，1280×720 视口；247px面板为三项操作保留间距，确认动作另起一行。'),
    ('phone', '窄视口 · 源码与预览', '390×640 真实视口；页面无横向溢出，两栏始终挂载，主题与语法可读。'),
]
supplements = [
    ('css-preview', 'CSS 临时预览', '真实标题临时变红与增加8px内边距；保存仍禁用。取消后恢复原色与0px内边距。'),
    ('writing-stale', '过期草稿保护', '原文版本推进后，保留禁用；丢弃清除本次临时草稿。'),
    ('questions-narrow', '最窄前置问题', '280×360编辑区，单选与多选、说明在内部滚动区，固定提交可达。'),
    ('insert-short', '短视口插入', '390×360真实视口；280px菜单及主动作均在视口内，无内部横向溢出。'),
    ('presentation-short', '短视口演示', '390×360真实视口；41px操作条，319px iframe；Escape退出。全屏/原生权限未据此宣称已验。'),
]
manifest={'baseline':'0c44cde','date':'2026-10-20','pairs':[],'supplements':[],'images':[]}
for key,title,caption in pairs:
    dims=[]
    for variant in ('before','after'):
        p=OUT/'captures'/f'{key}-{variant}.jpg'
        w,h=Image.open(p).size
        dims.append((w,h))
        manifest['images'].append({'path':str(p.relative_to(OUT)),'width':w,'height':h,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
    assert dims[0]==dims[1], (key,dims)
    manifest['pairs'].append({'key':key,'title':title,'caption':caption,'dimensions':dims[0]})
for key,title,caption in supplements:
    p=OUT/'captures'/f'{key}-after.jpg';w,h=Image.open(p).size
    manifest['images'].append({'path':str(p.relative_to(OUT)),'width':w,'height':h,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
    manifest['supplements'].append({'key':key,'title':title,'caption':caption})
(OUT/'capture-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
shutil.copy(TASK/'gallery/build-manifest.json',OUT/'build-manifest.json')
shutil.copy(TASK/'gallery/README.md',OUT/'demo/README.md')
coverage=json.loads((TASK/'gallery/coverage-map.json').read_text())
browser={4:'受控保存等待→失败保留dirty→再次保存完成，未写盘',17:'真实手机设备390px档位',18:'200%时host布局390px、实际780px',90:'实际下载5166字节，doctype/尾换行保留，无gx预览注入',1:'加载失败/真实重试（后续记录）',2:'实际分栏和视图；源码/iframe不卸载由回归测试验证',3:'真实分类/快捷操作禁用与插入后可用',5:'源码行列和新增插表源码可见',9:'1100/780/690/390实际编辑列',10:'浅深源码背景及语法角色实测',11:'打开查找',12:'知识9处，下一匹配',15:'Escape回到真实CM contenteditable',16:'真实iframe就绪与标题',20:'预览标题点选',22:'html/body/main/h1路径',30:'真实类型下拉8项',32:'行数9拒绝，修为2成功，3列保留',33:'成功status与保存/撤销变为可用',34:'真实Inspector打开/关闭',60:'color:red;padding:8px临时预览',61:'取消恢复，保存仍禁用',74:'真实单选问题可见标签',75:'选择整理方法并提交',77:'真实提纲字段',80:'12章节/长输入与滚动',82:'390/280编辑列，固定动作与Escape取消',83:'公开handle写作+真实增量反馈',85:'失败后268字符部分保留，源码写入且dirty',86:'推进版本→保留禁用→丢弃关闭',87:'真实演示层、短视口、Escape退出'}
# IDs without a browser assertion stay mapped-only; unit results are separate evidence, never inflated into GUI claims.
for row in coverage['groups']:
    n=int(row['id'].split('-')[1])
    row['browser_evidence']=browser.get(n,'未逐项进行浏览器断言；实际组件Demo可经记录入口操作，源码/行为测试另列')
    row['verification']='representative-browser-observed' if n in browser else 'source-entry-mapped; browser-not-individually-verified'
    row['gallery_url']='demo/dist/after/index.html'+row['gallery_url']
coverage['note']='92项为完整入口映射，非92次GUI验收；单元测试97项及全仓门独立记录。模拟IO不等于真实写盘或模型验收。'
(OUT/'coverage-map.json').write_text(json.dumps(coverage,ensure_ascii=False,indent=2)+'\n')
options=''.join(f'<option value="{html.escape(x[0])}">{html.escape(x[1])}</option>' for x in pairs+supplements)
rows=''.join(f'<tr><td>{r["id"]}</td><td>{html.escape(r["title"])}</td><td>{html.escape(r["entry"])}</td><td>{html.escape(r["browser_evidence"])}</td><td><a href="{html.escape(r["gallery_url"])}">操作Demo</a></td></tr>' for r in coverage['groups'])
data=json.dumps({'pairs':manifest['pairs'],'supplements':manifest['supplements']},ensure_ascii=False)
page='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HTML 编辑器 · 真实前后对比</title><style>
*{box-sizing:border-box}body{margin:0;font:14px/1.65 system-ui,sans-serif;color:#26332c;background:#f5f7f6}header,main{max-width:1500px;margin:auto;padding:20px 28px}header{padding-bottom:4px}h1{font-size:24px;margin:0 0 6px}p{margin:6px 0;color:#55645b}a{color:#28704b}nav,.controls{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin:12px 0}select,button,input{font:inherit;padding:7px 10px;border:1px solid #cbd5ce;border-radius:6px;background:white;color:inherit}select{max-width:100%}button[aria-pressed=true]{background:#28704b;color:white;border-color:#28704b}.views{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:16px 0}figure{margin:0;min-width:0}figcaption{font-weight:600;margin-bottom:8px}figure img{display:block;width:100%;height:auto;background:white;border:1px solid #dce3de}#caption{min-height:26px}.single{grid-template-columns:1fr;max-width:1280px;margin-inline:auto}.hidden{display:none!important}details{margin:24px 0;border-top:1px solid #d8e1db;padding-top:16px}summary{cursor:pointer;font-weight:600}.table-wrap{overflow:auto}table{border-collapse:collapse;width:100%;font-size:12px;background:white}td,th{text-align:left;vertical-align:top;padding:9px;border-bottom:1px solid #e2e8e4}th{white-space:nowrap}td:first-child{white-space:nowrap}#search{margin:12px 0;width:min(100%,420px)}@media(max-width:800px){header,main{padding:16px}.views{grid-template-columns:1fr}.controls{gap:6px}h1{font-size:21px}}
</style><header><h1>HTML 编辑器 · 真实前后对比</h1><p>8组同内容、同尺寸真实截图，5组补充状态。基线 0c44cde；2026-10-20 精修。沿现有主题与真实组件实现。</p><nav><a href="demo/dist/after/index.html?scene=body">打开可操作 Demo</a><a href="demo/dist/before/index.html?scene=body">基线 Demo</a><a href="acceptance.md">验收记录</a><a href="capture-manifest.json">截图指纹</a><a href="build-manifest.json">构建指纹</a><a href="browser-observations.json">交互实测</a></nav><p>截图可离线查看；Demo需本地HTTP服务。读写库与模型为明确模拟，原生、外部服务及vendor既有限制见验收记录。</p></header><main><div class="controls"><label>场景 <select id="scene">OPTIONS</select></label><button data-mode="compare" aria-pressed="true">并排</button><button data-mode="before" aria-pressed="false">打磨前</button><button data-mode="after" aria-pressed="false">打磨后</button></div><p id="caption"></p><div class="views"><figure id="before"><figcaption>打磨前</figcaption><a><img alt="打磨前真实截图"></a></figure><figure id="after"><figcaption>打磨后</figcaption><a><img alt="打磨后真实截图"></a></figure></div><details open><summary>92 项真实交互入口及证据边界</summary><p>入口完整映射不等于逐项完成GUI断言；每行保留具体状态与操作方式。原件保真/版本/消息等合同由相关行为测试验证。</p><input id="search" aria-label="筛选交互" placeholder="搜索编号、入口或状态"><div class="table-wrap"><table><thead><tr><th>编号</th><th>交互</th><th>入口</th><th>浏览器证据</th><th>实际组件</th></tr></thead><tbody>ROWS</tbody></table></div></details></main><script>
const data=DATA;const scene=document.querySelector('#scene');let mode='compare';const entries=[...data.pairs,...data.supplements];function render(){const item=entries.find(x=>x.key===scene.value)||entries[0];scene.value=item.key;document.querySelector('#caption').textContent=item.caption;const paired=data.pairs.some(x=>x.key===item.key);for(const kind of ['before','after']){const figure=document.getElementById(kind);figure.classList.toggle('hidden',(kind==='before'&&!paired)||(mode!=='compare'&&mode!==kind));const src='captures/'+item.key+'-'+kind+'.jpg';if(kind==='after'||paired){figure.querySelector('img').src=src;figure.querySelector('a').href=src}}document.querySelector('.views').classList.toggle('single',mode!=='compare'||!paired);document.querySelectorAll('[data-mode]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.mode===mode));b.disabled=!paired&&b.dataset.mode==='before'});history.replaceState(null,'','#'+item.key)}scene.addEventListener('change',()=>{if(!data.pairs.some(x=>x.key===scene.value))mode='after';render()});document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.mode;render()}));document.querySelector('#search').addEventListener('input',e=>{const q=e.target.value.toLowerCase();document.querySelectorAll('tbody tr').forEach(r=>r.hidden=!r.textContent.toLowerCase().includes(q))});scene.value=location.hash.slice(1)||entries[0].key;render();
</script></html>'''.replace('OPTIONS',options).replace('ROWS',rows).replace('DATA',data)
(OUT/'comparison.html').write_text(page)
print('Built comparison: 8 pairs, 5 supplements, 92 mapped entries; image dimensions match')
