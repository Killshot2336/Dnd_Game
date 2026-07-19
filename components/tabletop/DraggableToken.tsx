'use client';

import React, { useCallback, useRef } from 'react';
import TokenPiece from '@/components/tabletop/TokenPiece';
import { playWoodThud } from '@/lib/table-sfx';
import type { TokenTablePos } from '@/lib/table-meta';
import type { PlayerEntity } from '@/types/database';

interface Props {
  player: PlayerEntity;
  pos: TokenTablePos;
  emphasized?: boolean;
  spotlighted?: boolean;
  size?: 'sm' | 'md' | 'lg';
  onMount: (name: string, el: HTMLDivElement | null) => void;
  onDragEnd: (name: string, pos: TokenTablePos) => void;
}

/** Absolute-positioned token with pointer drag; positions are % of the table plane. */
export default function DraggableToken({
  player,
  pos,
  emphasized,
  spotlighted,
  size = 'sm',
  onMount,
  onDragEnd,
}: Props) {
  const dragging = useRef(false);
  const planeRef = useRef<HTMLElement | null>(null);
  const name = player?.user_name ?? 'unknown';

  const updateFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const plane = planeRef.current;
      if (!plane) return;
      const rect = plane.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      const x = ((clientX - rect.left) / rect.width) * 100;
      const y = ((clientY - rect.top) / rect.height) * 100;
      onDragEnd(name, {
        x: Math.min(92, Math.max(8, x)),
        y: Math.min(88, Math.max(12, y)),
      });
    },
    [name, onDragEnd]
  );

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragging.current = true;
    planeRef.current = event.currentTarget.offsetParent as HTMLElement | null;
    event.currentTarget.setPointerCapture(event.pointerId);
    playWoodThud();
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    updateFromPointer(event.clientX, event.clientY);
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
    updateFromPointer(event.clientX, event.clientY);
  };

  return (
    <div
      className={`absolute cursor-grab active:cursor-grabbing touch-none select-none ${
        spotlighted ? 'token-spotlight' : ''
      }`}
      style={{
        left: `${pos.x}%`,
        top: `${pos.y}%`,
        transform: 'translate(-50%, -50%) translateZ(18px) rotateX(-54deg)',
        zIndex: emphasized || spotlighted ? 25 : 15,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <TokenPiece
        player={player}
        emphasized={emphasized || spotlighted}
        onMount={onMount}
        size={size}
      />
    </div>
  );
}
