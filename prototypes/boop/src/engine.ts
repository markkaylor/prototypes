/**
 * PROTOTYPE. Web Audio playback for the grid. Each row is a voice, like a person in a band:
 *
 * - A voice walks its row left to right (wrapping back to the start). Everyone starts in column 1.
 * - A filled cell plays its loop `times` times (default 1), then the voice moves on to its next cell.
 * - An empty cell is a rest. The voice waits there until another voice moves on to its next cell, and
 *   moves on at that same moment. So rests are cues: "wait for someone else to change".
 * - If every voice is resting at once, nobody can cue anyone, so they all move on at the next 16th.
 *
 * Timing: a 25ms timer schedules notes ~120ms ahead on the AudioContext clock. Each pass of a loop (and
 * each rest) is one Segment; the UI's sweeps and labels follow those.
 * Edits are live: a voice reads its cell's loop and times when it gets there and at the end of every pass.
 * If the cell that's playing changes or is removed, that voice cuts at the next 16th and moves on.
 *
 * Audition: while stopped, one cell can play one pass of its loop on its own. Playing stops it.
 */
import { useSyncExternalStore } from "react"
import { LOOPS, STEP, type LoopId, type ShapeKind } from "./loops"

export type Cell = { loop: LoopId; times: number }
export type Grid = (Cell | null)[][] // grid[row][col]

/**
 * One pass of a loop (loop set) or one rest (loop null) in one row. A rest's end is Infinity until
 * another voice moves on. `pass` counts from 1.
 */
export type Segment = { col: number; loop: LoopId | null; pass: number; start: number; end: number; nextNote: number; cut: boolean }

const LOOKAHEAD = 0.12
const EPS = 1e-6
const WAVE: Record<ShapeKind, OscillatorType> = { circle: "sine", square: "square", triangle: "triangle" }

type Voice = { osc: OscillatorNode; env: GainNode; end: number }

let ctx: AudioContext | null = null
let master: GainNode | null = null
let timer: number | undefined
let grid: Grid = []
let t0 = 0
let segs: Segment[][] = [] // per row: recent and upcoming segments; the last one is where the voice is
let voices: Set<Voice>[] = [] // per row, so one voice can be cut without touching the others

let playing = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
export const usePlaying = () => useSyncExternalStore(subscribe, () => playing)

/** The cell being auditioned, and the pass it's playing. */
export type Audition = { row: number; col: number; seg: Segment }
let auditioning: Audition | null = null
let auditionVoices = new Set<Voice>()
let auditionTimer: number | undefined
export const useAudition = () => useSyncExternalStore(subscribe, () => auditioning)

export const getPlaying = () => playing
/** What you're hearing now: the audio clock minus output latency, so the sweeps and shapes line up with the sound. */
export const now = () => (ctx ? ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0) : 0)

export function setGrid(g: Grid) { grid = g }

/** Where a voice is right now: the pass it's playing, or the rest it's waiting in. */
export const current = (row: number): Segment | undefined => {
  const t = now()
  return playing ? segs[row]?.find((s) => s.start <= t && t < s.end) : undefined
}

/** Keep voices pointing at the same columns when columns move. `map(old)` returns the new index, or -1. */
export function remap(map: (col: number) => number) {
  for (const row of segs) for (const s of row) s.col = map(s.col)
  if (auditioning) {
    const col = map(auditioning.col)
    if (col < 0) stopAudition()
    else { auditioning = { ...auditioning, col }; emit() }
  }
}

async function ready(): Promise<AudioContext> {
  ctx ??= new AudioContext()
  if (!master) {
    master = ctx.createGain()
    master.gain.value = 0.8
    master.connect(ctx.destination)
  }
  await ctx.resume()
  return ctx
}

/** Play one pass of `loop` on its own, for the cell at row/col. Only while stopped. */
export async function audition(row: number, col: number, loop: LoopId) {
  if (playing) return
  stopAudition()
  const c = await ready()
  if (playing) return
  const start = c.currentTime + 0.05
  const seg: Segment = { col, loop, pass: 1, start, end: start + passLength(loop), nextNote: 0, cut: false }
  schedule(auditionVoices, seg, Infinity)
  auditioning = { row, col, seg }
  // Ends when what you hear ends, so the sweep finishes first.
  auditionTimer = window.setTimeout(stopAudition, (seg.end - c.currentTime + (c.outputLatency || c.baseLatency || 0)) * 1000)
  emit()
}

export function stopAudition() {
  window.clearTimeout(auditionTimer)
  for (const v of auditionVoices) { try { v.osc.stop() } catch { /* already stopped */ } }
  auditionVoices = new Set()
  if (!auditioning) return
  auditioning = null
  emit()
}

export async function play() {
  stopAudition()
  await ready()
  if (!ctx) return
  t0 = ctx.currentTime + 0.08
  segs = grid.map(() => [])
  voices = grid.map(() => new Set())
  grid.forEach((_, r) => enter(r, 0, t0))
  playing = true
  emit()
  tick()
  timer = window.setInterval(tick, 25)
}

export function stop() {
  window.clearInterval(timer)
  for (const row of voices) for (const v of row) { try { v.osc.stop() } catch { /* already stopped */ } }
  voices = []
  segs = []
  playing = false
  emit()
}

/* ---------- the rules ---------- */

/** Next 16th on the shared grid at or after t, so everything stays in time. */
const onGrid = (t: number) => t0 + Math.ceil((t - t0) / STEP - EPS) * STEP
const passLength = (loop: LoopId) => LOOPS[loop].bars * 16 * STEP
const cellAt = (row: number, col: number) => grid[row]?.[col] ?? null

/** A voice arrives at a column at time `at`: play its cell's first pass, or rest there. */
function enter(row: number, col: number, at: number) {
  const cell = cellAt(row, col)
  segs[row].push(cell
    ? { col, loop: cell.loop, pass: 1, start: at, end: at + passLength(cell.loop), nextNote: 0, cut: false }
    : { col, loop: null, pass: 1, start: at, end: Infinity, nextNote: 0, cut: false })
}

/** A voice leaves its column at `at` for the next one. */
function moveOn(row: number, at: number) {
  const s = segs[row].at(-1)!
  s.end = Math.min(s.end, at)
  const cols = grid[row]?.length || 1
  enter(row, (s.col + 1 + cols) % cols, at)
}

function tick() {
  if (!ctx || !playing) return
  const t = ctx.currentTime
  const horizon = t + LOOKAHEAD
  const cutAt = onGrid(horizon + 0.01) // the soonest 16th we can change without clashing with scheduled notes

  for (let r = 0; r < grid.length; r++) {
    segs[r] ??= []
    voices[r] ??= new Set()
    if (!segs[r].length) enter(r, 0, onGrid(t + 0.02))
    segs[r] = segs[r].filter((s, i, all) => s.end > t - 0.5 || i === all.length - 1)
    const s = segs[r].at(-1)!
    const cell = cellAt(r, s.col)
    if (s.loop && !s.cut && s.end > t && cell?.loop !== s.loop) {
      // Live edit: the cell that's playing changed or went. Cut at the next 16th; the voice moves on then.
      s.cut = true
      s.end = Math.max(s.start, cutAt)
      cut(r, s.end)
    } else if (!s.loop && cell) {
      // A shape was dropped where this voice is resting: play it from the next 16th.
      s.end = Math.max(s.start, cutAt)
      enter(r, s.col, s.end)
    }
  }

  // Walk forward through every moment something ends, in time order, until we're past the window.
  for (let guard = 0; guard < 64; guard++) {
    const ends = segs.map((row) => row.at(-1)!).filter((s) => s.loop).map((s) => s.end)
    let at: number
    if (ends.length) at = Math.min(...ends)
    else {
      // Everyone is resting: nobody can cue anyone, so they all move on at the next 16th.
      if (!grid.some((row) => row.some(Boolean))) break
      at = Math.max(onGrid(t + 0.02), ...segs.map((row) => row.at(-1)!.start + STEP))
    }
    if (at > horizon) break

    let movedOn = false
    const moved = new Set<number>()
    segs.forEach((row, r) => {
      const s = row.at(-1)!
      if (!s.loop || Math.abs(s.end - at) > EPS) return
      schedule(voices[r], s, Infinity) // finish this pass's notes before anything follows it
      const cell = cellAt(r, s.col)
      if (!s.cut && cell?.loop === s.loop && s.pass < cell.times) {
        row.push({ ...s, pass: s.pass + 1, start: s.end, end: s.end + passLength(s.loop), nextNote: 0 })
      } else {
        moveOn(r, at)
        movedOn = true
        moved.add(r)
      }
    })
    // Resting voices take their cue from anyone moving on (or from everyone resting).
    if (movedOn || !ends.length) {
      segs.forEach((row, r) => {
        const s = row.at(-1)!
        if (!s.loop && !moved.has(r) && s.start < at - EPS) moveOn(r, at)
      })
    }
  }

  segs.forEach((row, r) => row.forEach((s) => schedule(voices[r], s, horizon)))
}

/** Fade out any of a voice's notes still sounding at `at`. */
function cut(row: number, at: number) {
  for (const v of voices[row] ?? []) {
    if (v.end <= at) continue
    v.env.gain.cancelScheduledValues(at)
    v.env.gain.setTargetAtTime(0, at, 0.008)
    try { v.osc.stop(at + 0.06) } catch { /* already stopped */ }
    v.end = at
  }
}

function schedule(into: Set<Voice> | undefined, s: Segment, horizon: number) {
  if (!s.loop) return
  const loop = LOOPS[s.loop]
  while (s.nextNote < loop.notes.length) {
    const n = loop.notes[s.nextNote]
    const at = s.start + n.step * STEP
    if (at >= s.end) { s.nextNote = loop.notes.length; return }
    if (at >= horizon) return
    s.nextNote++
    // A note held past the end of a pass is trimmed so the next pass (or cell) starts clean.
    voice(into, loop.shape, n.midi, at, Math.min(n.len * STEP, s.end - at), loop.gain)
  }
}

function voice(into: Set<Voice> | undefined, shape: ShapeKind, midi: number, at: number, len: number, gain: number) {
  if (!ctx || !master) return
  const osc = ctx.createOscillator()
  osc.type = WAVE[shape]
  osc.frequency.value = 440 * 2 ** ((midi - 69) / 12)
  const filter = ctx.createBiquadFilter()
  filter.type = "lowpass"
  filter.frequency.value = shape === "square" ? 1600 : 5000
  const env = ctx.createGain()
  const end = at + Math.max(len * 0.95, 0.08)
  env.gain.setValueAtTime(0, at)
  env.gain.linearRampToValueAtTime(gain, at + 0.006)
  env.gain.exponentialRampToValueAtTime(gain * 0.45, at + Math.min(0.2, len))
  env.gain.setValueAtTime(gain * 0.45, end - 0.03)
  env.gain.linearRampToValueAtTime(0, end)
  osc.connect(filter).connect(env).connect(master)
  osc.start(at)
  osc.stop(end + 0.01)
  const v: Voice = { osc, env, end }
  into?.add(v)
  osc.onended = () => into?.delete(v)
}
