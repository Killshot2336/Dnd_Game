'use client';

import React, { useState } from 'react';
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

  return (
    <div className="fixed inset-0 bg-neutral-950/95 backdrop-blur-xl z-50 flex items-center justify-center p-4 select-none">
      <div className="bg-neutral-900 border border-neutral-800 p-8 rounded-2xl max-w-md w-full shadow-2xl space-y-6 relative">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-purple-500 via-pink-500 to-red-500" />

        <div>
          <h2 className="font-display text-lg font-black uppercase tracking-wider text-neutral-200">
            Assemble Your Character
          </h2>
          <p className="text-xs text-neutral-500 font-mono">Configuration Module: Stage {stage}/2</p>
        </div>

        {stage === 1 ? (
          <div className="space-y-4">
            <div>
              <label
                htmlFor="character-identity"
                className="block text-[10px] font-mono uppercase tracking-wider text-neutral-400 mb-2"
              >
                Character Identity Name
              </label>
              <input
                id="character-identity"
                type="text"
                maxLength={50}
                value={identity}
                onChange={(e) => setIdentity(e.target.value)}
                placeholder="Name your hero..."
                className="w-full bg-neutral-950 border border-neutral-800 focus:border-purple-500 rounded-xl px-4 py-3 text-xs focus:outline-none transition-all text-neutral-200"
              />
            </div>

            <div>
              <p className="block text-[10px] font-mono uppercase tracking-wider text-neutral-400 mb-2">
                Class Pathway
              </p>
              <div className="grid grid-cols-2 gap-2">
                {PATHWAYS.map((pathway) => (
                  <button
                    type="button"
                    key={pathway}
                    onClick={() => setVocation(pathway)}
                    className={`p-3 text-xs font-bold rounded-xl border uppercase tracking-wider transition-all ${
                      vocation === pathway
                        ? 'bg-purple-950/40 border-purple-500 text-purple-400 shadow-md shadow-purple-950/30'
                        : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-neutral-700'
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
              className="w-full bg-neutral-100 hover:bg-neutral-200 disabled:opacity-30 text-neutral-950 font-black text-xs uppercase tracking-widest py-3.5 rounded-xl transition-all mt-4"
            >
              Distribute Attribute Points →
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              {STAT_KEYS.map((attr) => (
                <div
                  key={attr}
                  className="flex items-center justify-between bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3"
                >
                  <span className="text-xs font-mono font-bold tracking-widest text-neutral-300">
                    {attr}
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleStatAdjust(attr, false)}
                      className="w-5 h-5 bg-neutral-900 border border-neutral-800 rounded flex items-center justify-center font-mono font-bold text-xs text-neutral-300 hover:border-neutral-700"
                      aria-label={`Decrease ${attr}`}
                    >
                      -
                    </button>
                    <span className="w-6 text-center text-sm font-mono text-neutral-100">
                      {attributes[attr]}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleStatAdjust(attr, true)}
                      className="w-5 h-5 bg-neutral-900 border border-neutral-800 rounded flex items-center justify-center font-mono font-bold text-xs text-neutral-300 hover:border-neutral-700"
                      aria-label={`Increase ${attr}`}
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setStage(1)}
                className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold text-xs uppercase tracking-wider px-4 py-3.5 rounded-xl transition-all border border-neutral-700/40"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleFinalize}
                className="flex-1 bg-purple-600 hover:bg-purple-500 text-neutral-50 font-black text-xs uppercase tracking-widest py-3.5 rounded-xl transition-all shadow-lg shadow-purple-950/40"
              >
                Finalize & Manifest
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
