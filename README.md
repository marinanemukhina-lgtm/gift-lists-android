# Список подарков — portable demo

One consumer gift-list product: a local-bundled Android app and ordinary HTTPS owner/guest web UI backed by PostgreSQL. Baby, child, adult birthday and wedding presets share editable copy, gifts and independent design settings.

**This build is a temporary personal, noncommercial demo with synthetic data only.** It is not approved for real customer/children's data, sales or RuStore publication. Vercel/Neon are temporary demo infrastructure, not a promise of Russian data placement or permanent URL portability.

## Boundaries
- `packages/domain`: typed DTOs, ports, safe publication validation and contrast rules.
- `packages/client`: portable HTTP transport, cryptographic randomness and bounded double-buffered local drafts/caches.
- `packages/ui`: one owner/guest React product, with explicit storage/network/native ports.
- `services/api`: standard Request/Response handler, ordinary `pg`, PostgreSQL migrations; no vendor auth/functions/database abstraction dependency.
- `apps/web`: Next.js Node adapter + browser IndexedDB. Local database files are never used for shared persistence.
- `apps/mobile`: Vite bundled assets + Capacitor Android. No `server.url`, remote privileged page or fallback secret storage.

## Local checks
Use Node 22.13+ (verified Node24) and `npm ci --ignore-scripts --no-audit --no-fund`.

```
npm run typecheck
npm test
npm run build:web
npm run build:mobile
node --import tsx --test apps/mobile/tests/*.test.ts packages/ui/tests/*.test.ts
```

`node --import tsx` intentionally avoids the tsx CLI's unnecessary IPC server. SQL outcome tests run actual PostgreSQL via PGlite, not an in-memory repository mock. Android compile/lint instructions and native restrictions are in `apps/mobile/README.md`.

## Server configuration and deployment
Only an authorized operator supplies `DATABASE_URL` via server secret storage; never prefix it with `NEXT_PUBLIC_` / `VITE_`. Use certificate-verified PostgreSQL TLS. No application signing/encryption/session secret is needed. See `.env.example` for nonsecret variable names.

Apply `services/api/migrations/001_initial.sql` once, transactionally, to the **new isolated database only**, or run `npm run db:migrate` in an authorized environment. The migration runner is idempotent and locks migrations. Request handlers never create tables. Do not point this service at the original Site database or any unrelated project.

Vercel build configuration in `vercel.json`: repository root, Next.js, `npm run build:web`, output `apps/web/.next`. Build does not open a database. Set exact `ALLOWED_ORIGINS` to the chosen web HTTPS origin and `https://localhost` for the native app. Keep `DEMO_MODE=true` and `NEXT_PUBLIC_DEMO=true`. Only enable `TRUST_PROXY` when the hosting proxy sanitizes its client-IP header. Host-level request/concurrency limits remain necessary alongside SQL throttles.

For an ordinary Node host: `npm run build:web`, then `npm start`; or use the provided Dockerfile and PostgreSQL. Standalone server lives at `apps/web/.next/standalone/apps/web/server.js`; static assets must accompany it. Migrations are an explicit release step, not container startup magic.

Web origins default to the current browser origin. Native API/public origins are build-time `VITE_API_ORIGIN` / `VITE_PUBLIC_ORIGIN`; without them, local drafts work but publish/share fail explicitly. Migration requires deploying API/web to the chosen host and releasing a native configuration update. Existing `vercel.app` links cannot be promised to survive provider/domain changes.

## Access, offline and privacy
Clients create 256-bit owner/recovery capabilities using platform CSPRNG; the server stores only SHA-256 verifiers. Recovery replaces the active device transactionally; unchanged recovery remains usable if a response is lost. Rotation/deletion operations persist retry metadata in the credential store. Browser capabilities are in a separate IndexedDB object store; Android capabilities require native Keystore-backed secure storage and never use its insecure web implementation.

Credentials are not in ordinary drafts, exports, logs or guest links. A recovery file intentionally contains the recovery capability and explicitly warns that it grants full control. Android backup excludes app data; no Google account is required. Lose both device access and recovery file and the lists cannot be reclaimed by their public URL/name.

Android bundles the editor for offline first launch/edit/save; actual device acceptance is still pending. Cached guest availability is explicitly unknown until a fresh response. No offline booking/cancellation queue exists. A timeout is unknown, not a success. Optimistic versions and idempotency prevent silent overwrites and duplicate publication; reservation/archive operations share PostgreSQL transaction locks.

Reports are stored in PostgreSQL for operator handling, not sent to a nonexistent email. Approved operator contact, legal notices, retention/backup policy, moderation response arrangements and Russian production hosting are still release gates. The demo's report/receipt expiry is documented in the API README. Account deletion removes owned server lists/bookings/credentials, with verifier-only retry/anti-replay records retained for the bounded documented period.

## Release gates still owned by the publisher
Exact-source independent review, real isolated-host browser integration, backup/restore proof, actual Android runtime acceptance (API26 + current, offline fresh start, process death/upgrade, SAF, native sharing/Back/TalkBack, no-Google-device path), approved package/signing custody, production host/operator/privacy/support, and RuStore console submission/moderation. Unsigned compile is not store readiness.

## Managed integrated local preview

`npm run dev -- --host 127.0.0.1 --port PORT --strictPort` uses `apps/preview` solely for authorized browser acceptance while remote hosting permission is pending. The exact API handler runs against a disposable **file-backed** PGlite test database, with real owner credentials/SQL semantics and no seed/mock auth. See `apps/preview/README.md`; no real DB credential is read. Next development remains `npm run dev:web`. Production builds do not include the preview server or a local persistence fallback.

Cross-tab identity/first-guest mutations are serialized using browser Web Locks; if unavailable, owner/booking mutations fail closed while offline drafts remain usable. Android serializes complete workflows in its native credential adapter. This prevents delayed responses from replacing newer recovery credentials and prevents simultaneous first guest actions from losing their cancellation key.

## Explicit release configuration

Demo remains the default. Web `NEXT_PUBLIC_DEMO` and server `DEMO_MODE` must agree; Android `VITE_DEMO=false` is now respected rather than hardcoded. Any malformed boolean fails closed. Production builds require exact HTTPS API/public origins, operator name, support contact, privacy/support HTTPS URLs and explicit legal-approval flags. See `.env.example` for names. Web additionally requires approved `GIFT_PRIVACY_TEXT` and a valid `GIFT_PRIVACY_UPDATED_AT`; no example legal identity or contact is supplied.

`/privacy` and `/support` render a truthful technical/demo notice in demo mode. In production they render only validated operator-supplied information as escaped text. The build gate does not prove legal compliance, reachable URLs, database connectivity, or a completed release. No production setting is enabled by default, and no credentials are embedded. Public legal links are reachable from the web footer and configured owner account panel.
