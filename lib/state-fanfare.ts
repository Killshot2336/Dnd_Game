import type { ReactiveCampaignState } from '@/lib/campaigns';

export interface FanfareEvent {
  id: string;
  kind: 'heat' | 'clock' | 'flag' | 'consequence' | 'location' | 'memory';
  title: string;
  detail: string;
}

/** Diff two reactive snapshots into short, loud table announcements. */
export function diffReactiveFanfare(
  prev: ReactiveCampaignState | null,
  next: ReactiveCampaignState | null
): FanfareEvent[] {
  if (!next) return [];
  if (!prev) return [];

  const events: FanfareEvent[] = [];

  for (const [id, value] of Object.entries(next.heat)) {
    const before = prev.heat[id];
    if (typeof before === 'number' && before !== value) {
      const delta = value - before;
      events.push({
        id: `heat-${id}-${value}`,
        kind: 'heat',
        title: `Faction heat · ${id.replace(/_/g, ' ')}`,
        detail: `${before} → ${value} (${delta > 0 ? '+' : ''}${delta})`,
      });
    } else if (before === undefined && value !== 0) {
      events.push({
        id: `heat-${id}-${value}`,
        kind: 'heat',
        title: `Faction heat · ${id.replace(/_/g, ' ')}`,
        detail: `Now at ${value}`,
      });
    }
  }

  for (const [id, clock] of Object.entries(next.clocks)) {
    const before = prev.clocks[id];
    if (!before) {
      events.push({
        id: `clock-${id}-${clock.filled}`,
        kind: 'clock',
        title: clock.name,
        detail: `Clock appears ${clock.filled}/${clock.segments}`,
      });
      continue;
    }
    if (before.filled !== clock.filled) {
      const filled = clock.filled >= clock.segments;
      events.push({
        id: `clock-${id}-${clock.filled}`,
        kind: 'clock',
        title: filled ? `Clock filled · ${clock.name}` : `Clock ticks · ${clock.name}`,
        detail: `${before.filled} → ${clock.filled}/${clock.segments}`,
      });
    }
  }

  for (const [key, value] of Object.entries(next.flags)) {
    if (prev.flags[key] !== value) {
      events.push({
        id: `flag-${key}-${String(value)}`,
        kind: 'flag',
        title: `Flag · ${key.replace(/_/g, ' ')}`,
        detail: String(value),
      });
    }
  }

  for (const [id, status] of Object.entries(next.locationState)) {
    if (prev.locationState[id] !== status) {
      events.push({
        id: `loc-${id}-${status}`,
        kind: 'location',
        title: `Place shifts · ${id.replace(/_/g, ' ')}`,
        detail: status,
      });
    }
  }

  for (const [npc, notes] of Object.entries(next.npcMemory)) {
    const prior = prev.npcMemory[npc] ?? [];
    if ((notes?.length ?? 0) > prior.length) {
      const newest = notes[notes.length - 1];
      events.push({
        id: `mem-${npc}-${notes.length}`,
        kind: 'memory',
        title: `${npc.replace(/_/g, ' ')} remembers`,
        detail: newest,
      });
    }
  }

  if (
    next.lastConsequence &&
    next.lastConsequence !== prev.lastConsequence &&
    next.lastConsequence !== 'The table is set. Nothing is forgiven yet.' &&
    next.lastConsequence !== 'The world holds its breath.'
  ) {
    events.push({
      id: `conseq-${next.updatedAt}`,
      kind: 'consequence',
      title: 'Consequence',
      detail: next.lastConsequence,
    });
  }

  return events.slice(0, 6);
}

export function buildSessionRecap(
  campaignTitle: string | null | undefined,
  state: ReactiveCampaignState | null
): string {
  if (!state) {
    return 'No world state yet — the chronicle is still blank.';
  }

  const heat = Object.entries(state.heat)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([id, v]) => `${id.replace(/_/g, ' ')} ${v}`)
    .join(', ');

  const clocks = Object.entries(state.clocks)
    .map(([, c]) => `${c.name} ${c.filled}/${c.segments}`)
    .join(' · ');

  const flags = Object.entries(state.flags)
    .filter(([, v]) => v === true || (typeof v === 'string' && v.length > 0))
    .slice(0, 6)
    .map(([k, v]) => (v === true ? k.replace(/_/g, ' ') : `${k}=${v}`))
    .join(', ');

  const memory = Object.entries(state.npcMemory)
    .slice(0, 4)
    .map(([npc, notes]) => `${npc}: ${(notes ?? []).slice(-1)[0] ?? '—'}`)
    .join('\n');

  return [
    campaignTitle ? `Campaign: ${campaignTitle}` : `Campaign: ${state.campaignId}`,
    heat ? `Heat: ${heat}` : 'Heat: quiet',
    clocks ? `Clocks: ${clocks}` : 'Clocks: none ticking',
    flags ? `Flags: ${flags}` : 'Flags: few',
    memory ? `NPC memory:\n${memory}` : 'NPC memory: none yet',
    `Last consequence: ${state.lastConsequence}`,
  ].join('\n');
}
