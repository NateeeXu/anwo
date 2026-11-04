# Deploying 安窝 Anwo

One Node process serves the API, the WebSocket hub and the built web app; data lives in a SQLite file plus an uploads folder. That is enough for a pilot on a single small VM or a container host (Railway, Fly.io, Render, a $6 VPS).

## Required environment
| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | 32+ random bytes (`openssl rand -hex 32`); mandatory in production |
| `WEB_ORIGIN` | the public origin, e.g. `https://anwo.app` — the WebSocket hub only accepts this origin in production |
| `PORT` | `4000` (or what the host assigns) |
| `DB_PATH` / `UPLOAD_DIR` | paths on a **persistent volume** (`server/data/app.db`, `server/uploads`) |
| `GEOCODE_OFFLINE` | leave unset in production so addresses geocode through Nominatim (set `NOMINATIM_URL` + a contact User-Agent per their policy) |

## Docker
```bash
docker build -t anwo .
docker run -d -p 4000:4000 \
  -e JWT_SECRET=$(openssl rand -hex 32) -e WEB_ORIGIN=https://your.domain \
  -v anwo-data:/app/server/data -v anwo-uploads:/app/server/uploads anwo
```
Put TLS in front (Caddy, nginx, or the host's load balancer). Cookies are `Secure` in production, so sign-in only works over HTTPS.

## Without Docker
```bash
npm ci && npm run build
JWT_SECRET=... NODE_ENV=production WEB_ORIGIN=https://your.domain PORT=4000 npm run seed && npm start
```
`npm run seed` is idempotent (demo data; skip it for a clean production database by running the schema only: the server applies `schema.sql` on first start).

## Before real users
- Payments: `billing` runs a mock Stripe in test mode. Wire Stripe Checkout + Connect (delayed payouts) before charging anyone; keep the "安心付 / Secure Payment" wording and the state-by-state feature flag (see `docs/BUSINESS_PLAN.md` §8 legal checklist).
- Email/SMS: `lib/mailbox.ts` is a dev mailbox; plug in Postmark/SES and Twilio.
- ID documents: stored under `server/data/private-uploads`; set a retention/deletion job and review the BIPA notes in `docs/MARKET.md` §6.
- Backups: snapshot the SQLite file (WAL mode) and the uploads volume nightly.
- Map tiles: the web app uses OpenStreetMap tiles; for production traffic use a tile provider key (MapTiler/Stadia) per OSM's usage policy.
