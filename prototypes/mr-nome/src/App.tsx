import { useEffect, useRef, useState } from "react"
import { CornerDownLeftIcon, MicIcon, PlayIcon, RotateCcwIcon, SquareIcon } from "lucide-react"
import { Button } from "@prototypes/ui/components/button"
import { Input } from "@prototypes/ui/components/input"
import { Kbd } from "@prototypes/ui/components/kbd"
import { cn } from "@prototypes/ui/lib/utils"
import { command, getState, start, toggle, useEngine, type Beat, type LogEntry, type Program } from "./engine"
import { describe, SUB_NAME } from "./parse"
import { onCommand, setHandsFree, talk, useSpeech } from "./speech"

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

onCommand((t) => command(t, "voice"))

export default function App() {
  const e = useEngine()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.target instanceof HTMLInputElement || ev.metaKey || ev.ctrlKey || ev.altKey) return
      if (ev.key === " ") { ev.preventDefault(); toggle() }
      else if (ev.key === "/") { ev.preventDefault(); inputRef.current?.focus() }
      else if (ev.key === "v" && !ev.repeat) talk()
    }
    addEventListener("keydown", onKey)
    return () => removeEventListener("keydown", onKey)
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
          <Log log={e.log} />
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
    command(text)
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
            : sp.supported ? <>Type, or press <Kbd>V</Kbd> and speak. <Kbd>/</Kbd> to type.</>
            : "Speech isn't available in this browser. Try Chrome or Safari."}
        </span>
        {sp.supported && (
          <label className="flex cursor-pointer items-center gap-2 select-none">
            <input type="checkbox" checked={sp.handsFree} onChange={(ev) => setHandsFree(ev.target.checked)} className="size-4 accent-blue" />
            Hands-free (keeps listening)
          </label>
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

/* ---------- what it heard, and what it made of it ---------- */
function Log({ log }: { log: LogEntry[] }) {
  return (
    <Panel title="Heard">
      {!log.length && <p className="text-sm text-muted-foreground">Nothing yet.</p>}
      <ul className="flex flex-col gap-4">
        {log.map((l) => (
          <li key={l.id} className="text-sm">
            <p className="flex items-start gap-1.5">
              {l.source === "voice" && <MicIcon className="mt-0.5 size-3.5 shrink-0 text-blue" />}
              <span>“{l.parsed.input}”</span>
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {l.parsed.clauses.flatMap((c, ci) => [
                ...c.steps.map((s, si) => (
                  <span key={`${ci}-${si}`} className="border border-ink px-1.5 py-0.5 text-xs">{describe(s)}</span>
                )),
                ...(c.leftover ? [<span key={`${ci}-?`} className="border border-dashed border-red px-1.5 py-0.5 text-xs text-red" title="Not understood">? {c.leftover}</span>] : []),
              ])}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{l.outcome}</p>
          </li>
        ))}
      </ul>
    </Panel>
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
