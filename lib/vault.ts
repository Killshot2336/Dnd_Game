import type { CampaignId } from '@/lib/campaigns';
import { getCampaign } from '@/lib/campaigns';
import type { ReactiveCampaignState } from '@/lib/campaigns/types';

const VAULT_KEY = 'voidline_campaign_vault_v1';

export interface LocalVaultEntry {
  campaignId: CampaignId;
  code: string;
  title: string;
  coverArt: string;
  lastChapter: string;
  characters: string[];
  heatSummary: string;
  updatedAt: string;
}

export interface SessionChapter {
  id: string;
  title: string;
  summary: string;
  at: string;
}

export interface VaultBeat {
  id: string;
  label: string;
  hint?: string;
}

export interface VaultCheck {
  id: string;
  ability: string;
  dc: number;
  label: string;
  target?: string;
}

export type ClashZone = 'front' | 'flank' | 'rear' | 'shadow';

export interface ClashCombatant {
  name: string;
  hp: number;
  maxHp: number;
  conditions: string[];
  zone: ClashZone;
}

export interface TitleCardPayload {
  title: string;
  subtitle: string;
  kind?: 'chapter' | 'clock' | 'clash' | 'loot';
}

export interface VaultRoomState {
  chapters: SessionChapter[];
  pendingBeats: VaultBeat[];
  pendingChecks: VaultCheck[];
  clash: {
    active: boolean;
    combatants: ClashCombatant[];
  };
  titleCard: TitleCardPayload | null;
  hostSkipArbiter: boolean;
}

export function emptyVaultRoomState(): VaultRoomState {
  return {
    chapters: [],
    pendingBeats: [],
    pendingChecks: [],
    clash: { active: false, combatants: [] },
    titleCard: null,
    hostSkipArbiter: false,
  };
}

export function readVaultRoom(stateData: unknown): VaultRoomState {
  const base = emptyVaultRoomState();
  if (!stateData || typeof stateData !== 'object') return base;
  const vault = (stateData as Record<string, unknown>).vault;
  if (!vault || typeof vault !== 'object') return base;
  const source = vault as Record<string, unknown>;

  return {
    chapters: Array.isArray(source.chapters)
      ? (source.chapters as SessionChapter[]).filter(
          (c) => c && typeof c.id === 'string' && typeof c.title === 'string'
        )
      : [],
    pendingBeats: Array.isArray(source.pendingBeats)
      ? (source.pendingBeats as VaultBeat[]).filter((b) => b && typeof b.id === 'string')
      : [],
    pendingChecks: Array.isArray(source.pendingChecks)
      ? (source.pendingChecks as VaultCheck[])
          .filter((c) => c && typeof c.id === 'string')
          .map((c) => ({
            id: c.id,
            ability: String(c.ability || 'dexterity'),
            dc: Number(c.dc) || 12,
            label: String(c.label || 'Check'),
            target: c.target ? String(c.target) : undefined,
          }))
      : [],
    clash: parseClash(source.clash),
    titleCard: parseTitleCard(source.titleCard),
    hostSkipArbiter: Boolean(source.hostSkipArbiter),
  };
}

function parseClash(raw: unknown): VaultRoomState['clash'] {
  if (!raw || typeof raw !== 'object') return { active: false, combatants: [] };
  const source = raw as Record<string, unknown>;
  const combatants = Array.isArray(source.combatants)
    ? (source.combatants as ClashCombatant[])
        .filter((c) => c && typeof c.name === 'string')
        .map((c) => ({
          name: c.name,
          hp: Number(c.hp) || 0,
          maxHp: Math.max(1, Number(c.maxHp) || 1),
          conditions: Array.isArray(c.conditions) ? c.conditions.map(String) : [],
          zone: (['front', 'flank', 'rear', 'shadow'].includes(c.zone)
            ? c.zone
            : 'front') as ClashZone,
        }))
    : [];
  return {
    active: Boolean(source.active) || combatants.length > 0,
    combatants,
  };
}

function parseTitleCard(raw: unknown): TitleCardPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  if (typeof source.title !== 'string' || !source.title.trim()) return null;
  return {
    title: source.title.trim(),
    subtitle: typeof source.subtitle === 'string' ? source.subtitle : '',
    kind:
      source.kind === 'chapter' ||
      source.kind === 'clock' ||
      source.kind === 'clash' ||
      source.kind === 'loot'
        ? source.kind
        : 'chapter',
  };
}

export function writeVaultRoom(
  stateData: unknown,
  patch: Partial<VaultRoomState>
): Record<string, unknown> {
  const base =
    stateData && typeof stateData === 'object'
      ? ({ ...(stateData as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  const current = readVaultRoom(base);
  base.vault = {
    ...current,
    ...patch,
    clash: patch.clash ? { ...current.clash, ...patch.clash } : current.clash,
  };
  return base;
}

/** Derive chapter title from reactive clocks/flags when a clock ticks. */
export function deriveChapterFromState(
  prev: ReactiveCampaignState | null,
  next: ReactiveCampaignState,
  campaignTitle: string
): SessionChapter | null {
  if (!prev) return null;

  for (const [id, clock] of Object.entries(next.clocks)) {
    const prior = prev.clocks[id];
    if (!prior) continue;
    if (clock.filled > prior.filled) {
      const full = clock.filled >= clock.segments;
      return {
        id: `clock-${id}-${clock.filled}-${Date.now()}`,
        title: full ? `${clock.name} — Struck` : `${clock.name} advances`,
        summary: full
          ? `The ${clock.name} clock fills. The table holds its breath.`
          : `${clock.name}: ${clock.filled}/${clock.segments}. Consequence gathers under ${campaignTitle}.`,
        at: new Date().toISOString(),
      };
    }
  }

  const newFlags = Object.keys(next.flags).filter(
    (key) => !(key in prev.flags) || prev.flags[key] !== next.flags[key]
  );
  if (newFlags.length > 0) {
    const flag = newFlags[0];
    return {
      id: `flag-${flag}-${Date.now()}`,
      title: 'The ledger turns',
      summary: `Flag sealed: ${flag} = ${String(next.flags[flag])}`,
      at: new Date().toISOString(),
    };
  }

  return null;
}

export function readLocalVault(): LocalVaultEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(VAULT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LocalVaultEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e) => e && typeof e.code === 'string' && typeof e.campaignId === 'string')
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 6);
  } catch {
    return [];
  }
}

export function upsertLocalVault(entry: LocalVaultEntry): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = readLocalVault().filter((e) => e.code !== entry.code);
    existing.unshift(entry);
    window.localStorage.setItem(VAULT_KEY, JSON.stringify(existing.slice(0, 6)));
  } catch {
    /* ignore quota */
  }
}

export function removeLocalVault(code: string): void {
  if (typeof window === 'undefined') return;
  try {
    const next = readLocalVault().filter((e) => e.code !== code);
    window.localStorage.setItem(VAULT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function buildLocalVaultEntry(input: {
  campaignId: string;
  code: string;
  characters: string[];
  reactive: ReactiveCampaignState | null;
  lastChapter?: string;
}): LocalVaultEntry | null {
  const campaign = getCampaign(input.campaignId);
  if (!campaign) return null;

  const heatBits = input.reactive
    ? Object.entries(input.reactive.heat)
        .map(([id, v]) => `${id}:${v}`)
        .slice(0, 3)
        .join(' · ')
    : 'embers cold';

  return {
    campaignId: campaign.id as CampaignId,
    code: input.code.toUpperCase(),
    title: campaign.title,
    coverArt: campaign.coverArt,
    lastChapter: input.lastChapter ?? 'Session sealed. The vault remembers.',
    characters: input.characters.slice(0, 4),
    heatSummary: heatBits || 'embers cold',
    updatedAt: new Date().toISOString(),
  };
}

export function applyHarmToClash(
  clash: VaultRoomState['clash'],
  target: string,
  amount: number
): VaultRoomState['clash'] {
  const nameKey = target.trim().toLowerCase();
  const combatants = clash.combatants.map((c) => {
    if (c.name.toLowerCase() !== nameKey && !c.name.toLowerCase().includes(nameKey)) {
      return c;
    }
    const hp = Math.max(0, Math.min(c.maxHp, c.hp - amount));
    const conditions = [...c.conditions];
    if (hp <= 0 && !conditions.includes('down')) conditions.push('down');
    if (hp > 0) {
      return { ...c, hp, conditions: conditions.filter((x) => x !== 'down') };
    }
    return { ...c, hp, conditions };
  });
  return { ...clash, combatants, active: true };
}

export function ensureClashCombatant(
  clash: VaultRoomState['clash'],
  name: string,
  maxHp: number
): VaultRoomState['clash'] {
  const exists = clash.combatants.some(
    (c) => c.name.toLowerCase() === name.trim().toLowerCase()
  );
  if (exists) return { ...clash, active: true };
  return {
    active: true,
    combatants: [
      ...clash.combatants,
      {
        name: name.trim(),
        hp: maxHp,
        maxHp,
        conditions: [],
        zone: 'front' as ClashZone,
      },
    ],
  };
}

export const LEVEL_UP_LORE_SKINS = [
  {
    id: 'ash-scar',
    label: 'Ash Scar',
    blurb: 'Cinders kiss the skin. One scar remembers the forge.',
  },
  {
    id: 'tide-mark',
    label: 'Tide Mark',
    blurb: 'Salt lines the wrists. The sea claims a favor.',
  },
  {
    id: 'root-vein',
    label: 'Root Vein',
    blurb: 'Blackroot ink under the nails. The wood listens.',
  },
  {
    id: 'void-sigil',
    label: 'Void Sigil',
    blurb: 'A faint glyph behind the ear. The Arbiter nods once.',
  },
] as const;
