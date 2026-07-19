'use client';

import type { ReactiveCampaignState } from '@/lib/campaigns/types';
import type { PlayerEntity } from '@/types/database';

export default function HostSatchel({
  open,
  onClose,
  reactive,
  players,
  hostSkipArbiter,
  onAdvanceClock,
  onBumpHeat,
  onSpotlight,
  onWhisperNpc,
  onToggleSkipArbiter,
  onInjectSetPiece,
  onStartClash,
  onEndClash,
}: {
  open: boolean;
  onClose: () => void;
  reactive: ReactiveCampaignState | null;
  players: PlayerEntity[];
  hostSkipArbiter: boolean;
  onAdvanceClock: (clockId: string, delta: number) => void;
  onBumpHeat: (factionId: string, delta: number) => void;
  onSpotlight: (name: string | null) => void;
  onWhisperNpc: (npcLabel: string, body: string) => void;
  onToggleSkipArbiter: () => void;
  onInjectSetPiece: () => void;
  onStartClash: () => void;
  onEndClash: () => void;
}) {
  if (!open) return null;

  const clocks = reactive ? Object.entries(reactive.clocks) : [];
  const heat = reactive ? Object.entries(reactive.heat) : [];

  return (
    <div className="vault-host-panel" role="dialog" aria-label="Host satchel">
      <div className="vault-host-head">
        <div>
          <p className="text-[11px] italic text-[#b8965c]">Host satchel</p>
          <h3 className="font-display text-lg text-[#f0e2c4]">First seat tools</h3>
        </div>
        <button type="button" className="text-[12px] italic text-[#b8965c]" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="vault-host-body space-y-4">
        <label className="flex items-center gap-2 text-[13px] text-[#e4d0a2] italic">
          <input
            type="checkbox"
            checked={hostSkipArbiter}
            onChange={onToggleSkipArbiter}
            className="accent-[#8b5e34]"
          />
          Skip Arbiter on next seal (table note only)
        </label>

        <div>
          <p className="text-[11px] italic text-[#b8965c] mb-2">Lantern</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="vault-host-chip" onClick={() => onSpotlight(null)}>
              Open
            </button>
            {players.map((p) => (
              <button
                key={p.id}
                type="button"
                className="vault-host-chip"
                onClick={() => onSpotlight(p.user_name)}
              >
                {p.user_name}
              </button>
            ))}
          </div>
        </div>

        {clocks.length > 0 && (
          <div>
            <p className="text-[11px] italic text-[#b8965c] mb-2">Clocks</p>
            <ul className="space-y-2">
              {clocks.map(([id, clock]) => (
                <li key={id} className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="text-[#e4d0a2] italic truncate">
                    {clock.name} {clock.filled}/{clock.segments}
                  </span>
                  <span className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      className="vault-host-chip"
                      onClick={() => onAdvanceClock(id, -1)}
                    >
                      −
                    </button>
                    <button
                      type="button"
                      className="vault-host-chip"
                      onClick={() => onAdvanceClock(id, 1)}
                    >
                      +
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {heat.length > 0 && (
          <div>
            <p className="text-[11px] italic text-[#b8965c] mb-2">Faction heat</p>
            <ul className="space-y-2">
              {heat.map(([id, value]) => (
                <li key={id} className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="text-[#e4d0a2] italic truncate">
                    {id}: {value}
                  </span>
                  <span className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      className="vault-host-chip"
                      onClick={() => onBumpHeat(id, -1)}
                    >
                      −
                    </button>
                    <button
                      type="button"
                      className="vault-host-chip"
                      onClick={() => onBumpHeat(id, 1)}
                    >
                      +
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <p className="text-[11px] italic text-[#b8965c] mb-2">NPC whisper</p>
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const npc = (form.elements.namedItem('npc') as HTMLInputElement)?.value?.trim();
              const body = (form.elements.namedItem('body') as HTMLInputElement)?.value?.trim();
              if (!npc || !body) return;
              onWhisperNpc(npc, body);
              form.reset();
            }}
          >
            <input
              name="npc"
              placeholder="NPC name"
              className="quill-input w-full text-[14px] px-2 py-1.5"
            />
            <input
              name="body"
              placeholder="What they murmur…"
              className="quill-input w-full text-[14px] px-2 py-1.5"
            />
            <button type="submit" className="wax-button w-full py-2 text-[11px]">
              Pass the note
            </button>
          </form>
        </div>

        <div className="flex flex-col gap-2">
          <button type="button" className="wax-button py-2 text-[11px]" onClick={onInjectSetPiece}>
            Inject session set-piece
          </button>
          <button type="button" className="vault-host-chip py-2" onClick={onStartClash}>
            Draw steel — start clash
          </button>
          <button type="button" className="vault-host-chip py-2" onClick={onEndClash}>
            Sheathe — end clash
          </button>
        </div>
      </div>
    </div>
  );
}
