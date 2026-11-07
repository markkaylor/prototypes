# Dynamics Pad (prototype)

A full-screen XY pad for riding CC1 (vertical) and CC11 (horizontal) from a Mac trackpad over Web MIDI.

Run: `pnpm --filter dynamics-pad dev`, then open http://localhost:5173 in Chrome or Edge.

- Click anywhere to capture the trackpad. Shift = fine control, Esc = release.
- Tap ⌥ (or use the mode toggle) to cycle the axis mode: CC1 + CC11 (default) → CC1 → CC11.
- To get MIDI into your DAW on macOS: Audio MIDI Setup → MIDI Studio → IAC Driver → tick "Device is online".

History: the variant exploration (faders + scroll, trackpad + keys, XY pad) is on branch `prototype/midi-cc`.
