import fs from "node:fs"
import path from "node:path"
import { defineConfig, type Plugin } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

const DIST = path.resolve(import.meta.dirname, "../dist")

/** In dev, serve already-built prototypes from ../dist/p so the viewer's iframes work. Run `pnpm build` first. */
function servePrototypes(): Plugin {
  return {
    name: "serve-built-prototypes",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? ""
        if (!url.startsWith("/p/")) return next()
        let file = path.join(DIST, url)
        if (!file.startsWith(DIST)) return next()
        if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html")
        if (!fs.existsSync(file)) return next()
        const types: Record<string, string> = {
          ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml",
          ".png": "image/png", ".json": "application/json", ".webmanifest": "application/manifest+json",
        }
        res.setHeader("Content-Type", types[path.extname(file)] ?? "application/octet-stream")
        fs.createReadStream(file).pipe(res)
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), servePrototypes()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  build: { outDir: DIST, emptyOutDir: true },
  server: { port: 5170 },
})
