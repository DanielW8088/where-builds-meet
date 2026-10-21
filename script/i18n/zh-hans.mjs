// Derives a Simplified Chinese locale from the Traditional Chinese catalog of a production build.
// Usage: node script/i18n/zh-hans.mjs <dist directory>
// Requires `opencc-js` (installed with `npm install --no-save opencc-js@1.0.5`).
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import * as OpenCC from "opencc-js"

const distDirectory = process.argv[2]
if (!distDirectory) throw new Error("Pass the build output directory, for example dist.")

const localeDirectory = path.join(distDirectory, "locales")
const manifestFile = path.join(localeDirectory, "manifest.json")
const traditional = JSON.parse(await readFile(path.join(localeDirectory, "zh-Hant.json"), "utf8"))
const manifest = JSON.parse(await readFile(manifestFile, "utf8"))

const convert = OpenCC.Converter({ from: "tw", to: "cn" })
const simplified = Object.fromEntries(Object.entries(traditional).map(([key, message]) => [key, convert(message)]))

if (!manifest.locales.includes("zh-Hans")) manifest.locales.push("zh-Hans")
manifest.completion = { ...manifest.completion, "zh-Hans": manifest.completion?.["zh-Hant"] ?? 0 }

await writeFile(path.join(localeDirectory, "zh-Hans.json"), `${JSON.stringify(simplified, null, 2)}\n`, "utf8")
await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, "utf8")
console.log(`Wrote ${Object.keys(simplified).length} Simplified Chinese entries.`)
