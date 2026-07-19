'use client';

import React, { useEffect, useRef, useState } from 'react';
import CharacterSetup from '@/components/CharacterSetup';
import { getSupabaseBrowserClient } from '@/lib/supabase';
import type {
  AbilityScores,
  CharacterPayload,
  GameRecord,
  PlayerEntity,
  ThreadMessage,
} from '@/types/database';

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
        <div className="max-w-md w-full border border-red-900/60 bg-neutral-900/80 rounded-2xl p-6 space-y-3">
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
      <div className="min-h-screen bg-neutral-950 text-neutral-400 flex items-center justify-center font-mono text-xs uppercase tracking-widest">
        Calibrating System Time...
      </div>
    );
  }

  if (!currentPlayer) {
    return <CharacterSetup onFinish={handleCharacterDone} />;
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col lg:flex-row">
      <aside className="w-full lg:w-72 border-b lg:border-b-0 lg:border-r border-neutral-800 bg-neutral-950/90 p-4 space-y-4">
        <div className="space-y-1">
          <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">
            Session Code
          </p>
          <h1 className="font-display text-xl font-black tracking-[0.3em] text-purple-300">
            {sessionCode}
          </h1>
          <p className="text-[10px] font-mono text-neutral-600 uppercase tracking-wider">
            Playing as {currentPlayer.user_name} · {currentPlayer.avatar_class}
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">
            Party Ledger
          </p>
          {players.length === 0 ? (
            <p className="text-xs text-neutral-600 font-mono">No adventurers manifested yet.</p>
          ) : (
            players.map((player) => (
              <div
                key={player.id}
                className={`rounded-xl border px-3 py-3 space-y-1 ${
                  player.id === currentPlayer.id
                    ? 'border-purple-500/50 bg-purple-950/20'
                    : 'border-neutral-800 bg-neutral-900/40'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-neutral-200">
                    {player.user_name}
                  </span>
                  <span className="text-[10px] font-mono text-neutral-500 uppercase">
                    {player.avatar_class}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono text-neutral-400">
                  <span>
                    HP {player.current_hp}/{player.max_hp}
                  </span>
                  <span>
                    STR {player.stats.STR} · DEX {player.stats.DEX} · CHA {player.stats.CHA}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-3">
          <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-2">
            Current Narrative
          </p>
          <p className="text-xs text-neutral-300 leading-relaxed whitespace-pre-wrap">
            {game.current_narrative}
          </p>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-h-[70vh] lg:min-h-screen">
        <header className="border-b border-neutral-800 px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <p className="font-display text-sm font-black uppercase tracking-widest text-neutral-200">
              Voidline Terminal
            </p>
            <p className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider">
              Unfiltered live dialogue · Aden / Edward / Jamie
            </p>
          </div>
          {isGMLoading && (
            <span className="text-[10px] font-mono uppercase tracking-widest text-purple-400 animate-pulse">
              GM weaving chaos...
            </span>
          )}
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-xs font-mono text-neutral-600 border border-dashed border-neutral-800 rounded-xl p-4">
              The table is quiet. Drop an unhinged action below and wake the GM.
            </div>
          )}

          {messages.map((message) => {
            const isGm = message.sender === 'GM';
            const isSelf = message.sender === currentPlayer.user_name;
            return (
              <div
                key={message.id}
                className={`max-w-3xl rounded-xl border px-4 py-3 ${
                  isGm
                    ? 'border-purple-900/50 bg-purple-950/20'
                    : isSelf
                      ? 'border-neutral-700 bg-neutral-900/70 ml-auto'
                      : 'border-neutral-800 bg-neutral-900/40'
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
                <p className="text-sm text-neutral-200 whitespace-pre-wrap leading-relaxed">
                  {message.content}
                </p>
              </div>
            );
          })}

          {isGMLoading && (
            <div className="max-w-3xl rounded-xl border border-purple-900/40 bg-purple-950/10 px-4 py-3 text-xs font-mono text-purple-300/80 animate-pulse">
              Reality engine chewing on your nonsense...
            </div>
          )}
          <div ref={terminalEndRef} />
        </div>

        <form
          className="border-t border-neutral-800 p-4 space-y-2 bg-neutral-950/95"
          onSubmit={(event) => {
            event.preventDefault();
            void handleExecuteAction();
          }}
        >
          <label htmlFor="action-input" className="sr-only">
            Action input
          </label>
          <textarea
            id="action-input"
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
            className="w-full resize-none bg-neutral-900 border border-neutral-800 focus:border-purple-500 rounded-xl px-4 py-3 text-sm text-neutral-100 focus:outline-none transition-all"
            disabled={isGMLoading}
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-mono text-neutral-600 uppercase tracking-wider">
              Enter to send · Shift+Enter for newline
            </p>
            <button
              type="submit"
              disabled={!inputMessage.trim() || isGMLoading}
              className="bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-neutral-50 font-bold uppercase tracking-wider text-xs px-5 py-3 rounded-xl transition-all border border-purple-500/20"
            >
              {isGMLoading ? 'Resolving...' : 'Execute Action'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
