'use client';

import type { RollResult } from '@/lib/table-fun';

export default function DiceResultBadge({
  sender,
  result,
}: {
  sender: string;
  result: RollResult;
}) {
  return (
    <div className="dice-result-badge pointer-events-none absolute z-30 left-1/2 top-[52%] -translate-x-1/2 -translate-y-1/2">
      <div className="dm-screen px-4 py-3 text-center border-[#f59e0b] min-w-[8rem]">
        <p className="font-display text-[9px] uppercase tracking-[0.3em] text-[#c4a574]">
          {sender}
        </p>
        <p className="font-mono text-3xl font-bold text-[#f59e0b] leading-none mt-1">
          {result.total}
        </p>
        <p className="font-mono text-[10px] text-[#d6c4a1] mt-1">{result.expression}</p>
        <p className="text-[10px] text-[#a89070] mt-0.5">{result.detail}</p>
      </div>
    </div>
  );
}
