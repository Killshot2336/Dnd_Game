/** Shared table dice — parse /roll commands without changing the GM chat path. */

export interface DiceTerm {
  count: number;
  /** Positive sides = add; negative sides = subtract that die */
  sides: number;
}

export interface ParsedRoll {
  expression: string;
  terms: DiceTerm[];
  modifier: number;
  /** Optional annotation after the expression, e.g. DEX · Stealth · DC 14 */
  note?: string;
  dc?: number;
  ability?: string;
  label?: string;
}

export interface RollResult {
  expression: string;
  rolls: number[];
  modifier: number;
  total: number;
  detail: string;
  note?: string;
  dc?: number;
  ability?: string;
  label?: string;
}

const ROLL_RE =
  /^\/(?:roll|r)\s+([0-9]*d[0-9]+(?:\s*[+-]\s*[0-9]+)*(?:\s*[+-]\s*[0-9]*d[0-9]+)*)\s*(?:\((.+)\))?\s*$/i;

/** True if the whole message is a dice command (not prose that mentions /roll). */
export function isRollCommand(text: string): boolean {
  return ROLL_RE.test(text.trim());
}

export function parseRollExpression(raw: string): ParsedRoll | null {
  const trimmed = raw.trim();
  const match = trimmed.match(ROLL_RE);
  if (!match) return null;

  const expression = match[1].replace(/\s+/g, '');
  const note = match[2]?.trim();
  const chunks = expression.match(/[+-]?[0-9]*d[0-9]+|[+-]?[0-9]+/gi);
  if (!chunks || chunks.length === 0) return null;

  const terms: DiceTerm[] = [];
  let modifier = 0;

  for (const chunk of chunks) {
    const diceMatch = chunk.match(/^([+-]?)([0-9]*)d([0-9]+)$/i);
    if (diceMatch) {
      const sign = diceMatch[1] === '-' ? -1 : 1;
      const count = Math.min(20, Math.max(1, parseInt(diceMatch[2] || '1', 10)));
      const sides = Math.min(100, Math.max(2, parseInt(diceMatch[3], 10)));
      terms.push({ count, sides: sign * sides });
      continue;
    }
    const modMatch = chunk.match(/^([+-]?)([0-9]+)$/);
    if (modMatch) {
      const sign = modMatch[1] === '-' ? -1 : 1;
      modifier += sign * parseInt(modMatch[2], 10);
    }
  }

  if (terms.length === 0) return null;

  let dc: number | undefined;
  let ability: string | undefined;
  let label: string | undefined;
  if (note) {
    const dcMatch = note.match(/DC\s*(\d+)/i);
    if (dcMatch) dc = parseInt(dcMatch[1], 10);
    const abilityMatch = note.match(
      /\b(STR|DEX|CON|INT|WIS|CHA|strength|dexterity|constitution|intelligence|wisdom|charisma)\b/i
    );
    if (abilityMatch) ability = abilityMatch[1];
    label =
      note
        .replace(
          /\b(STR|DEX|CON|INT|WIS|CHA|strength|dexterity|constitution|intelligence|wisdom|charisma)\b/gi,
          ''
        )
        .replace(/DC\s*\d+/gi, '')
        .replace(/[·•|]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim() || undefined;
  }

  return { expression, terms, modifier, note, dc, ability, label };
}

function rollDie(sides: number): number {
  return Math.floor(Math.random() * Math.abs(sides)) + 1;
}

export function resolveRoll(parsed: ParsedRoll): RollResult {
  const rolls: number[] = [];
  let sum = 0;
  const parts: string[] = [];

  for (const term of parsed.terms) {
    const negative = term.sides < 0;
    const sides = Math.abs(term.sides);
    const termRolls: number[] = [];
    for (let i = 0; i < term.count; i++) {
      const value = rollDie(sides);
      termRolls.push(value);
      rolls.push(negative ? -value : value);
      sum += negative ? -value : value;
    }
    parts.push(`${negative ? '-' : ''}${term.count}d${sides}[${termRolls.join(',')}]`);
  }

  if (parsed.modifier !== 0) {
    parts.push(parsed.modifier > 0 ? `+${parsed.modifier}` : String(parsed.modifier));
    sum += parsed.modifier;
  }

  return {
    expression: parsed.expression,
    rolls,
    modifier: parsed.modifier,
    total: sum,
    detail: parts.join(' '),
    note: parsed.note,
    dc: parsed.dc,
    ability: parsed.ability,
    label: parsed.label,
  };
}

export function formatRollMessage(sender: string, result: RollResult): string {
  const note = result.note ? ` · ${result.note}` : '';
  return `🎲 ${sender} rolls ${result.expression} → ${result.total} (${result.detail})${note}`;
}

export function parseRollMessage(content: string): {
  sender: string;
  expression: string;
  total: number;
  detail: string;
  note?: string;
} | null {
  const match = content.match(
    /^🎲\s+(.+?)\s+rolls\s+(\S+)\s+→\s+(-?\d+)\s+\(([^)]+)\)(?:\s+·\s+(.+))?\s*$/
  );
  if (!match) return null;
  return {
    sender: match[1],
    expression: match[2],
    total: parseInt(match[3], 10),
    detail: match[4],
    note: match[5],
  };
}

export type DiceOutcome = 'crit_success' | 'success' | 'fail' | 'crit_fail' | 'plain';

/** Grade a d20-style roll against an optional DC. Natural 20/1 inferred from face values. */
export function gradeRollOutcome(
  result: RollResult,
  dc?: number
): { outcome: DiceOutcome; margin?: number } {
  const faces = result.rolls.map((r) => Math.abs(r));
  const natural = faces.length === 1 ? faces[0] : undefined;
  const effectiveDc = dc ?? result.dc;

  if (effectiveDc == null) {
    if (natural === 20) return { outcome: 'crit_success' };
    if (natural === 1) return { outcome: 'crit_fail' };
    return { outcome: 'plain' };
  }

  const margin = result.total - effectiveDc;
  if (natural === 20) return { outcome: 'crit_success', margin };
  if (natural === 1) return { outcome: 'crit_fail', margin };
  if (result.total >= effectiveDc) return { outcome: 'success', margin };
  return { outcome: 'fail', margin };
}

/** Whisper: /w Name message  or  /whisper Name message */
export function parseWhisper(text: string): { target: string; body: string } | null {
  const match = text.trim().match(/^\/(?:w|whisper)\s+(\S+)\s+([\s\S]+)$/i);
  if (!match) return null;
  return { target: match[1].trim(), body: match[2].trim() };
}

export function formatWhisperMessage(from: string, to: string, body: string): string {
  return `🔒 WHISPER ${from} → ${to} | ${body}`;
}

export function parseWhisperMessage(content: string): {
  from: string;
  to: string;
  body: string;
} | null {
  const match = content.match(/^🔒 WHISPER\s+(.+?)\s+→\s+(.+?)\s+\|\s+([\s\S]+)$/);
  if (!match) return null;
  return { from: match[1].trim(), to: match[2].trim(), body: match[3] };
}

export function canSeeWhisper(
  content: string,
  viewerName: string | null | undefined
): boolean {
  const parsed = parseWhisperMessage(content);
  if (!parsed) return true;
  if (!viewerName) return false;
  const v = viewerName.toLowerCase();
  return parsed.from.toLowerCase() === v || parsed.to.toLowerCase() === v;
}

/** /spotlight Name  or  /spotlight clear — undefined if not a spotlight command */
export function parseSpotlightCommand(text: string): string | null | undefined {
  const match = text.trim().match(/^\/spotlight\s+(\S+)\s*$/i);
  if (!match) return undefined;
  const target = match[1];
  if (target.toLowerCase() === 'clear' || target.toLowerCase() === 'none') {
    return null;
  }
  return target;
}

export function formatSpotlightMessage(name: string | null): string {
  if (!name) return '✦ Spotlight cleared — the table is open.';
  return `✦ Spotlight on ${name} — the Arbiter waits on their move.`;
}
