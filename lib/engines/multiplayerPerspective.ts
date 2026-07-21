/**
 * Localized multiplayer perspective — seat mapping, dice launch vectors,
 * and delta-time token lerping for the Next.js game room.
 * Absolute positions sync over Supabase; each device remaps seats locally.
 */

export const FOV_TABLE_PERSPECTIVE = '900px';
export const FOV_TABLE_ROTATE_X = '22deg';
export const TOKEN_LERP_MS = 150;

export type SeatSlot = 'bottom' | 'left' | 'right' | 'far';

export interface SeatAnchor {
  x: number;
  y: number;
}

export interface AbsolutePos {
  x: number;
  y: number;
}

export interface LocalPos extends AbsolutePos {
  seat: SeatSlot;
}

export interface SeatMap {
  activeProfileId: string | null;
  seats: Record<SeatSlot, string | null>;
  byProfileId: Record<string, SeatSlot>;
}

export interface DiceParticle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  vRot: number;
  size: number;
  alpha: number;
  value: number;
  settleX: number;
  settleY: number;
  age: number;
  settled: boolean;
}

export interface RollBroadcastPacket {
  type: 'dice_roll';
  rollerId: string | null;
  expression: string;
  total: number;
  seed: number;
  at: number;
}

export const SEAT_ANCHORS: Record<SeatSlot, SeatAnchor> = {
  bottom: { x: 50, y: 78 },
  left: { x: 16, y: 46 },
  right: { x: 84, y: 46 },
  far: { x: 50, y: 18 },
};

const DICE_LAUNCH: Record<
  SeatSlot,
  { ox: number; oy: number; vx: number; vy: number; spread: number }
> = {
  bottom: { ox: 0, oy: 36, vx: 0, vy: -1, spread: 0.35 },
  left: { ox: -42, oy: 0, vx: 1, vy: -0.15, spread: 0.4 },
  right: { ox: 42, oy: 0, vx: -1, vy: -0.15, spread: 0.4 },
  far: { ox: 0, oy: -28, vx: 0, vy: 0.55, spread: 0.3 },
};

export const DICE_REST = { x: 50, y: 22 };

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function easeOutCubic(t: number): number {
  const u = clamp(t, 0, 1);
  return 1 - Math.pow(1 - u, 3);
}

export interface SeatPlayer {
  id?: string | null;
  user_name?: string | null;
  name?: string | null;
  role?: string | null;
  isGm?: boolean;
}

function profileIdOf(player: SeatPlayer | null | undefined): string | null {
  if (!player) return null;
  if (player.id != null) return String(player.id);
  if (player.user_name) return String(player.user_name);
  if (player.name) return String(player.name);
  return null;
}

function isGmPlayer(player: SeatPlayer): boolean {
  const name = String(player.user_name || player.name || '').toLowerCase();
  return name === 'gm' || name === 'arbiter' || player.role === 'gm' || player.isGm === true;
}

/**
 * Active local player always occupies Bottom. Remaining teammates fill Left then Right.
 */
export function buildLocalSeatMap(
  players: SeatPlayer[],
  activeProfileId: string | null | undefined
): SeatMap {
  const list = Array.isArray(players) ? players.slice() : [];
  const activeId = activeProfileId == null ? null : String(activeProfileId);
  const map: SeatMap = {
    activeProfileId: activeId,
    seats: { bottom: null, left: null, right: null, far: null },
    byProfileId: {},
  };

  const peers: string[] = [];
  for (let i = 0; i < list.length; i++) {
    const player = list[i];
    const id = profileIdOf(player);
    if (!id) continue;
    if (isGmPlayer(player)) {
      map.seats.far = id;
      map.byProfileId[id] = 'far';
      continue;
    }
    if (activeId && id === activeId) {
      map.seats.bottom = id;
      map.byProfileId[id] = 'bottom';
      continue;
    }
    peers.push(id);
  }

  if (activeId && !map.byProfileId[activeId]) {
    map.seats.bottom = activeId;
    map.byProfileId[activeId] = 'bottom';
  }

  peers.sort();
  for (let i = 0; i < peers.length; i++) {
    const id = peers[i];
    if (map.byProfileId[id]) continue;
    const slot: SeatSlot = !map.seats.left ? 'left' : !map.seats.right ? 'right' : 'far';
    if (!map.seats[slot]) map.seats[slot] = id;
    map.byProfileId[id] = slot;
  }

  return map;
}

export function seatForProfile(
  seatMap: SeatMap | null | undefined,
  profileId: string | null | undefined
): SeatSlot {
  if (!seatMap || profileId == null) return 'far';
  return seatMap.byProfileId[String(profileId)] || 'far';
}

function seatRotationTurns(players: SeatPlayer[], bottomProfileId: string | null): number {
  const ids: string[] = [];
  for (let i = 0; i < players.length; i++) {
    const id = profileIdOf(players[i]);
    if (!id) continue;
    if (isGmPlayer(players[i])) continue;
    ids.push(id);
  }
  if (!ids.length || !bottomProfileId) return 0;
  const idx = ids.indexOf(String(bottomProfileId));
  if (idx < 0) return 0;
  return idx % 4;
}

export function localizeAbsolutePosition(
  absolutePos: AbsolutePos | null | undefined,
  seatMap: SeatMap,
  profileId: string | null | undefined,
  players: SeatPlayer[] = []
): LocalPos {
  const seat = seatForProfile(seatMap, profileId);
  const anchor = SEAT_ANCHORS[seat];
  if (!absolutePos || typeof absolutePos.x !== 'number' || typeof absolutePos.y !== 'number') {
    return { x: anchor.x, y: anchor.y, seat };
  }

  const cx = 50;
  const cy = 50;
  const dx = absolutePos.x - cx;
  const dy = absolutePos.y - cy;
  const turns = seatRotationTurns(players, seatMap.seats.bottom);
  const angle = turns * (Math.PI / 2);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const rx = dx * cos - dy * sin;
  const ry = dx * sin + dy * cos;

  return {
    x: clamp(cx + rx, 8, 92),
    y: clamp(cy + ry, 12, 88),
    seat,
  };
}

export function resolveLocalTokenPosition(
  profileId: string | null | undefined,
  absolutePositions: Record<string, AbsolutePos>,
  seatMap: SeatMap,
  players: SeatPlayer[] = []
): LocalPos {
  const id = profileId == null ? null : String(profileId);
  const absolute = id ? absolutePositions[id] : null;
  if (absolute) {
    return localizeAbsolutePosition(absolute, seatMap, id, players);
  }
  const seat = seatForProfile(seatMap, id);
  const anchor = SEAT_ANCHORS[seat];
  return { x: anchor.x, y: anchor.y, seat };
}

/**
 * Localized seat display position — active profile always Bottom,
 * teammates Left/Right relative to the local viewport.
 */
export function seatDisplayPosition(seat: SeatSlot): LocalPos {
  const anchor = SEAT_ANCHORS[seat];
  return { x: anchor.x, y: anchor.y, seat };
}

export function createLocalDiceTrajectory(
  seat: SeatSlot,
  finalValue: number,
  viewport: { width: number; height: number }
): DiceParticle[] {
  const launch = DICE_LAUNCH[seat] || DICE_LAUNCH.bottom;
  const width = viewport.width || 800;
  const height = viewport.height || 600;
  const originX =
    seat === 'bottom'
      ? width * 0.5
      : seat === 'left'
        ? width * 0.08
        : seat === 'right'
          ? width * 0.92
          : width * 0.5;
  const originY =
    seat === 'bottom'
      ? height * 0.92
      : seat === 'left' || seat === 'right'
        ? height * 0.55
        : height * 0.18;
  const restX = width * (DICE_REST.x / 100);
  const restY = height * (DICE_REST.y / 100);
  const face = clamp(Math.floor(Number(finalValue) || 1), 1, 20);

  const particles: DiceParticle[] = [];
  for (let i = 0; i < 5; i++) {
    const jitter = (Math.random() - 0.5) * launch.spread;
    const speed = 9 + Math.random() * 7;
    particles.push({
      id: Math.random(),
      x: originX + launch.ox + (Math.random() - 0.5) * 16,
      y: originY + launch.oy + (Math.random() - 0.5) * 12,
      vx: launch.vx * speed + jitter * 10,
      vy: launch.vy * speed + (Math.random() - 0.5) * 3,
      rotation: Math.random() * Math.PI * 2,
      vRot: (Math.random() - 0.5) * 0.45,
      size: 16 + Math.random() * 10,
      alpha: 1,
      value: face,
      settleX: restX + (Math.random() - 0.5) * 26,
      settleY: restY + (Math.random() - 0.5) * 18,
      age: 0,
      settled: false,
    });
  }
  return particles;
}

export function stepDiceParticles(particles: DiceParticle[], dtMs: number): DiceParticle[] {
  const dt = typeof dtMs === 'number' && dtMs > 0 ? dtMs : 16.67;
  const scale = dt / 16.67;
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.age += dt;
    if (!p.settled) {
      p.x += p.vx * scale;
      p.y += p.vy * scale;
      p.rotation += p.vRot * scale;
      p.vy += 0.22 * scale;
      const toRestX = p.settleX - p.x;
      const toRestY = p.settleY - p.y;
      p.vx += toRestX * 0.018 * scale;
      p.vy += toRestY * 0.018 * scale;
      p.vx *= Math.pow(0.985, scale);
      p.vy *= Math.pow(0.985, scale);
      if (p.age > 700 && Math.abs(toRestX) < 8 && Math.abs(toRestY) < 8) {
        p.settled = true;
        p.x = p.settleX;
        p.y = p.settleY;
        p.vx = 0;
        p.vy = 0;
        p.vRot *= 0.2;
      }
    } else {
      p.rotation += p.vRot * scale;
      p.vRot *= Math.pow(0.96, scale);
      p.alpha -= 0.004 * scale;
    }
    if (p.alpha <= 0) {
      particles.splice(i, 1);
    }
  }
  return particles;
}

export function buildRollBroadcast(input: {
  rollerId: string | null | undefined;
  expression?: string;
  total: number;
  seed?: number;
}): RollBroadcastPacket {
  return {
    type: 'dice_roll',
    rollerId: input.rollerId == null ? null : String(input.rollerId),
    expression: input.expression || '1d20',
    total: clamp(Math.floor(Number(input.total) || 1), 1, 999),
    seed: input.seed == null ? Date.now() : input.seed,
    at: Date.now(),
  };
}

interface LerpEntry {
  profileId: string;
  current: AbsolutePos;
  from: AbsolutePos;
  target: AbsolutePos;
  elapsed: number;
  duration: number;
}

export function createTokenLerpController(durationMs = TOKEN_LERP_MS) {
  const meshes = new Map<string, LerpEntry>();

  function ensure(profileId: string): LerpEntry {
    const id = String(profileId);
    let entry = meshes.get(id);
    if (!entry) {
      entry = {
        profileId: id,
        current: { x: 50, y: 50 },
        from: { x: 50, y: 50 },
        target: { x: 50, y: 50 },
        elapsed: durationMs,
        duration: durationMs,
      };
      meshes.set(id, entry);
    }
    return entry;
  }

  return {
    setImmediate(profileId: string, pos: AbsolutePos) {
      const entry = ensure(profileId);
      entry.current = { x: pos.x, y: pos.y };
      entry.from = { x: pos.x, y: pos.y };
      entry.target = { x: pos.x, y: pos.y };
      entry.elapsed = entry.duration;
    },

    setTarget(profileId: string, pos: AbsolutePos, ms?: number) {
      const entry = ensure(profileId);
      entry.from = { x: entry.current.x, y: entry.current.y };
      entry.target = {
        x: clamp(pos.x, 8, 92),
        y: clamp(pos.y, 12, 88),
      };
      entry.duration = typeof ms === 'number' ? ms : durationMs;
      entry.elapsed = 0;
    },

    tick(dtMs: number) {
      const dt = typeof dtMs === 'number' && dtMs > 0 ? dtMs : 16.67;
      meshes.forEach((entry) => {
        if (entry.elapsed >= entry.duration) {
          entry.current = { x: entry.target.x, y: entry.target.y };
          return;
        }
        entry.elapsed = Math.min(entry.duration, entry.elapsed + dt);
        const t = easeOutCubic(entry.elapsed / entry.duration);
        entry.current = {
          x: lerp(entry.from.x, entry.target.x, t),
          y: lerp(entry.from.y, entry.target.y, t),
        };
      });
    },

    getCurrent(profileId: string): AbsolutePos | null {
      const entry = meshes.get(String(profileId));
      return entry ? { x: entry.current.x, y: entry.current.y } : null;
    },

    has(profileId: string): boolean {
      return meshes.has(String(profileId));
    },

    clear() {
      meshes.clear();
    },
  };
}

export type TokenLerpController = ReturnType<typeof createTokenLerpController>;
