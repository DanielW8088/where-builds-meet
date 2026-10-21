// Bundles the engine service for Node: `npx vite build --config service/vite.config.ts`.
// The output in service/dist has no dependencies; run it with `node service/dist/server.mjs`.
import { fileURLToPath } from "node:url"

import { defineConfig } from "vite"

import { alias } from "../aliases.js"

export default defineConfig({
  root: fileURLToPath(new URL("..", import.meta.url)),
  resolve: { alias },
  publicDir: false,
  logLevel: "warn",
  ssr: { noExternal: true, target: "node" },
  build: {
    ssr: true,
    target: "node24",
    outDir: "service/dist",
    emptyOutDir: true,
    rolldownOptions: {
      input: { server: "service/server.ts", worker: "service/worker.ts" },
      output: { format: "es", entryFileNames: "[name].mjs", chunkFileNames: "chunks/[name]-[hash].mjs" },
    },
  },
})
