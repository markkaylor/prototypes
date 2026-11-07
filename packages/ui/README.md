# @prototypes/ui

Shared shadcn/ui components and the Tailwind theme for every prototype.

- Add a component (run from any prototype folder; the CLI writes it here): `pnpm dlx shadcn@latest add <component>`
- Import it: `import { Button } from "@prototypes/ui/components/button"`. Components import `cn` from shadcn's `cn` package; `@prototypes/ui/lib/utils` re-exports it.
- Theme: shadcn default (neutral), light + dark following the OS. Drop `<ThemeToggle />` from `@prototypes/ui/components/theme-toggle` into a header to let users override it.
- Theme: import `@prototypes/ui/globals.css` once in each prototype's own CSS entry.
