#!/usr/bin/env python3
"""Compile one real fixture against frozen/current sources and record all hashes."""
from pathlib import Path
import hashlib
import json
import os
import subprocess
import shutil
import sys

GALLERY = Path(__file__).resolve().parent
REPO = Path(subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], cwd=GALLERY, text=True).strip())
ARCHIVE = REPO / 'docs/visual-comparisons/2026-10-20-pdf/demo'
BASELINE = Path(os.environ.get('GALLERY_BASELINE_ROOT', '/private/tmp/mimir-pdf-baseline-53285bb'))
VARIANTS = os.environ.get('GALLERY_BUILD_VARIANTS', 'before,after').split(',')
manifest_path = GALLERY / 'build-manifest.json'
manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {'baseline': '53285bb', 'variants': {}}
for variant in VARIANTS:
    if variant not in ('before', 'after'):
        raise SystemExit(f'Unknown variant: {variant}')
    source = BASELINE if variant == 'before' else REPO
    if not (source / 'packages/office/src/editors/PdfEditor.tsx').is_file():
        raise SystemExit(f'Missing real source: {source}')
    target = ARCHIVE / 'dist' / variant
    env = {**os.environ, 'GALLERY_SOURCE_ROOT': str(source), 'NO_COLOR': '1'}
    result = subprocess.run([
        'pnpm', '--filter', '@mimir/web', 'exec', 'vite', 'build',
        '--config', str((GALLERY / 'source-before' if variant == 'before' else GALLERY) / 'vite.config.mjs'),
        '--outDir', str(target), '--emptyOutDir',
    ], cwd=REPO, env=env, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    log = ARCHIVE / 'build-logs' / f'{variant}.log'
    log.parent.mkdir(parents=True, exist_ok=True)
    log.write_text(result.stdout)
    if result.returncode:
        raise SystemExit(f'{variant} build failed ({result.returncode}); see {log}')
    for notice in (GALLERY / 'fixtures').glob('LICENSE*'):
        shutil.copyfile(notice, target / notice.name)
    pdfjs = REPO / 'packages/office/node_modules/pdfjs-dist'
    for folder in ['cmaps', 'standard_fonts', 'wasm']:
        shutil.copytree(pdfjs / folder, target / 'pdfjs' / folder, dirs_exist_ok=True)
    shutil.copyfile(pdfjs / 'LICENSE', target / 'LICENSE-pdfjs-Apache-2.0.txt')
    files = []
    for file in sorted(target.rglob('*')):
        if file.is_file():
            data = file.read_bytes()
            files.append({'path': file.relative_to(target).as_posix(), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
    aggregate = hashlib.sha256('\n'.join(f"{item['path']}\t{item['sha256']}" for item in files).encode()).hexdigest()
    manifest['variants'][variant] = {'sourceRoot': str(source), 'sourceManifest': f'dist/{variant}/source-manifest.json', 'headAtBuild': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=REPO, text=True).strip(), 'aggregateSha256': aggregate, 'files': files}
    print(f'{variant}: {len(files)} files; sha256 {aggregate}; {target / "index.html"}', flush=True)
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
