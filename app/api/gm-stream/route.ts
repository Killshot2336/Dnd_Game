import { NextResponse } from 'next/server';
import {
  buildDirectorCraft,
  classifySceneKind,
  formatRollOutcomeForGm,
  MEMORY_PROTOCOL,
  type ArbiterMode,
  type RollOutcomePayload,
} from '@/lib/arbiter-director';
import {
  formatMemoryForGm,
  readArbiterMemory,
  type ArbiterMemory,
} from '@/lib/arbiter-memory';
import { buddyKindPrompt, type BuddyKind } from '@/lib/buddy-gm';
import {
  formatStateForGm,
  getCampaign,
  parseCampaignState,
  type ReactiveCampaignState,
} from '@/lib/campaigns';
import { extractGmProtocol, GM_VAULT_PROTOCOL } from '@/lib/gm-protocol';
import { sanitizeHistory } from '@/lib/game-guards';
import type { HistoryMessage } from '@/types/database';

interface GeminiPart {
  text?: string;
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
    };
    finishReason?: string;
  }>;
  promptFeedback?: {
    blockReason?: string;
  };
  error?: {
    message?: string;
    status?: string;
  };
}

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';

function getGeminiApiKey(): string | null {
  const key =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GOOGLE_API_KEY;
  if (!key || !key.trim()) return null;
  return key.trim();
}

function extractReplyText(data: GeminiResponse): string | null {
  const parts = data.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts) || parts.length === 0) return null;

  const joined = parts
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .join('')
    .trim();

  return joined.length > 0 ? joined : null;
}

function parseRollOutcome(raw: unknown): RollOutcomePayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  if (typeof source.roller !== 'string' || typeof source.total !== 'number') {
    return null;
  }
  const outcome = source.outcome;
  if (
    outcome !== 'crit_success' &&
    outcome !== 'success' &&
    outcome !== 'fail' &&
    outcome !== 'crit_fail' &&
    outcome !== 'plain'
  ) {
    return null;
  }
  return {
    roller: source.roller,
    expression: String(source.expression ?? ''),
    total: source.total,
    detail: String(source.detail ?? ''),
    dc: typeof source.dc === 'number' ? source.dc : undefined,
    label: typeof source.label === 'string' ? source.label : undefined,
    ability: typeof source.ability === 'string' ? source.ability : undefined,
    outcome,
    margin: typeof source.margin === 'number' ? source.margin : undefined,
  };
}

function reconstructPayload(raw: unknown): {
  playerInput: string;
  sender: string;
  history: HistoryMessage[];
  partySheets: string[];
  actorSheet: string;
  campaignId: string | null;
  reactiveState: ReactiveCampaignState | null;
  mode: ArbiterMode;
  buddyKind: BuddyKind | null;
  rollOutcome: RollOutcomePayload | null;
  arbiterMemory: ArbiterMemory;
  clashActive: boolean;
  hasPendingChecks: boolean;
  spotlight: string | null;
} {
  const body =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : ({} as Record<string, unknown>);

  const playerInputRaw =
    typeof body.playerInput === 'string'
      ? body.playerInput
      : typeof body.input === 'string'
        ? body.input
        : typeof body.content === 'string'
          ? body.content
          : '';

  const senderRaw =
    typeof body.sender === 'string'
      ? body.sender
      : typeof body.user_name === 'string'
        ? body.user_name
        : 'Unknown';

  const playerInput = playerInputRaw.trim() || 'I stare into the void and wait for chaos.';
  const sender = senderRaw.trim().slice(0, 50) || 'Unknown';
  const history = sanitizeHistory(body.history);
  const partySheets = Array.isArray(body.partySheets)
    ? body.partySheets.map((entry) => String(entry)).filter(Boolean).slice(0, 6)
    : [];
  const actorSheet =
    typeof body.actorSheet === 'string' && body.actorSheet.trim()
      ? body.actorSheet.trim()
      : 'No actor sheet provided.';

  const campaignId =
    typeof body.campaignId === 'string' && body.campaignId.trim()
      ? body.campaignId.trim()
      : null;

  const reactiveState = parseCampaignState(body.reactiveState);

  const modeRaw = typeof body.mode === 'string' ? body.mode : 'play';
  const mode: ArbiterMode =
    modeRaw === 'buddy' || modeRaw === 'resolve' ? modeRaw : 'play';

  const buddyKind =
    body.buddyKind === 'ask' ||
    body.buddyKind === 'help' ||
    body.buddyKind === 'banter' ||
    body.buddyKind === 'remember'
      ? body.buddyKind
      : null;

  const rollOutcome = parseRollOutcome(body.rollOutcome);

  const arbiterMemory =
    body.arbiterMemory && typeof body.arbiterMemory === 'object'
      ? readArbiterMemory({ arbiter: body.arbiterMemory })
      : readArbiterMemory(body.stateData);

  return {
    playerInput,
    sender,
    history,
    partySheets,
    actorSheet,
    campaignId,
    reactiveState,
    mode,
    buddyKind,
    rollOutcome,
    arbiterMemory,
    clashActive: body.clashActive === true,
    hasPendingChecks: body.hasPendingChecks === true,
    spotlight: typeof body.spotlight === 'string' ? body.spotlight : null,
  };
}

/** Gemini requires strict user/model alternation. */
function buildGeminiContents(
  history: HistoryMessage[],
  sender: string,
  playerInput: string,
  mode: ArbiterMode
): GeminiContent[] {
  const contents: GeminiContent[] = [];

  const push = (role: 'user' | 'model', text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const last = contents[contents.length - 1];
    if (last && last.role === role) {
      last.parts[0].text = `${last.parts[0].text ?? ''}\n${trimmed}`;
      return;
    }
    contents.push({ role, parts: [{ text: trimmed }] });
  };

  // Buddy / resolve: keep history shorter so help stays snappy
  const slice = mode === 'buddy' ? history.slice(-8) : history.slice(-14);
  for (const message of slice) {
    const role = message.sender === 'GM' ? 'model' : 'user';
    push(role, `${message.sender}: ${message.content}`);
  }

  const prefix =
    mode === 'buddy'
      ? '[BUDDY ASK]'
      : mode === 'resolve'
        ? '[DICE RESOLVE]'
        : '[TABLE ACTION]';
  push('user', `${prefix} ${sender}: ${playerInput}`);

  if (contents.length === 0 || contents[0].role !== 'user') {
    contents.unshift({
      role: 'user',
      parts: [{ text: 'The party sits at the table. Begin the scene.' }],
    });
  }

  return contents;
}

function publicErrorReply(fallback: string): NextResponse {
  return NextResponse.json({ reply: fallback, statePatch: null });
}

function focusedCampaignBlock(campaignId: string | null, reactive: ReactiveCampaignState | null): string {
  const campaign = getCampaign(campaignId);
  if (!campaign) {
    return 'No campaign selected — run a flexible dark-fantasy table that still tracks consequences.';
  }

  // Lean bible: tone + voice + directives + active location/NPC cues
  const activeLocIds = reactive
    ? Object.entries(reactive.locationState)
        .filter(([, status]) => String(status).includes('active'))
        .map(([id]) => id)
    : [];
  const locs =
    activeLocIds.length > 0
      ? campaign.locations.filter((l) => activeLocIds.includes(l.id))
      : campaign.locations.slice(0, 2);
  const hotNpcs = campaign.npcs.slice(0, 3);

  return [
    `CAMPAIGN: ${campaign.title} — ${campaign.tagline}`,
    `TONE: ${campaign.tone}`,
    `VOICE: ${campaign.voiceBible}`,
    `THEMES: ${campaign.themes.join(', ')}`,
    `ACTIVE LOCATIONS:\n${locs
      .map((l) => `- ${l.name}: ${l.sensory} | threat: ${l.threat} | opp: ${l.opportunity}`)
      .join('\n')}`,
    `KEY NPCS:\n${hotNpcs
      .map((n) => `- ${n.name} (${n.role}): wants ${n.desire}. Tell/voice: ${n.voice}. Secret: ${n.secret}`)
      .join('\n')}`,
    `GM DIRECTIVES:\n${campaign.gmDirectives.map((d) => `- ${d}`).join('\n')}`,
  ].join('\n\n');
}

export async function POST(req: Request) {
  try {
    let rawBody: unknown = null;
    try {
      rawBody = await req.json();
    } catch {
      rawBody = null;
    }

    const payload = reconstructPayload(rawBody);
    const {
      playerInput,
      sender,
      history,
      partySheets,
      actorSheet,
      campaignId,
      reactiveState,
      mode,
      buddyKind,
      rollOutcome,
      arbiterMemory,
      clashActive,
      hasPendingChecks,
      spotlight,
    } = payload;

    const scene = classifySceneKind({
      mode,
      playerInput,
      clashActive,
      hasPendingChecks,
    });

    const campaignBlock = focusedCampaignBlock(campaignId, reactiveState);
    // Keep full bible available lightly for play mode continuity
    const campaign = getCampaign(campaignId);
    const fullBibleHint =
      mode === 'play' && campaign
        ? `\n[SESSION HOOK] ${campaign.sessionOneSetPiece}`
        : '';

    const liveStateBlock = reactiveState
      ? formatStateForGm(reactiveState)
      : 'No reactive state yet. Invent lightly, then emit a STATE patch to seed flags/heat/clocks.';

    const memoryBlock = formatMemoryForGm(arbiterMemory);
    const craft = buildDirectorCraft(scene);
    const buddyHint =
      mode === 'buddy' && buddyKind ? `\n[BUDDY INTENT] ${buddyKindPrompt(buddyKind)}` : '';
    const rollBlock =
      mode === 'resolve' && rollOutcome
        ? `\n[RESOLVED ROLL — SACRED]\n${formatRollOutcomeForGm(rollOutcome)}`
        : '';
    const spotlightLine = spotlight
      ? `\n[TABLE SPOTLIGHT] Center ${spotlight} this beat unless fiction clearly cuts away.`
      : '';

    const maxTokens = mode === 'buddy' ? 650 : mode === 'resolve' ? 900 : 1100;
    const temperature = mode === 'buddy' ? 0.85 : 0.78;

    const systemInstruction = `${craft}
${buddyHint}

[HARD LAW — SHEETS ARE SACRED]
- Character sheets below are FACT. Never rewrite stats, class, HP max, skills, or inventory.
- If fiction conflicts with a sheet, the sheet wins.
- Do not invent new class features that contradict the sheet; you may narrate existing features vividly.
- Never invent d20 results. Dice are sacred.

[CAMPAIGN FOCUS]
${campaignBlock}${fullBibleHint}

[LIVE WORLD STATE]
${liveStateBlock}

Treat flags, faction heat, clocks, NPC memory, and location state as durable truth.
When player actions change the world, update those systems.

[TABLE MEMORY — THESE THREE]
${memoryBlock}

Callback jokes, nicknames, and highlights when it feels natural. Update MEMORY when a new legend lands.
${rollBlock}${spotlightLine}

[VAULT PROTOCOL]
${GM_VAULT_PROTOCOL}

[MEMORY PROTOCOL]
${MEMORY_PROTOCOL}

[ACTIVE ACTOR SHEET]
${actorSheet}

[PARTY ROSTER]
${partySheets.length ? partySheets.map((s, i) => `(${i + 1})\n${s}`).join('\n\n') : 'Roster incoming from table state.'}

[FINAL]
Speak like the legendary buddy GM they quote later. Aden, Edward, Jamie trust you.`;

    const geminiApiKey = getGeminiApiKey();
    if (!geminiApiKey) {
      console.error('GEMINI_API_KEY missing in server environment');
      return publicErrorReply(
        '[System Error: Missing Gemini API Key in Backend Context. Add GEMINI_API_KEY from Google AI Studio.]'
      );
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      GEMINI_MODEL
    )}:generateContent`;

    const contents = buildGeminiContents(history, sender, playerInput, mode);

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': geminiApiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemInstruction }],
          },
          contents,
          generationConfig: {
            temperature,
            maxOutputTokens: maxTokens,
          },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          ],
        }),
      });
    } catch (networkError) {
      console.error('Gemini network failure:', networkError);
      return publicErrorReply(
        'Lost you for a second — say that again and I am right back with you.'
      );
    }

    let data: GeminiResponse = {};
    try {
      data = (await response.json()) as GeminiResponse;
    } catch (parseError) {
      console.error('Gemini JSON parse failure:', parseError);
      return publicErrorReply(
        'My brain hiccuped mid-sentence. Hit me with that again.'
      );
    }

    if (!response.ok) {
      console.error('Gemini upstream rejection', {
        status: response.status,
        statusText: data.error?.status || 'none',
      });
      return publicErrorReply(
        'The Arbiter stumbled. Drop that on me one more time — I got you.'
      );
    }

    if (data.promptFeedback?.blockReason) {
      console.error('Gemini prompt blocked', { reason: data.promptFeedback.blockReason });
      return publicErrorReply(
        'Something caught in my throat. Rephrase and I am still here.'
      );
    }

    const replyText = extractReplyText(data);
    if (!replyText) {
      const finishReason = data.candidates?.[0]?.finishReason;
      console.error('Gemini empty candidate', { finishReason: finishReason || 'none' });
      return publicErrorReply(
        'Blank page — weird. Try that chaos again; I am listening.'
      );
    }

    const protocol = extractGmProtocol(replyText);
    return NextResponse.json({
      reply: protocol.cleanReply,
      statePatch: protocol.statePatch,
      beats: protocol.beats,
      checks: protocol.checks,
      harm: protocol.harm,
      loot: protocol.loot,
      titleCard: protocol.titleCard,
      clashStart: protocol.clashStart,
      clashEnd: protocol.clashEnd,
      memory: protocol.memory,
      scene,
      mode,
    });
  } catch (error) {
    console.error('API Pipeline Crash:', error);
    return NextResponse.json(
      {
        reply: 'I glitched. Not leaving the table though — fire that again.',
        statePatch: null,
      },
      { status: 500 }
    );
  }
}
