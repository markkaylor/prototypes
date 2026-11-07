import { useRef, useState, useSyncExternalStore } from "react"
import { ArrowLeftIcon, ArrowUpRightIcon } from "lucide-react"
import { cn } from "@prototypes/ui/lib/utils"
import { Shape, type ShapeKind } from "@prototypes/ui/components/shape"
import { prototypes, type Prototype } from "./prototypes"

/* Hash routing (#/<slug>) so the site works on any static host without rewrites. */
const useSlug = () =>
  useSyncExternalStore(
    (cb) => { addEventListener("hashchange", cb); return () => removeEventListener("hashchange", cb) },
    () => decodeURIComponent(location.hash.replace(/^#\/?/, "")),
  )

/* Each field note gets a form by position, cycling red square → blue circle → yellow triangle. */
const KINDS: ShapeKind[] = ["square", "circle", "triangle"]
const kindOf = (i: number) => KINDS[i % KINDS.length]
const pad = (n: number) => String(n).padStart(2, "0")
const SPRING = "ease-[cubic-bezier(.3,1.6,.5,1)] motion-reduce:transition-none"

export default function App() {
  const slug = useSlug()
  const index = prototypes.findIndex((p) => p.slug === slug)
  return index >= 0 ? <Viewer p={prototypes[index]} kind={kindOf(index)} /> : <Gallery />
}

/* ---------- gallery ---------- */
function Gallery() {
  return (
    <div className="mx-auto min-h-dvh max-w-6xl px-5 pb-24 sm:px-8">
      <Header />
      <main className="grid gap-x-8 gap-y-12 pt-12 sm:grid-cols-2 lg:grid-cols-3">
        {prototypes.map((p, i) => <NoteCard key={p.slug} p={p} n={i + 1} kind={kindOf(i)} />)}
        {!prototypes.length && <p className="text-muted-foreground">No field notes yet.</p>}
      </main>
    </div>
  )
}

/* The title, a rule, and three small shapes sitting on the rule at the right. Each load shuffles their
   order; drag them anywhere in the header, or tap one to turn it. */
type Piece = { kind: ShapeKind; size: number; dx: number; dy: number; turn: number; z: number }
// Optically matched, not equal: a circle reads smaller than a square of the same width, and a triangle
// fills only half its box, so each gets a little more.
const PIECES: Pick<Piece, "kind" | "size">[] = [
  { kind: "circle", size: 24 },
  { kind: "square", size: 22 },
  { kind: "triangle", size: 26 },
]
const shuffled = (): Piece[] =>
  [...PIECES].sort(() => Math.random() - 0.5).map((p, i) => ({ ...p, dx: 0, dy: 0, turn: 0, z: i + 1 }))

function Header() {
  const [pieces, setPieces] = useState(shuffled)
  const area = useRef<HTMLElement>(null)
  const drag = useRef<{ i: number; grabX: number; grabY: number; baseX: number; baseY: number; half: number; moved: boolean } | null>(null)

  const update = (i: number, patch: (p: Piece, all: Piece[]) => Partial<Piece>) =>
    setPieces((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch(p, ps) } : p)))

  const onDown = (i: number) => (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    const r = e.currentTarget.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    // base = where the centre would be with no drag offset; grab = pointer's offset from the centre
    drag.current = { i, grabX: e.clientX - cx, grabY: e.clientY - cy, baseX: cx - pieces[i].dx, baseY: cy - pieces[i].dy, half: r.width / 2, moved: false }
    update(i, (_, all) => ({ z: Math.max(...all.map((q) => q.z)) + 1 })) // grabbed piece goes on top
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    d.moved = true
    const h = area.current!.getBoundingClientRect()
    const cx = clamp(e.clientX - d.grabX, h.left + d.half, h.right - d.half)
    const cy = clamp(e.clientY - d.grabY, h.top + d.half, h.bottom - d.half)
    update(d.i, () => ({ dx: cx - d.baseX, dy: cy - d.baseY }))
  }
  const onUp = () => {
    const d = drag.current
    drag.current = null
    if (d && !d.moved) update(d.i, (p) => ({ turn: p.turn + 1 }))
  }

  return (
    <header ref={area} className="relative border-b-2 border-ink pt-20 pb-8 sm:pt-28">
      <h1 className="text-5xl leading-none font-semibold tracking-tight sm:text-6xl">Field Notes</h1>
      <p className="mt-4 max-w-lg text-muted-foreground">Interactive design experiments</p>

      <div className="absolute right-2 bottom-2 flex items-center gap-3">
        {pieces.map((p, i) => (
          <Shape
            key={p.kind}
            kind={p.kind}
            onPointerDown={onDown(i)}
            onPointerMove={onMove}
            onPointerUp={onUp}
            className={cn("relative cursor-grab touch-none transition-[rotate,scale] duration-300 select-none hover:scale-110 active:cursor-grabbing", SPRING)}
            style={{ width: p.size, height: p.size, translate: `${p.dx}px ${p.dy}px`, rotate: `${p.turn * 90}deg`, zIndex: p.z }}
          />
        ))}
      </div>
    </header>
  )
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/* ---------- one field note ---------- */
function NoteCard({ p, n, kind }: { p: Prototype; n: number; kind: ShapeKind }) {
  return (
    <a href={`#/${p.slug}`} className="group flex flex-col gap-4 outline-none">
      {/* lifts onto a hard ink shadow on hover */}
      <div
        className={cn(
          "aspect-[16/10] overflow-hidden border border-ink bg-muted transition-[translate,box-shadow] duration-200",
          "group-hover:-translate-x-1 group-hover:-translate-y-1 group-hover:shadow-[6px_6px_0_var(--ink)]",
          "group-focus-visible:outline-3 group-focus-visible:outline-offset-4 group-focus-visible:outline-blue",
          SPRING,
        )}
      >
        {p.preview ? (
          <img src={p.preview} alt="" className="size-full object-cover object-top" />
        ) : (
          <div className="grid size-full place-items-center">
            <Shape kind={kind} className="size-1/5" />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2 text-xs font-medium tracking-widest text-muted-foreground uppercase">
          {/* the form morphs on hover: square ↔ circle, triangle turns */}
          <Shape
            kind={kind}
            className={cn(
              "size-2.5 transition-[rotate,border-radius] duration-300",
              SPRING,
              kind === "square" && "group-hover:rounded-full",
              kind === "circle" && "group-hover:rounded-none",
              kind === "triangle" && "group-hover:rotate-180",
            )}
          />
          {pad(n)}
          {p.created && <span className="ml-auto">{formatDate(p.created)}</span>}
        </div>
        <h2 className="flex items-center gap-1.5 text-xl font-semibold tracking-tight">
          {p.title}
          <ArrowUpRightIcon className="size-4 opacity-0 transition-[opacity,translate] duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100" />
        </h2>
        <p className="line-clamp-2 text-sm text-muted-foreground">{p.description}</p>
        {!!p.tags.length && <p className="text-xs text-muted-foreground">{p.tags.join(" · ")}</p>}
      </div>
    </a>
  )
}

/* ---------- viewer: the field note in a frame, with a quiet bar to get back ---------- */
function Viewer({ p, kind }: { p: Prototype; kind: ShapeKind }) {
  return (
    <div className="flex h-dvh flex-col">
      <div className="flex items-center gap-3 border-b border-ink px-3 py-2 text-sm">
        <a href="#/" className="inline-flex items-center gap-1.5 px-1 outline-none hover:text-red focus-visible:text-blue">
          <ArrowLeftIcon className="size-4" /> All field notes
        </a>
        <span className="h-4 w-px bg-ink" />
        <Shape kind={kind} className="size-2.5" />
        <span className="truncate font-medium">{p.title}</span>
        <a
          href={p.url}
          target="_blank"
          rel="noreferrer"
          className="ml-auto inline-flex items-center gap-1.5 px-1 whitespace-nowrap outline-none hover:text-red focus-visible:text-blue"
        >
          Full screen <ArrowUpRightIcon className="size-4" />
        </a>
      </div>
      {/* allow="midi" lets Web MIDI work inside the frame; same-origin frames may use pointer lock. */}
      <iframe key={p.slug} src={p.url} title={p.title} allow="midi; fullscreen; clipboard-read; clipboard-write" className="w-full flex-1 border-0" />
    </div>
  )
}

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
