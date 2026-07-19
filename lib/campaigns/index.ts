import { ashcrownRegency } from "./ashcrown";
import { blackrootCarnival } from "./blackroot";
import { saltwakeBargain } from "./saltwake";
import type { CampaignDefinition, ReactiveCampaignState } from "./types";
import {
  createInitialCampaignState,
  mergeCampaignState,
  parseCampaignState,
} from "./types";

export type CampaignId = "ashcrown" | "saltwake" | "blackroot";

export const CAMPAIGNS: CampaignDefinition[] = [
  ashcrownRegency,
  saltwakeBargain,
  blackrootCarnival,
];

export function getCampaign(id: string | null | undefined): CampaignDefinition | null {
  if (!id) return null;
  return CAMPAIGNS.find((c) => c.id === id) ?? null;
}

export function isCampaignId(id: string): id is CampaignId {
  return CAMPAIGNS.some((c) => c.id === id);
}

/** Persistable games.state_data shape. */
export function buildInitialStateData(campaignId: CampaignId): Record<string, unknown> {
  const campaign = getCampaign(campaignId);
  if (!campaign) {
    return {
      campaignId,
      reactive: {
        campaignId,
        flags: { campaign_started: true },
        heat: {},
        clocks: {},
        npcMemory: {},
        locationState: {},
        lastConsequence: "The table is set.",
        updatedAt: new Date().toISOString(),
      } satisfies ReactiveCampaignState,
    };
  }

  return {
    campaignId: campaign.id,
    campaignTitle: campaign.title,
    reactive: createInitialCampaignState(campaign),
  };
}

export function readReactiveState(stateData: unknown): ReactiveCampaignState | null {
  if (!stateData || typeof stateData !== "object") return null;
  const data = stateData as Record<string, unknown>;
  const nested = parseCampaignState(data.reactive);
  if (nested) return nested;
  return parseCampaignState(data);
}

export function applyReactivePatch(
  stateData: Record<string, unknown> | null | undefined,
  patch: Partial<ReactiveCampaignState>
): Record<string, unknown> {
  const base = stateData && typeof stateData === "object" ? { ...stateData } : {};
  const current =
    readReactiveState(base) ??
    ({
      campaignId: typeof base.campaignId === "string" ? base.campaignId : "unknown",
      flags: {},
      heat: {},
      clocks: {},
      npcMemory: {},
      locationState: {},
      lastConsequence: "The world holds its breath.",
      updatedAt: new Date().toISOString(),
    } satisfies ReactiveCampaignState);

  base.reactive = mergeCampaignState(current, patch);
  if (typeof base.campaignId !== "string" && current.campaignId) {
    base.campaignId = current.campaignId;
  }
  return base;
}

export function formatCampaignBible(campaign: CampaignDefinition): string {
  return [
    `CAMPAIGN: ${campaign.title}`,
    `TAGLINE: ${campaign.tagline}`,
    `TONE: ${campaign.tone}`,
    `THEMES: ${campaign.themes.join(", ")}`,
    `VOICE BIBLE: ${campaign.voiceBible}`,
    `OPENING: ${campaign.openingNarrative}`,
    `SESSION ONE: ${campaign.sessionOneSetPiece}`,
    `FACTIONS:\n${campaign.factions
      .map((f) => `- ${f.name} [${f.id}] heat=${f.startingHeat}: ${f.goal} via ${f.method}`)
      .join("\n")}`,
    `LOCATIONS:\n${campaign.locations
      .map((l) => `- ${l.name} [${l.id}]: ${l.sensory} | threat: ${l.threat} | opp: ${l.opportunity}`)
      .join("\n")}`,
    `KEY NPCS:\n${campaign.npcs
      .map((n) => `- ${n.name} [${n.id}] (${n.role}): wants ${n.desire}. Secret: ${n.secret}. Voice: ${n.voice}`)
      .join("\n")}`,
    `LOOT HOOKS: ${campaign.lootHooks.join(" | ")}`,
    `GM DIRECTIVES:\n${campaign.gmDirectives.map((d) => `- ${d}`).join("\n")}`,
  ].join("\n\n");
}

export * from "./types";
