/**
 * PROTOTYPE. Web Speech API recognition (Chrome, Edge, Safari). Audio goes to the browser vendor's service.
 * Two modes: push-to-talk (one utterance) and hands-free (keeps listening, restarts itself).
 */
import { useSyncExternalStore } from "react"

type Rec = {
  lang: string; continuous: boolean; interimResults: boolean
  start(): void; stop(): void; abort(): void
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
}
const Ctor: (new () => Rec) | undefined =
  (window as unknown as { SpeechRecognition?: new () => Rec }).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: new () => Rec }).webkitSpeechRecognition

type State = { supported: boolean; listening: boolean; handsFree: boolean; interim: string; error: string | null }
let state: State = { supported: !!Ctor, listening: false, handsFree: false, interim: "", error: null }
const listeners = new Set<() => void>()
const set = (p: Partial<State>) => { state = { ...state, ...p }; listeners.forEach((l) => l()) }
export const useSpeech = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => state)

let rec: Rec | null = null
let onFinal: (text: string) => void = () => {}
export const onCommand = (fn: (text: string) => void) => { onFinal = fn }

function begin(continuous: boolean) {
  if (!Ctor) return
  rec?.abort()
  const r = new Ctor()
  rec = r
  r.lang = "en-US"
  r.continuous = continuous
  r.interimResults = true
  r.onresult = (e) => {
    let interim = ""
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i]
      if (res.isFinal) { set({ interim: "" }); onFinal(res[0].transcript.trim()) }
      else interim += res[0].transcript
    }
    if (interim) set({ interim })
  }
  r.onerror = (e) => { if (e.error !== "no-speech" && e.error !== "aborted") set({ error: e.error, handsFree: false }) }
  r.onend = () => {
    if (rec !== r) return
    // hands-free: the browser ends sessions after silence, so start a new one
    if (state.handsFree) { try { r.start(); return } catch { /* fall through */ } }
    rec = null
    set({ listening: false, interim: "" })
  }
  set({ listening: true, error: null, interim: "" })
  r.start()
}

export function talk() { if (state.listening && !state.handsFree) { rec?.stop(); return } set({ handsFree: false }); begin(false) }
export function setHandsFree(on: boolean) {
  set({ handsFree: on })
  if (on) begin(true)
  else { rec?.stop() }
}
