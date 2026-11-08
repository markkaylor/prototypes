/**
 * PROTOTYPE. Whisper (base.en) in a worker, so transcribing never stalls the metronome's scheduler.
 * WebGPU when the browser has it, WASM otherwise. Weights download once and stay in the browser cache.
 */
import { AutoProcessor, AutoTokenizer, WhisperForConditionalGeneration, type Tensor } from "@huggingface/transformers"

const MODEL = "onnx-community/whisper-base.en"

/**
 * Whisper copies the wording and style of the text before the clip ("prompting"). So the prompt is a
 * run of real steps, written the way the parser likes them: digits, "bpm", "3/4". Words it never
 * saw here ("accent", "count in") it now expects, without the over-hearing that Chrome's boosts caused.
 */
const PROMPT =
  "Click at 60 bpm. Count in 4 beats. Click for 4 beats. Up 10 bpm. Repeat from 2 until 120 bpm. " +
  "Accent beat 1. Accent beats 1 and 3. Eighth notes. Triplets. 3/4 time. Rest for 2 bars. Repeat 3 times. " +
  "Delete 3. Undo. Start. Stop."

// whisper-*.en special tokens (see the model's generation_config.json)
const START_OF_PREV = 50360
const START_OF_TRANSCRIPT = 50257
const NO_TIMESTAMPS = 50362

async function load() {
  const gpu = "gpu" in navigator ? await (navigator as { gpu: { requestAdapter(): Promise<unknown> } }).gpu.requestAdapter().catch(() => null) : null
  const device = gpu ? "webgpu" : "wasm"
  const progress_callback = (p: unknown) => postMessage({ type: "progress", p })
  const [tokenizer, processor, model] = await Promise.all([
    AutoTokenizer.from_pretrained(MODEL, { progress_callback }),
    AutoProcessor.from_pretrained(MODEL, { progress_callback }),
    WhisperForConditionalGeneration.from_pretrained(MODEL, {
      device,
      dtype: device === "webgpu" ? { encoder_model: "fp32", decoder_model_merged: "q4" } : { encoder_model: "q8", decoder_model_merged: "q8" },
      progress_callback,
    }),
  ])
  const prompt = tokenizer.encode(" " + PROMPT, { add_special_tokens: false })
  const init = [START_OF_PREV, ...prompt, START_OF_TRANSCRIPT, NO_TIMESTAMPS]
  const run = async (audio: Float32Array) => {
    const inputs = await processor(audio)
    const out = (await model.generate({ ...inputs, decoder_input_ids: init, max_new_tokens: 96 })) as Tensor
    const ids = (out.tolist() as bigint[][])[0].slice(init.length).map(Number)
    return tokenizer.decode(ids, { skip_special_tokens: true }).trim()
  }
  await run(new Float32Array(16000)) // warm-up: compiles the GPU shaders now, not on your first command
  return { run, device }
}

let model: ReturnType<typeof load> | null = null
const ready = () => (model ??= load().catch((e) => { model = null; throw e }))

onmessage = async ({ data }: MessageEvent<{ type: "load" } | { type: "transcribe"; id: number; audio: Float32Array }>) => {
  try {
    const m = await ready()
    if (data.type === "load") postMessage({ type: "ready", device: m.device })
    else postMessage({ type: "text", id: data.id, text: await m.run(data.audio) })
  } catch (e) {
    postMessage({ type: "error", id: data.type === "transcribe" ? data.id : undefined, error: String(e) })
  }
}
