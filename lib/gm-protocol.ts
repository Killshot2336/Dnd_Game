import type { ReactiveCampaignState } from '@/lib/campaigns/types';
import type {
  ClashCombatant,
  TitleCardPayload,
  VaultBeat,
  VaultCheck,
  VaultRoomState,
} from '@/lib/vault';

export interface GmProtocolResult {
  cleanReply: string;
  statePatch: Partial<ReactiveCampaignState> | null;
  beats: VaultBeat[] | null;
  checks: VaultCheck[] | null;
  harm: { target: string; amount: number }[] | null;
  loot: string[] | null;
  titleCard: TitleCardPayload | null;
  clashStart: ClashCombatant[] | null;
  clashEnd: boolean;
}

function extractBlock(reply: string, tag: string): { clean: string; body: string | null } {
  const re = new RegExp(`<<<${tag}([\\s\\S]*?)${tag}>>>`, 'i');
  const match = reply.match(re);
  if (!match) return { clean: reply, body: null };
  return {
    clean: reply.replace(match[0], ''),
    body: match[1].trim(),
  };
}

function parseJson<T>(body: string | null): T | null {
  if (!body) return null;
  try {
    return JSON.parse(body) as T;
  } catch {
    return null;
  }
}

/** Strip and parse all Vault protocol blocks from a GM reply. */
export function extractGmProtocol(reply: string): GmProtocolResult {
  let working = reply;

  const state = extractBlock(working, 'STATE');
  working = state.clean;
  const statePatch = parseJson<Partial<ReactiveCampaignState>>(state.body);

  const beatsBlock = extractBlock(working, 'BEATS');
  working = beatsBlock.clean;
  const beatsRaw = parseJson<VaultBeat[] | { beats: VaultBeat[] }>(beatsBlock.body);
  const beats = Array.isArray(beatsRaw)
    ? beatsRaw
    : beatsRaw && Array.isArray(beatsRaw.beats)
      ? beatsRaw.beats
      : null;

  const checksBlock = extractBlock(working, 'CHECKS');
  working = checksBlock.clean;
  const checksRaw = parseJson<VaultCheck[] | { checks: VaultCheck[] }>(checksBlock.body);
  const checks = Array.isArray(checksRaw)
    ? checksRaw
    : checksRaw && Array.isArray(checksRaw.checks)
      ? checksRaw.checks
      : null;

  const harmBlock = extractBlock(working, 'HARM');
  working = harmBlock.clean;
  const harmRaw = parseJson<
    { target: string; amount: number }[] | { harm: { target: string; amount: number }[] }
  >(harmBlock.body);
  const harm = Array.isArray(harmRaw)
    ? harmRaw
    : harmRaw && Array.isArray(harmRaw.harm)
      ? harmRaw.harm
      : null;

  const lootBlock = extractBlock(working, 'LOOT');
  working = lootBlock.clean;
  const lootRaw = parseJson<string[] | { loot: string[] }>(lootBlock.body);
  const loot = Array.isArray(lootRaw)
    ? lootRaw
    : lootRaw && Array.isArray(lootRaw.loot)
      ? lootRaw.loot
      : null;

  const titleBlock = extractBlock(working, 'TITLE');
  working = titleBlock.clean;
  const titleCard = parseJson<TitleCardPayload>(titleBlock.body);

  const clashBlock = extractBlock(working, 'CLASH');
  working = clashBlock.clean;
  let clashStart: ClashCombatant[] | null = null;
  let clashEnd = false;
  if (clashBlock.body) {
    const trimmed = clashBlock.body.trim().toLowerCase();
    if (trimmed === 'end' || trimmed === '{"end":true}') {
      clashEnd = true;
    } else {
      const parsed = parseJson<ClashCombatant[] | { combatants: ClashCombatant[] }>(
        clashBlock.body
      );
      if (Array.isArray(parsed)) clashStart = parsed;
      else if (parsed && Array.isArray(parsed.combatants)) clashStart = parsed.combatants;
    }
  }

  return {
    cleanReply: working.replace(/\n{3,}/g, '\n\n').trim(),
    statePatch,
    beats: beats?.filter((b) => b && typeof b.id === 'string' && typeof b.label === 'string') ?? null,
    checks:
      checks
        ?.filter((c) => c && typeof c.id === 'string' && typeof c.label === 'string')
        .map((c) => ({
          ...c,
          ability: String(c.ability || 'dexterity').toLowerCase(),
          dc: Number(c.dc) || 12,
        })) ?? null,
    harm:
      harm
        ?.filter((h) => h && typeof h.target === 'string')
        .map((h) => ({ target: h.target, amount: Number(h.amount) || 0 })) ?? null,
    loot: loot?.map(String).filter(Boolean) ?? null,
    titleCard:
      titleCard && typeof titleCard.title === 'string'
        ? {
            title: titleCard.title,
            subtitle: typeof titleCard.subtitle === 'string' ? titleCard.subtitle : '',
            kind: titleCard.kind,
          }
        : null,
    clashStart,
    clashEnd,
  };
}

export function mergeProtocolIntoVault(
  current: VaultRoomState,
  protocol: GmProtocolResult
): VaultRoomState {
  let next: VaultRoomState = { ...current };

  if (protocol.beats && protocol.beats.length > 0) {
    next = { ...next, pendingBeats: protocol.beats.slice(0, 4) };
  }
  if (protocol.checks && protocol.checks.length > 0) {
    next = { ...next, pendingChecks: protocol.checks.slice(0, 4) };
  }
  if (protocol.titleCard) {
    next = { ...next, titleCard: protocol.titleCard };
  }
  if (protocol.clashEnd) {
    next = { ...next, clash: { active: false, combatants: [] } };
  }
  if (protocol.clashStart && protocol.clashStart.length > 0) {
    next = {
      ...next,
      clash: {
        active: true,
        combatants: protocol.clashStart.map((c) => ({
          name: c.name,
          hp: Number(c.hp) || Number(c.maxHp) || 10,
          maxHp: Math.max(1, Number(c.maxHp) || Number(c.hp) || 10),
          conditions: Array.isArray(c.conditions) ? c.conditions.map(String) : [],
          zone: (['front', 'flank', 'rear', 'shadow'].includes(c.zone)
            ? c.zone
            : 'front') as ClashCombatant['zone'],
        })),
      },
    };
  }
  if (protocol.harm && protocol.harm.length > 0 && next.clash.active) {
    let clash = next.clash;
    for (const h of protocol.harm) {
      clash = {
        ...clash,
        combatants: clash.combatants.map((c) => {
          if (
            c.name.toLowerCase() !== h.target.toLowerCase() &&
            !c.name.toLowerCase().includes(h.target.toLowerCase())
          ) {
            return c;
          }
          const hp = Math.max(0, c.hp - h.amount);
          const conditions = [...c.conditions];
          if (hp <= 0 && !conditions.includes('down')) conditions.push('down');
          return { ...c, hp, conditions };
        }),
      };
    }
    next = { ...next, clash };
  }

  return next;
}

export const GM_VAULT_PROTOCOL = `
VAULT PROTOCOL — emit these blocks ONLY when fictionally earned. Never narrate the tags.

<<<STATE
{"flags":{},"heat":{},"clocks":{},"npcMemory":{},"locationState":{},"lastConsequence":""}
STATE>>>

<<<BEATS
[{"id":"beat_a","label":"Short player-facing choice","hint":"optional risk"}]
BEATS>>>

<<<CHECKS
[{"id":"chk_1","ability":"dexterity","dc":14,"label":"What they attempt","target":"anyone"}]
CHECKS>>>

<<<HARM
[{"target":"Name","amount":6}]
HARM>>>

<<<LOOT
["Item with weight and history"]
LOOT>>>

<<<TITLE
{"title":"Chapter title","subtitle":"One line","kind":"chapter"}
TITLE>>>

<<<CLASH
[{"name":"Enemy","hp":18,"maxHp":18,"conditions":[],"zone":"front"}]
CLASH>>>

To end clash: <<<CLASH
end
CLASH>>>

Rules for protocol:
- Offer 2–3 BEATS when the scene forks. Labels under 40 chars. No more than once per reply.
- Offer CHECKS when the fiction demands a roll — light the dice. One primary check preferred.
- Use HARM only during clash or clear injury. Amounts should match the fiction.
- TITLE when a clock fills, a chapter turns, or clash begins — short, cinematic.
- CLASH when blades are drawn. Include named foes with hp. End clash when the fight resolves.
- Keep STATE patches small and true.
`.trim();
