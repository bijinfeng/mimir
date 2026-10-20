"""Verify a public stable release, exact assets, and its fixed tag-to-commit identity."""
import datetime
import json
import pathlib
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent
VERSION = '0.1.7'
EXPECTED_COMMIT = '3f35e8a9201a1abd0eb882a4f91e8f75cbb85abb'
RUN = '39428273594'
API = 'https://api.github.com/repos/bijinfeng/mimir'

def save(name, value):
    ROOT.joinpath(name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

def fetch(url):
    assert url.startswith(API + '/')
    request = urllib.request.Request(url, headers={
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'Mimir-anonymous-release-verification',
    })
    assert not request.has_header('Authorization')
    info = {'requestedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'url': url, 'requestHeaders': dict(request.header_items()),
            'authorizationHeaderPresent': False}
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            info['httpStatus'] = response.status
            data = json.load(response)
    except Exception as error:
        info['errorType'] = type(error).__name__
        if isinstance(error, urllib.error.HTTPError):
            info['httpStatus'] = error.code
        with ROOT.joinpath('metadata-attempts.jsonl').open('a') as stream:
            stream.write(json.dumps(info) + '\n')
        raise
    with ROOT.joinpath('metadata-attempts.jsonl').open('a') as stream:
        stream.write(json.dumps(info) + '\n')
    return data, info

release, request = fetch(API + '/releases/tags/v' + VERSION)
save('release-metadata.json', release)
assert release['tag_name'] == 'v' + VERSION
assert release['draft'] is False and release['prerelease'] is False
assert release['published_at'] and release['html_url'] == 'https://github.com/bijinfeng/mimir/releases/tag/v' + VERSION
expected = {'latest-linux.yml', 'latest-mac.yml', 'latest.yml', f'mimir-{VERSION}-fnos-x64.fpk',
            f'mimir-{VERSION}-linux-x64.AppImage', f'mimir-{VERSION}-win-x64.exe', f'mimir-{VERSION}-win-x64.exe.blockmap'}
for arch in ['arm64', 'x64']:
    for suffix in ['dmg', 'dmg.blockmap', 'zip', 'zip.blockmap']:
        expected.add(f'mimir-{VERSION}-mac-{arch}.{suffix}')
assets = release['assets']
assert len(assets) == len(expected) == 15
assert {a['name'] for a in assets} == expected
for asset in assets:
    assert asset['state'] == 'uploaded' and asset['size'] > 0
    assert asset['digest'].startswith('sha256:') and len(asset['digest']) == 71
    assert asset['browser_download_url'] == f'https://github.com/bijinfeng/mimir/releases/download/v{VERSION}/' + asset['name']
request.update({'assetCount': len(assets), 'asset': next(a for a in assets if a['name'].endswith('.fpk'))})
save('anonymous-request.json', request)
ref, _ = fetch(API + '/git/ref/tags/v' + VERSION)
save('tag-metadata.json', ref)
assert ref['ref'] == 'refs/tags/v' + VERSION
obj = ref['object']
tags = []
while obj['type'] == 'tag':
    assert len(tags) < 4
    tag, _ = fetch(obj['url'])
    assert tag['sha'] == obj['sha']
    tags.append(tag)
    obj = tag['object']
assert obj['type'] == 'commit' and obj['sha'] == EXPECTED_COMMIT
save('tag-resolved.json', {'anonymous': True, 'authorizationHeaderPresent': False,
    'annotatedTagObjects': tags, 'resolvedCommit': obj['sha'],
    'expectedCommit': EXPECTED_COMMIT, 'matches': True})
run, _ = fetch(API + '/actions/runs/' + RUN)
assert run['head_sha'] == EXPECTED_COMMIT and run['event'] == 'push'
assert run['head_branch'] == 'v' + VERSION
save('run-metadata.json', run)
print(f'PASS public stable v{VERSION}; all 15 exact assets; tag resolves to {EXPECTED_COMMIT}; run={RUN} status={run["status"]} conclusion={run["conclusion"]}', flush=True)
