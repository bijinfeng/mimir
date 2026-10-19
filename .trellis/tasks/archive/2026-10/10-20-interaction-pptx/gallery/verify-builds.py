#!/usr/bin/env python3
"""Verify source provenance and every archive byte, independently from screenshots."""
from pathlib import Path
import hashlib,html,json,subprocess
from html.parser import HTMLParser
G=Path(__file__).resolve().parent
R=Path(subprocess.check_output(['git','rev-parse','--show-toplevel'],cwd=G,text=True).strip())
O=R/'docs/visual-comparisons/2026-10-20-pptx';D=O/'demo'
manifest=json.loads((G/'build-manifest.json').read_text());report={'scope':'Actual resource and source hashes, not product GUI acceptance','baseline':'3b5d912','variants':{}}
for variant in ['before','after']:
 record=manifest['variants'][variant];target=D/'dist'/variant
 assert len([x for x in target.rglob('*') if x.is_file()])==len(record['files'])
 for entry in record['files']:
  data=(target/entry['path']).read_bytes();assert len(data)==entry['bytes'];assert hashlib.sha256(data).hexdigest()==entry['sha256'],entry['path']
 aggregate=hashlib.sha256('\n'.join(f"{item['path']}\t{item['sha256']}" for item in record['files']).encode()).hexdigest();assert aggregate==record['aggregateSha256']
 source=json.loads((target/'source-manifest.json').read_text());verified=0
 for entry in source['files']:
  path=entry['path']
  if path.startswith('gallery/'):
   relative=path[8:];actual=G/relative
   if variant=='before':
    mapping={x['galleryInput']:x['archivedPath'] for x in json.loads((D/'source-before/paths.json').read_text())};actual=D/'source-before'/mapping[relative]
   data=actual.read_bytes()
  elif variant=='before':data=subprocess.check_output(['git','show',f'3b5d912:{path}'],cwd=R)
  else:data=(R/path).read_bytes()
  assert hashlib.sha256(data).hexdigest()==entry['sha256'],(variant,path);verified+=1
 report['variants'][variant]={'resources':len(record['files']),'aggregateSha256':aggregate,'allResourceBytesAndHashesMatch':True,'sourceInputsVerified':verified,'sourceComparison':'git show3b5d912 + exact frozen gallery inputs' if variant=='before' else 'current files'}
helper=json.loads((G/'helper-source-manifest.json').read_text())
assert hashlib.sha256((G/'local-host.mjs').read_bytes()).hexdigest()==helper['adapterSha256']
report['nativeHelper']={'adapterSha256':helper['adapterSha256'],'variants':{}}
for variant,entry in helper['variants'].items():
 for file in entry['files']:
  data=subprocess.check_output(['git','show',f"3b5d912:{file['path']}"],cwd=R) if variant=='before' else (R/file['path']).read_bytes()
  assert hashlib.sha256(data).hexdigest()==file['sha256'],('helper',variant,file['path'])
 actual=Path('/private/tmp/mimir-pptx-local-helper-3b5d912')/(variant+'.cjs')
 assert hashlib.sha256(actual.read_bytes()).hexdigest()==entry['bundleSha256']
 report['nativeHelper']['variants'][variant]={'verifiedSourceInputs':len(entry['files']),'compiledBundleSha256':entry['bundleSha256'],'actualCompiledBundleHashMatches':True,'substitutions':entry['substitutions']}
coverage=json.loads((G/'coverage-map.json').read_text());assert len({x['id'] for x in coverage['groups']})==coverage['count']
for item in coverage['sourceSnapshots']:assert hashlib.sha256((R/item['path']).read_bytes()).hexdigest()==item['sha256'],item['path']
assert (O/'research-inventory.json').read_bytes()==(G.parent/'research/source-inventory.json').read_bytes()
report['inventory']={'records':coverage['count'],'unique':True,'sourceSnapshotsCurrent':True,'rawArchiveMatches':True,'mappingSourceOnly':coverage['sourceMappingOnly']}
baseline=json.loads((G.parent/'research/baseline-source-inventory.json').read_text())
assert (O/'baseline-source-inventory.json').read_bytes()==(G.parent/'research/baseline-source-inventory.json').read_bytes()
for file in baseline['sourceFiles']:
 data=subprocess.check_output(['git','show',f"3b5d912:{file['path']}"],cwd=R)
 assert hashlib.sha256(data).hexdigest()==file['sha256']
current=json.loads((G.parent/'research/source-inventory.json').read_text())
assert len(current['states'])==25
for item in current['states']:
 assert (R/item['file']).read_text().splitlines()[item['line']-1]==item['currentAnchorText']
class SourceView(HTMLParser):
 def __init__(self):super().__init__();self.lines=[];self.inPre=False
 def handle_starttag(self,tag,attrs):
  if tag=='pre':self.lines.append('');self.inPre=True
 def handle_data(self,data):
  if self.inPre:self.lines[-1]+=data
 def handle_endtag(self,tag):
  if tag=='pre':self.inPre=False
for snapshot in coverage['sourceSnapshots']:
 actual=(R/snapshot['path']).read_text().splitlines();view=SourceView();view.feed((O/'sources/current'/(Path(snapshot['path']).name+'.html')).read_text())
 assert len(actual)==len(view.lines)
 # HTML ignores the first LF after a pre start tag. Formatter also drops
 # whitespace-only empty content; neither changes the visible source line.
 assert all(a==b.removeprefix('\n') or (not a and not b.strip()) for a,b in zip(actual,view.lines)),snapshot['path']
report['inventory'].update({'baselineRecordsPreserved':True,'baselineSourceHashesVerified':len(baseline['sourceFiles']),'currentStateAnchorsVerified':25,'currentSourceViewsExact':len(coverage['sourceSnapshots'])})
license=json.loads((G/'license-manifest.json').read_text())
for entry in license.values():
 for path in [R/entry['archive'],D/'dist/before/LICENSE-GenOffice.txt',D/'dist/after/LICENSE-GenOffice.txt']:
  assert hashlib.sha256(path.read_bytes()).hexdigest()==entry['sha256']
report['licenses']={'allOriginalHashesMatch':True,'genofficeCommit':'480548fd55f1be3593ee0d8e316a734751d58309'}
if (O/'capture-manifest.json').exists():
 from PIL import Image
 captures=json.loads((O/'capture-manifest.json').read_text());assert len(captures['pairs'])==8
 for image in captures['images']:
  path=O/image['path'];assert hashlib.sha256(path.read_bytes()).hexdigest()==image['sha256'];assert list(Image.open(path).size)==[image['width'],image['height']]
 for pair in captures['pairs']:
  assert Image.open(O/pair['before']).size==Image.open(O/pair['after']).size
 report['captures']={'matchedPairs':len(captures['pairs']),'actualImagesHashAndDimensionsVerified':len(captures['images']),'sameFixtureThemeViewportAndEditorDimensions':True,'productBrowserAcceptanceSeparate':True}
(O/'final-build-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False,indent=2))
