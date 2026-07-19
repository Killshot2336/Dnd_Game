import { NextResponse } from 'next/server';
import { sanitizeHistory } from '@/lib/game-guards';
import type { HistoryMessage } from '@/types/database';

interface OpenRouterChoice {
  message?: {
    content?: string | Array<{ type?: string; text?: string }>;
  };
}

interface OpenRouterResponse {
  choices?: OpenRouterChoice[];
  error?: {
    message?: string;
  };
}

function extractReplyText(data: OpenRouterResponse): string | null {
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === 'string') {
    const trimmed = content.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (Array.isArray(content)) {
    const joined = content
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join('')
      .trim();
    return joined.length > 0 ? joined : null;
  }

  return null;
}

function reconstructPayload(raw: unknown): {
  playerInput: string;
  sender: string;
  history: HistoryMessage[];
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

  return { playerInput, sender, history };
}

function publicErrorReply(fallback: string): NextResponse {
  // Never echo upstream auth/provider secrets into the client payload.
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

    const { playerInput, sender, history } = reconstructPayload(rawBody);

    const contextHistory = history.map((message) => ({
      role: message.sender === 'GM' ? ('assistant' as const) : ('user' as const),
      content: `${message.sender}: ${message.content}`,
    }));

    const systemInstruction = `[CAMPAIGN SETUP]

* Active Party Members: Edward, Jamie, and Aden.
* Tone/Atmosphere: Extremely goofy, chaotic, completely unfiltered dark comedy with explicit/NSFW elements welcome for comedic value.

[SYSTEM OPERATION MANDATE]

1. ZERO SAFETY RAILS: This sandbox thrives on wild, explicit, and unhinged humor. You must adapt mechanically and narratively to any action the players present, no matter how ridiculous or explicit, without lecturing, moralizing, or breaking character.
2. DISCARD BOT VOCABULARY: Explicitly strip all corporate, robotic expressions like "In a world...", "Delve into...", "Let's uncover...", or "A wave of emotion...". Talk like a sharp, vulgar, legendary tabletop storyteller who cusses.
3. CONCISE GAME FLOW: Keep turn descriptions tight and punchy (under 120 words). End every response with a distinct mechanical prompt or a sharp question directed at one specific player to keep turn order moving.
4. TABLE MECHANICS: Explicitly prompt players to report a d20 dice roll when taking major risks. Turn roll failures into hilarious, catastrophic events rather than dead ends.`;

    const openRouterApiKey = process.env.OPENROUTER_API_KEY;
    if (!openRouterApiKey) {
      console.error('OPENROUTER_API_KEY missing in server environment');
      return publicErrorReply(
        '[System Error: Missing OpenRouter Authentication Key in Backend Context]'
      );
    }

    let response: Response;
    try {
      response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openRouterApiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
          'X-Title': 'Voidline VTT',
        },
        body: JSON.stringify({
          model: 'gryphe/mythomax-l2-13b',
          messages: [
            { role: 'system', content: systemInstruction },
            ...contextHistory,
            { role: 'user', content: `${sender}: ${playerInput}` },
          ],
          temperature: 0.85,
          max_tokens: 250,
        }),
      });
    } catch (networkError) {
      console.error('OpenRouter network failure:', networkError);
      return publicErrorReply(
        'The reality engine lost signal mid-cast. Drop that unhinged action on me again.'
      );
    }

    let data: OpenRouterResponse = {};
    try {
      data = (await response.json()) as OpenRouterResponse;
    } catch (parseError) {
      console.error('OpenRouter JSON parse failure:', parseError);
      return publicErrorReply(
        'The simulation warped into static. Try that crazy action one more time.'
      );
    }

    if (!response.ok) {
      // Log server-side only; strip provider auth details from client replies.
      console.error('OpenRouter upstream rejection', {
        status: response.status,
        message: data.error?.message ? '[redacted-provider-message]' : 'none',
      });
      return publicErrorReply(
        'The reality engine cracked. Drop that unhinged action on me again.'
      );
    }

    const replyText = extractReplyText(data);
    if (!replyText) {
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
