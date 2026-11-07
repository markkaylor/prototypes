# Dynamics Pad — PROTOTYPE (throwaway)

**Question:** which Mac-trackpad interaction feels right for riding CC1 + CC11 together?

Run: `python3 -m http.server 5173 -d midi-cc-prototype` (from repo root), then open
http://localhost:5173/?variant=A in Chrome/Edge (Web MIDI). Flip variants with ← / → or the bottom bar.

| Key | Variant | CC1 | CC11 | Simultaneous? |
|---|---|---|---|---|
| A | Faders + scroll | one-finger slide | two-finger scroll | alternating |
| B | Trackpad + keys | one-finger slide | keys 1–8 (ppp…fff glide), hold W/S | yes, two hands |
| C | XY pad | vertical | horizontal | yes, one finger |

Click to capture the trackpad (pointer lock), Shift = fine, Esc = release.
MIDI to your DAW on macOS: Audio MIDI Setup → MIDI Studio → IAC Driver → "Device is online".

## Verdict (2026-11-07)

- **C (XY pad) wins**: one finger rides CC1 (vertical) and CC11 (horizontal) at the same time.
- **B (Trackpad + keys) is worth keeping**: the ppp…fff dynamics ladder with gliding to each level is a strong idea, a candidate to add on top of C.
- **A (Faders + scroll) is rejected**: CC1 and CC11 can't move at the same time, and scroll momentum overshoots.

## Iteration 2: C only

- Variants A and B were removed (they're still in commit ffb068f).
- The whole screen is the XY grid, and the value readouts ride along the crosshair lines.
- Tap ⌥ (or click the mode pill) to cycle the axis mode: **CC1 + CC11** (default) → CC1 → CC11. A "tap" means press and release ⌥ without another key in between.
