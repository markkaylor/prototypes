/**
 * PROTOTYPE. The routine as a list of blocks: each block is one step with its own fields.
 * A repeat block loops back to a block above it (`from`), so its bracket survives edits and moves.
 * Kept in localStorage so a routine survives a reload while testing.
 */
import { useSyncExternalStore } from "react"
import { compile, type Program } from "./engine"
import { isTimed, type Step, type Sub } from "./steps"

export type Unit = "beats" | "bars"
export type RepeatMode = "times" | "until" | "forever"
export type BlockBody =
  | { kind: "tempo"; bpm: number }
  | { kind: "tempoBy"; delta: number }
  | { kind: "tempoMul"; factor: number }
  | { kind: "meter"; beats: number; unit: number }
  | { kind: "accent"; beats: number[] }
  | { kind: "sub"; sub: Sub }
  | { kind: "countIn"; n: number; unit: Unit }
  | { kind: "play"; n: number; unit: Unit; muted: boolean }
  /** `from`: the id of the first block in the loop; null = the default (after the last count-in or loop). */
  | { kind: "repeat"; mode: RepeatMode; times: number; until: number; from: string | null }
export type Block = { id: string } & BlockBody
export type Kind = Block["kind"]

const KEY = "mr-nome:blocks"
const KINDS: Kind[] = ["tempo", "tempoBy", "tempoMul", "meter", "accent", "sub", "countIn", "play", "repeat"]
const newId = () => crypto.randomUUID()

function load(): Block[] {
  try {
    // blocks of kinds this build doesn't have (typed text, from another version) are dropped
    const saved: Block[] = JSON.parse(localStorage.getItem(KEY) ?? "[]")
    return saved.filter((b) => KINDS.includes(b.kind))
  } catch { return [] }
}
let blocks: Block[] = load()
const listeners = new Set<() => void>()
const commit = (next: Block[]) => {
  blocks = next
  try { localStorage.setItem(KEY, JSON.stringify(blocks)) } catch { /* memory only */ }
  listeners.forEach((l) => l())
}
export const getBlocks = () => blocks
export const useBlocks = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => blocks)

/** The meter in force just before index i, for the accent toggles. */
export function meterBefore(list: Block[], i: number): number {
  for (let j = i - 1; j >= 0; j--) { const b = list[j]; if (b.kind === "meter") return b.beats }
  return 4
}

/* ---------- edits ---------- */

const DEFAULTS: Record<Kind, () => BlockBody> = {
  tempo: () => ({ kind: "tempo", bpm: 60 }),
  tempoBy: () => ({ kind: "tempoBy", delta: 10 }),
  tempoMul: () => ({ kind: "tempoMul", factor: 2 }),
  meter: () => ({ kind: "meter", beats: 3, unit: 4 }),
  accent: () => ({ kind: "accent", beats: [1] }),
  sub: () => ({ kind: "sub", sub: 2 }),
  countIn: () => ({ kind: "countIn", n: 4, unit: "beats" }),
  play: () => ({ kind: "play", n: 4, unit: "bars", muted: false }),
  repeat: () => blocks.some((b) => b.kind === "tempoBy")
    ? { kind: "repeat", mode: "until", times: 2, until: 120, from: null }
    : { kind: "repeat", mode: "times", times: 2, until: 120, from: null },
}
export function addBlock(kind: Kind, extra?: Partial<BlockBody>) {
  commit([...blocks, { id: newId(), ...DEFAULTS[kind](), ...extra } as Block])
}

/** Replace a block's body but keep its id (and so its place in any loop). */
export const setBody = (id: string, body: BlockBody) =>
  commit(blocks.map((b) => (b.id === id ? ({ id, ...body } as Block) : b)))

export const updateBlock = (id: string, patch: Partial<BlockBody>) =>
  commit(blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as Block) : b)))

/** Delete a block. A repeat that looped back to it now loops back to the block that took its place. */
export function removeBlock(id: string) {
  const i = blocks.findIndex((b) => b.id === id)
  if (i < 0) return
  const next = blocks.filter((b) => b.id !== id)
  const heir = next[i]?.id ?? null
  commit(next.map((b) => (b.kind === "repeat" && b.from === id ? { ...b, from: heir === b.id ? null : heir } : b)))
}
export const removeAt = (n: number) => { const b = blocks[n - 1]; if (b) removeBlock(b.id) }
export const removeLast = () => removeAt(blocks.length)
export const clearBlocks = () => commit([])

/** Move a block to position `to` (0-based, in the list without it). */
export function moveBlock(id: string, to: number) {
  const b = blocks.find((x) => x.id === id)
  if (!b) return
  const rest = blocks.filter((x) => x.id !== id)
  to = Math.max(0, Math.min(rest.length, to))
  commit([...rest.slice(0, to), b, ...rest.slice(to)])
}

/** Tempo 60, count in, click 8 beats, speed up 10, repeat from the count-in until 120. */
export function loadExample() {
  const countIn = newId()
  commit([
    { id: newId(), kind: "tempo", bpm: 60 },
    { id: countIn, kind: "countIn", n: 4, unit: "beats" },
    { id: newId(), kind: "play", n: 8, unit: "beats", muted: false },
    { id: newId(), kind: "tempoBy", delta: 10 },
    { id: newId(), kind: "repeat", mode: "until", times: 2, until: 120, from: countIn },
  ])
}

/* ---------- how the routine ends ---------- */

/** After the last block: keep clicking at the final settings, or stop. */
export type End = "continue" | "stop"
const END_KEY = "mr-nome:end"
let end: End = (() => { try { return localStorage.getItem(END_KEY) === "stop" ? "stop" : "continue" } catch { return "continue" } })()
const endListeners = new Set<() => void>()
export const getEnd = () => end
export const useEnd = () => useSyncExternalStore((l) => { endListeners.add(l); return () => endListeners.delete(l) }, () => end)
export function setEnd(next: End) {
  end = next
  try { localStorage.setItem(END_KEY, next) } catch { /* memory only */ }
  endListeners.forEach((l) => l())
}

/* ---------- compile ---------- */

export type Compiled = {
  program: Program
  /** Which block (0-based) each compiled step came from, for the playhead. */
  blockOf: Map<Step, number>
  /** For each repeat block (0-based): the block its loop starts at. */
  loops: Map<number, number>
  /** True when nothing in the routine takes time: with "then stop" it plays nothing. */
  open: boolean
  /** Repeat blocks with an "until" that can never be reached: nothing in the loop changes the tempo. */
  endless: Set<number>
}

export function compileBlocks(list: Block[], ending: End = "stop"): Compiled {
  const steps: Step[] = []
  const blockOf = new Map<Step, number>()
  const stepOf = new Map<string, Step>()
  list.forEach((b, i) => {
    const s = toStep(b)
    steps.push(s); blockOf.set(s, i); stepOf.set(b.id, s)
  })
  // link repeats to the step they loop back to (a block that's been moved below its repeat doesn't count)
  for (const b of list) if (b.kind === "repeat" && b.from) {
    const s = stepOf.get(b.id) as Step & { kind: "repeat" }
    const from = stepOf.get(b.from)
    if (from && steps.indexOf(from) < steps.indexOf(s)) s.from = from
  }
  const open = !steps.some(isTimed)
  // a start at the end means "keep clicking"
  const program = compile(ending === "continue" ? [...steps, { kind: "start" }] : steps)
  const loops = new Map<number, number>()
  for (const [r, from] of Object.entries(program.loopStart)) {
    const a = blockOf.get(program.steps[from]), z = blockOf.get(program.steps[+r])
    if (a !== undefined && z !== undefined) loops.set(z, a)
  }
  const endless = new Set<number>()
  const changesTempo = new Set(Object.values(program.target).map((t) => t.repeat))
  program.steps.forEach((s, i) => {
    if (s.kind === "repeat" && s.until && !changesTempo.has(i)) endless.add(blockOf.get(s) ?? -1)
  })
  return { program, blockOf, loops, open, endless }
}

function toStep(b: Block): Step {
  switch (b.kind) {
    case "tempo": return { kind: "tempo", bpm: b.bpm }
    case "tempoBy": return { kind: "tempoBy", delta: b.delta }
    case "tempoMul": return { kind: "tempoMul", factor: b.factor }
    case "meter": return { kind: "meter", meter: { beats: b.beats, unit: b.unit } }
    case "accent": return { kind: "accent", beats: [...b.beats].sort((x, y) => x - y) }
    case "sub": return { kind: "sub", sub: b.sub }
    case "countIn": return { kind: "countIn", n: b.n, unit: b.unit }
    case "play": return { kind: "play", n: b.n, unit: b.unit, ...(b.muted ? { muted: true } : {}) }
    case "repeat":
      return b.mode === "until" ? { kind: "repeat", until: b.until } : b.mode === "times" ? { kind: "repeat", times: b.times } : { kind: "repeat" }
  }
}
