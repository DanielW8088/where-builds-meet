# Yunshen engine service

This fork powers the graduation calculator on <https://yunshen.org>. It tracks upstream `main` unchanged and adds only
`service/`: the calculation engine bundled as an internal HTTP service. Nothing else in the tree is modified, so upstream
merges stay conflict-free.

- `service/engine.ts`: evaluates a JSON character (DPS, graduation rate, sheet, damage breakdown) and its comparisons
  (stat, attunement, Inner Way and setup gains), using the same calculation entry points as the web application.
- `service/catalog.ts`: what a character editor can choose (paths, gear affixes and maximum rolls, sets, Inner Ways, food,
  scripts, Divinecraft, global buffs) with Simplified Chinese names.
- `service/i18n.ts`: Simplified Chinese names derived from the Traditional Chinese catalog with OpenCC;
  `service/glossary.json` overrides individual keys.
- `service/server.ts`, `service/worker.ts`: HTTP routes, a worker-thread pool and a result cache.

Build and run:

```bash
npm ci
npm install --no-save opencc-js@1.0.5
npx tsc -p service/tsconfig.json --noEmit
npx vite build --config service/vite.config.ts
ENGINE_PORT=4100 node service/dist/server.mjs
```

Routes: `GET /health`, `GET /v1/catalog`, `GET /v1/presets/:presetId?breakthrough=18`, `POST /v1/evaluate { input }`,
`POST /v1/compare { input, categories? }`.
