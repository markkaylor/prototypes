/**
 * PROTOTYPE. The routine, built one line at a time. Each line is one short instruction
 * ("count in 4 beats"); line N is step N, so "repeat from 2" means line 2.
 * Kept in localStorage so a routine survives a reload while testing.
 */
import { useSyncExternalStore } from "react"
import { compile, type Program } from "./engine"
import { isTimed, parseLines, splitEntry, type Clause, type Step } from "./parse"

export type Line = { id: string; text: string }

const KEY = "mr-nome:routine"
const load = (): Line[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? "[]") } catch { return [] } }
let lines: Line[] = load()
const listeners = new Set<() => void>()
const commit = (next: Line[]) => {
  lines = next
  try { localStorage.setItem(KEY, JSON.stringify(lines)) } catch { /* memory only */ }
  listeners.forEach((l) => l())
}
export const getLines = () => lines
export const useLines = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => lines)

const line = (text: string): Line => ({ id: crypto.randomUUID(), text })

/** Add an entry; "a, b, then c" becomes three lines. Returns the new line numbers. */
export function addEntry(text: string): number[] {
  const parts = splitEntry(text)
  const from = lines.length + 1
  commit([...lines, ...parts.map(line)])
  return parts.map((_, i) => from + i)
}
export const updateLine = (id: string, text: string) => commit(lines.map((l) => (l.id === id ? { ...l, text } : l)))
/**
 * Delete line n (1-based) and keep "repeat from N" pointing at the same line: references past the
 * deleted line shift down by one. A reference to the deleted line itself is left for you to fix
 * (the chip shows where it now points).
 */
function removeIndex(n: number) {
  if (n < 1 || n > lines.length) return
  const ref = /(\b(?:repeat|loop|go back|again)\b[^,;]*?\bfrom\s+(?:step\s+|line\s+|item\s+|number\s+|#)?)(\d{1,2})\b/gi
  commit(lines
    .filter((_, i) => i !== n - 1)
    .map((l) => ({ ...l, text: l.text.replace(ref, (m, head, num) => (+num > n && +num <= lines.length ? `${head}${+num - 1}` : m)) })))
}
export const removeLine = (id: string) => removeIndex(lines.findIndex((l) => l.id === id) + 1)
export const removeAt = (n: number) => removeIndex(n)
export const removeLast = () => removeIndex(lines.length)
export const clearLines = () => commit([])

export const EXAMPLE = ["Tempo at 60 BPM", "Count in 4 beats", "Click for 8 beats", "Increase tempo by 10", "Repeat from 2 until 120 BPM"]
export const loadExample = () => commit(EXAMPLE.map(line))

export type Compiled = {
  program: Program
  /** What each line understood. */
  understood: Clause[][]
  /** Which line (0-based) each compiled step came from, for the playhead. */
  lineOf: Map<Step, number>
  /** True when nothing in the routine has a length: it just keeps clicking. */
  open: boolean
  /** Lines (0-based) with a "repeat until" that can never be reached: nothing in its loop changes the tempo. */
  endless: Set<number>
}

export function compileLines(texts: string[]): Compiled {
  const { lines: understood, steps } = parseLines(texts)
  const lineOf = new Map<Step, number>()
  understood.forEach((clauses, i) => clauses.forEach((c) => c.steps.forEach((s) => lineOf.set(s, i))))
  const open = !steps.some(isTimed)
  // settings only ("tempo at 60"): apply them, then keep clicking
  const program = compile(open ? [...steps, { kind: "start" }] : steps)
  const endless = new Set<number>()
  const changesTempo = new Set(Object.values(program.target).map((t) => t.repeat))
  program.steps.forEach((s, i) => {
    if (s.kind === "repeat" && s.until && !changesTempo.has(i)) endless.add(lineOf.get(s) ?? -1)
  })
  return { program, understood, lineOf, open, endless }
}
