/**
 * The gallery is built from each prototype's own package.json: `description` plus a `prototype` block
 * ({ title, tags, created }). An optional `preview.png` next to it becomes the card image.
 * The folder name is the slug, and the build serves each prototype at /p/<slug>/.
 */
type Pkg = { name: string; description?: string; prototype?: { title?: string; tags?: string[]; created?: string } }

const pkgs = import.meta.glob<Pkg>("../../prototypes/*/package.json", { eager: true, import: "default" })
const previews = import.meta.glob<string>("../../prototypes/*/preview.png", { eager: true, import: "default", query: "?url" })

export type Prototype = {
  slug: string
  title: string
  description: string
  tags: string[]
  created?: string
  preview?: string
  url: string
}

const slugOf = (file: string) => file.split("/").at(-2)!

export const prototypes: Prototype[] = Object.entries(pkgs)
  .map(([file, pkg]) => {
    const slug = slugOf(file)
    return {
      slug,
      title: pkg.prototype?.title ?? slug,
      description: pkg.description ?? "",
      tags: pkg.prototype?.tags ?? [],
      created: pkg.prototype?.created,
      preview: previews[file.replace("package.json", "preview.png")],
      url: `/p/${slug}/`,
    }
  })
  .sort((a, b) => (b.created ?? "").localeCompare(a.created ?? ""))
