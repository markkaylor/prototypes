/** PROTOTYPE. Main-thread side of the Whisper worker: loading state, and one call to transcribe a clip. */
import { useSyncExternalStore } from "react"

export type ModelState =
  | { status: "idle" }
  | { status: "loading"; progress: number } // 0–1, across all the files
  | { status: "ready"; device: string }
  | { status: "error"; error: string }

const SEEN = "mr-nome:whisper-downloaded"
let state: ModelState = { status: "idle" }
const listeners = new Set<() => void>()
const set = (s: ModelState) => { state = s; listeners.forEach((l) => l()) }
export const useWhisper = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => state)

let worker: Worker | null = null
const files = new Map<string, { loaded: number; total: number }>()
const waiting = new Map<number, { resolve(t: string): void; reject(e: Error): void }>()
let nextId = 0

function getWorker() {
  if (worker) return worker
  worker = new Worker(new URL("./whisper.worker.ts", import.meta.url), { type: "module" })
  worker.onmessage = ({ data }) => {
    if (data.type === "progress") {
      const p = data.p as { status: string; file?: string; loaded?: number; total?: number }
      if (p.status !== "progress" || !p.file || !p.total) return
      files.set(p.file, { loaded: p.loaded ?? 0, total: p.total })
      let loaded = 0, total = 0
      files.forEach((f) => { loaded += f.loaded; total += f.total })
      set({ status: "loading", progress: total ? loaded / total : 0 })
    } else if (data.type === "ready") {
      try { localStorage.setItem(SEEN, "1") } catch { /* fine */ }
      set({ status: "ready", device: data.device })
    } else if (data.type === "text") {
      waiting.get(data.id)?.resolve(data.text); waiting.delete(data.id)
    } else if (data.type === "error") {
      if (data.id !== undefined) { waiting.get(data.id)?.reject(new Error(data.error)); waiting.delete(data.id) }
      set({ status: "error", error: data.error })
    }
  }
  return worker
}

/** Start downloading/compiling the model. Safe to call repeatedly. */
export function loadWhisper() {
  if (state.status === "loading" || state.status === "ready") return
  set({ status: "loading", progress: 0 })
  getWorker().postMessage({ type: "load" })
}

/** Whether this browser already has the weights cached, so loading at startup costs no download. */
export const downloadedBefore = () => { try { return localStorage.getItem(SEEN) === "1" } catch { return false } }

/** Transcribe 16 kHz mono audio. Waits for the model if it's still loading. */
export function transcribe(audio: Float32Array): Promise<string> {
  loadWhisper()
  const id = nextId++
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject })
    getWorker().postMessage({ type: "transcribe", id, audio }, [audio.buffer])
  })
}
