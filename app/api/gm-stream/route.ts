import { NextResponse } from 'next/server';
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

function reconstructPayload(raw: unknown): {
  playerInput: string;
  sender: string;
  history: HistoryMessage[];
  partySheets: string[];
  actorSheet: string;
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

  return { playerInput, sender, history, partySheets, actorSheet };
}

/** Gemini requires strict user/model alternation. */
function buildGeminiContents(
  history: HistoryMessage[],
  sender: string,
  playerInput: string
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

  for (const message of history) {
    const role = message.sender === 'GM' ? 'model' : 'user';
    push(role, `${message.sender}: ${message.content}`);
  }

  push('user', `${sender}: ${playerInput}`);

  // Gemini chats must start with a user turn.
  if (contents.length === 0 || contents[0].role !== 'user') {
    contents.unshift({
      role: 'user',
      parts: [{ text: 'The party sits at the table. Begin the scene.' }],
    });
  }

  return contents;
}

function publicErrorReply(fallback: string): NextResponse {
  return NextResponse.json({ reply: fallback });
}

export async function POST(req: Request) {
  try {
    let rawBody: unknown = null;
    try {
      rawBody = await req.json();
    } catch {
      rawBody = null;
    }

    const { playerInput, sender, history, partySheets, actorSheet } =
      reconstructPayload(rawBody);

    const systemInstruction = `[IDENTITY]
You are the Void Arbiter — a world-class Dungeon Master for a private table of three: Aden, Edward, and Jamie. You run vivid, mechanically coherent D&D 5e-style play with sharp sensory detail, living NPCs, and consequential stakes. Humor and adult/chaotic energy are welcome when the table pushes there — never lecture, never moralize, never break character into chatbot voice.

[HARD LAW — SHEETS ARE SACRED]
- Character sheets below are FACT. Never rewrite stats, class, HP max, skills, or inventory.
- If fiction conflicts with a sheet, the sheet wins.
- Do not invent new class features that contradict the sheet; you may narrate existing features vividly.

[ACTIVE ACTOR SHEET]
${actorSheet}

[PARTY ROSTER]
${partySheets.length ? partySheets.map((s, i) => `(${i + 1})\n${s}`).join('\n\n') : 'Roster incoming from table state.'}

[CRAFT]
1. Describe the environment with concrete detail (light, smell, sound, tactical geometry).
2. Resolve actions with 5e-flavored rulings: name the check/save, suggest a DC, ask for d20 + relevant mod when risk matters.
3. Failures create complications and new angles — not brick walls.
4. Keep momentum: end by spotlighting one specific player with a clear question or choice.
5. Target length: usually 120–220 words when a scene deserves it; shorter for quick beats.
6. Ban corporate filler ("In a world...", "Delve into...", "A wave of emotion..."). Speak like a legendary tabletop storyteller.`;

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

    const contents = buildGeminiContents(history, sender, playerInput);

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
            temperature: 0.78,
            maxOutputTokens: 900,
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
        'The reality engine lost signal mid-cast. Drop that unhinged action on me again.'
      );
    }

    let data: GeminiResponse = {};
    try {
      data = (await response.json()) as GeminiResponse;
    } catch (parseError) {
      console.error('Gemini JSON parse failure:', parseError);
      return publicErrorReply(
        'The simulation warped into static. Try that crazy action one more time.'
      );
    }

    if (!response.ok) {
      console.error('Gemini upstream rejection', {
        status: response.status,
        statusText: data.error?.status || 'none',
      });
      return publicErrorReply(
        'The reality engine cracked. Drop that unhinged action on me again.'
      );
    }

    if (data.promptFeedback?.blockReason) {
      console.error('Gemini prompt blocked', { reason: data.promptFeedback.blockReason });
      return publicErrorReply(
        'The void hiccuped on that beat. Rephrase the chaos and fire again.'
      );
    }

    const replyText = extractReplyText(data);
    if (!replyText) {
      const finishReason = data.candidates?.[0]?.finishReason;
      console.error('Gemini empty candidate', { finishReason: finishReason || 'none' });
      return publicErrorReply(
        'The simulation warped into static. Try that crazy action one more time.'
      );
    }

    return NextResponse.json({ reply: replyText });
  } catch (error) {
    console.error('API Pipeline Crash:', error);
    return NextResponse.json(
      { reply: 'The matrix caught fire. Try that crazy action one more time.' },
      { status: 500 }
    );
  }
}
