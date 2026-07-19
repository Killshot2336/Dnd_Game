'use client';

import type { ClashCombatant, ClashZone } from '@/lib/vault';

const ZONE_LABEL: Record<ClashZone, string> = {
  front: 'Front',
  flank: 'Flank',
  rear: 'Rear',
  shadow: 'Shadow',
};

export default function ClashHud({
  active,
  combatants,
  onZone,
}: {
  active: boolean;
  combatants: ClashCombatant[];
  onZone?: (name: string, zone: ClashZone) => void;
}) {
  if (!active || combatants.length === 0) return null;

  return (
    <div className="vault-clash-hud" aria-live="polite">
      <p className="vault-clash-label">Clash</p>
      <ul className="vault-clash-list">
        {combatants.map((c) => {
          const ratio = c.maxHp > 0 ? Math.max(0, Math.min(1, c.hp / c.maxHp)) : 0;
          return (
            <li key={c.name} className="vault-clash-row">
              <div className="vault-clash-head">
                <span className="vault-clash-name">{c.name}</span>
                <span className="vault-clash-hp">
                  {c.hp}/{c.maxHp}
                </span>
              </div>
              <div className="vault-clash-bar">
                <div className="vault-clash-fill" style={{ width: `${ratio * 100}%` }} />
              </div>
              {c.conditions.length > 0 ? (
                <p className="vault-clash-conds">{c.conditions.join(' · ')}</p>
              ) : null}
              {onZone ? (
                <div className="vault-clash-zones">
                  {(Object.keys(ZONE_LABEL) as ClashZone[]).map((zone) => (
                    <button
                      key={zone}
                      type="button"
                      className={`vault-zone-btn ${c.zone === zone ? 'vault-zone-btn-on' : ''}`}
                      onClick={() => onZone(c.name, zone)}
                    >
                      {ZONE_LABEL[zone]}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="vault-clash-zone-tag">{ZONE_LABEL[c.zone]}</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
