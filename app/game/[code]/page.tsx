'use client';

import React, { useEffect, useRef, useState } from 'react';
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
  background:
    'https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?auto=format&fit=crop&w=2400&q=80',
  avatar:
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
  const terminalEndRef = useRef<HTMLDivElement | null>(null);

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
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [game]);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGMLoading]);

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
        BOOTING AA HYPERVISOR...
      </div>
    );
  }

  if (!currentPlayer) {
    return <CharacterSetup onFinish={handleCharacterDone} />;
  }

  const hpRatio = Math.max(0, Math.min(1, currentPlayer.current_hp / currentPlayer.max_hp));

  return (
    <div className="min-h-screen text-neutral-100 flex flex-col overflow-hidden antialiased select-none relative bg-neutral-950">
      {/* AA/AAA Panoramic Environmental Cinematic Backdrop Graphic */}
      <div
        className="absolute inset-0 bg-cover bg-center -z-20 opacity-40 ken-burns"
        style={{ backgroundImage: `url(${assetLibrary.background})` }}
        aria-hidden
      />
      <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/40 to-transparent -z-10" />
      <div className="absolute inset-0 bg-gradient-to-b from-neutral-950/90 via-neutral-950/70 to-neutral-950 -z-10" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-purple-900/10 via-transparent to-black/80 -z-10" />

      {/* Main Glass Header Control Desk Panel */}
      <header className="border-b border-white/10 bg-neutral-950/60 backdrop-blur-2xl px-4 sm:px-6 py-4 flex justify-between items-center shadow-[0_10px_50px_rgba(0,0,0,0.9)] z-20 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-2.5 h-2.5 rounded-full bg-purple-500 shadow-[0_0_15px_#a855f7] animate-pulse shrink-0" />
          <h1 className="text-sm font-black tracking-widest uppercase bg-gradient-to-r from-purple-400 via-pink-400 to-red-500 bg-clip-text text-transparent filter drop-shadow-[0_2px_10px_rgba(168,85,247,0.5)] truncate font-display">
            Voidline Console OS
          </h1>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <div className="hidden sm:flex bg-black/60 border border-white/5 px-4 py-1.5 rounded-xl items-center gap-2 shadow-inner">
            <span className="text-[10px] uppercase font-mono tracking-widest text-neutral-500">
              Session Registry:
            </span>
            <span className="font-mono text-sm text-purple-400 font-black tracking-widest">
              {sessionCode}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsTrayOpen((open) => !open)}
            className={`px-4 sm:px-5 py-2.5 text-xs font-mono font-bold tracking-widest uppercase rounded-xl border transition-all duration-300 transform active:scale-95 shadow-lg ${
              isTrayOpen
                ? 'bg-gradient-to-r from-purple-600 to-pink-600 border-purple-400 text-white shadow-[0_0_25px_rgba(168,85,247,0.5)]'
                : 'bg-neutral-900/80 border-white/10 text-neutral-300 hover:border-purple-500/50 hover:bg-neutral-800'
            }`}
          >
            Character Arsenal
          </button>
        </div>
      </header>

      {/* Main Structural Matrix Grid Workspace */}
      <main className="flex-1 grid grid-cols-12 gap-4 lg:gap-6 p-4 lg:p-6 h-[calc(100vh-73px)] relative overflow-hidden">
        {/* Left Hand HUD Column: Party Cards */}
        <section className="col-span-12 lg:col-span-3 flex flex-col gap-4 overflow-y-auto pr-1 custom-scrollbar z-10 max-h-[28vh] lg:max-h-none order-2 lg:order-1">
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 px-1">
            Lobby Manifest
          </h2>
          {players.map((player) => {
            const ratio = Math.max(0, Math.min(1, player.current_hp / player.max_hp));
            return (
              <div
                key={player.id}
                className="bg-neutral-900/50 border border-white/10 rounded-2xl p-4 shadow-2xl backdrop-blur-xl relative group overflow-hidden transition-all duration-300 hover:border-purple-500/40"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/0 via-transparent to-pink-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="flex items-center gap-3 mb-3 relative">
                  <div className="w-10 h-10 rounded-xl overflow-hidden border border-white/10 shadow-xl shrink-0 relative">
                    <Image
                      src={assetLibrary.avatar}
                      alt=""
                      fill
                      sizes="40px"
                      className="object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                    />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-black text-sm text-neutral-100 tracking-wide truncate">
                      {player.user_name}
                    </h3>
                    <span className="text-[9px] px-2 py-0.5 rounded-md bg-black/60 border border-white/5 font-mono uppercase text-purple-300 tracking-wider inline-block mt-0.5">
                      {player.avatar_class}
                    </span>
                  </div>
                </div>
                <div className="space-y-2 relative">
                  <div className="flex justify-between text-[10px] font-mono uppercase tracking-wider text-neutral-400">
                    <span>
                      {player.current_hp}/{player.max_hp} HP
                    </span>
                    <span>CHA {player.stats.CHA}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-black/70 overflow-hidden border border-white/5">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-red-600 via-pink-500 to-purple-500 shadow-[0_0_12px_rgba(236,72,153,0.6)] transition-all"
                      style={{ width: `${ratio * 100}%` }}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-[9px] font-mono text-neutral-500 uppercase tracking-wider">
                    <span>STR {player.stats.STR}</span>
                    <span>DEX {player.stats.DEX}</span>
                    <span>CON {player.stats.CON}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </section>

        {/* Center / Game Narrative Log Terminal Deck */}
        <section className="col-span-12 lg:col-span-6 flex flex-col min-h-0 z-10 order-1 lg:order-2 h-[52vh] lg:h-auto">
          <div className="flex-1 relative rounded-3xl border border-white/10 bg-neutral-950/40 backdrop-blur-2xl shadow-[0_30px_80px_rgba(0,0,0,0.75)] overflow-hidden flex flex-col">
            <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/40 to-transparent pointer-events-none z-[1]" />
            <div className="relative z-[2] border-b border-white/5 px-5 py-3 flex items-center justify-between bg-black/30">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                  Narrative Continuum
                </p>
                <p className="text-xs text-neutral-300 font-display tracking-wide">
                  Live table feed · Aden / Edward / Jamie
                </p>
              </div>
              {isGMLoading && (
                <span className="text-[10px] font-mono uppercase tracking-widest text-purple-300 animate-pulse">
                  GM weaving chaos...
                </span>
              )}
            </div>

            <div className="relative z-[2] flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-3 custom-scrollbar">
              {messages.length === 0 && (
                <div className="text-xs font-mono text-neutral-500 border border-dashed border-white/10 rounded-2xl p-4 bg-black/20">
                  The dungeon holds its breath. Declare an unhinged action below.
                </div>
              )}

              {messages.map((message) => {
                const isGm = message.sender === 'GM';
                const isSelf = message.sender === currentPlayer.user_name;
                return (
                  <div
                    key={message.id}
                    className={`max-w-2xl rounded-2xl border px-4 py-3 backdrop-blur-md ${
                      isGm
                        ? 'border-purple-500/30 bg-purple-950/30 shadow-[0_0_30px_rgba(168,85,247,0.12)]'
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

              {isGMLoading && (
                <div className="max-w-2xl rounded-2xl border border-purple-500/20 bg-purple-950/20 px-4 py-3 text-xs font-mono text-purple-200/80 animate-pulse">
                  Reality engine chewing on your nonsense...
                </div>
              )}
              <div ref={terminalEndRef} />
            </div>

            <form
              className="relative z-[2] border-t border-white/10 p-4 bg-black/40 space-y-2"
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
                rows={3}
                placeholder="Declare your action, insult the gods, roll chaos into the void..."
                className="w-full resize-none bg-neutral-950/80 border border-white/10 focus:border-purple-500 rounded-2xl px-4 py-3 text-sm text-neutral-100 focus:outline-none transition-all shadow-inner"
                disabled={isGMLoading}
              />
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-mono text-neutral-600 uppercase tracking-wider">
                  Enter to send · Shift+Enter for newline
                </p>
                <button
                  type="submit"
                  disabled={!inputMessage.trim() || isGMLoading}
                  className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-40 text-white font-bold uppercase tracking-wider text-xs px-5 py-3 rounded-xl transition-all border border-purple-400/30 shadow-[0_0_24px_rgba(168,85,247,0.35)]"
                >
                  {isGMLoading ? 'Resolving...' : 'Execute Action'}
                </button>
              </div>
            </form>
          </div>
        </section>

        {/* Right Column: persistent summary + mobile-friendly arsenal peek */}
        <section className="hidden lg:flex col-span-3 flex-col gap-4 z-10 order-3">
          <div className="rounded-3xl border border-white/10 bg-neutral-900/40 backdrop-blur-2xl p-5 shadow-2xl space-y-4">
            <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">
              Active Operative
            </p>
            <div className="flex items-center gap-4">
              <div className="portrait-ring shrink-0">
                <div className="portrait-ring-spin" aria-hidden />
                <div className="portrait-ring-core">
                  <Image
                    src={assetLibrary.avatar}
                    alt={`${currentPlayer.user_name} portrait`}
                    fill
                    sizes="72px"
                    className="object-cover"
                  />
                </div>
              </div>
              <div className="min-w-0">
                <h3 className="font-display font-black text-neutral-50 tracking-wide truncate">
                  {currentPlayer.user_name}
                </h3>
                <p className="text-[10px] font-mono uppercase tracking-widest text-purple-300">
                  {currentPlayer.avatar_class}
                </p>
                <p className="text-[10px] font-mono text-neutral-500 mt-1">
                  HP {currentPlayer.current_hp}/{currentPlayer.max_hp}
                </p>
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-black/70 overflow-hidden border border-white/5">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-purple-500 to-pink-500"
                style={{ width: `${hpRatio * 100}%` }}
              />
            </div>
            <p className="text-xs text-neutral-400 leading-relaxed line-clamp-4">
              {game.current_narrative}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-neutral-900/30 backdrop-blur-xl p-4 flex-1">
            <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-3">
              Arsenal Preview
            </p>
            <div className="grid grid-cols-3 gap-3">
              {inventorySlots.map((slot) => (
                <button
                  key={slot.id}
                  type="button"
                  onClick={() => setIsTrayOpen(true)}
                  className="inventory-socket aspect-square rounded-2xl border border-white/10 bg-black/40 flex items-center justify-center p-3 transition-all duration-300 hover:border-purple-400/60 hover:bg-purple-950/30 hover:shadow-[0_0_24px_rgba(168,85,247,0.35)]"
                  aria-label={slot.label}
                  title={slot.label}
                >
                  <Image
                    src={slot.src}
                    alt=""
                    width={64}
                    height={64}
                    unoptimized
                    className="inventory-glyph w-full h-full object-contain opacity-25 transition-all duration-300"
                  />
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Sliding AA/AAA Equipment Paperdoll Arsenal Drawer Panel Tray */}
        <aside
          className={`fixed top-[73px] right-0 bottom-0 w-full sm:w-[380px] z-40 transform transition-transform duration-500 ease-out border-l border-white/10 bg-neutral-950/85 backdrop-blur-2xl shadow-[-30px_0_80px_rgba(0,0,0,0.75)] ${
            isTrayOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="h-full overflow-y-auto custom-scrollbar p-6 space-y-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                  Character Arsenal
                </p>
                <h2 className="font-display text-lg font-black tracking-wide text-neutral-50">
                  Paperdoll Matrix
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsTrayOpen(false)}
                className="text-[10px] font-mono uppercase tracking-widest px-3 py-2 rounded-xl border border-white/10 text-neutral-400 hover:text-white hover:border-purple-400/40 transition-all"
              >
                Close
              </button>
            </div>

            <div className="flex flex-col items-center gap-4 py-2">
              <div className="portrait-ring portrait-ring-lg">
                <div className="portrait-ring-spin" aria-hidden />
                <div className="portrait-ring-core">
                  <Image
                    src={assetLibrary.avatar}
                    alt={`${currentPlayer.user_name} hero portrait`}
                    fill
                    sizes="148px"
                    priority
                    className="object-cover"
                  />
                </div>
              </div>
              <div className="text-center">
                <h3 className="font-display text-xl font-black text-neutral-50 tracking-wide">
                  {currentPlayer.user_name}
                </h3>
                <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-purple-300 mt-1">
                  {currentPlayer.avatar_class}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-mono uppercase tracking-wider text-neutral-400 border border-white/10 rounded-2xl p-3 bg-black/30">
              {(
                Object.entries(currentPlayer.stats) as Array<[keyof AbilityScores, number]>
              ).map(([stat, value]) => (
                <div key={stat} className="py-1">
                  <div className="text-neutral-500">{stat}</div>
                  <div className="text-neutral-100 font-black text-sm">{value}</div>
                </div>
              ))}
            </div>

            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-3">
                Equipment Grid
              </p>
              <div className="grid grid-cols-3 gap-3">
                {inventorySlots.map((slot) => (
                  <div
                    key={slot.id}
                    className="inventory-socket aspect-square rounded-2xl border border-white/10 bg-gradient-to-b from-neutral-900/80 to-black/70 flex items-center justify-center p-4 transition-all duration-300 hover:border-purple-400/70 hover:shadow-[0_0_30px_rgba(168,85,247,0.45)] hover:bg-purple-950/40"
                    title={slot.label}
                    aria-label={slot.label}
                  >
                    <Image
                      src={slot.src}
                      alt=""
                      width={80}
                      height={80}
                      unoptimized
                      className="inventory-glyph w-full h-full object-contain opacity-30 transition-all duration-300"
                    />
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[10px] font-mono text-neutral-600 uppercase tracking-wider text-center">
                Hover sockets to ignite relic chroma
              </p>
            </div>
          </div>
        </aside>

        {isTrayOpen && (
          <button
            type="button"
            aria-label="Close arsenal tray"
            className="fixed inset-0 top-[73px] bg-black/40 z-30 lg:bg-black/20"
            onClick={() => setIsTrayOpen(false)}
          />
        )}
      </main>
    </div>
  );
}
