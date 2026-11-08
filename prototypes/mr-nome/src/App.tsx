import { useEffect, useRef, useState } from "react"
import { CheckIcon, CopyIcon, CornerDownLeftIcon, MicIcon, PlayIcon, RotateCcwIcon, SquareIcon, XIcon } from "lucide-react"
import { Button } from "@prototypes/ui/components/button"
import { Input } from "@prototypes/ui/components/input"
import { Kbd } from "@prototypes/ui/components/kbd"
import { cn } from "@prototypes/ui/lib/utils"
import { command, getState, start, toggle, useEngine, type Beat, type Program } from "./engine"
import { describe, SUB_NAME } from "./parse"
import { clearAll, run, setNote, setVerdict, toMarkdown, useReviews, type Review } from "./review"
import { holdEnd, holdStart, onCommand, setHandsFree, setUseHints, talk, useSpeech } from "./speech"

const SPRING = "transition-transform duration-150 ease-[cubic-bezier(.3,1.6,.5,1)] motion-reduce:transition-none"

const EXAMPLES = [
  "click at 120 bpm",
  "accent the first beat",
  "click in 4/4 meter",
  "click at 60, count in 4, click 4, increase tempo by 10, repeat until 120",
  "waltz at 90 with eighth notes",
  "from 80 go up 5 every 2 bars until 100",
  "click 2 bars, rest 2 bars, repeat",
  "a bit faster",
  "accent 2 and 4",
  "stop",
]

const HINT_LABEL = {
  unsupported: "",
  unavailable: "Vocabulary hints (not available here)",
  downloadable: "Vocabulary hints (downloads a speech model)",
  downloading: "Vocabulary hints (downloads a speech model)",
  installing: "Downloading speech model…",
  available: "Vocabulary hints (on-device)",
}

onCommand((alts, engine) => run(alts[0].text, "voice", alts, engine))

export default function App() {
  const e = useEngine()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      // shortcuts only when nothing is focused: never while typing, and a focused button already handles Space itself
      const t = ev.target as HTMLElement
      if (t.closest?.("input, textarea, select, button, a, [contenteditable]") || ev.metaKey || ev.ctrlKey || ev.altKey) return
      if (ev.key === " ") { ev.preventDefault(); toggle() }
      else if (ev.key === "/") { ev.preventDefault(); inputRef.current?.focus() }
      else if (ev.key === "v" && !ev.repeat) holdStart()
    }
    const onKeyUp = (ev: KeyboardEvent) => { if (ev.key === "v") holdEnd() }
    addEventListener("keydown", onKey)
    addEventListener("keyup", onKeyUp)
    return () => { removeEventListener("keydown", onKey); removeEventListener("keyup", onKeyUp) }
  }, [])

  return (
    <div className="mx-auto min-h-dvh max-w-6xl px-5 pb-16 sm:px-8">
      <header className="flex items-baseline justify-between gap-4 border-b-2 border-ink py-5">
        <h1 className="text-xl font-semibold tracking-tight">Mr. Nome</h1>
        <p className="text-sm text-muted-foreground">A metronome you talk to</p>
      </header>

      <main className="grid gap-10 pt-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="flex min-w-0 flex-col gap-8">
          <Display now={e.now} running={e.running} />
          <CommandBar inputRef={inputRef} />
          <Examples />
        </section>
        <aside className="flex min-w-0 flex-col gap-8">
          <ProgramPanel program={e.program} now={e.now} running={e.running} />
          <Log />
        </aside>
      </main>
    </div>
  )
}

/* ---------- the big display: tempo, meter, beats ---------- */
function Display({ now, running }: { now: Beat | null; running: boolean }) {
  const { settings } = useEngine()
  const s = now?.settings ?? settings
  const counting = running && now?.pos.countIn != null
  return (
    <div className="border border-ink p-6 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-7xl leading-none tabular-nums">{s.bpm}</span>
          <span className="text-sm text-muted-foreground">bpm</span>
        </div>
        <dl className="grid grid-cols-3 gap-x-6 text-sm">
          <Meta label="Meter" value={`${s.meter.beats}/${s.meter.unit}`} />
          <Meta label="Feel" value={SUB_NAME[s.sub]} />
          <Meta label="Bar" value={running && now && !counting ? String(now.pos.bar) : "–"} />
        </dl>
      </div>

      <div className="mt-8 flex min-h-12 flex-wrap items-center gap-3">
        {counting && now ? (
          <>
            <span className="mr-2 text-xs tracking-widest text-muted-foreground uppercase">Count in</span>
            {Array.from({ length: now.pos.total }, (_, i) => (
              <div key={i} className={cn("size-9 [clip-path:polygon(50%_0,100%_100%,0_100%)]", SPRING, i < now.pos.countIn! ? "bg-yellow" : "bg-ink/15", i === now.pos.countIn! - 1 && "scale-115")} />
            ))}
            <span className="ml-2 font-mono text-3xl tabular-nums">{now.pos.countIn}</span>
          </>
        ) : (
          Array.from({ length: s.meter.beats }, (_, i) => {
            const accent = s.accents.includes(i + 1)
            const on = running && now?.pos.barBeat === i
            const muted = on && now?.muted
            return (
              <div
                key={i}
                title={accent ? `Beat ${i + 1} (accented)` : `Beat ${i + 1}`}
                className={cn(
                  "size-10 border-2 border-ink",
                  SPRING,
                  accent ? "" : "rounded-full",
                  on && !muted && (accent ? "scale-115 border-red bg-red" : "scale-115 border-blue bg-blue"),
                  muted && "border-dashed",
                )}
              />
            )
          })
        )}
      </div>

      <div className="mt-8 flex items-center gap-3">
        <Button onClick={toggle} className="w-28">
          {running ? <><SquareIcon /> Stop</> : <><PlayIcon /> Start</>}
        </Button>
        <span className="text-xs text-muted-foreground"><Kbd>Space</Kbd></span>
      </div>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs tracking-widest text-muted-foreground uppercase">{label}</dt>
      <dd className="font-mono">{value}</dd>
    </div>
  )
}

/* ---------- type or talk ---------- */
function CommandBar({ inputRef }: { inputRef: React.RefObject<HTMLInputElement | null> }) {
  const sp = useSpeech()
  const [text, setText] = useState("")
  const submit = (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!text.trim()) return
    run(text, "typed")
    setText("")
  }
  return (
    <div className="flex flex-col gap-2">
      <form onSubmit={submit} className="flex gap-2">
        <Input
          ref={inputRef}
          value={text}
          onChange={(ev) => setText(ev.target.value)}
          placeholder={sp.listening ? "Listening…" : "Tell Mr. Nome what to do"}
          className="h-11 text-base"
          aria-label="Command"
        />
        <Button type="submit" variant="outline" size="icon-lg" aria-label="Send" className="size-11"><CornerDownLeftIcon /></Button>
        {sp.supported && (
          <Button
            type="button"
            variant={sp.listening ? "default" : "outline"}
            size="icon-lg"
            className="size-11"
            aria-label={sp.listening ? "Stop listening" : "Talk"}
            aria-pressed={sp.listening}
            onClick={talk}
          >
            <MicIcon />
          </Button>
        )}
      </form>
      <div className="flex min-h-6 flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm text-muted-foreground">
        <span className="min-w-0 truncate">
          {sp.error ? <span className="text-red">Mic: {sp.error}</span>
            : sp.interim ? <span className="text-ink">“{sp.interim}”</span>
            : sp.listening ? "Listening… finish talking and I'll act."
            : sp.supported ? <>Hold <Kbd>V</Kbd> and speak, or tap it to talk until you pause. <Kbd>/</Kbd> to type.</>
            : "Speech isn't available in this browser. Try Chrome or Safari."}
        </span>
        {sp.supported && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {sp.hints !== "unsupported" && (
              <label
                className={cn("flex items-center gap-2 select-none", sp.hints === "unavailable" ? "opacity-50" : "cursor-pointer")}
                title="Chrome's on-device speech model, told in advance to expect words like “accent” and “click”. Free, private, works offline."
              >
                <input
                  type="checkbox"
                  checked={sp.useHints}
                  disabled={sp.hints === "unavailable" || sp.hints === "installing"}
                  onChange={(ev) => setUseHints(ev.target.checked)}
                  className="size-4 accent-blue"
                />
                {HINT_LABEL[sp.hints]}
              </label>
            )}
            <label className="flex cursor-pointer items-center gap-2 select-none">
              <input type="checkbox" checked={sp.handsFree} onChange={(ev) => setHandsFree(ev.target.checked)} className="size-4 accent-blue" />
              Hands-free (keeps listening)
            </label>
          </div>
        )}
      </div>
    </div>
  )
}

function Examples() {
  return (
    <div>
      <h2 className="mb-3 text-xs tracking-widest text-muted-foreground uppercase">Things to say</h2>
      <ul className="flex flex-wrap gap-2">
        {EXAMPLES.map((x) => (
          <li key={x}>
            <button
              onClick={() => command(x)}
              className="border border-ink/30 px-2.5 py-1 text-left text-sm transition-colors hover:border-ink hover:bg-yellow/25 focus-visible:outline-2 focus-visible:outline-blue"
            >
              {x}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ---------- the compiled routine, with the playhead ---------- */
function ProgramPanel({ program, now, running }: { program: Program | null; now: Beat | null; running: boolean }) {
  if (!program) {
    return (
      <Panel title="Routine">
        <p className="text-sm text-muted-foreground">Free clicking. Say something with a length, a count-in or a repeat to build a routine.</p>
      </Panel>
    )
  }
  const pc = running ? now?.pos.pc : undefined
  const loops = Object.entries(program.loopStart).map(([r, from]) => [from, +r] as const)
  const inLoop = (i: number) => loops.some(([a, b]) => i >= a && i <= b)
  return (
    <Panel
      title="Routine"
      action={!running && (
        <Button variant="ghost" size="xs" onClick={() => start(getState().program)}><RotateCcwIcon /> Run again</Button>
      )}
    >
      <ol className="flex flex-col">
        {program.steps.map((s, i) => {
          const here = pc === i
          const passes = now?.pos.passes[i]
          return (
            <li
              key={i}
              className={cn(
                "flex items-baseline gap-3 border-l-2 py-1.5 pr-2 pl-3 text-sm",
                inLoop(i) ? "border-blue" : "border-transparent",
                here && "bg-yellow/30",
              )}
            >
              <span className="w-5 font-mono text-xs text-muted-foreground tabular-nums">{i + 1}</span>
              <span className={cn("flex-1", here && "font-medium")}>{describe(s)}</span>
              {here && (s.kind === "play" || s.kind === "countIn") && (
                <span className="font-mono text-xs tabular-nums">{now!.pos.done}/{now!.pos.total}</span>
              )}
              {s.kind === "repeat" && running && passes !== undefined && passes > 0 && (
                <span className="font-mono text-xs text-blue tabular-nums">pass {passes + 1}</span>
              )}
            </li>
          )
        })}
        <li className="py-1.5 pl-[calc(0.75rem+2px)] text-sm text-muted-foreground">
          <span className="mr-3 inline-block w-5" />
          {program.steps.at(-1)?.kind === "start" ? "then keep clicking" : "then stop"}
        </li>
      </ol>
    </Panel>
  )
}

/* ---------- what it heard, what it made of it, and your verdict ---------- */
function Log() {
  const log = useReviews()
  const [copied, setCopied] = useState(false)
  const wrong = log.filter((l) => l.verdict === "wrong").length
  const copy = async () => {
    await navigator.clipboard.writeText(toMarkdown())
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <Panel
      title={log.length ? `Heard · ${log.length}${wrong ? ` · ${wrong} wrong` : ""}` : "Heard"}
      action={log.length > 0 && (
        <div className="flex gap-1">
          <Button variant="ghost" size="xs" onClick={copy}>{copied ? <CheckIcon /> : <CopyIcon />} {copied ? "Copied" : "Copy"}</Button>
          <Button variant="ghost" size="xs" onClick={() => confirm("Clear all transcripts and notes?") && clearAll()}>Clear</Button>
        </div>
      )}
    >
      {!log.length && <p className="text-sm text-muted-foreground">Nothing yet. Everything you say or type is kept here so you can mark what it got wrong.</p>}
      <ul className="flex flex-col divide-y divide-ink/15">
        {log.map((l) => <Entry key={l.id} l={l} />)}
      </ul>
    </Panel>
  )
}

function Entry({ l }: { l: Review }) {
  const [open, setOpen] = useState(false)
  const showNote = open || l.verdict === "wrong" || !!l.note
  return (
    <li className="py-3 text-sm first:pt-0">
      <p className="flex items-start gap-1.5">
        {l.source === "voice" && <MicIcon className="mt-0.5 size-3.5 shrink-0 text-blue" aria-label="Spoken" />}
        <span>“{l.transcript}”</span>
        {l.engine === "on-device" && <span className="ml-auto shrink-0 text-xs tracking-widest text-muted-foreground uppercase" title="Heard by Chrome's on-device model with vocabulary hints">hints</span>}
      </p>
      {l.alternatives && (
        <p className="mt-0.5 text-xs text-muted-foreground">
          {l.used
            ? <>picked over “{l.alternatives[0].text}”</>
            : <>or: {l.alternatives.slice(1).map((a) => `“${a.text}”`).join(", ")}</>}
        </p>
      )}
      <div className="mt-1.5 flex flex-wrap gap-1">
        {l.understood.flatMap((c, ci) => [
          ...c.steps.map((s, si) => <span key={`${ci}-${si}`} className="border border-ink px-1.5 py-0.5 text-xs">{s}</span>),
          ...(c.leftover ? [<span key={`${ci}-?`} className="border border-dashed border-red px-1.5 py-0.5 text-xs text-red" title="Not understood">? {c.leftover}</span>] : []),
        ])}
      </div>
      <div className="mt-1.5 flex items-center gap-1">
        <p className="mr-auto text-xs text-muted-foreground">{l.outcome}</p>
        <Verdict on={l.verdict === "right"} onClick={() => setVerdict(l.id, "right")} label="Got it right" className="aria-pressed:bg-blue aria-pressed:border-blue aria-pressed:text-paper">
          <CheckIcon />
        </Verdict>
        <Verdict on={l.verdict === "wrong"} onClick={() => setVerdict(l.id, "wrong")} label="Got it wrong" className="aria-pressed:bg-red aria-pressed:border-red aria-pressed:text-paper">
          <XIcon />
        </Verdict>
        {!showNote && <Button variant="ghost" size="xs" onClick={() => setOpen(true)}>Note</Button>}
      </div>
      {showNote && (
        <textarea
          defaultValue={l.note}
          onChange={(ev) => setNote(l.id, ev.target.value)}
          placeholder="What did you expect it to do?"
          rows={2}
          autoFocus={open && !l.note}
          className="mt-2 w-full resize-y border border-ink/40 bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-blue"
        />
      )}
    </li>
  )
}

function Verdict({ on, onClick, label, className, children }: { on: boolean; onClick: () => void; label: string; className: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      title={label}
      className={cn("grid size-6 place-items-center border border-ink/40 transition-colors hover:border-ink focus-visible:outline-2 focus-visible:outline-blue [&_svg]:size-3.5", className)}
    >
      {children}
    </button>
  )
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between border-b border-ink pb-2">
        <h2 className="text-xs tracking-widest text-muted-foreground uppercase">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}
