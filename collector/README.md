# League Plus 24/7 collector

Cloudflare Worker + D1 + cron. It polls the League Plus feed every minute, stores every
finished round, and serves snapshots to the hosted League Plus dashboard. It also acts as
the CORS relay, so one deployment can replace `proxy/worker.js`.

Full instructions are in [`../README.md`](../README.md#2b-247-league-plus-collector-optional).

## Quick start

```bash
npm.cmd install
npx.cmd wrangler login
npx.cmd wrangler d1 create bet9ja-collector
# copy the database_id into wrangler.toml
npx.cmd wrangler d1 migrations apply bet9ja-collector --remote
npx.cmd wrangler deploy
```

(On macOS/Linux use plain `npm` / `npx`.)

Check:

```
https://YOUR-WORKER.workers.dev/api/lp/status
```

Then paste that Worker URL into the site's **Connect live capture** pill. The League Plus
header changes to **24/7 collector**.

## Local

```bash
npm.cmd install
npx.cmd wrangler d1 migrations apply bet9ja-collector --local
npm.cmd run dev
```

In another terminal:

```bash
curl "http://127.0.0.1:8788/__scheduled?cron=*+*+*+*+*"
curl "http://127.0.0.1:8788/api/lp/status"
```

Use `http://127.0.0.1:8788` as the relay URL while testing.

## Notes

- Cron: `* * * * *` (see `wrangler.toml`). A round finishes roughly every 6 minutes, so a
  minute cadence catches all of them. More than ~6 minutes of downtime can miss a round.
- Retention: 30 days (`collect.js`). Well inside D1's free 5 GB.
- The API is public and read-only; it exposes the same public Bet9ja data.
- If `lastError` appears in `/api/lp/status`, Bet9ja/Akamai refused Cloudflare's egress.
  The site falls back to browser capture when it cannot detect a collector.
