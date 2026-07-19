'use client';

import React, { useEffect, useState } from 'react';
import { playBootWhoosh, startAmbientBed, stopAmbientBed } from '@/lib/table-sfx';

interface GameStageProps {
  children: React.ReactNode;
  /** Extra class on the outer shell */
  className?: string;
  /** Campaign id for ambient tint / bed flavor */
  campaignId?: string | null;
  /** Skip boot curtain (e.g. already in session) */
  skipBoot?: boolean;
  /** Start ambient room bed after boot */
  ambient?: boolean;
  /** Mute ambient when true */
  muted?: boolean;
}

/**
 * AAA presentation shell: letterbox stage, film post, boot curtain, ambient bed.
 */
export default function GameStage({
  children,
  className = '',
  campaignId,
  skipBoot = false,
  ambient = true,
  muted = false,
}: GameStageProps) {
  const [booting, setBooting] = useState(!skipBoot);
  const [bootGone, setBootGone] = useState(skipBoot);

  useEffect(() => {
    if (skipBoot) return;
    playBootWhoosh();
    const fade = window.setTimeout(() => setBooting(false), 900);
    const remove = window.setTimeout(() => setBootGone(true), 1600);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(remove);
    };
  }, [skipBoot]);

  useEffect(() => {
    if (!ambient || muted || booting) {
      stopAmbientBed();
      return;
    }
    startAmbientBed(campaignId ?? 'default');

    const unlock = () => {
      startAmbientBed(campaignId ?? 'default');
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      stopAmbientBed();
    };
  }, [ambient, muted, booting, campaignId]);

  return (
    <div
      className={`aaa-root relative min-h-screen overflow-hidden ${className}`}
      data-campaign={campaignId ?? undefined}
    >
      <div className="aaa-letterbox-top" aria-hidden />
      <div className="aaa-letterbox-bottom" aria-hidden />

      <div className="aaa-stage relative min-h-screen">
        {children}
      </div>

      {/* Cinematic post stack — sits above content, ignores clicks */}
      <div className="aaa-post pointer-events-none" aria-hidden>
        <div className="aaa-vignette" />
        <div className="aaa-grain" />
        <div className="aaa-chromatic" />
        <div className="aaa-lut" />
      </div>

      {!bootGone && (
        <div
          className={`aaa-boot ${booting ? 'aaa-boot-in' : 'aaa-boot-out'}`}
          aria-hidden
        >
          <div className="aaa-boot-ember" />
          <p className="aaa-boot-mark">Voidline</p>
        </div>
      )}
    </div>
  );
}
