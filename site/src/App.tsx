import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react"
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

/* The title, a rule, and three small shapes sitting on the rule at the right.
   Their order is shuffled on each load, and again whenever you click one. */
type Piece = { kind: ShapeKind; size: number }
// Optically matched, not equal: a circle reads smaller than a square of the same width, and a triangle
// fills only half its box, so each gets a little more.
const PIECES: Piece[] = [
  { kind: "circle", size: 24 },
  { kind: "square", size: 22 },
  { kind: "triangle", size: 26 },
]
const shuffle = (ps: Piece[]) => [...ps].sort(() => Math.random() - 0.5)
const order = (ps: Piece[]) => ps.map((p) => p.kind).join()

function Header() {
  const [pieces, setPieces] = useState(() => shuffle(PIECES))
  const els = useRef(new Map<ShapeKind, HTMLButtonElement>())
  const before = useRef<Map<ShapeKind, DOMRect> | null>(null)

  // always land on a different order, so every click visibly does something
  const reshuffle = () => {
    before.current = new Map([...els.current].map(([kind, el]) => [kind, el.getBoundingClientRect()]))
    setPieces((ps) => {
      let next = shuffle(ps)
      while (order(next) === order(ps)) next = shuffle(ps)
      return next
    })
  }

  // FLIP: after the reorder, start each shape where it was and animate it home. Shapes moving right hop
  // over, shapes moving left pass under, like a shell game.
  useLayoutEffect(() => {
    const prev = before.current
    before.current = null
    if (!prev || matchMedia("(prefers-reduced-motion: reduce)").matches) return
    els.current.forEach((el, kind) => {
      const from = prev.get(kind)
      if (!from) return
      el.getAnimations().forEach((a) => a.cancel()) // a quick second click starts from where it is now
      const to = el.getBoundingClientRect()
      const dx = from.left - to.left
      const dy = from.top - to.top
      if (!dx && !dy) return
      const arc = Math.min(Math.abs(dx) * 0.4, 22) * (dx < 0 ? -1 : 1)
      el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px)` },
          { transform: `translate(${dx / 2}px, ${dy / 2 + arc}px)` },
          { transform: "translate(0, 0)" },
        ],
        { duration: 520, easing: "cubic-bezier(.45,0,.25,1)" },
      )
    })
  }, [pieces])

  // On load, play the shuffle once so visitors see the shapes are alive. (The timer's cleanup also keeps
  // StrictMode's double-mount in dev from shuffling twice.)
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const t = setTimeout(reshuffle, 600)
    return () => clearTimeout(t)
  }, [])

  return (
    <header className="relative border-b-2 border-ink pt-20 pb-14 sm:pt-28 sm:pb-12">
      <h1 className="text-5xl leading-none font-semibold tracking-tight sm:text-6xl">Field Notes</h1>
      <p className="mt-4 max-w-lg text-muted-foreground">
        <ExternalLink href="https://markkaylor.com/">Mark Kaylor's</ExternalLink>{" "}
        Interactive design experiments. Always in <span className="italic">process.</span></p>

      <div className="absolute right-2 bottom-2 flex items-center gap-3">
        {pieces.map((p) => (
          <button
            key={p.kind}
            ref={(el) => { if (el) els.current.set(p.kind, el); else els.current.delete(p.kind) }}
            onClick={reshuffle}
            aria-label="Shuffle the shapes"
            className="grid cursor-pointer place-items-center outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue"
          >
            <Shape
              kind={p.kind}
              className={cn("transition-[scale] duration-300 hover:scale-110", SPRING)}
              style={{ width: p.size, height: p.size }}
            />
          </button>
        ))}
      </div>
    </header>
  )
}

/* Opens in a new tab. The ↗ slides out right after the text on hover/focus. It's the only place the site
   uses it, and it always means "leaves the site". */
function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="group/ext text-foreground underline decoration-1 underline-offset-4 outline-none hover:text-red focus-visible:text-blue"
    >
      {children}
      {/* zero width at rest, so the line reads normally until you point at the link */}
      <span
        aria-hidden
        className={cn(
          // the gap opens smoothly (no overshoot, so the text glides rather than bounces)
          "inline-block w-0 overflow-hidden align-[0.05em] transition-[width] duration-300 ease-out motion-reduce:transition-none",
          "group-hover/ext:w-[0.75em] group-focus-visible/ext:w-[0.75em]",
        )}
      >
        {/* ...and the arrow drifts in from the bottom-left a beat behind it */}
        <ArrowUpRightIcon
          className={cn(
            "ml-[0.1em] size-[0.65em] -translate-x-[0.3em] translate-y-[0.2em] stroke-[2.5] opacity-0 transition-[translate,opacity] duration-300 ease-out motion-reduce:transition-none",
            "group-hover/ext:translate-0 group-hover/ext:opacity-100 group-hover/ext:delay-75",
            "group-focus-visible/ext:translate-0 group-focus-visible/ext:opacity-100",
          )}
        />
      </span>
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}

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
        <h2 className="text-xl font-semibold tracking-tight">{p.title}</h2>
        <p className="line-clamp-2 text-sm text-muted-foreground">{p.description}</p>
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
      {/* allow="midi" lets Web MIDI work inside the frame, "microphone" lets Mr. Nome listen; same-origin frames may use pointer lock. */}
      <iframe key={p.slug} src={p.url} title={p.title} allow="midi; microphone; fullscreen; clipboard-read; clipboard-write" className="w-full flex-1 border-0" />
    </div>
  )
}

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
