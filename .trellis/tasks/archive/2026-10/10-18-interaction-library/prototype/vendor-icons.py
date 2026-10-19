"""Vendor reviewed SVG blobs; upstream paths and commits come from research evidence."""

import base64
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import urllib.request

HERE = Path(__file__).resolve().parent
EVIDENCE = HERE.parent / "research" / "icon-evidence"
PHOSPHOR = "2b75f3ad12b420c9504ef05df8d2564a28f8500e"
MATERIAL = "13025adc5ad10a5cc649528a2c1edec93069f1b9"


def download(job):
    family, entry = job
    dest = HERE / "assets" / family / Path(entry["path"]).name
    if dest.exists():
        data = dest.read_bytes()
    else:
        request = urllib.request.Request(
            entry["url"], headers={"User-Agent": "Mimir-design-research"}
        )
        with urllib.request.urlopen(request, timeout=25) as response:
            payload = json.load(response)
        data = base64.b64decode(payload["content"])
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
    expected = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
    assert expected == entry["sha"], dest
    assert data.lstrip().startswith(b"<svg"), dest
    return {
        "localPath": str(dest.relative_to(HERE)),
        "upstreamPath": entry["path"],
        "blobSha": entry["sha"],
        "sha256": hashlib.sha256(data).hexdigest(),
        "source": entry["url"],
    }


if __name__ == "__main__":
    phosphor = json.loads((EVIDENCE / "phosphor-selected-tree.json").read_text())
    material = json.loads((EVIDENCE / "material-selected-tree.json").read_text())
    extra = json.loads((EVIDENCE / "material-source-candidates.json").read_text())
    names = ["doc", "xls", "ppt", "pdf", "md", "html", "image", "audio", "video", "zip", "code", "text"]
    a_paths = {f"assets/duotone/file-{name}-duotone.svg" for name in names}
    a_paths.add("assets/duotone/file-duotone.svg")
    b_paths = {f"icons/{name}.svg" for name in ["word", "powerpoint", "pdf", "markdown", "html", "image", "audio", "video", "zip", "document", "table", "xml", "http"]}
    a_entries = {item["path"]: item for item in phosphor["tree"]}
    b_entries = {item["path"]: item for item in material["tree"]}
    b_entries.update({path: entry for path, entry in extra.items() if entry})
    jobs = [("phosphor", a_entries[path]) for path in sorted(a_paths)]
    jobs += [("material", b_entries[path]) for path in sorted(b_paths)]
    with ThreadPoolExecutor(max_workers=4) as pool:
        assets = list(pool.map(download, jobs))
    extra_sources = json.loads((EVIDENCE / "extra-source-map.json").read_text())
    for name, upstream_name in [("globe", "globe-hemisphere-west-duotone.svg"), ("wechat", "wechat-logo-duotone.svg"), ("github", "github-logo-duotone.svg")]:
        data = (EVIDENCE / f"phosphor-{name}.svg").read_bytes()
        dest = HERE / "assets" / "phosphor" / upstream_name
        dest.write_bytes(data)
        assets.append({
            "localPath": str(dest.relative_to(HERE)),
            "upstreamPath": "assets/duotone/" + upstream_name,
            "blobSha": hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest(),
            "sha256": hashlib.sha256(data).hexdigest(),
            "source": extra_sources[f"phosphor-{name}.svg"],
        })
    for family in ["phosphor", "material"]:
        (HERE / "assets" / family / "LICENSE.txt").write_bytes(
            (EVIDENCE / f"{family}-LICENSE.txt").read_bytes()
        )
    manifest = {
        "phosphorCommit": PHOSPHOR,
        "materialCommit": MATERIAL,
        "license": "MIT (both upstream libraries)",
        "transform": "Original SVG files retained byte for byte. Phosphor original currentColor and duotone opacity retained; CSS applies semantic colors per theme. Material original colors retained except dark-theme Word foreground changes from #01579b to #64b5f6 using scoped CSS, without a whole-icon filter.",
        "sourceMappingNote": "B source glyphs WeChat and GitHub deliberately reuse Phosphor; http.svg is website source, HTML is a separate local file type. table.svg maps Excel; xml.svg is a generic-code fallback; document.svg covers text and unknown.",
        "mappings": [
            {"id": key, "A": "assets/phosphor/" + a_name + ".svg", "B": ("assets/phosphor/" + a_name + ".svg") if key in ["wechat", "github"] else "assets/material/" + b_name + ".svg"}
            for key, a_name, b_name in [
                ("word", "file-doc-duotone", "word"), ("excel", "file-xls-duotone", "table"),
                ("powerpoint", "file-ppt-duotone", "powerpoint"), ("pdf", "file-pdf-duotone", "pdf"),
                ("audio", "file-audio-duotone", "audio"), ("video", "file-video-duotone", "video"),
                ("note", "file-md-duotone", "markdown"), ("image", "file-image-duotone", "image"),
                ("web", "globe-hemisphere-west-duotone", "http"), ("wechat", "wechat-logo-duotone", ""),
                ("github", "github-logo-duotone", ""), ("html", "file-html-duotone", "html"),
                ("text", "file-text-duotone", "document"), ("archive", "file-zip-duotone", "zip"),
                ("code", "file-code-duotone", "xml"), ("unknown", "file-duotone", "document"),
            ]
        ],
        "assets": assets,
    }
    (HERE / "icon-assets.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(f"Vendored {len(assets)} verified SVG blobs")
