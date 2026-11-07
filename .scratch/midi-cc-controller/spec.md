# Swell (formerly Dynamics Pad): PWA MIDI controller for CC1 + CC11

Status: needs-triage

## Goal
Let orchestral composers ride CC1 (modulation/dynamics) and CC11 (expression) together from a Mac trackpad, sent over Web MIDI (Chrome/Edge) to a DAW, for example through the macOS IAC Driver.

## Validated by prototype
Prototype branch: `prototype/midi-cc` (commit ffb068f), folder `midi-cc-prototype/`.
Question: which Mac-trackpad interaction feels right for riding CC1 + CC11?

- **Chosen interaction: XY pad (variant C).** Click to capture the pointer (pointer lock). Moving vertically sets CC1 and moving horizontally sets CC11, using relative movement so values never jump. Shift gives finer control (⅓ speed), tapping ⌥ cycles the axis mode (CC1 + CC11 by default → CC1 → CC11), and Esc releases the pointer. The whole screen is the grid. Built as `prototypes/swell/`.
- **Worth adding: dynamics key ladder (variant B).** Keys 1–8 glide CC11 to ppp…fff (16/32/…/127). Holding W/S swells or fades CC11.
- **Rejected: two-finger scroll for CC11 (variant A).** You can't move CC1 and CC11 at the same time, and scroll momentum overshoots.

## Constraints learned
- Browsers can't see individual fingers on a Mac trackpad, so splitting the trackpad into left and right halves isn't possible.
- Safari has no Web MIDI, so the app targets Chromium browsers.
- Only send a CC when its rounded value changes.

## Open questions
- Should C and B be combined, with the key ladder driving CC11 while the pad still controls both?
- Which axis should the keys control once they're combined with the pad?
- Should the trackpad travel needed for a full 0–127 sweep be adjustable? The prototype fixes it at 420px.
