import { useSyncExternalStore } from "react"

export type Mode = "both" | "cc1" | "cc11"
const MODES: Mode[] = ["both", "cc1", "cc11"]
type CC = 1 | 11

export type State = {
  cc1: number
  cc11: number
  mode: Mode
  captured: boolean
  status: "pending" | "ok" | "unsupported" | "denied"
  outputs: { id: string; name: string }[]
  outputId: string | null
  channel: number
  /** Bumped on every record trigger, so the button can flash. */
  recordPulse: number
}

let state: State = {
  cc1: 64, cc11: 64, mode: "both", captured: false,
  status: "pending", outputs: [], outputId: null, channel: 0, recordPulse: 0,
}
const listeners = new Set<() => void>()
const set = (patch: Partial<State>) => { state = { ...state, ...patch }; listeners.forEach((l) => l()) }
export const getState = () => state
export const useMidi = () =>
  useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, getState)

/* ---------- sending ---------- */
let access: MIDIAccess | null = null
const sent: Record<CC, number> = { 1: -1, 11: -1 }

/** CC 85 is undefined in the MIDI spec, so it's free to learn in Logic as "Record Toggle". */
export const RECORD_CC = 85

/** Press and release a virtual button: 127 then 0, like a hardware transport key. */
export function triggerRecord() {
  if (!state.outputId) return
  send(RECORD_CC, 127)
  setTimeout(() => send(RECORD_CC, 0), 50)
  set({ recordPulse: state.recordPulse + 1 })
}

function send(cc: number, value: number) {
  const msg = [0xb0 | state.channel, cc, value]
  try { if (state.outputId) access?.outputs.get(state.outputId)?.send(msg) } catch (e) { console.warn(e) }
}

/** Store the float value; send only when the rounded 0–127 value changes. */
export function setCC(cc: CC, value: number) {
  const v = Math.max(0, Math.min(127, value))
  const iv = Math.round(v)
  if (iv !== sent[cc]) { sent[cc] = iv; send(cc, iv) }
  set(cc === 1 ? { cc1: v } : { cc11: v })
}
export const nudge = (cc: CC, delta: number) => setCC(cc, (cc === 1 ? state.cc1 : state.cc11) + delta)

function resendAll() { sent[1] = sent[11] = -1; setCC(1, state.cc1); setCC(11, state.cc11) }
export function setOutput(id: string) { set({ outputId: id }); resendAll() }
export function setChannel(channel: number) { set({ channel }); resendAll() }
export const setMode = (mode: Mode) => set({ mode })
export const cycleMode = () => set({ mode: MODES[(MODES.indexOf(state.mode) + 1) % MODES.length] })
export const setCaptured = (captured: boolean) => set({ captured })

/* ---------- ports ---------- */
function refreshOutputs() {
  const outputs = access ? [...access.outputs.values()].map((o) => ({ id: o.id, name: o.name ?? o.id })) : []
  const keep = outputs.find((o) => o.id === state.outputId)
  set({ outputs, outputId: keep?.id ?? outputs[0]?.id ?? null })
}

let started = false
export async function initMidi() {
  if (started) return
  started = true
  if (!navigator.requestMIDIAccess) return set({ status: "unsupported" })
  try {
    access = await navigator.requestMIDIAccess()
    access.onstatechange = refreshOutputs
    set({ status: "ok" })
    refreshOutputs()
  } catch {
    set({ status: "denied" })
  }
}
