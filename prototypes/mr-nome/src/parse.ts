/**
 * PROTOTYPE. A rule-based "natural language" parser: no model, no network.
 * Text → clauses → steps. The question it answers: is a small step language
 * (set / count in / play N / change tempo / repeat) enough to cover what people say?
 */

export type Meter = { beats: number; unit: number }
export type Sub = 1 | 2 | 3 | 4

export type Step =
  | { kind: "tempo"; bpm: number }
  | { kind: "tempoBy"; delta: number }
  | { kind: "tempoMul"; factor: number }
  | { kind: "meter"; meter: Meter }
  | { kind: "accent"; beats: number[] | "all" }
  | { kind: "sub"; sub: Sub }
  | { kind: "countIn"; n: number; unit: "beats" | "bars" }
  | { kind: "play"; n: number; unit: "beats" | "bars"; muted?: boolean }
  | { kind: "repeat"; until?: number; times?: number }
  | { kind: "start" }
  | { kind: "stop" }

export type Clause = { text: string; steps: Step[]; leftover: string }
export type Parsed = { input: string; clauses: Clause[]; steps: Step[] }

/** Steps that only make sense as a timeline. Any of these means "replace the program and run it". */
export const isTimed = (s: Step) => s.kind === "countIn" || s.kind === "play" || s.kind === "repeat"

/* ---------- normalising speech-ish text ---------- */

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
}
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 }
const ORD: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9 }

/** "one hundred and twenty" → 120, "one twenty" → 120, "sixty five" → 65. */
function wordsToNumbers(s: string): string {
  const out: string[] = []
  const toks = s.split(/\s+/)
  let i = 0
  const isNum = (t?: string) => t !== undefined && (t in UNITS || t in TENS || t === "hundred" || /^\d+$/.test(t))
  while (i < toks.length) {
    if (!isNum(toks[i]) || /^\d+$/.test(toks[i]) && !(toks[i + 1] === "hundred")) { out.push(toks[i++]); continue }
    let total = 0, cur = 0, consumed = 0
    while (i < toks.length) {
      const t = toks[i]
      if (/^\d+$/.test(t) && consumed === 0) cur = +t
      else if (t in TENS && cur % 100 === 0) cur += TENS[t]
      else if (t in UNITS && cur >= 100 && cur % 100 === 0) cur += UNITS[t] // hundred + five / fifteen
      else if (t in UNITS && UNITS[t] < 10 && cur % 10 === 0 && cur % 100 !== 0) cur += UNITS[t] // twenty + five
      else if (t in UNITS && consumed === 0) cur = UNITS[t]
      else if (t in UNITS && UNITS[t] >= 10 && cur > 0 && cur < 10 && consumed === 1) cur = cur * 100 + UNITS[t] // "one fifteen"
      else if (t in TENS && cur > 0 && cur < 10 && consumed === 1) cur = cur * 100 + TENS[t] // "one twenty"
      else if (t === "hundred" && cur > 0) cur *= 100
      else if (t === "and" && cur >= 100 && isNum(toks[i + 1]) && !/^\d+$/.test(toks[i + 1])) { i++; continue }
      else break
      consumed++; i++
    }
    total += cur
    out.push(String(total))
  }
  return out.join(" ")
}

export function normalize(raw: string): string {
  let s = " " + raw.toLowerCase() + " "
  s = s.replace(/[“”"!?]/g, " ")
    .replace(/\b(?:hey|ok(?:ay)?|please|mister|mr\.?|nome|gnome|metronome|can you|could you|would you|i want(?: you)? to|i'd like to|let's|lets)\b/g, " ")
    .replace(/\bb\.? ?p\.? ?m\.?\b/g, " bpm ")
    .replace(/\bbeats per minute\b/g, " bpm ")
    .replace(/(\d)(st|nd|rd|th)\b/g, " ord$1 ")
    .replace(/\btwice\b/g, " 2 times ").replace(/\bthrice\b/g, " 3 times ").replace(/\bonce\b/g, " 1 times ")
    .replace(/\b(?:a|one) (bar|measure|beat)\b/g, " 1 $1")
    .replace(/\bcount[- ]?in\b/g, " countin ").replace(/\bcount (?:me|us|it) in\b/g, " countin ")
    .replace(/\bmeasures?\b/g, (m) => m.endsWith("s") ? "bars" : "bar")
  // ordinals ("first", but keep "eighth notes" as a subdivision)
  s = s.replace(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth)\b(?! notes?)/g, (_, w) => ` ord${ORD[w]} `)
  s = s.replace(/-/g, " ").replace(/([,;.])/g, " $1 ").replace(/\s+/g, " ")
  s = wordsToNumbers(s.trim())
  return s.replace(/ ([,;.])/g, "$1").replace(/\s+/g, " ").trim()
}

/* ---------- clauses ---------- */

/** Split on commas, "then", and "and" (unless it joins numbers: "beats 1 and 3"). */
function splitClauses(s: string): string[] {
  return s
    .split(/\s*(?:[,;.]|\bthen\b|\bafter that\b|\band then\b|\band\b(?!\s+(?:\d|ord\d)))\s*/)
    .map((c) => c.trim())
    .filter(Boolean)
}

const DOWN = /\b(?:decrease|lower|slow(?:er)?|down|drop|minus|subtract|reduce)\b/
const UNIT = (u?: string): "beats" | "bars" => (u && /beat|click/.test(u) ? "beats" : "bars")
const FILLER = /\b(?:the|a|an|at|with|me|us|it|to|of|in|on|for|now|and|then|so|just|beat|beats|tempo|time|meter|metre|speed|set|make|give|do|that|this|by|bpm|again|is|be|you|i|we|up|my|start|go)\b/g

type Ex = [RegExp, (m: RegExpMatchArray, clause: string) => Step[]]

/** Extractors run in order; each consumes the span it matched so later ones don't re-read it. */
const EXTRACTORS: Ex[] = [
  // "go up 5 every 2 bars until 100" → play 2 bars, +5, repeat until 100
  [/(?:\w+ )?(?:by )?(\d+)(?: bpm)? every (?:(\d+) )?(bars?|beats?)(?: (?:until|till|up to|to|reach(?:ing)?) (\d+)(?: bpm)?)?/, (m, c) => {
    const d = +m[1] * (DOWN.test(c) ? -1 : 1)
    return [
      { kind: "play", n: +(m[2] ?? 1), unit: UNIT(m[3]) },
      { kind: "tempoBy", delta: d },
      { kind: "repeat", until: m[4] ? +m[4] : undefined },
    ]
  }],
  // count-in
  [/(?:(\d+) (bars?|beats?) )?countin(?: (?:for|with|of) )?(?: ?(\d+))?(?: (bars?|beats?|clicks?))?/, (m) => {
    if (m[1]) return [{ kind: "countIn", n: +m[1], unit: UNIT(m[2]) }]
    if (m[3]) return [{ kind: "countIn", n: +m[3], unit: m[4] ? UNIT(m[4]) : "beats" }]
    return [{ kind: "countIn", n: 1, unit: "bars" }]
  }],
  // repeat / loop
  [/\b(?:repeat|loop|again|keep (?:doing|going|repeating) (?:that|this)|do (?:that|it) again|go back)\b(?: (?:it|that|this))?(?: (\d+) (?:more )?times)?(?: (?:until|till|up to|to|reach(?:es)?|hit|get to)(?: you)?(?: (?:reach|hit|get to))?(?: tempo)? (\d+)(?: bpm)?)?/, (m) => [
    { kind: "repeat", times: m[1] ? +m[1] : undefined, until: m[2] ? +m[2] : undefined },
  ]],
  [/\b(?:until|till|up to)(?: you)?(?: (?:reach|hit|get to))?(?: tempo)? (\d+)(?: bpm)?/, (m) => [{ kind: "repeat", until: +m[1] }]],
  [/\b(\d+) (?:more )?times\b/, (m) => [{ kind: "repeat", times: +m[1] }]],
  // relative tempo
  [/\b(?:increase|raise|bump|add|speed(?: it)? up|go up|turn (?:it )?up|up|faster|plus)(?: the)?(?: tempo| bpm| speed| it)?(?: by)? (\d+)(?: bpm)?/, (m) => [{ kind: "tempoBy", delta: +m[1] }]],
  [/\b(?:decrease|lower|drop|reduce|subtract|slow(?: it)? down|go down|down|slower|minus)(?: the)?(?: tempo| bpm| speed| it)?(?: by)? (\d+)(?: bpm)?/, (m) => [{ kind: "tempoBy", delta: -m[1] }]],
  [/\b(?:a lot|much|way) (faster|slower)\b/, (m) => [{ kind: "tempoBy", delta: m[1] === "faster" ? 10 : -10 }]],
  [/\b(?:a (?:little|bit|touch) |slightly )(faster|slower)\b/, (m) => [{ kind: "tempoBy", delta: m[1] === "faster" ? 2 : -2 }]],
  [/\b(faster|slower|speed up|slow down)\b/, (m) => [{ kind: "tempoBy", delta: /faster|up/.test(m[1]) ? 5 : -5 }]],
  [/\bdouble(?: the)? (?:tempo|time|speed)\b|\bdouble it\b/, () => [{ kind: "tempoMul", factor: 2 }]],
  [/\bhalf(?: the)? (?:tempo|time|speed)\b|\bhalve it\b/, () => [{ kind: "tempoMul", factor: 0.5 }]],
  // meter
  [/\b(\d+) ?(?:\/|over) ?(\d+)\b/, (m) => [{ kind: "meter", meter: { beats: +m[1], unit: +m[2] } }]],
  [/\b(\d+) (2|4|8|16) (?:time|meter|metre|signature)\b|\bin (\d+) (2|4|8|16)\b/, (m) => [{ kind: "meter", meter: { beats: +(m[1] ?? m[3]), unit: +(m[2] ?? m[4]) } }]],
  [/\b(\d+) beats? (?:per|a|in a|to the) bar\b/, (m) => [{ kind: "meter", meter: { beats: +m[1], unit: 4 } }]],
  [/\bwaltz\b/, () => [{ kind: "meter", meter: { beats: 3, unit: 4 } }]],
  [/\bcommon time\b/, () => [{ kind: "meter", meter: { beats: 4, unit: 4 } }]],
  [/\bcut time\b/, () => [{ kind: "meter", meter: { beats: 2, unit: 2 } }]],
  // accents
  [/\b(?:no|remove(?: the)?|clear(?: the)?|without|stop|don't|do not|turn off(?: the)?)(?: any)? accent(?:s|ing)?\b|\baccents? off\b/, () => [{ kind: "accent", beats: [] }]],
  [/\baccent(?:s|ing|uate)?\b(?: on)?(?: the)?(?: beats?)?((?: ?(?:,|and|&)? ?(?:ord\d+|\d+|downbeat|one|every|all|each))+)?(?: beats?)?(?: (?:of|in) (?:the|each|every) bar)?(?: beats?)?/, (m) => {
    if (!m[1]) return [{ kind: "accent", beats: [1] }]
    if (/every|all|each/.test(m[1])) return [{ kind: "accent", beats: "all" }]
    const beats = [...m[1].matchAll(/ord(\d+)|(\d+)|downbeat/g)].map((x) => (x[0] === "downbeat" ? 1 : +(x[1] ?? x[2])))
    return [{ kind: "accent", beats: [...new Set(beats)].sort((a, b) => a - b) }]
  }],
  [/\b(?:ord(\d) beat|downbeat|backbeat)\b/, (m) => [{ kind: "accent", beats: m[1] ? [+m[1]] : m[0] === "backbeat" ? [2, 4] : [1] }]],
  // subdivision
  [/\b(?:no subdivisions?|quarters?(?: notes?)?|just (?:the )?beats?)\b/, () => [{ kind: "sub", sub: 1 }]],
  [/\b(?:eighth|8th|ord8)s?(?: notes?)?\b|\bsubdivide(?: in)?(?: 2| two| halves)?\b/, () => [{ kind: "sub", sub: 2 }]],
  [/\b(?:triplets?|subdivide in 3)\b/, () => [{ kind: "sub", sub: 3 }]],
  [/\b(?:sixteenth|16th|ord16)s?(?: notes?)?\b/, () => [{ kind: "sub", sub: 4 }]],
  // silent bars (gap-click practice)
  [/\b(?:rest|silence|silent|mute|drop out|gap|quiet)(?: for)? (\d+) (bars?|beats?)\b/, (m) => [{ kind: "play", n: +m[1], unit: UNIT(m[2]), muted: true }]],
  // absolute tempo
  [/\b(\d+) bpm\b|\b(?:at|from|tempo(?: to| of| at)?|to)(?: tempo)? (\d+)\b(?! (?:bars?|beats?|times))/, (m) => [{ kind: "tempo", bpm: +(m[1] ?? m[2]) }]],
  // play for a length
  [/\b(?:click|play|tick|go|run|keep (?:going|clicking))(?:ing)?(?: for)? (\d+)(?: (bars?|beats?|clicks?))?\b/, (m) => [{ kind: "play", n: +m[1], unit: m[2] ? UNIT(m[2]) : "bars" }]],
  [/\b(?:for )?(\d+) (bars?|beats?)\b/, (m) => [{ kind: "play", n: +m[1], unit: UNIT(m[2]) }]],
  // transport
  [/\b(?:stop|halt|pause|enough|shut up|be quiet|end)\b/, () => [{ kind: "stop" }]],
  [/\b(?:click|play|start|begin|tick|run|resume|keep (?:going|clicking)|go)\b/, () => [{ kind: "start" }]],
  // a bare number in its own clause is a tempo ("sixty")
  [/^\s*(\d{2,3})\s*$/, (m) => [{ kind: "tempo", bpm: +m[1] }]],
]

/** Within a clause, settings come before the timeline: "click 4 bars at 60" sets 60 first. */
const ORDER: Record<Step["kind"], number> = {
  tempo: 0, tempoMul: 0, meter: 0, accent: 0, sub: 0, start: 1, countIn: 2, play: 3, tempoBy: 4, repeat: 5, stop: 6,
}

function parseClause(text: string): Clause {
  let rest = ` ${text} `
  const found: { at: number; steps: Step[] }[] = []
  for (const [re, make] of EXTRACTORS) {
    // an extractor may match more than once ("rest 2 bars, play 2 bars" is split already; this catches "at 60 for 4 bars")
    for (let guard = 0; guard < 4; guard++) {
      const m = rest.match(re)
      if (!m || m.index === undefined || !m[0].trim()) break
      found.push({ at: m.index, steps: make(m, text) })
      rest = rest.slice(0, m.index) + " ".repeat(m[0].length) + rest.slice(m.index + m[0].length)
    }
  }
  const steps = found
    .sort((a, b) => a.at - b.at)
    .flatMap((f) => f.steps)
    .map((s, i) => ({ s, i }))
    .sort((a, b) => ORDER[a.s.kind] - ORDER[b.s.kind] || a.i - b.i)
    .map((x) => x.s)
  // "click at 60" plus "click 4" in one clause: the length wins over the bare start
  const deduped = steps.some((s) => s.kind === "play") ? steps.filter((s) => s.kind !== "start") : steps
  const leftover = rest.replace(FILLER, " ").replace(/\s+/g, " ").trim()
  return { text, steps: deduped, leftover }
}

export function parse(input: string): Parsed {
  const clauses = splitClauses(normalize(input)).map(parseClause)
  return { input, clauses, steps: clauses.flatMap((c) => c.steps) }
}

/* ---------- describing steps back to the user ---------- */

const plural = (n: number, w: string) => `${n} ${n === 1 ? w.replace(/s$/, "") : w}`
const ordinal = (n: number) => n + (n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th")
export const SUB_NAME: Record<Sub, string> = { 1: "quarters", 2: "eighths", 3: "triplets", 4: "sixteenths" }

export function describe(s: Step): string {
  switch (s.kind) {
    case "tempo": return `tempo ${s.bpm}`
    case "tempoBy": return `${s.delta > 0 ? "+" : "−"}${Math.abs(s.delta)} bpm`
    case "tempoMul": return s.factor > 1 ? "double tempo" : "half tempo"
    case "meter": return `meter ${s.meter.beats}/${s.meter.unit}`
    case "accent": return s.beats === "all" ? "accent every beat" : s.beats.length ? `accent ${s.beats.map(ordinal).join(", ")}` : "no accents"
    case "sub": return SUB_NAME[s.sub]
    case "countIn": return `count in ${plural(s.n, s.unit)}`
    case "play": return `${s.muted ? "silent" : "click"} ${plural(s.n, s.unit)}`
    case "repeat": return s.until ? `repeat until ${s.until}` : s.times ? `repeat ${plural(s.times, "times")}` : "repeat forever"
    case "start": return "start"
    case "stop": return "stop"
  }
}
