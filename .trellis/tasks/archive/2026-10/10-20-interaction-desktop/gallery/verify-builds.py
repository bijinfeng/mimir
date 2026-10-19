#!/usr/bin/env python3
"""Verify published bytes, exact product provenance and matched CUA evidence."""
from pathlib import Path
from html.parser import HTMLParser
import hashlib
import json
import subprocess
from PIL import Image

G = Path(__file__).resolve().parent
R = Path(subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], cwd=G, text=True).strip())
O = R / 'docs/visual-comparisons/2026-10-20-desktop'
D = O / 'demo'
B = '53285bbdeaa17475e04aae517f07c957776cb6b6'

def digest(raw):
    return hashlib.sha256(raw).hexdigest()

def verify_file(path, record):
    raw = path.read_bytes()
    assert digest(raw) == record['sha256'], str(path)
    if 'bytes' in record:
        assert len(raw) == record['bytes'], str(path)
    return raw

manifest = json.loads((G / 'build-manifest.json').read_text())
frozen = json.loads((G / 'baseline-build-freeze.json').read_text())
assert manifest['variants']['before'] == frozen['before']
results = {}
for variant, record in manifest['variants'].items():
    root = D / 'dist' / variant
    actual = {str(p.relative_to(root)) for p in root.rglob('*') if p.is_file()}
    assert actual == {item['path'] for item in record['files']}
    for item in record['files']:
        verify_file(root / item['path'], item)
    aggregate = digest('\n'.join(f"{item['path']}\t{item['sha256']}" for item in record['files']).encode())
    assert aggregate == record['aggregateSha256']
    sources = json.loads((root / 'source-manifest.json').read_text())['files']
    for source in sources:
        path = source['path']
        if path.startswith('gallery/'):
            raw = (G / ('source-before' if variant == 'before' else '') / path[8:]).read_bytes()
            archived = D / ('source-before' if variant == 'before' else 'source-after') / path[8:]
            assert archived.read_bytes() == raw, str(archived)
        else:
            raw = subprocess.check_output(['git', 'show', B + ':' + path], cwd=R) if variant == 'before' else (R / path).read_bytes()
        assert digest(raw) == source['sha256'], (variant, path)
        assert len(raw) == source['bytes']
    results[variant] = {'resources': len(actual), 'ownSourceInputs': len(sources), 'aggregateSha256': aggregate}

class Lines(HTMLParser):
    def __init__(self):
        super().__init__()
        self.lines = []
        self.inside = False
    def handle_starttag(self, tag, attrs):
        if tag == 'pre':
            self.inside = True
            self.lines.append('')
    def handle_endtag(self, tag):
        if tag == 'pre':
            self.inside = False
    def handle_data(self, text):
        if self.inside:
            self.lines[-1] += text

coverage = json.loads((O / 'coverage-map.json').read_text())
for variant, records in coverage['sourceSnapshots'].items():
    for record in records:
        raw = subprocess.check_output(['git', 'show', B + ':' + record['path']], cwd=R) if variant == 'before' else (R / record['path']).read_bytes()
        assert digest(raw) == record['sha256']
        parser = Lines()
        parser.feed((O / record['html']).read_text())
        assert parser.lines == raw.decode().splitlines(), record['path']
for row in coverage['groups']:
    line = (R / row['source']['path']).read_text().splitlines()[row['source']['line'] - 1]
    assert row['sourceMarker'] in line

licenses = json.loads((G / 'license-manifest.json').read_text())
assert digest((R / 'pnpm-lock.yaml').read_bytes()) == licenses['lockfileSha256']
notice_count = 0
for package in licenses['packages']:
    for notice in package['licenses']:
        verify_file(D / notice['archive'], notice)
        notice_count += 1

capture_path = O / 'capture-manifest.json'
capture_count = 0
superseded_count = 0
if list((O / 'captures').glob('after-*.png')):
    assert capture_path.exists(), 'After screenshots exist but strict capture manifest has not passed yet.'
if capture_path.exists():
    captures = json.loads(capture_path.read_text())
    for record in captures['images'] + captures.get('supersededEvidence', []):
        raw = verify_file(O / record['path'], record)
        actual_image = Image.open(O / record['path'])
        assert actual_image.size == (record['width'], record['height'])
        assert Image.MIME[actual_image.format] == record['actualMediaType']
    capture_count = len(captures['images'])
    superseded_count = len(captures.get('supersededEvidence', []))
    assert len(captures['pairs']) == 8

result = {'baseline': B, 'variants': results, 'sourceSnapshotCounts': {key: len(value) for key, value in coverage['sourceSnapshots'].items()}, 'surfaceFamiliesSourceOnly': len(coverage['groups']), 'licensePackages': len(licenses['packages']), 'originalNotices': notice_count, 'actualCapturesVerified': capture_count, 'supersededCapturesPreservedExcludedFromPairs': superseded_count, 'nativeVerificationClaimed': False}
(O / 'final-build-verification.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(result, ensure_ascii=False, indent=2))
