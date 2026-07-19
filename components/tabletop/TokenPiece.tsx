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
  const figure =
    size === 'lg'
      ? 'w-16 h-20 sm:w-[4.5rem] sm:h-[5.5rem]'
      : size === 'sm'
        ? 'w-11 h-14'
        : 'w-14 h-[4.25rem]';
  const base =
    size === 'lg' ? 'w-20 h-5 sm:w-24 sm:h-6' : size === 'sm' ? 'w-14 h-3.5' : 'w-16 h-4';
  const portrait = portraitForPlayer(player?.user_name, player?.avatar_class);

  return (
    <div
      ref={(el) => onMount(player?.user_name ?? 'unknown', el)}
      className={`mini-token relative flex flex-col items-center ${
        emphasized ? 'z-20 scale-105' : 'z-10'
      }`}
    >
      <div
        className={`relative ${figure} mini-figure overflow-hidden bg-[#1a120c]`}
        style={{ borderRadius: '40% 40% 18% 18% / 28% 28% 12% 12%' }}
      >
        <Image
          src={portrait}
          alt=""
          fill
          sizes="96px"
          className="object-cover object-top plate-ink"
        />
      </div>
      <div
        className={`relative -mt-1 ${base} rounded-[100%] mini-base ${
          emphasized ? 'mini-base-active' : ''
        }`}
        title={`${hp.current}/${hp.max} HP`}
      >
        <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 h-1.5 blood-vial">
          <div className="blood-vial-fill" style={{ width: `${hp.ratio * 100}%` }} />
        </div>
      </div>
      <div className="mini-tag mt-1 text-center">
        <p className="text-[11px] leading-tight truncate font-[inherit]">
          {player?.user_name ?? 'Unknown'}
        </p>
        <p className="text-[9px] leading-tight text-[#5c3a21] truncate italic">
          {player?.avatar_class ?? 'Adventurer'}
        </p>
      </div>
    </div>
  );
}
