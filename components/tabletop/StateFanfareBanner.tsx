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
    <div className="fixed top-[4.5rem] left-1/2 -translate-x-1/2 z-[70] w-[min(92vw,26rem)] wax-fanfare">
      <button
        type="button"
        onClick={onDismiss}
        className="w-full flex items-start gap-3 text-left parchment-panel px-3 py-3"
        style={{
          clipPath: 'polygon(2% 0, 100% 3%, 98% 100%, 0 96%)',
          border: 'none',
          boxShadow: '0 14px 36px rgba(0,0,0,0.6)',
        }}
      >
        <div className="wax-seal-disk" aria-hidden>
          World
          <br />
          answers
        </div>
        <div className="min-w-0 pt-1">
          <p className="font-display text-base text-[#2a160e] leading-snug">
            {primary.title}
          </p>
          <p className="text-sm italic text-[#5c3a21] mt-1">{primary.detail}</p>
          {events.length > 1 && (
            <p className="text-[12px] text-[#7f1d1d] mt-2 italic">
              …and {events.length - 1} more mark
              {events.length > 2 ? 's' : ''} on the page
            </p>
          )}
          <p className="text-[11px] text-[#8b5e34] mt-2 italic">Press the seal to continue</p>
        </div>
      </button>
    </div>
  );
}
