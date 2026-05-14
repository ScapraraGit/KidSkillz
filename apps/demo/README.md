# @chorechampz/demo

Generates `apps/web/public/demo.gif` for the landing-page hero.

## Prereqs

- `gifski` on PATH (`scoop install gifski` or `cargo install gifski`)
- API + web running locally (`pnpm dev` from repo root)
- Seeded data (default `dad@example.com / password123`)

## Run

```sh
pnpm install
pnpm exec playwright install chromium   # first time only
pnpm all
```

`pnpm all` records 20s of screenshots into `frames/` then encodes them to `apps/web/public/demo.gif`.

Override target host:

```sh
DEMO_BASE_URL=https://chorechampzweb-production.up.railway.app pnpm record
```
