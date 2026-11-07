# Design guidelines

House style for the site **and every prototype**: the overlap of **minimalism** and **Bauhaus playfulness**.
Most of the time the look is quiet: paper, ink, space. The primaries and the three forms show up in small doses, and that's where the play comes from.
If a screen reads as "obviously Bauhaus", there's too much of it.

The tokens live in `packages/ui/src/styles/globals.css`, so anything that imports `@prototypes/ui/globals.css` gets them automatically.

## Colour

Paper and ink carry the page. Red, blue and yellow are accents. Tailwind's default palette is removed, so these five are the only colours that compile.

| Token | Value | Utility | Use |
|---|---|---|---|
| paper | `#F2EDE4` | `bg-paper` | Background. Warm off-white, never pure white. |
| ink | `#111111` | `text-ink`, `border-ink` | Text, rules, borders |
| red | `#E1251B` | `bg-red` | Accent, action. shadcn `primary`. |
| blue | `#1F4FA8` | `bg-blue` | Accent, links, focus. shadcn `secondary`, `ring`. |
| yellow | `#F5C400` | `bg-yellow` | Accent, highlight, selection. shadcn `accent`. |

- **Primaries in small doses:** a shape, a line, a selected state. Avoid large blocks of colour.
- **Flat fills only.** No gradients, blur, glow or soft shadows. When something needs depth, as on hover, use a hard offset shadow in ink.
- **Contrast:** yellow is never used for text. Text on yellow is ink. Text on red or blue is paper.
- **Tints** (`bg-yellow/25`, `color-mix` with ink) are fine for quiet areas like grid lines and filled regions.
- **Data order:** red, blue, yellow, ink (`--chart-1` to `--chart-4`). For example, Swell uses red for CC1 and blue for CC11.

## Shape

Circle, square and triangle are the only decorative forms. They follow Kandinsky's pairing: **circle = blue, square = red, triangle = yellow**.
Use `<Shape kind="circle" />` from `@prototypes/ui/components/shape`, which applies the pairing by default.

- Keep shapes **small** (marks and markers, roughly 10–40px) and few. The template is the row of three sitting on the rule at the right of the site header (order shuffled on each load).
- On the site, each field note gets a form from its position (red square → blue circle → yellow triangle), shown as a small marker.
- Corners are square everywhere. Every `--radius-*` is 0, and only `rounded-full` survives, for circles. Avoid pills.

## Type

- **Jost** (variable, self-hosted via `@fontsource-variable/jost`) for everything. It's the default `font-sans`.
- Use sentence or title case at normal weights (`font-semibold tracking-tight` for headings). No shouting display type.
- Uppercase with wide tracking is only for tiny meta labels (`text-xs tracking-widest uppercase`): numbers, dates.
- Secondary text uses `text-muted-foreground`.
- The mono font (`font-mono`) is only for numbers that change.

## Layout

- Simple, generous and aligned: one centered column (`max-w-6xl`) and a plain card grid. Whitespace does the dividing.
- **Rules, sparingly.** A 1px ink border frames things like previews and bars. A single 2px ink rule can mark a major division, like the one under the site header.
- No posters, no colour-block compositions, no cards inside cards.
- It has to work at phone width: one column, a 20px gutter, no horizontal scroll.

## Interaction

- **Playful and mechanical, like toy blocks**, but small: the shapes are the toys. Motion is snappy, with a little overshoot (`ease-[cubic-bezier(.3,1.6,.5,1)]`, 200–300ms).
- **Hover vocabulary:** a square morphs into a circle, a circle into a square, a triangle turns. A card lifts onto a hard ink shadow. An arrow nudges in.
- **Somewhere to fiddle:** clicking any of the three small shapes in the site header shuffles their order (it also shuffles on each load).
- Respect `prefers-reduced-motion` (`motion-reduce:transition-none`). The design should still look complete when nothing moves.
- Focus is visible: a blue outline or blue text, never removed.
- **↗ means "leaves the site".** External links open in a new tab and show the arrow on hover or focus. Internal links, like field note cards, never show it.

## Prototypes vs. the site

- **Every prototype uses this language:** palette, Jost, square corners, thin ink rules. It doesn't bring its own colours.
- **The playfulness lives in the prototype's own interaction.** Inside a prototype, there are no decorative shapes floating over working UI.
- **The site's play happens around field notes, never on top of them.** The viewer bar stays quiet.

## Voice

- Visitors see "field note(s)", never "prototype(s)" (see `GLOSSARY.md`). Code keeps "prototype".

## No dark mode

Paper only. The `dark:` variant is pinned to a `.dark` class that nothing sets, so shadcn's dark styles never apply.

## Don'ts

Big colour blocks · poster layouts · giant uppercase display type · gradients · soft shadows · blur · rounded cards or pills · colours outside the palette · yellow text · emoji as decoration.
