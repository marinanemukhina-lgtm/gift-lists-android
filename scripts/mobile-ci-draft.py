#!/usr/bin/env python3
"""CI-only, one-shot bounded unpublished evidence upload. No automatic mutation retries."""
import hashlib
import json
import os
import pathlib
import re
import sys
import struct
import zlib
import urllib.error
import urllib.parse
import urllib.request
import zipfile

REPO = 'marinanemukhina-lgtm/gift-lists-android'
REPO_ID = 1435989060
MAX_TOTAL = 20_000_000
SCREENSHOTS = frozenset({'offline-editor.png', 'offline-preview-cards.png', 'offline-preview.png'})
MAX_PNG = 2_000_000


def validate_png(data):
    assert 0 < len(data) <= MAX_PNG, 'Screenshot must be at most 2,000,000 bytes'
    assert data[:8] == b'\x89PNG\r\n\x1a\n', 'Screenshot must have PNG magic'
    offset, dimensions, has_pixels = 8, None, False
    while offset < len(data):
        assert offset + 12 <= len(data), 'Truncated PNG chunk'
        size, kind = struct.unpack('>I4s', data[offset:offset+8])
        assert offset + size + 12 <= len(data), 'Truncated PNG data'
        payload = data[offset+8:offset+8+size]
        crc = struct.unpack('>I', data[offset+8+size:offset+12+size])[0]
        assert zlib.crc32(kind + payload) & 0xffffffff == crc, 'Corrupt PNG chunk'
        if dimensions is None:
            assert kind == b'IHDR' and size == 13, 'PNG must begin with IHDR'
            width, height, depth, color, compression, filtering, interlace = struct.unpack('>IIBBBBB', payload)
            assert 320 <= width <= 2560 and 320 <= height <= 4096 and width * height <= 10000000, 'Screenshot dimensions outside emulator bounds'
            assert depth == 8 and color in (2, 6) and compression == 0 and filtering == 0 and interlace == 0, 'Unsupported screenshot PNG format'
            dimensions = (width, height)
        elif kind == b'IHDR':
            raise AssertionError('Duplicate PNG header')
        elif kind == b'IDAT':
            assert size > 0, 'Empty PNG pixels'
            has_pixels = True
        elif kind == b'IEND':
            assert size == 0 and has_pixels and offset + 12 == len(data), 'Incomplete PNG or trailing data'
            return dimensions
        offset += size + 12
    raise AssertionError('PNG has no complete IEND')


ONE_SHOT_BEFORE = '205621b822848a44509f42205ffda8da9a5d12f2'
ONE_SHOT_MESSAGE = 'Run approved one-shot Android acceptance'


def validate_event(env):
    assert env.get('GITHUB_ACTIONS') == 'true', 'Official CI only'
    event = env.get('GITHUB_EVENT_NAME')
    if event == 'workflow_dispatch':
        return
    assert event == 'push', 'Only manual or the approved one-shot push'
    payload = json.loads(pathlib.Path(env['GITHUB_EVENT_PATH']).read_text())
    assert payload.get('before') == ONE_SHOT_BEFORE, 'One-shot parent has already been consumed or is wrong'
    assert payload.get('after') == env.get('GITHUB_SHA'), 'Unexpected pushed source'
    assert payload.get('forced') is False and payload.get('deleted') is False, 'No forced/deleted ref'
    assert payload.get('head_commit', {}).get('message') == ONE_SHOT_MESSAGE, 'Not the reviewed launch commit'
    repo = payload.get('repository', {})
    assert repo.get('id') == REPO_ID and repo.get('private') is False, 'Public approved repository only'


def context(env):
    validate_event(env)
    assert env.get('GITHUB_REPOSITORY') == REPO and env.get('GITHUB_REPOSITORY_ID') == str(REPO_ID), 'Wrong repository'
    assert env.get('GITHUB_REF') == 'refs/heads/main', 'Reviewed main only'
    sha = env.get('REVIEWED_SHA', '')
    assert re.fullmatch('[a-f0-9]{40}', sha) and sha == env.get('GITHUB_SHA'), 'Unreviewed source'
    run, attempt = env.get('GITHUB_RUN_ID', ''), env.get('GITHUB_RUN_ATTEMPT', '')
    assert re.fullmatch('[0-9]+', run) and attempt == '1', 'Only the separately approved first attempt; reruns require fresh review'
    assert env.get('GITHUB_TOKEN'), 'Repository job token required; no PAT fallback'
    return sha, f'gift-qa-{run}-{attempt}'


def evidence(directory):
    root = pathlib.Path(directory)
    assert root.is_dir() and not root.is_symlink(), 'Missing bounded evidence directory'
    paths = sorted(root.iterdir())
    names = {p.name for p in paths}
    assert 'qa-report.txt' in names and names <= ({'qa-report.txt', 'gift-lists-test.apk'} | SCREENSHOTS), 'Evidence allowlist mismatch'
    assert not (names & SCREENSHOTS) or 'gift-lists-test.apk' in names, 'Screenshots require the matching built APK'
    total = 0
    result = []
    for path in paths:
        assert path.is_file() and not path.is_symlink(), 'No links or directories in evidence'
        limit = MAX_PNG if path.name in SCREENSHOTS else 65536 if path.name.endswith('.txt') else 20000000
        assert 0 < path.stat().st_size <= limit, 'Evidence byte limit'
        data = path.read_bytes()
        assert 0 < len(data) <= limit, 'Evidence byte limit'
        total += len(data)
        if path.name.endswith('.apk'):
            with zipfile.ZipFile(path) as archive:
                names = archive.namelist()
                assert 'assets/public/index.html' in names, 'Missing bundled app'
                for name in names:
                    parts = pathlib.PurePosixPath(name).parts
                    assert '..' not in parts and not name.startswith('/'), 'Unsafe APK path'
                    assert not re.search(r'(?i)(\.jks|\.keystore|\.p12|\.pem|\.map)$', name), 'Private material or source maps in APK'
                    assert not any(part.startswith('.env') for part in parts), 'Environment file in APK'
                config = json.loads(archive.read('assets/capacitor.config.json'))
                assert not config.get('server', {}).get('url'), 'Remote privileged WebView forbidden'
                assert config.get('android', {}).get('webContentsDebuggingEnabled') is False, 'Debug WebView forbidden'
        elif path.name in SCREENSHOTS:
            validate_png(data)
        else:
            text = data.decode('utf-8')
            assert text.startswith('Gift Lists synthetic Android acceptance\n'), 'Unexpected report'
            assert 'Result:' in text and 'NOT store-ready' in text, 'Incomplete report'
        result.append((path.name, data, hashlib.sha256(data).hexdigest()))
    assert total <= MAX_TOTAL, 'Total evidence byte limit'
    return result


class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        target = urllib.parse.urlsplit(newurl)
        assert target.scheme == 'https' and not target.username and not target.password, 'Unsafe asset redirect'
        assert target.hostname in {'api.github.com', 'github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'}, 'Unreviewed asset redirect host'
        redirected = super().redirect_request(request, fp, code, msg, headers, newurl)
        if target.hostname != urllib.parse.urlsplit(request.full_url).hostname:
            for header in ('Authorization', 'authorization'):
                redirected.remove_header(header)
        return redirected


class GitHub:
    def __init__(self, token):
        self.token = token
        self.opener = urllib.request.build_opener(SafeRedirect())

    def request(self, path, method='GET', body=None, upload=False, binary=False, missing=False):
        host = 'uploads.github.com' if upload else 'api.github.com'
        assert path.startswith(f'/repos/{REPO}'), 'Unexpected API target'
        headers = {'Authorization': f'Bearer {self.token}', 'X-GitHub-Api-Version': '2022-11-28',
                   'Accept': 'application/octet-stream' if binary else 'application/vnd.github+json',
                   'User-Agent': 'gift-lists-reviewed-manual-qa'}
        if body is not None:
            headers['Content-Type'] = 'application/octet-stream' if upload else 'application/json'
            if not upload:
                body = json.dumps(body).encode()
        request = urllib.request.Request(f'https://{host}{path}', data=body, method=method, headers=headers)
        try:
            with self.opener.open(request, timeout=90) as response:
                data = response.read(MAX_TOTAL + 1)
                assert len(data) <= MAX_TOTAL, 'Response too large'
                return data if binary else json.loads(data)
        except urllib.error.HTTPError as error:
            if missing and error.code == 404:
                return None
            raise RuntimeError(f'GitHub {method} returned HTTP {error.code}; stop, no retry or permission bypass') from None
        except urllib.error.URLError:
            raise RuntimeError(f'GitHub {method} response uncertain; stop and inspect remote state before another write') from None


def upload(env):
    sha, tag = context(env)
    files = evidence(pathlib.Path(env['RUNNER_TEMP']) / 'gift-qa-evidence')
    api = GitHub(env['GITHUB_TOKEN'])
    base = f'/repos/{REPO}'
    repo = api.request(base)
    assert repo['id'] == REPO_ID and repo['private'] is False and repo['default_branch'] == 'main', 'Remote repository changed'
    assert api.request(base + '/git/ref/heads/main')['object']['sha'] == sha, 'Main changed: review again before upload'
    # A retry may follow an uncertain previous response. Never overwrite or create a duplicate.
    assert api.request(base + '/releases/tags/' + tag, missing=True) is None, 'Existing release: inspect instead of retry'
    releases = api.request(base + '/releases?per_page=100')
    assert not any(item['tag_name'] == tag for item in releases), 'Existing draft: inspect instead of retry'
    assert api.request(base + '/git/ref/tags/' + tag, missing=True) is None, 'Existing tag: inspect instead of retry'
    release = api.request(base + '/releases', 'POST', {
        'tag_name': tag, 'target_commitish': sha, 'name': f'Synthetic Android QA {tag}',
        'body': f'Unpublished TEST-only evidence for reviewed source {sha}. Read qa-report.txt: FAIL/NOT_RUN are not acceptance. Not store-ready. No production signing key.',
        'draft': True, 'prerelease': True, 'generate_release_notes': False,
    })
    release_id = release['id']
    assert isinstance(release_id, int) and release['draft'] is True and release['published_at'] is None, 'Unexpected release state; inspect immediately'
    print(f'Created UNPUBLISHED draft release id={release_id}; no retry/overwrite is permitted')
    for name, data, digest in files:
        asset = api.request(base + f'/releases/{release_id}/assets?name=' + urllib.parse.quote(name), 'POST', data, upload=True)
        asset_id = asset['id']
        check = api.request(base + f'/releases/assets/{asset_id}')
        assert check['name'] == name and check['size'] == len(data) and check['state'] == 'uploaded', 'Asset metadata mismatch'
        if check.get('digest'):
            assert check['digest'] == 'sha256:' + digest, 'Asset server digest mismatch'
        downloaded = api.request(base + f'/releases/assets/{asset_id}', binary=True)
        assert len(downloaded) == len(data) and hashlib.sha256(downloaded).hexdigest() == digest, 'Asset download bytes mismatch'
        print(f'Verified draft asset {name}: id={asset_id} bytes={len(data)} sha256={digest}')
    verified = api.request(base + f'/releases/{release_id}')
    assert verified['draft'] is True and verified['prerelease'] is True and verified['published_at'] is None, 'Must remain unpublished'
    assert {item['name'] for item in verified['assets']} == {item[0] for item in files}, 'Unexpected release assets'
    print(f'Evidence remains UNPUBLISHED draft id={release_id}. Root must review QA outcomes; no store acceptance inferred.')


if __name__ == '__main__':
    try:
        upload(os.environ)
    except (AssertionError, RuntimeError, ValueError, KeyError, OSError, zipfile.BadZipFile) as error:
        # Never dump requests, token-bearing URLs, environment or binary contents.
        print(f'Evidence upload stopped: {error}', file=sys.stderr)
        sys.exit(1)
