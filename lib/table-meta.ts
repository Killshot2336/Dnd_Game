/** Soft table meta stored alongside campaign reactive state — additive only. */

export interface TokenTablePos {
  /** 0–100 percent across the table plane */
  x: number;
  /** 0–100 percent down the table plane */
  y: number;
}

export interface TableMeta {
  tokenPositions: Record<string, TokenTablePos>;
  spotlight: string | null;
  openingPosted: boolean;
  sfxMuted?: boolean;
}

export function emptyTableMeta(): TableMeta {
  return {
    tokenPositions: {},
    spotlight: null,
    openingPosted: false,
  };
}

export function readTableMeta(stateData: unknown): TableMeta {
  if (!stateData || typeof stateData !== 'object') return emptyTableMeta();
  const data = stateData as Record<string, unknown>;
  const raw = data.table;
  if (!raw || typeof raw !== 'object') return emptyTableMeta();
  const table = raw as Record<string, unknown>;

  const tokenPositions: Record<string, TokenTablePos> = {};
  if (table.tokenPositions && typeof table.tokenPositions === 'object') {
    for (const [name, pos] of Object.entries(
      table.tokenPositions as Record<string, unknown>
    )) {
      if (!pos || typeof pos !== 'object') continue;
      const p = pos as Record<string, unknown>;
      if (typeof p.x === 'number' && typeof p.y === 'number') {
        tokenPositions[name] = {
          x: Math.min(92, Math.max(8, p.x)),
          y: Math.min(88, Math.max(12, p.y)),
        };
      }
    }
  }

  return {
    tokenPositions,
    spotlight: typeof table.spotlight === 'string' ? table.spotlight : null,
    openingPosted: table.openingPosted === true,
    sfxMuted: table.sfxMuted === true,
  };
}

export function writeTableMeta(
  stateData: Record<string, unknown> | null | undefined,
  patch: Partial<TableMeta>
): Record<string, unknown> {
  const base = stateData && typeof stateData === 'object' ? { ...stateData } : {};
  const current = readTableMeta(base);
  base.table = {
    tokenPositions: patch.tokenPositions ?? current.tokenPositions,
    spotlight:
      patch.spotlight !== undefined ? patch.spotlight : current.spotlight,
    openingPosted:
      patch.openingPosted !== undefined
        ? patch.openingPosted
        : current.openingPosted,
    sfxMuted: patch.sfxMuted !== undefined ? patch.sfxMuted : current.sfxMuted,
  };
  return base;
}

/** Default seats: self near bottom, others along sides. */
export function defaultTokenPos(
  index: number,
  total: number,
  isSelf: boolean
): TokenTablePos {
  if (isSelf) return { x: 50, y: 78 };
  if (total <= 1) return { x: 50, y: 45 };
  const side = index % 2 === 0 ? 18 : 82;
  const row = 28 + Math.floor(index / 2) * 18;
  return { x: side, y: Math.min(70, row) };
}
