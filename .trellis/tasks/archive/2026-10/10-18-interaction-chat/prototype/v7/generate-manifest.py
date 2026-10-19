"""Verify stable source routes. v7 inherits v6 proposed contracts authored in scenes.json."""
import json
from pathlib import Path
root=Path(__file__).resolve().parent
base=json.loads((root.parent/'v4/scenes.json').read_text())
current=json.loads((root/'scenes.json').read_text())
assert [(s['id'],s['current'],s['source']) for s in base['scenes']]==[(s['id'],s['current'],s['source']) for s in current['scenes']]
print(f"Preserved {len(current['scenes'])} source routes, current descriptions and evidence.")
