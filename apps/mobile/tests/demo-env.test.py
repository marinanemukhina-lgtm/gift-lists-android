"""Offline and exact-host synthetic-online build configuration; no network."""
import json,pathlib,subprocess,unittest
ROOT=pathlib.Path(__file__).resolve().parents[3]
class DemoEnv(unittest.TestCase):
 def config(self,mode):
  command='set -e; source scripts/mobile-demo-env.sh; python3 -c \'import os,json; print(json.dumps({k:os.environ.get(k) for k in ["VITE_DEMO","VITE_API_ORIGIN","VITE_PUBLIC_ORIGIN","VITE_PRIVACY_POLICY_URL","VITE_SUPPORT_URL"]}))\''
  return subprocess.run(['bash','-c',command],cwd=ROOT,env={'PATH':'/usr/bin:/bin','GIFT_ANDROID_MODE':mode,'VITE_API_ORIGIN':'https://unreviewed.invalid'},text=True,capture_output=True)
 def test_offline_mode_has_no_origin(self):
  r=self.config('offline');self.assertEqual(r.returncode,0,r.stderr);v=json.loads(r.stdout);self.assertEqual(v['VITE_API_ORIGIN'],'');self.assertEqual(v['VITE_PUBLIC_ORIGIN'],'');self.assertEqual(v['VITE_DEMO'],'true')
 def test_online_mode_is_pinned_to_reviewed_demo(self):
  r=self.config('online');self.assertEqual(r.returncode,0,r.stderr);v=json.loads(r.stdout);self.assertEqual(v['VITE_DEMO'],'true');self.assertEqual(v['VITE_API_ORIGIN'],'https://gift-lists-demo.vercel.app');self.assertEqual(v['VITE_PUBLIC_ORIGIN'],v['VITE_API_ORIGIN']);self.assertEqual(v['VITE_SUPPORT_URL'],v['VITE_API_ORIGIN']+'/support')
 def test_unknown_mode_stops(self):
  self.assertNotEqual(self.config('production').returncode,0)
 def test_offline_coverage_precedes_network_enable(self):
  s=(ROOT/'scripts/mobile-ci-acceptance.sh').read_text();self.assertIn('source scripts/mobile-demo-env.sh',s);self.assertIn('run_tests online',s);self.assertLess(s.index("run_tests documents"),s.index('adb shell svc wifi enable'));self.assertIn('No production data/API credential',s)
if __name__=='__main__':unittest.main()
