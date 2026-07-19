/** Buddy / side-channel talk with the Arbiter. */

export type BuddyKind = 'ask' | 'help' | 'banter' | 'remember';

export interface BuddyRequest {
  kind: BuddyKind;
  body: string;
  raw: string;
}

const BUDDY_RE =
  /^\/(?:gm|arbiter|a|hey)\s+([\s\S]+)$/i;

/** /gm …  /arbiter …  /a …  /hey … */
export function parseBuddyCommand(text: string): BuddyRequest | null {
  const trimmed = text.trim();
  const match = trimmed.match(BUDDY_RE);
  if (!match) return null;
  const body = match[1].trim();
  if (!body) return null;

  const lower = body.toLowerCase();
  let kind: BuddyKind = 'ask';
  if (
    /\b(help|rule|rules|how do|what'?s my|modifier|bonus|proficiency|dc|ac)\b/.test(
      lower
    )
  ) {
    kind = 'help';
  } else if (
    /\b(remember|last time|recap|what happened|did we|who was)\b/.test(lower)
  ) {
    kind = 'remember';
  } else if (
    /\b(lol|lmao|haha|joke|roast|banter|dude|bro|buddy)\b/.test(lower) ||
    body.length < 40
  ) {
    kind = 'banter';
  }

  return { kind, body, raw: trimmed };
}

export function formatBuddyTableMessage(from: string, body: string): string {
  return `🜂 ${from} → Arbiter | ${body}`;
}

export function parseBuddyTableMessage(content: string): {
  from: string;
  body: string;
} | null {
  const match = content.match(/^🜂\s+(.+?)\s+→\s+Arbiter\s+\|\s+([\s\S]+)$/);
  if (!match) return null;
  return { from: match[1].trim(), body: match[2] };
}

export function buddyKindPrompt(kind: BuddyKind): string {
  switch (kind) {
    case 'help':
      return 'They want side help (rules, sheet, tactics). Be clear, fast, friendly. Use their sheet numbers.';
    case 'remember':
      return 'They want memory. Use highlights, spine, jokes, and lastConsequence. Be specific.';
    case 'banter':
      return 'They want banter. Match energy. Short. Legendary buddy energy.';
    default:
      return 'They asked you directly. Answer like their GM-buddy.';
  }
}
