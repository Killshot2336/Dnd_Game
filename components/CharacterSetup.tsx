'use client';

import React, { useMemo, useState } from 'react';
import Image from 'next/image';
import GameStage from '@/components/aaa/GameStage';
import { CHARACTER_TEMPLATES, getTemplate } from '@/lib/character-presets';
import { portraitForPlayer, ROOM_BG } from '@/lib/game-art';
import {
  formatModifier,
  generateCharacterSeed,
  isValidSeedFormat,
  normalizeSeed,
  rowToSheet,
  sheetFromTemplate,
  sheetToDbRow,
  type CharacterSheet,
} from '@/lib/character-sheet';
import { getSupabaseBrowserClient } from '@/lib/supabase';
import { playPageTurn, playWaxStamp } from '@/lib/table-sfx';
import type { AbilityScores } from '@/types/database';

export type ForgeJoinPayload = {
  sheet: CharacterSheet;
  characterId: string;
};

interface CharacterSetupProps {
  onFinish: (data: ForgeJoinPayload) => void;
}

/** Arrive → pick/ai → full sheet → seal */
type Stage = 'arrive' | 'pick' | 'ai' | 'sheet';

const ABILITIES: Array<keyof AbilityScores> = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

const ALL_SKILLS = [
  'Acrobatics',
  'Animal Handling',
  'Arcana',
  'Athletics',
  'Deception',
  'History',
  'Insight',
  'Intimidation',
  'Investigation',
  'Medicine',
  'Nature',
  'Perception',
  'Performance',
  'Persuasion',
  'Religion',
  'Sleight of Hand',
  'Stealth',
  'Survival',
] as const;

export default function CharacterSetup({ onFinish }: CharacterSetupProps) {
  const [stage, setStage] = useState<Stage>('arrive');
  const [seedInput, setSeedInput] = useState('');
  const [seedError, setSeedError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [templateId, setTemplateId] = useState(CHARACTER_TEMPLATES[0].id);
  const [name, setName] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [backstory, setBackstory] = useState('');
  const [appearance, setAppearance] = useState('');
  const [ideals, setIdeals] = useState('');
  const [bonds, setBonds] = useState('');
  const [flaws, setFlaws] = useState('');

  const template = useMemo(
    () => getTemplate(templateId) ?? CHARACTER_TEMPLATES[0],
    [templateId]
  );

  const previewPortrait = portraitForPlayer(
    name || template.name,
    template.portraitKey
  );

  const proficient = useMemo(
    () => new Set(template.skills.map((s) => s.toLowerCase())),
    [template.skills]
  );

  const applyTemplate = (id: string) => {
    const next = getTemplate(id);
    if (!next) return;
    setTemplateId(id);
    setAppearance(next.appearance);
    setIdeals(next.ideals);
    setBonds(next.bonds);
    setFlaws(next.flaws);
    if (!name.trim()) setName('');
  };

  const openSheetFromTemplate = (id: string) => {
    applyTemplate(id);
    playPageTurn();
    setStage('sheet');
  };

  const loadBySeed = async () => {
    const seed = normalizeSeed(seedInput);
    if (!isValidSeedFormat(seed)) {
      setSeedError('Seed format: VL-XXXX-XXXX');
      return;
    }
    setBusy(true);
    setSeedError(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('characters')
        .select('*')
        .eq('seed', seed)
        .maybeSingle();
      if (error) throw error;
      const sheet = rowToSheet((data ?? null) as Record<string, unknown>);
      if (!sheet?.id) {
        setSeedError('No legend found for that seed.');
        return;
      }
      onFinish({ sheet, characterId: sheet.id });
    } catch (error) {
      console.error(error);
      setSeedError(
        error instanceof Error
          ? error.message
          : 'Could not load seed. Has the characters migration been applied?'
      );
    } finally {
      setBusy(false);
    }
  };

  const saveAndJoin = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setSeedError(null);
    playWaxStamp();
    try {
      const draft = sheetFromTemplate(template, {
        name: name.trim(),
        backstory,
        appearance: appearance || template.appearance,
        ideals: ideals || template.ideals,
        bonds: bonds || template.bonds,
        flaws: flaws || template.flaws,
      });

      let seed = generateCharacterSeed();
      const supabase = getSupabaseBrowserClient();

      for (let attempt = 0; attempt < 4; attempt++) {
        const row = sheetToDbRow({ ...draft, seed });
        const { data, error } = await supabase
          .from('characters')
          .insert([row])
          .select('*')
          .single();
        if (!error && data) {
          const sheet = rowToSheet(data as Record<string, unknown>);
          if (sheet?.id) {
            onFinish({ sheet, characterId: sheet.id });
            return;
          }
        }
        if (error && String((error as { code?: string }).code) === '23505') {
          seed = generateCharacterSeed();
          continue;
        }
        if (error) throw error;
      }
      throw new Error('Could not mint a unique seed.');
    } catch (error) {
      console.error(error);
      setSeedError(
        error instanceof Error
          ? error.message
          : 'Save failed. Apply migration 002_characters_and_seeds.sql in Supabase.'
      );
    } finally {
      setBusy(false);
    }
  };

  const runAiForge = async () => {
    if (!aiPrompt.trim()) return;
    setBusy(true);
    setSeedError(null);
    try {
      const res = await fetch('/api/character-forge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt.trim() }),
      });
      const data = (await res.json()) as {
        draft?: {
          templateId: string;
          name: string;
          backstory: string;
          appearance: string;
          ideals: string;
          bonds: string;
          flaws: string;
        };
        error?: string;
      };
      if (!res.ok || !data.draft) {
        throw new Error(data.error || 'Forge failed');
      }
      applyTemplate(data.draft.templateId);
      setName(data.draft.name);
      setBackstory(data.draft.backstory);
      setAppearance(data.draft.appearance);
      setIdeals(data.draft.ideals);
      setBonds(data.draft.bonds);
      setFlaws(data.draft.flaws);
      playPageTurn();
      setStage('sheet');
    } catch (error) {
      setSeedError(error instanceof Error ? error.message : 'AI forge failed');
    } finally {
      setBusy(false);
    }
  };

  /* —— Full character sheet —— */
  if (stage === 'sheet') {
    return (
      <GameStage className="sheet-room v3-chamber" skipBoot ambient={false}>
      <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain custom-scrollbar sheet-forge-scroll">
        <div className="v3-chamber-wall" aria-hidden />
        <div className="v3-sconce v3-sconce-left" aria-hidden />
        <div className="v3-sconce v3-sconce-right" aria-hidden />
        <div
          className="absolute inset-0 bg-cover bg-center opacity-28 plate-ink parallax-drift"
          style={{ backgroundImage: `url(${ROOM_BG})` }}
          aria-hidden
        />
        <div className="absolute inset-0 bg-[#120c08]/82" />
        <div className="absolute left-8 top-16 w-40 h-40 torch-glow" />
        <div className="absolute right-10 bottom-20 w-48 h-48 torch-glow" />

        <div className="relative z-10 mx-auto max-w-5xl px-3 sm:px-5 py-4 sm:py-6 pb-10 sheet-unfurl">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-[#b8965c]">
            <button
              type="button"
              onClick={() => setStage('pick')}
              className="text-[13px] italic hover:text-[#f0e2c4]"
            >
              ← Choose another archetype
            </button>
            <p className="text-[12px] italic">
              Candlelight sheet · ten legends · your ink
            </p>
          </div>

          {seedError && (
            <p className="mb-3 text-sm text-[#fce7ef] bg-[#6b1020]/80 px-3 py-2 italic">
              {seedError}
            </p>
          )}

          <div className="dnd-sheet v3-sacred-sheet p-3 sm:p-5 pb-6 space-y-3">
            {/* Header identity */}
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_7.5rem]">
              <div className="dnd-box px-3 py-2">
                <label className="dnd-sheet-label" htmlFor="char-name">
                  Character Name
                </label>
                <input
                  id="char-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="True name"
                  className="dnd-field-input mt-0.5"
                  autoFocus
                />
              </div>
              <div className="dnd-box px-3 py-2">
                <label className="dnd-sheet-label" htmlFor="player-name">
                  Player Name
                </label>
                <input
                  id="player-name"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Aden / Edward / Jamie"
                  className="dnd-field-input mt-0.5"
                />
              </div>
              <div className="dnd-portrait-frame relative h-28 sm:h-full min-h-[7rem] overflow-hidden">
                <Image
                  src={previewPortrait}
                  alt=""
                  fill
                  sizes="120px"
                  className="object-cover object-top plate-ink"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="dnd-box-ink px-2 py-1.5">
                <p className="dnd-sheet-label">Class & Level</p>
                <p className="dnd-locked text-sm">
                  {template.className} {template.subclass} · 1
                </p>
              </div>
              <div className="dnd-box-ink px-2 py-1.5">
                <p className="dnd-sheet-label">Race</p>
                <p className="dnd-locked text-sm">{template.race}</p>
              </div>
              <div className="dnd-box-ink px-2 py-1.5">
                <p className="dnd-sheet-label">Background</p>
                <p className="dnd-locked text-sm">{template.background}</p>
              </div>
              <div className="dnd-box-ink px-2 py-1.5">
                <p className="dnd-sheet-label">Archetype</p>
                <p className="dnd-locked text-sm">{template.name}</p>
              </div>
            </div>

            {/* Abilities + body columns */}
            <div className="sheet-grid">
              {/* Ability column */}
              <div className="flex flex-row sm:flex-col gap-2 overflow-x-auto sm:overflow-visible pb-1">
                {ABILITIES.map((stat) => (
                  <div key={stat} className="dnd-ability shrink-0">
                    <p className="dnd-sheet-label">{stat}</p>
                    <p className="dnd-ability-score">{template.stats[stat]}</p>
                    <div className="dnd-ability-mod">
                      {formatModifier(template.stats[stat])}
                    </div>
                  </div>
                ))}
              </div>

              {/* Middle: combat + skills + features */}
              <div className="space-y-3 min-w-0">
                <div className="flex flex-wrap gap-2">
                  <div className="dnd-combat-stat flex-1">
                    <p className="dnd-sheet-label">Armor Class</p>
                    <p className="dnd-combat-value">{template.armorClass}</p>
                  </div>
                  <div className="dnd-combat-stat flex-1">
                    <p className="dnd-sheet-label">Initiative</p>
                    <p className="dnd-combat-value">
                      {formatModifier(template.stats.DEX)}
                    </p>
                  </div>
                  <div className="dnd-combat-stat flex-1">
                    <p className="dnd-sheet-label">Speed</p>
                    <p className="dnd-combat-value">{template.speed}</p>
                  </div>
                  <div className="dnd-combat-stat flex-[1.4]">
                    <p className="dnd-sheet-label">Hit Point Maximum</p>
                    <p className="dnd-combat-value">{template.maxHp}</p>
                  </div>
                </div>

                <div className="dnd-box p-2.5">
                  <p className="dnd-sheet-label mb-1">Skills</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
                    {ALL_SKILLS.map((skill) => {
                      const on = proficient.has(skill.toLowerCase());
                      return (
                        <div
                          key={skill}
                          className={`dnd-skill-row ${on ? '' : 'opacity-45'}`}
                        >
                          <span
                            className="dnd-prof-dot"
                            style={{
                              background: on ? '#2a160e' : 'transparent',
                            }}
                          />
                          <span>{skill}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="dnd-box p-2.5">
                  <p className="dnd-sheet-label mb-1">Features & Traits</p>
                  <ul className="text-[13px] space-y-1 italic text-[#2a160e]">
                    {template.features.map((f) => (
                      <li key={f}>• {f}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Right: personality + gear + story */}
              <div className="space-y-3 min-w-0">
                <div className="dnd-box p-2.5 space-y-2">
                  <div>
                    <label className="dnd-sheet-label" htmlFor="ideal">
                      Ideal
                    </label>
                    <input
                      id="ideal"
                      value={ideals}
                      onChange={(e) => setIdeals(e.target.value)}
                      className="dnd-field-input"
                    />
                  </div>
                  <div>
                    <label className="dnd-sheet-label" htmlFor="bond">
                      Bond
                    </label>
                    <input
                      id="bond"
                      value={bonds}
                      onChange={(e) => setBonds(e.target.value)}
                      className="dnd-field-input"
                    />
                  </div>
                  <div>
                    <label className="dnd-sheet-label" htmlFor="flaw">
                      Flaw
                    </label>
                    <input
                      id="flaw"
                      value={flaws}
                      onChange={(e) => setFlaws(e.target.value)}
                      className="dnd-field-input"
                    />
                  </div>
                </div>

                <div className="dnd-box p-2.5">
                  <p className="dnd-sheet-label mb-1">Equipment</p>
                  <ul className="text-[13px] space-y-0.5 italic">
                    {template.equipment.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </div>

                <div className="dnd-box p-2.5">
                  <label className="dnd-sheet-label" htmlFor="appearance">
                    Appearance
                  </label>
                  <textarea
                    id="appearance"
                    value={appearance}
                    onChange={(e) => setAppearance(e.target.value)}
                    rows={3}
                    className="dnd-field-area mt-1"
                  />
                </div>

                <div className="dnd-box p-2.5">
                  <label className="dnd-sheet-label" htmlFor="backstory">
                    Character Backstory
                  </label>
                  <p className="text-[11px] italic text-[#5c3a21] mb-1">
                    {template.backstoryPrompt}
                  </p>
                  <textarea
                    id="backstory"
                    value={backstory}
                    onChange={(e) => setBackstory(e.target.value)}
                    rows={5}
                    placeholder="Ink your past here…"
                    className="dnd-field-area"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#8b5e34]/50">
              <p className="text-[12px] italic text-[#5c3a21] max-w-md">
                Class, race, and ability scores are sealed by the archetype. Fill
                the soul of the sheet, then press the wax.
              </p>
              <button
                type="button"
                disabled={busy || !name.trim()}
                onClick={() => void saveAndJoin()}
                className="wax-button px-8 py-3 text-xs"
              >
                {busy ? 'Sealing…' : 'Seal sheet & sit'}
              </button>
            </div>
          </div>
        </div>
      </div>
      </GameStage>
    );
  }

  /* —— Arrive / pick / AI gate —— */
  return (
      <GameStage className="sheet-room v3-chamber" skipBoot ambient={false}>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="v3-chamber-wall" aria-hidden />
        <div className="v3-sconce v3-sconce-left" aria-hidden />
        <div className="v3-sconce v3-sconce-right" aria-hidden />
      <div
        className="absolute inset-0 bg-cover bg-center opacity-32 plate-ink parallax-drift"
        style={{ backgroundImage: `url(${ROOM_BG})` }}
      />
      <div className="absolute inset-0 bg-[#120c08]/80" />

      <div className="dnd-sheet v3-sacred-sheet relative max-w-lg w-full p-5 sm:p-7 space-y-4 max-h-[92vh] overflow-y-auto custom-scrollbar gate-stage-inner">
        <div>
          <h2 className="font-display text-2xl text-[#2a160e]">
            {stage === 'arrive' && 'Take your seat'}
            {stage === 'pick' && 'Choose an archetype'}
            {stage === 'ai' && 'Whisper to the forge'}
          </h2>
          <p className="text-[13px] italic text-[#5c3a21] mt-1">
            {stage === 'arrive' &&
              'Load a seed, pick a printed legend, or describe one — then fill the sheet.'}
            {stage === 'pick' &&
              'Ten allowed presets. Stats and class are fixed; the soul is yours.'}
            {stage === 'ai' &&
              'Words map onto one of the ten presets — never invents illegal classes.'}
          </p>
        </div>

        {seedError && (
          <p className="text-sm text-[#9f1239] border border-[#9f1239]/40 px-3 py-2 italic">
            {seedError}
          </p>
        )}

        {stage === 'arrive' && (
          <div className="space-y-4">
            <div className="dnd-box p-3">
              <label className="dnd-sheet-label" htmlFor="seed">
                Character Seed
              </label>
              <input
                id="seed"
                value={seedInput}
                onChange={(e) => setSeedInput(e.target.value.toUpperCase())}
                placeholder="VL-XXXX-XXXX"
                className="dnd-field-input text-center tracking-[0.28em] mt-1"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => void loadBySeed()}
                className="wax-button w-full mt-3 py-3 text-xs"
              >
                {busy ? 'Opening vault…' : 'Load by seed'}
              </button>
            </div>

            <p className="text-center text-[12px] italic text-[#5c3a21]">
              — or begin a new sheet —
            </p>

            <button
              type="button"
              onClick={() => setStage('pick')}
              className="dnd-arrive-card w-full"
            >
              <p className="font-display text-[#2a160e]">Browse archetypes</p>
              <p className="text-[12px] italic text-[#5c3a21] mt-0.5">
                Ten legends · open the blank sheet for one
              </p>
            </button>
            <button
              type="button"
              onClick={() => setStage('ai')}
              className="dnd-arrive-card w-full"
            >
              <p className="font-display text-[#2a160e]">Describe your legend</p>
              <p className="text-[12px] italic text-[#5c3a21] mt-0.5">
                AI fills a draft onto a preset, then you ink the sheet
              </p>
            </button>
          </div>
        )}

        {stage === 'pick' && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-2 max-h-[55vh] overflow-y-auto custom-scrollbar pr-1">
              {CHARACTER_TEMPLATES.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => openSheetFromTemplate(item.id)}
                  className="dnd-arrive-card w-full"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="relative w-12 h-14 overflow-hidden dnd-portrait-frame shrink-0"
                      style={{
                        borderRadius: '40% 40% 18% 18% / 28% 28% 12% 12%',
                      }}
                    >
                      <Image
                        src={portraitForPlayer(item.name, item.portraitKey)}
                        alt=""
                        fill
                        sizes="48px"
                        className="object-cover object-top plate-ink"
                      />
                    </div>
                    <div className="text-left min-w-0">
                      <p className="font-display text-[#2a160e]">{item.name}</p>
                      <p className="text-[12px] text-[#5c3a21]">
                        {item.race} {item.className} · {item.tagline}
                      </p>
                      <p className="text-[11px] italic text-[#8b5e34] mt-0.5">
                        HP {item.maxHp} · AC {item.armorClass} ·{' '}
                        {ABILITIES.map((a) => `${a} ${item.stats[a]}`).join(' ')}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setStage('arrive')}
              className="text-[13px] italic text-[#5c3a21]"
            >
              ← Back to the gate
            </button>
          </div>
        )}

        {stage === 'ai' && (
          <div className="space-y-3">
            <div className="dnd-box p-3">
              <label className="dnd-sheet-label" htmlFor="ai-prompt">
                Describe the character
              </label>
              <textarea
                id="ai-prompt"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                rows={5}
                placeholder="Scarred half-orc pit fighter who found religion the hard way…"
                className="dnd-field-area mt-1"
              />
            </div>
            <button
              type="button"
              disabled={busy || !aiPrompt.trim()}
              onClick={() => void runAiForge()}
              className="wax-button w-full py-3 text-xs"
            >
              {busy ? 'Drafting the sheet…' : 'Draft onto a preset'}
            </button>
            <button
              type="button"
              onClick={() => setStage('arrive')}
              className="text-[13px] italic text-[#5c3a21]"
            >
              ← Back to the gate
            </button>
          </div>
        )}
      </div>
    </div>
    </GameStage>
  );
}
