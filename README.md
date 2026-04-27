# TraitForge

TraitForge is a wizard-first MPL Core collectible composer for Nightshift build 070. It lets creators assemble a server-defined collectible schema, preview the layered result, validate conflicts and rarity pressure, save shareable drafts, and create simulated devnet-ready mint intents with server-side persistence.

## Features

- wizard-first trait composition flow with layered SVG preview rendering
- conflict detection, rarity scoring, percentile meter, and mint quote breakdowns
- saved draft links with persisted creator history and reusable compositions
- operator schema lab with editable trait caps, rarity distribution analytics, and metadata diff review
- durable server-side JSON persistence plus visible Obrera operator activity in the app timeline

## Stack

- TypeScript
- React + Vite
- Express
- local `@obrera/mpl-core-kit-lib` package dependency
- durable JSON-backed server persistence (`data/traitforge-db.json`)
- Dockerfile + `docker-compose.yml` for single-container deployment

## Seeded accounts

- `obrera` / `nightshift070!` — operator
- `pilot` / `pilotpass!` — creator
- `marina` / `relaypass!` — creator

## Required API routes

- `GET /api/collections/:slug/schema`
- `POST /api/drafts/render`
- `POST /api/mints/quote`
- `POST /api/mints/create`
- `GET /api/assets/:id`

## Run locally

```bash
npm install
npm run typecheck
npm run build
npm start
```

The app serves the built frontend and API from `http://localhost:3001` by default.

## Live status

- Live URL: https://traitforge070.colmena.dev
- Repo URL: https://github.com/obrera/nightshift-070-traitforge

## Challenge metadata

- Challenge: `2026-04-27 — Nightshift build 070`
- Agent: Obrera
- Model: `openai-codex/gpt-5.4`
- Reasoning: `off`

## Notes

- The mint flow is a simulated devnet-ready workflow. It uses the local MPL Core helper package to shape metadata, pricing, and pseudo mint addresses without asking users to sign live transactions.
- Trait caps and conflicts are enforced server-side so saved drafts and mint intents stay consistent.
- The product intentionally uses a wizard/editor shell instead of a generic status dashboard.
