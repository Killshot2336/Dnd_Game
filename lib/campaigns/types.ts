export interface CampaignNpc {
  id: string;
  name: string;
  role: string;
  desire: string;
  secret: string;
  voice: string;
}

export interface CampaignLocation {
  id: string;
  name: string;
  sensory: string;
  threat: string;
  opportunity: string;
}

export interface CampaignFaction {
  id: string;
  name: string;
  goal: string;
  method: string;
  startingHeat: number;
}

export interface CampaignClock {
  id: string;
  name: string;
  segments: number;
  filled: number;
  doom: string;
}

export interface CampaignDefinition {
  id: string;
  title: string;
  tagline: string;
  tone: string;
  themes: string[];
  coverArt: string;
  tableArt: string;
  mapArt: string;
  gmScreenArt: string;
  voiceBible: string;
  openingNarrative: string;
  sessionOneSetPiece: string;
  npcs: CampaignNpc[];
  locations: CampaignLocation[];
  factions: CampaignFaction[];
  clocks: CampaignClock[];
  lootHooks: string[];
  gmDirectives: string[];
}

export interface ReactiveCampaignState {
  campaignId: string;
  flags: Record<string, boolean | string | number>;
  heat: Record<string, number>;
  clocks: Record<string, { filled: number; segments: number; name: string }>;
  npcMemory: Record<string, string[]>;
  locationState: Record<string, string>;
  lastConsequence: string;
  updatedAt: string;
}

export function createInitialCampaignState(campaign: CampaignDefinition): ReactiveCampaignState {
  const heat: Record<string, number> = {};
  for (const faction of campaign.factions) {
    heat[faction.id] = faction.startingHeat;
  }

  const clocks: ReactiveCampaignState['clocks'] = {};
  for (const clock of campaign.clocks) {
    clocks[clock.id] = {
      filled: clock.filled,
      segments: clock.segments,
      name: clock.name,
    };
  }

  const locationState: Record<string, string> = {};
  for (const location of campaign.locations) {
    locationState[location.id] = 'stable';
  }

  const openingLocation = campaign.locations[0]?.id;
  if (openingLocation) {
    locationState[openingLocation] = 'active:opening';
  }

  return {
    campaignId: campaign.id,
    flags: {
      campaign_started: true,
      opening_delivered: true,
      session_one_live: true,
    },
    heat,
    clocks,
    npcMemory: {},
    locationState,
    lastConsequence: 'The table is set. Nothing is forgiven yet.',
    updatedAt: new Date().toISOString(),
  };
}

export function parseCampaignState(raw: unknown): ReactiveCampaignState | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  if (typeof source.campaignId !== 'string') return null;

  return {
    campaignId: source.campaignId,
    flags:
      source.flags && typeof source.flags === 'object'
        ? (source.flags as Record<string, boolean | string | number>)
        : {},
    heat:
      source.heat && typeof source.heat === 'object'
        ? (source.heat as Record<string, number>)
        : {},
    clocks:
      source.clocks && typeof source.clocks === 'object'
        ? Object.fromEntries(
            Object.entries(source.clocks as Record<string, unknown>)
              .filter(([, clock]) => clock && typeof clock === 'object')
              .map(([id, clock]) => {
                const c = clock as Record<string, unknown>;
                return [
                  id,
                  {
                    name: typeof c.name === 'string' ? c.name : id,
                    segments:
                      typeof c.segments === 'number' ? c.segments : 6,
                    filled: typeof c.filled === 'number' ? c.filled : 0,
                  },
                ];
              })
          )
        : {},
    npcMemory:
      source.npcMemory && typeof source.npcMemory === 'object'
        ? (source.npcMemory as Record<string, string[]>)
        : {},
    locationState:
      source.locationState && typeof source.locationState === 'object'
        ? (source.locationState as Record<string, string>)
        : {},
    lastConsequence:
      typeof source.lastConsequence === 'string'
        ? source.lastConsequence
        : 'The world holds its breath.',
    updatedAt:
      typeof source.updatedAt === 'string' ? source.updatedAt : new Date().toISOString(),
  };
}

export function mergeCampaignState(
  current: ReactiveCampaignState,
  patch: Partial<ReactiveCampaignState>
): ReactiveCampaignState {
  const npcMemory = { ...current.npcMemory };
  if (patch.npcMemory) {
    for (const [npcId, notes] of Object.entries(patch.npcMemory)) {
      const incoming = Array.isArray(notes) ? notes.map(String) : [];
      const prior = npcMemory[npcId] ?? [];
      npcMemory[npcId] = [...prior, ...incoming].slice(-8);
    }
  }

  const clocks = { ...current.clocks };
  if (patch.clocks) {
    for (const [clockId, clock] of Object.entries(patch.clocks)) {
      if (!clock || typeof clock !== 'object') continue;
      const prior = clocks[clockId];
      clocks[clockId] = {
        name: typeof clock.name === 'string' ? clock.name : prior?.name ?? clockId,
        segments:
          typeof clock.segments === 'number' ? clock.segments : prior?.segments ?? 6,
        filled: typeof clock.filled === 'number' ? clock.filled : prior?.filled ?? 0,
      };
    }
  }

  return {
    ...current,
    flags: { ...current.flags, ...(patch.flags ?? {}) },
    heat: { ...current.heat, ...(patch.heat ?? {}) },
    clocks,
    npcMemory,
    locationState: { ...current.locationState, ...(patch.locationState ?? {}) },
    lastConsequence: patch.lastConsequence ?? current.lastConsequence,
    updatedAt: new Date().toISOString(),
    campaignId: current.campaignId,
  };
}

export function formatStateForGm(state: ReactiveCampaignState): string {
  const clocks = Object.entries(state.clocks)
    .map(([id, clock]) => `${clock.name} [${id}]: ${clock.filled}/${clock.segments}`)
    .join('\n');
  const heat = Object.entries(state.heat)
    .map(([id, value]) => `${id}: ${value}`)
    .join(', ');
  const flags = Object.entries(state.flags)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(', ');
  const locations = Object.entries(state.locationState)
    .map(([id, status]) => `${id}:${status}`)
    .join(', ');
  const memory = Object.entries(state.npcMemory)
    .map(([npc, notes]) => `${npc}: ${(notes ?? []).slice(-3).join(' | ')}`)
    .join('\n');

  return [
    `Campaign: ${state.campaignId}`,
    `Flags: ${flags || 'none'}`,
    `Faction heat: ${heat || 'none'}`,
    `Clocks:\n${clocks || 'none'}`,
    `Locations: ${locations || 'none'}`,
    `NPC memory:\n${memory || 'none'}`,
    `Last consequence: ${state.lastConsequence}`,
  ].join('\n');
}

/** Extract optional <<<STATE ... STATE>>> JSON patch from GM reply. */
export function extractStatePatch(reply: string): {
  cleanReply: string;
  patch: Partial<ReactiveCampaignState> | null;
} {
  const match = reply.match(/<<<STATE([\s\S]*?)STATE>>>/);
  if (!match) {
    return { cleanReply: reply.trim(), patch: null };
  }

  const cleanReply = reply.replace(match[0], '').trim();
  try {
    const parsed = JSON.parse(match[1].trim()) as Partial<ReactiveCampaignState>;
    return { cleanReply, patch: parsed };
  } catch {
    return { cleanReply, patch: null };
  }
}
