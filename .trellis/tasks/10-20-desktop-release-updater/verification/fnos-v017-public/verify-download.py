"""Read the complete public FPK anonymously; persist evidence, not its binary bytes."""

import datetime
import hashlib
import json
import pathlib
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent
METADATA = json.loads(ROOT.joinpath("release-metadata.json").read_text())
ASSET = next(a for a in METADATA["assets"] if a["name"] == "mimir-0.1.7-fnos-x64.fpk")
URL = ASSET["browser_download_url"]
assert URL == "https://github.com/bijinfeng/mimir/releases/download/v0.1.7/mimir-0.1.7-fnos-x64.fpk"
assert ASSET["digest"].startswith("sha256:")


def log(message):
    line = f"{datetime.datetime.now(datetime.timezone.utc).isoformat()} {message}"
    print(line, flush=True)
    with ROOT.joinpath("download.log").open("a") as stream:
        stream.write(line + "\n")


for attempt in range(1, 4):
    started = time.monotonic()
    total = 0
    sha256 = hashlib.sha256()
    sha512 = hashlib.sha512()
    try:
        request = urllib.request.Request(URL, headers={"User-Agent": "Mimir-anonymous-release-verification"})
        assert not request.has_header("Authorization")
        log(f"attempt={attempt} anonymous GET {URL}")
        with urllib.request.urlopen(request, timeout=60) as response:
            status = response.status
            content_length = response.headers.get("Content-Length")
            assert status == 200, status
            if content_length is not None:
                assert int(content_length) == ASSET["size"], content_length
            next_progress = 16 * 1024 * 1024
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                sha256.update(chunk)
                sha512.update(chunk)
                if total >= next_progress:
                    log(f"receivedBytes={total} expectedBytes={ASSET['size']}")
                    next_progress += 16 * 1024 * 1024
        digest = "sha256:" + sha256.hexdigest()
        assert total == ASSET["size"], (total, ASSET["size"])
        assert digest == ASSET["digest"], (digest, ASSET["digest"])
        result = {
            "success": True,
            "checkedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "version": "0.1.7",
            "anonymous": True,
            "authorizationHeaderPresent": False,
            "releaseUrl": METADATA["html_url"],
            "tag": METADATA["tag_name"],
            "draft": METADATA["draft"],
            "prerelease": METADATA["prerelease"],
            "publishedAt": METADATA["published_at"],
            "releaseAssetCount": len(METADATA["assets"]),
            "sourceCommit": "3f35e8a9201a1abd0eb882a4f91e8f75cbb85abb",
            "releaseRun": "https://github.com/bijinfeng/mimir/actions/runs/39428273594",
            "assetUrl": URL,
            "assetId": ASSET["id"],
            "httpStatus": status,
            "contentLength": content_length,
            "receivedBytes": total,
            "expectedBytes": ASSET["size"],
            "sha256": sha256.hexdigest(),
            "githubDigest": ASSET["digest"],
            "sha256Matches": True,
            "sha512Hex": sha512.hexdigest(),
            "downloadSeconds": round(time.monotonic() - started, 2),
            "attempt": attempt,
            "method": "Anonymous official public asset URL, complete response streamed through SHA-256/SHA-512; no credentials or Range request.",
            "limitations": [
                "SHA-256 is compared with the anonymous GitHub asset digest; SHA-512 is independently computed only.",
                "Binary bytes were consumed in full but are not retained in the repository.",
                "fnOS device installation and upgrade are not asserted."
            ],
        }
        ROOT.joinpath("result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
        log(f"PASS receivedBytes={total} sha256={sha256.hexdigest()} seconds={result['downloadSeconds']}")
        break
    except Exception as error:
        # Exception URLs may contain transient signed redirect credentials; log only the error class.
        log(f"attempt={attempt} failed errorType={type(error).__name__} receivedBytes={total}")
        if attempt == 3:
            raise RuntimeError("Anonymous complete asset verification failed; see download.log") from None
