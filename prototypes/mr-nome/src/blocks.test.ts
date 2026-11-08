/** The block routine: editing it, and what it compiles to. */
import { beforeEach, expect, test } from "vitest"
import { addBlock, clearBlocks, compileBlocks, getBlocks, loadExample, moveBlock, removeBlock, setBody, updateBlock, type Block } from "./blocks"
import { BASE, simulate, startSettings } from "./engine"

beforeEach(clearBlocks)

const last = () => getBlocks().at(-1)!
const trace = () => simulate(compileBlocks(getBlocks()).program.steps)

test("the example loops back to its count-in and climbs to 120", () => {
  loadExample()
  const c = compileBlocks(getBlocks())
  expect(c.loops.get(4)).toBe(1)
  expect(c.endless.size).toBe(0)
  const t = trace()
  expect(t.startsWith("c1@60 c2@60 c3@60 c4@60 x@60")).toBe(true) // no Accent block, no accent
  expect(t).toContain("c1@70")
  expect(t.endsWith("x@120 end")).toBe(true)
})

test("a repeat with no explicit start loops after the last count-in", () => {
  addBlock("countIn"); addBlock("play", { n: 2, unit: "beats" }); addBlock("repeat", { mode: "times", times: 1 })
  expect(compileBlocks(getBlocks()).loops.get(2)).toBe(1)
  expect(trace()).toBe("c1@100 c2@100 c3@100 c4@100 x@100 x@100 x@100 x@100 end") // 2 beats, played twice
})

test("editing a field changes what plays", () => {
  addBlock("tempo"); addBlock("play", { n: 1, unit: "beats" })
  updateBlock(getBlocks()[0].id, { bpm: 90 })
  expect(trace()).toBe("x@90 end")
})

test("rest blocks are silent", () => {
  addBlock("play", { n: 2, unit: "beats", muted: true })
  expect(trace()).toBe("_@100 _@100 end")
})

test("deleting the block a repeat loops back to hands the loop to the next block", () => {
  loadExample()
  const [, countIn, click] = getBlocks()
  removeBlock(countIn.id)
  expect((last() as Block & { kind: "repeat" }).from).toBe(click.id)
})

test("moving a block below its repeat drops it out of the loop", () => {
  loadExample()
  const click = getBlocks()[2]
  moveBlock(click.id, 4) // after the repeat
  const c = compileBlocks(getBlocks())
  expect(c.loops.get(3)).toBe(1) // the loop is now count-in + speed up
})

test("a repeat-until with nothing changing the tempo is flagged as endless", () => {
  loadExample()
  removeBlock(getBlocks()[3].id) // the speed-up
  expect([...compileBlocks(getBlocks()).endless]).toEqual([3])
})

test("settings alone keep clicking, or play nothing if the routine stops", () => {
  addBlock("tempo", { bpm: 70 })
  expect(compileBlocks(getBlocks()).open).toBe(true)
  expect(simulate(compileBlocks(getBlocks(), "continue").program.steps, 2)).toBe("x@70 x@70")
  expect(simulate(compileBlocks(getBlocks(), "stop").program.steps)).toBe("end")
  expect(startSettings(compileBlocks(getBlocks(), "stop").program).bpm).toBe(70) // the display still shows it
})

test("an Accent block is the only source of accents", () => {
  addBlock("accent", { beats: [1, 3] }); addBlock("play", { n: 4, unit: "beats" })
  expect(trace()).toBe("X@100 x@100 X@100 x@100 end")
})

test("stopped, the display shows what the routine starts with", () => {
  expect(startSettings(compileBlocks(getBlocks()).program)).toEqual(BASE) // empty routine
  addBlock("tempo", { bpm: 72 }); addBlock("meter", { beats: 3, unit: 4 }); addBlock("accent", { beats: [1] }); addBlock("sub", { sub: 3 })
  addBlock("countIn"); addBlock("play"); addBlock("tempoBy")
  expect(startSettings(compileBlocks(getBlocks()).program)).toEqual({ bpm: 72, meter: { beats: 3, unit: 4 }, accents: [1], sub: 3 })
})

test("the routine can end by keeping on clicking", () => {
  addBlock("play", { n: 2, unit: "beats" })
  expect(simulate(compileBlocks(getBlocks(), "stop").program.steps)).toBe("x@100 x@100 end")
  expect(simulate(compileBlocks(getBlocks(), "continue").program.steps, 5)).toBe("x@100 x@100 x@100 x@100 x@100")
})

test("changing a Tempo block's mode keeps its place in a loop", () => {
  addBlock("countIn"); addBlock("tempo", { bpm: 80 }); addBlock("play", { n: 1, unit: "beats" }); addBlock("repeat", { mode: "times", times: 1 })
  const tempo = getBlocks()[1]
  updateBlock(last().id, { from: tempo.id })
  setBody(tempo.id, { kind: "tempoBy", delta: 10 })
  expect(getBlocks()[1]).toEqual({ id: tempo.id, kind: "tempoBy", delta: 10 })
  expect(compileBlocks(getBlocks()).loops.get(3)).toBe(1)
  expect(trace()).toBe("c1@100 c2@100 c3@100 c4@100 x@110 x@120 end")
})

test("multiply and divide the tempo by a whole number", () => {
  addBlock("tempo", { bpm: 90 }); addBlock("tempoMul", { factor: 1 / 3 }); addBlock("play", { n: 1, unit: "beats" }); addBlock("tempoMul", { factor: 2 }); addBlock("play", { n: 1, unit: "beats" })
  expect(trace()).toBe("x@30 x@60 end")
})
