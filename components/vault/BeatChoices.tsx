'use client';

import type { VaultBeat } from '@/lib/vault';

export default function BeatChoices({
  beats,
  onChoose,
  disabled,
}: {
  beats: VaultBeat[];
  onChoose: (beat: VaultBeat) => void;
  disabled?: boolean;
}) {
  if (!beats.length) return null;

  return (
    <div className="vault-beats" role="group" aria-label="Scene beats">
      <p className="vault-beats-label">The table offers a fork</p>
      <div className="vault-beats-row">
        {beats.map((beat) => (
          <button
            key={beat.id}
            type="button"
            disabled={disabled}
            onClick={() => onChoose(beat)}
            className="vault-wax-seal"
            title={beat.hint || beat.label}
          >
            <span className="vault-wax-seal-label">{beat.label}</span>
            {beat.hint ? (
              <span className="vault-wax-seal-hint">{beat.hint}</span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
