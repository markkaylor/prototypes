/**
 * PROTOTYPE. How a playing shape moves, read straight from the notes it's playing (not from the audio),
 * so it lands exactly on each note:
 *
 * - Every note onset is a hit: a quick attack, then a decay. Circles swell, squares squash, triangles hop.
 * - Pitch sets height: the shape glides up for high notes and down for low ones, within its loop's range.
 */
import type { CSSProperties } from "react"
import { LOOPS, STEP } from "./loops"
import type { Segment } from "./engine"

const ATTACK = 0.015
const DECAY = 0.14
const GLIDE = 0.08
const RISE = 12 // px either side of centre

const reduced = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches

/** Where a pitch sits in its loop's range, -1 (lowest) to 1 (highest). */
function height(loopId: NonNullable<Segment["loop"]>, midi: number) {
  const ms = LOOPS[loopId].notes.map((n) => n.midi)
  const lo = Math.min(...ms), hi = Math.max(...ms)
  return hi === lo ? 0 : ((midi - lo) / (hi - lo)) * 2 - 1
}

export function motion(seg: Segment, t: number): CSSProperties | undefined {
  if (reduced || !seg.loop) return undefined
  const loop = LOOPS[seg.loop]
  const notes = loop.notes
  // The last note that has started in this pass (notes after a cut never play).
  let i = -1
  for (let k = 0; k < notes.length; k++) {
    const at = seg.start + notes[k].step * STEP
    if (at > t || at >= seg.end) break
    i = k
  }
  const last = notes.at(-1)
  const fromY = (k: number) => (k >= 0 ? height(seg.loop!, notes[k].midi) : seg.pass > 1 && last ? height(seg.loop!, last.midi) : 0)

  let hit = 0
  let y = fromY(-1)
  if (i >= 0) {
    const age = t - (seg.start + notes[i].step * STEP)
    hit = age < ATTACK ? age / ATTACK : Math.exp(-(age - ATTACK) / DECAY)
    const g = Math.min(1, age / GLIDE)
    const ease = 1 - (1 - g) ** 3
    y = fromY(i - 1) + (fromY(i) - fromY(i - 1)) * ease
  }
  const dy = -y * RISE

  switch (loop.shape) {
    case "circle":
      return { transform: `translateY(${dy}px) scale(${1 + 0.22 * hit})` }
    case "square":
      return { transform: `translateY(${dy}px) scale(${1 + 0.24 * hit}, ${1 - 0.16 * hit})` }
    case "triangle": {
      const tilt = (i % 2 ? 1 : -1) * 7 * hit // rock side to side, one way per note
      return { transform: `translateY(${dy - 8 * hit}px) rotate(${tilt}deg) scale(${1 + 0.08 * hit})` }
    }
  }
}
