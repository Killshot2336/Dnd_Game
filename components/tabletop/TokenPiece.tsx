'use client';

import Image from 'next/image';
import { portraitForPlayer } from '@/lib/game-art';
import { safeHp } from '@/lib/game-guards';
import type { PlayerEntity } from '@/types/database';

export default function TokenPiece({
  player,
  emphasized,
  onMount,
  size = 'md',
}: {
  player: PlayerEntity;
  emphasized?: boolean;
  onMount: (name: string, el: HTMLDivElement | null) => void;
  size?: 'sm' | 'md' | 'lg';
}) {
  const hp = safeHp(player);
  const dim =
    size === 'lg'
      ? 'w-28 h-28 sm:w-32 sm:h-32'
      : size === 'sm'
        ? 'w-16 h-16'
        : 'w-20 h-20 sm:w-24 sm:h-24';
  const portrait = portraitForPlayer(player?.user_name, player?.avatar_class);

  return (
    <div
      ref={(el) => onMount(player?.user_name ?? 'unknown', el)}
      className={
        emphasized
          ? 'token-piece group relative flex flex-col items-center gap-2 z-20 scale-110'
          : 'token-piece group relative flex flex-col items-center gap-2 z-10'
      }
    >
      <div
        className={
          emphasized
            ? `relative ${dim} rounded-full token-ring token-ring-active`
            : `relative ${dim} rounded-full token-ring`
        }
      >
        <div className="absolute inset-[4px] rounded-full overflow-hidden bg-[#1a120c] border border-[#3d2a1a]">
          <Image src={portrait} alt="" fill sizes="128px" className="object-cover" />
        </div>
        <div
          className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-[70%] h-2 blood-vial"
          title={`${hp.current}/${hp.max} HP`}
        >
          <div className="blood-vial-fill" style={{ width: `${hp.ratio * 100}%` }} />
        </div>
      </div>
      <div className="text-center max-w-[7.5rem]">
        <p className="font-display text-sm font-bold text-[#f3e6c8] drop-shadow-[0_2px_2px_rgba(0,0,0,0.85)] truncate">
          {player?.user_name ?? 'Unknown'}
        </p>
        <p className="text-[10px] uppercase tracking-[0.2em] text-[#c4a574]">
          {player?.avatar_class ?? 'Adventurer'}
        </p>
      </div>
    </div>
  );
}
