'use client';

import type { ReactiveCampaignState } from '@/lib/campaigns';

interface Props {
  state: ReactiveCampaignState | null;
  campaignTitle?: string | null;
}

export default function ReactiveStateStrip({ state, campaignTitle }: Props) {
  if (!state) return null;

  const clocks = Object.entries(state.clocks).slice(0, 3);
  const heat = Object.entries(state.heat)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  return (
    <div className="absolute bottom-2 left-2 right-2 z-20 pointer-events-none">
      <div className="brass-plaque mx-auto max-w-3xl px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
          {campaignTitle && (
            <span className="font-display text-[#f0e2c4]">{campaignTitle}</span>
          )}
          {heat.map(([id, value]) => (
            <span key={id} className="italic text-[#b8965c]">
              {id.replace(/_/g, ' ')}{' '}
              <span className="not-italic text-[#f0e2c4]">{value}</span>
            </span>
          ))}
        </div>
        {clocks.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-3">
            {clocks.map(([id, clock]) => {
              const pct = Math.min(
                100,
                Math.round((clock.filled / Math.max(1, clock.segments)) * 100)
              );
              return (
                <div key={id} className="min-w-[7rem] flex-1">
                  <div className="flex justify-between text-[10px] text-[#a89070]">
                    <span className="truncate italic">{clock.name}</span>
                    <span>
                      {clock.filled}/{clock.segments}
                    </span>
                  </div>
                  <div className="mt-0.5 clock-notch">
                    <div className="clock-notch-fill" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {state.lastConsequence && (
          <p className="mt-1.5 text-[11px] italic text-[#d6c4a1] line-clamp-1">
            {state.lastConsequence}
          </p>
        )}
      </div>
    </div>
  );
}
