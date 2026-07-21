/**
 * Arbiter Critical Hit — physics-based viewport shake + chromatic fracture.
 * Call with intensity 0.4–1.6 (1 = heavy default).
 */

const SHAKE_ROOT_ID = 'cosmic-reverberation-root';
const ABERRATION_CLASS = 'cosmic-chromatic-fracture';
const SHAKE_CLASS = 'cosmic-viewport-shake';

function ensureShakeRoot(): HTMLElement {
  if (typeof document === 'undefined') {
    throw new Error('triggerCosmicReverberation requires a browser document');
  }
  let root = document.getElementById(SHAKE_ROOT_ID);
  if (!root) {
    root = document.documentElement;
    root.id = SHAKE_ROOT_ID;
  }
  return root;
}

/**
 * Heavy screen shake matrix that jolts the entire page viewport,
 * then applies a 250ms chromatic aberration fracture (hue-rotate + contrast).
 */
export function triggerCosmicReverberation(intensity = 1): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  const clamped = Math.max(0.25, Math.min(2, intensity));
  const root = ensureShakeRoot();
  const body = document.body;

  root.style.setProperty('--cosmic-shake-amp', String(clamped));
  root.classList.remove(SHAKE_CLASS);
  // Force reflow so the animation can restart
  void root.offsetWidth;
  root.classList.add(SHAKE_CLASS);

  body.classList.add(ABERRATION_CLASS);
  window.setTimeout(() => {
    body.classList.remove(ABERRATION_CLASS);
  }, 250);

  window.setTimeout(() => {
    root.classList.remove(SHAKE_CLASS);
  }, Math.round(420 * clamped));
}

/** Glyph map: alphanumerics → glowing ancient runes for the Six-Glyph Seal. */
const RUNE_MAP: Record<string, string> = {
  A: 'ᚨ',
  B: 'ᛒ',
  C: 'ᚲ',
  D: 'ᛞ',
  E: 'ᛖ',
  F: 'ᚠ',
  G: 'ᚷ',
  H: 'ᚺ',
  I: 'ᛁ',
  J: 'ᛃ',
  K: 'ᚲ',
  L: 'ᛚ',
  M: 'ᛗ',
  N: 'ᚾ',
  O: 'ᛟ',
  P: 'ᛈ',
  Q: 'ᛩ',
  R: 'ᚱ',
  S: 'ᛊ',
  T: 'ᛏ',
  U: 'ᚢ',
  V: 'ᚡ',
  W: 'ᚹ',
  X: 'ᛪ',
  Y: 'ᛦ',
  Z: 'ᛉ',
  '2': 'ᛥ',
  '3': 'ᛤ',
  '4': 'ᛢ',
  '5': 'ᛡ',
  '6': 'ᛠ',
  '7': 'ᛟ',
  '8': 'ᛝ',
  '9': 'ᛜ',
};

export function toAncientRune(char: string): string {
  const key = char.toUpperCase();
  return RUNE_MAP[key] ?? (key.match(/[A-Z0-9]/) ? 'ᚦ' : '');
}

export function sealToRunes(seal: string): string {
  return seal
    .toUpperCase()
    .split('')
    .map((c) => toAncientRune(c))
    .join('');
}
