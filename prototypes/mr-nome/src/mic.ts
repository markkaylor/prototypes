/**
 * PROTOTYPE. Mic capture for engines that transcribe whole clips (Whisper), with a small voice detector
 * that decides where a clip ends.
 *
 * - Echo cancellation is on, so the browser subtracts the metronome it is playing from the mic.
 * - A sound only counts as speech after ~150ms of it in a row. A metronome click lasts 35ms, so
 *   clicks that slip through neither start a clip nor keep one open.
 */
export type Mode = "hold" | "tap" | "handsFree"

const FRAME_S = 0.03
const SPEECH_FRAMES = 5 // ~150ms loud in a row
const SILENCE_S: Record<Mode, number> = { hold: Infinity, tap: 1.0, handsFree: 0.9 }
const PREROLL_FRAMES = 13 // ~400ms kept from before speech was detected, so the first word isn't clipped
const GIVE_UP_S = 8 // tap: nothing said
const MAX_CLIP_S = 25 // Whisper hears 30s at most

const WORKLET = `registerProcessor("frames", class extends AudioWorkletProcessor {
  constructor(o) { super(); this.n = o.processorOptions.n; this.buf = new Float32Array(this.n); this.i = 0 }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (ch) for (let k = 0; k < ch.length; k++) {
      this.buf[this.i++] = ch[k]
      if (this.i === this.n) { this.port.postMessage(this.buf); this.buf = new Float32Array(this.n); this.i = 0 }
    }
    return true
  }
})`

export type MicSession = { stop(): void; abort(): void }
type Opts = {
  mode(): Mode
  /** A finished clip with speech in it, at the mic's sample rate. */
  onClip(pcm: Float32Array, sampleRate: number): void
  onSpeech?(): void
  onEnd(error?: string): void
}

export async function openMic(o: Opts): Promise<MicSession> {
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } })
  } catch (e) {
    o.onEnd((e as Error).name === "NotAllowedError" ? "not-allowed" : String(e))
    return { stop() {}, abort() {} }
  }
  const ctx = new AudioContext()
  const url = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }))
  await ctx.audioWorklet.addModule(url)
  URL.revokeObjectURL(url)
  const node = new AudioWorkletNode(ctx, "frames", { processorOptions: { n: Math.round(ctx.sampleRate * FRAME_S) } })
  ctx.createMediaStreamSource(stream).connect(node)

  let t = 0, run = 0, lastSpeech = 0, speech = false, done = false
  let floor = Infinity
  let pre: Float32Array[] = []
  let clip: Float32Array[] = []

  const finish = (error?: string) => {
    if (done) return
    done = true
    node.port.onmessage = null
    stream.getTracks().forEach((tr) => tr.stop())
    void ctx.close()
    o.onEnd(error)
  }
  const cut = () => {
    if (speech) o.onClip(concat(clip), ctx.sampleRate)
    clip = []; pre = []; speech = false; run = 0
    if (o.mode() !== "handsFree") finish()
  }

  node.port.onmessage = ({ data: f }: MessageEvent<Float32Array>) => {
    if (done) return
    t++
    let sum = 0
    for (let k = 0; k < f.length; k++) sum += f[k] * f[k]
    const rms = Math.sqrt(sum / f.length)
    const loud = rms > Math.max(0.006, floor * 2.5)
    run = loud ? run + 1 : 0
    if (!loud) floor = rms < floor ? rms : floor + (rms - floor) * 0.02 // follows the room, not your voice
    const m = o.mode()
    if (m === "hold" || speech) clip.push(f)
    else { pre.push(f); if (pre.length > PREROLL_FRAMES) pre.shift() }
    if (run >= SPEECH_FRAMES) {
      if (!speech) { speech = true; if (m !== "hold") { clip = pre; pre = [] } o.onSpeech?.() }
      lastSpeech = t
    }
    if (speech && (t - lastSpeech) * FRAME_S > SILENCE_S[m]) cut()
    else if (m === "tap" && !speech && t * FRAME_S > GIVE_UP_S) finish()
    else if (clip.length * FRAME_S > MAX_CLIP_S) cut()
  }

  return {
    stop: () => { if (!done) { cut(); finish() } },
    abort: () => finish(),
  }
}

function concat(parts: Float32Array[]) {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0))
  let i = 0
  for (const p of parts) { out.set(p, i); i += p.length }
  return out
}

/** Whisper wants 16 kHz mono. */
export async function to16k(pcm: Float32Array, rate: number): Promise<Float32Array> {
  if (rate === 16000) return pcm
  const off = new OfflineAudioContext(1, Math.ceil((pcm.length * 16000) / rate), 16000)
  const buf = off.createBuffer(1, pcm.length, rate)
  buf.copyToChannel(pcm as Float32Array<ArrayBuffer>, 0)
  const src = off.createBufferSource()
  src.buffer = buf
  src.connect(off.destination)
  src.start()
  return (await off.startRendering()).getChannelData(0)
}
