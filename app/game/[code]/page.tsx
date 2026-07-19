'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import type { RealtimeChannel } from '@supabase/supabase-js';
import CharacterSetup, { type ForgeJoinPayload } from '@/components/CharacterSetup';
import TokenPiece from '@/components/tabletop/TokenPiece';
import {
  BOARD_TEXTURE,
  GM_PORTRAIT,
  INVENTORY_SLOTS,
  MAP_SCENE,
  portraitForPlayer,
} from '@/lib/game-art';
import { compactSheetForGm, sheetSnapshot, type CharacterSheet } from '@/lib/character-sheet';
import {
  createOptimisticMessage,
  isUniqueViolation,
  mergeMessageLedger,
  mergePlayerLedger,
  normalizeGame,
  normalizeMessage,
  normalizePlayer,
  safeHp,
  safeStat,
} from '@/lib/game-guards';
import {
  readCachedPlayerSeat,
  writeCachedPlayerSeat,
  type CachedPlayerSeat,
} from '@/lib/player-session';
import {
  getSupabaseBrowserClient,
  mapChannelStatus,
  safeRemoveChannel,
  type ChannelHealth,
} from '@/lib/supabase';
import type {
  AbilityScores,
  GameRecord,
  PlayerEntity,
  ThreadMessage,
} from '@/types/database';

const HEARTBEAT_MS = 12_000;

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

export default function GameRoom({ params }: { params: { code: string } }) {
  const sessionCode = String(params?.code ?? '').toUpperCase();
  const [game, setGame] = useState<GameRecord | null>(null);
  const [players, setPlayers] = useState<PlayerEntity[]>([]);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState<PlayerEntity | null>(null);
  const [inputMessage, setInputMessage] = useState('');
  const [isGMLoading, setIsGMLoading] = useState(false);
  const [isTrayOpen, setIsTrayOpen] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [channelHealth, setChannelHealth] = useState<ChannelHealth>('connecting');
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [activeSheet, setActiveSheet] = useState<CharacterSheet | null>(null);
  const [sheetTab, setSheetTab] = useState<'stats' | 'soul' | 'gear'>('stats');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const terminalEndRef = useRef<HTMLDivElement | null>(null);
  const diceParticlesRef = useRef<DiceParticle[]>([]);
  const playerPositionsRef = useRef<Record<string, { x: number; y: number }>>({});
  const currentPlayerNameRef = useRef<string | null>(null);
  const gameIdRef = useRef<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const reconnectLockRef = useRef(false);

  useEffect(() => {
    currentPlayerNameRef.current = currentPlayer?.user_name ?? null;
  }, [currentPlayer]);

  useEffect(() => {
    gameIdRef.current = game?.id ?? null;
  }, [game]);

  const adoptPlayerSeat = useCallback(
    (player: PlayerEntity, session: string) => {
      const hardened = normalizePlayer(player as unknown as Record<string, unknown>) ?? player;
      setCurrentPlayer(hardened);
      setPlayers((prev) => mergePlayerLedger(prev, hardened));
      writeCachedPlayerSeat({
        gameId: hardened.game_id,
        sessionCode: session,
        playerId: hardened.id,
        userName: hardened.user_name,
        avatarClass: hardened.avatar_class,
        stats: hardened.stats,
        savedAt: new Date().toISOString(),
      });
    },
    []
  );

  const triggerDiceFromUser = useCallback((senderName: string) => {
    if (typeof window === 'undefined') return;
    if (!senderName || senderName === 'GM') return;

    const fallbackX =
      typeof window.innerWidth === 'number' ? window.innerWidth / 2 : 200;
    const fallbackY =
      typeof window.innerHeight === 'number' ? window.innerHeight - 220 : 400;

    const origin = playerPositionsRef.current[senderName] || {
      x: fallbackX,
      y: fallbackY,
    };

    for (let i = 0; i < 5; i++) {
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

  const refreshRoomState = useCallback(async (gameId: string) => {
    try {
      const supabase = getSupabaseBrowserClient();

      const [{ data: gameRow }, { data: playerList }, { data: msgList }] = await Promise.all([
        supabase.from('games').select('*').eq('id', gameId).maybeSingle(),
        supabase.from('players').select('*').eq('game_id', gameId),
        supabase
          .from('messages')
          .select('*')
          .eq('game_id', gameId)
          .order('created_at', { ascending: true }),
      ]);

      const nextGame = normalizeGame(gameRow as Record<string, unknown> | null);
      if (nextGame) {
        setGame(nextGame);
      }

      const nextPlayers = (playerList ?? [])
        .map((row) => normalizePlayer(row as Record<string, unknown>))
        .filter((row): row is PlayerEntity => row !== null);
      setPlayers(nextPlayers);

      const nextMessages = (msgList ?? [])
        .map((row) => normalizeMessage(row as Record<string, unknown>))
        .filter((row): row is ThreadMessage => row !== null);
      setMessages(nextMessages);

      const cached = readCachedPlayerSeat(sessionCode);
      if (cached) {
        const restored =
          nextPlayers.find((player) => player.id === cached.playerId) ||
          nextPlayers.find(
            (player) => player.user_name.toLowerCase() === cached.userName.toLowerCase()
          );
        if (restored) {
          adoptPlayerSeat(restored, sessionCode);
        }
      }

      setSyncNotice(null);
    } catch (error) {
      console.error('Room refresh failure:', error);
      setSyncNotice('Sync degraded — retrying heartbeat…');
    }
  }, [adoptPlayerSeat, sessionCode]);

  const attachRealtimeChannel = useCallback(
    async (gameId: string) => {
      const supabase = getSupabaseBrowserClient();
      await safeRemoveChannel(supabase, channelRef.current);
      channelRef.current = null;
      setChannelHealth('connecting');

      const channel = supabase
        .channel(`vtt-lobby-${gameId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'players',
            filter: `game_id=eq.${gameId}`,
          },
          (payload) => {
            const incoming = normalizePlayer(payload.new as Record<string, unknown>);
            if (!incoming || incoming.game_id !== gameId) return;
            setPlayers((prev) => mergePlayerLedger(prev, incoming));
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'players',
            filter: `game_id=eq.${gameId}`,
          },
          (payload) => {
            const incoming = normalizePlayer(payload.new as Record<string, unknown>);
            if (!incoming || incoming.game_id !== gameId) return;
            setPlayers((prev) => mergePlayerLedger(prev, incoming));
            setCurrentPlayer((prev) =>
              prev && prev.id === incoming.id ? incoming : prev
            );
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'games',
            filter: `id=eq.${gameId}`,
          },
          (payload) => {
            const incoming = normalizeGame(payload.new as Record<string, unknown>);
            if (!incoming || incoming.id !== gameId) return;
            setGame(incoming);
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `game_id=eq.${gameId}`,
          },
          (payload) => {
            const incoming = normalizeMessage(payload.new as Record<string, unknown>);
            if (!incoming || incoming.game_id !== gameId) return;
            setMessages((prev) => mergeMessageLedger(prev, incoming));

            if (
              incoming.sender !== 'GM' &&
              incoming.sender !== currentPlayerNameRef.current
            ) {
              triggerDiceFromUser(incoming.sender);
            }
          }
        )
        .subscribe((status) => {
          const health = mapChannelStatus(status);
          setChannelHealth(health);
          if (health === 'joined') {
            setSyncNotice(null);
          }
          if (health === 'degraded' || health === 'closed') {
            setSyncNotice('Realtime socket interrupted — auto-repair engaged');
          }
        });

      channelRef.current = channel;
    },
    [triggerDiceFromUser]
  );

  useEffect(() => {
    if (!sessionCode || sessionCode.length !== 6) {
      setBootError('Invalid session code. Return to the entryway and launch a valid lobby.');
      return;
    }

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
            if (isUniqueViolation(insertError)) {
              const retry = await supabase
                .from('games')
                .select('*')
                .eq('session_code', sessionCode)
                .maybeSingle();
              if (retry.error) throw retry.error;
              gameData = retry.data;
            } else {
              throw insertError;
            }
          } else {
            gameData = newGame;
          }
        }

        if (cancelled) return;

        const typedGame = normalizeGame(gameData as Record<string, unknown>);
        if (!typedGame) {
          throw new Error('Lobby payload failed structural validation.');
        }

        setGame(typedGame);
        await refreshRoomState(typedGame.id);
        if (!cancelled) {
          await attachRealtimeChannel(typedGame.id);
        }
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

    void fetchGameContext();

    return () => {
      cancelled = true;
      const client = (() => {
        try {
          return getSupabaseBrowserClient();
        } catch {
          return null;
        }
      })();
      if (client) {
        void safeRemoveChannel(client, channelRef.current);
      }
      channelRef.current = null;
    };
  }, [attachRealtimeChannel, refreshRoomState, sessionCode]);

  // Heartbeat: auto-reconnect + re-fetch latest room state without hard refresh
  useEffect(() => {
    if (!game?.id) return;

    const pulse = async (force = false) => {
      if (reconnectLockRef.current) return;

      const health = channelHealth;
      const needsRepair = health === 'degraded' || health === 'closed';
      if (!force && !needsRepair) {
        return;
      }

      reconnectLockRef.current = true;
      try {
        setSyncNotice('Reconnecting simulation sockets…');
        await attachRealtimeChannel(game.id);
        await refreshRoomState(game.id);
      } catch (error) {
        console.error('Heartbeat repair failure:', error);
        setSyncNotice('Heartbeat repair delayed — retrying…');
      } finally {
        reconnectLockRef.current = false;
      }
    };

    const intervalId = window.setInterval(() => {
      void pulse();
    }, HEARTBEAT_MS);

    const onOnline = () => {
      void pulse(true);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void pulse(true);
        void refreshRoomState(game.id);
      }
    };

    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [attachRealtimeChannel, channelHealth, game?.id, refreshRoomState]);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGMLoading]);

  // Canvas particle engine with mobile viewport guards
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    let active = true;

    const readViewportSize = () => {
      const visualViewport = window.visualViewport;
      const width =
        visualViewport?.width ||
        window.innerWidth ||
        document.documentElement?.clientWidth ||
        320;
      const height =
        visualViewport?.height ||
        window.innerHeight ||
        document.documentElement?.clientHeight ||
        568;
      return {
        width: Math.max(1, Math.floor(width)),
        height: Math.max(1, Math.floor(height)),
      };
    };

    const resizeCanvas = () => {
      if (!canvasRef.current) return;
      const { width, height } = readViewportSize();
      canvasRef.current.width = width;
      canvasRef.current.height = height;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    window.visualViewport?.addEventListener('resize', resizeCanvas);
    window.visualViewport?.addEventListener('scroll', resizeCanvas);

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
      gradient.addColorStop(0, 'rgba(180, 83, 9, 0.95)');
      gradient.addColorStop(0.45, 'rgba(40, 24, 16, 0.96)');
      gradient.addColorStop(1, 'rgba(159, 18, 57, 0.75)');
      c.fillStyle = gradient;
      c.fill();
      c.strokeStyle = '#e8d5a8';
      c.lineWidth = 2;
      c.stroke();

      c.beginPath();
      for (let i = 0; i < 6; i += 2) {
        const angle = (i * Math.PI) / 3 - Math.PI / 6;
        c.moveTo(0, 0);
        c.lineTo(Math.cos(angle) * size, Math.sin(angle) * size);
      }
      c.strokeStyle = 'rgba(245, 158, 11, 0.8)';
      c.lineWidth = 1;
      c.stroke();

      c.rotate(-rot);
      c.fillStyle = '#fdf6e3';
      c.font = `bold ${Math.max(10, size * 0.7)}px "IBM Plex Mono", monospace`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(String(value), 0, 1);
      c.restore();
    };

    const updateEngine = () => {
      if (!active || !canvasRef.current) return;
      const surface = canvasRef.current;
      const surfaceCtx = surface.getContext('2d');
      if (!surfaceCtx) return;

      surfaceCtx.clearRect(0, 0, surface.width, surface.height);
      const activeParticles = diceParticlesRef.current;

      for (let i = activeParticles.length - 1; i >= 0; i--) {
        const particle = activeParticles[i];
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.rotation += particle.vRot;
        particle.vy += 0.2;
        particle.alpha -= 0.01;

        surfaceCtx.globalAlpha = Math.max(0, particle.alpha);
        drawD20(
          surfaceCtx,
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

      surfaceCtx.globalAlpha = 1;
      animId = window.requestAnimationFrame(updateEngine);
    };

    animId = window.requestAnimationFrame(updateEngine);

    return () => {
      active = false;
      window.removeEventListener('resize', resizeCanvas);
      window.visualViewport?.removeEventListener('resize', resizeCanvas);
      window.visualViewport?.removeEventListener('scroll', resizeCanvas);
      window.cancelAnimationFrame(animId);
    };
  }, []);

  const resolveExistingSeat = useCallback(
    async (
      gameId: string,
      userName: string,
      cached?: CachedPlayerSeat | null
    ): Promise<PlayerEntity | null> => {
      const supabase = getSupabaseBrowserClient();

      if (cached?.playerId) {
        const byId = await supabase
          .from('players')
          .select('*')
          .eq('id', cached.playerId)
          .eq('game_id', gameId)
          .maybeSingle();
        const normalizedById = normalizePlayer(byId.data as Record<string, unknown> | null);
        if (normalizedById) return normalizedById;
      }

      const byName = await supabase
        .from('players')
        .select('*')
        .eq('game_id', gameId)
        .eq('user_name', userName)
        .maybeSingle();

      return normalizePlayer(byName.data as Record<string, unknown> | null);
    },
    []
  );

  const handleCharacterDone = async (payload: ForgeJoinPayload) => {
    if (!game?.id || joining) return;
    setJoining(true);
    setBootError(null);

    const { sheet, characterId } = payload;
    setActiveSheet(sheet);

    try {
      const supabase = getSupabaseBrowserClient();

      // Block duplicate character seed at the same table
      const { data: seatedSame } = await supabase
        .from('players')
        .select('*')
        .eq('game_id', game.id)
        .eq('character_id', characterId)
        .maybeSingle();

      if (seatedSame) {
        const existing = normalizePlayer(seatedSame as Record<string, unknown>);
        if (existing) {
          adoptPlayerSeat(existing, sessionCode);
          setSyncNotice('This legend is already seated at this table — reclaiming your seat.');
          return;
        }
      }

      const cached = readCachedPlayerSeat(sessionCode);
      const existingByName = await resolveExistingSeat(game.id, sheet.name, cached);
      if (existingByName) {
        adoptPlayerSeat(existingByName, sessionCode);
        return;
      }

      const snapshot = sheetSnapshot(sheet);
      const { data, error } = await supabase
        .from('players')
        .insert([
          {
            game_id: game.id,
            user_name: sheet.name,
            avatar_class: sheet.className,
            stats: sheet.stats,
            current_hp: sheet.maxHp,
            max_hp: sheet.maxHp,
            character_id: characterId,
            seed: sheet.seed,
            sheet_snapshot: snapshot,
          },
        ])
        .select()
        .single();

      if (error) {
        if (isUniqueViolation(error)) {
          const raced = await resolveExistingSeat(game.id, sheet.name, cached);
          if (raced) {
            adoptPlayerSeat(raced, sessionCode);
            return;
          }
          setBootError('That character or name is already at this table.');
          return;
        }
        throw error;
      }

      const created = normalizePlayer(data as Record<string, unknown>);
      if (!created) {
        throw new Error('Player seat creation returned an invalid payload.');
      }

      adoptPlayerSeat(created, sessionCode);
    } catch (error) {
      console.error('Character manifestation error:', error);
      const fallbackSeat: PlayerEntity = {
        id: `local-${Date.now()}`,
        game_id: game.id,
        user_name: sheet.name,
        avatar_class: sheet.className,
        stats: sheet.stats,
        current_hp: sheet.maxHp,
        max_hp: sheet.maxHp,
        created_at: new Date().toISOString(),
        character_id: characterId,
        seed: sheet.seed,
        sheet_snapshot: sheetSnapshot(sheet),
      };
      adoptPlayerSeat(fallbackSeat, sessionCode);
      setSyncNotice('Seat write failed — local sheet active until sync recovers.');
    } finally {
      setJoining(false);
    }
  };

  const handleExecuteAction = async () => {
    if (!inputMessage.trim() || !currentPlayer?.user_name || !game?.id || isGMLoading) {
      return;
    }

    const userText = inputMessage.trim();
    const senderName = currentPlayer.user_name;
    const activeGameId = game.id;

    setInputMessage('');
    setIsGMLoading(true);
    triggerDiceFromUser(senderName);

    const optimisticPlayerMsg = createOptimisticMessage(activeGameId, senderName, userText);
    setMessages((prev) => mergeMessageLedger(prev, optimisticPlayerMsg));

    try {
      const supabase = getSupabaseBrowserClient();

      try {
        const { error: playerMsgError } = await supabase.from('messages').insert([
          {
            game_id: activeGameId,
            sender: senderName,
            content: userText,
          },
        ]);
        if (playerMsgError) {
          throw playerMsgError;
        }
      } catch (writeError) {
        console.error('Player message persist failure:', writeError);
        setSyncNotice('Action kept locally — DB write delayed.');
      }

      const activeHistory = messages
        .concat(optimisticPlayerMsg)
        .map((message) => ({
          sender: message?.sender ?? 'Unknown',
          content: message?.content ?? '',
        }))
        .filter((message) => message.content.length > 0)
        .slice(-14);

      const partySheets = players.map((player) => {
        const snap = player.sheet_snapshot;
        if (snap?.name) {
          return [
            `${snap.name} | ${snap.race ?? ''} ${snap.className ?? player.avatar_class}`,
            `HP ${player.current_hp}/${player.max_hp} · AC ${snap.armorClass ?? '?'}`,
            `Stats ${JSON.stringify(snap.stats ?? player.stats)}`,
            `Skills: ${(snap.skills ?? []).join(', ') || '—'}`,
            `Backstory: ${(snap.backstory ?? '').slice(0, 220)}`,
          ].join('\n');
        }
        return `${player.user_name} (${player.avatar_class}) HP ${player.current_hp}/${player.max_hp}`;
      });

      let gmReply = 'The simulation warped. Repeat your raw action.';
      try {
        const res = await fetch('/api/gm-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            playerInput: userText,
            sender: senderName,
            gameId: activeGameId,
            history: activeHistory,
            partySheets,
            actorSheet: compactSheetForGm(activeSheet),
          }),
        });

        const data = (await res.json()) as { reply?: string };
        if (typeof data?.reply === 'string' && data.reply.trim()) {
          gmReply = data.reply.trim();
        }
      } catch (apiError) {
        console.error('GM API transport failure:', apiError);
        gmReply = 'The matrix caught fire mid-turn. Spit that chaos at me again.';
      }

      const optimisticGmMsg = createOptimisticMessage(activeGameId, 'GM', gmReply);
      setMessages((prev) => mergeMessageLedger(prev, optimisticGmMsg));
      setGame((prev) =>
        prev
          ? {
              ...prev,
              current_narrative: gmReply,
            }
          : prev
      );

      try {
        const { error: gmMsgError } = await supabase.from('messages').insert([
          {
            game_id: activeGameId,
            sender: 'GM',
            content: gmReply,
          },
        ]);
        if (gmMsgError) {
          throw gmMsgError;
        }
      } catch (gmWriteError) {
        console.error('GM message persist failure:', gmWriteError);
        setSyncNotice('GM reply held locally — persistence retry on heartbeat.');
      }

      try {
        await supabase
          .from('games')
          .update({ current_narrative: gmReply })
          .eq('id', activeGameId);
      } catch (narrativeError) {
        console.error('Narrative persist failure:', narrativeError);
      }
    } finally {
      setIsGMLoading(false);
    }
  };

  const recordPosition = useCallback((name: string, el: HTMLDivElement | null) => {
    if (!el || !name || typeof window === 'undefined') return;
    try {
      const rect = el.getBoundingClientRect();
      playerPositionsRef.current[name] = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    } catch {
      // Ignore measurement failures during transient unmounts.
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const refreshPositions = () => {
      Object.keys(playerPositionsRef.current).forEach((name) => {
        const escaped =
          typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
            ? CSS.escape(name)
            : name.replace(/["\\]/g, '\\$&');
        const nodes = document.querySelectorAll(`[data-player-anchor="${escaped}"]`);
        const el = nodes[0] as HTMLDivElement | undefined;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        playerPositionsRef.current[name] = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
      });
    };

    window.addEventListener('resize', refreshPositions);
    window.visualViewport?.addEventListener('resize', refreshPositions);
    return () => {
      window.removeEventListener('resize', refreshPositions);
      window.visualViewport?.removeEventListener('resize', refreshPositions);
    };
  }, []);

  if (bootError) {
    return (
      <div className="min-h-screen tabletop-shell flex items-center justify-center p-6">
        <div className="parchment-panel max-w-md w-full p-6 space-y-3">
          <h1 className="font-display text-lg font-black tracking-wide text-[#7f1d1d]">
            The Table Rejects This Seal
          </h1>
          <p className="text-sm whitespace-pre-wrap">{bootError}</p>
          <a href="/" className="inline-block font-display text-xs uppercase tracking-widest text-[#b45309]">
            ← Return to the Void Gate
          </a>
        </div>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="min-h-screen tabletop-shell flex items-center justify-center font-display text-sm tracking-[0.35em] uppercase text-[#c4a574] animate-pulse">
        Unfurling the campaign board…
      </div>
    );
  }

  if (!currentPlayer) {
    return <CharacterSetup onFinish={handleCharacterDone} />;
  }

  const activeName = currentPlayer?.user_name ?? '';
  const adjacentPlayers = players.filter(
    (player) => (player?.user_name ?? '') !== activeName
  );
  const leftParty = adjacentPlayers.slice(0, Math.ceil(adjacentPlayers.length / 2));
  const rightParty = adjacentPlayers.slice(Math.ceil(adjacentPlayers.length / 2));
  const activeHp = safeHp(currentPlayer);
  const narrative =
    game?.current_narrative ?? 'The dynamic void initializes. Welcome, degenerates.';
  const selfPortrait = portraitForPlayer(
    currentPlayer?.user_name,
    currentPlayer?.avatar_class
  );

  return (
    <div className="min-h-screen tabletop-shell overflow-hidden antialiased select-none relative text-[#f3e6c8]">
      <canvas ref={canvasRef} className="absolute inset-0 z-50 pointer-events-none" />

      {/* Full-bleed table wood */}
      <div
        className="absolute inset-0 bg-cover bg-center ken-burns opacity-90"
        style={{ backgroundImage: `url(${BOARD_TEXTURE})` }}
        aria-hidden
      />
      <div className="absolute inset-0 bg-[#140e0a]/70" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#140e0a] via-transparent to-[#140e0a]/80" />
      <div className="absolute left-8 top-24 w-40 h-40 torch-glow" />
      <div className="absolute right-10 bottom-40 w-48 h-48 torch-glow" />

      {/* Etched session seal — no SaaS header */}
      <div className="absolute top-4 left-4 z-30 session-seal text-[10px] sm:text-xs">
        SEAL {sessionCode}
      </div>
      <button
        type="button"
        onClick={() => setIsTrayOpen((open) => !open)}
        className="absolute top-3 right-4 z-30 wax-button px-4 py-2 text-[10px] uppercase tracking-[0.25em]"
      >
        Satchel
      </button>

      {syncNotice && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 parchment-panel px-4 py-1.5 text-[11px] max-w-[90vw]">
          {syncNotice}
        </div>
      )}

      <div className="relative z-10 h-screen max-h-screen grid grid-rows-[minmax(0,1.15fr)_minmax(0,0.85fr)] gap-3 p-3 sm:p-5">
        {/* TOKEN MAP */}
        <section className="board-frame relative rounded-sm overflow-hidden min-h-0">
          <div
            className="absolute inset-0 bg-cover bg-center opacity-50"
            style={{ backgroundImage: `url(${MAP_SCENE})` }}
            aria-hidden
          />
          <div className="absolute inset-0 map-grid opacity-80" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/70" />

          {/* DM Screen / GM head of map */}
          <div
            className={`absolute top-3 left-1/2 -translate-x-1/2 z-20 w-[min(92%,28rem)] dm-screen rounded-sm p-3 flex items-center gap-3 animate-float ${
              isGMLoading ? 'gm-breathe' : ''
            }`}
          >
            <div className="relative w-16 h-16 sm:w-20 sm:h-20 shrink-0 overflow-hidden border-2 border-[#c4a574]">
              <Image src={GM_PORTRAIT} alt="Game Master" fill sizes="80px" className="object-cover" priority />
            </div>
            <div className="min-w-0">
              <p className="font-display text-[10px] uppercase tracking-[0.35em] text-[#c4a574]">
                Dungeon Master
              </p>
              <h2 className="font-display text-lg sm:text-xl font-black text-[#f3e6c8]">
                Void Arbiter
              </h2>
              <p className="text-[12px] text-[#d6c4a1] line-clamp-2 italic leading-snug mt-0.5">
                {isGMLoading ? 'The Arbiter leans in… dice rattle in the dark.' : narrative}
              </p>
            </div>
          </div>

          {/* Tokens on the board */}
          <div className="absolute inset-0 z-10 flex items-end sm:items-center justify-between px-2 sm:px-8 pb-6 sm:pb-10 pt-28">
            <div className="flex flex-col gap-4 items-center justify-center min-w-[4.5rem]">
              {leftParty.map((player) => (
                <div key={player.id} data-player-anchor={player.user_name}>
                  <TokenPiece player={player} onMount={recordPosition} size="sm" />
                </div>
              ))}
            </div>

            <div
              className="flex flex-col items-center gap-2"
              data-player-anchor={currentPlayer?.user_name ?? 'self'}
            >
              <TokenPiece
                player={currentPlayer}
                emphasized
                onMount={recordPosition}
                size="lg"
              />
              <p className="font-display text-[10px] uppercase tracking-[0.3em] text-[#f59e0b]">
                Your token
              </p>
            </div>

            <div className="flex flex-col gap-4 items-center justify-center min-w-[4.5rem]">
              {rightParty.map((player) => (
                <div key={player.id} data-player-anchor={player.user_name}>
                  <TokenPiece player={player} onMount={recordPosition} size="sm" />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* PARCHMENT CHRONICLE */}
        <section className="parchment-panel min-h-0 rounded-sm flex flex-col overflow-hidden">
          <div className="px-4 py-2 border-b border-[#8b5e34]/60 flex items-center justify-between">
            <h3 className="font-display text-sm font-bold tracking-wide text-[#2c1810]">
              Campaign Chronicle
            </h3>
            {isGMLoading && (
              <span className="text-[11px] italic text-[#7f1d1d]">Ink still wet…</span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <p className="text-sm italic text-[#5c3a21]">
                The page is blank. Speak an action and the Arbiter will write fate.
              </p>
            )}
            {messages.map((message) => {
              const isGm = message?.sender === 'GM';
              return (
                <div key={`${message.id}-${message.created_at}`} className="ink-line">
                  <p
                    className={`font-display text-[11px] uppercase tracking-[0.2em] ${
                      isGm ? 'text-[#9f1239]' : 'text-[#5c3a21]'
                    }`}
                  >
                    {message?.sender ?? 'Unknown'}
                  </p>
                  <p className="text-[15px] leading-relaxed text-[#2c1810] whitespace-pre-wrap">
                    {message?.content ?? ''}
                  </p>
                </div>
              );
            })}
            <div ref={terminalEndRef} />
          </div>

          <form
            className="border-t border-[#8b5e34]/60 px-4 py-3 space-y-2 bg-[#dfc4a0]/40"
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
              placeholder="Dip the quill — declare your deed…"
              className="quill-input w-full text-[15px] px-1 py-2"
              disabled={isGMLoading}
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] italic text-[#5c3a21]">
                Enter seals the deed · Shift+Enter new line
              </p>
              <button
                type="submit"
                disabled={!inputMessage.trim() || isGMLoading}
                className="wax-button px-5 py-2 text-[11px] uppercase tracking-[0.2em]"
              >
                {isGMLoading ? 'Casting…' : 'Seal & Throw'}
              </button>
            </div>
          </form>
        </section>
      </div>

      {/* Leather satchel / character sheet */}
      <aside
        className={`fixed inset-y-0 right-0 w-full sm:w-[380px] z-[60] transform transition-transform duration-500 ease-out parchment-panel border-l-4 border-[#5c3a21] ${
          isTrayOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="h-full overflow-y-auto custom-scrollbar p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="relative w-16 h-16 rounded-full overflow-hidden token-ring shrink-0">
                <Image src={selfPortrait} alt="" fill sizes="64px" className="object-cover" />
              </div>
              <div>
                <h2 className="font-display text-xl font-black text-[#2c1810]">
                  {activeSheet?.name ?? currentPlayer?.user_name ?? 'Wanderer'}
                </h2>
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#5c3a21]">
                  {activeSheet
                    ? `${activeSheet.race} ${activeSheet.className}`
                    : currentPlayer?.avatar_class ?? 'Adventurer'}
                </p>
                <p className="text-[12px] text-[#7f1d1d] mt-1">
                  HP {activeHp.current}/{activeHp.max}
                  {activeSheet ? ` · AC ${activeSheet.armorClass}` : ''}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsTrayOpen(false)}
              className="font-display text-[10px] uppercase tracking-widest text-[#5c3a21] border border-[#8b5e34] px-3 py-2"
            >
              Close
            </button>
          </div>

          {(activeSheet?.seed || currentPlayer?.seed) && (
            <div className="border border-[#8b5e34] px-3 py-2 bg-[#dfc4a0]/40">
              <p className="font-display text-[10px] uppercase tracking-[0.25em] text-[#5c3a21]">
                Character Seed
              </p>
              <p className="font-mono text-sm tracking-[0.2em] text-[#2c1810]">
                {activeSheet?.seed ?? currentPlayer?.seed}
              </p>
              <p className="text-[11px] italic text-[#5c3a21] mt-1">
                Share this seed to load the same legend at another table.
              </p>
            </div>
          )}

          <div className="flex gap-2">
            {(['stats', 'soul', 'gear'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setSheetTab(tab)}
                className={`flex-1 font-display text-[10px] uppercase tracking-[0.2em] py-2 border ${
                  sheetTab === tab
                    ? 'border-[#9f1239] bg-[#9f1239]/10 text-[#7f1d1d]'
                    : 'border-[#8b5e34] text-[#5c3a21]'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {sheetTab === 'stats' && (
            <>
              <div className="grid grid-cols-3 gap-2 text-center border border-[#8b5e34] p-3 bg-[#dfc4a0]/40">
                {(
                  ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as Array<keyof AbilityScores>
                ).map((stat) => (
                  <div key={stat}>
                    <div className="font-display text-[10px] tracking-widest text-[#5c3a21]">
                      {stat}
                    </div>
                    <div className="font-display text-lg font-black text-[#2c1810]">
                      {activeSheet?.stats?.[stat] ?? safeStat(currentPlayer, stat)}
                    </div>
                  </div>
                ))}
              </div>
              {activeSheet && (
                <div className="text-[12px] text-[#2c1810] space-y-1">
                  <p>
                    <span className="font-display uppercase tracking-wider text-[#5c3a21]">
                      Skills:{' '}
                    </span>
                    {activeSheet.skills.join(', ')}
                  </p>
                  <p>
                    <span className="font-display uppercase tracking-wider text-[#5c3a21]">
                      Features:{' '}
                    </span>
                    {activeSheet.features.join(', ')}
                  </p>
                </div>
              )}
            </>
          )}

          {sheetTab === 'soul' && (
            <div className="space-y-3 text-[13px] text-[#2c1810] leading-relaxed">
              <p>
                <span className="font-display uppercase tracking-wider text-[#5c3a21] block text-[10px]">
                  Appearance
                </span>
                {activeSheet?.appearance || currentPlayer?.sheet_snapshot?.appearance || '—'}
              </p>
              <p>
                <span className="font-display uppercase tracking-wider text-[#5c3a21] block text-[10px]">
                  Backstory
                </span>
                {activeSheet?.backstory || currentPlayer?.sheet_snapshot?.backstory || '—'}
              </p>
              <p>
                <span className="font-display uppercase tracking-wider text-[#5c3a21] block text-[10px]">
                  Ideal / Bond / Flaw
                </span>
                {activeSheet?.ideals || '—'} / {activeSheet?.bonds || '—'} /{' '}
                {activeSheet?.flaws || '—'}
              </p>
            </div>
          )}

          {sheetTab === 'gear' && (
            <div className="space-y-3">
              {activeSheet?.equipment?.length ? (
                <ul className="text-[13px] text-[#2c1810] list-disc pl-5 space-y-1">
                  {activeSheet.equipment.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
              <p className="font-display text-xs uppercase tracking-[0.25em] text-[#5c3a21]">
                Reliquary Skins
              </p>
              <div className="grid grid-cols-3 gap-3">
                {INVENTORY_SLOTS.map((slot) => (
                  <div
                    key={slot.id}
                    className="inventory-socket aspect-square border-2 border-[#8b5e34] bg-[#2c1810]/10 flex items-center justify-center p-3"
                    title={slot.label}
                    aria-label={slot.label}
                  >
                    <Image
                      src={slot.src}
                      alt=""
                      width={72}
                      height={72}
                      unoptimized
                      className="inventory-glyph w-full h-full object-contain opacity-35 transition-all duration-300"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>

      {isTrayOpen && (
        <button
          type="button"
          aria-label="Close satchel"
          className="fixed inset-0 bg-black/50 z-[55]"
          onClick={() => setIsTrayOpen(false)}
        />
      )}
    </div>
  );
}
