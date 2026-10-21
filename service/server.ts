// HTTP front of the calculation engine for yunshen.org. Internal only: it is reached over the
// compose network by the Next.js app, never published to the internet.
//
//   GET  /health
//   GET  /v1/catalog
//   GET  /v1/presets/:presetId?breakthrough=18
//   POST /v1/evaluate   { input }                 -> DPS, graduation, sheet, breakdown
//   POST /v1/compare    { input, categories? }    -> stat / attunement / inner way / setup gains
import { createHash } from "node:crypto"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { availableParallelism } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Worker } from "node:worker_threads"

import { buildCatalog } from "./catalog"
import type { CharacterInput, CompareCategory } from "./engine"
import type { WorkerRequest, WorkerResponse } from "./worker"

const compareCategories = new Set<unknown>(["statPriority", "attunementPriority", "innerWays", "setup"])

const port = Number(process.env.ENGINE_PORT ?? 4100)
const host = process.env.ENGINE_HOST ?? "127.0.0.1"
const engineVersion = process.env.ENGINE_VERSION ?? "dev"
const workerCount = Math.max(1, Number(process.env.ENGINE_WORKERS ?? availableParallelism() - 1))
const taskTimeoutMs = Number(process.env.ENGINE_TASK_TIMEOUT_MS ?? 120_000)
const cacheLimit = Number(process.env.ENGINE_CACHE_ENTRIES ?? 500)
const bodyLimit = 512 * 1024
const workerFile = path.join(path.dirname(fileURLToPath(import.meta.url)), "worker.mjs")

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

type Task = { request: Omit<WorkerRequest, "id">; resolve: (value: unknown) => void; reject: (error: Error) => void }

type Slot = { worker: Worker; task?: Task & { id: number; timer: NodeJS.Timeout } }

let nextTaskId = 1
const queue: Task[] = []
const slots: Slot[] = []

function spawn(index: number) {
  const worker = new Worker(workerFile)
  const slot: Slot = { worker }
  slots[index] = slot
  worker.on("message", (response: WorkerResponse) => {
    const task = slot.task
    if (!task || task.id !== response.id) return
    clearTimeout(task.timer)
    slot.task = undefined
    if ("error" in response) task.reject(new HttpError(response.error.input ? 400 : 500, response.error.message))
    else task.resolve(response.result)
    drain()
  })
  worker.on("error", error => console.error(`[engine] worker ${index} failed`, error))
  worker.on("exit", () => {
    if (slots[index] !== slot) return
    const task = slot.task
    if (task) {
      clearTimeout(task.timer)
      task.reject(new HttpError(500, "The calculation worker stopped."))
    }
    spawn(index)
    drain()
  })
}

function drain() {
  for (const slot of slots) {
    if (slot.task || !queue.length) continue
    const task = queue.shift()!
    const id = nextTaskId++
    const timer = setTimeout(() => {
      // A runaway calculation is not interruptible inside the worker, so the worker is replaced.
      slot.task = undefined
      task.reject(new HttpError(504, "The calculation took too long."))
      void slot.worker.terminate()
    }, taskTimeoutMs)
    slot.task = { ...task, id, timer }
    slot.worker.postMessage({ ...task.request, id })
  }
}

function runTask(request: Omit<WorkerRequest, "id">) {
  return new Promise<unknown>((resolve, reject) => {
    queue.push({ request, resolve, reject })
    drain()
  })
}

// Identical requests share one result: the cache answers repeats, and a request already being
// calculated is joined rather than queued again.
const cache = new Map<string, unknown>()
const inFlight = new Map<string, Promise<unknown>>()

function cached(request: Omit<WorkerRequest, "id">) {
  const key = createHash("sha256")
    .update(JSON.stringify([request.op, request.payload]))
    .digest("hex")
  if (cache.has(key)) {
    const value = cache.get(key)
    cache.delete(key)
    cache.set(key, value)
    return Promise.resolve(value)
  }
  const pending = inFlight.get(key)
  if (pending) return pending
  const promise = runTask(request)
    .then(value => {
      cache.set(key, value)
      if (cache.size > cacheLimit) cache.delete(cache.keys().next().value!)
      return value
    })
    .finally(() => inFlight.delete(key))
  inFlight.set(key, promise)
  return promise
}

async function readJson(request: IncomingMessage) {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    size += (chunk as Buffer).length
    if (size > bodyLimit) throw new HttpError(413, "Request body is too large.")
    chunks.push(chunk as Buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>
  } catch {
    throw new HttpError(400, "Request body is not JSON.")
  }
}

function requireCharacter(body: Record<string, unknown>) {
  const input = body.input
  if (!input || typeof input !== "object" || typeof (input as { pathId?: unknown }).pathId !== "string")
    throw new HttpError(400, "Expected { input: { pathId, ... } }.")
  return input as CharacterInput
}

function requireCategories(body: Record<string, unknown>) {
  if (body.categories === undefined) return undefined
  if (!Array.isArray(body.categories) || body.categories.some(category => !compareCategories.has(category)))
    throw new HttpError(400, `categories must be a subset of ${[...compareCategories].join(", ")}.`)
  return body.categories as CompareCategory[]
}

let catalogJson: string | undefined

async function route(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? "/", "http://engine")
  const send = (status: number, body: unknown) => {
    const json = typeof body === "string" ? body : JSON.stringify(body)
    response.writeHead(status, { "content-type": "application/json; charset=utf-8", "x-engine-version": engineVersion })
    response.end(json)
  }

  if (request.method === "GET" && url.pathname === "/health")
    return send(200, { ok: true, version: engineVersion, workers: slots.length, queued: queue.length })
  if (request.method === "GET" && url.pathname === "/v1/catalog") {
    catalogJson ??= JSON.stringify(buildCatalog(engineVersion))
    return send(200, catalogJson)
  }
  const preset = url.pathname.match(/^\/v1\/presets\/([\w-]+)$/)
  if (request.method === "GET" && preset) {
    const breakthrough = url.searchParams.get("breakthrough") ?? undefined
    return send(200, await cached({ op: "preset", payload: { presetId: preset[1], breakthrough } }))
  }
  if (request.method === "POST" && url.pathname === "/v1/evaluate") {
    const body = await readJson(request)
    return send(200, await cached({ op: "evaluate", payload: { input: requireCharacter(body) } }))
  }
  if (request.method === "POST" && url.pathname === "/v1/compare") {
    const body = await readJson(request)
    const payload = { input: requireCharacter(body), categories: requireCategories(body) }
    return send(200, await cached({ op: "compare", payload }))
  }
  throw new HttpError(404, "Not found.")
}

for (let index = 0; index < workerCount; index++) spawn(index)

createServer((request, response) => {
  route(request, response).catch((error: unknown) => {
    const status = error instanceof HttpError ? error.status : 500
    if (status >= 500) console.error("[engine]", error)
    if (!response.headersSent) response.writeHead(status, { "content-type": "application/json; charset=utf-8" })
    response.end(JSON.stringify({ error: error instanceof Error ? error.message : "Internal error." }))
  })
}).listen(port, host, () => {
  console.log(`[engine] ${engineVersion} listening on ${host}:${port} with ${workerCount} workers`)
})
