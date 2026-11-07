import { useSyncExternalStore } from "react"
import { ArrowLeftIcon, ArrowUpRightIcon } from "lucide-react"
import { Badge } from "@prototypes/ui/components/badge"
import { Button } from "@prototypes/ui/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@prototypes/ui/components/card"
import { ThemeToggle } from "@prototypes/ui/components/theme-toggle"
import { prototypes, type Prototype } from "./prototypes"

/* Hash routing (#/<slug>) so the site works on any static host without rewrites. */
const useSlug = () =>
  useSyncExternalStore(
    (cb) => { addEventListener("hashchange", cb); return () => removeEventListener("hashchange", cb) },
    () => decodeURIComponent(location.hash.replace(/^#\/?/, "")),
  )

export default function App() {
  const slug = useSlug()
  const current = prototypes.find((p) => p.slug === slug)
  return current ? <Viewer p={current} /> : <Gallery />
}

/* ---------- gallery ---------- */
function Gallery() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-start justify-between gap-4 px-6 pt-14 pb-10">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Prototypes</h1>
          <p className="mt-2 text-muted-foreground">Interactive design experiments. Each one is live — open it and play.</p>
        </div>
        <ThemeToggle />
      </header>
      <main className="mx-auto grid max-w-6xl gap-6 px-6 pb-20 sm:grid-cols-2 lg:grid-cols-3">
        {prototypes.map((p) => <PrototypeCard key={p.slug} p={p} />)}
        {!prototypes.length && <p className="text-muted-foreground">No prototypes yet.</p>}
      </main>
    </div>
  )
}

function PrototypeCard({ p }: { p: Prototype }) {
  return (
    <a href={`#/${p.slug}`} className="group rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      <Card className="h-full gap-0 overflow-hidden pt-0 transition-shadow group-hover:shadow-md">
        <div className="aspect-[16/10] overflow-hidden border-b bg-muted">
          {p.preview ? (
            <img src={p.preview} alt="" className="size-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.02]" />
          ) : (
            <div className="grid size-full place-items-center text-4xl font-semibold text-muted-foreground/40">{p.title[0]}</div>
          )}
        </div>
        <CardHeader className="pt-5">
          <CardTitle>{p.title}</CardTitle>
          <CardDescription className="line-clamp-3">{p.description}</CardDescription>
        </CardHeader>
        <CardContent className="mt-auto flex flex-wrap items-center gap-1.5 pt-4">
          {p.tags.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}
          {p.created && <span className="ml-auto text-xs text-muted-foreground">{formatDate(p.created)}</span>}
        </CardContent>
      </Card>
    </a>
  )
}

/* ---------- viewer: the prototype in a frame, with a slim bar to get back ---------- */
function Viewer({ p }: { p: Prototype }) {
  return (
    <div className="flex h-dvh flex-col">
      <div className="flex items-center gap-2 border-b px-2 py-1.5">
        <Button variant="ghost" size="sm" asChild>
          <a href="#/"><ArrowLeftIcon /> All prototypes</a>
        </Button>
        <span className="mx-1 h-4 w-px bg-border" />
        <span className="truncate text-sm font-medium">{p.title}</span>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" asChild>
            <a href={p.url} target="_blank" rel="noreferrer">Open full screen <ArrowUpRightIcon /></a>
          </Button>
        </div>
      </div>
      {/* allow="midi" lets Web MIDI work inside the frame; same-origin frames may use pointer lock. */}
      <iframe key={p.slug} src={p.url} title={p.title} allow="midi; fullscreen; clipboard-read; clipboard-write" className="w-full flex-1 border-0" />
    </div>
  )
}

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
