/**
 * PROTOTYPE. Web Audio metronome + a tiny program runner.
 *
 * Timing: a 25ms timer schedules clicks ~120ms ahead on the AudioContext clock ("a tale of two clocks").
 * The runner advances one beat at a time, at schedule time. Every scheduled beat carries a snapshot of
 * the runner, and the UI shows the snapshot of the beat you're *hearing*, not the one being scheduled.
 */
import { useSyncExternalStore } from "react"
import { describe, isTimed, parse, type Meter, type Parsed, type Step, type Sub } from "./parse"

export type Settings = { bpm: number; meter: Meter; accents: number[]; sub: Sub }

export type Program = {
  steps: Step[]
  /** For each repeat step: the index it jumps back to. */
  loopStart: Record<number, number>
  /** For each tempoBy inside an "until" loop: that loop's target and its repeat index. */
  target: Record<number, { bpm: number; repeat: number }>
}

/** Where the runner is. Copied into every beat snapshot. */
export type Pos = {
  pc: number
  done: number // beats done in the current timed step
  total: number
  passes: Record<number, number> // repeat index → passes completed
  countIn: number | null // 1-based count-in beat, or null
  barBeat: number // 0-based beat in bar
  bar: number // 1-based bar since the program (or free play) started
}

export type Beat = { time: number; settings: Settings; pos: Pos; accent: boolean; muted: boolean }

type State = {
  settings: Settings
  running: boolean
  program: Program | null
  now: Beat | null
}

const BPM_MIN = 20, BPM_MAX = 400
const clampBpm = (n: number) => Math.round(Math.min(BPM_MAX, Math.max(BPM_MIN, n)))

let state: State = {
  settings: { bpm: 100, meter: { beats: 4, unit: 4 }, accents: [1], sub: 1 },
  running: false,
  program: null,
  now: null,
}
const listeners = new Set<() => void>()
const set = (patch: Partial<State>) => { state = { ...state, ...patch }; listeners.forEach((l) => l()) }
export const getState = () => state
export const useEngine = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, getState)

/* ---------- compile ---------- */

export function compile(input: Step[]): Program {
  // settings said before the first click apply from the top, so the count-in is already at the right tempo
  const firstPlay = input.findIndex((s) => s.kind === "play")
  const isSetting = (s: Step) => s.kind === "tempo" || s.kind === "tempoMul" || s.kind === "meter" || s.kind === "accent" || s.kind === "sub"
  const head = firstPlay < 0 ? [] : input.slice(0, firstPlay)
  const steps = [...head.filter(isSetting), ...head.filter((s) => !isSetting(s)), ...(firstPlay < 0 ? input : input.slice(firstPlay))]
    // "click at 60, count in 4…": a start with timed steps after it is just a verb, not a step
    .filter((s, i, all) => s.kind !== "start" || !all.slice(i + 1).some(isTimed))
  const loopStart: Program["loopStart"] = {}
  const target: Program["target"] = {}
  let segment = 0 // where the current loop body may begin
  steps.forEach((s, i) => {
    if (s.kind === "countIn") segment = i + 1
    if (s.kind !== "repeat") return
    // don't loop back over absolute tempo or a start marker: that would reset a ramp forever
    // an explicit "repeat from 2" wins over the default (which skips the count-in)
    const at = s.from ? steps.indexOf(s.from) : -1
    const explicit = at >= 0 && at < i
    let from = explicit ? at : segment
    if (!explicit) while (from < i && (steps[from].kind === "tempo" || steps[from].kind === "start")) from++
    loopStart[i] = from
    if (s.until) for (let j = from; j < i; j++) if (steps[j].kind === "tempoBy") target[j] = { bpm: s.until, repeat: i }
    segment = i + 1
  })
  return { steps, loopStart, target }
}

/* ---------- runner (runs at schedule time, one beat per call) ---------- */

// The runner's live copies. `state.settings` is what the UI shows *now*; these run ~120ms ahead.
let live: Settings = state.settings
let pos: Pos = freshPos()
function freshPos(): Pos { return { pc: 0, done: 0, total: 0, passes: {}, countIn: null, barBeat: 0, bar: 1 } }

const beatsOf = (n: number, unit: "beats" | "bars") => (unit === "bars" ? n * live.meter.beats : n)

function emit(kind: "count" | "play", muted = false): Omit<Beat, "time"> {
  const p = { ...pos, passes: { ...pos.passes } }
  if (kind === "count") return { settings: live, pos: p, accent: pos.countIn === 1, muted: false }
  const b = pos.barBeat + 1
  const accent = live.accents.includes(b)
  return { settings: live, pos: p, accent, muted }
}

function advanceBar() {
  pos.barBeat++
  if (pos.barBeat >= live.meter.beats) { pos.barBeat = 0; pos.bar++ }
}

/** Run instant steps, then produce the next beat. null = the program has ended. */
function nextBeat(): Omit<Beat, "time"> | null {
  const prog = state.program
  if (!prog) { const b = emit("play"); advanceBar(); return b }

  for (let guard = 0; guard < 500; guard++) {
    const s = prog.steps[pos.pc]
    if (!s) return null
    switch (s.kind) {
      case "tempo": live = { ...live, bpm: clampBpm(s.bpm) }; pos.pc++; continue
      case "tempoMul": live = { ...live, bpm: clampBpm(live.bpm * s.factor) }; pos.pc++; continue
      case "tempoBy": {
        const t = prog.target[pos.pc]
        if (t) {
          // the loop exits once the body has been played *at* the target
          if (live.bpm === t.bpm || Math.sign(t.bpm - live.bpm) !== Math.sign(s.delta)) { pos.pc = t.repeat + 1; continue }
          const next = live.bpm + s.delta
          live = { ...live, bpm: clampBpm(s.delta > 0 ? Math.min(next, t.bpm) : Math.max(next, t.bpm)) }
        } else live = { ...live, bpm: clampBpm(live.bpm + s.delta) }
        pos.pc++; continue
      }
      case "meter": live = { ...live, meter: s.meter }; pos.barBeat = 0; pos.pc++; continue
      case "accent": live = { ...live, accents: s.beats === "all" ? range(live.meter.beats) : s.beats }; pos.pc++; continue
      case "sub": live = { ...live, sub: s.sub }; pos.pc++; continue
      case "stop": return null
      case "start":
        // a start with nothing timed after it means "keep clicking"
        if (prog.steps.slice(pos.pc + 1).some(isTimed)) { pos.pc++; continue }
        { const b = emit("play"); advanceBar(); return b }
      case "repeat": {
        const n = (pos.passes[pos.pc] ?? 0) + 1
        if (s.times !== undefined && n > s.times) { pos.passes = { ...pos.passes, [pos.pc]: 0 }; pos.pc++; continue }
        pos.passes = { ...pos.passes, [pos.pc]: n }
        pos.pc = prog.loopStart[pos.pc]
        continue
      }
      case "countIn":
      case "play": {
        if (pos.done === 0) pos.total = beatsOf(s.n, s.unit)
        if (pos.done >= pos.total) {
          pos.done = 0; pos.pc++
          if (s.kind === "countIn") { pos.countIn = null; pos.barBeat = 0; pos.bar = 1 }
          continue
        }
        pos.done++
        if (s.kind === "countIn") { pos.countIn = pos.done; const b = emit("count"); return b }
        const b = emit("play", s.muted)
        advanceBar()
        return b
      }
    }
  }
  return null // a loop with nothing timed in it
}
const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1)

/* ---------- audio ---------- */

let ctx: AudioContext | null = null
let timer: number | undefined
let nextTime = 0
const queue: Beat[] = []
const LOOKAHEAD = 0.12

function ensureCtx() {
  ctx ??= new AudioContext({ latencyHint: "interactive" })
  if (ctx.state === "suspended") ctx.resume()
  return ctx
}

function click(t: number, freq: number, gain: number, type: OscillatorType = "sine", dur = 0.035) {
  const c = ctx!
  const o = c.createOscillator(), g = c.createGain()
  o.type = type
  o.frequency.value = freq
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + 0.002)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(c.destination)
  o.start(t)
  o.stop(t + dur + 0.01)
}

function schedule() {
  const c = ctx!
  while (nextTime < c.currentTime + LOOKAHEAD) {
    const b = nextBeat()
    if (!b) { endAt(nextTime); return }
    const spb = 60 / b.settings.bpm
    if (b.pos.countIn !== null) click(nextTime, b.accent ? 1760 : 1320, 0.7, "triangle", 0.06)
    else if (!b.muted) {
      click(nextTime, b.accent ? 1600 : 1000, b.accent ? 0.9 : 0.5)
      for (let k = 1; k < b.settings.sub; k++) click(nextTime + (k * spb) / b.settings.sub, 800, 0.18)
    }
    queue.push({ ...b, time: nextTime })
    nextTime += spb
  }
}

let ending: number | null = null
function endAt(t: number) {
  clearInterval(timer); timer = undefined
  ending = t
}

/** UI clock: publish the beat that is audible right now. */
function frame() {
  if (!ctx) return
  const t = ctx.currentTime
  let latest: Beat | null = null
  while (queue.length && queue[0].time <= t) latest = queue.shift()!
  if (latest) set({ now: latest, settings: latest.settings })
  if (ending !== null && t >= ending) { ending = null; queue.length = 0; set({ running: false }); return }
  if (state.running) raf = requestAnimationFrame(frame)
}
let raf = 0

export function start(program: Program | null = state.program) {
  const c = ensureCtx()
  live = state.running ? live : state.settings // keep on-the-fly changes when restarting
  stopAudio()
  pos = freshPos()
  set({ program, running: true, now: null })
  nextTime = c.currentTime + 0.06
  schedule()
  timer = window.setInterval(schedule, 25)
  raf = requestAnimationFrame(frame)
}

function stopAudio() { clearInterval(timer); timer = undefined; cancelAnimationFrame(raf); queue.length = 0; ending = null }
export function stop() { stopAudio(); set({ running: false, now: null }) }
export const toggle = () => (state.running ? stop() : start(null))

/** Apply settings now, on the running beat, without restarting. */
function applyLive(steps: Step[]) {
  let s = state.running ? live : state.settings
  for (const st of steps) {
    if (st.kind === "tempo") s = { ...s, bpm: clampBpm(st.bpm) }
    if (st.kind === "tempoBy") s = { ...s, bpm: clampBpm(s.bpm + st.delta) }
    if (st.kind === "tempoMul") s = { ...s, bpm: clampBpm(s.bpm * st.factor) }
    if (st.kind === "meter") { s = { ...s, meter: st.meter }; if (state.running) pos.barBeat = 0 }
    if (st.kind === "accent") s = { ...s, accents: st.beats === "all" ? range(s.meter.beats) : st.beats }
    if (st.kind === "sub") s = { ...s, sub: st.sub }
  }
  live = s
  if (!state.running) set({ settings: s })
}

/* ---------- commands ---------- */

/** Parse and act. Returns what it understood and what it did, for the review log. */
export function command(text: string): { parsed: Parsed; outcome: string } {
  const parsed = parse(text)
  const steps = parsed.steps
  let outcome: string
  if (!steps.length) outcome = "Didn't catch anything I can do."
  else if (steps.some(isTimed)) {
    // a routine: replace the program and run it from the top
    start(compile(steps))
    outcome = "Running it as a routine."
  } else {
    // settings and transport: change things on the fly
    const wasRunning = state.running
    applyLive(steps)
    const last = steps.filter((s) => s.kind === "start" || s.kind === "stop").at(-1)
    if (last?.kind === "stop") { stop(); outcome = "Stopped." }
    else if (last?.kind === "start" && !wasRunning) { start(null); outcome = "Clicking." }
    else outcome = wasRunning ? `Changed on the fly: ${steps.map(describe).join(", ")}.` : `Set: ${steps.map(describe).join(", ")}.`
    if (last?.kind === "start" && wasRunning && state.program) { start(null); outcome = "Free clicking." }
  }
  return { parsed, outcome }
}

/** Dry-run a routine without audio (for poking at the runner from the console: `simulate("…")`). */
export function simulate(text: string, maxBeats = 400) {
  const saved = { state, live, pos }
  state = { ...state, program: compile(parse(text).steps) }
  live = state.settings; pos = freshPos()
  const out: string[] = []
  for (let i = 0; i < maxBeats; i++) {
    const b = nextBeat()
    if (!b) { out.push("end"); break }
    out.push(b.pos.countIn ? `c${b.pos.countIn}@${b.settings.bpm}` : `${b.muted ? "_" : b.accent ? "X" : "x"}@${b.settings.bpm}`)
  }
  ;({ state, live, pos } = saved)
  return out.join(" ")
}
