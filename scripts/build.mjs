// Builds the deployable site: the gallery into dist/, every prototype into dist/p/<folder>/.
import { execSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const root = path.resolve(import.meta.dirname, "..")
const run = (cmd) => execSync(cmd, { stdio: "inherit", cwd: root })

run("pnpm --filter site build") // empties dist/ first

const dir = path.join(root, "prototypes")
for (const slug of fs.readdirSync(dir)) {
  const pkgFile = path.join(dir, slug, "package.json")
  if (!fs.existsSync(pkgFile)) continue
  const { name } = JSON.parse(fs.readFileSync(pkgFile, "utf8"))
  const out = path.join(root, "dist", "p", slug)
  run(`pnpm --filter ${name} build --base=/p/${slug}/ --outDir=${out} --emptyOutDir`)
}
console.log("\n✓ dist/ ready — preview with `pnpm preview`")
