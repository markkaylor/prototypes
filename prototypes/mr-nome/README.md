# Mr. Nome (prototype)

A metronome you talk to. Throwaway code that asks one question:

> **Is a small step language (set tempo / meter / accents, count in, click N, change tempo, repeat) enough to cover the way people actually ask a metronome for things, by voice?**

```sh
pnpm --filter mr-nome dev   # http://localhost:5174
```

Type a command or press **V** and speak (Chrome, Edge, Safari). **Space** starts and stops, **/** focuses the box.
Tick **Hands-free** to keep the mic open while the click plays.

## How it works

- `src/parse.ts`: rule-based parser, no model. Normalises speech ("one twenty" → 120, "first" → ord1), splits on commas / "then" / "and", runs regex extractors per clause. Anything it can't place shows as a red dashed `? leftover` chip.
- `src/engine.ts`: Web Audio lookahead scheduler plus a program runner that advances one beat at a time. Commands with a length, count-in or repeat become a **routine** (replaces the current one and runs from the top). Everything else (tempo, meter, accents, feel, faster/slower) changes **on the fly** without restarting.
- `src/speech.ts`: Web Speech API, push-to-talk or hands-free.

`simulate("…")` in `engine.ts` dry-runs a routine with no audio and returns a beat trace.

## Semantics worth arguing about

- **"count in 4"** = 4 beats. "count in 2 bars" or bare "count me in" (1 bar) for bars.
- **"click 4"** = 4 bars. "click 4 beats" for beats.
- **"repeat until 120"** loops back over everything after the count-in (skipping an initial "at 60"), and exits once the body has played *at* 120. Tempo steps clamp to the target.
- **"repeat 3 times"** = 3 more passes (4 in total).
- A routine **stops** when it runs out, unless it ends with "then keep going".
- Settings said before the first click ("count in 4, click 4 at 72") apply from the top, so the count-in is at 72.
