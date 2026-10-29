# Portable consumer API

This is an isolated **personal, noncommercial synthetic-data demo**, not a production
Russian personal-data service. No dependency on Neon auth/functions/Data API exists.
`createApiHandler(database, options)` accepts ordinary `Request` and returns `Response`.
`createPgDatabase(DATABASE_URL)` supplies a standard `pg` transaction adapter. PostgreSQL
14+ is the intended baseline; deterministic tests use the actual PGlite PostgreSQL engine.

## Explicit deployment steps (operator/root only)

1. Set `DATABASE_URL` **only in the server secret store**. Do not use `NEXT_PUBLIC_`,
   Vite variables, client files, command-line URLs, logs, or source-control history.
2. For a remote database, require certificate-verified TLS: a normal URL with
   `sslmode=verify-full`, a valid server hostname and trusted CA. For a private CA,
   configure the standard pg/Node trust chain. Never use `rejectUnauthorized: false`
   or `NODE_TLS_REJECT_UNAUTHORIZED=0`. Local disposable PostgreSQL may use an
   explicitly local non-TLS connection; that is not a deployment setting.
3. Apply `services/api/migrations/001_initial.sql` transactionally, or run
   `node --import tsx services/api/src/migrate.ts` with the server-only environment.
   The migration CLI locks its migration transaction and checks its version table.
   Never migrate in an HTTP request.
4. Instantiate the handler with exact HTTPS web origins and native
   `https://localhost` in `allowedOrigins`. CORS is not authorization. `trustProxy`
   must be true only behind a host that overwrites the forwarded-client-IP header;
   otherwise leave it false (the safe shared anonymous IP budget).
5. Configure an actual operator support contact in the demo shell. Review reports
   and backups as operator; report storage does not imply unattended moderation.

No database connection, password, deployment or hosted migration was created by this
implementation. API health only proves process availability, not a migrated database.

## Data and authorization

- Clients generate 256-bit scoped credentials using the platform CSPRNG and persist
  them securely **before** enrollment/recovery/rotation. Server stores only SHA-256
  verifiers. Owner and guest formats and authorization are distinct.
- Each owner has one active device verifier. Recovery transactionally revokes the
  old device. Retrying a lost recovery response works with the same request ID and
  new device credential; reusing a superseded recovery operation returns conflict.
- Bodies cannot claim an existing owner. Every owner query scopes by verified
  principal; public reads expose published content and reservation IDs/mine only.
- Publication cannot be reversed by ordinary editing, and saved gifts cannot be
  removed. Archive preserves IDs; a booked gift cannot be archived. Guest writes
  and edits lock the same database transaction boundary.
- All mutations require Idempotency-Key. Keys are bound to method/path/body/version.
  Replays return current saved-list/booking state, not obsolete snapshots; owner
  receipts store only the event ID, never copies of historical gift content.
- Account deletion removes owned events, gifts, bookings, reports, and content-bearing
  receipts. A content-free deletion receipt and credential tombstones prevent unsafe
  retry/re-enrollment for 30 days. Nothing silently restores a deleted account.
- Operation receipts, report rows, retired-credential hashes and moderation audit
  hashes are pruned after 30 days. Ordinary data is retained until explicit deletion.
  Demo closure requires deleting the demo database/backups under the chosen provider's
  actual retention rules; this source does not assert provider backup erasure timing.

## Abuse/capacity bounds

JSON: 256 KiB and 10-second total streaming deadline. Invalid/slow bodies fail without
writes. Request authorization/rate limits live in PostgreSQL, not process memory.
Per minute: writes global1200/IP120/owner90/guest30/event240; reads global2400/IP600/
owner300; new-owner attempts5/IP, recovery10/IP, reports5/IP. Read/write buckets are
separate. Rejected endpoint operations consume their scoped budgets. Limits are
bounded demo defaults, not a claim of a production abuse-defense service.

Storage caps: 100 owners, 200 total lists, 30 lists per owner, 100 gifts per list,
500 pending reports, 20,000 operation receipts. Once reached, requests fail honestly
with 429 rather than invoking any paid plan. An operator may delete synthetic data;
no automatic billing or paid-resource provisioning is implemented. Free-provider
resource accounting and shutdown limits must still be verified independently.

A single database-row mutex serializes bounded demo operations across serverless
instances. This is intentionally simple and correct at small scale. A later paid
host can replace it with consistent owner/event keyed locks after equivalent
multi-connection concurrency tests; database portability does not require that change.

## Operator report handling

Only an operator with the server database credential can run these commands. Never
place them in a public route or mobile bundle. The caller must already have authority
to inspect reports or remove content; this README is not that authorization.

```
node --import tsx services/api/src/moderate.ts list-reports
node --import tsx services/api/src/moderate.ts resolve-report EXACT_REPORT_ID --confirm
node --import tsx services/api/src/moderate.ts remove-list EXACT_EVENT_ID --confirm
```

`remove-list` actually deletes that event and its gifts/reservations/reports, removes
cached operation results, and records only a SHA-256 event-ID audit hash. Existing
public links then return404. It is deliberately irreversible; review the report and
exact ID first. It does not grant the reporter any deletion privilege.

## Tests

`node --import tsx --test services/api/tests/*.test.ts`

Tests create only disposable in-memory PGlite databases, with real SQL constraints,
transactions and triggers. PGlite serializes transactions; this proves deterministic
race orderings and invariants, not live multi-connection server/network behavior.
The deployment gate additionally runs isolated PostgreSQL17/Neon two-client races.

The opt-in real-PostgreSQL runner is `services/api/tests/postgres-acceptance.ts`.
It requires `GIFT_ACCEPTANCE_ISOLATED=yes` and server-only `DATABASE_URL`, mutates
only newly generated synthetic owners, and deletes those owners in `finally`.
It must not be run without operator authorization for that exact isolated database.
