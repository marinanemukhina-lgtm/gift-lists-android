"""Outcome tests for the inert evidence guard/uploader; never contacts GitHub."""
import contextlib
import io
import importlib.util
import json
import pathlib
import sys
import struct
import zlib
import tempfile
import subprocess
import unittest
import urllib.request
import zipfile
from unittest.mock import patch
sys.dont_write_bytecode = True
path = pathlib.Path(__file__).resolve().parents[3] / 'scripts/mobile-ci-draft.py'
spec = importlib.util.spec_from_file_location('gift_evidence', path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
SHA = 'a' * 40


def env(root):
    return dict(GITHUB_ACTIONS='true', GITHUB_EVENT_NAME='workflow_dispatch', GITHUB_REPOSITORY=module.REPO,
                GITHUB_REPOSITORY_ID=str(module.REPO_ID), GITHUB_REF='refs/heads/main', REVIEWED_SHA=SHA,
                GITHUB_SHA=SHA, GITHUB_RUN_ID='123', GITHUB_RUN_ATTEMPT='1', GITHUB_TOKEN='synthetic-token', RUNNER_TEMP=str(root))


def fixture(root):
    directory = pathlib.Path(root) / 'gift-qa-evidence'
    directory.mkdir()
    (directory / 'qa-report.txt').write_text('Gift Lists synthetic Android acceptance\nResult: FAIL / NOT_RUN\nNOT store-ready\n')
    return directory


def png(width=320, height=640):
    # Synthetic parser fixture only; never collected or uploaded as native evidence.
    def chunk(kind,data):
        return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
    pixels=zlib.compress((b'\0'+b'\0\0\0'*width)*height)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',width,height,8,2,0,0,0))+chunk(b'IDAT',pixels)+chunk(b'IEND',b'')


def apk_fixture(directory):
    with zipfile.ZipFile(directory/'gift-lists-test.apk','w') as archive:
        archive.writestr('assets/public/index.html','synthetic test only')
        archive.writestr('assets/capacitor.config.json',json.dumps({'server':{},'android':{'webContentsDebuggingEnabled':False}}))


class FakeGitHub:
    def __init__(self):
        self.writes = []; self.assets = []; self.bad_digest = False; self.changed = False; self.uncertain = False
    def request(self, path, method='GET', body=None, upload=False, binary=False, missing=False):
        if method == 'POST':
            self.writes.append((path, body))
            if path.endswith('/releases'):
                if self.uncertain: raise RuntimeError('Uncertain response')
                return dict(id=10, draft=True, published_at=None)
            asset = dict(id=20+len(self.assets), name=path.split('name=')[1], size=len(body), state='uploaded',
                         digest='sha256:'+module.hashlib.sha256(body).hexdigest(), data=body)
            self.assets.append(asset); return asset
        if path.endswith('/git/ref/heads/main'): return {'object': {'sha': ('b'*40 if self.changed else SHA)}}
        if '/releases/tags/' in path or '/git/ref/tags/' in path: return None
        if path.endswith('/releases?per_page=100'): return []
        if '/releases/assets/' in path:
            asset = next(a for a in self.assets if a['id'] == int(path.rsplit('/',1)[1]))
            return asset['data'] if binary else {**asset, 'digest': 'sha256:wrong' if self.bad_digest else asset['digest']}
        if path.endswith('/releases/10'): return dict(draft=True, prerelease=True, published_at=None, assets=self.assets)
        return dict(id=module.REPO_ID, private=False, default_branch='main')


class EvidenceTests(unittest.TestCase):
    def test_workflow_rejects_unreviewed_context_before_allocating_one_api36_runner(self):
        workflow=(path.parent.parent/'.github/workflows/android-acceptance.yml').read_text()
        condition=next(line.strip()[4:] for line in workflow.splitlines() if line.startswith('    if: '))
        envelope, common = condition.split(')) && ', 1)
        self.assertEqual(envelope + '))', "((github.event_name == 'workflow_dispatch' && inputs.reviewed_sha == github.sha) || (github.event_name == 'push' && github.event.before == '974f7f4584a3c75cc26df53c10f6f64d1ecbc2e0' && github.event.forced == false && github.event.deleted == false && github.event.head_commit.message == 'Run approved online synthetic Android acceptance'))")
        self.assertEqual(set(common.split(' && ')),{
            "github.repository == 'marinanemukhina-lgtm/gift-lists-android'",
            "github.repository_id == '1435989060'",
            "github.event.repository.private == false",
            "github.event.repository.visibility == 'public'",
            "github.ref == 'refs/heads/main'",
            "github.run_attempt == '1'",
        })
        self.assertLess(workflow.index('    if: '),workflow.index('    runs-on: '))
        self.assertEqual(workflow.count('    runs-on: '),1)
        self.assertIn('    runs-on: ubuntu-24.04\n    timeout-minutes: 40\n',workflow)
        self.assertIn("      API_LEVEL: '36'\n",workflow)
        self.assertNotIn('api_level:',workflow)
        self.assertNotIn('strategy:',workflow)
        self.assertIn('run: bash scripts/mobile-ci-acceptance.sh',workflow)

    def test_one_shot_push_accepts_only_exact_unconsumed_envelope(self):
        with tempfile.TemporaryDirectory() as root:
            payload = dict(before=module.ONE_SHOT_BEFORE, after=SHA, forced=False, deleted=False,
                           head_commit={'message': module.ONE_SHOT_MESSAGE}, repository={'id': module.REPO_ID, 'private': False})
            event_path = pathlib.Path(root) / 'event.json'
            good = {**env(root), 'GITHUB_EVENT_NAME': 'push', 'GITHUB_EVENT_PATH': str(event_path)}
            event_path.write_text(json.dumps(payload))
            self.assertEqual(module.context(good)[0], SHA)
            for field, value in [('before', SHA), ('after', 'b'*40), ('forced', True), ('deleted', True),
                                 ('head_commit', {'message': 'later push'}), ('repository', {'id': module.REPO_ID, 'private': True})]:
                event_path.write_text(json.dumps({**payload, field: value}))
                with self.assertRaises(AssertionError): module.context(good)
            event_path.write_text(json.dumps(payload))
            with self.assertRaises(AssertionError): module.context({**good, 'GITHUB_RUN_ATTEMPT': '2'})
            with self.assertRaises(AssertionError): module.context({**good, 'GITHUB_EVENT_NAME': 'pull_request'})

    def test_signer_sidecars_remain_outside_evidence(self):
        # apksigner generates .idsig by default. Simulate that official behavior,
        # execute the actual signing section, and keep the evidence allowlist strict.
        with tempfile.TemporaryDirectory() as root:
            root = pathlib.Path(root)
            sdk = root / 'sdk/build-tools/36.0.0'; sdk.mkdir(parents=True)
            key = root / 'key'; key.mkdir()
            out = root / 'evidence'; out.mkdir()
            for name, body in {
                'zipalign': '#!/bin/bash\ntouch "${@: -1}"\n',
                'apksigner': '#!/bin/bash\n[[ "$1" == verify ]] && exit 0\nwhile (($#)); do if [[ "$1" == --out ]]; then shift; touch "$1" "$1.idsig"; exit 0; fi; shift; done\nexit 1\n',
            }.items():
                tool = sdk / name; tool.write_text(body); tool.chmod(0o755)
            script = (path.parent / 'mobile-ci-acceptance.sh').read_text()
            section = script.split('buildtools="$ANDROID_HOME/build-tools/36.0.0"', 1)[1].split('unset GIFT_TEST_PASSWORD', 1)[0]
            prefix = f'buildtools="{sdk}"; keydir="{key}"; evidence="{out}"; app=fixture; test_apks=(fixture); '
            subprocess.run(['bash', '-euc', prefix + section], check=True)
            self.assertEqual({x.name for x in out.iterdir()}, {'gift-lists-test.apk'})
            self.assertTrue((key / 'gift-lists-test.apk.idsig').exists())

    def test_context_rejects_local_or_changed_source(self):
        with tempfile.TemporaryDirectory() as root:
            good = env(root)
            self.assertEqual(module.context(good)[0], SHA)
            for field, value in [('GITHUB_ACTIONS','false'),('GITHUB_REF','refs/heads/unreviewed'),('GITHUB_SHA','b'*40),('GITHUB_REPOSITORY_ID','1'),('GITHUB_RUN_ATTEMPT','2')]:
                with self.assertRaises(AssertionError): module.context({**good,field:value})

    def test_extra_files_links_and_oversize_never_reach_upload(self):
        with tempfile.TemporaryDirectory() as root:
            directory = fixture(root)
            self.assertEqual(len(module.evidence(directory)),1)
            extra = directory/'test.p12'; extra.write_text('synthetic key fixture')
            with self.assertRaises(AssertionError): module.evidence(directory)
            extra.unlink()
            report=directory/'qa-report.txt';report.unlink();report.symlink_to('/dev/null')
            with self.assertRaises(AssertionError): module.evidence(directory)
            report.unlink();report.write_bytes(b'x'*65537)
            with self.assertRaises(AssertionError): module.evidence(directory)

    def test_apk_scan_refuses_environment_files(self):
        with tempfile.TemporaryDirectory() as root:
            directory = fixture(root)
            with zipfile.ZipFile(directory/'gift-lists-test.apk','w') as archive:
                archive.writestr('assets/public/index.html','synthetic')
                archive.writestr('assets/.env','synthetic')
            with self.assertRaises(AssertionError): module.evidence(directory)

    def test_upload_preserves_draft_and_verifies_download(self):
        with tempfile.TemporaryDirectory() as root:
            fixture(root); api=FakeGitHub()
            with contextlib.redirect_stdout(io.StringIO()), patch.object(module,'GitHub',return_value=api): module.upload(env(root))
            self.assertEqual(len(api.writes),2)
            create=api.writes[0][1]
            self.assertTrue(create['draft']); self.assertTrue(create['prerelease'])
            self.assertFalse(create['generate_release_notes']); self.assertEqual(create['target_commitish'],SHA)

    def test_changed_head_is_read_only_and_uncertain_create_is_never_retried(self):
        with tempfile.TemporaryDirectory() as root:
            fixture(root); api=FakeGitHub();api.changed=True
            with contextlib.redirect_stdout(io.StringIO()), patch.object(module,'GitHub',return_value=api), self.assertRaises(AssertionError): module.upload(env(root))
            self.assertEqual(api.writes,[])
            api.changed=False;api.uncertain=True
            with contextlib.redirect_stdout(io.StringIO()), patch.object(module,'GitHub',return_value=api), self.assertRaises(RuntimeError): module.upload(env(root))
            self.assertEqual(len(api.writes),1)

    def test_bad_digest_stops_without_reupload(self):
        with tempfile.TemporaryDirectory() as root:
            fixture(root);api=FakeGitHub();api.bad_digest=True
            with contextlib.redirect_stdout(io.StringIO()), patch.object(module,'GitHub',return_value=api), self.assertRaises(AssertionError): module.upload(env(root))
            self.assertEqual(len(api.writes),2)

    def test_png_signature_dimensions_crc_and_byte_limits(self):
        valid=png()
        self.assertEqual(module.validate_png(valid),(320,640))
        wrong_size=bytearray(valid)
        wrong_size[16:20]=struct.pack('>I',1)
        wrong_size[29:33]=struct.pack('>I',zlib.crc32(wrong_size[12:29])&0xffffffff)
        for data in [b'not-a-png',valid[:-1],valid[:-13]+b'X'+valid[-12:],bytes(wrong_size),b'x'*(module.MAX_PNG+1)]:
            with self.subTest(length=len(data)),self.assertRaises(AssertionError): module.validate_png(data)

    def test_only_three_fixed_screenshots_upload_and_total_limit_still_applies(self):
        with tempfile.TemporaryDirectory() as root:
            directory=fixture(root);apk_fixture(directory)
            for name in module.SCREENSHOTS:(directory/name).write_bytes(png())
            self.assertEqual(len(module.evidence(directory)),5)
            api=FakeGitHub()
            with contextlib.redirect_stdout(io.StringIO()),patch.object(module,'GitHub',return_value=api):module.upload(env(root))
            self.assertEqual({a['name'] for a in api.assets},{'gift-lists-test.apk','qa-report.txt'}|module.SCREENSHOTS)
            total=sum(p.stat().st_size for p in directory.iterdir())
            with patch.object(module,'MAX_TOTAL',total-1),self.assertRaises(AssertionError):module.evidence(directory)
            extra=directory/'account.png';extra.write_bytes(png())
            with self.assertRaises(AssertionError):module.evidence(directory)

    def test_screenshot_without_matching_app_is_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            directory=fixture(root);(directory/'offline-preview.png').write_bytes(png())
            with self.assertRaises(AssertionError):module.evidence(directory)

    def test_redirect_strips_authorization_and_refuses_unknown_hosts(self):
        request=urllib.request.Request('https://api.github.com/repos/'+module.REPO+'/releases/assets/1',headers={'Authorization':'Bearer synthetic'})
        redirected=module.SafeRedirect().redirect_request(request,None,302,'Found',{},'https://release-assets.githubusercontent.com/synthetic')
        self.assertFalse(redirected.has_header('Authorization'))
        with self.assertRaises(AssertionError): module.SafeRedirect().redirect_request(request,None,302,'Found',{},'https://unapproved.invalid/object')
        with self.assertRaises(AssertionError): module.SafeRedirect().redirect_request(request,None,302,'Found',{},'http://release-assets.githubusercontent.com/object')


if __name__ == '__main__': unittest.main()
