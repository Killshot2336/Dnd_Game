import { getTemplate, listTemplateIds, type CharacterTemplate } from '@/lib/character-presets';
import { parseStats } from '@/lib/game-guards';
import type { AbilityScores } from '@/types/database';

export interface CharacterSkin {
  portraitKey: string;
  tint: string;
}

export interface CharacterSheet {
  id?: string;
  seed: string;
  name: string;
  templateId: string;
  race: string;
  className: string;
  subclass: string;
  background: string;
  level: number;
  stats: AbilityScores;
  skills: string[];
  features: string[];
  equipment: string[];
  backstory: string;
  appearance: string;
  ideals: string;
  bonds: string;
  flaws: string;
  skin: CharacterSkin;
  maxHp: number;
  armorClass: number;
  speed: number;
}

export function abilityModifier(score: number): number {
  return Math.floor((Number(score) - 10) / 2);
}

export function formatModifier(score: number): string {
  const mod = abilityModifier(score);
  return mod >= 0 ? `+${mod}` : String(mod);
}

const SEED_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateCharacterSeed(): string {
  const chunk = (len: number) => {
    let out = '';
    for (let i = 0; i < len; i++) {
      out += SEED_ALPHABET.charAt(Math.floor(Math.random() * SEED_ALPHABET.length));
    }
    return out;
  };
  return `VL-${chunk(4)}-${chunk(4)}`;
}

export function normalizeSeed(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

export function isValidSeedFormat(seed: string): boolean {
  return /^VL-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(normalizeSeed(seed));
}

export function sheetFromTemplate(
  template: CharacterTemplate,
  overrides: Partial<{
    name: string;
    backstory: string;
    appearance: string;
    ideals: string;
    bonds: string;
    flaws: string;
    stats: AbilityScores;
  }> = {}
): Omit<CharacterSheet, 'id' | 'seed'> {
  return {
    name: (overrides.name ?? template.name).trim().slice(0, 50) || template.name,
    templateId: template.id,
    race: template.race,
    className: template.className,
    subclass: template.subclass,
    background: template.background,
    level: 1,
    stats: parseStats(overrides.stats ?? template.stats),
    skills: [...template.skills],
    features: [...template.features],
    equipment: [...template.equipment],
    backstory: (overrides.backstory ?? '').trim(),
    appearance: (overrides.appearance ?? template.appearance).trim(),
    ideals: (overrides.ideals ?? template.ideals).trim(),
    bonds: (overrides.bonds ?? template.bonds).trim(),
    flaws: (overrides.flaws ?? template.flaws).trim(),
    skin: {
      portraitKey: template.portraitKey,
      tint: template.skinTint,
    },
    maxHp: template.maxHp,
    armorClass: template.armorClass,
    speed: template.speed,
  };
}

export function validateSheetDraft(raw: unknown): {
  ok: true;
  sheet: Omit<CharacterSheet, 'id' | 'seed'>;
} | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Character draft missing.' };
  }

  const draft = raw as Record<string, unknown>;
  const templateId = String(draft.templateId ?? draft.template_id ?? '');
  if (!listTemplateIds().includes(templateId)) {
    return { ok: false, error: 'Template must be one of the 10 allowed presets.' };
  }

  const template = getTemplate(templateId);
  if (!template) {
    return { ok: false, error: 'Unknown template.' };
  }

  const name = String(draft.name ?? '').trim().slice(0, 50);
  if (!name) {
    return { ok: false, error: 'Name is required.' };
  }

  const sheet = sheetFromTemplate(template, {
    name,
    backstory: String(draft.backstory ?? ''),
    appearance: String(draft.appearance ?? template.appearance),
    ideals: String(draft.ideals ?? template.ideals),
    bonds: String(draft.bonds ?? template.bonds),
    flaws: String(draft.flaws ?? template.flaws),
    stats: parseStats(draft.stats ?? template.stats),
  });

  return { ok: true, sheet };
}

export function rowToSheet(row: Record<string, unknown>): CharacterSheet | null {
  if (!row || row.seed == null || row.name == null) return null;
  const skinRaw =
    row.skin && typeof row.skin === 'object' ? (row.skin as Record<string, unknown>) : {};

  return {
    id: row.id ? String(row.id) : undefined,
    seed: normalizeSeed(String(row.seed)),
    name: String(row.name),
    templateId: String(row.template_id ?? ''),
    race: String(row.race ?? 'Human'),
    className: String(row.class_name ?? 'Adventurer'),
    subclass: String(row.subclass ?? ''),
    background: String(row.background ?? ''),
    level: typeof row.level === 'number' ? row.level : 1,
    stats: parseStats(row.stats),
    skills: Array.isArray(row.skills) ? row.skills.map(String) : [],
    features: Array.isArray(row.features) ? row.features.map(String) : [],
    equipment: Array.isArray(row.equipment) ? row.equipment.map(String) : [],
    backstory: String(row.backstory ?? ''),
    appearance: String(row.appearance ?? ''),
    ideals: String(row.ideals ?? ''),
    bonds: String(row.bonds ?? ''),
    flaws: String(row.flaws ?? ''),
    skin: {
      portraitKey: String(skinRaw.portraitKey ?? 'Adventurer'),
      tint: String(skinRaw.tint ?? '#c4a574'),
    },
    maxHp: typeof row.max_hp === 'number' ? row.max_hp : 12,
    armorClass: typeof row.armor_class === 'number' ? row.armor_class : 12,
    speed: typeof row.speed === 'number' ? row.speed : 30,
  };
}

export function sheetToDbRow(sheet: Omit<CharacterSheet, 'id'> & { seed: string }) {
  return {
    seed: normalizeSeed(sheet.seed),
    name: sheet.name,
    template_id: sheet.templateId,
    race: sheet.race,
    class_name: sheet.className,
    subclass: sheet.subclass,
    background: sheet.background,
    level: sheet.level,
    stats: sheet.stats,
    skills: sheet.skills,
    features: sheet.features,
    equipment: sheet.equipment,
    backstory: sheet.backstory,
    appearance: sheet.appearance,
    ideals: sheet.ideals,
    bonds: sheet.bonds,
    flaws: sheet.flaws,
    skin: sheet.skin,
    max_hp: sheet.maxHp,
    armor_class: sheet.armorClass,
    speed: sheet.speed,
    updated_at: new Date().toISOString(),
  };
}

export function sheetSnapshot(sheet: CharacterSheet) {
  return {
    seed: sheet.seed,
    name: sheet.name,
    templateId: sheet.templateId,
    race: sheet.race,
    className: sheet.className,
    subclass: sheet.subclass,
    background: sheet.background,
    level: sheet.level,
    stats: sheet.stats,
    skills: sheet.skills,
    features: sheet.features.slice(0, 6),
    equipment: sheet.equipment.slice(0, 8),
    backstory: sheet.backstory.slice(0, 600),
    appearance: sheet.appearance.slice(0, 240),
    ideals: sheet.ideals,
    bonds: sheet.bonds,
    flaws: sheet.flaws,
    skin: sheet.skin,
    maxHp: sheet.maxHp,
    armorClass: sheet.armorClass,
    speed: sheet.speed,
  };
}

export function compactSheetForGm(sheet: CharacterSheet | null | undefined): string {
  if (!sheet) return 'No sheet.';
  return [
    `${sheet.name} | ${sheet.race} ${sheet.className} (${sheet.subclass}) L${sheet.level}`,
    `HP ${sheet.maxHp} · AC ${sheet.armorClass} · SPD ${sheet.speed}`,
    `STR ${sheet.stats.STR} DEX ${sheet.stats.DEX} CON ${sheet.stats.CON} INT ${sheet.stats.INT} WIS ${sheet.stats.WIS} CHA ${sheet.stats.CHA}`,
    `Skills: ${sheet.skills.join(', ') || '—'}`,
    `Features: ${sheet.features.slice(0, 4).join(', ') || '—'}`,
    `Look: ${sheet.appearance || '—'}`,
    `Backstory: ${(sheet.backstory || '—').slice(0, 280)}`,
  ].join('\n');
}
