// Simplified Chinese display names for the service, derived from the Traditional Chinese catalog the
// application ships. English is the fallback, the same way the application falls back.
import * as OpenCC from "opencc-js"

import english from "../public/locales/en.json"
import traditional from "../public/locales/zh-Hant.json"
import glossary from "./glossary.json"

const toSimplified = OpenCC.Converter({ from: "tw", to: "cn" })
// `replace` fixes wording the upstream catalog gets wrong (such as 木椿 for 木樁) wherever it appears;
// `keys` overrides whole entries.
const { keys: keyOverrides, replace } = glossary as { keys: Record<string, string>; replace: Record<string, string> }
const convert = (value: string) =>
  Object.entries(replace).reduce((text, [wrong, right]) => text.replaceAll(wrong, right), toSimplified(value))
const englishMessages = english as Record<string, string>
const simplified: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(traditional as Record<string, string>).map(([key, value]) => [key, convert(value)]),
  ),
  ...keyOverrides,
}

// The application's `gameText`: an English game name resolves through whichever key carries it.
const gameNames = new Map<string, string>(
  Object.entries(englishMessages)
    .filter(([key]) => /^(data|stat|system|game\.event)\./.test(key))
    .map(([key, name]) => [name, simplified[key] ?? name]),
)

export function hasText(key: string) {
  return key in simplified
}

export function text(key: string, fallback?: string) {
  return simplified[key] ?? englishMessages[key] ?? fallback ?? key
}

export function gameText(name: string | undefined) {
  if (!name) return ""
  return gameNames.get(name) ?? name
}
