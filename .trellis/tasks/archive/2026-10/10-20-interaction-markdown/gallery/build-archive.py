#!/usr/bin/env python3
"""Bundle the same real component fixture against frozen and current source."""
from pathlib import Path
import os
import subprocess

GALLERY = Path(__file__).resolve().parent
REPO = Path(subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], cwd=GALLERY, text=True).strip())
ARCHIVE = REPO / 'docs/visual-comparisons/2026-10-20-markdown'
BASELINE = Path(os.environ.get('GALLERY_BASELINE_ROOT', '/private/tmp/mimir-markdown-baseline'))
for variant in ('before', 'after'):
    source = BASELINE if variant == 'before' else REPO
    if not (source / 'packages/office/src/editors/MarkdownEditor.tsx').is_file():
        raise SystemExit(f'Missing real source: {source}')
    target = ARCHIVE / 'demo/dist' / variant
    env = {**os.environ, 'GALLERY_SOURCE_ROOT': str(source)}
    subprocess.run([
        'pnpm', '--filter', '@mimir/web', 'exec', 'vite', 'build',
        '--config', str(GALLERY / 'vite.config.mjs'),
        '--outDir', str(target), '--emptyOutDir',
    ], cwd=REPO, env=env, check=True)
    print(f'{variant}: {target / "index.html"}', flush=True)
