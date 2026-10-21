// One calculation at a time, off the server's event loop.
import { parentPort } from "node:worker_threads"

import { compare, evaluate, InputError, presetBuild, type CharacterInput, type CompareCategory } from "./engine"

export type WorkerRequest =
  | { id: number; op: "evaluate"; payload: { input: CharacterInput } }
  | { id: number; op: "compare"; payload: { input: CharacterInput; categories?: CompareCategory[] } }
  | { id: number; op: "preset"; payload: { presetId: string; breakthrough?: string } }

export type WorkerResponse =
  | { id: number; result: unknown }
  | { id: number; error: { message: string; input: boolean } }

function run(request: WorkerRequest) {
  switch (request.op) {
    case "evaluate":
      return evaluate(request.payload.input)
    case "compare":
      return compare(request.payload.input, request.payload.categories)
    case "preset":
      return presetBuild(request.payload.presetId, request.payload.breakthrough)
  }
}

parentPort?.on("message", (request: WorkerRequest) => {
  let response: WorkerResponse
  try {
    response = { id: request.id, result: run(request) }
  } catch (error) {
    response = {
      id: request.id,
      error: {
        message: error instanceof Error ? error.message : String(error),
        // Anything thrown while resolving a malformed character is the caller's mistake.
        input: error instanceof InputError || error instanceof TypeError,
      },
    }
  }
  parentPort?.postMessage(response)
})
