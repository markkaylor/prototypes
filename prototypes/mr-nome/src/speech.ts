/**
 * PROTOTYPE. Web Speech API recognition (Chrome, Edge, Safari).
 * Two modes: push-to-talk (one utterance) and hands-free (keeps listening, restarts itself).
 *
 * Two engines:
 * - "cloud": the browser's default. Audio goes to the browser vendor's service.
 * - "on-device": Chrome's local model with vocabulary hints (contextual biasing). Chrome only
 *   accepts `phrases` when `processLocally` is on, and the model is a one-time download.
 *   This is the free version of what Claude Code's voice mode does with `keyterms`.
 */
import { useSyncExternalStore } from "react"

type Phrase = object
type Rec = {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number
  processLocally?: boolean; phrases?: Phrase[]
  start(): void; stop(): void; abort(): void
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }> & { isFinal: boolean }> }) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string; message?: string }) => void) | null
}
type Availability = "unavailable" | "downloadable" | "downloading" | "available"
type RecCtor = (new () => Rec) & {
  available?: (o: { langs: string[]; processLocally: boolean }) => Promise<Availability>
  install?: (o: { langs: string[]; processLocally: boolean }) => Promise<boolean>
}
const w = window as unknown as {
  SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor
  SpeechRecognitionPhrase?: new (phrase: string, boost?: number) => Phrase
}
const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
const LANG = "en-US"

/**
 * Words the recogniser should expect. Boost is 0–10 (1 = default); too high and it starts
 * hearing these words in noise. The worst offenders from real transcripts get the most.
 */
const VOCAB: [string, number][] = [
  ["accent", 6], ["accent beat one", 6], ["click", 6], ["click at", 5],
  ["count in", 4], ["count me in", 3], ["bpm", 4], ["beats", 3], ["bars", 3], ["beat one", 4],
  ["downbeat", 3], ["backbeat", 3], ["eighth notes", 3], ["triplets", 3], ["sixteenths", 3], ["subdivide", 3],
  ["faster", 2], ["slower", 2], ["repeat until", 3], ["three four", 3], ["four four", 3], ["six eight", 3],
  ["waltz", 2], ["stop", 2], ["start", 2],
]

export type Engine = "cloud" | "on-device"
/** `hints`: whether on-device + vocabulary hints can be used here, and its state. */
export type HintSupport = "unsupported" | Availability | "installing"

type State = {
  supported: boolean; listening: boolean; handsFree: boolean; interim: string; error: string | null
  hints: HintSupport; useHints: boolean
}
const PREF = "mr-nome:use-hints"
const pref = () => { try { return localStorage.getItem(PREF) === "1" } catch { return false } }
const savePref = (on: boolean) => { try { localStorage.setItem(PREF, on ? "1" : "0") } catch { /* fine */ } }

const canHint = !!(Ctor?.available && Ctor.install && w.SpeechRecognitionPhrase && "phrases" in Ctor.prototype)
let state: State = {
  supported: !!Ctor, listening: false, handsFree: false, interim: "", error: null,
  hints: canHint ? "unavailable" : "unsupported", useHints: false,
}
const listeners = new Set<() => void>()
const set = (p: Partial<State>) => { state = { ...state, ...p }; listeners.forEach((l) => l()) }
export const useSpeech = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => state)

if (canHint) {
  Ctor!.available!({ langs: [LANG], processLocally: true })
    .then((a) => set({ hints: a, useHints: a === "available" && pref() }))
    .catch(() => set({ hints: "unsupported" }))
}

/** Turn on-device + vocabulary hints on or off. Turning it on may download the model (needs a click). */
export async function setUseHints(on: boolean) {
  savePref(on)
  if (!on) { set({ useHints: false }); restartIfHandsFree(); return }
  if (state.hints === "downloadable" || state.hints === "downloading") {
    set({ hints: "installing", error: null })
    try {
      const ok = await Ctor!.install!({ langs: [LANG], processLocally: true })
      const now = await Ctor!.available!({ langs: [LANG], processLocally: true })
      set({ hints: now, useHints: ok && now === "available", error: ok ? null : "Couldn't download the on-device speech model." })
    } catch (e) {
      set({ hints: "downloadable", useHints: false, error: `Model download failed: ${String(e)}` })
    }
  } else if (state.hints === "available") set({ useHints: true })
  restartIfHandsFree()
}

let rec: Rec | null = null
export type Heard = { text: string; confidence: number }
/** Called with the best transcript first, then the engine's other guesses, and which engine heard it. */
let onFinal: (alts: Heard[], engine: Engine) => void = () => {}
export const onCommand = (fn: (alts: Heard[], engine: Engine) => void) => { onFinal = fn }

function begin(continuous: boolean) {
  if (!Ctor) return
  rec?.abort()
  const r = new Ctor()
  rec = r
  r.lang = LANG
  r.continuous = continuous
  r.interimResults = true
  r.maxAlternatives = 3 // logged, to spot homophones ("for" / "four")
  const engine: Engine = state.useHints && state.hints === "available" ? "on-device" : "cloud"
  if (engine === "on-device") {
    r.processLocally = true
    r.phrases = VOCAB.map(([p, boost]) => new w.SpeechRecognitionPhrase!(p, boost))
  }
  r.onresult = (e) => {
    let interim = ""
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i]
      if (res.isFinal) {
        set({ interim: "" })
        onFinal(Array.from(res, (a) => ({ text: a.transcript.trim(), confidence: a.confidence })), engine)
      }
      else interim += res[0].transcript
    }
    if (interim) set({ interim })
  }
  r.onerror = (e) => {
    if (e.error === "no-speech" || e.error === "aborted") return
    if (engine === "on-device" && /phrases-not-supported|language-not-supported|service-not-allowed/.test(e.error)) {
      // fall back to cloud recognition rather than leaving the mic dead
      set({ useHints: false, error: `On-device hints unavailable (${e.error}); using cloud recognition.` })
      return
    }
    set({ error: e.error, handsFree: false })
  }
  r.onend = () => {
    if (rec !== r) return
    // hands-free: the browser ends sessions after silence, so start a new one (picking up any engine change)
    if (state.handsFree) { begin(true); return }
    rec = null
    set({ listening: false, interim: "" })
  }
  set({ listening: true, error: state.error?.startsWith("On-device") ? state.error : null, interim: "" })
  r.start()
}

function restartIfHandsFree() { if (state.handsFree && state.listening) begin(true) }

export function talk() { if (state.listening && !state.handsFree) { rec?.stop(); return } set({ handsFree: false }); begin(false) }
export function setHandsFree(on: boolean) {
  set({ handsFree: on })
  if (on) begin(true)
  else { rec?.stop() }
}
