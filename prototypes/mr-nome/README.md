# Mr. Nome (prototype)

A metronome you program. Throwaway code that asks one question:

> **Can a handful of blocks (set tempo / meter / accents / subdivision, count in, click or rest N, speed up, repeat) build the practice routines musicians actually use, and is stacking blocks quicker than describing the routine in words?**

```sh
pnpm --filter mr-nome dev   # http://localhost:5174
pnpm --filter mr-nome test  # vitest
```

Build a routine from the **Blocks** list. Each block reads as a sentence with its values as fields ("Click for [8] [beats]"). Type a number or nudge it with ↑/↓ (Shift: by 10). Drag the grip to reorder, or focus it and use ↑/↓. **Space** plays the routine, with a playhead on the current block.

- **Circles** (blue) change a setting and take no time: tempo, speed up / slow down, double / halve, time signature, accents, subdivision.
- **Squares** (red) take time: count in, click, rest (a hollow square).
- **The triangle** (yellow) loops back. A repeat runs until a tempo, a number of extra times, or forever. Its blue bracket shows what it loops over, and "back to" picks where the loop starts.

## How it works

- `src/blocks.ts`: the block list (localStorage), edits (add, update, move, delete), and compiling blocks to steps for the engine. A repeat stores the id of the block it loops back to, so moves and deletes keep it pointing at the same block.
- `src/steps.ts`: the step language the engine runs.
- `src/engine.ts`: Web Audio lookahead scheduler plus a program runner that advances one beat at a time. `simulate(steps)` dry-runs a routine with no audio and returns a beat trace (used by the tests).

## Semantics worth arguing about

- **Repeat until 120** exits once the loop has played *at* 120. Speed-up steps clamp to the target.
- **Repeat again 3 times** = 3 more passes (4 in total).
- A repeat with no "back to" loops over everything after the last count-in or loop, skipping a leading Tempo.
- Settings before the first click apply from the top, so the count-in is already at the right tempo.
- A routine **stops** when it runs out. One with no timed blocks just keeps clicking.

## Parked: typing and speech

Making blocks by typing or talking (a rule-based parser, Whisper and the browser speech engines, and the Heard review log with real transcripts) is on the `mr-nome-text-speech` branch.
