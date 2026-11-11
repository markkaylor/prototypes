/**
 * PROTOTYPE. Boop: drop shapes into a grid. Each row is a voice that plays its cells left to right.
 * A cell plays its loop a set number of times (×1 by default). An empty cell is a rest: the voice waits
 * there until another voice moves on to its next cell. A column can't repeat a shape or a colour.
 */
import { useEffect, useState, type CSSProperties } from "react"
import { ChevronLeftIcon, ChevronRightIcon, CopyIcon, PlayIcon, PlusIcon, SquareIcon, XIcon } from "lucide-react"
import { Button } from "@prototypes/ui/components/button"
import { Input } from "@prototypes/ui/components/input"
import { Popover, PopoverContent, PopoverTrigger } from "@prototypes/ui/components/popover"
import { cn } from "@prototypes/ui/lib/utils"
import { BPM, COLORS, LOOPS, SHAPES, duration, seconds, type Color, type LoopId, type ShapeKind } from "./loops"
import * as engine from "./engine"
import { motion } from "./motion"
import type { Cell, Grid } from "./engine"

const MAX_TIMES = 8

/** "circle-red" plays once; ["circle-red", 2] plays twice. */
const cells = (rows: (LoopId | [LoopId, number] | null)[][]): Grid =>
  rows.map((row) => row.map((c) => (c === null ? null : Array.isArray(c) ? { loop: c[0], times: c[1] } : { loop: c, times: 1 })))

const STARTER: Grid = cells([
  [["circle-red", 2], "square-yellow", "triangle-blue", null, "square-red", null],
  ["square-blue", ["triangle-red", 2], null, "circle-yellow", ["circle-blue", 2], null],
  [["triangle-yellow", 2], null, "circle-red", "square-blue", null, null],
])

const copy = (g: Grid): Grid => g.map((row) => row.map((c) => (c ? { ...c } : null)))

const COL_WIDTH = 136 // w-34
const ADD_WIDTH = 48 // w-12, the add-column strip

/** The starter, padded with empty columns so the grid is at least as wide as the window. */
const starter = (): Grid => {
  const cols = Math.max(STARTER[0].length, Math.ceil((window.innerWidth - ADD_WIDTH) / COL_WIDTH))
  return copy(STARTER).map((row) => [...row, ...Array<Cell | null>(cols - row.length).fill(null)])
}

/** Why `loop` can't go in grid[row][col], or null if it can. */
function blocked(grid: Grid, row: number, col: number, loop: LoopId): string | null {
  const { shape, color } = LOOPS[loop]
  for (let r = 0; r < grid.length; r++) {
    const other = r === row ? null : grid[r][col]
    if (!other) continue
    if (LOOPS[other.loop].color === color) return `${color} in use`
    if (LOOPS[other.loop].shape === shape) return `${shape} in use`
  }
  return null
}

/* ---------- shapes ---------- */

const FILL: Record<Color, string> = { red: "bg-red", blue: "bg-blue", yellow: "bg-yellow" }
const SIZE: Record<ShapeKind, string> = { circle: "size-12 rounded-full", square: "size-11", triangle: "h-[45px] w-[52px] [clip-path:polygon(50%_0,100%_100%,0_100%)]" }
const SMALL: Record<ShapeKind, string> = { circle: "size-[26px] rounded-full", square: "size-6", triangle: "h-6 w-7 [clip-path:polygon(50%_0,100%_100%,0_100%)]" }

function Mark({ loop, small, className, style }: { loop: LoopId; small?: boolean; className?: string; style?: CSSProperties }) {
  const { shape, color } = LOOPS[loop]
  return <div data-mark aria-hidden style={style} className={cn("shrink-0", FILL[color], (small ? SMALL : SIZE)[shape], className)} />
}

/* ---------- picker: click an empty cell, choose one of the nine loops ---------- */

function LoopOption({ loop, why, onPick }: { loop: LoopId; why: string | null; onPick: (l: LoopId) => void }) {
  const { shape, color } = LOOPS[loop]
  return (
    <Button
      variant="ghost"
      disabled={!!why}
      title={why ?? `${color} ${shape}, ${seconds(duration(loop))}`}
      aria-label={`${color} ${shape}`}
      onClick={() => onPick(loop)}
      className="h-auto w-14 flex-col gap-1 rounded-none py-2 hover:bg-yellow/25 disabled:pointer-events-auto disabled:cursor-not-allowed disabled:opacity-15 disabled:hover:bg-transparent"
    >
      <Mark loop={loop} small />
      <span className="font-mono text-[10px] leading-3 text-muted-foreground">{seconds(duration(loop))}</span>
    </Button>
  )
}

/**
 * Picker order: every row and every column has each shape once and each colour once.
 *   circle red     square blue    triangle yellow
 *   square yellow  triangle red   circle blue
 *   triangle blue  circle yellow  square red
 */
const ALL_LOOPS = [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => `${SHAPES[(i + j) % 3]}-${COLORS[(j - i + 3) % 3]}` as LoopId))

/* ---------- app ---------- */

export default function App() {
  const [grid, setGridState] = useState<Grid>(starter)
  const [picking, setPicking] = useState<string | null>(null) // "row:col" of the open picker
  const playing = engine.usePlaying()
  const audition = engine.useAudition()
  const [, setFrame] = useState(0)

  const setGrid = (g: Grid) => { engine.setGrid(g); setGridState(g) }
  useEffect(() => engine.setGrid(grid), []) // eslint-disable-line react-hooks/exhaustive-deps

  // Repaint every frame while playing or auditioning, so the sweeps move.
  const moving = playing || !!audition
  useEffect(() => {
    if (!moving) return
    let id = 0
    const loop = () => { setFrame((f) => f + 1); id = requestAnimationFrame(loop) }
    id = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(id)
  }, [moving])

  // Space plays and stops.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || (e.target as HTMLElement).closest("button, input")) return
      e.preventDefault()
      if (engine.getPlaying()) engine.stop(); else void engine.play()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const cols = grid[0].length
  const t = engine.now()

  /* --- edits --- */
  const place = (row: number, col: number, cell: Cell | null) => {
    if (audition?.row === row && audition.col === col) engine.stopAudition()
    const g = copy(grid)
    g[row][col] = cell
    setGrid(g)
  }
  const setTimes = (row: number, col: number, times: number) => {
    const cell = grid[row][col]
    if (cell) place(row, col, { ...cell, times: Math.min(MAX_TIMES, Math.max(1, times)) })
  }
  const addColumn = () => setGrid(grid.map((row) => [...row, null]))
  const moveColumn = (col: number, to: number) => {
    if (to < 0 || to >= cols) return
    const g = grid.map((row) => { const r = [...row]; [r[col], r[to]] = [r[to], r[col]]; return r })
    engine.remap((c) => (c === col ? to : c === to ? col : c))
    setGrid(g)
  }
  const duplicateColumn = (col: number) => {
    engine.remap((c) => (c > col ? c + 1 : c))
    setGrid(grid.map((row) => [...row.slice(0, col + 1), row[col] && { ...row[col] }, ...row.slice(col + 1)]))
  }
  const deleteColumn = (col: number) => {
    if (cols === 1) return setGrid(grid.map(() => [null]))
    engine.remap((c) => (c === col ? -1 : c > col ? c - 1 : c))
    setGrid(grid.map((row) => row.filter((_, i) => i !== col)))
  }


  return (
    <div className="flex h-svh flex-col overflow-hidden bg-paper text-ink">
      <header className="titlebar flex items-center justify-between gap-6 border-b-2 border-ink px-10 py-5">
        <div className="flex items-baseline gap-4">
          <h1 className="text-3xl font-semibold tracking-tight">Boop</h1>
          <p className="text-sm text-muted-foreground">
            Interactive music composition shaped by permutation and combination
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-mono text-xs tracking-widest text-muted-foreground">{BPM} BPM</span>
          <Button size="lg" className="w-28 bg-ink text-paper hover:bg-ink/85" onClick={() => (playing ? engine.stop() : void engine.play())}>
            {playing ? <SquareIcon className="fill-current" /> : <PlayIcon className="fill-current" />}
            {playing ? "Stop" : "Play"}
          </Button>
        </div>
      </header>

        {/* Score */}
        <main className="flex min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
          <div className="flex w-fit">
            <div className="flex flex-col">
              {/* Column header */}
              <div className="flex h-10 items-end border-b border-ink">
                {grid[0].map((_, col) => (
                  <div key={col} className="group flex h-8 w-34 shrink-0 items-center justify-between pr-1 pl-3">
                    <span className="font-mono text-xs tracking-widest text-muted-foreground">{String(col + 1).padStart(2, "0")}</span>
                    <div className="flex opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <Button variant="ghost" size="icon-xs" aria-label="Move column left" disabled={col === 0} onClick={() => moveColumn(col, col - 1)}><ChevronLeftIcon /></Button>
                      <Button variant="ghost" size="icon-xs" aria-label="Move column right" disabled={col === cols - 1} onClick={() => moveColumn(col, col + 1)}><ChevronRightIcon /></Button>
                      <Button variant="ghost" size="icon-xs" aria-label="Duplicate column" onClick={() => duplicateColumn(col)}><CopyIcon /></Button>
                      <Button variant="ghost" size="icon-xs" aria-label="Delete column" onClick={() => deleteColumn(col)}><XIcon /></Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Rows */}
              {grid.map((row, r) => {
                const seg = engine.current(r)
                return (
                  <div key={r} className="flex min-h-0 flex-1 border-b border-ink">
                    {row.map((cell, col) => {
                      const key = `${r}:${col}`
                      const auditionHere = audition && audition.row === r && audition.col === col ? audition.seg : undefined
                      const here = seg && seg.col === col ? seg : auditionHere
                      const playingHere = here && cell && here.loop === cell.loop ? here : undefined
                      const restingHere = here && !here.loop && !cell
                      const progress = playingHere ? (t - playingHere.start) / (playingHere.end - playingHere.start) : 0
                      return (
                        <div
                          key={col}
                          className={cn(
                            "group/cell relative flex w-34 shrink-0 items-center justify-center overflow-hidden border-l border-muted last:border-r",
                            restingHere && "bg-ink/[0.04]",
                          )}
                        >
                          {playingHere && (
                            <div
                              className="pointer-events-none absolute inset-y-0 left-0 border-r-2 border-ink bg-ink/[0.06]"
                              style={{ width: `${progress * 100}%` }}
                            />
                          )}
                          {cell && <Mark loop={cell.loop} className="relative" style={playingHere && motion(playingHere, t)} />}
                          {restingHere && (
                            <span className="relative text-sm text-muted-foreground">rest</span>
                          )}
                          {/* Empty: click to pick a loop. Ones the column rule blocks are greyed. */}
                          {!cell && (
                            <Popover open={picking === key} onOpenChange={(o) => setPicking(o ? key : null)}>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="ghost"
                                  aria-label="Choose a loop"
                                  className="absolute inset-0 h-full w-full rounded-none text-muted-foreground opacity-0 hover:bg-yellow/10 hover:opacity-100 focus-visible:opacity-100 data-[state=open]:bg-yellow/10 data-[state=open]:opacity-100"
                                >
                                  <PlusIcon />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent align="center" className="w-auto rounded-none border-ink bg-paper p-1.5 shadow-none">
                                <div className="grid grid-cols-3">
                                  {ALL_LOOPS.map((id) => (
                                    <LoopOption key={id} loop={id} why={blocked(grid, r, col, id)} onPick={(l) => { place(r, col, { loop: l, times: 1 }); setPicking(null) }} />
                                  ))}
                                </div>
                              </PopoverContent>
                            </Popover>
                          )}
                          {cell && (
                            <span className={cn("absolute bottom-2.5 left-3 font-mono text-[11px] leading-3.5", playingHere ? "text-ink" : "text-muted-foreground")}>
                              {playingHere ? `${(t - playingHere.start).toFixed(1)} / ${seconds(duration(cell.loop))}` : seconds(duration(cell.loop))}
                            </span>
                          )}
                          {cell && (
                            <>
                              {/* Audition: hear this cell on its own. Only while stopped. */}
                              {!playing && (
                                <Button
                                  variant="outline"
                                  size="icon-xs"
                                  aria-label={auditionHere ? "Stop audition" : "Audition"}
                                  title={auditionHere ? "Stop" : "Audition"}
                                  onClick={() => (auditionHere ? engine.stopAudition() : void engine.audition(r, col, cell.loop))}
                                  className={cn(
                                    "absolute top-2 left-2 border-ink bg-paper shadow-none group-hover/cell:opacity-100 focus-visible:opacity-100 hover:bg-yellow/25",
                                    auditionHere ? "opacity-100" : "opacity-0",
                                  )}
                                >
                                  {auditionHere ? <SquareIcon className="fill-current" /> : <PlayIcon className="fill-current" />}
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="icon-xs"
                                aria-label="Remove"
                                onClick={() => place(r, col, null)}
                                className="absolute top-2 right-2 border-ink bg-paper opacity-0 shadow-none group-hover/cell:opacity-100 focus-visible:opacity-100 hover:bg-yellow/25"
                              >
                                <XIcon />
                              </Button>
                              {/* Which pass is playing, when it loops more than once */}
                              {playing && playingHere && cell.times > 1 && (
                                <span className="absolute top-2.5 left-3 font-mono text-[11px] leading-3.5 text-ink">
                                  {Math.min(playingHere.pass, cell.times)}/{cell.times}
                                </span>
                              )}
                              {/* How many times this cell loops before the voice moves on */}
                              <label className="absolute right-2.5 bottom-1.5 flex items-center gap-0.5 font-mono text-[11px] leading-3.5 text-muted-foreground">
                                ×
                                <Input
                                  type="number"
                                  min={1}
                                  max={MAX_TIMES}
                                  value={cell.times}
                                  aria-label="Times to loop"
                                  title={`Loops ${cell.times} time${cell.times > 1 ? "s" : ""}`}
                                  onChange={(e) => { const n = e.target.valueAsNumber; if (!Number.isNaN(n)) setTimes(r, col, n) }}
                                  onFocus={(e) => e.target.select()}
                                  className="h-6 w-10 rounded-none border-ink/30 bg-paper px-1 font-mono text-[11px] text-ink shadow-none md:text-[11px] hover:border-ink focus-visible:border-ink focus-visible:ring-0"
                                />
                              </label>
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>

            {/* Add column: sits where the new column will appear */}
            <div className="flex flex-col pt-10">
              <Button
                variant="ghost"
                aria-label="Add column"
                title="Add column"
                onClick={addColumn}
                className="h-auto w-12 flex-1 border border-l-0 border-dashed border-ink/40 text-muted-foreground hover:bg-yellow/25 hover:text-ink"
              >
                <PlusIcon />
              </Button>
            </div>
          </div>
        </main>
    </div>
  )
}
