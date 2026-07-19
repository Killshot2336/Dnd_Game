import { NextResponse } from 'next/server';
import { CHARACTER_TEMPLATES, getTemplate, listTemplateIds } from '@/lib/character-presets';
import { sheetFromTemplate, validateSheetDraft } from '@/lib/character-sheet';

function getGeminiApiKey(): string | null {
  const key =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GOOGLE_API_KEY;
  return key?.trim() || null;
}

const FORGE_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { prompt?: string };
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt) {
      return NextResponse.json({ error: 'Describe the character you want.' }, { status: 400 });
    }

    const catalog = CHARACTER_TEMPLATES.map(
      (t) =>
        `${t.id}: ${t.name} — ${t.race} ${t.className}/${t.subclass}. ${t.tagline}. Skills: ${t.skills.join(', ')}.`
    ).join('\n');

    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      // Offline fallback: keyword match into a preset
      const lower = prompt.toLowerCase();
      const hit =
        CHARACTER_TEMPLATES.find((t) => lower.includes(t.className.toLowerCase())) ||
        CHARACTER_TEMPLATES.find((t) => lower.includes(t.id.split('-')[0])) ||
        CHARACTER_TEMPLATES[0];
      const sheet = sheetFromTemplate(hit, {
        name: prompt.split(/[,.]/)[0]?.slice(0, 40) || hit.name,
        backstory: prompt.slice(0, 500),
      });
      return NextResponse.json({ draft: sheet, source: 'preset-fallback' });
    }

    const system = `You are the Character Smith for Voidline. You ONLY build characters from this exact 10-template catalog. Never invent classes, races, or templates outside the list.

CATALOG:
${catalog}

Return STRICT JSON only:
{
  "templateId": "<one of ${listTemplateIds().join('|')}>",
  "name": "string",
  "backstory": "2-5 vivid sentences",
  "appearance": "1-2 sentences",
  "ideals": "short",
  "bonds": "short",
  "flaws": "short"
}

Rules:
- templateId MUST be one of the catalog ids
- Flavor may be wild/comedic; mechanical identity stays on the chosen template
- No markdown, no commentary`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        FORGE_MODEL
      )}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.55,
            maxOutputTokens: 500,
            responseMimeType: 'application/json',
          },
        }),
      }
    );

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]) as Record<string, unknown>;
    }

    const templateId = String(parsed.templateId ?? '');
    if (!getTemplate(templateId)) {
      return NextResponse.json(
        { error: 'Forge returned an illegal template. Try a clearer description.' },
        { status: 422 }
      );
    }

    const validated = validateSheetDraft({
      templateId,
      name: parsed.name,
      backstory: parsed.backstory,
      appearance: parsed.appearance,
      ideals: parsed.ideals,
      bonds: parsed.bonds,
      flaws: parsed.flaws,
    });

    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 422 });
    }

    return NextResponse.json({ draft: validated.sheet, source: 'gemini' });
  } catch (error) {
    console.error('Character forge failure:', error);
    return NextResponse.json({ error: 'Forge failed. Try again.' }, { status: 500 });
  }
}
