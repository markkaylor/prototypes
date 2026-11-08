import { useEffect, useMemo, useRef, useState } from "react"
import { GripVerticalIcon, PlayIcon, RotateCcwIcon, SquareIcon, XIcon } from "lucide-react"
import { Button } from "@prototypes/ui/components/button"
import { Kbd } from "@prototypes/ui/components/kbd"
import { Shape } from "@prototypes/ui/components/shape"
import { cn } from "@prototypes/ui/lib/utils"
import { getState, start, stop, useEngine, type Beat } from "./engine"
import {
  addBlock, clearBlocks, compileBlocks, getBlocks, loadExample, meterBefore, moveBlock, removeBlock, updateBlock, useBlocks,
  type Block, type BlockBody, type Compiled, type Kind,
} from "./blocks"
import { SUB_NAME } from "./steps"

const SPRING = "transition-transform duration-150 ease-[cubic-bezier(.3,1.6,.5,1)] motion-reduce:transition-none"

/* ---------- playing the routine ---------- */

// The compile that's playing, so the playhead can map the engine's step back to a block.
let playing: Compiled | null = null
let playedBlocks: Block[] | null = null
function play() {
  playedBlocks = getBlocks()
  playing = compileBlocks(playedBlocks)
  start(playing.program)
}
const togglePlay = () => (getState().running ? stop() : play())

export default function App() {
  const e = useEngine()

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      // shortcuts only when nothing is focused: never while typing, and a focused button already handles Space itself
      const t = ev.target as HTMLElement
      if (t.closest?.("input, textarea, select, button, a, [contenteditable]") || ev.metaKey || ev.ctrlKey || ev.altKey) return
      if (ev.key === " ") { ev.preventDefault(); togglePlay() }
    }
    addEventListener("keydown", onKey)
    return () => removeEventListener("keydown", onKey)
  }, [])

  return (
    <div className="mx-auto min-h-dvh max-w-6xl px-5 pb-16 sm:px-8">
      <header className="flex items-baseline justify-between gap-4 border-b-2 border-ink py-5">
        <h1 className="text-xl font-semibold tracking-tight">Mr. Nome</h1>
        <p className="text-sm text-muted-foreground">A metronome you program</p>
      </header>

      <main className="grid gap-10 pt-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="flex min-w-0 flex-col gap-8">
          <Display now={e.now} running={e.running} />
          <RoutineBuilder now={e.now} running={e.running} />
        </section>
        <aside className="min-w-0 lg:sticky lg:top-8 lg:self-start">
          <Palette />
        </aside>
      </main>
    </div>
  )
}

/* ---------- the big display: tempo, meter, beats ---------- */
function Display({ now, running }: { now: Beat | null; running: boolean }) {
  const { settings } = useEngine()
  const blocks = useBlocks()
  const s = now?.settings ?? settings
  const counting = running && now?.pos.countIn != null
  const edited = running && blocks !== playedBlocks
  return (
    <div className="border border-ink p-6 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-7xl leading-none tabular-nums">{s.bpm}</span>
          <span className="text-sm text-muted-foreground">bpm</span>
        </div>
        <dl className="grid grid-cols-3 gap-x-6 text-sm">
          <Meta label="Meter" value={`${s.meter.beats}/${s.meter.unit}`} />
          <Meta label="Subdivide" value={SUB_NAME[s.sub]} />
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

/* ---------- the routine: a list of blocks you add, edit, reorder and delete ---------- */

/** Settings are circles, anything that makes sound is a square, the loop is a triangle. */
const FAMILY: Record<Kind, "circle" | "square" | "triangle"> = {
  tempo: "circle", tempoBy: "circle", tempoMul: "circle", meter: "circle", accent: "circle", sub: "circle",
  countIn: "square", play: "square", repeat: "triangle",
}

function RoutineBuilder({ now, running }: { now: Beat | null; running: boolean }) {
  const blocks = useBlocks()
  const compiled = useMemo(() => compileBlocks(blocks), [blocks])
  const rows = useRef(new Map<string, HTMLLIElement>())
  const [drag, setDrag] = useState<{ id: string; armed: boolean; at: number | null } | null>(null)

  // the playhead: the step being heard, mapped back to the block it came from
  const engineSteps = useEngine().program?.steps
  const heard = running && now && playing && engineSteps ? engineSteps[now.pos.pc] : undefined
  const activeBlock = heard ? playing!.blockOf.get(heard) : undefined

  // loop brackets, outermost first: [start, end] block indexes
  const loops = [...compiled.loops].map(([end, startAt]) => [startAt, end] as const).sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))

  const focusBlock = (id: string, sel = "input, select, button[data-field]") =>
    requestAnimationFrame(() => (rows.current.get(id)?.querySelector(sel) as HTMLElement | null)?.focus())
  // a block added from the palette: focus its first field, so you can set it straight away
  useEffect(() => { focusAdded = (id) => focusBlock(id); return () => { focusAdded = null } })
  const move = (id: string, by: number) => {
    const i = blocks.findIndex((b) => b.id === id)
    moveBlock(id, i + by)
    focusBlock(id, "[data-grip]")
  }
  const drop = () => {
    if (drag?.at == null) return setDrag(null)
    const from = blocks.findIndex((b) => b.id === drag.id)
    moveBlock(drag.id, drag.at > from ? drag.at - 1 : drag.at)
    setDrag(null)
  }

  return (
    <Panel
      title="Routine"
      action={blocks.length ? (
        <Button variant="ghost" size="xs" onClick={() => confirm("Clear every step?") && clearBlocks()}>Clear</Button>
      ) : (
        <Button variant="ghost" size="xs" onClick={loadExample}>Load an example</Button>
      )}
    >
      {!blocks.length && (
        <p className="mb-4 text-sm text-muted-foreground">
          No steps yet. Add blocks from the list, or load an example.
        </p>
      )}
      <ol className="flex flex-col" onDragOver={(ev) => drag && ev.preventDefault()} onDrop={drop}>
        {blocks.map((b, i) => {
          const active = activeBlock === i
          const timed = active && heard && (heard.kind === "play" || heard.kind === "countIn")
          const repeatIdx = b.kind === "repeat" && playing ? playing.program.steps.findIndex((s) => s.kind === "repeat" && playing!.blockOf.get(s) === i) : -1
          const passes = running && repeatIdx >= 0 ? now?.pos.passes[repeatIdx] : undefined
          const brackets = loops.filter(([a, z]) => a <= i && i <= z)
          const dropLine = drag?.at === i ? "before" : drag?.at === i + 1 && i === blocks.length - 1 ? "after" : null
          return (
            <li
              key={b.id}
              ref={(el) => { if (el) rows.current.set(b.id, el); else rows.current.delete(b.id) }}
              draggable={drag?.id === b.id && drag.armed}
              onDragStart={(ev) => { ev.dataTransfer.effectAllowed = "move"; ev.dataTransfer.setData("text/plain", b.id) }}
              onDragEnd={() => setDrag(null)}
              onDragOver={(ev) => {
                if (!drag) return
                const r = ev.currentTarget.getBoundingClientRect()
                const at = ev.clientY < r.top + r.height / 2 ? i : i + 1
                if (at !== drag.at) setDrag({ ...drag, at })
              }}
              className={cn(
                "group relative flex items-stretch gap-2 pr-1",
                active && "bg-yellow/30",
                drag?.id === b.id && drag.at !== null && "opacity-40",
              )}
            >
              {dropLine && <span className={cn("absolute inset-x-0 h-0.5 bg-blue", dropLine === "before" ? "top-0" : "bottom-0")} />}
              <span className="w-6 shrink-0 py-2.5 text-right font-mono text-sm text-muted-foreground tabular-nums">{i + 1}.</span>
              {brackets.map(([a, z]) => (
                <span
                  key={`${a}-${z}`}
                  aria-hidden
                  className={cn("w-2.5 shrink-0 border-l-2 border-blue", i === a && "mt-2 border-t-2", i === z && "mb-2 border-b-2")}
                />
              ))}
              <button
                data-grip
                aria-label={`Move step ${i + 1} (arrow keys)`}
                title="Drag to move"
                onPointerDown={() => setDrag({ id: b.id, armed: true, at: null })}
                onPointerUp={() => drag?.at == null && setDrag(null)}
                onKeyDown={(ev) => {
                  if (ev.key === "ArrowUp" && i > 0) { ev.preventDefault(); move(b.id, -1) }
                  if (ev.key === "ArrowDown" && i < blocks.length - 1) { ev.preventDefault(); move(b.id, 1) }
                }}
                className="grid w-5 shrink-0 cursor-grab place-items-center text-muted-foreground opacity-40 transition-opacity group-hover:opacity-100 hover:text-ink focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-blue active:cursor-grabbing [&_svg]:size-4"
              >
                <GripVerticalIcon />
              </button>
              <div className="min-w-0 flex-1 py-1.5">
                <BlockRow b={b} i={i} blocks={blocks} compiled={compiled} active={active} />
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {timed && <span className="font-mono text-xs tabular-nums">{now!.pos.done}/{now!.pos.total}</span>}
                {passes !== undefined && passes > 0 && <span className="font-mono text-xs text-blue tabular-nums">pass {passes + 1}</span>}
                <button
                  onClick={() => removeBlock(b.id)}
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
      {blocks.length > 0 && (
        <p className="py-1 pl-9 text-sm text-muted-foreground">{compiled.open ? "Then keeps clicking." : "Then stops."}</p>
      )}
    </Panel>
  )
}

/* ---------- one block: a sentence with fields in it ---------- */
function BlockRow({ b, i, blocks, compiled, active }: { b: Block; i: number; blocks: Block[]; compiled: Compiled; active: boolean }) {
  const set = (patch: Partial<BlockBody>) => updateBlock(b.id, patch)
  const n = `step ${i + 1}`
  const body = (() => {
    switch (b.kind) {
      case "tempo": return <>Tempo <Num value={b.bpm} min={20} max={400} onChange={(bpm) => set({ bpm })} label={`${n} tempo`} /> bpm</>
      case "tempoBy": return (
        <>
          <Sel value={b.delta < 0 ? "down" : "up"} onChange={(v) => set({ delta: Math.abs(b.delta) * (v === "down" ? -1 : 1) })} label={`${n} direction`}
            options={[["up", "Speed up"], ["down", "Slow down"]]} />
          by <Num value={Math.abs(b.delta)} min={1} max={200} onChange={(d) => set({ delta: d * Math.sign(b.delta || 1) })} label={`${n} amount`} /> bpm
        </>
      )
      case "tempoMul": return (
        <><Sel value={b.factor > 1 ? "2" : "0.5"} onChange={(v) => set({ factor: +v })} label={`${n} change`} options={[["2", "Double"], ["0.5", "Halve"]]} /> the tempo</>
      )
      case "meter": return (
        <>
          Time <Num value={b.beats} min={1} max={16} onChange={(beats) => set({ beats })} label={`${n} beats per bar`} />/
          <Sel value={String(b.unit)} onChange={(v) => set({ unit: +v })} label={`${n} beat unit`} options={[["2", "2"], ["4", "4"], ["8", "8"], ["16", "16"]]} />
        </>
      )
      case "accent": {
        const beats = meterBefore(blocks, i)
        return (
          <>
            Accent
            <span className="inline-flex gap-1">
              {Array.from({ length: beats }, (_, k) => {
                const on = b.beats.includes(k + 1)
                return (
                  <button
                    key={k}
                    data-field
                    aria-pressed={on}
                    aria-label={`${n}: accent beat ${k + 1}`}
                    onClick={() => set({ beats: on ? b.beats.filter((x) => x !== k + 1) : [...b.beats, k + 1] })}
                    className={cn(
                      "grid size-6 place-items-center border border-ink font-mono text-xs tabular-nums focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue",
                      on ? "border-red bg-red text-paper" : "hover:bg-yellow/25",
                    )}
                  >
                    {k + 1}
                  </button>
                )
              })}
            </span>
            {!b.beats.length && <span className="text-muted-foreground">(none)</span>}
          </>
        )
      }
      case "sub": return (
        <>Subdivide <Sel value={String(b.sub)} onChange={(v) => set({ sub: +v as 1 | 2 | 3 | 4 })} label={`${n} subdivision`}
          options={([1, 2, 3, 4] as const).map((k) => [String(k), SUB_NAME[k]])} /></>
      )
      case "countIn": return (
        <>Count in <Num value={b.n} min={1} max={32} onChange={(v) => set({ n: v })} label={`${n} count-in length`} />
          <Sel value={b.unit} onChange={(unit) => set({ unit: unit as "beats" | "bars" })} label={`${n} unit`} options={[["beats", "beats"], ["bars", "bars"]]} /></>
      )
      case "play": return (
        <>
          <Sel value={b.muted ? "rest" : "click"} onChange={(v) => set({ muted: v === "rest" })} label={`${n} sound`} options={[["click", "Click"], ["rest", "Rest"]]} />
          for <Num value={b.n} min={1} max={999} onChange={(v) => set({ n: v })} label={`${n} length`} />
          <Sel value={b.unit} onChange={(unit) => set({ unit: unit as "beats" | "bars" })} label={`${n} unit`} options={[["beats", "beats"], ["bars", "bars"]]} />
        </>
      )
      case "repeat": {
        const startAt = compiled.loops.get(i)
        const above = blocks.slice(0, i)
        return (
          <>
            Repeat
            <Sel value={b.mode} onChange={(mode) => set({ mode: mode as typeof b.mode })} label={`${n} until`}
              options={[["until", "until"], ["times", "again"], ["forever", "forever"]]} />
            {b.mode === "until" && <><Num value={b.until} min={20} max={400} onChange={(until) => set({ until })} label={`${n} target tempo`} /> bpm</>}
            {b.mode === "times" && <><Num value={b.times} min={1} max={99} onChange={(times) => set({ times })} label={`${n} repeats`} /> {b.times === 1 ? "time" : "times"}</>}
            {above.length > 0 && (
              <span className="basis-full text-sm text-blue">
                ↺ back to{" "}
                <Sel value={startAt !== undefined ? blocks[startAt].id : ""} onChange={(from) => set({ from })} label={`${n} loops back to`}
                  options={above.map((x, k) => [x.id, `${k + 1}. ${summary(x)}`])} />
              </span>
            )}
            {compiled.endless.has(i) && (
              <span className="basis-full text-xs text-red">
                Nothing in this loop changes the tempo, so it never reaches {b.until}. Add a “Speed up” block inside it.
              </span>
            )}
          </>
        )
      }
    }
  })()
  const shape = FAMILY[b.kind]
  const rest = b.kind === "play" && b.muted
  return (
    <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-base", active && "font-medium")}>
      {rest
        ? <span aria-hidden className="size-2.5 shrink-0 border-2 border-red" />
        : <Shape kind={shape} className={cn("size-2.5", shape === "triangle" && "size-3")} />}
      {body}
    </div>
  )
}

function summary(b: Block): string {
  switch (b.kind) {
    case "tempo": return `Tempo ${b.bpm}`
    case "tempoBy": return `${b.delta < 0 ? "Slow down" : "Speed up"} by ${Math.abs(b.delta)}`
    case "tempoMul": return b.factor > 1 ? "Double tempo" : "Halve tempo"
    case "meter": return `Time ${b.beats}/${b.unit}`
    case "accent": return b.beats.length ? `Accent ${[...b.beats].sort((x, y) => x - y).join(", ")}` : "No accents"
    case "sub": return `Subdivide ${SUB_NAME[b.sub]}`
    case "countIn": return `Count in ${b.n} ${b.unit}`
    case "play": return `${b.muted ? "Rest" : "Click"} for ${b.n} ${b.unit}`
    case "repeat": return b.mode === "until" ? `Repeat until ${b.until}` : b.mode === "times" ? `Repeat ${b.times} more` : "Repeat forever"
  }
}

/** A number inside a block. Type it, or nudge it with ↑/↓ (Shift: by 10). */
function Num({ value, onChange, min, max, label }: { value: number; onChange: (n: number) => void; min: number; max: number; label: string }) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? String(value)
  const clamp = (x: number) => Math.min(max, Math.max(min, x))
  return (
    <input
      inputMode="numeric"
      aria-label={label}
      value={shown}
      onChange={(ev) => {
        setDraft(ev.target.value)
        const x = parseInt(ev.target.value, 10)
        if (!Number.isNaN(x) && x >= min && x <= max) onChange(x)
      }}
      onBlur={() => setDraft(null)}
      onKeyDown={(ev) => {
        if (ev.key !== "ArrowUp" && ev.key !== "ArrowDown") return
        ev.preventDefault()
        setDraft(null)
        onChange(clamp(value + (ev.key === "ArrowUp" ? 1 : -1) * (ev.shiftKey ? 10 : 1)))
      }}
      style={{ width: `${Math.max(2, shown.length) + 1}ch` }}
      className="border-b-2 border-ink/30 bg-transparent text-center font-mono tabular-nums outline-none hover:border-ink focus:border-blue"
    />
  )
}

function Sel({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: (readonly [string, string])[]; label: string }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(ev) => onChange(ev.target.value)}
      className="max-w-full cursor-pointer border-b-2 border-ink/30 bg-transparent outline-none hover:border-ink focus:border-blue"
    >
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  )
}

/* ---------- the palette: blocks you can add ---------- */
const PALETTE: [Kind, string, Partial<BlockBody>?][] = [
  ["tempo", "Tempo"],
  ["countIn", "Count in"],
  ["play", "Click"],
  ["play", "Rest", { muted: true }],
  ["tempoBy", "Speed up"],
  ["repeat", "Repeat"],
  ["accent", "Accent"],
  ["meter", "Time"],
  ["sub", "Subdivide"],
  ["tempoMul", "Double tempo"],
]

let focusAdded: ((id: string) => void) | null = null

function Palette() {
  const add = (kind: Kind, extra?: Partial<BlockBody>) => {
    addBlock(kind, extra)
    focusAdded?.(getBlocks().at(-1)!.id)
  }
  return (
    <Panel title="Blocks">
      <ul className="flex flex-wrap gap-2 lg:flex-col lg:items-start">
        {PALETTE.map(([kind, label, extra]) => {
          const shape = FAMILY[kind]
          const rest = kind === "play" && extra && "muted" in extra
          return (
            <li key={label}>
              <button
                onClick={() => add(kind, extra)}
                className={cn(
                  "flex items-center gap-2 border border-ink px-2.5 py-1 text-sm",
                  "transition-[translate,box-shadow] duration-200 ease-[cubic-bezier(.3,1.6,.5,1)] motion-reduce:transition-none",
                  "hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[2px_2px_0_var(--color-ink)] focus-visible:outline-2 focus-visible:outline-blue",
                )}
              >
                {rest
                  ? <span aria-hidden className="size-2.5 border-2 border-red" />
                  : <Shape kind={shape} className={cn("size-2.5", shape === "triangle" && "size-3")} />}
                {label}
              </button>
            </li>
          )
        })}
      </ul>
      <p className="mt-4 text-sm text-muted-foreground">
        Circles change a setting. Squares take time. The triangle loops back.
      </p>
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
