/** The line-by-line routine: line N is step N. */
import { expect, test } from "vitest"
import { describe as label, parseLines, splitEntry } from "./parse"

const lines = (texts: string[]) => parseLines(texts).lines.map((cs) => cs.flatMap((c) => [...c.steps.map(label), ...(c.leftover ? [`? ${c.leftover}`] : [])]).join(" · "))

test("the four-line routine from the sketch", () => {
  const texts = ["Tempo at 60 BPM", "Count in 4 beats", "Click for 8 beats", "Repeat from 2 until 120 bpm"]
  expect(lines(texts)).toEqual(["tempo 60", "count in 4 beats", "click 8 beats", "repeat from #2 until 120"])
  const { lines: parsed } = parseLines(texts)
  const repeat = parsed[3][0].steps[0]
  expect(repeat.kind === "repeat" && repeat.from).toBe(parsed[1][0].steps[0]) // points at line 2's count-in
})

test("repeat from a line that doesn't exist falls back to the default loop", () => {
  expect(lines(["Click 4 bars", "Repeat from 9"])).toEqual(["click 4 bars", "repeat forever"])
})

test("every line can be anything the single-command parser understands", () => {
  expect(lines(["waltz at 90", "accent the first beat", "eighth notes", "rest 2 bars", "repeat 3 times"]))
    .toEqual(["meter 3/4 · tempo 90", "accent 1st", "eighths", "silent 2 bars", "repeat 3 times"])
})

test("one long entry splits into lines on commas and 'then', not 'and'", () => {
  expect(splitEntry("click at 60, count in 4, then click 4 bars and accent 1 and 3"))
    .toEqual(["click at 60", "count in 4", "click 4 bars and accent 1 and 3"])
  expect(splitEntry("1. Tempo at 60, 2. count in 4")).toEqual(["Tempo at 60", "count in 4"])
})

import { addEntry, clearLines, compileLines, getLines, removeAt } from "./routine"

test("deleting a line keeps 'repeat from N' pointing at the same line", () => {
  clearLines()
  for (const t of ["Tempo at 60 BPM", "Count in 4 beats", "Click for 8 beats", "Increase tempo by 10", "Repeat from 2 until 120"]) addEntry(t)
  removeAt(1)
  expect(getLines().map((l) => l.text)).toEqual(["Count in 4 beats", "Click for 8 beats", "Increase tempo by 10", "Repeat from 1 until 120"])
  removeAt(3) // a line after the target: no change to the reference
  expect(getLines().at(-1)!.text).toBe("Repeat from 1 until 120")
  clearLines()
})

test("a repeat-until with nothing changing the tempo is flagged as endless", () => {
  expect([...compileLines(["Tempo at 60", "Count in 4 beats", "Click for 8 beats", "Repeat from 2 until 120"]).endless]).toEqual([3])
  expect([...compileLines(["Tempo at 60", "Count in 4 beats", "Click for 8 beats", "Increase tempo by 10", "Repeat from 2 until 120"]).endless]).toEqual([])
})
