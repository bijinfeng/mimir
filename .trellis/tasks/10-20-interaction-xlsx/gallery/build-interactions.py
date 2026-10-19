#!/usr/bin/env python3
"""Preserve every research source record with honest real-component entry paths."""
from pathlib import Path
import hashlib
import json
import subprocess

GALLERY=Path(__file__).resolve().parent
REPO=Path(subprocess.check_output(['git','rev-parse','--show-toplevel'],cwd=GALLERY,text=True).strip())
INVENTORY=GALLERY.parent/'research/inventory.json'
source=json.loads(INVENTORY.read_text())
surfaces={row['id']:row for row in source['surfaces']}
snapshots={row['path']:row['sha256'] for row in source['sourceSnapshots']}
fixture_names={'base':'rich','pivot':'pivot','cross-sheet':'cross-sheet','fill':'fill','validation':'validation','generated-objects':'objects'}
collections={'surfaces':'surface','controls':'static-control','uiGroups':'ui-group','dynamicControlTemplates':'dynamic-template','states':'state','dynamicFamilies':'dynamic-family'}
family_areas={'TABS':'TOOLBAR','SHAPES':'SHAPE','CHART-TYPES':'OBJECT-CHART','TABLE-STYLES':'OBJECT-TABLE','PASTE':'CLIPBOARD','FILL-TYPE':'FILL','MANUAL-FILL':'MANUAL','VALIDATION':'PROPERTY-RULES','CONDITIONAL':'PROPERTY-RULES','PIVOT-AGG':'PIVOT','PIVOT-SHOWAS':'PIVOT','PIVOT-GROUPS':'PIVOT','PIVOT-FILTERS':'PIVOT','ZOOM':'VIEW','SHEETS':'SHEETS','FIND-MATCHES':'FIND','GRID-CELLS':'GRID','OBJECTS':'MANAGEMENT','DV-OPTIONS':'VALIDATION-LIST','SORT-LEVELS':'DATA'}
rows=[]
for collection,kind in collections.items():
 for item in source[collection]:
  ident=item['id']
  surface_id=item.get('surfaceId') or (ident if kind=='surface' else 'XLSX-SURF-'+family_areas[ident.removeprefix('XLSX-FAMILY-')])
  surface=surfaces[surface_id]
  fixture=fixture_names[(item.get('fixtureIds') or surface.get('fixtureIds') or ['base'])[0]]
  if surface_id=='XLSX-SURF-FIND':fixture='search'
  if ident=='XLSX-STATE-LOAD':fixture='load-pending'
  if ident=='XLSX-STATE-LOAD-ERROR':fixture='load-error'
  if ident=='XLSX-STATE-SAVE-BUSY':fixture='save'
  title=item.get('title') or item.get('label') or ident
  steps=list(item.get('entrySteps') or surface.get('entrySteps') or [])
  if kind in ('static-control','dynamic-template','ui-group'):steps.append('按真实条件进入对应组/类型，找到本条标签：'+title+'；容器与组名不自动算作动作。')
  if surface_id=='XLSX-SURF-FIND':steps.append('本场景是真实240行原件；在高级查找中实际输入“项目”，可验证200条截断与第二表切换。')
  if item.get('trigger'):steps.append('状态触发条件：'+item['trigger'])
  if kind=='dynamic-family':steps.append('按原始枚举/来源对象逐项操作，动态可见性以当前原件为准；没有提前注入选择/结果。')
  boundary=['source-only：源码映射不等于该条GUI已通过；浏览器观察另见browser-observations.json。','读取/保存库是页面内存模拟。真实原生工具提交仅开发Demo的127.0.0.1隔离Node helper可用，静态默认明确拒绝；不写数据库/知识库/用户文件。']
  if kind in ('dynamic-family','dynamic-template'):boundary.append('保留动态模板/完整枚举；模板、组、选项和值不能相乘或累加成已验证动作总数。')
  if kind=='ui-group':boundary.append('此条为内容组/容器，未声称可点击。')
  if 'IMAGE' in surface_id:boundary.append('上传与远程图片在隔离helper中明确拒绝；此路径须真实产品宿主另验。')
  if ident in ('XLSX-STATE-PARSE-ERROR','XLSX-STATE-PIVOT-READONLY'):boundary.append('没有覆盖所有损坏/不支持的原件；当前链接仅提供相关入口，须另备对应原生文件，不注入私有状态。')
  if surface_id=='XLSX-SURF-FORMULA':boundary.append('本地helper不启动计算工作进程；缓存/公式显示可用，重算须产品宿主另验。')
  if 'CLIPBOARD' in surface_id or 'GRID' in surface_id:boundary.append('真实剪贴板权限、Canvas指针和系统输入法需当前浏览器环境操作验证。')
  if item.get('disabledExpression'):boundary.append('原始禁用条件：'+item['disabledExpression'])
  location=item['source'];path=location['path'];line=location.get('line')
  assert (REPO/path).is_file(),path
  pattern=json.dumps(item.get('values'),ensure_ascii=False) if 'values' in item else item.get('expansionRule') or (title if kind=='dynamic-template' else None)
  contract=item.get('expected') or item.get('expansionRule') or 'hover/focus/disabled/键盘按真实控件适用；无对应状态则N/A，不补造能力。'
  rows.append({'id':ident,'inventoryId':ident,'kind':kind,'title':title,'component':item.get('component'),'parameterPattern':pattern,'sourceSnapshot':snapshots.get(path),'sourceLocations':[{'path':path,'line':line,'lineSpec':str(line) if line else None,'sha256':snapshots.get(path)}],'inventoryEvidence':{'path':str(INVENTORY.relative_to(REPO)),'collection':collection},'area':surface_id,'areaLabel':surface['title'],'fixture':fixture,'demoQuery':f'?scene={fixture}&interaction={ident}&capture=0','entrySteps':steps,'applicable':{'themes':['light','dark'],'editorWidths':[1100,690,390],'shortEditorSize':[390,400],'interactionContract':contract},'evidenceStatus':'source-only','browserStatus':'unverified','componentTestStatus':'unverified','boundaries':boundary,'originalSourceRecord':item})
assert len(rows)==sum(len(source[c]) for c in collections)
assert len({r['id'] for r in rows})==len(rows)
counts={k:len(source[k]) for k in collections}
result={'baseline':'dcb9a40','inventory':{'path':str(INVENTORY.relative_to(REPO)),'sha256':hashlib.sha256(INVENTORY.read_bytes()).hexdigest(),'sourceSnapshots':source['sourceSnapshots'],'caveats':source['caveats']},'counts':counts,'count':len(rows),'countMeaning':'32界面、242静态控件、63分组容器、60动态标签模板、30状态合同、20动态入口族；这是不同类型来源记录，不能作为动作总量，动态子值未宣称穷举或GUI通过。','sourceMappingOnly':True,'groups':rows}
(GALLERY/'coverage-map.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
serialized=json.dumps(result,ensure_ascii=False,separators=(',',':')).replace('</script','<\\/script')
page=(GALLERY/'interactions.template.html').read_text().replace('__COVERAGE_JSON__',serialized)
(GALLERY/'interactions.html').write_text(page)
archive=REPO/'docs/visual-comparisons/2026-10-20-xlsx/demo';archive.mkdir(parents=True,exist_ok=True)
outputs={archive/'interactions.html':page.replace('data-host="live"','data-host="archive"'),archive.parent/'interactions.html':page.replace('data-host="live"','data-host="archive-root"'),archive/'coverage-map.json':(GALLERY/'coverage-map.json').read_text(),archive/'research-inventory.json':INVENTORY.read_text()}
for path,content in outputs.items():
 result_format=subprocess.run([str(REPO/'node_modules/.bin/oxfmt'),'--stdin-filepath',path.name],cwd=REPO,input=content,text=True,capture_output=True,check=True)
 path.write_text(result_format.stdout)
print(f'Mapped all {len(rows)} unique research records; all GUI/component statuses remain unverified. main/config untouched.')
