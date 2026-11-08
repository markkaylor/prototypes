# Mr. Nome (prototype)

A metronome you talk to. Throwaway code that asks one question:

> **Is a small step language (set tempo / meter / accents, count in, click N, change tempo, repeat) enough to cover the way people actually ask a metronome for things, by voice?**

```sh
pnpm --filter mr-nome dev   # http://localhost:5174
```

Build a **routine one step at a time**: each line is one short instruction ("Count in 4 beats"), numbered, editable and deletable. Type in the box at the bottom or hold **V** and speak. **Space** (or saying "start" / "stop") plays it, with a playhead on the current line. "Repeat from 2" means line 2; deleting a line renumbers those references. "undo", "delete 3" and "clear all" edit by voice.

Tick **Hands-free** to keep the mic open while the click plays. Entries where nothing is understood (room chatter) aren't added.

## Why line by line

The first version parsed a whole routine from one sentence. Held-out testing plateaued around 50% on fresh phrasings, and most failures were in long routines. One short instruction per line is what the rules handle well, and a wrong line is easy to see and fix. Long sentences still work: commas and "then" split them into lines.

## How it works

- `src/parse.ts`: rule-based parser, no model. Normalises speech ("one twenty" → 120, "first" → ord1), splits on commas / "then" / "and", runs regex extractors per clause. Anything it can't place shows as a red dashed `? leftover` chip.
- `src/routine.ts`: the line list (localStorage), compiling it via `parseLines` (line N = item N), and the step → line map for the playhead.
- `src/engine.ts`: Web Audio lookahead scheduler plus a program runner that advances one beat at a time. Commands with a length, count-in or repeat become a **routine** (replaces the current one and runs from the top). Everything else (tempo, meter, accents, feel, faster/slower) changes **on the fly** without restarting.
- `src/speech.ts`: Web Speech API, push-to-talk or hands-free. Two engines:
  - **cloud** (default): the browser's own service.
  - **on-device + vocabulary hints**: Chrome's local model, told in advance to expect our words (`accent`, `click`, `count in`…) via `SpeechRecognitionPhrase`. Chrome only accepts hints with `processLocally`, so this needs a one-time model download (the checkbox triggers it). Same idea as Claude Code voice mode's `keyterms`, but free and on-device. Each voice entry in the log records which engine heard it, so the two can be compared.

## Reviewing what it heard

Every command you say or type is kept in the **Heard** panel with what it understood. Mark each one ✓ or ✗ and add a note saying what you expected. Voice entries also keep the speech engine's other guesses ("or: …"), which shows when a mishearing was the problem rather than the rules.

- In dev the log is written to `.scratch/mr-nome/transcripts.json` at the repo root (a dev-only endpoint in `vite.config.ts`), so it can be read straight from the repo.
- It's also kept in localStorage. **Copy** puts a Markdown summary on the clipboard, which works on the deployed site too.

## The phrase corpus

```sh
pnpm --filter mr-nome test   # vitest, watch mode
```

- `src/parse.test.ts`: every phrasing the rules are expected to handle (≈190), grouped by intent.
- `src/heldout.test.ts`: fresh phrasings written *without* looking at the rules. Their pass rate before fixing is the honest coverage number. Once fixed, they move into the corpus and a new round starts.

| Round | Fresh phrasings understood before fixes |
|---|---|
| 1 | 22/43 (51%) |
| 2 | 15/32 (47%) |

Coverage of unseen phrasings didn't improve between rounds, even after fixing every round-1 failure. Each fix covers the phrase in front of it, not the next new one.

`simulate("…")` in `engine.ts` dry-runs a routine with no audio and returns a beat trace.

## Semantics worth arguing about

- **"count in 4"** = 4 beats. "count in 2 bars" or bare "count me in" (1 bar) for bars.
- **"click 4"** = 4 bars. "click 4 beats" for beats.
- **"repeat until 120"** loops back over everything after the count-in (skipping an initial "at 60"), and exits once the body has played *at* 120. Tempo steps clamp to the target.
- **"repeat 3 times"** = 3 more passes (4 in total).
- A routine **stops** when it runs out, unless it ends with "then keep going".
- Settings said before the first click ("count in 4, click 4 at 72") apply from the top, so the count-in is at 72.
