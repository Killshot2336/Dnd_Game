'use client';

import type { TitleCardPayload } from '@/lib/vault';

export default function TitleCard({
  card,
  onDismiss,
}: {
  card: TitleCardPayload | null;
  onDismiss: () => void;
}) {
  if (!card) return null;

  return (
    <button
      type="button"
      className="vault-title-card"
      onClick={onDismiss}
      aria-label="Dismiss title card"
    >
      <div className="vault-title-card-inner">
        <p className="vault-title-card-kind">
          {card.kind === 'clock'
            ? 'Clock'
            : card.kind === 'clash'
              ? 'Clash'
              : card.kind === 'loot'
                ? 'Treasure'
                : 'Chapter'}
        </p>
        <h2 className="vault-title-card-title">{card.title}</h2>
        {card.subtitle ? (
          <p className="vault-title-card-sub">{card.subtitle}</p>
        ) : null}
        <p className="vault-title-card-hint">Tap to continue</p>
      </div>
    </button>
  );
}
