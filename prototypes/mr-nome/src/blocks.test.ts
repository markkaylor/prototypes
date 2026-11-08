/** The block routine: editing it, and what it compiles to. */
import { beforeEach, expect, test } from "vitest"
import { addBlock, clearBlocks, compileBlocks, getBlocks, loadExample, moveBlock, removeBlock, updateBlock, type Block } from "./blocks"
import { simulate } from "./engine"

beforeEach(clearBlocks)

const last = () => getBlocks().at(-1)!
const trace = () => simulate(compileBlocks(getBlocks()).program.steps)

test("the example loops back to its count-in and climbs to 120", () => {
  loadExample()
  const c = compileBlocks(getBlocks())
  expect(c.loops.get(4)).toBe(1)
  expect(c.endless.size).toBe(0)
  const t = trace()
  expect(t.startsWith("c1@60 c2@60 c3@60 c4@60 X@60")).toBe(true)
  expect(t).toContain("c1@70")
  expect(t.endsWith("x@120 end")).toBe(true)
})

test("a repeat with no explicit start loops after the last count-in", () => {
  addBlock("countIn"); addBlock("play", { n: 2, unit: "beats" }); addBlock("repeat", { mode: "times", times: 1 })
  expect(compileBlocks(getBlocks()).loops.get(2)).toBe(1)
  expect(trace()).toBe("c1@100 c2@100 c3@100 c4@100 X@100 x@100 x@100 x@100 end") // 2 beats, played twice
})

test("editing a field changes what plays", () => {
  addBlock("tempo"); addBlock("play", { n: 1, unit: "beats" })
  updateBlock(getBlocks()[0].id, { bpm: 90 })
  expect(trace()).toBe("X@90 end")
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

test("settings alone just keep clicking", () => {
  addBlock("tempo")
  expect(compileBlocks(getBlocks()).open).toBe(true)
})
