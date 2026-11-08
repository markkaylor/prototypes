## Prototype stack

Every prototype is built with this stack, whatever a skill's default shape says:

- **React + Vite + TypeScript**, one Vite app per prototype, in its own folder `prototypes/<name>/`. Each prototype has its own `dev` script, run from the root with `pnpm --filter <name> dev`.
- **Tailwind CSS** for all styling.
- **shadcn/ui** for UI components. Shared components live in one workspace package, `packages/ui/` (`@prototypes/ui`), which every prototype imports. Add new components there with the shadcn CLI (monorepo mode) so all prototypes can reuse them. A component that only one prototype needs stays in that prototype's folder.
- **Always use shadcn/ui for controls.** Never write a raw `<button>`, `<input>`, `<select>` or `<textarea>`: use `Button`, `Input`, `Select`, `Toggle` and so on from `@prototypes/ui`, restyled with `className` when a design needs it. If the component you need isn't in `packages/ui/` yet, add it with the shadcn CLI first.
- **pnpm workspaces** connect `site`, `prototypes/*` and `packages/*`.
- **Design:** every prototype and the site follow `docs/design-guidelines.md`. That means minimalism with Bauhaus playfulness: mostly paper and ink, with red, blue and yellow (and the circle, square and triangle) as small accents. Jost, square corners, thin ink rules, no dark mode. Visitor-facing copy says "field notes", not "prototypes".

## Site

`site/` is the gallery that hosts every prototype. `pnpm build` builds the site into `dist/` and each prototype into `dist/p/<folder>/`. `pnpm preview` serves the result. A new prototype is ready for the site when:

- its `package.json` has a `description` and a `prototype` block: `{ "title", "tags", "created": "YYYY-MM-DD" }`. The gallery reads these.
- it has a `preview.png` (a 1440×900 screenshot) next to its `package.json` for the card image.
- its asset URLs work under any base path: `import.meta.env.BASE_URL` in code, relative URLs in the web manifest.
- browser features it needs inside the viewer's iframe are listed in the iframe's `allow` attribute in `site/src/App.tsx` (`midi` is already there).

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the five default triage labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), recorded as a `Status:` line in each issue file. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
