'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function HomeDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [joinCode, setJoinCode] = useState('');

  const generateLobbyCode = (): string => {
    const pool = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += pool.charAt(Math.floor(Math.random() * pool.length));
    }
    return code;
  };

  const handleCreateGame = () => {
    setLoading(true);
    const code = generateLobbyCode();
    router.push(`/game/${code}`);
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

      <div className="relative z-10 text-center max-w-md w-full space-y-6">
        <div className="space-y-2">
          <p className="session-seal text-[10px]">VOIDLINE TABLETOP</p>
          <h1 className="font-display text-4xl sm:text-5xl font-black tracking-wide text-[#f3e6c8] drop-shadow-[0_4px_12px_rgba(0,0,0,0.85)]">
            Open the Board
          </h1>
          <p className="text-[#c4a574] italic text-sm">
            Aden · Edward · Jamie — no rails, only the table.
          </p>
        </div>

        <div className="parchment-panel p-6 space-y-4 text-left">
          <button
            type="button"
            onClick={handleCreateGame}
            disabled={loading}
            className="wax-button w-full py-4 text-xs uppercase tracking-[0.3em]"
          >
            {loading ? 'Carving a seal…' : 'Light a New Campaign'}
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
      </div>
    </div>
  );
}
