import { readdir, readFile } from "node:fs/promises"

import { expect, it } from "vitest"

import {
  buffDefinitions,
  debuffDefinitions,
  defaultEditorMaps,
  dotDefinitions,
  effectDefinitions,
} from "@/application/gameData/skills"

it.each([
  ["buff", buffDefinitions, defaultEditorMaps.Buff],
  ["debuff", debuffDefinitions, defaultEditorMaps.Debuff],
  ["dot", dotDefinitions, defaultEditorMaps.DOT],
] as const)("registers every %s file once for the worker and editor", async (folder, definitions, editor) => {
  const files = (await readdir(`data/${folder}`)).filter(file => file.endsWith(".json"))
  const ids = (
    await Promise.all(
      files.map(async file => Object.keys(JSON.parse(await readFile(`data/${folder}/${file}`, "utf8")))),
    )
  ).flat()
  expect(Object.keys(definitions).sort()).toEqual(ids.sort())
  for (const [id, definition] of Object.entries(definitions)) {
    expect(effectDefinitions[id]).toBe(definition)
    const editorDefinition = folder === "buff" && definition.global ? undefined : definition
    expect(editor[id]).toBe(editorDefinition)
  }
})
