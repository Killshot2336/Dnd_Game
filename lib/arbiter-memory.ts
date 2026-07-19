/** Arbiter personal memory — the reason the table comes back. */

export interface ArbiterHighlight {
  id: string;
  title: string;
  detail: string;
  who: string;
  at: string;
}

export interface ArbiterMemory {
  jokes: string[];
  nicknames: Record<string, string>;
  highlights: ArbiterHighlight[];
  sessionSpine: string[];
  tableBond: string;
  directorNote: string;
  lastColdOpenAt: string | null;
}

export function emptyArbiterMemory(): ArbiterMemory {
  return {
    jokes: [],
    nicknames: {},
    highlights: [],
    sessionSpine: [],
    tableBond: '',
    directorNote: '',
    lastColdOpenAt: null,
  };
}

export function readArbiterMemory(stateData: unknown): ArbiterMemory {
  const base = emptyArbiterMemory();
  if (!stateData || typeof stateData !== 'object') return base;
  const raw = (stateData as Record<string, unknown>).arbiter;
  if (!raw || typeof raw !== 'object') return base;
  const source = raw as Record<string, unknown>;

  return {
    jokes: Array.isArray(source.jokes)
      ? source.jokes.map(String).filter(Boolean).slice(0, 12)
      : [],
    nicknames:
      source.nicknames && typeof source.nicknames === 'object'
        ? Object.fromEntries(
            Object.entries(source.nicknames as Record<string, unknown>)
              .filter(([, v]) => typeof v === 'string')
              .map(([k, v]) => [k, String(v)])
          )
        : {},
    highlights: Array.isArray(source.highlights)
      ? (source.highlights as ArbiterHighlight[])
          .filter((h) => h && typeof h.title === 'string')
          .slice(0, 16)
      : [],
    sessionSpine: Array.isArray(source.sessionSpine)
      ? source.sessionSpine.map(String).filter(Boolean).slice(0, 6)
      : [],
    tableBond: typeof source.tableBond === 'string' ? source.tableBond : '',
    directorNote: typeof source.directorNote === 'string' ? source.directorNote : '',
    lastColdOpenAt:
      typeof source.lastColdOpenAt === 'string' ? source.lastColdOpenAt : null,
  };
}

export function writeArbiterMemory(
  stateData: unknown,
  patch: Partial<ArbiterMemory>
): Record<string, unknown> {
  const base =
    stateData && typeof stateData === 'object'
      ? ({ ...(stateData as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  const current = readArbiterMemory(base);
  base.arbiter = {
    jokes: patch.jokes ?? current.jokes,
    nicknames: patch.nicknames
      ? { ...current.nicknames, ...patch.nicknames }
      : current.nicknames,
    highlights: patch.highlights ?? current.highlights,
    sessionSpine: patch.sessionSpine ?? current.sessionSpine,
    tableBond: patch.tableBond !== undefined ? patch.tableBond : current.tableBond,
    directorNote:
      patch.directorNote !== undefined ? patch.directorNote : current.directorNote,
    lastColdOpenAt:
      patch.lastColdOpenAt !== undefined
        ? patch.lastColdOpenAt
        : current.lastColdOpenAt,
  };
  return base;
}

export interface MemoryProtocolPatch {
  jokes?: string[];
  nicknames?: Record<string, string>;
  highlight?: { title: string; detail: string; who?: string };
  spine?: string[];
  tableBond?: string;
}

export function mergeMemoryPatch(
  current: ArbiterMemory,
  patch: MemoryProtocolPatch | null
): ArbiterMemory {
  if (!patch) return current;
  const next = { ...current };

  if (Array.isArray(patch.jokes) && patch.jokes.length > 0) {
    const incoming = patch.jokes.map(String).filter(Boolean);
    next.jokes = [...incoming, ...current.jokes]
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .slice(0, 12);
  }

  if (patch.nicknames && typeof patch.nicknames === 'object') {
    next.nicknames = { ...current.nicknames, ...patch.nicknames };
  }

  if (patch.highlight && typeof patch.highlight.title === 'string') {
    const highlight: ArbiterHighlight = {
      id: `hl-${Date.now()}`,
      title: patch.highlight.title.trim().slice(0, 80),
      detail: String(patch.highlight.detail ?? '').trim().slice(0, 240),
      who: String(patch.highlight.who ?? 'the table').trim().slice(0, 40),
      at: new Date().toISOString(),
    };
    next.highlights = [highlight, ...current.highlights].slice(0, 16);
  }

  if (Array.isArray(patch.spine) && patch.spine.length > 0) {
    next.sessionSpine = patch.spine.map(String).filter(Boolean).slice(0, 6);
  }

  if (typeof patch.tableBond === 'string' && patch.tableBond.trim()) {
    next.tableBond = patch.tableBond.trim().slice(0, 280);
  }

  return next;
}

/** Compact memory for the GM prompt — personal, not a dump. */
export function formatMemoryForGm(memory: ArbiterMemory): string {
  const nick =
    Object.entries(memory.nicknames)
      .map(([k, v]) => `${k}→${v}`)
      .join(', ') || 'none yet';
  const jokes = memory.jokes.slice(0, 5).join(' | ') || 'none yet';
  const spine = memory.sessionSpine.map((s) => `• ${s}`).join('\n') || '• Fresh session.';
  const highlights = memory.highlights
    .slice(0, 4)
    .map((h) => `• ${h.title} (${h.who}): ${h.detail}`)
    .join('\n') || '• No legends sealed yet.';

  return [
    `Table bond: ${memory.tableBond || 'Still learning these three.'}`,
    `Nicknames: ${nick}`,
    `Running jokes: ${jokes}`,
    `Session spine:\n${spine}`,
    `Memorable moments:\n${highlights}`,
    memory.directorNote
      ? `Host director note (honor this): ${memory.directorNote}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Cold-open callback when returning to a remembered table. */
export function buildColdOpen(memory: ArbiterMemory, campaignTitle: string): string | null {
  if (memory.highlights.length === 0 && memory.sessionSpine.length === 0) {
    return null;
  }

  const highlight = memory.highlights[0];
  const spineBit = memory.sessionSpine[0];
  const joke = memory.jokes[0];

  const lines = [
    `The Arbiter looks up from the wood as ${campaignTitle} settles again.`,
  ];

  if (highlight) {
    lines.push(
      `Still tasting last time: "${highlight.title}" — ${highlight.detail}`
    );
  } else if (spineBit) {
    lines.push(`The spine of the night still reads: ${spineBit}`);
  }

  if (joke) {
    lines.push(`And yes — ${joke} Still funny. Still dangerous.`);
  }

  lines.push('What do you reach for first?');
  return lines.join('\n\n');
}

export function shouldOfferColdOpen(memory: ArbiterMemory): boolean {
  if (memory.highlights.length === 0 && memory.sessionSpine.length === 0) {
    return false;
  }
  if (!memory.lastColdOpenAt) return true;
  const last = Date.parse(memory.lastColdOpenAt);
  if (Number.isNaN(last)) return true;
  // Once per ~4 hours of wall clock — enough for "come back Sunday"
  return Date.now() - last > 4 * 60 * 60 * 1000;
}
