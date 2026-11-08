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

/*
 * End-of-utterance. The recogniser marks a phrase "final" at every short pause, so acting on each
 * one runs "click at 60" while you're still saying "…count in 4". Instead, collect final phrases and
 * act once you've finished: on key release (hold), or after a stretch of silence (tap, hands-free).
 */
type Mode = "hold" | "tap" | "handsFree"
const SILENCE_MS: Record<Mode, number | null> = { hold: null, tap: 1200, handsFree: 1500 }
/** Said on its own, these act immediately. */
const URGENT = /^\s*(?:stop|pause|halt|shh+|hold on|hold it|wait|enough|that's enough)[\s.!]*$/i

let mode: Mode = "tap"
let engine: Engine = "cloud"
let pending: Heard[][] = [] // one entry per final phrase: its alternatives
let interimText = ""
let silence: number | undefined

const pendingText = () => pending.map((alts) => alts[0].text).join(" ")
const showInterim = () => set({ interim: [pendingText(), interimText].filter(Boolean).join(" ") })

/** Join the collected phrases into one utterance, keeping alternatives aligned phrase by phrase. */
function flush() {
  clearTimeout(silence)
  interimText = ""
  if (!pending.length) { set({ interim: "" }); return }
  const n = Math.max(...pending.map((a) => a.length))
  const alts = Array.from({ length: n }, (_, i) => ({
    text: pending.map((a) => (a[i] ?? a[0]).text).join(" ").replace(/\s+/g, " ").trim(),
    confidence: Math.min(...pending.map((a) => (a[i] ?? a[0]).confidence)),
  }))
  pending = []
  set({ interim: "" })
  onFinal(alts, engine)
  if (mode === "tap") rec?.stop()
}

function heardSomething() {
  clearTimeout(silence)
  const ms = SILENCE_MS[mode]
  if (ms !== null) silence = window.setTimeout(flush, ms)
}

function begin(m: Mode) {
  if (!Ctor) return
  rec?.abort()
  clearTimeout(silence)
  pending = []; interimText = ""
  mode = m
  const r = new Ctor()
  rec = r
  r.lang = LANG
  r.continuous = true // we decide when the utterance ends, not the recogniser
  r.interimResults = true
  r.maxAlternatives = 3 // logged, to spot homophones ("for" / "four")
  engine = state.useHints && state.hints === "available" ? "on-device" : "cloud"
  if (engine === "on-device") {
    r.processLocally = true
    r.phrases = VOCAB.map(([p, boost]) => new w.SpeechRecognitionPhrase!(p, boost))
  }
  r.onresult = (e) => {
    if (rec !== r) return
    let interim = ""
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i]
      if (res.isFinal) pending.push(Array.from(res, (a) => ({ text: a.transcript.trim(), confidence: a.confidence })))
      else interim += res[0].transcript
    }
    interimText = interim.trim()
    showInterim()
    if (!interimText && URGENT.test(pendingText())) { flush(); return }
    heardSomething()
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
    flush() // whatever was said before the session ended
    // hands-free: the browser ends sessions after a while, so start a new one (picking up any engine change)
    if (state.handsFree) { begin("handsFree"); return }
    rec = null
    set({ listening: false, interim: "" })
  }
  set({ listening: true, error: state.error?.startsWith("On-device") ? state.error : null, interim: "" })
  r.start()
}

function restartIfHandsFree() { if (state.handsFree && state.listening) begin("handsFree") }

/** Tap: start listening; act after a pause. Tapping again sends what's been heard right away. */
export function talk() {
  if (state.listening && !state.handsFree) { rec?.stop(); return } // onend flushes
  set({ handsFree: false })
  begin("tap")
}

/** Hold-to-talk: listen while held, act on release. A quick press counts as a tap. */
let heldAt = 0
export function holdStart() {
  if (state.handsFree) return
  if (state.listening) { rec?.stop(); heldAt = 0; return } // a press while tap-listening sends it
  heldAt = performance.now()
  begin("hold")
}
export function holdEnd() {
  if (!heldAt || mode !== "hold" || !state.listening) return
  const quick = performance.now() - heldAt < 300
  heldAt = 0
  if (quick) { mode = "tap"; heardSomething() } // became a tap: wait for a pause instead
  else rec?.stop() // the recogniser sends its last final phrase, then onend flushes
}

export function setHandsFree(on: boolean) {
  set({ handsFree: on })
  if (on) begin("handsFree")
  else { rec?.stop() }
}
