import type { AbilityScores } from '@/types/database';
import { parseStats } from '@/lib/game-guards';

export interface CachedPlayerSeat {
  gameId: string;
  sessionCode: string;
  playerId: string;
  userName: string;
  avatarClass: string;
  stats: AbilityScores;
  savedAt: string;
}

const STORAGE_PREFIX = 'voidline:player-seat:';

function storageKey(sessionCode: string): string {
  return `${STORAGE_PREFIX}${sessionCode.toUpperCase()}`;
}

export function readCachedPlayerSeat(sessionCode: string): CachedPlayerSeat | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(storageKey(sessionCode));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<CachedPlayerSeat>;
    if (!parsed.playerId || !parsed.userName || !parsed.gameId || !parsed.sessionCode) {
      return null;
    }

    return {
      gameId: String(parsed.gameId),
      sessionCode: String(parsed.sessionCode).toUpperCase(),
      playerId: String(parsed.playerId),
      userName: String(parsed.userName),
      avatarClass: String(parsed.avatarClass ?? 'Adventurer'),
      stats: parseStats(parsed.stats),
      savedAt: String(parsed.savedAt ?? new Date().toISOString()),
    };
  } catch {
    return null;
  }
}

export function writeCachedPlayerSeat(seat: CachedPlayerSeat): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      storageKey(seat.sessionCode),
      JSON.stringify({
        ...seat,
        sessionCode: seat.sessionCode.toUpperCase(),
        savedAt: new Date().toISOString(),
      })
    );
  } catch {
    // Ignore quota / private-mode failures; DB lookup remains the source of truth.
  }
}

export function clearCachedPlayerSeat(sessionCode: string): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(storageKey(sessionCode));
  } catch {
    // no-op
  }
}
