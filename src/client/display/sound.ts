/**
 * UI sound. Most of it is synthesized — a thunk, a whoosh, a blip and a chord
 * are less code than a loader and carry no licensing surface. The one shipped
 * file is the draft-pick sting, which is a real jingle rather than a cue and
 * lives in public/sounds/. If it hasn't loaded yet, the synthesized thunk
 * stands in, so a pick is never silent while sound is on.
 *
 * Sound can never carry information here: Teams only shares audio if the host
 * ticks "include computer sound", and people forget. Every cue has a visual
 * twin — see docs/design-principles.md.
 */
export type SoundName = "place" | "move" | "advance" | "round" | "finish" | "champion" | "pick";

/** Sampled sounds, by name. Fetched once the context exists. */
const SAMPLES: Partial<Record<SoundName, { url: string; gain: number }>> = {
  pick: { url: "/sounds/draft-pick.ogg", gain: 1.2 },
};

/** How long the draft-pick sting carries before its tail: the announcement holds this long. */
export const PICK_STING_MS = 3000;

export type SoundPlayer = {
  /** Must be called from a real user gesture, or the context stays suspended. */
  arm: () => Promise<void>;
  armed: () => boolean;
  setEnabled: (on: boolean) => void;
  enabled: () => boolean;
  /** `intensity` (0-1) lifts the pitch of sounds that escalate. */
  play: (name: SoundName, intensity?: number) => void;
};

type Ctx = BaseAudioContext;

function envelope(ctx: Ctx, at: number, duration: number, peak: number, attack = 0.006): GainNode {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  return gain;
}

function tone(
  ctx: Ctx,
  dest: AudioNode,
  opts: { at?: number; freq: number; to?: number; dur: number; peak?: number; type?: OscillatorType },
): void {
  const at = opts.at ?? ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(opts.freq, at);
  if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, at + opts.dur);
  osc.connect(envelope(ctx, at, opts.dur, opts.peak ?? 0.3)).connect(dest);
  osc.start(at);
  osc.stop(at + opts.dur + 0.03);
}

function noise(
  ctx: Ctx,
  dest: AudioNode,
  opts: { at?: number; dur: number; freq: number; to?: number; peak?: number; q?: number },
): void {
  const at = opts.at ?? ctx.currentTime;
  const frames = Math.max(1, Math.ceil(ctx.sampleRate * opts.dur));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = opts.q ?? 1.2;
  filter.frequency.setValueAtTime(opts.freq, at);
  if (opts.to) filter.frequency.exponentialRampToValueAtTime(opts.to, at + opts.dur);

  source.connect(filter).connect(envelope(ctx, at, opts.dur, opts.peak ?? 0.15)).connect(dest);
  source.start(at);
  source.stop(at + opts.dur + 0.03);
}

function chord(ctx: Ctx, dest: AudioNode, start: number, freqs: number[], stagger: number, dur: number, peak: number): void {
  freqs.forEach((freq, i) => {
    tone(ctx, dest, { at: start + i * stagger, freq, dur, peak, type: "sine" });
    // A quiet octave above keeps it from sounding hollow on laptop speakers.
    tone(ctx, dest, { at: start + i * stagger, freq: freq * 2, dur: dur * 0.6, peak: peak * 0.25, type: "triangle" });
  });
}

/**
 * Render one sound into any audio graph. Split out from playback so the same
 * synthesis can be rendered into an OfflineAudioContext and measured — a sound
 * that is silently producing silence is otherwise invisible.
 */
export function renderSound(
  ctx: Ctx,
  dest: AudioNode,
  name: SoundName,
  at = ctx.currentTime,
  intensity = 0,
): void {
  switch (name) {
    case "place":
      // A weighted thunk: pitch drop plus a short body knock.
      tone(ctx, dest, { at, freq: 190, to: 84, dur: 0.15, peak: 0.42, type: "sine" });
      noise(ctx, dest, { at, dur: 0.06, freq: 900, to: 300, peak: 0.1 });
      break;
    case "move":
      noise(ctx, dest, { at, dur: 0.3, freq: 420, to: 2400, peak: 0.12, q: 0.8 });
      tone(ctx, dest, { at, freq: 300, to: 780, dur: 0.26, peak: 0.16, type: "triangle" });
      break;
    case "advance": {
      // Same weight as a tier placement — a knocked-out entry is as big a call
      // as a placed one — and it climbs as the bracket narrows.
      const k = 1 + intensity * 0.5;
      tone(ctx, dest, { at, freq: 150 * k, to: 88 * k, dur: 0.14, peak: 0.36, type: "sine" });
      noise(ctx, dest, { at, dur: 0.05, freq: 1300, to: 480, peak: 0.1 });
      tone(ctx, dest, { at: at + 0.03, freq: 440 * k, dur: 0.09, peak: 0.2, type: "triangle" });
      tone(ctx, dest, { at: at + 0.11, freq: 660 * k, dur: 0.13, peak: 0.18, type: "triangle" });
      break;
    }
    case "round":
      // Marks the bracket narrowing: quarterfinals, semifinals, final.
      chord(ctx, dest, at, [330, 440, 587], 0.055, 0.45, 0.13);
      break;
    case "finish":
      chord(ctx, dest, at, [392, 494, 587, 784], 0.07, 0.9, 0.2);
      break;
    case "champion":
      chord(ctx, dest, at, [523, 659, 784, 1047], 0.09, 1.1, 0.22);
      break;
    case "pick":
      // The synthesized stand-in; the real thing is a sample.
      renderSound(ctx, dest, "place", at);
      break;
  }
}

export function createSound(): SoundPlayer {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let on = false;
  const buffers = new Map<SoundName, AudioBuffer>();

  const armed = () => ctx?.state === "running";

  async function loadSamples(context: AudioContext): Promise<void> {
    for (const [name, sample] of Object.entries(SAMPLES)) {
      try {
        const res = await fetch(sample.url);
        if (!res.ok) throw new Error(`${res.status}`);
        buffers.set(name as SoundName, await context.decodeAudioData(await res.arrayBuffer()));
      } catch (err) {
        console.warn(`[sound] ${sample.url} didn't load; using the synthesized cue`, err);
      }
    }
  }

  function playSample(name: SoundName): boolean {
    const buffer = buffers.get(name);
    const sample = SAMPLES[name];
    if (!ctx || !master || !buffer || !sample) return false;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = sample.gain;
    source.connect(gain).connect(master);
    source.start();
    return true;
  }

  return {
    armed,
    enabled: () => on,
    setEnabled: (value) => {
      on = value;
    },
    arm: async () => {
      if (!ctx) {
        ctx = new AudioContext();
        master = ctx.createGain();
        master.gain.value = 0.35;
        master.connect(ctx.destination);
        void loadSamples(ctx);
      }
      if (ctx.state === "suspended") await ctx.resume();
    },
    play: (name, intensity = 0) => {
      if (!on || !ctx || !master || ctx.state !== "running") return;
      if (playSample(name)) return;
      renderSound(ctx, master, name, ctx.currentTime, intensity);
    },
  };
}
