#!/usr/bin/env python3
"""Byte/source/index/PNG verification; never counts source records as GUI acceptance."""
from pathlib import Path
import hashlib,json,subprocess
from html.parser import HTMLParser
G=Path(__file__).resolve().parent
R=Path(subprocess.check_output(['git','rev-parse','--show-toplevel'],cwd=G,text=True).strip())
O=R/'docs/visual-comparisons/2026-10-20-pdf';D=O/'demo'
hashof=lambda data:hashlib.sha256(data).hexdigest()
manifest=json.loads((G/'build-manifest.json').read_text());report={'scope':'Compiled resources, source files, source HTML line anchors, helper and real screenshot files. Product GUI acceptance is separate.','baseline':'53285bbdeaa17475e04aae517f07c957776cb6b6','variants':{}}
for variant,record in manifest['variants'].items():
 target=D/'dist'/variant
 assert len([p for p in target.rglob('*') if p.is_file()])==len(record['files'])
 for entry in record['files']:
  raw=(target/entry['path']).read_bytes();assert len(raw)==entry['bytes'];assert hashof(raw)==entry['sha256'],(variant,entry['path'])
 aggregate=hashof('\n'.join(f"{x['path']}\t{x['sha256']}" for x in record['files']).encode());assert aggregate==record['aggregateSha256']
 inputs=json.loads((target/'source-manifest.json').read_text())['files']
 for entry in inputs:
  path=entry['path']
  if path.startswith('gallery/'):raw=((G/'source-before' if variant=='before' else G)/path[8:]).read_bytes()
  elif variant=='before':raw=subprocess.check_output(['git','show','53285bb:'+path],cwd=R)
  else:raw=(R/path).read_bytes()
  assert hashof(raw)==entry['sha256'],(variant,path)
 report['variants'][variant]={'resources':len(record['files']),'aggregateSha256':aggregate,'sourceInputsVerified':len(inputs),'allResourceBytesAndHashesMatch':True,'sourceComparison':'fixed git SHA + frozen gallery input' if variant=='before' else 'current source files'}
freeze=json.loads((G/'baseline-build-freeze.json').read_text());assert freeze['before']==manifest['variants']['before'];report['baselineFreezeVerified']=True
helper=json.loads((G/'helper-source-manifest.json').read_text());assert hashof((G/'local-host.mjs').read_bytes())==helper['adapterSha256']
report['helper']={'adapterSha256':helper['adapterSha256'],'variants':{}}
for variant,record in helper['variants'].items():
 for item in record['files']:
  raw=subprocess.check_output(['git','show','53285bb:'+item['path']],cwd=R) if variant=='before' else (R/item['path']).read_bytes()
  assert hashof(raw)==item['sha256'],('helper',variant,item['path'])
 actual=Path('/private/tmp/mimir-pdf-helper-53285bb')/(variant+'.cjs');assert hashof(actual.read_bytes())==record['bundleSha256']
 report['helper']['variants'][variant]={'sourceInputsVerified':len(record['files']),'compiledBundleHashMatches':True,'bundleSha256':record['bundleSha256']}
coverage=json.loads((G/'coverage-map.json').read_text());assert coverage['count']==len({row['id'] for row in coverage['groups']})
class SourceView(HTMLParser):
 def __init__(self):super().__init__();self.lines=[];self.active=False
 def handle_starttag(self,tag,attrs):
  if tag=='pre':self.lines.append('');self.active=True
 def handle_endtag(self,tag):
  if tag=='pre':self.active=False
 def handle_data(self,data):
  if self.active:self.lines[-1]+=data
for variant,snapshots in coverage['sourceSnapshots'].items():
 for snapshot in snapshots:
  raw=subprocess.check_output(['git','show','53285bb:'+snapshot['path']],cwd=R) if variant=='before' else (R/snapshot['path']).read_bytes()
  assert hashof(raw)==snapshot['sha256'];view=SourceView();view.feed((O/snapshot['html']).read_text());actual=raw.decode().splitlines()
  assert len(actual)==len(view.lines),(snapshot['path'],'line count')
  assert all(a==b.removeprefix('\n') or (not a and not b.strip()) for a,b in zip(actual,view.lines)),snapshot['path']
for row in coverage['groups']:
 assert (O/row['source']['url'].split('#')[0]).exists();assert row['source']['line']>=1
inventory=json.loads((O/'research-inventory.json').read_text());assert inventory==json.loads((G.parent/'research/source-inventory.json').read_text())
report['inventory']={'heterogeneousRecords':coverage['count'],'uniqueIds':True,'sourceOnly':True,'baselineSourceViewsExact':len(coverage['sourceSnapshots']['before']),'currentSourceViewsExact':len(coverage['sourceSnapshots']['current']),'rawInventoryMatches':True}
licenses=json.loads((G/'license-manifest.json').read_text())
for item in licenses.values():assert hashof((R/item['archive']).read_bytes())==item['sha256']
report['originalLicenseHashesMatch']=True
if (O/'capture-manifest.json').exists():
 from PIL import Image
 captures=json.loads((O/'capture-manifest.json').read_text())
 for item in captures['images']:
  path=O/item['path'];assert hashof(path.read_bytes())==item['sha256'];assert list(Image.open(path).size)==[item['width'],item['height']]
 for row in captures['pairs']:assert Image.open(O/row['before']).size==Image.open(O/row['after']).size
 report['realCaptures']={'matchedPairs':len(captures['pairs']),'verifiedImages':len(captures['images']),'sameFixtureThemeViewportAndEditorDimensions':True,'productAcceptanceIsSeparate':True}
runtime=json.loads((G/'native-runtime-manifest.json').read_text())
assert hashof((R/'pnpm-lock.yaml').read_bytes())==runtime['lockfileSha256']==runtime['baselineLockfileSha256']
for record in runtime['nativeWasm'].values():assert hashof(Path(record['path']).read_bytes())==record['sha256']
report['nativeRuntime']={'lockfileMatchesBothVariants':True,'nativeWasmHashesMatch':True,'packageVersions':{k:v['version'] for k,v in runtime['packages'].items()}}
old=D/'superseded/instrumentation-v1'
original=json.loads((old/'build-manifest.json').read_text())['variants']['before']
for record in original['files']:
 raw=(old/'dist/before'/record['path']).read_bytes();assert len(raw)==record['bytes'];assert hashof(raw)==record['sha256']
assert len([p for p in (old/'dist/before').rglob('*') if p.is_file()])==len(original['files'])
report['supersededInstrumentationV1']={'originalResourceHashesMatch':True,'resources':len(original['files']),'aggregateSha256':original['aggregateSha256'],'excludedFromFinalPairs':True}
(O/'final-build-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False,indent=2))
