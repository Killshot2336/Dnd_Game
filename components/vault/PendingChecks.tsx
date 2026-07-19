'use client';

import type { VaultCheck } from '@/lib/vault';

export default function PendingChecks({
  checks,
  onRoll,
  disabled,
}: {
  checks: VaultCheck[];
  onRoll: (check: VaultCheck) => void;
  disabled?: boolean;
}) {
  if (!checks.length) return null;

  return (
    <div className="vault-checks" role="group" aria-label="Pending checks">
      <p className="vault-checks-label">The dice demand an answer</p>
      <div className="vault-checks-row">
        {checks.map((check) => (
          <button
            key={check.id}
            type="button"
            disabled={disabled}
            onClick={() => onRoll(check)}
            className="vault-check-chip"
          >
            <span className="vault-check-ability">{check.ability.slice(0, 3)}</span>
            <span className="vault-check-dc">DC {check.dc}</span>
            <span className="vault-check-label">{check.label}</span>
            {check.target && check.target !== 'anyone' ? (
              <span className="vault-check-target">{check.target}</span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
