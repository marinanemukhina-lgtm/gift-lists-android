# Disposable integrated browser preview — dev/test only

`npm run dev -- --host 127.0.0.1 --port PORT --strictPort` is compatible with the existing managed preview daemon. This command does not launch a browser. HMR is deliberately disabled for the managed proxy: reload manually after a reviewed source change; no WebSocket is required. Root starts it only via the approved daemon.

This Vite **serve-only** plugin mounts the exact production Request/Response API on `/api/v1` and uses real file-backed PGlite/PostgreSQL semantics. The shared UI, browser credential store and HTTP client are unchanged. There is no mock identity, fake response, imported legacy data or demonstration seed.

- Default disposable data: `.preview-data/gifts/` (ignored by Git).
- `PREVIEW_DB_DIR`: a separate writable test directory when needed.
- `PREVIEW_ALLOWED_ORIGINS`: comma-separated exact public preview origins if a managed proxy rewrites Host. Default permits only matching request Host HTTP/HTTPS; it does not echo arbitrary Origin.
- No `DATABASE_URL` is read here. No real Neon credentials are required or used.
- Data survives dev server restart. Delete only the specifically authorized disposable directory to reset; never point it at unrelated files.

Production remains `npm run build:web` / `npm start`, standard `pg` and required server-only `DATABASE_URL`. `apps/web` does not import this tool and never falls back to PGlite or local files. This preview is not a deployable production storage architecture.
