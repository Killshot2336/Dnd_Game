import type {
  AbilityScores,
  CharacterPayload,
  GameRecord,
  HistoryMessage,
  PlayerEntity,
  ThreadMessage,
} from '@/types/database';

export const DEFAULT_STATS: AbilityScores = {
  STR: 10,
  DEX: 10,
  CON: 10,
  INT: 10,
  WIS: 10,
  CHA: 10,
};

export function parseStats(raw: unknown): AbilityScores {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_STATS };
  }

  const source = raw as Record<string, unknown>;
  return {
    STR: typeof source.STR === 'number' && Number.isFinite(source.STR) ? source.STR : 10,
    DEX: typeof source.DEX === 'number' && Number.isFinite(source.DEX) ? source.DEX : 10,
    CON: typeof source.CON === 'number' && Number.isFinite(source.CON) ? source.CON : 10,
    INT: typeof source.INT === 'number' && Number.isFinite(source.INT) ? source.INT : 10,
    WIS: typeof source.WIS === 'number' && Number.isFinite(source.WIS) ? source.WIS : 10,
    CHA: typeof source.CHA === 'number' && Number.isFinite(source.CHA) ? source.CHA : 10,
  };
}

export function normalizePlayer(row: Record<string, unknown> | null | undefined): PlayerEntity | null {
  if (!row || typeof row !== 'object') return null;
  if (row.id == null || row.game_id == null || row.user_name == null) return null;

  return {
    id: String(row.id),
    game_id: String(row.game_id),
    user_name: String(row.user_name),
    avatar_class: String(row.avatar_class ?? 'Adventurer'),
    current_hp: typeof row.current_hp === 'number' ? row.current_hp : 15,
    max_hp: typeof row.max_hp === 'number' && row.max_hp > 0 ? row.max_hp : 15,
    stats: parseStats(row.stats),
    created_at: String(row.created_at ?? new Date().toISOString()),
  };
}

export function normalizeMessage(row: Record<string, unknown> | null | undefined): ThreadMessage | null {
  if (!row || typeof row !== 'object') return null;
  if (row.id == null || row.game_id == null || row.content == null) return null;

  return {
    id: Number(row.id),
    game_id: String(row.game_id),
    sender: String(row.sender ?? 'Unknown'),
    content: String(row.content),
    created_at: String(row.created_at ?? new Date().toISOString()),
  };
}

export function normalizeGame(row: Record<string, unknown> | null | undefined): GameRecord | null {
  if (!row || typeof row !== 'object' || row.id == null || row.session_code == null) {
    return null;
  }

  return {
    id: String(row.id),
    session_code: String(row.session_code).toUpperCase(),
    current_narrative: String(
      row.current_narrative ?? 'The dynamic void initializes. Welcome, degenerates.'
    ),
    state_data:
      row.state_data && typeof row.state_data === 'object'
        ? (row.state_data as Record<string, unknown>)
        : {},
    created_at: String(row.created_at ?? new Date().toISOString()),
  };
}

export function safeStat(
  player: PlayerEntity | null | undefined,
  key: keyof AbilityScores
): number {
  return player?.stats?.[key] ?? DEFAULT_STATS[key] ?? 10;
}

export function safeHp(player: PlayerEntity | null | undefined): {
  current: number;
  max: number;
  ratio: number;
} {
  const current = typeof player?.current_hp === 'number' ? player.current_hp : 15;
  const max = typeof player?.max_hp === 'number' && player.max_hp > 0 ? player.max_hp : 15;
  return {
    current,
    max,
    ratio: Math.max(0, Math.min(1, current / max)),
  };
}

export function ensureAbilityScores(stats: unknown): AbilityScores {
  return parseStats(stats);
}

export function sanitizeCharacterPayload(raw: CharacterPayload): CharacterPayload {
  return {
    name: String(raw?.name ?? '').trim().slice(0, 50) || 'Wanderer',
    characterClass: String(raw?.characterClass ?? 'Adventurer').trim().slice(0, 30) || 'Adventurer',
    stats: ensureAbilityScores(raw?.stats),
  };
}

export function createOptimisticMessage(
  gameId: string,
  sender: string,
  content: string
): ThreadMessage {
  return {
    id: -Math.floor(Math.random() * 1_000_000_000) - Date.now(),
    game_id: gameId,
    sender,
    content,
    created_at: new Date().toISOString(),
  };
}

export function mergeMessageLedger(
  previous: ThreadMessage[],
  incoming: ThreadMessage
): ThreadMessage[] {
  if (previous.some((message) => message.id === incoming.id)) {
    return previous;
  }

  const withoutOptimisticTwin = previous.filter((message) => {
    if (message.id >= 0) return true;
    return !(
      message.sender === incoming.sender &&
      message.content === incoming.content &&
      Math.abs(new Date(message.created_at).getTime() - new Date(incoming.created_at).getTime()) <
        30_000
    );
  });

  return [...withoutOptimisticTwin, incoming].sort((a, b) => {
    const aTime = new Date(a.created_at).getTime();
    const bTime = new Date(b.created_at).getTime();
    if (aTime !== bTime) return aTime - bTime;
    return a.id - b.id;
  });
}

export function mergePlayerLedger(
  previous: PlayerEntity[],
  incoming: PlayerEntity
): PlayerEntity[] {
  const exists = previous.some((player) => player.id === incoming.id);
  if (exists) {
    return previous.map((player) => (player.id === incoming.id ? incoming : player));
  }

  const sameName = previous.some(
    (player) =>
      player.game_id === incoming.game_id &&
      player.user_name.toLowerCase() === incoming.user_name.toLowerCase()
  );
  if (sameName) {
    return previous.map((player) =>
      player.game_id === incoming.game_id &&
      player.user_name.toLowerCase() === incoming.user_name.toLowerCase()
        ? incoming
        : player
    );
  }

  return [...previous, incoming];
}

export function sanitizeHistory(raw: unknown): HistoryMessage[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const record = entry as Record<string, unknown>;
      const sender = typeof record.sender === 'string' ? record.sender.trim() : '';
      const content = typeof record.content === 'string' ? record.content.trim() : '';
      if (!sender || !content) return null;
      return { sender, content };
    })
    .filter((entry): entry is HistoryMessage => entry !== null)
    .slice(-12);
}

export function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code;
  const message = String((error as { message?: string }).message ?? '').toLowerCase();
  return code === '23505' || message.includes('duplicate') || message.includes('unique');
}
