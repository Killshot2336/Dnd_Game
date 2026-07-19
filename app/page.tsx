'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import GameStage from '@/components/aaa/GameStage';
import { CAMPAIGNS, type CampaignId } from '@/lib/campaigns';
import { ROOM_BG } from '@/lib/game-art';
import { playWaxStamp } from '@/lib/table-sfx';

type GateMode = 'home' | 'campaigns';

export default function HomeDashboard() {
  const router = useRouter();
  const [mode, setMode] = useState<GateMode>('home');
  const [loading, setLoading] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [pickedId, setPickedId] = useState<CampaignId | null>(null);

  const generateLobbyCode = (): string => {
    const pool = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += pool.charAt(Math.floor(Math.random() * pool.length));
    }
    return code;
  };

  const handleStartCampaign = (campaignId: CampaignId) => {
    setPickedId(campaignId);
    setLoading(true);
    playWaxStamp();
    const code = generateLobbyCode();
    router.push(`/game/${code}?campaign=${campaignId}`);
  };

  const handleJoinGame = (e: React.FormEvent) => {
    e.preventDefault();
    if (joinCode.trim().length === 6) {
      playWaxStamp();
      router.push(`/game/${joinCode.trim().toUpperCase()}`);
    }
  };

  return (
    <GameStage className="tabletop-shell" ambient>
      <div className="relative flex flex-col items-center justify-center min-h-screen p-4">
        <div
          className="absolute inset-0 bg-cover bg-center parallax-drift opacity-40 plate-ink"
          style={{
            backgroundImage: `url(${ROOM_BG})`,
          }}
        />
        <div className="absolute inset-0 bg-[#120c08]/74" />
        <div className="absolute left-10 top-20 w-52 h-52 torch-glow" />
        <div className="absolute right-8 bottom-16 w-64 h-64 torch-glow" />

        <div className="relative z-10 text-center max-w-3xl w-full space-y-6 gate-stage-inner">
          <div className="space-y-2">
            <p className="session-seal text-[10px]">Voidline Tabletop</p>
            <h1 className="font-display text-4xl sm:text-5xl text-[#f0e2c4] drop-shadow-[0_4px_12px_rgba(0,0,0,0.85)]">
              {mode === 'home' ? 'The table awaits' : 'Choose a campaign'}
            </h1>
            <p className="text-[#b8965c] italic text-sm">
              {mode === 'home'
                ? 'Aden · Edward · Jamie — no rails, only the wood and the ink.'
                : 'Three doors. Heat, clocks, and memory keep every choice.'}
            </p>
          </div>

          {mode === 'home' ? (
            <div
              className="parchment-panel p-6 space-y-4 text-left max-w-md mx-auto"
              style={{
                clipPath: 'polygon(1% 0, 99% 1%, 100% 98%, 2% 100%, 0 4%)',
                border: 'none',
              }}
            >
              <button
                type="button"
                onClick={() => setMode('campaigns')}
                className="wax-button w-full py-4 text-xs"
              >
                Light a new campaign
              </button>

              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-[#8b5e34]/70" />
                <span className="flex-shrink mx-3 text-[12px] italic text-[#5c3a21]">
                  or join by seal
                </span>
                <div className="flex-grow border-t border-[#8b5e34]/70" />
              </div>

              <form onSubmit={handleJoinGame} className="space-y-3">
                <input
                  type="text"
                  maxLength={6}
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder="Six-glyph seal"
                  className="quill-input w-full text-center tracking-[0.4em] uppercase text-sm py-3"
                />
                <button
                  type="submit"
                  disabled={joinCode.trim().length !== 6}
                  className="w-full border border-[#8b5e34] text-[13px] italic py-3 text-[#2a160e] hover:bg-[#dfc4a0]/40 disabled:opacity-30"
                >
                  Sit at the table
                </button>
              </form>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3 text-left">
                {CAMPAIGNS.map((campaign) => {
                  const busy = loading && pickedId === campaign.id;
                  return (
                    <button
                      key={campaign.id}
                      type="button"
                      disabled={loading}
                      onClick={() => handleStartCampaign(campaign.id as CampaignId)}
                      className="group relative overflow-hidden border border-[#8b5e34] bg-[#1a120c]/9 text-left transition-transform duration-300 hover:-translate-y-1 disabled:opacity-60"
                    >
                      <div className="relative h-36 w-full">
                        <Image
                          src={campaign.coverArt}
                          alt=""
                          fill
                          sizes="(max-width:640px) 100vw, 33vw"
                          className="object-cover opacity-80 group-hover:opacity-100 transition-opacity plate-ink"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#120c08] via-[#120c08]/45 to-transparent" />
                      </div>
                      <div className="p-4 space-y-2">
                        <p className="text-[12px] italic text-[#b8965c]">Campaign</p>
                        <h2 className="font-display text-lg text-[#f0e2c4] leading-tight">
                          {campaign.title}
                        </h2>
                        <p className="text-[13px] text-[#d6c4a1] italic leading-snug">
                          {campaign.tagline}
                        </p>
                        <p className="text-[11px] text-[#a89070] line-clamp-2 italic">
                          {campaign.tone}
                        </p>
                        <span className="inline-block mt-2 text-[12px] italic text-[#f59e0b]">
                          {busy ? 'Carving the seal…' : 'Take this table →'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => {
                  setMode('home');
                  setLoading(false);
                  setPickedId(null);
                }}
                className="text-[12px] italic text-[#b8965c] hover:text-[#f0e2c4]"
              >
                ← Return to the gate
              </button>
            </div>
          )}
        </div>
      </div>
    </GameStage>
  );
}
