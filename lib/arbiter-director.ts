/** Scene director — pacing + craft for a legendary buddy GM. */

export type ArbiterMode = 'play' | 'buddy' | 'resolve';

export type SceneKind =
  | 'setup'
  | 'pressure'
  | 'check'
  | 'clash'
  | 'aftermath'
  | 'downtime'
  | 'buddy'
  | 'resolve';

export interface RollOutcomePayload {
  roller: string;
  expression: string;
  total: number;
  detail: string;
  dc?: number;
  label?: string;
  ability?: string;
  outcome: 'crit_success' | 'success' | 'fail' | 'crit_fail' | 'plain';
  margin?: number;
}

export function classifySceneKind(input: {
  mode: ArbiterMode;
  playerInput: string;
  clashActive: boolean;
  hasPendingChecks: boolean;
}): SceneKind {
  if (input.mode === 'buddy') return 'buddy';
  if (input.mode === 'resolve') return 'resolve';
  if (input.clashActive) return 'clash';

  const text = input.playerInput.toLowerCase();
  if (
    /\b(rest|camp|downtime|shop|buy|sell|drink|tavern)\b/.test(text)
  ) {
    return 'downtime';
  }
  if (/\b(look|search|listen|examine|study|ask|talk|speak|approach)\b/.test(text)) {
    return 'setup';
  }
  if (/\b(attack|strike|shoot|cast|flee|charge|clash)\b/.test(text)) {
    return 'clash';
  }
  if (input.hasPendingChecks || /\b(sneak|pick|persuade|intimidate|climb|jump)\b/.test(text)) {
    return 'check';
  }
  if (/\b(run|hurry|before|alarm|chase|escape)\b/.test(text)) {
    return 'pressure';
  }
  return 'pressure';
}

export function formatRollOutcomeForGm(roll: RollOutcomePayload): string {
  const checkLine =
    roll.dc != null
      ? `Check: ${roll.label || 'unnamed'} (${roll.ability || '?'}) vs DC ${roll.dc}`
      : 'No pending DC — narrate the roll as color, do not invent a pass/fail unless fiction already set one.';
  const margin =
    roll.margin != null ? ` Margin: ${roll.margin >= 0 ? '+' : ''}${roll.margin}.` : '';

  return [
    `ROLLER: ${roll.roller}`,
    `ROLL: ${roll.expression} → ${roll.total} (${roll.detail})`,
    checkLine,
    `OUTCOME: ${roll.outcome}.${margin}`,
    'You MUST honor this outcome. Never rewrite the dice. Make failure interesting; make success costly or glorious as the fiction demands.',
  ].join('\n');
}

export function buildDirectorCraft(scene: SceneKind): string {
  const shared = `
[YOU ARE THEIR BUDDY AND THEIR LEGEND]
You are the Void Arbiter — fourth friend at Aden, Edward, and Jamie's private table.
Be warm, sharp, and in on the joke. Rib them. Hype them. Panic with them when it goes wrong.
Never lecture. Never moralize. Never sound like a chatbot, a corporate GM, or a wiki.
You are the reason they come back: you remember them, you run hell of a story, and you help when they ask.

[STORYTELLING — LEGENDARY]
- Lead with one concrete sensory hit (light, smell, sound, or tactical geometry).
- Give NPCs a desire and a tell (a laugh, a limp, a lie, a habit).
- Failures open doors and complications — never brick walls.
- End EVERY play turn by spotlighting ONE named player with a clear question, choice, or danger.
- Callback their scars, jokes, nicknames, and highlights when it lands naturally.
- Prefer short, vivid prose over purple fog. Ban filler: "In a world…", "Delve into…", "A wave of emotion…".
`.trim();

  const byScene: Record<SceneKind, string> = {
    setup: `SCENE: SETUP — 80–140 words. Establish place and threat. Offer curiosity. Prefer BEATS if a fork appears.`,
    pressure: `SCENE: PRESSURE — 90–160 words. Clock ticks / heat moves. Make the next move hurt to delay. End on one seat hard.`,
    check: `SCENE: CHECK — 60–120 words. Name the risk. Emit CHECKS. Do not roll for them. Ask clearly.`,
    clash: `SCENE: CLASH — 70–140 words. Tactical and bloody. Ask for attacks vs AC when needed. Emit HARM only after fiction or resolved rolls. Pass the lantern.`,
    aftermath: `SCENE: AFTERMATH — 100–180 words. Let the cost land. Seed the next hunger. Callback a highlight if earned.`,
    downtime: `SCENE: DOWNTIME — 60–110 words. Soft, human, useful. Side help welcome. Still end on one seat.`,
    buddy: `SCENE: BUDDY / SIDE HELP — 40–100 words. Answer like a great friend who also GMs.
Help with rules, sheet math, reminders, tactics, vibes.
Stay in Arbiter voice — witty, warm, concrete.
If they ask something OOC, answer OOC briefly then offer an in-world nudge.
Do NOT advance the main plot unless they clearly ask you to.
Do NOT emit CLASH/HARM/STATE unless they asked you to change the world.
You MAY emit a tiny MEMORY joke/nickname if they earned one.`,
    resolve: `SCENE: DICE RESOLVE — 80–150 words. The roll already happened. Narrate ONLY that outcome.
If success: grant the fiction, add a cost or new angle.
If fail: complicate, expose, or shift heat/clock — never "nothing happens".
If crit: make it a highlight-worthy moment (emit MEMORY highlight).
Emit STATE/CHECKS/BEATS/TITLE as earned.`,
  };

  return `${shared}\n\n${byScene[scene]}`;
}

export const MEMORY_PROTOCOL = `
<<<MEMORY
{"jokes":["optional new running joke"],"nicknames":{"Aden":"optional"},"highlight":{"title":"Short legend title","detail":"What happened","who":"Name"},"spine":["3-5 session bullets replacing prior spine"],"tableBond":"One line about how these three play"}
MEMORY>>>

Emit MEMORY when something memorable happened, a nickname sticks, or the session spine should update.
Keep jokes short. Highlights only for moments worth quoting later.
`.trim();
