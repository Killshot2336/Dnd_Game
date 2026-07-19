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
      <div className="mx-auto max-w-3xl rounded-sm border border-[#8b5e34]/70 bg-[#140e0a]/80 px-3 py-2 backdrop-blur-[2px]">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-display uppercase tracking-[0.18em] text-[#c4a574]">
          {campaignTitle && (
            <span className="text-[#f59e0b]">{campaignTitle}</span>
          )}
          {heat.map(([id, value]) => (
            <span key={id}>
              {id.replace(/_/g, ' ')} · <span className="text-[#f3e6c8]">{value}</span>
            </span>
          ))}
        </div>
        {clocks.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-3">
            {clocks.map(([id, clock]) => {
              const pct = Math.min(100, Math.round((clock.filled / Math.max(1, clock.segments)) * 100));
              return (
                <div key={id} className="min-w-[7rem] flex-1">
                  <div className="flex justify-between text-[9px] uppercase tracking-wider text-[#a89070]">
                    <span className="truncate">{clock.name}</span>
                    <span>
                      {clock.filled}/{clock.segments}
                    </span>
                  </div>
                  <div className="mt-0.5 h-1.5 bg-[#2c1810] border border-[#5c3a21]">
                    <div
                      className="h-full bg-gradient-to-r from-[#b45309] to-[#9f1239] transition-[width] duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {state.lastConsequence && (
          <p className="mt-1.5 text-[11px] italic text-[#d6c4a1] line-clamp-1 normal-case tracking-normal font-[inherit]">
            {state.lastConsequence}
          </p>
        )}
      </div>
    </div>
  );
}
