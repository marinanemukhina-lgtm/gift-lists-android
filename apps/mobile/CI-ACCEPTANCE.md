# Inert manual Android acceptance workflow

Prepared locally; **not pushed or dispatched by this worker**. Root must approve exact source and workflow before the one authorized manual run. There is no push, PR, fork or scheduled trigger. Local checks do not establish emulator/device acceptance.

## Authority and evidence boundary

- Only public repository `marinanemukhina-lgtm/gift-lists-android`, ID1435989060: the job checks event repository `private:false` and `visibility:public` before runner work, so the same repository becoming private cannot start this public/free-only job. The same pre-run job guard also requires the exact reviewed `main` SHA, `workflow_dispatch`, repository identity and run attempt 1. A rerun requires separate review; current guards reject it. The only device is API36, with no alternate input, matrix or second automatic run; API26 needs separate review and authorization.
- Standard `ubuntu-24.04` x64 runner, one job, 40-minute ceiling, serialized runs. No larger runner, paid service, Actions cache, artifact upload or persistent key. npm lifecycle scripts are disabled during dependency installation.
- Latest explicit root grant permits **job-scoped `contents:write`** for bounded unpublished draft evidence. This is whole-job authority, not upload-only authority. Checkout credentials are not persisted. No third-party emulator action, install script or unreviewed APK mirror.
- The test keystore is generated **only in the guarded ephemeral CI runner**, outside the checkout. App and instrumentation release APKs are signed with the same disposable key; the key/password are never uploaded or committed and cleanup runs on exit. This is not a RuStore release key.
- Positive upload allowlist: `gift-lists-test.apk` (at most20,000,000bytes), `qa-report.txt` (at most65,536bytes), and at most3 fixed native screenshots: `offline-editor.png`, `offline-preview.png`, `offline-preview-cards.png` (each at most 2,000,000 bytes). **Total remains at most 20,000,000 bytes**. PNG signature, complete chunk framing/CRCs, IHDR dimensions (320–2560 by320–4096, at most10million pixels), RGB/RGBA8 format and IEND are checked. Missing, extra, corrupt or oversized files cannot be treated as accepted screenshot evidence. On early failure, report-only or partial allowlisted evidence is allowed; the report explicitly lists each screenshot as captured/NOT_CAPTURED. No instrumentation APK, account/recovery screen, environment file, signing file, source map, raw build log or database is uploaded.
- Screenshots are actual native `screencap` output invoked through instrumentation UiAutomation only after the known synthetic editor/full-preview/card-grid state is verified. Four authored synthetic gifts are added through real UI fields; all4 are asserted in the full preview. Only `/data/local/tmp/gift-qa-<fixed-name>.png` is collected; no `run-as`, application-private screenshot reads, arbitrary screen capture, cropping, resizing or stitching. Each image is one native viewport, not a claim all4 cards fit simultaneously on every display.
- KVM setup first uses existing read/write access. **Only if missing**, the one explicitly authorized ephemeral GitHub VM may receive a per-user ACL for `/dev/kvm`; there is no world/group mode change or fallback. SDK installation uses only the official runner's already accepted licenses: no `sdkmanager --licenses`, automatic yes, or new agreement. Installer stdin is closed, requested files are verified, and a new/unknown agreement stops with bounded package/license/link diagnostics for root review. Existing runner license inventory is not new user agreement authorization.
- CI invokes shell scripts and the Gradle wrapper with explicit `bash`, so a reviewed public upload preserving files as100644 does not need an executable-bit repair.
- A single draft release is created using the exact reviewed SHA with `draft:true`, `prerelease:true`, no generated notes. Existing tag/draft or uncertain response stops; no overwrite, publish, permission escalation or mutation retry. Each asset's ID/state/size/digest and downloaded bytes are verified, and the release is re-read to confirm it remains unpublished. Redirects cannot carry Authorization to asset hosts.
- Only root pushes/dispatches/reviews remote evidence. Upload failure or timeout is not QA PASS and may leave a partial draft for root inspection.

## What the authored runtime tests actually exercise

These are **compiled, not yet executed** here. No production test hook or remote-debugging WebView was added.

1. Release-package contract: bundled assets, no remote `server.url`, debugging off, backup disabled and no broad storage permissions.
2. Fresh truly offline launch: four occasion choices, edit through actual React DOM events, native private-file save acknowledgement, publication disabled, actual Android Back to library. The test inspects the private filesystem to establish persistence rather than an in-memory UI illusion.
3. Actual installed SecureStorage native bridge: encrypted preference value differs from synthetic plaintext, Android Keystore alias exists and decrypt/read-back succeeds.
4. A separate instrumentation invocation after `am force-stop` verifies editable draft restoration and secure-value decryption after process death, then removes the synthetic secure value.
5. Real Android DocumentsUI picker open and Back cancellation leaves the local library unchanged.
6. Separate synthetic fixed-path test-only ContentProvider plus selected-URI interception exercises **actual native callbacks/ContentResolver write/read**, UTF-8 roundtrip, malformed UTF-8 rejection, import size bound and invalid export filename rejection. This does not claim human filename/folder selection or vendor file-provider interoperability.

There are5 JUnit instrumentation methods across the selected classes. Test-only `FixtureProvider` is declared only in the instrumentation manifest and cannot expose application data; it serves one synthetic file in the test application's cache. The production APK does not include it. Runtime tests intentionally use no API credentials and no hosted API.

## Genuine prerequisites / remaining gates

The script checks acceleration availability **and a live QEMU `/dev/kvm` handle**, boots once with `-accel on`, waits for Android services, then checks the active WebView version. A path existing or boot banner alone is not acceptance. No software-AVD fallback/retry.

API26 stock images may include WebView below the supported minimum100. No separately approved modern API26 provider artifact is known. The run must stop/report this prerequisite, not fetch an unchecked APK or lower app requirements. API36 also has to pass its actual provider check. Google APIs system images do **not** prove a no-Google-services device.

Still pending after a hypothetical offline pass: configured hosted API paths/recovery/revocation/races, human SAF success/navigation/provider variants, native sharesheet and merchant return, keyboard/safe-area visuals, TalkBack/large text, API26 on a supported provider, no-Google-services runtime, production signing custody, privacy/operator/hosting and RuStore review.

## Local review commands

```
python3 -B apps/mobile/tests/ci-evidence.test.py
bash -n scripts/mobile-ci-acceptance.sh
# Existing installed JDK21/SDK36; no keys needed:
cd apps/mobile/android
gradle --no-daemon --max-workers=2 :app:compileReleaseAndroidTestJavaWithJavac
```

Eleven deterministic CI guard/uploader tests use a fake in-process API (zero external requests): pre-run workflow identity/public/main/SHA/attempt guards and one fixed API36 runner, context/source/run-attempt guards, bounded allowlist/symlinks, APK environment-file exclusion, draft flags and downloaded-byte verification, changed-head read-only behavior, uncertain-create no-retry, bad digest no-reupload, redirect credential stripping, PNG signature/dimensions/CRC/size rejection, exactly3 screenshot names with matching APK, and the unchanged combined 20,000,000-byte ceiling. Native release instrumentation compile succeeded locally; runtime outcomes must come from the authorized CI/device run.

## Primary-source provenance reviewed

- [Official checkout v4.3.1](https://github.com/actions/checkout/releases/tag/v4.3.1), full tag SHA `34e114876b0b11c390a56381ad16ebd13914f8d5`; [action inputs](https://github.com/actions/checkout/blob/34e114876b0b11c390a56381ad16ebd13914f8d5/action.yml).
- [Official setup-node v4.4.0](https://github.com/actions/setup-node/releases/tag/v4.4.0), full tag SHA `49933ea5288caeca8642d1e84afbd3f7d6820020`; [action inputs](https://github.com/actions/setup-node/blob/49933ea5288caeca8642d1e84afbd3f7d6820020/action.yml). No cache input.
- CI Node pinned to the verified [22.23.4 security release](https://nodejs.org/en/blog/release/v22.23.4), not the earlier vulnerable22.22.0. Runner-provided JDK21 patch and official SDK image/tool revisions remain recorded runtime prerequisites, not immutable binary pins.
- [Android ActivityScenario](https://developer.android.com/reference/androidx/test/core/app/ActivityScenario), [command-line instrumentation](https://developer.android.com/studio/test/command-line), [emulator options](https://developer.android.com/studio/run/emulator-commandline).
- [GitHub release REST API](https://docs.github.com/en/rest/releases/releases), [asset REST API](https://docs.github.com/en/rest/releases/assets). No draft-release publication endpoint is called.
