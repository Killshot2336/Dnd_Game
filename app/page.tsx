'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { CAMPAIGNS, type CampaignId } from '@/lib/campaigns';

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
    const code = generateLobbyCode();
    router.push(`/game/${code}?campaign=${campaignId}`);
  };

  const handleJoinGame = (e: React.FormEvent) => {
    e.preventDefault();
    if (joinCode.trim().length === 6) {
      router.push(`/game/${joinCode.trim().toUpperCase()}`);
    }
  };

  return (
    <div className="min-h-screen tabletop-shell relative flex flex-col items-center justify-center p-4 overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center ken-burns opacity-55"
        style={{
          backgroundImage:
            'url(https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?auto=format&fit=crop&w=2400&q=80)',
        }}
      />
      <div className="absolute inset-0 bg-[#140e0a]/70" />
      <div className="absolute left-10 top-20 w-52 h-52 torch-glow" />
      <div className="absolute right-8 bottom-16 w-64 h-64 torch-glow" />

      <div className="relative z-10 text-center max-w-3xl w-full space-y-6">
        <div className="space-y-2">
          <p className="session-seal text-[10px]">VOIDLINE TABLETOP</p>
          <h1 className="font-display text-4xl sm:text-5xl font-black tracking-wide text-[#f3e6c8] drop-shadow-[0_4px_12px_rgba(0,0,0,0.85)]">
            {mode === 'home' ? 'Open the Board' : 'Choose Your Campaign'}
          </h1>
          <p className="text-[#c4a574] italic text-sm">
            {mode === 'home'
              ? 'Aden · Edward · Jamie — no rails, only the table.'
              : 'Three starters. Everything you do writes heat, clocks, and memory.'}
          </p>
        </div>

        {mode === 'home' ? (
          <div className="parchment-panel p-6 space-y-4 text-left max-w-md mx-auto">
            <button
              type="button"
              onClick={() => setMode('campaigns')}
              className="wax-button w-full py-4 text-xs uppercase tracking-[0.3em]"
            >
              Start New
            </button>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-[#8b5e34]/70" />
              <span className="flex-shrink mx-3 font-display text-[10px] uppercase tracking-[0.3em] text-[#5c3a21]">
                or join
              </span>
              <div className="flex-grow border-t border-[#8b5e34]/70" />
            </div>

            <form onSubmit={handleJoinGame} className="space-y-3">
              <input
                type="text"
                maxLength={6}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="SIX-GLYPH SEAL"
                className="quill-input w-full text-center tracking-[0.45em] uppercase text-sm py-3"
              />
              <button
                type="submit"
                disabled={joinCode.trim().length !== 6}
                className="w-full border-2 border-[#8b5e34] font-display text-xs uppercase tracking-[0.25em] py-3 text-[#2c1810] hover:bg-[#dfc4a0]/50 disabled:opacity-30"
              >
                Sit at the Table
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
                    className="group relative overflow-hidden border-2 border-[#8b5e34] bg-[#1a120c]/85 text-left transition-transform duration-300 hover:-translate-y-1 disabled:opacity-60"
                  >
                    <div className="relative h-36 w-full">
                      <Image
                        src={campaign.coverArt}
                        alt=""
                        fill
                        sizes="(max-width:640px) 100vw, 33vw"
                        className="object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#140e0a] via-[#140e0a]/40 to-transparent" />
                    </div>
                    <div className="p-4 space-y-2">
                      <p className="font-display text-[10px] uppercase tracking-[0.3em] text-[#c4a574]">
                        Campaign
                      </p>
                      <h2 className="font-display text-lg font-black text-[#f3e6c8] leading-tight">
                        {campaign.title}
                      </h2>
                      <p className="text-[13px] text-[#d6c4a1] italic leading-snug">
                        {campaign.tagline}
                      </p>
                      <p className="text-[11px] text-[#a89070] line-clamp-2">
                        {campaign.tone}
                      </p>
                      <span className="inline-block mt-2 font-display text-[10px] uppercase tracking-[0.25em] text-[#f59e0b]">
                        {busy ? 'Carving seal…' : 'Take this table →'}
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
              className="font-display text-xs uppercase tracking-[0.3em] text-[#c4a574] hover:text-[#f3e6c8]"
            >
              ← Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
