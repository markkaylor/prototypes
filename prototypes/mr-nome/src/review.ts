/**
 * PROTOTYPE. The review log: every command, what Mr. Nome made of it, and your verdict + note.
 *
 * Saved to localStorage, and in dev also to `.scratch/mr-nome/transcripts.json` (via the
 * plugin in vite.config.ts) so the notes can be read straight from the repo.
 */
import { useSyncExternalStore } from "react"
import { command } from "./engine"
import { describe } from "./parse"

export type Alt = { text: string; confidence: number }

export type Review = {
  id: string
  at: string // ISO time
  source: "voice" | "typed"
  transcript: string
  /** The speech engine's other guesses, best first (voice only). */
  alternatives?: Alt[]
  /** What it understood, clause by clause: step chips and leftover words. */
  understood: { steps: string[]; leftover: string }[]
  outcome: string
  verdict?: "right" | "wrong"
  note?: string
}

const KEY = "mr-nome:PROTOTYPE-transcripts"
const ENDPOINT = `${import.meta.env.BASE_URL}__transcripts`

let entries: Review[] = load()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
export const useReviews = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => entries)

function load(): Review[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]") } catch { return [] }
}

// In dev the repo file is the source of truth, so a log survives switching browsers.
if (import.meta.env.DEV) {
  fetch(ENDPOINT).then((r) => (r.ok ? r.json() : null)).then((file: Review[] | null) => {
    if (file?.length) { entries = file; emit() } else if (entries.length) save()
  }).catch(() => {})
}

let timer: number | undefined
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(entries)) } catch { /* private mode: memory only */ }
  if (!import.meta.env.DEV) return
  clearTimeout(timer)
  timer = window.setTimeout(() => {
    fetch(ENDPOINT, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(entries, null, 2) }).catch(() => {})
  }, 400)
}
const commit = (next: Review[]) => { entries = next; emit(); save() }

/** Run a command and log it. */
export function run(transcript: string, source: Review["source"], alternatives?: Alt[]) {
  const { parsed, outcome } = command(transcript)
  commit([
    {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      source,
      transcript,
      ...(alternatives && alternatives.length > 1 ? { alternatives } : {}),
      understood: parsed.clauses.map((c) => ({ steps: c.steps.map(describe), leftover: c.leftover })),
      outcome,
    },
    ...entries,
  ])
}

export function setVerdict(id: string, verdict: Review["verdict"]) {
  commit(entries.map((e) => (e.id === id ? { ...e, verdict: e.verdict === verdict ? undefined : verdict } : e)))
}
export function setNote(id: string, note: string) {
  commit(entries.map((e) => (e.id === id ? { ...e, note: note || undefined } : e)))
}
export function clearAll() { commit([]) }

/** Markdown for pasting into a chat or an issue. */
export function toMarkdown(list: Review[] = entries): string {
  const wrong = list.filter((e) => e.verdict === "wrong").length
  const lines = [`# Mr. Nome transcripts (${list.length} commands, ${wrong} marked wrong)`, ""]
  for (const e of [...list].reverse()) {
    const mark = e.verdict === "right" ? "✓" : e.verdict === "wrong" ? "✗" : "·"
    lines.push(`- ${mark} “${e.transcript}” (${e.source})`)
    if (e.alternatives) lines.push(`  - heard as: ${e.alternatives.map((a) => `“${a.text}” ${a.confidence.toFixed(2)}`).join(", ")}`)
    const got = e.understood.flatMap((c) => [...c.steps, ...(c.leftover ? [`? ${c.leftover}`] : [])]).join(" · ") || "nothing"
    lines.push(`  - understood: ${got}`)
    if (e.note) lines.push(`  - note: ${e.note}`)
  }
  return lines.join("\n")
}
