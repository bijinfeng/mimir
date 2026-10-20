#!/usr/bin/env python3
"""Build current real components; before is the immutable previous trial archive."""
from pathlib import Path
import subprocess

DEMO = Path(__file__).resolve().parent
REPO = Path(subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], cwd=DEMO, text=True).strip())
subprocess.run([
    'pnpm', '--filter', '@mimir/web', 'exec', 'vite', 'build',
    '--config', str(DEMO / 'vite.config.mjs'),
    '--outDir', str(DEMO / 'dist' / 'after'), '--emptyOutDir',
], cwd=REPO, check=True)
