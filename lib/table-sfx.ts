/** Tiny Web Audio table SFX + ambient bed — no asset files. */

let sharedCtx: AudioContext | null = null;
let muted = false;
let ambientNodes: { stop: () => void } | null = null;

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
  if (next) stopAmbientBed();
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

export function playPageTurn() {
  blip(220, 0.08, 'triangle', 0.03);
  blip(180, 0.12, 'sawtooth', 0.02, 0.05);
  blip(140, 0.1, 'sine', 0.025, 0.1);
}

export function playBootWhoosh() {
  blip(55, 0.35, 'sine', 0.045);
  blip(90, 0.28, 'triangle', 0.03, 0.08);
  blip(40, 0.4, 'sine', 0.035, 0.12);
}

export function playScreenPunch() {
  blip(70, 0.05, 'square', 0.04);
  blip(110, 0.06, 'triangle', 0.025, 0.03);
}

/** Low room drone — flavor by campaign id. */
export function startAmbientBed(flavor = 'default') {
  if (muted) return;
  stopAmbientBed();
  const audio = ctx();
  if (!audio) return;

  const master = audio.createGain();
  master.gain.value = 0.0001;
  master.connect(audio.destination);
  master.gain.exponentialRampToValueAtTime(0.028, audio.currentTime + 1.8);

  const baseFreq =
    flavor === 'saltwake' ? 48 : flavor === 'blackroot' ? 62 : flavor === 'ashcrown' ? 55 : 52;
  const oscA = audio.createOscillator();
  const oscB = audio.createOscillator();
  oscA.type = 'sine';
  oscB.type = 'triangle';
  oscA.frequency.value = baseFreq;
  oscB.frequency.value = baseFreq * 1.5;
  const gA = audio.createGain();
  const gB = audio.createGain();
  gA.gain.value = 0.55;
  gB.gain.value = 0.22;
  oscA.connect(gA);
  oscB.connect(gB);
  gA.connect(master);
  gB.connect(master);
  oscA.start();
  oscB.start();

  // Soft noise bed via detuned pair as "air"
  const lfo = audio.createOscillator();
  const lfoGain = audio.createGain();
  lfo.frequency.value = 0.07;
  lfoGain.gain.value = 4;
  lfo.connect(lfoGain);
  lfoGain.connect(oscA.frequency);
  lfo.start();

  ambientNodes = {
    stop: () => {
      try {
        const t = audio.currentTime;
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(master.gain.value, t);
        master.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
        window.setTimeout(() => {
          try {
            oscA.stop();
            oscB.stop();
            lfo.stop();
            master.disconnect();
          } catch {
            // ignore
          }
        }, 700);
      } catch {
        // ignore
      }
    },
  };
}

export function stopAmbientBed() {
  if (ambientNodes) {
    ambientNodes.stop();
    ambientNodes = null;
  }
}
