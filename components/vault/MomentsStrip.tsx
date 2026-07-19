'use client';

import type { ArbiterHighlight } from '@/lib/arbiter-memory';

export default function MomentsStrip({
  highlights,
}: {
  highlights: ArbiterHighlight[];
}) {
  if (!highlights.length) return null;
  const top = highlights.slice(0, 3);

  return (
    <div className="arbiter-moments" aria-label="Memorable moments">
      <p className="arbiter-moments-label">Legends at this table</p>
      <ul className="arbiter-moments-list">
        {top.map((h) => (
          <li key={h.id} className="arbiter-moment">
            <span className="arbiter-moment-title">{h.title}</span>
            <span className="arbiter-moment-who">{h.who}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
