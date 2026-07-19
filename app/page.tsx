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
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-4 select-none relative">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-purple-950/20 via-neutral-950 to-neutral-950 -z-10" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#232323_1px,transparent_1px),linear-gradient(to_bottom,#232323_1px,transparent_1px)] bg-[size:3rem_3rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-10 -z-10" />

      <div className="text-center max-w-sm w-full space-y-6">
        <div className="space-y-2">
          <h1 className="font-display text-3xl font-black uppercase tracking-widest bg-gradient-to-r from-neutral-50 via-neutral-400 to-purple-500 bg-clip-text text-transparent filter drop-shadow">
            Voidline VTT
          </h1>
          <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">
            Uncensored Multi-User AI Tabletop Framework
          </p>
        </div>

        <div className="bg-neutral-900/40 border border-neutral-800/80 backdrop-blur-xl p-6 rounded-2xl shadow-2xl space-y-4">
          <button
            type="button"
            onClick={handleCreateGame}
            disabled={loading}
            className="w-full bg-purple-600 hover:bg-purple-500 active:scale-[0.98] disabled:opacity-50 text-neutral-50 font-bold uppercase tracking-wider text-xs py-4 rounded-xl transition-all shadow-lg shadow-purple-950/50 border border-purple-500/20"
          >
            {loading ? 'Assembling Space...' : 'Launch Uncensored Session'}
          </button>

          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-neutral-800" />
            <span className="flex-shrink mx-4 text-[10px] font-mono text-neutral-600 uppercase tracking-widest">
              OR
            </span>
            <div className="flex-grow border-t border-neutral-800" />
          </div>

          <form onSubmit={handleJoinGame} className="space-y-2">
            <input
              type="text"
              maxLength={6}
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="ENTER 6-DIGIT CODE..."
              className="w-full bg-neutral-950 border border-neutral-800 focus:border-purple-500 rounded-xl px-4 py-3 text-xs font-mono text-center tracking-widest focus:outline-none transition-all uppercase text-neutral-200"
            />
            <button
              type="submit"
              disabled={joinCode.trim().length !== 6}
              className="w-full bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 disabled:hover:bg-neutral-800 text-neutral-300 font-bold uppercase tracking-wider text-xs py-3 rounded-xl transition-all border border-neutral-700/50"
            >
              Join Lobby Room
            </button>
          </form>
        </div>

        <p className="text-[10px] text-neutral-600 font-mono uppercase tracking-wider">
          Party seats: Aden · Edward · Jamie
        </p>
      </div>
    </div>
  );
}
