"""One-off anonymous official ZIP transport; never modifies the active harness download."""
import concurrent.futures
import hashlib
import json
import pathlib
import shutil
import tempfile
import time
import urllib.parse
import urllib.request

EVIDENCE = pathlib.Path(__file__).resolve().parent
SOURCE = pathlib.Path('/var/folders/92/c09xsx4s6g34djybsfgz6byc0000gn/T/mimir-official-manual-update-Vjrcex')
release = json.loads((EVIDENCE / 'official-releases.json').read_text())['newest']
assert release['tag_name'] == 'v0.1.4' and not release['draft'] and not release['prerelease']
asset = next(a for a in release['assets'] if a['name'] == 'mimir-0.1.4-mac-arm64.zip')
assert asset['url'] == f"https://api.github.com/repos/bijinfeng/mimir/releases/assets/{asset['id']}"
assert asset['browser_download_url'] == 'https://github.com/bijinfeng/mimir/releases/download/v0.1.4/mimir-0.1.4-mac-arm64.zip'
assert asset['digest'].startswith('sha256:')
cache = pathlib.Path(tempfile.mkdtemp(prefix='mimir-official-manual-update-'))
source = SOURCE / asset['name']
assert source.is_file() and not source.is_symlink()
prefix_length = source.stat().st_size
assert 0 < prefix_length < asset['size']
prefix = cache / 'stable-prefix'
with source.open('rb') as incoming, prefix.open('xb') as outgoing:
    remaining = prefix_length
    while remaining:
        chunk = incoming.read(min(1024 * 1024, remaining))
        assert chunk
        outgoing.write(chunk)
        remaining -= len(chunk)
baseline = SOURCE / 'mimir-0.1.3-mac-arm64.zip'
assert baseline.is_file() and not baseline.is_symlink()
shutil.copyfile(baseline, cache / baseline.name)
result = {'cache': str(cache), 'source': str(SOURCE), 'asset': asset['name'], 'api': asset['url'],
          'prefixBytes': prefix_length, 'size': asset['size'], 'officialDigest': asset['digest'],
          'concurrency': 6, 'segments': [], 'success': False}


def save():
    (EVIDENCE / 'parallel-download.json').write_text(json.dumps(result, indent=2))


class OfficialRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        parsed = urllib.parse.urlparse(newurl)
        assert parsed.scheme == 'https'
        assert parsed.hostname in {'api.github.com', 'release-assets.githubusercontent.com'}
        assert parsed.port in {None, 443} and not parsed.username and not parsed.password
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def segment(start, end):
    output = cache / f'range-{start}-{end}'
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), OfficialRedirect())
    request = urllib.request.Request(asset['url'], headers={
        'Accept': 'application/octet-stream', 'Range': f'bytes={start}-{end}'})
    begun = time.monotonic()
    with opener.open(request, timeout=60) as response, output.open('xb') as file:
        assert response.status == 206
        assert response.headers['Content-Range'] == f"bytes {start}-{end}/{asset['size']}"
        assert response.headers.get_content_type() == 'application/octet-stream'
        transferred = 0
        while chunk := response.read(1024 * 1024):
            assert time.monotonic() - begun < 1200
            transferred += len(chunk)
            assert transferred <= end - start + 1
            file.write(chunk)
    assert transferred == end - start + 1
    return {'start': start, 'end': end, 'bytes': transferred, 'file': output.name,
            'seconds': round(time.monotonic() - begun, 2)}


save()
print(f'Official range cache: {cache}; stable prefix: {prefix_length}', flush=True)
try:
    width = (asset['size'] - prefix_length + 5) // 6
    ranges = [(start, min(start + width - 1, asset['size'] - 1))
              for start in range(prefix_length, asset['size'], width)]
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        for future in concurrent.futures.as_completed([pool.submit(segment, *r) for r in ranges]):
            result['segments'].append(future.result())
            save()
            print(f'Validated official segment {len(result["segments"])}/{len(ranges)}', flush=True)
    digest = hashlib.sha256()
    with (cache / asset['name']).open('xb') as output:
        for path in [prefix] + [cache / s['file'] for s in sorted(result['segments'], key=lambda s: s['start'])]:
            with path.open('rb') as incoming:
                while chunk := incoming.read(1024 * 1024):
                    digest.update(chunk)
                    output.write(chunk)
    assert (cache / asset['name']).stat().st_size == asset['size']
    result['digest'] = 'sha256:' + digest.hexdigest()
    assert result['digest'] == asset['digest']
    result['success'] = True
    print(f'Official full ZIP size/SHA256 verified: {cache}', flush=True)
except BaseException as error:
    result['errorType'] = type(error).__name__
    raise
finally:
    save()
