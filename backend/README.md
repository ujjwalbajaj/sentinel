# SENTINEL

The backend watches BNB Chain (56) and Base (8453). It records evidence and hands that evidence to Chainlink CRE. CRE decides and pauses. This process does not send a pause transaction.

Contract ABIs come from `src/shared/abi/*.json`. Addresses come from `src/shared/deployments/56.json` and `8453.json`. Both are filled by the contracts repo `npm run sync`. A missing ABI file stops startup. There is no guessed fallback.

The previous testnet engine (chains 97 and 84532, full-block scanning, the in-memory desk, and the path that called `emergencyPause`) is in `archive/testnet-v0`. Docker Compose is in `archive/docker`. Neither is part of the build.

## Setup

```powershell
npm install
```

Copy `.env.example` to `.env`. Set `DATABASE_URL` to the Neon Postgres URL with `sslmode=require`, plus `NOWNODES_API_KEY`, `JWT_SECRET`, and `CRE_BIN` (the full path to the `cre` executable).

```powershell
npm run db:migrate
npm run dev
```

`GET http://127.0.0.1:8787/health` reports the database, both RPC endpoints, and the watcher state. With empty deployment addresses the watchers stay idle.

`npm run check:cre` runs `<CRE_BIN> version` and checks that `CRE_REPO_PATH` exists (default `cre/`).

`npm run check:nownodes` checks chain id, a recent block, websocket heads, and the debug tracers on both mainnets.

Demo actions are `POST /demo/:chainId/:action` with header `x-demo-token`. The only transactions this process sends are those demo actions: mixer deposit and withdraw, `setAllowlist`, Attacker deploy, `probe`, `strike(10)`, the control deposit and `withdrawAll`, and vault-admin `unpause`. See `docs/DEMO_RUNBOOK.md`.

## Deploy (read-only)

Render, Node 20. Build command: `npm ci && npx prisma generate`. Start command: `npm start` (`tsx src/index.ts`). The process listens on `PORT` (`0.0.0.0` when `PUBLIC_MODE=true`).

Required environment variables:

- `NOWNODES_API_KEY`
- `BSC_RPC`
- `BSC_WSS`
- `BASE_RPC`
- `BASE_WSS`
- `DATABASE_URL`
- `DIRECT_URL`
- `PUBLIC_MODE=true`
- `CRE_MODE=off`
- `FRONTEND_ORIGIN` (comma-separated browser origins)
- `JWT_SECRET`
- `PORT`

`PUBLIC_MODE=true` does not read `VAULT_ADMIN_PRIVATE_KEY`, `USER_PRIVATE_KEY`, or `ATTACKER_FUNDER_PRIVATE_KEY`. Demo writes (`run-attack`, `refill`, `reset`, `recycle`, `fund`, `allowlist`, `deploy`, `probe`, `strike`) and `POST /protocols` return `403` `{"error":"public read-only demo"}`. CRE is not spawned and the detector does not investigate. Chain heads (`chain:head` on socket.io `/live`), GET routes, and `/live` keep running.
