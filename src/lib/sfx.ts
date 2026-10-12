// Sound effects, synthesized with Web Audio: no files to download, nothing to cache.
// Audio starts after the first press (browsers block sound until the user acts).
import {profile} from './profile';

type Ctx = AudioContext;
let ctx: Ctx | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

function ac(): Ctx | null {
  if (ctx) return ctx;
  try {
    const C = window.AudioContext ?? (window as unknown as {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    master = ctx.createGain();
    master.gain.value = 0.55;
    // A gentle limiter keeps stacked sounds from clipping on the small speakers.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    master.connect(comp).connect(ctx.destination);
  } catch {
    ctx = null;
  }
  return ctx;
}

/** Call from any user gesture. */
export function unlockAudio() {
  const c = ac();
  if (c && c.state === 'suspended') void c.resume().catch(() => {});
}

function noise(c: Ctx): AudioBuffer {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

interface ToneOpts {
  type?: OscillatorType;
  gain?: number;
  to?: number; // pitch glide target
  at?: number; // start offset (s)
  attack?: number;
}

function tone(freq: number, dur: number, o: ToneOpts = {}) {
  const c = ctx!;
  const t = c.currentTime + (o.at ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + dur);
  const peak = o.gain ?? 0.2;
  const a = o.attack ?? 0.004;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master!);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

interface NoiseOpts {
  gain?: number;
  freq?: number;
  to?: number;
  q?: number;
  filter?: BiquadFilterType;
  at?: number;
  attack?: number;
}

function hiss(dur: number, o: NoiseOpts = {}) {
  const c = ctx!;
  const t = c.currentTime + (o.at ?? 0);
  const src = c.createBufferSource();
  src.buffer = noise(c);
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = o.filter ?? 'bandpass';
  f.frequency.setValueAtTime(o.freq ?? 1000, t);
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
  f.Q.value = o.q ?? 1;
  const g = c.createGain();
  const peak = o.gain ?? 0.2;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + (o.attack ?? 0.01));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master!);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
}

const SOUNDS = {
  move: () => tone(1500, 0.035, {type: 'triangle', gain: 0.035}),
  press: () => tone(700, 0.05, {type: 'triangle', gain: 0.07, to: 560}),
  key: () => tone(1100, 0.04, {type: 'triangle', gain: 0.08}),
  bet: () => {
    tone(523, 0.07, {type: 'triangle', gain: 0.1});
    tone(784, 0.09, {type: 'triangle', gain: 0.1, at: 0.05});
  },
  win: () => [1047, 1319, 1568].forEach((f, i) => tone(f, 0.22, {type: 'triangle', gain: 0.13, at: i * 0.07})),
  bigwin: () => {
    [784, 1047, 1319, 1568, 2093].forEach((f, i) => tone(f, 0.32, {type: 'triangle', gain: 0.13, at: i * 0.08}));
    hiss(0.9, {freq: 7000, filter: 'highpass', gain: 0.05, at: 0.25, attack: 0.2});
  },
  lose: () => tone(330, 0.32, {type: 'triangle', gain: 0.1, to: 150}),
  cash: () => {
    tone(1976, 0.08, {type: 'square', gain: 0.045});
    tone(2637, 0.3, {type: 'square', gain: 0.045, at: 0.07});
  },
  gem: () => {
    tone(1568, 0.14, {gain: 0.12, to: 2093});
    tone(3136, 0.18, {gain: 0.05, at: 0.05});
  },
  tick: () => tone(1250, 0.025, {type: 'square', gain: 0.03}),
  boom: () => {
    hiss(0.55, {filter: 'lowpass', freq: 900, to: 120, gain: 0.5});
    tone(110, 0.45, {gain: 0.35, to: 38});
  },
  whoosh: () => hiss(0.4, {freq: 500, to: 2600, q: 2, gain: 0.14, attack: 0.15}),
  splash: () => {
    hiss(0.7, {filter: 'lowpass', freq: 2400, to: 260, gain: 0.32, attack: 0.02});
    [0.12, 0.2, 0.31].forEach(at => tone(500 + Math.random() * 400, 0.08, {gain: 0.05, to: 1100, at}));
  },
  flip: () => hiss(0.07, {filter: 'highpass', freq: 2600, gain: 0.12}),
  dice: () => [0, 0.06, 0.13, 0.19].forEach(at => hiss(0.04, {freq: 1800 + Math.random() * 1600, q: 3, gain: 0.16, at})),
  scratch: () => hiss(0.16, {freq: 3200, to: 1900, q: 1.4, gain: 0.12, attack: 0.03}),
  hop: () => tone(460, 0.11, {gain: 0.12, to: 920}),
  hit: () => {
    hiss(0.3, {filter: 'lowpass', freq: 1500, to: 200, gain: 0.35});
    tone(240, 0.3, {type: 'sawtooth', gain: 0.08, to: 60});
  },
  horn: () => {
    tone(392, 0.32, {type: 'sawtooth', gain: 0.05});
    tone(494, 0.32, {type: 'sawtooth', gain: 0.04});
  },
  pickup: () => {
    tone(880, 0.09, {gain: 0.11, to: 1320});
    tone(1760, 0.12, {gain: 0.05, at: 0.05});
  },
  multi: () => [988, 1319, 1976].forEach((f, i) => tone(f, 0.12, {type: 'triangle', gain: 0.09, at: i * 0.045})),
  rocket: () => {
    hiss(0.45, {freq: 2200, to: 500, q: 1.5, gain: 0.14, attack: 0.05});
    tone(700, 0.3, {type: 'sawtooth', gain: 0.04, to: 180});
  },
  land: () => {
    tone(140, 0.18, {gain: 0.3, to: 70});
    hiss(0.25, {filter: 'lowpass', freq: 800, gain: 0.15});
  },
  kick: () => {
    tone(160, 0.12, {gain: 0.35, to: 60});
    hiss(0.06, {filter: 'lowpass', freq: 1200, gain: 0.2});
  },
  goal: () => {
    hiss(1.6, {freq: 900, q: 0.6, gain: 0.16, attack: 0.25});
    hiss(1.2, {freq: 2200, q: 0.8, gain: 0.07, attack: 0.3, at: 0.1});
  },
  save: () => {
    tone(180, 0.15, {gain: 0.3, to: 90});
    hiss(0.9, {freq: 420, q: 0.7, gain: 0.1, attack: 0.2, at: 0.1});
  },
  dig: () => hiss(0.09, {freq: 300 + Math.random() * 300, q: 2, gain: 0.12}),
  snake: () => {
    hiss(0.5, {filter: 'highpass', freq: 4200, gain: 0.12, attack: 0.08});
    tone(200, 0.4, {type: 'sawtooth', gain: 0.06, to: 90, at: 0.1});
  },
} as const;

export type SoundName = keyof typeof SOUNDS;

let lastAt: Partial<Record<SoundName, number>> = {};

export function sfx(name: SoundName) {
  if (!profile.get().sound) return;
  const c = ac();
  if (!c || !master || c.state !== 'running') return;
  // Rapid repeats of the same sound (ticks, steps) are thinned so they never pile up.
  const now = performance.now();
  if (now - (lastAt[name] ?? 0) < 30) return;
  lastAt[name] = now;
  try {
    SOUNDS[name]();
  } catch {
    /* audio is decoration: never let it break a game */
  }
}

export function resetSfxThrottle() {
  lastAt = {};
}
