'use client';

import type { FanfareEvent } from '@/lib/state-fanfare';

export default function StateFanfareBanner({
  events,
  onDismiss,
}: {
  events: FanfareEvent[];
  onDismiss: () => void;
}) {
  if (events.length === 0) return null;
  const primary = events[0];

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[70] w-[min(92vw,28rem)] fanfare-pop">
      <button
        type="button"
        onClick={onDismiss}
        className="w-full text-left parchment-panel border-[#9f1239] px-4 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.65)]"
      >
        <p className="font-display text-[10px] uppercase tracking-[0.35em] text-[#9f1239]">
          The world answers
        </p>
        <p className="font-display text-base font-black text-[#2c1810] mt-1">
          {primary.title}
        </p>
        <p className="text-sm italic text-[#5c3a21] mt-0.5">{primary.detail}</p>
        {events.length > 1 && (
          <p className="text-[11px] text-[#7f1d1d] mt-2">
            +{events.length - 1} more shift{events.length > 2 ? 's' : ''} on the board
          </p>
        )}
        <p className="text-[10px] uppercase tracking-widest text-[#8b5e34] mt-2">
          Tap to dismiss
        </p>
      </button>
    </div>
  );
}
