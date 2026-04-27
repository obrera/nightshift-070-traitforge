# TraitForge

TraitForge is a wizard-first MPL Core collectible composer for Nightshift build 070. Creators compose traits from a server-authored schema, preview the layered SVG, save drafts, and submit real Solana devnet MPL Core mints through a server custodial signer.

## Features

- wizard-driven trait composition with live layered SVG rendering
- server-side conflict checks, rarity scoring, percentile reporting, and quote breakdowns
- saved draft links with persisted preview assets
- real devnet MPL Core minting to a user-supplied recipient wallet address
- lazy on-chain collection creation per TraitForge collection schema, then reuse on later mints
- public metadata JSON and SVG preview routes for both collections and minted assets
- persisted mint history with asset address, signature, recipient owner, collection address, and explorer links
- operator schema lab with editable caps, analytics, and metadata diff inspection

## Stack

- TypeScript
- React + Vite
- Express
- `@solana/kit`
- local `@obrera/mpl-core-kit-lib` from `../mpl-core-kit-lib`
- durable JSON-backed persistence in `data/traitforge-db.json`

## Seeded accounts

- `obrera` / `nightshift070!` — operator
- `pilot` / `pilotpass!` — creator
- `marina` / `relaypass!` — creator

## Devnet minting config

Real minting requires these environment variables:

```bash
export TRAITFORGE_PUBLIC_BASE_URL="https://your-app.example.com"
export TRAITFORGE_DEVNET_SIGNER_KEYPAIR="/absolute/path/to/devnet-keypair.json"
```

`TRAITFORGE_PUBLIC_BASE_URL` must be the stable public origin that will serve:

- `/api/collections/:slug/metadata.json`
- `/api/collections/:slug/preview.svg`
- `/api/assets/:id/metadata.json`
- `/api/assets/:id/preview.svg`

`TRAITFORGE_DEVNET_SIGNER_KEYPAIR` may be:

- a path to a Solana keypair JSON file such as `~/.config/solana/id.json`
- a raw 64-byte JSON array
- a comma-separated 64-byte list
- a `base64:<value>` string

Optional overrides:

```bash
export TRAITFORGE_DEVNET_RPC_URL="https://api.devnet.solana.com"
export TRAITFORGE_DEVNET_WS_URL="wss://api.devnet.solana.com"
export TRAITFORGE_DATA_PATH="/custom/path/traitforge-db.json"
```

If the signer is underfunded, the mint route fails with a balance error that includes the current SOL balance and the rough amount needed. When the app is running locally against devnet, the server also attempts a lightweight devnet airdrop before failing.

## Run locally

```bash
npm install
npm run typecheck
npm run build
npm start
```

Default server URL:

- `http://localhost:3001`

For local real minting, set:

```bash
export TRAITFORGE_PUBLIC_BASE_URL="http://localhost:3001"
export TRAITFORGE_DEVNET_SIGNER_KEYPAIR="$HOME/.config/solana/devnet.json"
```

## API surface

- `GET /api/bootstrap`
- `GET /api/collections/:slug/schema`
- `GET /api/collections/:slug/metadata.json`
- `GET /api/collections/:slug/preview.svg`
- `POST /api/drafts/render`
- `POST /api/drafts`
- `POST /api/mints/quote`
- `POST /api/mints/create`
- `GET /api/assets/:id`
- `GET /api/assets/:id/metadata.json`
- `GET /api/assets/:id/preview.svg`

## Notes

- The client login UX is still seeded/local; only the mint execution moved on-chain.
- The server never uses `@solana/web3.js`; minting is built with `@solana/kit` plus the local `@obrera/mpl-core-kit-lib`.
- Existing legacy simulated mint records are migrated away on load so the app state only keeps real mint records going forward.
