/**
 * Procedural combat layers (WebAudio only, no files). Each renderer schedules a short voice on `dest` at time `at` and cleans
 * itself up when it ends. They take a BaseAudioContext so tools can render them offline (OfflineAudioContext) and the game uses
 * the same code on the live context. `noise` is a shared white-noise buffer (makeNoise) so a burst costs one node, not a buffer.
 */

/** Deterministic PRNG (mulberry32) so an offline render is repeatable. */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One second of white noise at the context rate. */
export function makeNoise(ctx: BaseAudioContext, seed = 7): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.max(1, Math.round(ctx.sampleRate)), ctx.sampleRate);
  const d = buf.getChannelData(0);
  const r = prng(seed);
  for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
  return buf;
}

/** Disconnects a node chain once its source has ended. */
function finish(src: AudioScheduledSourceNode, nodes: AudioNode[]): void {
  src.onended = () => {
    for (const n of nodes) {
      try {
        n.disconnect();
      } catch {
        /* already gone */
      }
    }
  };
}

/** Low-mid body thump: a sine that falls from f0 to f1 with a fast attack. The melee body under every hit. */
export function renderBodyThump(ctx: BaseAudioContext, dest: AudioNode, at: number, gain: number, f0 = 150, f1 = 56, dur = 0.12): void {
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(f0, at);
  o.frequency.exponentialRampToValueAtTime(f1, at + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), at + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.05);
  o.connect(g);
  g.connect(dest);
  o.start(at);
  o.stop(at + dur + 0.06);
  finish(o, [o, g]);
}

/** Light material tick: 25 ms band-passed noise click (the contact of a weapon on the target). */
export function renderMaterialTick(ctx: BaseAudioContext, dest: AudioNode, at: number, gain: number, noise: AudioBuffer): void {
  const s = ctx.createBufferSource();
  s.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 3200;
  f.Q.value = 1.1;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), at + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.025);
  s.connect(f);
  f.connect(g);
  g.connect(dest);
  s.start(at, 0.1, 0.05);
  s.stop(at + 0.03);
  finish(s, [s, f, g]);
}

/** Crit accent: two short bright partials (1.9 kHz and 2.85 kHz), about 90 ms. The "this one landed" sparkle. */
export function renderCritAccent(ctx: BaseAudioContext, dest: AudioNode, at: number, gain: number): void {
  const parts: [number, number][] = [[1900, 1], [2850, 0.45]];
  for (const [hz, k] of parts) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(hz, at);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * k), at + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
    o.connect(g);
    g.connect(dest);
    o.start(at);
    o.stop(at + 0.1);
    finish(o, [o, g]);
  }
}

/** Kill drop: a soft, low falling tone (92 to 40 Hz, 0.22 s). Death weight without a sample. */
export function renderKillDrop(ctx: BaseAudioContext, dest: AudioNode, at: number, gain: number): void {
  renderBodyThump(ctx, dest, at, gain, 92, 40, 0.22);
}

/** Fire: a band-passed noise whoosh that sweeps down (1.4 kHz to 260 Hz) over 0.3 s. */
export function renderFireWhoosh(ctx: BaseAudioContext, dest: AudioNode, at: number, gain: number, noise: AudioBuffer): void {
  const s = ctx.createBufferSource();
  s.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 0.9;
  f.frequency.setValueAtTime(1400, at);
  f.frequency.exponentialRampToValueAtTime(260, at + 0.28);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), at + 0.025);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
  s.connect(f);
  f.connect(g);
  g.connect(dest);
  s.start(at, 0.2, 0.32);
  s.stop(at + 0.32);
  finish(s, [s, f, g]);
}

/** Frost: four tiny high-passed noise crackles spread over about 90 ms (ice cracking). */
export function renderFrostCrackle(ctx: BaseAudioContext, dest: AudioNode, at: number, gain: number, noise: AudioBuffer, seed = 11): void {
  const r = prng(seed);
  for (let i = 0; i < 4; i++) {
    const t = at + i * 0.022 + r() * 0.01;
    const s = ctx.createBufferSource();
    s.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 4500;
    f.Q.value = 0.7;
    const g = ctx.createGain();
    const peak = gain * (0.55 + r() * 0.45);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.012);
    s.connect(f);
    f.connect(g);
    g.connect(dest);
    s.start(t, r() * 0.5, 0.02);
    s.stop(t + 0.02);
    finish(s, [s, f, g]);
  }
}

/** Arcane: three slightly detuned sines (1046, 1568, 2093 Hz) that rise a little and fade over 0.45 s. */
export function renderArcaneShimmer(ctx: BaseAudioContext, dest: AudioNode, at: number, gain: number): void {
  const voices: [number, number, number][] = [[1046, 0.5, -6], [1568, 0.35, 5], [2093, 0.2, 0]];
  for (const [hz, k, cents] of voices) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.detune.value = cents;
    o.frequency.setValueAtTime(hz, at);
    o.frequency.linearRampToValueAtTime(hz * 1.05, at + 0.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * k), at + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.45);
    o.connect(g);
    g.connect(dest);
    o.start(at);
    o.stop(at + 0.47);
    finish(o, [o, g]);
  }
}
