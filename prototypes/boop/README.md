# Boop (prototype)

A loop sequencer of circles, squares and triangles. Throwaway code. Any shape can go in any row.

```sh
pnpm --filter boop dev   # http://localhost:5175
```

## How it plays

Each row is a **voice**, like a person in a band. Everyone starts in column 1.

- A voice plays its cells left to right and wraps back to the start.
- A filled cell plays its loop **×1** by default. Type a count in the cell's × box, or use the arrow keys, to make it loop up to ×8 before the voice moves on. While it plays, `1/2`, `2/2` shows next to the box.
- **An empty cell is a rest.** The voice waits there ("rest") until **another voice moves on** to its next cell, then moves on at that same moment. So rests are cues: "wait until someone else changes".
- If every voice is resting at once, nobody can cue anyone, so they all move on at the next 16th.
- Loops have different lengths, so voices drift apart, and rests pull them back together.
- Click an empty cell to pick one of the nine loops. Loops the column rule blocks are greyed out; hover one to see why ("yellow in use"). Hover a filled cell for its ×. Hover a column number to move, duplicate or delete the column. The dashed strip on the right adds a column.
- Edits are live. A voice reads its cell's loop count at the end of every pass. If you change or remove the cell that's playing, that voice cuts at the next 16th and moves on. Drop a shape where a voice is resting and it starts playing at the next 16th.
- **Space** plays and stops.

## The column rule

A column can't repeat a shape or a colour, so a full column is always one circle, one square and one triangle in three different colours.

## The loops are placeholders

- The nine loops in `src/loops.ts` are synthesized patterns in C minor pentatonic at 96 BPM, so any combination stays consonant.
- Shape sets the waveform: circle = sine, square = square, triangle = triangle.
- Lengths are 1 to 4 bars (2.5s to 10s) and are shown in seconds.
- Replace them with the real loops (audio files or MIDI) once they're written.

## Files

- `src/loops.ts`: the nine loops, written as one token per 16th (`C3`, `-` holds, `.` rests).
- `src/engine.ts`: Web Audio lookahead scheduler and the voice rules. Each row has a list of segments: one per pass of a loop, or one per rest (which has no end until another voice moves on). The UI draws the sweeps and rests from those.
- `src/motion.ts`: how a playing shape moves, read from the notes it plays: each note is a hit (circles swell, squares squash, triangles hop) and pitch sets its height.
- `src/App.tsx`: grid, the loop picker, and column edits.
