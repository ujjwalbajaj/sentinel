# SENTINEL

Next.js console for the SENTINEL exploit shield. Chains are Base (8453) and BNB Chain (56).

## Run against the backend

```bash
npm install
copy .env.example .env.local
npm run dev
```

Open http://localhost:3000.

| Variable | Where it is used |
| --- | --- |
| `NOWNODES_API_KEY` | Server only. `/api/rpc/base` and `/api/rpc/bsc` forward reads to NOWNodes. Do not prefix it with `NEXT_PUBLIC_`. |
| `NEXT_PUBLIC_BASE_RPC` / `NEXT_PUBLIC_BSC_RPC` | Optional browser RPC URLs. When unset, the app uses the proxy above. |
| `NEXT_PUBLIC_API_URL` | REST origin, no trailing slash. |
| `NEXT_PUBLIC_WS_URL` | socket.io origin. The client connects to the `/live` namespace. |
| `NEXT_PUBLIC_DEMO` | `true` shows the demo console. |
| `NEXT_PUBLIC_DEMO_TOKEN` | Sent as `x-demo-token` on `/demo/:chainId/...` only. |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect. Injected wallets still connect without it. |

Restart `npm run dev` after changing `.env.local`.

## What the UI calls

Wallet sign-in: `GET /auth/nonce`, `POST /auth/verify`, `POST /auth/profile`, `GET /auth/me`.

Onboarding: `POST /protocols` returns the Guardian address and whether the connected wallet is the vault admin. The wallet then sends `grantRole(PAUSER_ROLE, guardian)` and `guardian.registerVault(vault)`.

Console data: `GET /stats`, `/protocols`, `/activity`, `/incidents`, `/incidents/:id`. Live events on `/live`: `chain:status`, `activity:new`, `protocol:updated`, `incident:detected`, `incident:paused`, `incident:strike_reverted`, `incident:cre_timeout`.

Demo console (`NEXT_PUBLIC_DEMO=true`): `POST /demo/8453|56/fund|allowlist|deploy|probe|strike|withdraw|reset` and `GET /demo/:chainId/balances`.

Contract ABIs live in `src/shared/abi`. Deployment files in `src/shared/deployments/8453.json` and `56.json` are the sync point for Guardian and Forwarder addresses from the contracts repo. Onboarding uses the Guardian address returned by the backend.

Numbers on Overview, incidents, and the demo console come from those APIs. If the backend is down, the console shows that instead of sample totals.
