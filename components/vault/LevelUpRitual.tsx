'use client';

import { useState } from 'react';
import { LEVEL_UP_LORE_SKINS } from '@/lib/vault';
import type { CharacterSheet } from '@/lib/character-sheet';

export default function LevelUpRitual({
  open,
  sheet,
  onClose,
  onConfirm,
}: {
  open: boolean;
  sheet: CharacterSheet | null;
  onClose: () => void;
  onConfirm: (next: CharacterSheet, loreId: string) => void;
}) {
  const [loreId, setLoreId] = useState<string>(LEVEL_UP_LORE_SKINS[0].id);

  if (!open || !sheet) return null;

  const nextLevel = Math.min(5, (sheet.level || 1) + 1);
  const alreadyMax = (sheet.level || 1) >= 5;
  const lore = LEVEL_UP_LORE_SKINS.find((s) => s.id === loreId) ?? LEVEL_UP_LORE_SKINS[0];

  return (
    <div className="vault-levelup" role="dialog" aria-label="Level up ritual">
      <div className="vault-levelup-inner">
        <p className="text-[11px] italic text-[#b8965c]">Level-up ritual</p>
        <h3 className="font-display text-2xl text-[#f0e2c4] mt-1">
          {sheet.name} · Level {sheet.level} → {alreadyMax ? sheet.level : nextLevel}
        </h3>
        <p className="text-[13px] italic text-[#d6c4a1] mt-2">
          Preset fence holds. You grow inside the legend already carved — choose a lore skin the
          Arbiter may honor.
        </p>

        {alreadyMax ? (
          <p className="text-[13px] italic text-[#e8b4b4] mt-4">
            This legend has reached the vault&apos;s level cap (5) for now.
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            {LEVEL_UP_LORE_SKINS.map((skin) => (
              <button
                key={skin.id}
                type="button"
                onClick={() => setLoreId(skin.id)}
                className={`vault-lore-option ${loreId === skin.id ? 'vault-lore-option-on' : ''}`}
              >
                <span className="font-display text-[#f0e2c4]">{skin.label}</span>
                <span className="block text-[12px] italic text-[#b8965c] mt-0.5">
                  {skin.blurb}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="mt-5 flex gap-3 justify-end">
          <button type="button" className="text-[12px] italic text-[#b8965c]" onClick={onClose}>
            Not yet
          </button>
          {!alreadyMax && (
            <button
              type="button"
              className="wax-button px-5 py-2 text-[11px]"
              onClick={() => {
                const hpGain = 4 + Math.floor(((sheet.stats?.CON ?? 10) - 10) / 2);
                const next: CharacterSheet = {
                  ...sheet,
                  level: nextLevel,
                  maxHp: sheet.maxHp + Math.max(1, hpGain),
                  features: [
                    ...sheet.features,
                    `L${nextLevel}: ${lore.label}`,
                  ].slice(0, 12),
                  appearance: sheet.appearance.includes(lore.label)
                    ? sheet.appearance
                    : `${sheet.appearance} ${lore.blurb}`.trim().slice(0, 400),
                };
                onConfirm(next, lore.id);
              }}
            >
              Seal the ascent
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
