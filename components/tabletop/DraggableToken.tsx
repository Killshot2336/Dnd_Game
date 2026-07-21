'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import TokenPiece from '@/components/tabletop/TokenPiece';
import { playWoodThud } from '@/lib/table-sfx';
import {
  TOKEN_LERP_MS,
  createTokenLerpController,
  type AbsolutePos,
} from '@/lib/engines/multiplayerPerspective';
import type { TokenTablePos } from '@/lib/table-meta';
import type { PlayerEntity } from '@/types/database';

interface Props {
  player: PlayerEntity;
  pos: TokenTablePos;
  emphasized?: boolean;
  spotlighted?: boolean;
  size?: 'sm' | 'md' | 'lg';
  /** When true, glide to pos over 150ms instead of snapping (peer packets). */
  lerp?: boolean;
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
  lerp: shouldLerp = false,
  onMount,
  onDragEnd,
}: Props) {
  const dragging = useRef(false);
  const planeRef = useRef<HTMLElement | null>(null);
  const lerpRef = useRef(createTokenLerpController(TOKEN_LERP_MS));
  const [renderPos, setRenderPos] = useState<AbsolutePos>({ x: pos.x, y: pos.y });
  const name = player?.user_name ?? 'unknown';
  const profileId = player?.id ?? name;

  useEffect(() => {
    const controller = lerpRef.current;
    if (!shouldLerp || dragging.current) {
      controller.setImmediate(profileId, pos);
      setRenderPos({ x: pos.x, y: pos.y });
      return;
    }

    if (!controller.has(profileId)) {
      controller.setImmediate(profileId, pos);
      setRenderPos({ x: pos.x, y: pos.y });
      return;
    }

    controller.setTarget(profileId, pos, TOKEN_LERP_MS);
    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(48, now - last);
      last = now;
      controller.tick(dt);
      const current = controller.getCurrent(profileId);
      if (current) setRenderPos(current);
      const settled =
        current &&
        Math.abs(current.x - pos.x) < 0.05 &&
        Math.abs(current.y - pos.y) < 0.05;
      if (!settled) {
        frame = window.requestAnimationFrame(tick);
      }
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [pos.x, pos.y, profileId, shouldLerp]);

  const updateFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const plane = planeRef.current;
      if (!plane) return;
      const rect = plane.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      const x = ((clientX - rect.left) / rect.width) * 100;
      const y = ((clientY - rect.top) / rect.height) * 100;
      const next = {
        x: Math.min(92, Math.max(8, x)),
        y: Math.min(88, Math.max(12, y)),
      };
      setRenderPos(next);
      lerpRef.current.setImmediate(profileId, next);
      onDragEnd(name, next);
    },
    [name, onDragEnd, profileId]
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
        left: `${renderPos.x}%`,
        top: `${renderPos.y}%`,
        transform: 'translate(-50%, -50%) translateZ(18px) rotateX(-22deg)',
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
