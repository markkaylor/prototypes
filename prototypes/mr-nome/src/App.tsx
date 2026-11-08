import { useEffect, useMemo, useRef, useState } from "react"
import { CheckIcon, CopyIcon, CornerDownLeftIcon, MicIcon, PlayIcon, RotateCcwIcon, SquareIcon, XIcon } from "lucide-react"
import { Button } from "@prototypes/ui/components/button"
import { Input } from "@prototypes/ui/components/input"
import { Kbd } from "@prototypes/ui/components/kbd"
import { cn } from "@prototypes/ui/lib/utils"
import { getState, start, stop, useEngine, type Beat } from "./engine"
import { describe, normalize, parse, SUB_NAME } from "./parse"
import { clearAll, run, setHandler, setNote, setVerdict, toMarkdown, useReviews, type Review } from "./review"
import {
  addEntry, clearLines, compileLines, getLines, loadExample, removeAt, removeLast, removeLine, updateLine, useLines,
  type Compiled,
} from "./routine"
import { holdEnd, holdStart, onCommand, setHandsFree, setUseHints, talk, useSpeech } from "./speech"

const SPRING = "transition-transform duration-150 ease-[cubic-bezier(.3,1.6,.5,1)] motion-reduce:transition-none"

const EXAMPLES = [
  "Tempo at 60 BPM",
  "Count in 4 beats",
  "Click for 8 beats",
  "Increase tempo by 10",
  "Repeat from 2 until 120 BPM",
  "Accent beats 1 and 3",
  "3/4 time",
  "Eighth notes",
  "Rest for 2 bars",
  "Repeat 3 times",
]

const HINT_LABEL = {
  unsupported: "",
  unavailable: "Vocabulary hints (not available here)",
  downloadable: "Vocabulary hints (downloads a speech model)",
  downloading: "Vocabulary hints (downloads a speech model)",
  installing: "Downloading speech model…",
  available: "Vocabulary hints (on-device)",
}

/* ---------- playing the routine ---------- */

// The compile that's playing, so the playhead can map the engine's step back to a line.
let playing: Compiled | null = null
let playedTexts = ""
const texts = () => getLines().map((l) => l.text)
function play() {
  playing = compileLines(texts())
  playedTexts = JSON.stringify(texts())
  start(playing.program)
}
const togglePlay = () => (getState().running ? stop() : play())

/** What a typed or spoken entry does: transport, an edit, or a new routine line. */
setHandler((text) => {
  const parsed = parse(text)
  const n = normalize(text)
  const kinds = parsed.steps.map((s) => s.kind)
  const leftover = parsed.clauses.some((c) => c.leftover)
  if (/^(?:undo|scratch that|delete (?:that|it|the last (?:one|step|line)|last (?:one|step|line))|remove (?:that|it|the last (?:one|step|line)))$/.test(n)) {
    removeLast(); return { parsed, outcome: "Removed the last step." }
  }
  const del = n.match(/^(?:delete|remove|scratch) (?:step |line |number )?(\d{1,2})$/)
  if (del) { removeAt(+del[1]); return { parsed, outcome: `Removed step ${del[1]}.` } }
  if (/^(?:clear|delete|remove) (?:all|everything|the routine|all (?:the )?steps)$|^start over$/.test(n)) {
    clearLines(); return { parsed, outcome: "Cleared the routine." }
  }
  if (kinds.length && kinds.every((k) => k === "stop")) { stop(); return { parsed, outcome: "Stopped." } }
  if (kinds.length && kinds.every((k) => k === "start") && !leftover) { play(); return { parsed, outcome: "Running the routine." } }
  // a new line, unless nothing in it was understood (hands-free hears the room)
  if (!parsed.steps.length) return { parsed, outcome: "Didn't catch a step, so nothing was added." }
  const added = addEntry(text)
  // log what the routine understood (it can resolve "repeat from 2"; the entry on its own can't)
  const understood = compileLines(texts()).understood
  const clauses = added.flatMap((n) => understood[n - 1] ?? [])
  return {
    parsed: { input: text, clauses, steps: clauses.flatMap((c) => c.steps) },
    outcome: `Added step${added.length > 1 ? "s" : ""} ${added.join(", ")}.`,
  }
})

onCommand((alts, engine) => run(alts[0].text, "voice", alts, engine))

export default function App() {
  const e = useEngine()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      // shortcuts only when nothing is focused: never while typing, and a focused button already handles Space itself
      const t = ev.target as HTMLElement
      if (t.closest?.("input, textarea, select, button, a, [contenteditable]") || ev.metaKey || ev.ctrlKey || ev.altKey) return
      if (ev.key === " ") { ev.preventDefault(); togglePlay() }
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
          <RoutineBuilder now={e.now} running={e.running} inputRef={inputRef} />
          <Examples />
        </section>
        <aside className="flex min-w-0 flex-col gap-8">
          <Log />
        </aside>
      </main>
    </div>
  )
}

/* ---------- the big display: tempo, meter, beats ---------- */
function Display({ now, running }: { now: Beat | null; running: boolean }) {
  const { settings } = useEngine()
  const lines = useLines()
  const s = now?.settings ?? settings
  const counting = running && now?.pos.countIn != null
  const edited = running && JSON.stringify(lines.map((l) => l.text)) !== playedTexts
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

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Button onClick={togglePlay} className="w-28">
          {running ? <><SquareIcon /> Stop</> : <><PlayIcon /> Start</>}
        </Button>
        <span className="text-xs text-muted-foreground"><Kbd>Space</Kbd></span>
        {edited && (
          <Button variant="ghost" size="sm" onClick={play}><RotateCcwIcon /> Restart with your edits</Button>
        )}
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

/* ---------- the routine: numbered lines you add, edit and delete ---------- */
function RoutineBuilder({ now, running, inputRef }: { now: Beat | null; running: boolean; inputRef: React.RefObject<HTMLInputElement | null> }) {
  const lines = useLines()
  const compiled = useMemo(() => compileLines(lines.map((l) => l.text)), [lines])
  const rowRefs = useRef(new Map<string, HTMLInputElement>())

  // the playhead: the step being heard, mapped back to the line it came from
  const engineSteps = useEngine().program?.steps
  const heard = running && now && playing && engineSteps ? engineSteps[now.pos.pc] : undefined
  const activeLine = heard ? playing!.lineOf.get(heard) : undefined

  // which lines sit inside a loop (from the current text, so the bracket follows your edits)
  const loopLines = new Set<number>()
  for (const [r, from] of Object.entries(compiled.program.loopStart)) {
    const steps = compiled.program.steps
    const a = compiled.lineOf.get(steps[from]), b = compiled.lineOf.get(steps[+r])
    if (a !== undefined && b !== undefined) for (let i = a; i <= b; i++) loopLines.add(i)
  }

  const focusRow = (i: number) => {
    const l = getLines()[i]
    if (l) requestAnimationFrame(() => rowRefs.current.get(l.id)?.focus())
    else inputRef.current?.focus()
  }

  return (
    <Panel
      title="Routine"
      action={lines.length ? (
        <Button variant="ghost" size="xs" onClick={() => confirm("Clear every step?") && clearLines()}>Clear</Button>
      ) : (
        <Button variant="ghost" size="xs" onClick={loadExample}>Load an example</Button>
      )}
    >
      {!lines.length && (
        <p className="mb-4 text-sm text-muted-foreground">
          No steps yet. Add them one at a time below, by typing or holding <Kbd>V</Kbd> and talking.
        </p>
      )}
      <ol className="flex flex-col">
        {lines.map((l, i) => {
          const understood = compiled.understood[i] ?? []
          const steps = understood.flatMap((c) => c.steps)
          const leftover = understood.map((c) => c.leftover).filter(Boolean).join(" ")
          const active = activeLine === i
          const timed = active && heard && (heard.kind === "play" || heard.kind === "countIn")
          const repeat = steps.find((s) => s.kind === "repeat")
          const repeatIdx = repeat && playing ? playing.program.steps.findIndex((s) => playing!.lineOf.get(s) === i && s.kind === "repeat") : -1
          const passes = running && repeatIdx >= 0 ? now?.pos.passes[repeatIdx] : undefined
          const target = repeat?.kind === "repeat" && repeat.from ? compiled.lineOf.get(repeat.from) : undefined
          return (
            <li
              key={l.id}
              className={cn(
                "group flex items-start gap-3 border-l-2 py-2 pr-1 pl-3",
                loopLines.has(i) ? "border-blue" : "border-transparent",
                active && "bg-yellow/30",
              )}
            >
              <span className="w-6 pt-1.5 text-right font-mono text-sm text-muted-foreground tabular-nums">{i + 1}.</span>
              <div className="min-w-0 flex-1">
                <input
                  ref={(el) => { if (el) rowRefs.current.set(l.id, el); else rowRefs.current.delete(l.id) }}
                  value={l.text}
                  onChange={(ev) => updateLine(l.id, ev.target.value)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter") { ev.preventDefault(); focusRow(i + 1) }
                    if (ev.key === "Backspace" && !l.text) { ev.preventDefault(); removeLine(l.id); focusRow(i - 1) }
                  }}
                  aria-label={`Step ${i + 1}`}
                  className={cn("w-full border-b border-transparent bg-transparent py-1 text-base outline-none hover:border-ink/30 focus:border-blue", active && "font-medium")}
                />
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {steps.map((s, si) => <span key={si} className="border border-ink px-1.5 py-0.5 text-xs">{describe(s)}</span>)}
                  {(leftover || (!steps.length && l.text.trim())) && (
                    <span className="border border-dashed border-red px-1.5 py-0.5 text-xs text-red" title="Not understood">? {leftover || l.text}</span>
                  )}
                  {target !== undefined && (
                    <span className="text-xs text-blue">↺ back to {target + 1}. {lines[target]?.text}</span>
                  )}
                </div>
                {compiled.endless.has(i) && (
                  <p className="mt-1 text-xs text-red">
                    Nothing in this loop changes the tempo, so it never reaches {repeat?.kind === "repeat" ? repeat.until : ""}. Add a step like “Increase tempo by 10” before this one.
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2 pt-1.5">
                {timed && <span className="font-mono text-xs tabular-nums">{now!.pos.done}/{now!.pos.total}</span>}
                {passes !== undefined && passes > 0 && <span className="font-mono text-xs text-blue tabular-nums">pass {passes + 1}</span>}
                <button
                  onClick={() => removeLine(l.id)}
                  aria-label={`Delete step ${i + 1}`}
                  title="Delete"
                  className="grid size-6 place-items-center text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100 hover:text-ink focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-blue [&_svg]:size-4"
                >
                  <XIcon />
                </button>
              </div>
            </li>
          )
        })}
      </ol>
      {lines.length > 0 && (
        <p className="py-1 pl-12 text-sm text-muted-foreground">{compiled.open ? "Then keeps clicking." : "Then stops."}</p>
      )}
      <AddStep inputRef={inputRef} n={lines.length + 1} />
    </Panel>
  )
}

/* ---------- add a step: type or talk ---------- */
function AddStep({ inputRef, n }: { inputRef: React.RefObject<HTMLInputElement | null>; n: number }) {
  const sp = useSpeech()
  const [text, setText] = useState("")
  const submit = (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!text.trim()) return
    run(text, "typed")
    setText("")
  }
  return (
    <div className="mt-2 flex flex-col gap-2">
      <form onSubmit={submit} className="flex items-center gap-2">
        <span className="w-9 shrink-0 text-right font-mono text-sm text-muted-foreground tabular-nums">{n}.</span>
        <Input
          ref={inputRef}
          value={text}
          onChange={(ev) => setText(ev.target.value)}
          placeholder={sp.listening ? "Listening…" : n === 1 ? "Add a step: “Tempo at 60 BPM”" : "Add a step"}
          className="h-11 text-base"
          aria-label="Add a step"
        />
        <Button type="submit" variant="outline" size="icon-lg" aria-label="Add" className="size-11"><CornerDownLeftIcon /></Button>
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
      <div className="flex min-h-6 flex-wrap items-center justify-between gap-x-4 gap-y-2 pl-11 text-sm text-muted-foreground">
        <span className="min-w-0">
          {sp.error ? <span className="text-red">Mic: {sp.error}</span>
            : sp.interim ? <span className="text-ink">“{sp.interim}”</span>
            : sp.listening ? "Listening… finish talking and I'll add it."
            : sp.supported ? <>Hold <Kbd>V</Kbd> to talk. Say “start” or “stop” to play, “delete 3” or “undo” to edit.</>
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
      <h2 className="mb-3 text-xs tracking-widest text-muted-foreground uppercase">Steps you can add</h2>
      <ul className="flex flex-wrap gap-2">
        {EXAMPLES.map((x) => (
          <li key={x}>
            <button
              onClick={() => addEntry(x)}
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
