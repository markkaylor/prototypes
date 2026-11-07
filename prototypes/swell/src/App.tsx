import { useEffect, useRef } from "react"
import { CircleHelpIcon } from "lucide-react"
import { Badge } from "@prototypes/ui/components/badge"
import { Button } from "@prototypes/ui/components/button"
import { Kbd } from "@prototypes/ui/components/kbd"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@prototypes/ui/components/select"
import { ToggleGroup, ToggleGroupItem } from "@prototypes/ui/components/toggle-group"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@prototypes/ui/components/tooltip"
import { cn } from "@prototypes/ui/lib/utils"
import {
  cycleMode, getState, initMidi, nudge, setCaptured, setChannel, setMode, setOutput, useMidi,
  type Mode, type State,
} from "./midi"

const TRAVEL = 420 // px of pointer travel for a full 0–127 sweep

export default function App() {
  const s = useMidi()
  const padRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    initMidi()
    const pad = padRef.current!
    const onLock = () => setCaptured(document.pointerLockElement === pad)
    const onMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== pad) return
      const g = (127 / TRAVEL) * (e.shiftKey ? 1 / 3 : 1)
      const { mode } = getState()
      if (mode !== "cc11") nudge(1, -e.movementY * g)
      if (mode !== "cc1") nudge(11, e.movementX * g)
    }
    // Tap ⌥ = press and release with no other key in between.
    let altTap = false
    const onDown = (e: KeyboardEvent) => { altTap = e.key === "Alt" && !e.repeat; if (e.key === "Alt") e.preventDefault() }
    const onUp = (e: KeyboardEvent) => { if (e.key === "Alt" && altTap) cycleMode(); altTap = false }
    const onBlur = () => { altTap = false }

    document.addEventListener("pointerlockchange", onLock)
    document.addEventListener("mousemove", onMove)
    addEventListener("keydown", onDown)
    addEventListener("keyup", onUp)
    addEventListener("blur", onBlur)
    return () => {
      document.removeEventListener("pointerlockchange", onLock)
      document.removeEventListener("mousemove", onMove)
      removeEventListener("keydown", onDown)
      removeEventListener("keyup", onUp)
      removeEventListener("blur", onBlur)
    }
  }, [])

  const capture = () => {
    if (!s.captured) padRef.current?.requestPointerLock()?.catch?.(() => {})
  }

  return (
    <TooltipProvider>
      <div className="flex h-dvh flex-col select-none">
        <Header s={s} />
        <Pad ref={padRef} s={s} onClick={capture} />
        <BottomBar s={s} />
      </div>
    </TooltipProvider>
  )
}

/* ---------- the grid: crosshair, CC names, puck ---------- */
function Pad({ s, ref, onClick }: { s: State; ref: React.Ref<HTMLDivElement>; onClick: () => void }) {
  const x = (s.cc11 / 127) * 100
  const y = (s.cc1 / 127) * 100
  return (
    <div ref={ref} onClick={onClick} className="bg-grid relative flex-1 cursor-crosshair overflow-hidden">
      <div className="pointer-events-none absolute bottom-0 left-0 bg-yellow/25" style={{ width: `${x}%`, height: `${y}%` }} />
      {/* CC1 rides the horizontal line, CC11 the vertical one; the inactive axis dims */}
      <div
        className={cn("pointer-events-none absolute inset-x-0 transition-opacity", s.mode === "cc11" ? "opacity-25" : "opacity-100")}
        style={{ top: `${100 - y}%` }}
      >
        <div className="h-0.5 bg-cc1" />
        <span className="absolute bottom-2 left-4 text-xs font-medium text-cc1">CC1 · Modulation</span>
      </div>
      <div
        className={cn("pointer-events-none absolute inset-y-0 transition-opacity", s.mode === "cc1" ? "opacity-25" : "opacity-100")}
        style={{ left: `${x}%` }}
      >
        <div className="h-full w-0.5 bg-cc11" />
        <span className="absolute bottom-4 left-2 text-xs font-medium whitespace-nowrap text-cc11">CC11 · Expression</span>
      </div>
      {/* a dot when both axes are live, a bar along the free axis otherwise */}
      <div
        className={cn(
          "pointer-events-none absolute -translate-1/2 bg-ink transition-[width,height,border-radius] duration-200",
          s.mode === "both" && "size-5 rounded-full",
          s.mode === "cc1" && "h-9 w-2",
          s.mode === "cc11" && "h-2 w-9",
        )}
        style={{ left: `${x}%`, top: `${100 - y}%` }}
      />
    </div>
  )
}

/* ---------- header: output, help ---------- */
const STATUS_TEXT: Record<State["status"], string> = {
  pending: "Connecting MIDI…",
  ok: "No MIDI outputs",
  unsupported: "Web MIDI unavailable",
  denied: "Web MIDI blocked",
}

function Header({ s }: { s: State }) {
  return (
    <header className="flex items-center justify-between gap-4 border-b px-4 py-2.5">
      <div className="flex items-center gap-2 text-sm font-semibold tracking-wide uppercase">
        Swell
        <Badge variant="secondary">field note</Badge>
      </div>
      <div className="flex items-center gap-1">
        <span
          title={s.outputId ? "Sending MIDI" : "Not sending"}
          className={cn("mr-2 size-2 rounded-full", s.outputId ? "bg-red" : "bg-muted-foreground/40")}
        />
        <Select value={s.outputId ?? ""} onValueChange={setOutput} disabled={!s.outputs.length}>
          <SelectTrigger size="sm" className="mr-1 w-56" aria-label="MIDI output">
            <SelectValue placeholder={STATUS_TEXT[s.status]} />
          </SelectTrigger>
          <SelectContent>
            {s.outputs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Help />
      </div>
    </header>
  )
}

function Help() {
  const rows: [React.ReactNode, string][] = [
    ["Click", "capture the trackpad"],
    ["↑ ↓", "CC1 · Modulation"],
    ["← →", "CC11 · Expression"],
    [<Kbd key="s">⇧</Kbd>, "hold for finer control (⅓ speed)"],
    [<Kbd key="o">⌥</Kbd>, "tap to cycle axis mode"],
    [<Kbd key="e">esc</Kbd>, "release the trackpad"],
  ]
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="How to use"><CircleHelpIcon /></Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="end" className="p-3">
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5">
          {rows.map(([k, v], i) => (
            <div key={i} className="contents">
              <dt className="text-right font-medium">{k}</dt>
              <dd className="opacity-80">{v}</dd>
            </div>
          ))}
        </dl>
      </TooltipContent>
    </Tooltip>
  )
}

/* ---------- bottom bar: values, mode, capture state, channel ---------- */
function BottomBar({ s }: { s: State }) {
  return (
    <footer className="flex items-center gap-4 border-t px-4 py-2.5 text-sm whitespace-nowrap">
      <div className="flex shrink-0 items-baseline gap-4 font-mono tabular-nums">
        <span className="text-cc1">CC1 <span className="text-foreground">{Math.round(s.cc1).toString().padStart(3, " ")}</span></span>
        <span className="text-cc11">CC11 <span className="text-foreground">{Math.round(s.cc11).toString().padStart(3, " ")}</span></span>
      </div>

      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={s.mode}
        onValueChange={(v) => v && setMode(v as Mode)}
        aria-label="Axis mode"
        className="shrink-0"
      >
        <ToggleGroupItem value="both" className="px-3">CC1 + CC11</ToggleGroupItem>
        <ToggleGroupItem value="cc1" className="px-3">CC1</ToggleGroupItem>
        <ToggleGroupItem value="cc11" className="px-3">CC11</ToggleGroupItem>
      </ToggleGroup>

      <div className="ml-auto flex shrink-0 items-center gap-3">
        <span className="hidden text-muted-foreground lg:inline">
          {s.captured ? <>Captured · <Kbd>esc</Kbd> to release</> : "Click the grid to capture"}
        </span>
        <Select value={String(s.channel)} onValueChange={(v) => setChannel(Number(v))}>
          <SelectTrigger size="sm" className="w-24" aria-label="MIDI channel"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Array.from({ length: 16 }, (_, i) => <SelectItem key={i} value={String(i)}>Ch {i + 1}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </footer>
  )
}
