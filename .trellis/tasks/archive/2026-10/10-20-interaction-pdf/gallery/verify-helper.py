#!/usr/bin/env python3
"""Loopback native service smoke, separate from product/browser acceptance."""
import base64,json,urllib.request,urllib.error
from pathlib import Path
G=Path(__file__).resolve().parent
rows=[]
for variant in ['before','after']:
 for kind,fixture,field,child,expected in [('annotations','annotations','annotations','annotations',3),('forms','forms','forms','fields',3),('images','image','images','images',1),('local','text','info',None,None)]:
  data={'bytes':base64.b64encode((G/'fixtures'/(fixture+'.pdf')).read_bytes()).decode(),'expectedVersion':0,'operation':{'op':'read'}}
  req=urllib.request.Request(f'http://127.0.0.1:5213/{variant}/{kind}',json.dumps(data).encode(),{'Content-Type':'application/json'})
  with urllib.request.urlopen(req,timeout=30) as response:result=json.load(response)
  assert result['version']==0;assert field in result
  count=len(result[field][child]) if child else None
  if expected is not None:assert count==expected
  rows.append({'variant':variant,'kind':kind,'fixture':fixture,'passed':True,'unchangedReadVersion':0,'nativeSnapshotCount':count,'responseKeys':list(result)})
# The harness denies any remote source before invoking the native image writer.
data={'bytes':base64.b64encode((G/'fixtures/text.pdf').read_bytes()).decode(),'expectedVersion':0,'operation':{'op':'insert','url':'https://example.com/image.png'}}
try:
 urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:5213/after/images',json.dumps(data).encode(),{'Content-Type':'application/json'}),timeout=30)
 raise AssertionError('Remote URL unexpectedly accepted')
except urllib.error.HTTPError as error:
 body=json.load(error);assert error.code==400;assert '拒绝远程图片URL' in body['error']
 rows.append({'kind':'external-image-url','passed':True,'result':'explicit loopback harness rejection before native operation; no remote fetch'})
(G/'helper-smoke-verification.json').write_text(json.dumps({'scope':'Native loopback service reads and explicit remote rejection; not GUI acceptance, history or save validation.','checks':rows},ensure_ascii=False,indent=2)+'\n')
print(f'{len(rows)} loopback checks passed; no GUI pass inferred.')
