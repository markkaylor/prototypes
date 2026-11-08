/** PROTOTYPE. The step language the engine runs. Blocks compile to these. */

export type Meter = { beats: number; unit: number }
export type Sub = 1 | 2 | 3 | 4

export type Step =
  | { kind: "tempo"; bpm: number }
  | { kind: "tempoBy"; delta: number }
  | { kind: "tempoMul"; factor: number }
  | { kind: "meter"; meter: Meter }
  | { kind: "accent"; beats: number[] | "all" }
  | { kind: "sub"; sub: Sub }
  | { kind: "countIn"; n: number; unit: "beats" | "bars" }
  | { kind: "play"; n: number; unit: "beats" | "bars"; muted?: boolean }
  | { kind: "repeat"; until?: number; times?: number; from?: Step }
  | { kind: "start" }
  | { kind: "stop" }

/** Steps that take time (or loop over steps that do). */
export const isTimed = (s: Step) => s.kind === "countIn" || s.kind === "play" || s.kind === "repeat"

export const SUB_NAME: Record<Sub, string> = { 1: "quarters", 2: "eighths", 3: "triplets", 4: "sixteenths" }
