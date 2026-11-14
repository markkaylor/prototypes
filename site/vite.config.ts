import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { createServer, defineConfig, type Plugin, type ProxyOptions, type ViteDevServer } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

const REPO = path.resolve(import.meta.dirname, "..")
const PROTOTYPES = path.join(REPO, "prototypes")

/**
 * The dev port: 5170 in the main checkout, and in a git worktree (where .git is a file, not a folder) a
 * port from 5200–5999 picked by hashing the worktree's path, so each worktree always gets the same one
 * and several can run at once. PORT overrides both.
 */
function devPort() {
  if (process.env.PORT) return Number(process.env.PORT)
  if (!fs.statSync(path.join(REPO, ".git"), { throwIfNoEntry: false })?.isFile()) return 5170
  return 5200 + (createHash("sha1").update(REPO).digest().readUInt32BE(0) % 800)
}

/**
 * In dev, start a Vite dev server for every prototype (base /p/<slug>/, so URLs match the build) and
 * proxy /p/<slug> to it, websockets included. Edits to a prototype, the site or packages/ui all hot-reload
 * from one `pnpm dev`. New prototype folders are picked up on the next start.
 */
function devPrototypes(): Plugin {
  let servers: ViteDevServer[] = []
  return {
    name: "dev-prototypes",
    apply: "serve",
    async config() {
      const slugs = fs.readdirSync(PROTOTYPES).filter((s) => fs.existsSync(path.join(PROTOTYPES, s, "package.json")))
      const proxy: Record<string, ProxyOptions> = {}
      servers = await Promise.all(
        slugs.map(async (slug) => {
          const root = path.join(PROTOTYPES, slug)
          const server = await createServer({
            root,
            base: `/p/${slug}/`,
            server: { port: 0, strictPort: false, open: false },
            clearScreen: false,
            logLevel: "warn",
          })
          await server.listen()
          const { port } = server.httpServer!.address() as { port: number }
          proxy[`/p/${slug}`] = { target: `http://localhost:${port}`, ws: true }
          return server
        }),
      )
      return { server: { proxy } }
    },
    configureServer(server) {
      server.httpServer?.on("close", () => Promise.all(servers.map((s) => s.close())))
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), devPrototypes()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  build: { outDir: path.resolve(import.meta.dirname, "../dist"), emptyOutDir: true },
  server: { port: devPort() },
})
