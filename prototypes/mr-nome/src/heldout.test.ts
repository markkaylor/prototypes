/**
 * Held-out phrasings: written without looking at the rules, never tuned against.
 * This is the honest coverage number. When a round is fixed, move it into parse.test.ts and write a new round here.
 *
 * Round 1: 22/43 (51%) before fixes. Round 2: 15/32 (47%) before fixes. Both now live in parse.test.ts.
 */
import { expect, test } from "vitest"
import { describe as label, parse } from "./parse"

const read = (s: string) =>
  parse(s).clauses.flatMap((c) => [...c.steps.map(label), ...(c.leftover ? [`? ${c.leftover}`] : [])]).join(" · ")

const HELD_OUT: [string, string][] = [
  // round 3 goes here: ideally phrasings from someone else, or real transcripts from the mic
]

for (const [say, want] of HELD_OUT) test(`held out: ${say}`, () => expect(read(say)).toBe(want))
test.todo("write held-out round 3")
