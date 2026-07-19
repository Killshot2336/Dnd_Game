'use client';

import React, { useMemo, useState } from 'react';
import Image from 'next/image';
import { CHARACTER_TEMPLATES, getTemplate } from '@/lib/character-presets';
import { portraitForPlayer } from '@/lib/game-art';
import {
  generateCharacterSeed,
  isValidSeedFormat,
  normalizeSeed,
  rowToSheet,
  sheetFromTemplate,
  sheetToDbRow,
  type CharacterSheet,
} from '@/lib/character-sheet';
import { getSupabaseBrowserClient } from '@/lib/supabase';

export type ForgeJoinPayload = {
  sheet: CharacterSheet;
  characterId: string;
};

interface CharacterSetupProps {
  onFinish: (data: ForgeJoinPayload) => void;
}

type Stage = 'gate' | 'templates' | 'customize' | 'ai';

export default function CharacterSetup({ onFinish }: CharacterSetupProps) {
  const [stage, setStage] = useState<Stage>('gate');
  const [seedInput, setSeedInput] = useState('');
  const [seedError, setSeedError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [templateId, setTemplateId] = useState(CHARACTER_TEMPLATES[0].id);
  const [name, setName] = useState('');
  const [backstory, setBackstory] = useState('');
  const [appearance, setAppearance] = useState('');
  const [ideals, setIdeals] = useState('');
  const [bonds, setBonds] = useState('');
  const [flaws, setFlaws] = useState('');

  const template = useMemo(() => getTemplate(templateId) ?? CHARACTER_TEMPLATES[0], [templateId]);

  const previewPortrait = portraitForPlayer(name || 'Wanderer', template.portraitKey);

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
        const { data, error } = await supabase.from('characters').insert([row]).select('*').single();
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
      setStage('customize');
    } catch (error) {
      setSeedError(error instanceof Error ? error.message : 'AI forge failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 tabletop-shell">
      <div
        className="absolute inset-0 bg-cover bg-center opacity-40"
        style={{
          backgroundImage:
            'url(https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?auto=format&fit=crop&w=2400&q=80)',
        }}
      />
      <div className="absolute inset-0 bg-[#140e0a]/75" />

      <div className="parchment-panel relative max-w-lg w-full p-5 sm:p-7 space-y-4 max-h-[92vh] overflow-y-auto custom-scrollbar">
        <div className="flex items-center gap-4">
          <div className="relative w-16 h-20 overflow-hidden mini-figure shrink-0" style={{ borderRadius: '40% 40% 18% 18% / 28% 28% 12% 12%' }}>
            <Image src={previewPortrait} alt="" fill sizes="64px" className="object-cover object-top plate-ink" />
          </div>
          <div>
            <h2 className="font-display text-xl font-black text-[#2c1810]">Legend Forge</h2>
            <p className="text-xs uppercase tracking-[0.25em] text-[#5c3a21]">
              Seeds · 10 presets · portable skins
            </p>
          </div>
        </div>

        {seedError && (
          <p className="text-sm text-[#9f1239] border border-[#9f1239]/40 px-3 py-2">{seedError}</p>
        )}

        {stage === 'gate' && (
          <div className="space-y-4">
            <div>
              <label className="font-display text-[11px] uppercase tracking-[0.2em] text-[#5c3a21]">
                Enter character seed
              </label>
              <input
                value={seedInput}
                onChange={(e) => setSeedInput(e.target.value.toUpperCase())}
                placeholder="VL-XXXX-XXXX"
                className="quill-input w-full text-center tracking-[0.3em] mt-2 py-2"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => void loadBySeed()}
                className="wax-button w-full mt-3 py-3 text-xs uppercase tracking-[0.25em]"
              >
                {busy ? 'Opening vault…' : 'Load by Seed'}
              </button>
            </div>
            <div className="relative flex items-center py-1">
              <div className="flex-grow border-t border-[#8b5e34]/70" />
              <span className="mx-3 font-display text-[10px] uppercase tracking-[0.3em] text-[#5c3a21]">
                or forge new
              </span>
              <div className="flex-grow border-t border-[#8b5e34]/70" />
            </div>
            <button
              type="button"
              onClick={() => setStage('templates')}
              className="w-full border-2 border-[#8b5e34] font-display text-xs uppercase tracking-[0.25em] py-3"
            >
              Browse 10 Preset Templates
            </button>
            <button
              type="button"
              onClick={() => setStage('ai')}
              className="w-full border-2 border-[#8b5e34] font-display text-xs uppercase tracking-[0.25em] py-3"
            >
              Summon by Words (AI → preset)
            </button>
          </div>
        )}

        {stage === 'templates' && (
          <div className="space-y-3">
            <p className="text-sm italic text-[#5c3a21]">Choose your allowed template (exactly 10).</p>
            <div className="grid grid-cols-1 gap-2 max-h-[50vh] overflow-y-auto custom-scrollbar">
              {CHARACTER_TEMPLATES.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => {
                    applyTemplate(item.id);
                    setStage('customize');
                  }}
                  className="text-left border-2 border-[#8b5e34] px-3 py-3 hover:bg-[#dfc4a0]/45"
                >
                  <div className="flex items-center gap-3">
                    <div className="relative w-12 h-14 overflow-hidden mini-figure shrink-0" style={{ borderRadius: '40% 40% 18% 18% / 28% 28% 12% 12%' }}>
                      <Image
                        src={portraitForPlayer(item.name, item.portraitKey)}
                        alt=""
                        fill
                        sizes="48px"
                        className="object-cover"
                      />
                    </div>
                    <div>
                      <p className="font-display font-bold text-[#2c1810]">{item.name}</p>
                      <p className="text-[12px] text-[#5c3a21]">
                        {item.race} {item.className} · {item.tagline}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setStage('gate')}
              className="font-display text-xs uppercase tracking-widest"
            >
              ← Back
            </button>
          </div>
        )}

        {stage === 'ai' && (
          <div className="space-y-3">
            <p className="text-sm italic text-[#5c3a21]">
              Describe your legend. AI maps you onto one of the 10 presets — never invents illegal classes.
            </p>
            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              rows={4}
              placeholder="Scarred half-orc pit fighter who found religion the hard way…"
              className="quill-input w-full text-sm py-2"
            />
            <button
              type="button"
              disabled={busy || !aiPrompt.trim()}
              onClick={() => void runAiForge()}
              className="wax-button w-full py-3 text-xs uppercase tracking-[0.25em]"
            >
              {busy ? 'Smithing…' : 'Forge Draft'}
            </button>
            <button
              type="button"
              onClick={() => setStage('gate')}
              className="font-display text-xs uppercase tracking-widest"
            >
              ← Back
            </button>
          </div>
        )}

        {stage === 'customize' && (
          <div className="space-y-3">
            <p className="font-display text-sm font-bold text-[#2c1810]">
              {template.name} · {template.race} {template.className}
            </p>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="True name"
              className="quill-input w-full py-2"
            />
            <textarea
              value={backstory}
              onChange={(e) => setBackstory(e.target.value)}
              rows={3}
              placeholder={template.backstoryPrompt}
              className="quill-input w-full text-sm py-2"
            />
            <textarea
              value={appearance}
              onChange={(e) => setAppearance(e.target.value)}
              rows={2}
              placeholder="Appearance"
              className="quill-input w-full text-sm py-2"
            />
            <div className="grid grid-cols-1 gap-2">
              <input
                value={ideals}
                onChange={(e) => setIdeals(e.target.value)}
                placeholder="Ideal"
                className="quill-input w-full py-1.5 text-sm"
              />
              <input
                value={bonds}
                onChange={(e) => setBonds(e.target.value)}
                placeholder="Bond"
                className="quill-input w-full py-1.5 text-sm"
              />
              <input
                value={flaws}
                onChange={(e) => setFlaws(e.target.value)}
                placeholder="Flaw"
                className="quill-input w-full py-1.5 text-sm"
              />
            </div>
            <div className="text-[12px] text-[#5c3a21] border border-[#8b5e34] p-2">
              HP {template.maxHp} · AC {template.armorClass} · Skills: {template.skills.join(', ')}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStage('templates')}
                className="font-display text-xs uppercase tracking-widest px-3 py-3 border border-[#8b5e34]"
              >
                Back
              </button>
              <button
                type="button"
                disabled={busy || !name.trim()}
                onClick={() => void saveAndJoin()}
                className="wax-button flex-1 py-3 text-xs uppercase tracking-[0.25em]"
              >
                {busy ? 'Sealing…' : 'Seal Legend & Sit'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
