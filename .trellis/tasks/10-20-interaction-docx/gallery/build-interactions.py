#!/usr/bin/env python3
"""Map each research ID to an honest real-component entry; never assert GUI pass."""
from pathlib import Path
import hashlib
import html
import json
import re
import subprocess

GALLERY = Path(__file__).resolve().parent
REPO = Path(subprocess.check_output(['git','rev-parse','--show-toplevel'],cwd=GALLERY,text=True).strip())
INVENTORY = GALLERY.parent / 'research/interaction-inventory.md'
source_text = INVENTORY.read_text()
AREAS = {
 'home':('开始','rich',['打开固定原件，等待真实编辑器就绪','点击“开始”分类']),
 'insert':('插入','rich',['在真实正文中放置光标','点击“插入”分类，选择对应入口']),
 'picture':('图片格式','rich',['在文档中滚动至原生图片并点选图片','点击出现的“图片格式”分类→“调整选中图片”']),
 'design':('设计','rich',['点击“设计”分类→“主题与字体”']),
 'background':('页面背景','rich',['点击“设计”分类→“页面颜色与边框”']),
 'draw':('绘图','rich',['点击“绘图”分类','选择笔/荧光笔/橡皮；笔迹设置从同组入口进入，实际绘制需Canvas手势']),
 'layout':('布局','rich',['在真实正文中放置光标','点击“布局”分类，打开段落相关工具']),
 'page':('页面与节','rich',['点击“布局”分类→“页面与节”']),
 'watermark':('水印','rich',['点击“布局”分类→“水印”']),
 'header':('页眉和页脚','rich',['点击“布局”分类→“页眉和页脚”']),
 'references':('引用','headings',['点击“引用”分类','选择目录/题注/引文与来源/索引/原生域对应入口，再选择当前引用工具']),
 'toc':('目录旧入口','headings',['在正文中放置插入光标','点击“插入”分类→“目录”（旧插入入口，区别于引用→目录与更新）']),
 'review':('审阅','rich',['点击“审阅”分类→“修订与拼写”']),
 'comments':('管理批注','rich',['先在同一段内真实选中文字','审阅→添加批注并提交，然后打开“管理批注”；默认丰富原件没有预置讨论']),
 'comment-add':('新增批注','rich',['在同一段内真实选中文字','审阅→添加批注，输入内容后提交']),
 'notes':('脚注与尾注','footnotes',['点击“审阅”分类→“修订与拼写”组→“管理脚注与尾注”','选择实际原生注释，操作查找/替换/删除等现有动作']),
 'note-add':('插入脚注尾注','rich',['在真实正文内放置光标','点击“插入”分类→“插入脚注或尾注”，选择注释类型']),
 'styles':('样式管理','headings',['点击“开始”分类→“样式”组→“管理样式”']),
 'lists':('列表设置','rich',['在已有列表段落中放置光标；或先从开始分类创建列表','开始→列表→列表设置']),
 'chart':('图表','rich',['在正文内放置光标','点击“插入”分类→“图表”；默认丰富原件无原生图表，已有图表路径须先真实插入']),
 'textbox':('文本框','rich',['在正文内放置光标','点击“插入”分类→“文本框”']),
 'table':('表格操作','rich',['在固定原件的实际表格单元格中放置光标；按动作需要真实选多格','点击“表格”分类→“表格操作”']),
 'table-design':('表格设计','rich',['在固定原件的原生表格中放置光标','点击“表格”分类→“表格设计”→原生表格设置']),
 'view':('视图','rich',['点击“视图”分类，选择打印/Web/阅读、缩放等现有控件']),
 'split':('拆分只读视图','rich',['点击“视图”分类→“拆分视图”','下方是真实只读副本，主编辑器保持唯一']),
 'navigation':('文档导航','headings',['点击“视图”分类→“文档导航”','在真实大纲中选择标题或页面，必要时编辑/应用标题层级']),
 'find':('查找与替换','rich',['在真实编辑器内按Ctrl/Cmd+F；或点击“开始”→查找和替换','输入查询，操作结果/替换或关闭；受保护原件的替换能力另验']),
 'case':('大小写','rich',['在正文中真实选中英文文字','开始→更多字形→大小写']),
 'compare':('本地文档对比','rich',['点击“审阅”分类→“对比文档”','通过真实文件选择器选择本地DOCX；可下载gallery固定原件用于对比，未预先注入比较结果']),
 'protection':('原件保护','rich',['点击“审阅”分类→保护组→“文档保护”','普通丰富原件只展示当前可写状态；原生受限状态需提供对应受保护原件，不能从该fixture推断已验']),
 'protection-settings':('保护设置','rich',['点击“审阅”分类→保护组→“文档保护”→“更改保护设置”','选择真实限制/密码意图，应用后使用模拟保存与重开验证当前fixture']),
 'encryption':('打开密码','agile',['打开真实Agile加密固定原件，输入样例文档密码Password1234_','进入后点击“审阅”分类→保护→“打开密码”']),
 'encrypted-open':('加密原件打开','agile',['打开真实Agile加密固定原件','输入公开样例文档密码Password1234_，或用错误密码验证实际错误；取消/恢复按真实控件']),
 'privacy':('个人信息','rich',['点击“审阅”分类→保护组→“个人信息”']),
 'load':('原件读取等待','load-pending',['保留辅助区，等待固定字节读入后的“读取DOCX原件”模拟请求','点击“完成模拟请求”或“失败模拟请求”手动结算']),
 'load-error':('原件读取失败','load-error',['首次加载显示fixture明确抛出的读取错误','点击真实“重试”，从相同原生原件恢复']),
 'save':('保存与原件重开','save',['在真实正文或属性工具中修改文档','点击真实“保存到库”→辅助“完成模拟请求”或“失败模拟请求”','成功后可点“重开最近模拟保存原件”，重新解析真实保存字节；仅页面内存ACK']),
 'export':('导出当前副本','rich',['在真实正文或附加参数中产生待导出的改动','点击“视图”→“导出当前DOCX副本”；下载是真实浏览器动作，字节/磁盘另验']),
 'inspector':('文档Inspector','rich',['从任一真实具名工具入口打开Inspector','用关闭/Escape、字段与滚动检查当前面板；入口与子弹层均由真实组件控制']),
}

def entry_area(path, line, label):
    f=Path(path).name
    if f=='DocxAdvancedControls.tsx':
        return 'chart' if line<230 else 'textbox' if line<396 else 'page' if line<639 else 'watermark' if line<836 else 'comment-add' if line<932 else 'comments' if line<1129 else 'notes'
    dedicated={'DocxStyleControls.tsx':'styles','DocxListControls.tsx':'lists','docx-lists.ts':'lists','DocxCaseControls.tsx':'case','docx-case.ts':'case','DocxCompareControls.tsx':'compare','DocxComparePanel.tsx':'compare','DocxDesignControls.tsx':'design' if line<303 else 'background','DocxEncryptionControls.tsx':'encrypted-open' if line<98 else 'encryption','DocxImageControls.tsx':'picture','DocxImageCropPreview.tsx':'picture','DocxInkControls.tsx':'draw','DocxInkOverlay.tsx':'draw','DocxPrivacyControls.tsx':'privacy','DocxProtectionControls.tsx':'protection','DocxProtectionSettingsControls.tsx':'protection-settings','DocxReferencesControls.tsx':'references','docx-references.ts':'references','DocxTableDesignControls.tsx':'table-design','DocxTocControls.tsx':'toc','DocxViewControls.tsx':'view','DocxViewPanel.tsx':'navigation','DocxSplitView.tsx':'split'}
    if f in dedicated:return dedicated[f]
    if f!='DocxEditor.tsx':return 'home'
    if 1730<=line<=1750:return 'split'
    if line==1780:return 'navigation'
    if 1960<=line<=2009:return 'load-error' if line==1978 or line==1980 else 'load'
    if 1824<=line<=1940 or 2030<=line<=2049:return 'save'
    if line in (2203,3476):return 'export'
    if line==2244:return 'encryption'
    if line==2397 or line in (1273,2385):return 'inspector'
    if line in (1474,1969,2055,2229,2235,3127):return 'find'
    if 2607<=line<=2614:return 'styles'
    if 2550<=line<=2929:return 'home'
    if line==2934 or 4011<=line<=4259:return 'table'
    if 3050<=line<=3087:return 'note-add' if line>=3062 else 'insert'
    if 3088<=line<=3119 or 3869<=line<=3930:return 'insert'
    if 3138<=line<=3151 or 3613<=line<=3700:return 'header'
    if 3157<=line<=3176 or 3499<=line<=3612:return 'comment-add'
    if 3184<=line<=3201 or line==3385 or 4260<=line<=4350:return 'review'
    if 3718<=line<=3845:return 'layout'
    if line in (1451,3230):return 'view'
    return 'home'

S_AREAS={1:'load',2:'load-error',3:'load',**{n:'encrypted-open' for n in (4,5,6)},**{n:'save' for n in (7,8,9,10)},11:'export',12:'encryption',13:'home',14:'home',15:'inspector',16:'inspector',**{n:'find' for n in range(17,21)},21:'home',22:'home',23:'home',24:'case',25:'chart',26:'chart',27:'chart',28:'textbox',29:'toc',30:'insert',31:'note-add',32:'insert',33:'insert',**{n:'picture' for n in range(34,39)},39:'design',40:'background',41:'design',42:'lists',43:'lists',44:'styles',45:'styles',46:'styles',47:'page',48:'page',49:'watermark',50:'watermark',51:'header',**{n:'references' for n in range(52,59)},59:'comment-add',60:'comments',61:'comments',62:'comments',63:'notes',64:'review',65:'protection',66:'review',67:'compare',68:'compare',69:'protection',70:'protection',71:'protection',72:'protection',73:'protection-settings',74:'protection-settings',75:'encryption',76:'encryption',77:'privacy',78:'privacy',79:'table',80:'table',81:'table-design',82:'table-design',83:'view',84:'view',85:'split',86:'navigation',87:'navigation',88:'navigation',89:'view',90:'draw',91:'draw',92:'draw'}
D_AREAS={1:'home',2:'home',3:'home',4:'home',5:'case',6:'note-add',7:'home',8:'page',9:'table',10:'table',11:'review',12:'chart',13:'page',14:'references',15:'references',16:'references',17:'design',18:'lists',19:'styles',20:'picture',21:'protection-settings',22:'encryption',23:'draw',24:'table-design'}
T_AREAS={1:'home',2:'insert',3:'picture',4:'design',5:'draw',6:'layout',7:'references',8:'review',9:'table',10:'view',11:'view',12:'home',13:'inspector'}
rows=[]
for number, raw in enumerate(source_text.splitlines(),1):
    if not re.match(r'^\| DOCX-[TSDU]\d{3}',raw):continue
    cols=[col.strip() for col in raw.strip().strip('|').split('|')]
    inventory_id=cols[0]; match=re.match(r'(DOCX-([TSDU])(\d{3}))',inventory_id); ident,kind,num=match.group(1),match.group(2),int(match.group(3))
    label=cols[2] if kind=='U' else cols[1]
    source_evidence=cols[-1]
    locations=[]
    for original in re.findall(r'`([^`]+)`',source_evidence):
        path,_,line_spec=original.partition(':')
        if not path.startswith('packages/'):
            path='packages/office/src/editors/'+path
        if not (REPO/path).is_file():raise SystemExit(f'Unresolved source {ident}: {path}')
        n=re.match(r'\d+',line_spec)
        locations.append({'path':path,'line':int(n.group()) if n else None,'lineSpec':line_spec or None,'originalCitation':original})
    if not locations:raise SystemExit(f'No source: {ident}')
    area=(S_AREAS[num] if kind=='S' else D_AREAS[num] if kind=='D' else T_AREAS[num] if kind=='T' else entry_area(locations[0]['path'],locations[0]['line'] or 0,label))
    area_label,fixture,steps=AREAS[area]
    boundaries=['此条仅源码入口映射；逐项浏览器验证未执行，不把分组标签当作按钮点击结果。','保存/读取库为明确模拟IO；实际组件内存修改和原生字节物化不等于真实知识库持久化。']
    if kind=='D':boundaries.append('这是参数化入口族；保留原始枚举与占位符，不把24个族冒充全部动态子值已穷举。当前fixture实际字体、样式、颜色、系列等需现场读取记录。')
    if kind=='S' and num in (3,62,65,69,70,71,72,76):boundaries.append('当前固定Demo未内置此条要求的全部损坏/受保护/密码限制原件；链接仅通向相关真实入口，须另行准备真实原件，禁止注入私有状态替代。')
    if kind=='S' and num in (11,12,33,37,50,67,68,90,91,92):boundaries.append('文件选择、下载、原生像素/指针、异步取消或加密等待需要实际环境单独操作取证。')
    if kind=='S' and num==89:boundaries.append('当前fixture不启动真实模型Agent；阅读中Agent写入需要实际宿主或行为测试证明。')
    steps=list(steps)
    if kind=='U':steps.append(f'在以上真实界面中找到「{label}」（组件/范围：{cols[1]}），按实际可用条件操作。')
    if kind=='S':steps.append('按本条状态合同准备正常/失败/取消/过期条件；没有实际触发的状态保留未验。')
    if kind=='D':steps.append('在真实控件中按原始参数化模式枚举当前fixture实际值；缺失/禁用值如实记录，不构造虚假选项。')
    rows.append({'id':ident,'inventoryId':inventory_id,'kind':{'T':'surface','S':'state','D':'dynamic-family','U':'static-control'}[kind],'title':label,'component':cols[1] if kind=='U' else None,'parameterPattern':inventory_id[len(ident)+1:] if kind=='D' else None,'sourceSnapshot':'6f6af4c','sourceLocations':locations,'inventoryEvidence':{'path':str(INVENTORY.relative_to(REPO)),'line':number},'area':area,'areaLabel':area_label,'fixture':fixture,'demoQuery':f'?scene={fixture}&interaction={ident}&capture=0','entrySteps':steps,'applicable':{'themes':['light','dark'],'editorWidths':[1100,690,390,338],'shortEditorSize':[420,500],'states':'按真实源码条件检查；本项无对应loading/error则N/A，不补造状态。','interactionContract':label if kind=='S' else cols[1] if kind=='D' else 'hover/focus/disabled/键盘按真实控件适用；容器/分组不等于可执行动作。'},'evidenceStatus':'source-only','browserStatus':'unverified','componentTestStatus':'unverified','boundaries':boundaries})
assert len(rows)==478 and len({row['id'] for row in rows})==478
for kind,count in [('surface',13),('state',92),('dynamic-family',24),('static-control',349)]:assert sum(row['kind']==kind for row in rows)==count
result={'baseline':'6f6af4c','inventory':{'path':str(INVENTORY.relative_to(REPO)),'sha256':hashlib.sha256(INVENTORY.read_bytes()).hexdigest()},'count':len(rows),'countMeaning':'13界面 + 92独立状态 + 24参数化动态入口族 + 349静态控件；动态族子值未算作已穷举/已验收。','sourceMappingOnly':True,'groups':rows}
(GALLERY/'coverage-map.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(f'Mapped {len(rows)} unique IDs; all browserStatus=unverified')
template=(GALLERY/'interactions.template.html').read_text()
serialized=json.dumps(result,ensure_ascii=False,separators=(',',':')).replace('</script','<\\/script')
page=template.replace('__COVERAGE_JSON__',serialized)
(GALLERY/'interactions.html').write_text(page)
archive=REPO/'docs/visual-comparisons/2026-10-20-docx/demo'
archive.mkdir(parents=True,exist_ok=True)
(archive/'interactions.html').write_text(page.replace('data-host="live"','data-host="archive"'))
(archive/'coverage-map.json').write_text((GALLERY/'coverage-map.json').read_text())
(archive.parent/'interactions.html').write_text(page.replace('data-host="live"','data-host="archive-root"'))
subprocess.run(['pnpm','exec','oxfmt',str(archive.parent/'interactions.html'),str(archive/'interactions.html'),str(archive/'coverage-map.json')],cwd=REPO,check=True)
print('Wrote standalone searchable live/archive/root interactions.html; fixture main/config unchanged')
