import { useEffect, useMemo, useRef, useState } from "react"
import { GripVerticalIcon, RotateCcwIcon, XIcon } from "lucide-react"
import { Button } from "@prototypes/ui/components/button"
import { Input } from "@prototypes/ui/components/input"
import { Kbd } from "@prototypes/ui/components/kbd"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@prototypes/ui/components/select"
import { Shape } from "@prototypes/ui/components/shape"
import { Toggle } from "@prototypes/ui/components/toggle"
import { cn } from "@prototypes/ui/lib/utils"
import { getState, start, startSettings, stop, useEngine, type Beat } from "./engine"
import {
  addBlock, clearBlocks, setBody, compileBlocks, getBlocks, getEnd, loadExample, setEnd, useEnd, meterBefore, moveBlock, removeBlock, updateBlock, useBlocks,
  type Block, type BlockBody, type Compiled, type Kind,
} from "./blocks"
import { SUB_NAME } from "./steps"

const SPRING = "transition-transform duration-150 ease-[cubic-bezier(.3,1.6,.5,1)] motion-reduce:transition-none"

/* ---------- playing the routine ---------- */

// The compile that's playing, so the playhead can map the engine's step back to a block.
let playing: Compiled | null = null
let playedBlocks: Block[] | null = null
let playedEnd = getEnd()
function play() {
  playedBlocks = getBlocks()
  playedEnd = getEnd()
  playing = compileBlocks(playedBlocks, playedEnd)
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

      {/* one column: display, blocks, routine. Wide: the blocks move to a sticky column on the right */}
      <main className="grid gap-8 pt-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-x-10">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <Display now={e.now} running={e.running} />
        </div>
        <aside className="min-w-0 lg:sticky lg:top-8 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          <Palette />
        </aside>
        <div className="min-w-0 lg:col-start-1 lg:row-start-2">
          <RoutineBuilder now={e.now} running={e.running} />
        </div>
      </main>
    </div>
  )
}

/* ---------- the big display: tempo, meter, beats ---------- */
function Display({ now, running }: { now: Beat | null; running: boolean }) {
  const { settings } = useEngine()
  const blocks = useBlocks()
  // stopped: show what the routine will start with, so the display always matches the blocks
  const ending = useEnd()
  const atStart = useMemo(() => startSettings(compileBlocks(blocks, ending).program), [blocks, ending])
  const s = running ? now?.settings ?? settings : atStart
  const counting = running && now?.pos.countIn != null
  const edited = running && (blocks !== playedBlocks || ending !== playedEnd)
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
            {/* count-in beats are red squares, like the Count in block */}
            {Array.from({ length: now.pos.total }, (_, i) => (
              <div key={i} className={cn("size-9", SPRING, i < now.pos.countIn! ? "bg-red" : "bg-ink/15", i === now.pos.countIn! - 1 && "scale-115")} />
            ))}
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
        <Button variant="outline" onClick={togglePlay} className="w-28 border-ink bg-transparent shadow-none hover:bg-yellow/25 hover:text-ink">
          {running
            ? <><Shape kind="square" className="size-3" /> Stop</>
            : <><Shape kind="triangle" className="size-3.5 rotate-90" /> Start</>}
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

/** Settings are triangles, anything that takes time is a square, the loop is a circle. */
const FAMILY: Record<Kind, "circle" | "square" | "triangle"> = {
  tempo: "triangle", tempoBy: "triangle", tempoMul: "triangle", meter: "triangle", accent: "triangle", sub: "triangle",
  countIn: "square", play: "square", repeat: "circle",
}

function RoutineBuilder({ now, running }: { now: Beat | null; running: boolean }) {
  const blocks = useBlocks()
  const ending = useEnd()
  const compiled = useMemo(() => compileBlocks(blocks, ending), [blocks, ending])
  const rows = useRef(new Map<string, HTMLLIElement>())
  const [drag, setDrag] = useState<{ id: string; armed: boolean; at: number | null } | null>(null)

  // the playhead: the step being heard, mapped back to the block it came from
  const engineSteps = useEngine().program?.steps
  const heard = running && now && playing && engineSteps ? engineSteps[now.pos.pc] : undefined
  const activeBlock = heard ? playing!.blockOf.get(heard) : undefined

  // loop brackets, outermost first: [start, end] block indexes
  const loops = [...compiled.loops].map(([end, startAt]) => [startAt, end] as const).sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))

  const focusBlock = (id: string, sel = "input, [role=combobox], [data-field]") =>
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
              <Button
                variant="ghost"
                size="icon-xs"
                data-grip
                aria-label={`Move step ${i + 1} (arrow keys)`}
                title="Drag to move"
                onPointerDown={() => setDrag({ id: b.id, armed: true, at: null })}
                onPointerUp={() => drag?.at == null && setDrag(null)}
                onKeyDown={(ev) => {
                  if (ev.key === "ArrowUp" && i > 0) { ev.preventDefault(); move(b.id, -1) }
                  if (ev.key === "ArrowDown" && i < blocks.length - 1) { ev.preventDefault(); move(b.id, 1) }
                }}
                className="h-auto w-5 cursor-grab self-stretch text-muted-foreground opacity-40 group-hover:opacity-100 hover:bg-transparent hover:text-ink focus-visible:opacity-100 active:cursor-grabbing [&_svg]:size-4"
              >
                <GripVerticalIcon />
              </Button>
              <div className="min-w-0 flex-1 py-1.5">
                <BlockRow b={b} i={i} blocks={blocks} compiled={compiled} active={active} />
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {timed && <span className="font-mono text-xs tabular-nums">{now!.pos.done}/{now!.pos.total}</span>}
                {passes !== undefined && passes > 0 && <span className="font-mono text-xs text-blue tabular-nums">pass {passes + 1}</span>}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => removeBlock(b.id)}
                  aria-label={`Delete step ${i + 1}`}
                  title="Delete"
                  className="text-muted-foreground opacity-60 group-hover:opacity-100 hover:text-ink focus-visible:opacity-100 [&_svg]:size-4"
                >
                  <XIcon />
                </Button>
              </div>
            </li>
          )
        })}
      </ol>
      {blocks.length > 0 && (
        <div className="py-1 pl-9">
          <p className="flex items-center gap-2 text-base">
            Then
            <Sel
              value={ending}
              onChange={(v) => setEnd(v as "continue" | "stop")}
              label="When the routine ends"
              options={[["continue", "keep clicking"], ["stop", "stop"]]}
            />
          </p>
          {compiled.open && ending === "stop" && (
            <p className="mt-1 text-xs text-red">Nothing here takes time, so there's nothing to play before it stops. Add a Click block.</p>
          )}
        </div>
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
      case "tempo": case "tempoBy": case "tempoMul": {
        const mode = tempoMode(b)
        return (
          <>
            Tempo
            <Sel value={mode} onChange={(m) => setBody(b.id, tempoBody(b, m as TempoMode))} label={`${n} tempo change`} options={TEMPO_MODES} />
            {b.kind === "tempo" && <><Num value={b.bpm} min={20} max={400} onChange={(bpm) => set({ bpm })} label={`${n} tempo`} /> bpm</>}
            {b.kind === "tempoBy" && (
              <>by <Num value={Math.abs(b.delta)} min={1} max={200} onChange={(d) => set({ delta: d * Math.sign(b.delta || 1) })} label={`${n} amount`} /> bpm</>
            )}
            {b.kind === "tempoMul" && (
              <>by <Num value={mulBy(b.factor)} min={2} max={8} onChange={(k) => set({ factor: b.factor < 1 ? 1 / k : k })} label={`${n} factor`} /></>
            )}
          </>
        )
      }
      case "meter": return (
        <>
          Meter <Num value={b.beats} min={1} max={16} onChange={(beats) => set({ beats })} label={`${n} beats per bar`} />/
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
                  <Toggle
                    key={k}
                    data-field
                    variant="outline"
                    size="sm"
                    pressed={on}
                    onPressedChange={(p) => set({ beats: p ? [...b.beats, k + 1] : b.beats.filter((x) => x !== k + 1) })}
                    aria-label={`${n}: accent beat ${k + 1}`}
                    className="size-6 h-6 min-w-6 border-ink px-0 font-mono text-xs tabular-nums shadow-none hover:bg-yellow/25 hover:text-ink data-[state=on]:border-red data-[state=on]:bg-red data-[state=on]:text-paper"
                  >
                    {k + 1}
                  </Toggle>
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
              <span className="flex basis-full items-center gap-1 text-sm text-blue">
                ↺ back to{" "}
                <Sel value={startAt !== undefined ? blocks[startAt].id : ""} onChange={(from) => set({ from })} label={`${n} loops back to`}
                  options={above.map((x, k) => [x.id, `${k + 1}. ${summary(x)}`])} />
              </span>
            )}
            {compiled.endless.has(i) && (
              <span className="basis-full text-xs text-red">
                Nothing in this loop changes the tempo, so it never reaches {b.until}. Add a Tempo block set to “Speed up” inside it.
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
    case "tempoBy": return `Tempo ${b.delta < 0 ? "−" : "+"}${Math.abs(b.delta)}`
    case "tempoMul": return `Tempo ${b.factor < 1 ? "÷" : "×"}${mulBy(b.factor)}`
    case "meter": return `Meter ${b.beats}/${b.unit}`
    case "accent": return b.beats.length ? `Accent ${[...b.beats].sort((x, y) => x - y).join(", ")}` : "No accents"
    case "sub": return `Subdivide ${SUB_NAME[b.sub]}`
    case "countIn": return `Count in ${b.n} ${b.unit}`
    case "play": return `${b.muted ? "Rest" : "Click"} for ${b.n} ${b.unit}`
    case "repeat": return b.mode === "until" ? `Repeat until ${b.until}` : b.mode === "times" ? `Repeat ${b.times} more` : "Repeat forever"
  }
}

/* ---------- the Tempo block: one block, five ways to change the tempo ---------- */
type TempoMode = "set" | "up" | "down" | "multiply" | "divide"
const TEMPO_MODES: [TempoMode, string][] = [["set", "Set"], ["up", "Speed up"], ["down", "Slow down"], ["multiply", "Multiply"], ["divide", "Divide"]]
/** A tempoMul factor as the whole number you multiply or divide by: 2 and 0.5 are both "2". */
const mulBy = (factor: number) => Math.round(factor < 1 ? 1 / factor : factor)
type TempoBlock = Block & { kind: "tempo" | "tempoBy" | "tempoMul" }

function tempoMode(b: TempoBlock): TempoMode {
  if (b.kind === "tempo") return "set"
  if (b.kind === "tempoBy") return b.delta < 0 ? "down" : "up"
  return b.factor < 1 ? "divide" : "multiply"
}

/** The block body for a mode, keeping the amount when switching speed up ↔ slow down or multiply ↔ divide. */
function tempoBody(b: TempoBlock, m: TempoMode): BlockBody {
  const by = b.kind === "tempoBy" ? Math.abs(b.delta) : 10
  const k = b.kind === "tempoMul" ? mulBy(b.factor) : 2
  switch (m) {
    case "set": return { kind: "tempo", bpm: b.kind === "tempo" ? b.bpm : 60 }
    case "up": return { kind: "tempoBy", delta: by }
    case "down": return { kind: "tempoBy", delta: -by }
    case "multiply": return { kind: "tempoMul", factor: k }
    case "divide": return { kind: "tempoMul", factor: 1 / k }
  }
}

/** A number inside a block. Type it, or nudge it with ↑/↓ (Shift: by 10). */
function Num({ value, onChange, min, max, label }: { value: number; onChange: (n: number) => void; min: number; max: number; label: string }) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? String(value)
  const clamp = (x: number) => Math.min(max, Math.max(min, x))
  return (
    <Input
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
      className="h-auto min-w-0 rounded-none border-0 border-b-2 border-ink/30 px-0 py-0 text-center font-mono text-base tabular-nums shadow-none hover:border-ink focus-visible:border-blue focus-visible:ring-0 md:text-base"
    />
  )
}

/** A choice inside a block: reads as an underlined word in the sentence. */
function Sel({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: (readonly [string, string])[]; label: string }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        aria-label={label}
        className="h-auto max-w-full gap-1 rounded-none border-0 border-b-2 border-ink/30 px-0 py-0 text-base shadow-none hover:border-ink focus-visible:border-blue focus-visible:ring-0 data-[size=default]:h-auto [&_svg:not([class*='text-'])]:text-ink"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

/* ---------- the palette: blocks you can add ---------- */
/** Grouped by shape, in the order of the key under the list: triangles, squares, circle. */
const PALETTE: [Kind, string, Partial<BlockBody>?][] = [
  ["tempo", "Tempo"],
  ["meter", "Meter"],
  ["accent", "Accent"],
  ["sub", "Subdivide"],
  ["countIn", "Count in"],
  ["play", "Click"],
  ["play", "Rest", { muted: true }],
  ["repeat", "Repeat"],
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => add(kind, extra)}
                className={cn(
                  "h-auto border-ink bg-transparent px-2.5 py-1 font-normal shadow-none hover:bg-transparent hover:text-ink",
                  "transition-[translate,box-shadow] duration-200 ease-[cubic-bezier(.3,1.6,.5,1)] motion-reduce:transition-none",
                  "hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[2px_2px_0_var(--color-ink)]",
                )}
              >
                {rest
                  ? <span aria-hidden className="size-2.5 border-2 border-red" />
                  : <Shape kind={shape} className={cn("size-2.5", shape === "triangle" && "size-3")} />}
                {label}
              </Button>
            </li>
          )
        })}
      </ul>
      <p className="mt-4 text-sm text-muted-foreground">
        Triangles change a setting. Squares take time. Circles loop back.
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
