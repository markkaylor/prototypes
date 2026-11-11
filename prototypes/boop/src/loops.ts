/**
 * PROTOTYPE. The nine loops. Placeholders until the real ones are composed:
 * each is a short pattern in C minor pentatonic, so any combination stays consonant.
 * Shape picks the waveform (circle = sine, square = square, triangle = triangle) so you can hear them apart.
 */

export type ShapeKind = "circle" | "square" | "triangle"
export type Color = "red" | "blue" | "yellow"
export type LoopId = `${ShapeKind}-${Color}`

export const SHAPES: ShapeKind[] = ["circle", "square", "triangle"]
export const COLORS: Color[] = ["red", "blue", "yellow"]

export const BPM = 96
export const STEP = 60 / BPM / 4 // one 16th, in seconds
export const BAR = STEP * 16

export type Note = { step: number; midi: number; len: number }
export type Loop = { id: LoopId; shape: ShapeKind; color: Color; bars: number; notes: Note[]; gain: number }

/**
 * One token per 16th: a note ("C3", "Eb4", "Bb1") starts a note, "-" holds it, "." rests.
 * Each line is one bar of 16 tokens.
 */
const PATTERNS: Record<LoopId, { bars: string[]; gain: number }> = {
  "circle-red": { gain: 0.5, bars: [
    "C2 - - . . . C2 . G1 - . . Bb1 - . .",
    "C2 - - . . . Eb2 . F2 - . . G1 - - -",
  ] },
  "circle-blue": { gain: 0.22, bars: [
    "G4 . Eb4 . C4 . Eb4 . G4 . Bb4 . G4 . F4 .",
  ] },
  "circle-yellow": { gain: 0.2, bars: [
    "C5 - - - - - - - Eb5 - - - G5 - - -",
    "F5 - - - - - - - Eb5 - - - C5 - - -",
    "Bb4 - - - - - - - C5 - - - Eb5 - - -",
    "G5 - - - - - - - - - - - . . . .",
  ] },
  "square-red": { gain: 0.16, bars: [
    "C2 . C2 . . . C3 . C2 . . . Bb1 . . .",
    "Eb2 . Eb2 . . . Eb3 . Eb2 . . . F2 . . .",
    "F2 . F2 . . . F3 . F2 . . . G2 . . .",
    "G2 . G2 . . . G1 . Bb1 . . . Bb1 . C2 .",
  ] },
  "square-blue": { gain: 0.07, bars: [
    ". . C4 . . . Eb4 . . . C4 . . G4 . .",
    ". . Bb3 . . . C4 . . . F4 . Eb4 . . .",
  ] },
  "square-yellow": { gain: 0.05, bars: [
    "G5 . . G5 . . Bb5 . . . . . F5 . Eb5 .",
    "C5 - - - - - - - . . . . . . . .",
  ] },
  "triangle-red": { gain: 0.45, bars: [
    "C3 . . C3 . . C3 . . . C3 . . . . .",
  ] },
  "triangle-blue": { gain: 0.25, bars: [
    "Eb4 - - - G4 - - - Bb4 - - - G4 - - -",
    "F4 - - - Bb4 - - - C5 - - - Bb4 - - -",
    "G4 - - - Eb4 - - - C4 - - - - - - -",
  ] },
  "triangle-yellow": { gain: 0.12, bars: [
    "C5 Eb5 G5 Bb5 C6 Bb5 G5 Eb5 C5 Eb5 G5 Bb5 C6 Bb5 G5 Eb5",
    "F5 G5 Bb5 C6 Eb6 C6 Bb5 G5 F5 G5 Bb5 C6 Eb6 C6 Bb5 G5",
  ] },
}

const PITCH: Record<string, number> = { C: 0, Db: 1, D: 2, Eb: 3, E: 4, F: 5, Gb: 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 }

function parse(bars: string[]): Note[] {
  const tokens = bars.flatMap((b) => b.trim().split(/\s+/))
  const notes: Note[] = []
  tokens.forEach((t, step) => {
    if (t === "-") { if (notes.length) notes[notes.length - 1].len++; return }
    if (t === ".") return
    const m = /^([A-G]b?)(\d)$/.exec(t)!
    notes.push({ step, midi: 12 * (Number(m[2]) + 1) + PITCH[m[1]], len: 1 })
  })
  return notes
}

export const LOOPS = Object.fromEntries(
  Object.entries(PATTERNS).map(([id, p]) => {
    const [shape, color] = id.split("-") as [ShapeKind, Color]
    return [id, { id, shape, color, bars: p.bars.length, gain: p.gain, notes: parse(p.bars) }]
  }),
) as Record<LoopId, Loop>

/** "2.5s", "5s", "7.5s", "10s" */
export const seconds = (s: number) => `${Number(s.toFixed(1))}s`
export const duration = (id: LoopId) => LOOPS[id].bars * BAR
