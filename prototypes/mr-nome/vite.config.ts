import fs from "node:fs"
import path from "node:path"
import { defineConfig, type Plugin } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

/** PROTOTYPE. Dev-only: the review log reads/writes .scratch/mr-nome/transcripts.json at the repo root. */
function transcripts(): Plugin {
  const file = path.resolve(import.meta.dirname, "../../.scratch/mr-nome/transcripts.json")
  return {
    name: "mr-nome-transcripts",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__transcripts", (req, res) => {
        if (req.method === "GET") {
          res.setHeader("content-type", "application/json")
          res.end(fs.existsSync(file) ? fs.readFileSync(file) : "[]")
          return
        }
        if (req.method === "PUT") {
          let body = ""
          req.on("data", (c) => (body += c))
          req.on("end", () => {
            JSON.parse(body) // refuse anything that isn't JSON
            fs.mkdirSync(path.dirname(file), { recursive: true })
            fs.writeFileSync(file, body + "\n")
            res.statusCode = 204
            res.end()
          })
          return
        }
        res.statusCode = 405
        res.end()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), transcripts()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  server: { port: 5174 },
})
