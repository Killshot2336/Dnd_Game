'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import CharacterSetup from '@/components/CharacterSetup';
import { getSupabaseBrowserClient } from '@/lib/supabase';
import type {
  AbilityScores,
  CharacterPayload,
  GameRecord,
  PlayerEntity,
  ThreadMessage,
} from '@/types/database';

const ICON_BASE = 'https://raw.githubusercontent.com/game-icons/icons/master';

const assetLibrary = {
  boardArt:
    'https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?auto=format&fit=crop&w=2400&q=80',
  gmAvatar:
    'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=900&q=80',
  playerAvatar:
    'https://images.unsplash.com/photo-1460194436988-671f763436b7?auto=format&fit=crop&w=800&q=80',
  mainWeapon: `${ICON_BASE}/lorc/broadsword.svg`,
  shield: `${ICON_BASE}/lorc/checked-shield.svg`,
  armor: `${ICON_BASE}/lorc/breastplate.svg`,
  cloak: `${ICON_BASE}/lorc/robe.svg`,
  ring: `${ICON_BASE}/delapouite/ring.svg`,
  amulet: `${ICON_BASE}/lorc/gem-pendant.svg`,
} as const;

const inventorySlots = [
  { id: 'mainWeapon', label: 'Main Weapon', src: assetLibrary.mainWeapon },
  { id: 'shield', label: 'Shield', src: assetLibrary.shield },
  { id: 'armor', label: 'Gothic Chest Plate', src: assetLibrary.armor },
  { id: 'cloak', label: 'Cloak', src: assetLibrary.cloak },
  { id: 'ring', label: 'Enchanted Ring', src: assetLibrary.ring },
  { id: 'amulet', label: 'Enchanted Jewel', src: assetLibrary.amulet },
] as const;

interface DiceParticle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  vRot: number;
  size: number;
  alpha: number;
  value: number;
}

function parseStats(raw: unknown): AbilityScores {
  const fallback: AbilityScores = { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 };
  if (!raw || typeof raw !== 'object') return fallback;
  const source = raw as Record<string, unknown>;
  return {
    STR: typeof source.STR === 'number' ? source.STR : 10,
    DEX: typeof source.DEX === 'number' ? source.DEX : 10,
    CON: typeof source.CON === 'number' ? source.CON : 10,
    INT: typeof source.INT === 'number' ? source.INT : 10,
    WIS: typeof source.WIS === 'number' ? source.WIS : 10,
    CHA: typeof source.CHA === 'number' ? source.CHA : 10,
  };
}

function normalizePlayer(row: Record<string, unknown>): PlayerEntity {
  return {
    id: String(row.id),
    game_id: String(row.game_id),
    user_name: String(row.user_name),
    avatar_class: String(row.avatar_class),
    current_hp: typeof row.current_hp === 'number' ? row.current_hp : 15,
    max_hp: typeof row.max_hp === 'number' ? row.max_hp : 15,
    stats: parseStats(row.stats),
    created_at: String(row.created_at ?? ''),
  };
}

function normalizeMessage(row: Record<string, unknown>): ThreadMessage {
  return {
    id: Number(row.id),
    game_id: String(row.game_id),
    sender: String(row.sender),
    content: String(row.content),
    created_at: String(row.created_at ?? ''),
  };
}

function PlayerBoardCard({
  player,
  emphasized,
  onMount,
}: {
  player: PlayerEntity;
  emphasized?: boolean;
  onMount: (name: string, el: HTMLDivElement | null) => void;
}) {
  const ratio = Math.max(0, Math.min(1, player.current_hp / player.max_hp));

  return (
    <div
      ref={(el) => onMount(player.user_name, el)}
      className={`relative overflow-hidden rounded-2xl border backdrop-blur-md shadow-2xl transition-all duration-300 ${
        emphasized
          ? 'border-purple-400/60 bg-purple-950/40 shadow-[0_0_40px_rgba(168,85,247,0.35)] scale-105'
          : 'border-white/10 bg-black/60 hover:border-purple-500/40'
      }`}
    >
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(168,85,247,0.12),transparent_45%)] pointer-events-none" />
      <div className="relative p-3 sm:p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="relative w-12 h-12 rounded-xl overflow-hidden border border-white/15 shrink-0">
            <Image
              src={assetLibrary.playerAvatar}
              alt=""
              fill
              sizes="48px"
              className="object-cover"
            />
          </div>
          <div className="min-w-0">
            <h4 className="font-black text-xs sm:text-sm text-neutral-100 truncate tracking-wide">
              {player.user_name}
            </h4>
            <p className="text-[9px] font-mono uppercase tracking-widest text-purple-300 truncate">
              {player.avatar_class}
            </p>
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="flex justify-between text-[10px] font-mono uppercase tracking-wider text-neutral-400">
            <span>
              {player.current_hp}/{player.max_hp} HP
            </span>
            <span>CHA {player.stats.CHA}</span>
          </div>
          <div className="h-1.5 rounded-full bg-black/70 overflow-hidden border border-white/5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-red-600 via-pink-500 to-purple-500"
              style={{ width: `${ratio * 100}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GameRoom({ params }: { params: { code: string } }) {
  const sessionCode = params.code.toUpperCase();
  const [game, setGame] = useState<GameRecord | null>(null);
  const [players, setPlayers] = useState<PlayerEntity[]>([]);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState<PlayerEntity | null>(null);
  const [inputMessage, setInputMessage] = useState('');
  const [isGMLoading, setIsGMLoading] = useState(false);
  const [isTrayOpen, setIsTrayOpen] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const terminalEndRef = useRef<HTMLDivElement | null>(null);
  const diceParticlesRef = useRef<DiceParticle[]>([]);
  const playerPositionsRef = useRef<Record<string, { x: number; y: number }>>({});
  const currentPlayerNameRef = useRef<string | null>(null);

  useEffect(() => {
    currentPlayerNameRef.current = currentPlayer?.user_name ?? null;
  }, [currentPlayer]);

  const triggerDiceFromUser = useCallback((senderName: string) => {
    if (typeof window === 'undefined') return;
    if (senderName === 'GM') return;

    const origin = playerPositionsRef.current[senderName] || {
      x: window.innerWidth / 2,
      y: window.innerHeight - 220,
    };
    const burstCount = 5;

    for (let i = 0; i < burstCount; i++) {
      diceParticlesRef.current.push({
        id: Math.random(),
        x: origin.x + (Math.random() - 0.5) * 18,
        y: origin.y + (Math.random() - 0.5) * 12,
        vx: (Math.random() - 0.5) * 14,
        vy: -Math.random() * 12 - 5,
        rotation: Math.random() * Math.PI,
        vRot: (Math.random() - 0.5) * 0.25,
        size: Math.random() * 8 + 16,
        alpha: 1,
        value: Math.floor(Math.random() * 20) + 1,
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchGameContext = async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        let { data: gameData, error: gameError } = await supabase
          .from('games')
          .select('*')
          .eq('session_code', sessionCode)
          .maybeSingle();

        if (gameError) {
          throw gameError;
        }

        if (!gameData) {
          const { data: newGame, error: insertError } = await supabase
            .from('games')
            .insert([
              {
                session_code: sessionCode,
                current_narrative: 'The dynamic void initializes. Welcome, degenerates.',
              },
            ])
            .select()
            .single();

          if (insertError) {
            throw insertError;
          }
          gameData = newGame;
        }

        if (cancelled || !gameData) return;

        const typedGame = gameData as GameRecord;
        setGame(typedGame);

        const { data: playerList, error: playerError } = await supabase
          .from('players')
          .select('*')
          .eq('game_id', typedGame.id);

        if (playerError) {
          throw playerError;
        }

        const { data: msgList, error: msgError } = await supabase
          .from('messages')
          .select('*')
          .eq('game_id', typedGame.id)
          .order('created_at', { ascending: true });

        if (msgError) {
          throw msgError;
        }

        if (cancelled) return;

        setPlayers((playerList ?? []).map((row) => normalizePlayer(row as Record<string, unknown>)));
        setMessages((msgList ?? []).map((row) => normalizeMessage(row as Record<string, unknown>)));
      } catch (error) {
        console.error('Lobby boot failure:', error);
        if (!cancelled) {
          setBootError(
            error instanceof Error
              ? error.message
              : 'Failed to initialize lobby. Check Supabase credentials and migration.'
          );
        }
      }
    };

    fetchGameContext();

    return () => {
      cancelled = true;
    };
  }, [sessionCode]);

  useEffect(() => {
    if (!game) return;

    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`vtt-lobby-${game.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'players',
          filter: `game_id=eq.${game.id}`,
        },
        (payload) => {
          const incoming = normalizePlayer(payload.new as Record<string, unknown>);
          setPlayers((prev) => {
            if (prev.some((player) => player.id === incoming.id)) return prev;
            return [...prev, incoming];
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'players',
          filter: `game_id=eq.${game.id}`,
        },
        (payload) => {
          const incoming = normalizePlayer(payload.new as Record<string, unknown>);
          setPlayers((prev) =>
            prev.map((player) => (player.id === incoming.id ? incoming : player))
          );
          setCurrentPlayer((prev) => (prev && prev.id === incoming.id ? incoming : prev));
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `game_id=eq.${game.id}`,
        },
        (payload) => {
          const incoming = normalizeMessage(payload.new as Record<string, unknown>);
          setMessages((prev) => {
            if (prev.some((message) => message.id === incoming.id)) return prev;
            return [...prev, incoming];
          });

          if (
            incoming.sender !== 'GM' &&
            incoming.sender !== currentPlayerNameRef.current
          ) {
            triggerDiceFromUser(incoming.sender);
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [game, triggerDiceFromUser]);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGMLoading]);

  // Infinite Graphics Simulation Engine Loop for Dynamic Dice Rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    const drawD20 = (
      c: CanvasRenderingContext2D,
      x: number,
      y: number,
      size: number,
      rot: number,
      value: number
    ) => {
      c.save();
      c.translate(x, y);
      c.rotate(rot);

      c.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI) / 3 - Math.PI / 6;
        const px = Math.cos(angle) * size;
        const py = Math.sin(angle) * size;
        if (i === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      }
      c.closePath();

      const gradient = c.createLinearGradient(-size, -size, size, size);
      gradient.addColorStop(0, 'rgba(88, 28, 135, 0.95)');
      gradient.addColorStop(0.5, 'rgba(15, 11, 28, 0.95)');
      gradient.addColorStop(1, 'rgba(236, 72, 153, 0.55)');
      c.fillStyle = gradient;
      c.fill();
      c.strokeStyle = '#c084fc';
      c.lineWidth = 2;
      c.stroke();

      c.beginPath();
      for (let i = 0; i < 6; i += 2) {
        const angle = (i * Math.PI) / 3 - Math.PI / 6;
        c.moveTo(0, 0);
        c.lineTo(Math.cos(angle) * size, Math.sin(angle) * size);
      }
      c.strokeStyle = 'rgba(244, 114, 182, 0.75)';
      c.lineWidth = 1;
      c.stroke();

      c.rotate(-rot);
      c.fillStyle = '#f5f3ff';
      c.font = `bold ${Math.max(10, size * 0.7)}px "IBM Plex Mono", monospace`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(String(value), 0, 1);
      c.restore();
    };

    const updateEngine = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const activeParticles = diceParticlesRef.current;

      for (let i = activeParticles.length - 1; i >= 0; i--) {
        const particle = activeParticles[i];
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.rotation += particle.vRot;
        particle.vy += 0.2;
        particle.alpha -= 0.01;

        ctx.globalAlpha = Math.max(0, particle.alpha);
        drawD20(
          ctx,
          particle.x,
          particle.y,
          particle.size,
          particle.rotation,
          particle.value
        );

        if (particle.alpha <= 0) {
          activeParticles.splice(i, 1);
        }
      }

      ctx.globalAlpha = 1;
      animId = requestAnimationFrame(updateEngine);
    };

    updateEngine();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      cancelAnimationFrame(animId);
    };
  }, []);

  const handleCharacterDone = async (charData: CharacterPayload) => {
    if (!game || joining) return;
    setJoining(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const { data: existingPlayer, error: existingError } = await supabase
        .from('players')
        .select('*')
        .eq('game_id', game.id)
        .eq('user_name', charData.name)
        .maybeSingle();

      if (existingError) {
        throw existingError;
      }

      if (existingPlayer) {
        setCurrentPlayer(normalizePlayer(existingPlayer as Record<string, unknown>));
        return;
      }

      const { data, error } = await supabase
        .from('players')
        .insert([
          {
            game_id: game.id,
            user_name: charData.name,
            avatar_class: charData.characterClass,
            stats: charData.stats,
            current_hp: 15,
            max_hp: 15,
          },
        ])
        .select()
        .single();

      if (error) {
        throw error;
      }

      if (data) {
        setCurrentPlayer(normalizePlayer(data as Record<string, unknown>));
      }
    } catch (error) {
      console.error('Character manifestation error:', error);
      setBootError(
        error instanceof Error
          ? error.message
          : 'Could not register character. That name may already be claimed at this table.'
      );
    } finally {
      setJoining(false);
    }
  };

  const handleExecuteAction = async () => {
    if (!inputMessage.trim() || !currentPlayer || !game || isGMLoading) return;

    const userText = inputMessage.trim();
    setInputMessage('');
    setIsGMLoading(true);
    triggerDiceFromUser(currentPlayer.user_name);

    try {
      const supabase = getSupabaseBrowserClient();

      const { error: playerMsgError } = await supabase.from('messages').insert([
        {
          game_id: game.id,
          sender: currentPlayer.user_name,
          content: userText,
        },
      ]);

      if (playerMsgError) {
        throw playerMsgError;
      }

      const activeHistory = messages
        .map((message) => ({ sender: message.sender, content: message.content }))
        .slice(-10);

      const res = await fetch('/api/gm-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerInput: userText,
          sender: currentPlayer.user_name,
          gameId: game.id,
          history: activeHistory,
        }),
      });

      const data = (await res.json()) as { reply?: string };
      const gmReply = data.reply || 'The simulation warped. Repeat your raw action.';

      const { error: gmMsgError } = await supabase.from('messages').insert([
        {
          game_id: game.id,
          sender: 'GM',
          content: gmReply,
        },
      ]);

      if (gmMsgError) {
        throw gmMsgError;
      }

      await supabase
        .from('games')
        .update({ current_narrative: gmReply })
        .eq('id', game.id);
    } catch (err) {
      console.error('Core interaction submission error:', err);
      try {
        const supabase = getSupabaseBrowserClient();
        await supabase.from('messages').insert([
          {
            game_id: game.id,
            sender: 'GM',
            content: 'The matrix caught fire mid-turn. Spit that chaos at me again.',
          },
        ]);
      } catch (fallbackError) {
        console.error('Fallback GM message failed:', fallbackError);
      }
    } finally {
      setIsGMLoading(false);
    }
  };

  const recordPosition = useCallback((name: string, el: HTMLDivElement | null) => {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    playerPositionsRef.current[name] = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  }, []);

  useEffect(() => {
    const refreshPositions = () => {
      Object.keys(playerPositionsRef.current).forEach((name) => {
        const nodes = document.querySelectorAll(`[data-player-anchor="${CSS.escape(name)}"]`);
        const el = nodes[0] as HTMLDivElement | undefined;
        if (el) {
          const rect = el.getBoundingClientRect();
          playerPositionsRef.current[name] = {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          };
        }
      });
    };

    window.addEventListener('resize', refreshPositions);
    return () => window.removeEventListener('resize', refreshPositions);
  }, []);

  if (bootError) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-6">
        <div className="max-w-md w-full border border-red-900/60 bg-neutral-900/80 rounded-2xl p-6 space-y-3 backdrop-blur-xl">
          <h1 className="font-display text-sm font-black uppercase tracking-widest text-red-300">
            Lobby Calibration Failed
          </h1>
          <p className="text-xs font-mono text-neutral-400 whitespace-pre-wrap">{bootError}</p>
          <a
            href="/"
            className="inline-block text-[10px] uppercase tracking-widest text-purple-400 hover:text-purple-300"
          >
            ← Return to Entryway
          </a>
        </div>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="min-h-screen bg-black text-purple-500 flex items-center justify-center font-mono text-xs tracking-widest animate-pulse">
        BOOTING MATRIX BOARD...
      </div>
    );
  }

  if (!currentPlayer) {
    return <CharacterSetup onFinish={handleCharacterDone} />;
  }

  const adjacentPlayers = players.filter(
    (player) => player.user_name !== currentPlayer.user_name
  );
  const leftParty = adjacentPlayers.slice(0, Math.ceil(adjacentPlayers.length / 2));
  const rightParty = adjacentPlayers.slice(Math.ceil(adjacentPlayers.length / 2));

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col overflow-hidden antialiased select-none relative">
      {/* Dynamic Simulation Overlay Layer */}
      <canvas ref={canvasRef} className="absolute inset-0 z-40 pointer-events-none" />

      {/* Panoramic Curated Tabletop Scene Backdrop */}
      <div
        className="absolute inset-0 bg-cover bg-center -z-20 opacity-25 ken-burns"
        style={{ backgroundImage: `url(${assetLibrary.boardArt})` }}
        aria-hidden
      />
      <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/55 to-transparent -z-10" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_10%,rgba(10,10,10,0.85)_75%,#0a0a0a_100%)] -z-10" />

      <header className="relative z-20 border-b border-white/10 bg-neutral-950/55 backdrop-blur-2xl px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-2.5 h-2.5 rounded-full bg-purple-500 shadow-[0_0_15px_#a855f7] animate-pulse shrink-0" />
          <div className="min-w-0">
            <h1 className="font-display text-sm font-black tracking-widest uppercase bg-gradient-to-r from-purple-400 via-pink-400 to-red-500 bg-clip-text text-transparent truncate">
              Voidline Tactical Board
            </h1>
            <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">
              Session {sessionCode}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsTrayOpen((open) => !open)}
          className={`px-4 py-2 text-[10px] font-mono font-bold tracking-widest uppercase rounded-xl border transition-all ${
            isTrayOpen
              ? 'bg-gradient-to-r from-purple-600 to-pink-600 border-purple-400 text-white'
              : 'bg-neutral-900/80 border-white/10 text-neutral-300 hover:border-purple-500/50'
          }`}
        >
          Arsenal
        </button>
      </header>

      <main className="relative z-10 flex-1 grid grid-cols-12 gap-3 sm:gap-4 p-3 sm:p-4 h-[calc(100vh-61px)] max-h-[calc(100vh-61px)] overflow-hidden">
        {/* Left Flank Combatants */}
        <section className="col-span-12 sm:col-span-2 flex sm:flex-col justify-center gap-3 z-10 order-2 sm:order-1 overflow-x-auto sm:overflow-y-auto custom-scrollbar">
          {leftParty.length === 0 ? (
            <div className="hidden sm:block text-[10px] font-mono uppercase tracking-widest text-neutral-600 border border-dashed border-white/10 rounded-2xl p-4 text-center">
              Left flank open
            </div>
          ) : (
            leftParty.map((player) => (
              <div key={player.id} data-player-anchor={player.user_name}>
                <PlayerBoardCard player={player} onMount={recordPosition} />
              </div>
            ))
          )}
        </section>

        {/* Center Lane: GM Head + Active Operative + Narrative Terminal */}
        <section className="col-span-12 sm:col-span-8 flex flex-col gap-3 min-h-0 z-10 order-1 sm:order-2">
          {/* Imposing Game Master Avatar Card */}
          <div
            className={`mx-auto w-full max-w-md rounded-3xl border border-purple-400/40 bg-black/55 backdrop-blur-xl shadow-[0_0_50px_rgba(168,85,247,0.25)] overflow-hidden animate-float ${
              isGMLoading ? 'gm-breathe' : ''
            }`}
          >
            <div className="flex items-center gap-4 p-4">
              <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden border border-purple-300/40 shrink-0 shadow-[0_0_24px_rgba(236,72,153,0.35)]">
                <Image
                  src={assetLibrary.gmAvatar}
                  alt="Game Master"
                  fill
                  sizes="80px"
                  className="object-cover"
                  priority
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-purple-300">
                  Game Master
                </p>
                <h2 className="font-display text-lg sm:text-xl font-black tracking-wide text-neutral-50">
                  Void Arbiter
                </h2>
                <p className="text-[11px] text-neutral-400 line-clamp-2 mt-1">
                  {isGMLoading
                    ? 'Weaving chaos across the board...'
                    : game.current_narrative}
                </p>
              </div>
            </div>
          </div>

          {/* Active user centered on the board */}
          <div
            className="mx-auto w-full max-w-sm"
            data-player-anchor={currentPlayer.user_name}
          >
            <PlayerBoardCard
              player={currentPlayer}
              emphasized
              onMount={recordPosition}
            />
          </div>

          {/* Narrative Continuum Terminal */}
          <div className="flex-1 min-h-0 rounded-3xl border border-white/10 bg-neutral-950/45 backdrop-blur-2xl shadow-[0_30px_80px_rgba(0,0,0,0.65)] overflow-hidden flex flex-col relative">
            <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/35 to-transparent pointer-events-none z-[1]" />
            <div className="relative z-[2] border-b border-white/5 px-4 py-2.5 flex items-center justify-between bg-black/25">
              <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                Narrative Continuum
              </p>
              {isGMLoading && (
                <span className="text-[10px] font-mono uppercase tracking-widest text-purple-300 animate-pulse">
                  Dice in flight...
                </span>
              )}
            </div>

            <div className="relative z-[2] flex-1 overflow-y-auto px-4 py-3 space-y-2.5 custom-scrollbar">
              {messages.length === 0 && (
                <div className="text-xs font-mono text-neutral-500 border border-dashed border-white/10 rounded-2xl p-4 bg-black/20">
                  The tactical grid is quiet. Execute an action to hurl d20s across the board.
                </div>
              )}

              {messages.map((message) => {
                const isGm = message.sender === 'GM';
                const isSelf = message.sender === currentPlayer.user_name;
                return (
                  <div
                    key={message.id}
                    className={`max-w-2xl rounded-2xl border px-3.5 py-2.5 backdrop-blur-md ${
                      isGm
                        ? 'border-purple-500/30 bg-purple-950/30'
                        : isSelf
                          ? 'border-white/15 bg-neutral-900/70 ml-auto'
                          : 'border-white/10 bg-black/35'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <span
                        className={`text-[10px] font-mono uppercase tracking-widest ${
                          isGm ? 'text-purple-300' : 'text-neutral-400'
                        }`}
                      >
                        {message.sender}
                      </span>
                      <span className="text-[10px] font-mono text-neutral-600">
                        {new Date(message.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm text-neutral-100 whitespace-pre-wrap leading-relaxed">
                      {message.content}
                    </p>
                  </div>
                );
              })}
              <div ref={terminalEndRef} />
            </div>

            <form
              className="relative z-[2] border-t border-white/10 p-3 sm:p-4 bg-black/40 space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                void handleExecuteAction();
              }}
            >
              <textarea
                value={inputMessage}
                onChange={(event) => setInputMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void handleExecuteAction();
                  }
                }}
                rows={2}
                placeholder="Declare your action — dice will erupt from your board card..."
                className="w-full resize-none bg-neutral-950/80 border border-white/10 focus:border-purple-500 rounded-2xl px-4 py-3 text-sm text-neutral-100 focus:outline-none transition-all"
                disabled={isGMLoading}
              />
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-mono text-neutral-600 uppercase tracking-wider">
                  Enter to throw · Shift+Enter newline
                </p>
                <button
                  type="submit"
                  disabled={!inputMessage.trim() || isGMLoading}
                  className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-40 text-white font-bold uppercase tracking-wider text-xs px-5 py-2.5 rounded-xl transition-all border border-purple-400/30 shadow-[0_0_24px_rgba(168,85,247,0.35)]"
                >
                  {isGMLoading ? 'Resolving...' : 'Execute & Throw'}
                </button>
              </div>
            </form>
          </div>
        </section>

        {/* Right Flank Combatants */}
        <section className="col-span-12 sm:col-span-2 flex sm:flex-col justify-center gap-3 z-10 order-3 overflow-x-auto sm:overflow-y-auto custom-scrollbar">
          {rightParty.length === 0 ? (
            <div className="hidden sm:block text-[10px] font-mono uppercase tracking-widest text-neutral-600 border border-dashed border-white/10 rounded-2xl p-4 text-center">
              Right flank open
            </div>
          ) : (
            rightParty.map((player) => (
              <div key={player.id} data-player-anchor={player.user_name}>
                <PlayerBoardCard player={player} onMount={recordPosition} />
              </div>
            ))
          )}
        </section>
      </main>

      {/* Arsenal tray retained for equipment art */}
      <aside
        className={`fixed top-[61px] right-0 bottom-0 w-full sm:w-[360px] z-50 transform transition-transform duration-500 ease-out border-l border-white/10 bg-neutral-950/90 backdrop-blur-2xl ${
          isTrayOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="h-full overflow-y-auto custom-scrollbar p-5 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                Character Arsenal
              </p>
              <h2 className="font-display text-lg font-black tracking-wide text-neutral-50">
                {currentPlayer.user_name}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setIsTrayOpen(false)}
              className="text-[10px] font-mono uppercase tracking-widest px-3 py-2 rounded-xl border border-white/10 text-neutral-400 hover:text-white"
            >
              Close
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {inventorySlots.map((slot) => (
              <div
                key={slot.id}
                className="inventory-socket aspect-square rounded-2xl border border-white/10 bg-black/50 flex items-center justify-center p-4 transition-all duration-300 hover:border-purple-400/70 hover:shadow-[0_0_30px_rgba(168,85,247,0.45)]"
                title={slot.label}
                aria-label={slot.label}
              >
                <Image
                  src={slot.src}
                  alt=""
                  width={72}
                  height={72}
                  unoptimized
                  className="inventory-glyph w-full h-full object-contain opacity-30 transition-all duration-300"
                />
              </div>
            ))}
          </div>
        </div>
      </aside>

      {isTrayOpen && (
        <button
          type="button"
          aria-label="Close arsenal tray"
          className="fixed inset-0 top-[61px] bg-black/35 z-40"
          onClick={() => setIsTrayOpen(false)}
        />
      )}
    </div>
  );
}
