/** Tiny Web Audio table SFX — no asset files, easy to mute. */

let sharedCtx: AudioContext | null = null;
let muted = false;

function ctx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (muted) return null;
  try {
    if (!sharedCtx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      sharedCtx = new AC();
    }
    if (sharedCtx.state === 'suspended') {
      void sharedCtx.resume();
    }
    return sharedCtx;
  } catch {
    return null;
  }
}

export function setTableSfxMuted(next: boolean) {
  muted = next;
}

export function isTableSfxMuted() {
  return muted;
}

function blip(
  frequency: number,
  duration: number,
  type: OscillatorType = 'square',
  gain = 0.04,
  delay = 0
) {
  const audio = ctx();
  if (!audio) return;
  const t0 = audio.currentTime + delay;
  const osc = audio.createOscillator();
  const g = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g);
  g.connect(audio.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

export function playDiceClack() {
  blip(180, 0.06, 'triangle', 0.05);
  blip(320, 0.05, 'square', 0.03, 0.04);
  blip(140, 0.08, 'sawtooth', 0.025, 0.09);
}

export function playWaxStamp() {
  blip(90, 0.1, 'sine', 0.06);
  blip(60, 0.14, 'triangle', 0.04, 0.05);
}

export function playWoodThud() {
  blip(70, 0.08, 'sine', 0.05);
}

export function playFanfareTick() {
  blip(440, 0.07, 'square', 0.035);
  blip(660, 0.09, 'triangle', 0.03, 0.06);
}

export function playWhisperRustle() {
  blip(520, 0.04, 'triangle', 0.02);
  blip(400, 0.05, 'sine', 0.015, 0.03);
}
