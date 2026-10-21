# Yunshen build

This fork is served at <https://yunshen.org/sim/>. It tracks upstream `main` and adds:

- `script/i18n/zh-hans.mjs`: derives a Simplified Chinese catalog from the Traditional Chinese one at build time.
- `src/i18n.ts`: maps browser languages such as `zh-CN` and `zh-TW` to the `zh-Hans` and `zh-Hant` catalogs.

Build:

```bash
npm ci
npm install --no-save opencc-js@1.0.5
npx tsc -b
npx vite build --base=/sim/
node script/i18n/zh-hans.mjs dist
```
