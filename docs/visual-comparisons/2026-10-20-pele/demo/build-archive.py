#!/usr/bin/env python3
"""Build the same real node fixture against frozen and current renderers."""
from pathlib import Path
import os
import subprocess
import tempfile

DEMO = Path(__file__).resolve().parent
REPO = Path(subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], cwd=DEMO, text=True).strip())
BASE_COMMIT = '188bd88973acd78878bb496c9d99a007e8c4134d'
with tempfile.TemporaryDirectory(prefix='mimir-pele-baseline-') as temporary:
    baseline = Path(temporary)
    for filename in ('diagram-render.ts', 'diagram-code-block.ts'):
        source = subprocess.check_output([
            'git', 'show', f'{BASE_COMMIT}:packages/renderer/src/editor/{filename}',
        ], cwd=REPO)
        (baseline / filename).write_bytes(source)
    for variant in ('before', 'after'):
        env = dict(os.environ)
        env.pop('TRIAL_BASELINE_ROOT', None)
        if variant == 'before':
            env['TRIAL_BASELINE_ROOT'] = str(baseline)
        target = DEMO / 'dist' / variant
        subprocess.run([
            'pnpm', '--filter', '@mimir/web', 'exec', 'vite', 'build',
            '--config', str(DEMO / 'vite.config.mjs'),
            '--outDir', str(target), '--emptyOutDir',
        ], cwd=REPO, env=env, check=True)
        print(f'{variant}: {target / "index.html"}', flush=True)
