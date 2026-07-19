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
    <div className="pointer-events-none absolute z-30 left-1/2 top-[52%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2">
      <div className="bone-die-result">
        <span className="bone-die-total">{result.total}</span>
        <span className="text-[9px] mt-0.5 opacity-80">{result.expression}</span>
      </div>
      <p className="text-[11px] italic text-[#f3e6c8] drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
        {sender} · {result.detail}
      </p>
    </div>
  );
}
