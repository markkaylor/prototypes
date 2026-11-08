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
  | { kind: "repeat"; until?: number; times?: number; from?: Step; fromLabel?: number }
  | { kind: "start" }
  | { kind: "stop" }

/** `label`: the item number when the command was written as a numbered list ("1. start at 60, 2. …"). */
export type Clause = { text: string; steps: Step[]; leftover: string; label?: number }
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

/**
 * "one hundred and twenty" → 120, "one twenty" → 120, "one twenty five" → 125, "sixty five" → 65.
 * "four four" stays "4 4" (it's a meter). Every pass consumes at least one token.
 */
function wordsToNumbers(s: string): string {
  const val = (t?: string) => (t === undefined ? undefined : UNITS[t] ?? TENS[t])
  const toks = s.split(" ")
  const out: string[] = []
  for (let i = 0; i < toks.length;) {
    const start = i
    let cur = val(toks[i])
    if (cur === undefined) { out.push(toks[i++]); continue }
    i++
    while (i < toks.length) {
      const t = toks[i], v = val(t)
      if (t === "hundred" && cur >= 1 && cur <= 9) cur *= 100
      else if (t === "and" && cur >= 100 && cur % 100 === 0 && val(toks[i + 1]) !== undefined) { i++; continue }
      else if (v === undefined) break
      else if (cur >= 100 && cur % 100 === 0) cur += v // hundred + five / fifteen / twenty
      else if (cur % 10 === 0 && cur % 100 >= 20 && v < 10) cur += v // twenty + five, one twenty + five
      else if (i - start === 1 && cur >= 1 && cur <= 9 && v >= 10) cur = cur * 100 + v // "one twenty", "one fifteen"
      else break
      i++
    }
    out.push(String(cur))
  }
  return out.join(" ")
}

/**
 * Many ways to say one thing → one canonical phrase, so the extractors stay small.
 * Runs after number words become digits. Order matters: longer phrases first.
 */
const SYNONYMS: [RegExp, string][] = [
  // repeats (before "do" becomes "to")
  [/\bkeep (?:going|at it|clicking) (?=until|till|up to)/g, " repeat "],
  [/(?:^|(?<=[,;.] ?))again(?=$|[,;.])|\b(?:1|one) more time\b|\b(?:do|play) (?:it|that) again\b/g, " repeat 1 times "],
  [/\bdo (?:it|that|this) (\d+) times\b/g, " repeat $1 times "],
  // setting the tempo
  [/\b(?:can|could|may) (?:i|we) (?:get|have)\b|\bi'?ll take\b/g, " to "],
  [/\b(?:bring|take|put|move|set|drop|raise|lower|turn|knock|crank|push|pull|slow|speed)(?: it| the tempo| tempo)?(?: (?:up|down|back))? to (?=\d)/g, " to "],
  [/\b(?:tempo|speed) up\b(?! (?:by )?\d)/g, " faster "],
  [/\b(?:tempo|speed) down\b(?! (?:by )?\d)/g, " slower "],
  [/\bgo (?=faster|slower|quicker|up|down)/g, " "],
  [/\b(?:get rid of|lose|kill|drop|ditch)(?= (?:the )?accents?\b)/g, " no "],
  [/\bquarter(?: note)? (?:(?:equals|is|at|gets)\b|=)/g, " tempo "],
  [/\b(?:make it|give me|go to|change (?:the )?(?:tempo|it|bpm) to|set (?:the )?(?:tempo|it|bpm) to|switch to|change to|move to|try|do)\b/g, " to "],
  // nudging it
  [/\bquicker\b/g, " faster "],
  [/\b(?:slow|bring|take) it (?:way|a lot|much) down\b/g, " much slower "],
  [/\b(?:speed|bring|crank) it (?:way|a lot|much) up\b/g, " much faster "],
  [/\bspeed (?:it )?up (?:just )?(?:a (?:bit|little|touch|tad)|slightly)\b/g, " a little faster "],
  [/\bslow (?:it )?down (?:just )?(?:a (?:bit|little|touch|tad)|slightly)\b/g, " a little slower "],
  [/\b(?:knock|take) off (\d+)|\b(?:knock|take) (\d+) off\b/g, " minus $1$2 "],
  [/\b(?:bump|kick|pick|push|crank|turn) it up\b/g, " faster "],
  [/\b(?:take|bring|back|turn|ease) it (?:down|back|off)\b|\bease off\b|\bback off\b/g, " slower "],
  [/\b(?:a notch|a tad|a hair)\b/g, " "],
  // accents
  [/\b(?:emphasi[sz]e|stress|accentuate|highlight)\b/g, " accent "],
  [/\ball (?:the )?beats? accented\b|\baccent all (?:the )?beats\b/g, " accent every "],
  [/\bthe (\d|ord\d)/g, " $1"],
  [/\bbackbeats?\b/g, " 2 and 4 "],
  // count-in
  [/\bcount (?:off|us off|me off|it off)\b/g, " countin "],
  [/\bcount (?=\d)/g, " countin "],
  [/\b(\d+) (bars?|beats?) (?:to|of|for) countin\b/g, " $1 $2 countin "],
  // subdivision
  [/\b(?:click |play )?(?:on )?the ands\b/g, " eighths "],
  // silence
  [/\b(\d+) (bars?|beats?) (?:of )?(?:silence|silent|rest|muted?|off)\b/g, " rest $1 $2 "],
  // transport
  [/\bstop (?:the )?(?:click|clicking|metronome|playing|it)\b/g, " stop "],
  [/(?:^|(?<=[,;.] ?))(?:silence|quiet)(?=$|[,;.])/g, " stop "],
  [/\b(?:stop|end|finish) (?:at|when (?:you|we) (?:reach|hit|get to)) (?=\d)/g, " until "],
  [/\b(?:let me hear|i want to hear|show me)\b/g, " "],
  [/\b(?:shh+|hold (?:on|it|up)|kill it|cut it|freeze|wait)\b/g, " stop "],
  [/\b(?:hit it|kick it|from the top|go ahead|here we go|take it away)\b/g, " start "],
  // talky filler
  [/\b(?:that's|that is|it's|it is|i think|actually|alright|all right|now|um+|uh+|like)\b/g, " "],
]

export function normalize(raw: string): string {
  let s = " " + raw.toLowerCase().replace(/’/g, "'") + " "
  // numbered lists: "1. start at 60, 2. count in 4" → item markers, before "." becomes a clause break
  s = s.replace(/(^|[,;\n]|\.\s)\s*(\d{1,2})[.)]\s+(?=[a-z])/g, "$1 item$2 ")
    .replace(/\b(repeat|loop|go back|start again|again)((?: it| that| this)?) from (?:step |item |number |#)?(\d{1,2})\.?(?=\s|$|,)/g, " $1$2 fromstep $3 ")
  s = s.replace(/[“”"!?]/g, " ")
    // stutters and over-eager recognisers: "click click click", "count count in"
    .replace(/\b([a-z]+)(?:\s+\1\b)+/g, (m, w) => (w in UNITS || w in TENS ? m : w)) // but "four four" is a meter
    .replace(/\ba hundred\b/g, " one hundred ")
    // what speech recognition hears instead of our words (from real transcripts in .scratch/mr-nome)
    .replace(/\bx ?n ?[bdpv] ?(\d)\b/g, " accent beat $1 ") // "xnp1"
    .replace(/\b[bdpv] ?(\d|one|two|three|four|five|six|seven)\b/g, " beat $1 ") // "B1", "D1", "P1", "V1"
    .replace(/\b(?:(?:x|ex|axe?|acts?) and|action|accident|absent|ascent|assent|accept|except|exit)\b(?=\s+(?:beats?|\d|one|two|three|four|ord|the|on|first|second|third|fourth|downbeat|every|all))/g, " accent ")
    .replace(/\b(?:cricket|cricut|kricket|clique|klick|clic|quick|kick)\b(?=\s+(?:at|for|\d|in|on|it|one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred))/g, " click ")
    // speech homophones: "count in for", "accent beat to", "click ate bars"
    .replace(/\b(count in|count me in|click|play|beats?|accent|repeat|in) (?:for|fore)\b(?=\s*(?:$|[,;.]|bars?|beats?|times|measures?))/g, " $1 four ")
    .replace(/\b(beats?|accent(?: on)?|and) (?:to|too)\b(?!\s+(?:\d|one|two|three|four|five|six|seven|eight|nine))/g, " $1 two ")
    .replace(/\bate\b/g, " eight ").replace(/\bwon\b/g, " one ")
    .replace(/\b(?:hey|ok(?:ay)?|please|mister|mr\.?|nome|gnome|metronome|can you|could you|would you|i want(?: you)? to|i'd like to|let's|lets)\b/g, " ")
    .replace(/\bb\.? ?p\.? ?m\.?\b/g, " bpm ")
    .replace(/\bbeats? (?:per|a|\/) ?min(?:ute)?s?\b/g, " bpm ")
    .replace(/(\d)(st|nd|rd|th)\b/g, " ord$1 ")
    .replace(/\btwice\b/g, " 2 times ").replace(/\bthrice\b/g, " 3 times ").replace(/\bonce\b/g, " 1 times ")
    .replace(/\b(?:a|one) (bar|measure|beat)\b/g, " 1 $1")
    .replace(/\bcount[- ]?in\b/g, " countin ").replace(/\bcount (?:me|us|it) in\b/g, " countin ")
    .replace(/\bmeasures?\b/g, (m) => m.endsWith("s") ? "bars" : "bar")
  // ordinals ("first", but keep "eighth notes" as a subdivision)
  s = s.replace(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth)\b(?! notes?)/g, (_, w) => ` ord${ORD[w]} `)
  s = s.replace(/-/g, " ").replace(/([,;.])/g, " $1 ").replace(/\s+/g, " ")
  s = wordsToNumbers(s.trim()).replace(/ ([,;.])/g, "$1")
  for (const [re, to] of SYNONYMS) s = s.replace(re, to).replace(/\s+/g, " ").trim()
  // "accent 1, 4": a comma inside a list of beats isn't a clause break
  for (let k = 0; k < 4; k++) s = s.replace(/(\baccent[^,;.]*?(?:\d|ord\d)), (?=\d|ord\d)/, "$1 and ")
  return s.replace(/\s+/g, " ").trim()
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
const FILLER = /\b(?:the|a|an|at|with|me|us|it|to|of|in|on|for|now|and|then|so|just|beat|beats|tempo|time|meter|metre|speed|set|make|give|do|that|this|by|bpm|again|is|be|you|i|we|up|my|start|go|signature|switch|change|add|use|some|want|need|only|put|feel|notes?|back|forever|indefinitely|nonstop|please|anything|everything|let|hear)\b/g

/** A tempo outside this is almost certainly a misread ("knock off 10" ≠ tempo 10), so it stays not-understood. */
const inRange = (bpm: number) => bpm >= 20 && bpm <= 400

type Ex = [RegExp, (m: RegExpMatchArray, clause: string) => Step[]]

/** Extractors run in order; each consumes the span it matched so later ones don't re-read it. */
const EXTRACTORS: Ex[] = [
  // "ramp from 80 to 120 over 8 bars" → tempo 80, then +5 every bar until 120
  [/\b(?:(?:ramp|accelerate|speed up|slow down|build|climb|go)(?: up| down)? )?from (\d+) to (\d+) (?:over|in|across) (\d+) (bars?|beats?)/, (m) => {
    const from = +m[1], to = +m[2], n = Math.max(1, +m[3])
    return [
      { kind: "tempo", bpm: from },
      { kind: "play", n: 1, unit: UNIT(m[4]) },
      { kind: "tempoBy", delta: Math.round((to - from) / n) || Math.sign(to - from) },
      { kind: "repeat", until: to },
    ]
  }],
  // "from 60 to 100 by 10 every 2 bars" → tempo 60, play 2 bars, +10, repeat until 100
  [/\b(?:from (\d+) )?(?:to|until|till|up to) (\d+)(?: bpm)?,? (?:by|in steps of|going up|going down|adding|up|down) (\d+)(?: bpm)?(?: every (?:(\d+) )?(bars?|beats?))?/, (m, c) => {
    const from = m[1] ? +m[1] : undefined, to = +m[2]
    const down = from !== undefined ? to < from : DOWN.test(c)
    return [
      ...(from !== undefined ? [{ kind: "tempo", bpm: from } as Step] : []),
      { kind: "play", n: m[5] ? +(m[4] ?? 1) : 4, unit: m[5] ? UNIT(m[5]) : "bars" },
      { kind: "tempoBy", delta: +m[3] * (down ? -1 : 1) },
      { kind: "repeat", until: to },
    ]
  }],
  // "go up 5 every 2 bars until 100" → play 2 bars, +5, repeat until 100
  [/\b(?:(?:speed|slow|go|turn|bump|take)(?: it)? )?(?:(?:up|down|increase|decrease|raise|lower|add|drop|faster|slower|plus|minus) )?(?:the )?(?:tempo |it )?(?:by )?(\d+)(?: bpm)? every (?:(\d+) )?(bars?|beats?)(?: (?:until|till|up to|to|reach(?:ing)?) (\d+)(?: bpm)?)?/, (m, c) => {
    const d = +m[1] * (DOWN.test(c) ? -1 : 1)
    return [
      { kind: "play", n: +(m[2] ?? 1), unit: UNIT(m[3]) },
      { kind: "tempoBy", delta: d },
      { kind: "repeat", until: m[4] ? +m[4] : undefined },
    ]
  }],
  // "every 4 bars add 5"
  [/\bevery (?:(\d+) )?(bars?|beats?),? (add|increase(?: by)?|go up(?: by)?|up|plus|speed up(?: by)?|raise(?: by)?|subtract|drop(?: by)?|go down(?: by)?|down|minus|slow down(?: by)?|lower(?: by)?) (\d+)(?: bpm)?/, (m) => [
    { kind: "play", n: +(m[1] ?? 1), unit: UNIT(m[2]) },
    { kind: "tempoBy", delta: +m[4] * (DOWN.test(m[3]) ? -1 : 1) },
    { kind: "repeat" },
  ]],
  // count-in
  [/(?:(\d+) (bars?|beats?) )?countin(?: (?:for|with|of) )?(?: ?(\d+))?(?: (bars?|beats?|clicks?))?/, (m) => {
    if (m[1]) return [{ kind: "countIn", n: +m[1], unit: UNIT(m[2]) }]
    if (m[3]) return [{ kind: "countIn", n: +m[3], unit: m[4] ? UNIT(m[4]) : "beats" }]
    return [{ kind: "countIn", n: 1, unit: "bars" }]
  }],
  // repeat / loop
  [/\b(?:repeat|loop(?:ing)?|again|keep (?:looping|repeating)|keep (?:doing|going|repeating) (?:that|this)|do (?:that|it) again|go back)\b(?: (?:it|that|this))?(?: fromstep (\d+))?(?: (\d+) (?:more )?times)?(?: (?:until|till|up to|to|reach(?:es)?|hit|get to)(?: (?:you|we))?(?: (?:reach|hit|get to))?(?: tempo)? (\d+)(?: bpm)?)?/, (m) => [
    { kind: "repeat", fromLabel: m[1] ? +m[1] : undefined, times: m[2] ? +m[2] : undefined, until: m[3] ? +m[3] : undefined },
  ]],
  [/\b(?:until|till|up to)(?: (?:you|we))?(?: (?:reach|hit|get to))?(?: tempo)? (\d+)(?: bpm)?/, (m) => [{ kind: "repeat", until: +m[1] }]],
  [/\b(\d+) (?:more )?times\b/, (m) => [{ kind: "repeat", times: +m[1] }]],
  // relative tempo
  [/\b(?:increase|raise|bump|add|speed(?: it)? up|go up|turn (?:it )?up|up|faster|plus)(?: the)?(?: tempo| bpm| speed| it)?(?: by)? (\d+)(?: bpm)?/, (m) => [{ kind: "tempoBy", delta: +m[1] }]],
  [/\b(?:decrease|lower|drop|reduce|subtract|slow(?: it)? down|go down|down|slower|minus)(?: the)?(?: tempo| bpm| speed| it)?(?: by)? (\d+)(?: bpm)?/, (m) => [{ kind: "tempoBy", delta: -m[1] }]],
  [/\b(\d+)(?: bpm)? (faster|slower|quicker)\b/, (m) => [{ kind: "tempoBy", delta: m[2] === "slower" ? -m[1] : +m[1] }]],
  [/\b(?:a lot|much|way) (faster|slower)\b/, (m) => [{ kind: "tempoBy", delta: m[1] === "faster" ? 10 : -10 }]],
  [/\b(?:(?:a )?(?:little|bit|touch|tad|hair|smidge)(?: bit)? |slightly )(faster|slower)\b/, (m) => [{ kind: "tempoBy", delta: m[1] === "faster" ? 2 : -2 }]],
  [/\b(faster|slower|speed up|slow down)\b/, (m) => [{ kind: "tempoBy", delta: /faster|up/.test(m[1]) ? 5 : -5 }]],
  [/\bdouble(?: the)? (?:tempo|time|speed)\b|\bdouble it\b/, () => [{ kind: "tempoMul", factor: 2 }]],
  [/\bhalf(?: the)? (?:tempo|time|speed)\b|\bhalve it\b/, () => [{ kind: "tempoMul", factor: 0.5 }]],
  // meter
  [/\b(\d{1,2}) ?(?:\/|over) ?(1|2|4|8|16|32)\b(?! bars?| beats?)/, (m) => [{ kind: "meter", meter: { beats: +m[1], unit: +m[2] } }]],
  [/\b(\d+) (2|4|8|16) (?:time|meter|metre|signature)\b|\bin (\d+) (2|4|8|16)\b/, (m) => [{ kind: "meter", meter: { beats: +(m[1] ?? m[3]), unit: +(m[2] ?? m[4]) } }]],
  [/(?:^|\bto |\bin )\s*(\d{1,2}) (2|4|8|16)\s*$/, (m) => [{ kind: "meter", meter: { beats: +m[1], unit: +m[2] } }]],
  [/\b(\d+) beats? (?:per|a|in a|to the) bar\b/, (m) => [{ kind: "meter", meter: { beats: +m[1], unit: 4 } }]],
  [/\bin (\d{1,2})\b(?! ?(?:bars?|beats?|times|\d|\/|over))/, (m) => [{ kind: "meter", meter: { beats: +m[1], unit: 4 } }]],
  [/\bwaltz\b/, () => [{ kind: "meter", meter: { beats: 3, unit: 4 } }]],
  [/\bcommon time\b/, () => [{ kind: "meter", meter: { beats: 4, unit: 4 } }]],
  [/\bcut time\b/, () => [{ kind: "meter", meter: { beats: 2, unit: 2 } }]],
  // accents
  [/\b(?:no|remove(?: the)?|clear(?: the)?|without|stop|don't|do not|turn off)(?: the| any)? accent(?:s|ing)?\b|\baccents? off\b/, () => [{ kind: "accent", beats: [] }]],
  [/\baccent(?:s|ing|uate)?\b(?: on)?(?: the)?(?: beats?)?((?: ?(?:,|and|&)? ?(?:ord\d+|\d+|downbeat|one|every|all|each))+)?(?: beats?)?(?: (?:of|in) (?:the|each|every) bar)?(?: beats?)?/, (m) => {
    if (!m[1]) return [{ kind: "accent", beats: [1] }]
    if (/every|all|each/.test(m[1])) return [{ kind: "accent", beats: "all" }]
    const beats = [...m[1].matchAll(/ord(\d+)|(\d+)|downbeat/g)].map((x) => (x[0] === "downbeat" ? 1 : +(x[1] ?? x[2])))
    return [{ kind: "accent", beats: [...new Set(beats)].sort((a, b) => a - b) }]
  }],
  [/\b(?:ord(\d) beat|downbeat|backbeat)\b/, (m) => [{ kind: "accent", beats: m[1] ? [+m[1]] : m[0] === "backbeat" ? [2, 4] : [1] }]],
  // subdivision
  [/\b(?:(?:no|turn off|remove|without|drop|stop)(?: the| any)? subdivisions?|subdivisions? off|quarters?(?: notes?)?|just (?:the )?beats?)\b/, () => [{ kind: "sub", sub: 1 }]],
  // triplets and sixteenths first, so "subdivide in triplets" isn't read as plain "subdivide"
  [/\b(?:subdivide (?:in(?:to)? )?)?(?:triplets?|(?<=subdivide (?:in(?:to)? )?)3)\b/, () => [{ kind: "sub", sub: 3 }]],
  [/\b(?:subdivide (?:in(?:to)? )?)?(?:sixteenth|16th|ord16)s?(?: notes?)?\b/, () => [{ kind: "sub", sub: 4 }]],
  [/\b(?:eighth|8th|ord8)s?(?: notes?)?\b|\bsubdivide(?: in)?(?: 2| halves)?\b/, () => [{ kind: "sub", sub: 2 }]],
  // silent bars (gap-click practice)
  [/\b(?:rest|silence|silent|mute|drop out|gap|quiet)(?: for)? (\d+) (bars?|beats?)\b/, (m) => [{ kind: "play", n: +m[1], unit: UNIT(m[2]), muted: true }]],
  // absolute tempo
  [/\b(\d+) bpm\b|\b(?:at|from|tempo(?: to| of| at)?|to)(?: tempo)? (\d{2,3})\b(?! (?:bars?|beats?|times))/, (m) => inRange(+(m[1] ?? m[2])) ? [{ kind: "tempo", bpm: +(m[1] ?? m[2]) }] : []],
  // play for a length
  [/\b(?:click|play|tick|go|run|keep (?:going|clicking))(?:ing)?(?: for)? (\d+)(?: (bars?|beats?|clicks?))?\b/, (m) => [{ kind: "play", n: +m[1], unit: m[2] ? UNIT(m[2]) : "bars" }]],
  [/\b(?:for )?(\d+) (bars?|beats?)\b/, (m) => [{ kind: "play", n: +m[1], unit: UNIT(m[2]) }]],
  // transport
  [/\b(?:stop|halt|pause|enough|shut up|be quiet|end)\b/, () => [{ kind: "stop" }]],
  [/\b(?:click(?:ing)?|play(?:ing)?|start(?:ing)?|begin|tick(?:ing)?|run|resume|keep (?:going|clicking)|go)\b/, () => [{ kind: "start" }]],
  // a bare number in its own clause is a tempo ("sixty")
  [/^\s*(\d{2,3})\s*$/, (m) => [{ kind: "tempo", bpm: +m[1] }]],
]

/** Within a clause, settings come before the timeline: "click 4 bars at 60" sets 60 first. */
const ORDER: Record<Step["kind"], number> = {
  tempo: 0, tempoMul: 0, meter: 0, accent: 0, sub: 0, start: 1, countIn: 2, play: 3, tempoBy: 4, repeat: 5, stop: 6,
}

function parseClause(raw: string): Clause {
  const item = raw.match(/^item(\d+)\s*/)
  const text = item ? raw.slice(item[0].length) : raw
  let rest = ` ${text} `
  const found: { at: number; steps: Step[] }[] = []
  const declined: string[] = []
  for (const [re, make] of EXTRACTORS) {
    // an extractor may match more than once ("rest 2 bars, play 2 bars" is split already; this catches "at 60 for 4 bars")
    for (let guard = 0; guard < 4; guard++) {
      const m = rest.match(re)
      if (!m || m.index === undefined || !m[0].trim()) break
      const made = make(m, text)
      // declined ("6 bpm" is out of range): keep those words as not-understood and keep looking ("…60 bpm")
      if (!made.length) declined.push(m[0].trim())
      else found.push({ at: m.index, steps: made })
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
  // and "start clicking" is one start, not two
  const deduped = (steps.some((s) => s.kind === "play") ? steps.filter((s) => s.kind !== "start") : steps)
    .filter((s, i, all) => (s.kind !== "start" && s.kind !== "stop") || all.findIndex((x) => x.kind === s.kind) === i)
  const leftover = [...declined, rest].join(" ").replace(FILLER, " ").replace(/\s+/g, " ").trim()
  return { text, steps: deduped, leftover, ...(item ? { label: +item[1] } : {}) }
}

/** Cross-clause fix-ups: merge "repeat" + "until 100", and point "repeat from 2" at item 2. */
function link(clauses: Clause[]) {
  // "every 4 bars add 5, stop at 100": an open repeat followed by "until 100" is one repeat
  for (let i = 1; i < clauses.length; i++) {
    const prev = clauses[i - 1].steps, cur = clauses[i].steps
    const open = prev.at(-1)
    const next = cur[0]
    if (open?.kind === "repeat" && !open.until && !open.times && next?.kind === "repeat") {
      for (const [k, v] of Object.entries(next)) if (v !== undefined) (open as Record<string, unknown>)[k] = v
      cur.shift()
    }
  }
  // "repeat from 2": point at the first real step of item 2. Without numbering, clauses count as items.
  const numbered = clauses.some((c) => c.label !== undefined)
  for (const c of clauses) for (const st of c.steps) {
    if (st.kind !== "repeat" || st.fromLabel === undefined) continue
    const item = numbered ? clauses.find((x) => x.label === st.fromLabel) : clauses[st.fromLabel - 1]
    st.from = item?.steps.find((x) => x.kind !== "start")
    if (!st.from) st.fromLabel = undefined // no such item: fall back to the default loop
  }
}

export function parse(input: string): Parsed {
  const clauses = splitClauses(normalize(input)).map(parseClause)
  link(clauses)
  return { input, clauses, steps: clauses.flatMap((c) => c.steps) }
}

/** A routine built line by line: line N is item N, so "repeat from 2" means line 2. */
export function parseLines(lines: string[]): { lines: Clause[][]; steps: Step[] } {
  const perLine = lines.map((text, i) =>
    splitClauses(normalize(text)).map((c) => ({ ...parseClause(c), label: i + 1 })),
  )
  const all = perLine.flat()
  link(all)
  return { lines: perLine, steps: all.flatMap((c) => c.steps) }
}

/** Split one typed or spoken entry into routine lines: on commas, semicolons and "then", not "and". */
export function splitEntry(text: string): string[] {
  return text
    .replace(/(^|[,;]\s*)\d{1,2}[.)]\s+/g, "$1") // drop list numbering, the lines are numbered already
    .split(/\s*(?:[,;]|\band then\b|\bthen\b|\bafter that\b)\s*/i)
    .map((t) => t.trim().replace(/^and\s+/i, ""))
    .filter(Boolean)
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
    case "repeat": {
      const from = s.fromLabel !== undefined ? ` from #${s.fromLabel}` : ""
      return s.until ? `repeat${from} until ${s.until}` : s.times ? `repeat${from} ${plural(s.times, "times")}` : `repeat${from} forever`
    }
    case "start": return "start"
    case "stop": return "stop"
  }
}
