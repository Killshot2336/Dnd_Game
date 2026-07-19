/** Table Foley + ambient beds from /public/audio (authored loops + hits). */

let muted = false;
let ambientEl: HTMLAudioElement | null = null;

function canPlay(): boolean {
  return typeof window !== 'undefined' && !muted;
}

function playFile(src: string, volume = 0.45) {
  if (!canPlay()) return;
  try {
    const audio = new Audio(src);
    audio.volume = Math.min(1, Math.max(0, volume));
    void audio.play().catch(() => {
      // Autoplay policies — ignore until user gesture
    });
  } catch {
    // ignore
  }
}

export function setTableSfxMuted(next: boolean) {
  muted = next;
  if (next) stopAmbientBed();
}

export function isTableSfxMuted() {
  return muted;
}

export function playDiceClack() {
  playFile('/audio/sfx-dice.mp3', 0.55);
}

export function playWaxStamp() {
  playFile('/audio/sfx-wax.mp3', 0.5);
}

export function playWoodThud() {
  playFile('/audio/sfx-wood.mp3', 0.45);
}

export function playFanfareTick() {
  playFile('/audio/sfx-wax.mp3', 0.35);
  window.setTimeout(() => playFile('/audio/sfx-page.mp3', 0.3), 80);
}

export function playWhisperRustle() {
  playFile('/audio/sfx-page.mp3', 0.28);
}

export function playPageTurn() {
  playFile('/audio/sfx-page.mp3', 0.42);
}

export function playBootWhoosh() {
  playFile('/audio/sfx-boot.mp3', 0.4);
}

export function playScreenPunch() {
  playFile('/audio/sfx-wood.mp3', 0.35);
}

/** Clash begins — steel on wood. */
export function playSteelScrape() {
  playFile('/audio/sfx-wood.mp3', 0.5);
  window.setTimeout(() => playFile('/audio/sfx-dice.mp3', 0.25), 60);
}

/** Lantern slides to a seat. */
export function playLanternPass() {
  playFile('/audio/sfx-page.mp3', 0.22);
  window.setTimeout(() => playFile('/audio/sfx-wax.mp3', 0.2), 90);
}

/** Soft duck ambient when Arbiter speaks, then restore. */
export function duckAmbientForSpeech(ms = 2200) {
  if (!ambientEl || !canPlay()) return;
  const el = ambientEl;
  const target = Math.max(0.04, el.volume * 0.35);
  const prior = el.volume;
  el.volume = target;
  window.setTimeout(() => {
    if (ambientEl === el) {
      const start = performance.now();
      const from = el.volume;
      const rise = () => {
        if (ambientEl !== el) return;
        const t = Math.min(1, (performance.now() - start) / 600);
        el.volume = from + (prior - from) * t;
        if (t < 1) requestAnimationFrame(rise);
      };
      requestAnimationFrame(rise);
    }
  }, ms);
}

function ambientForFlavor(flavor: string): string {
  if (flavor === 'saltwake') return '/audio/ambient-harbor.mp3';
  if (flavor === 'blackroot') return '/audio/ambient-carnival.mp3';
  return '/audio/ambient-tavern.mp3';
}

/** Looping room bed — tavern / harbor / carnival by campaign. */
export function startAmbientBed(flavor = 'default') {
  if (!canPlay()) return;
  stopAmbientBed();
  try {
    const el = new Audio(ambientForFlavor(flavor));
    el.loop = true;
    el.volume = 0.0001;
    ambientEl = el;
    void el.play().then(() => {
      // Soft fade in
      const start = performance.now();
      const fade = () => {
        if (!ambientEl) return;
        const t = Math.min(1, (performance.now() - start) / 1800);
        ambientEl.volume = 0.16 * t;
        if (t < 1) requestAnimationFrame(fade);
      };
      requestAnimationFrame(fade);
    }).catch(() => {
      ambientEl = null;
    });
  } catch {
    ambientEl = null;
  }
}

export function stopAmbientBed() {
  if (!ambientEl) return;
  const el = ambientEl;
  ambientEl = null;
  try {
    const startVol = el.volume;
    const start = performance.now();
    const fade = () => {
      const t = Math.min(1, (performance.now() - start) / 500);
      el.volume = startVol * (1 - t);
      if (t < 1) {
        requestAnimationFrame(fade);
      } else {
        el.pause();
        el.src = '';
      }
    };
    requestAnimationFrame(fade);
  } catch {
    try {
      el.pause();
    } catch {
      // ignore
    }
  }
}
