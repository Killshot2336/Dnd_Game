'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { portraitForPlayer } from '@/lib/game-art';
import type { AbilityScores, CharacterPayload } from '@/types/database';

interface CharacterSetupProps {
  onFinish: (data: CharacterPayload) => void;
}

const PATHWAYS = ['Bard', 'Barbarian', 'Rogue', 'Sorcerer', 'Paladin'] as const;
const STAT_KEYS: Array<keyof AbilityScores> = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

export default function CharacterSetup({ onFinish }: CharacterSetupProps) {
  const [stage, setStage] = useState<number>(1);
  const [identity, setIdentity] = useState<string>('');
  const [vocation, setVocation] = useState<string>('Bard');
  const [attributes, setAttributes] = useState<AbilityScores>({
    STR: 10,
    DEX: 10,
    CON: 10,
    INT: 10,
    WIS: 10,
    CHA: 10,
  });

  const handleStatAdjust = (stat: keyof AbilityScores, increment: boolean) => {
    setAttributes((prev) => {
      const currentVal = prev[stat];
      const newVal = increment ? Math.min(18, currentVal + 1) : Math.max(8, currentVal - 1);
      return { ...prev, [stat]: newVal };
    });
  };

  const handleFinalize = () => {
    if (!identity.trim()) return;
    onFinish({
      name: identity.trim(),
      characterClass: vocation,
      stats: attributes,
    });
  };

  const preview = portraitForPlayer(identity || 'Wanderer', vocation);

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

      <div className="parchment-panel relative max-w-md w-full p-6 sm:p-8 space-y-5">
        <div className="flex items-center gap-4">
          <div className="relative w-16 h-16 rounded-full overflow-hidden token-ring shrink-0">
            <Image src={preview} alt="" fill sizes="64px" className="object-cover" />
          </div>
          <div>
            <h2 className="font-display text-xl font-black text-[#2c1810]">Forge Your Legend</h2>
            <p className="text-xs uppercase tracking-[0.25em] text-[#5c3a21]">
              Ritual stage {stage}/2
            </p>
          </div>
        </div>

        {stage === 1 ? (
          <div className="space-y-4">
            <div>
              <label
                htmlFor="character-identity"
                className="block font-display text-[11px] uppercase tracking-[0.2em] text-[#5c3a21] mb-2"
              >
                True Name
              </label>
              <input
                id="character-identity"
                type="text"
                maxLength={50}
                value={identity}
                onChange={(e) => setIdentity(e.target.value)}
                placeholder="Aden, Edward, Jamie…"
                className="quill-input w-full text-base px-1 py-2"
              />
            </div>

            <div>
              <p className="font-display text-[11px] uppercase tracking-[0.2em] text-[#5c3a21] mb-2">
                Calling
              </p>
              <div className="grid grid-cols-2 gap-2">
                {PATHWAYS.map((pathway) => (
                  <button
                    type="button"
                    key={pathway}
                    onClick={() => setVocation(pathway)}
                    className={`p-3 text-xs font-display font-bold border-2 uppercase tracking-wider transition-all ${
                      vocation === pathway
                        ? 'border-[#9f1239] bg-[#9f1239]/10 text-[#7f1d1d]'
                        : 'border-[#8b5e34] text-[#5c3a21] hover:border-[#b45309]'
                    }`}
                  >
                    {pathway}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => identity.trim() && setStage(2)}
              disabled={!identity.trim()}
              className="wax-button w-full py-3 text-xs uppercase tracking-[0.25em]"
            >
              Carve Attributes →
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              {STAT_KEYS.map((attr) => (
                <div
                  key={attr}
                  className="flex items-center justify-between border border-[#8b5e34] px-3 py-2 bg-[#dfc4a0]/35"
                >
                  <span className="font-display text-xs tracking-[0.2em] text-[#2c1810]">
                    {attr}
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleStatAdjust(attr, false)}
                      className="w-6 h-6 border border-[#8b5e34] font-display text-sm"
                      aria-label={`Decrease ${attr}`}
                    >
                      -
                    </button>
                    <span className="w-6 text-center font-display font-black">
                      {attributes[attr]}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleStatAdjust(attr, true)}
                      className="w-6 h-6 border border-[#8b5e34] font-display text-sm"
                      aria-label={`Increase ${attr}`}
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setStage(1)}
                className="font-display text-xs uppercase tracking-widest px-4 py-3 border border-[#8b5e34] text-[#5c3a21]"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleFinalize}
                className="wax-button flex-1 py-3 text-xs uppercase tracking-[0.25em]"
              >
                Enter the Board
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
