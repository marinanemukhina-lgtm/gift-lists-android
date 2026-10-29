"""The build must use its checked-in Gradle version and stop before work without JDK21."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[3]

class MobileBuildTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / 'scripts').mkdir()
        shutil.copy(ROOT / 'scripts/mobile-build.sh', self.root / 'scripts/mobile-build.sh')
        self.bin = self.root / 'bin'; self.bin.mkdir()
        self.sdk = self.root / 'sdk'; self.sdk.mkdir()
        self.jdk = self.root / 'jdk'; (self.jdk / 'bin').mkdir(parents=True)
        self.log = self.root / 'calls'
        self.stub(self.bin / 'npm', 'echo npm >> "$CALLS"')
        self.stub(self.jdk / 'bin/java', 'echo \'openjdk version "21.0.9"\' >&2')
        self.stub(self.jdk / 'bin/javac', 'echo javac 21.0.9')
        self.env = {**os.environ, 'PATH': f'{self.bin}:/usr/bin:/bin', 'JAVA_HOME': str(self.jdk), 'ANDROID_HOME': str(self.sdk), 'CALLS': str(self.log)}
    def tearDown(self): self.temp.cleanup()
    def stub(self, path, body):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text('#!/bin/bash\nset -eu\n'+body+'\n'); path.chmod(0o755)
    def run_build(self): return subprocess.run(['bash', 'scripts/mobile-build.sh'], cwd=self.root, env=self.env, capture_output=True, text=True)
    def test_jre_without_compiler_stops_before_web_build(self):
        (self.jdk/'bin/javac').unlink()
        result = self.run_build()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('JDK 21', result.stderr)
        self.assertFalse(self.log.exists(), 'Must detect missing compiler before npm build')
    def test_wrong_java_version_stops_before_web_build(self):
        self.stub(self.jdk/'bin/javac', 'echo javac 17.0.1')
        result = self.run_build()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('JDK 21', result.stderr)
        self.assertFalse(self.log.exists())
    def test_missing_platform_stops_without_install_or_license_acceptance(self):
        result = self.run_build()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('android-36', result.stderr)
        self.assertFalse(self.log.exists())
    def test_missing_build_tools_stops_before_web_build(self):
        platform = self.sdk/'platforms/android-36'; platform.mkdir(parents=True); (platform/'android.jar').touch()
        result = self.run_build()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('build-tools 35.0.0', result.stderr)
        self.assertFalse(self.log.exists())
    def test_build_uses_checked_in_wrapper_not_global_gradle(self):
        platform = self.sdk/'platforms/android-36'; platform.mkdir(parents=True); (platform/'android.jar').touch()
        buildtools = self.sdk/'build-tools/35.0.0'; buildtools.mkdir(parents=True)
        for tool in ['aapt2','zipalign']:
            self.stub(buildtools/tool, 'exit 0')
        self.stub(self.bin/'gradle', 'echo WRONG_GLOBAL_GRADLE >> "$CALLS"; exit 77')
        self.stub(self.root/'node_modules/.bin/cap', 'echo cap >> "$CALLS"')
        self.stub(self.root/'apps/mobile/android/gradlew', 'echo "wrapper $*" >> "$CALLS"; mkdir -p app/build/outputs/apk/release; printf unsigned > app/build/outputs/apk/release/app-release-unsigned.apk')
        result = self.run_build()
        self.assertEqual(result.returncode, 0, result.stdout+result.stderr)
        calls = self.log.read_text()
        self.assertIn('wrapper --no-daemon', calls)
        self.assertNotIn('WRONG_GLOBAL_GRADLE', calls)
        self.assertIn(':app:assembleRelease :app:lintRelease :app:testReleaseUnitTest', calls)

if __name__ == '__main__': unittest.main()
