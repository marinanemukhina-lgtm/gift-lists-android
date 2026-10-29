# Hosted synthetic Android mode

Reviewed host: https://gift-lists-demo.vercel.app

Both API and public link origin must equal this exact HTTPS origin. Build with:

```sh
GIFT_ANDROID_MODE=online bash -c 'source scripts/mobile-demo-env.sh; npm run build:mobile'
```

This is still DEMO=true, no monetization and no real personal data. It does not need a PostgreSQL credential on the device. The server accepts exact origins `https://gift-lists-demo.vercel.app` and `https://localhost` (the configured Capacitor Android scheme), never `*`.

Default `offline` mode preserves blank API/public origins. CI builds one configured TEST APK in explicit online mode, first disables network and preserves all five existing offline instrumentation tests, then clears only the ephemeral emulator's test app state, enables network, and runs a separate real hosted online test. Offline screenshots remain explicitly named offline; they are not proof of online UI acceptance. Report must distinguish modes and failure stages.

A successful Vite build is not an Android APK, emulator acceptance or RuStore publication. The earlier draft APK from7ffe remains offline and must not be described as this build. Permanent release certificate, production hosting/data handling, operator/support/policy/UGC moderation and RuStore submission remain separate gates.
