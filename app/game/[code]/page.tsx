'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import type { RealtimeChannel } from '@supabase/supabase-js';
import CharacterSetup from '@/components/CharacterSetup';
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
  sanitizeCharacterPayload,
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
  CharacterPayload,
  GameRecord,
  PlayerEntity,
  ThreadMessage,
} from '@/types/database';

const ICON_BASE = 'https://raw.githubusercontent.com/game-icons/icons/master';
const HEARTBEAT_MS = 12_000;

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

function PlayerBoardCard({
  player,
  emphasized,
  onMount,
}: {
  player: PlayerEntity;
  emphasized?: boolean;
  onMount: (name: string, el: HTMLDivElement | null) => void;
}) {
  const hp = safeHp(player);
  const cha = safeStat(player, 'CHA');

  return (
    <div
      ref={(el) => onMount(player?.user_name ?? 'unknown', el)}
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
              {player?.user_name ?? 'Unknown'}
            </h4>
            <p className="text-[9px] font-mono uppercase tracking-widest text-purple-300 truncate">
              {player?.avatar_class ?? 'Adventurer'}
            </p>
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="flex justify-between text-[10px] font-mono uppercase tracking-wider text-neutral-400">
            <span>
              {hp.current}/{hp.max} HP
            </span>
            <span>CHA {cha}</span>
          </div>
          <div className="h-1.5 rounded-full bg-black/70 overflow-hidden border border-white/5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-red-600 via-pink-500 to-purple-500"
              style={{ width: `${hp.ratio * 100}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
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

  const handleCharacterDone = async (charData: CharacterPayload) => {
    if (!game?.id || joining) return;
    setJoining(true);
    setBootError(null);

    const sanitized = sanitizeCharacterPayload(charData);
    const cached = readCachedPlayerSeat(sessionCode);

    try {
      const existing = await resolveExistingSeat(game.id, sanitized.name, cached);
      if (existing) {
        adoptPlayerSeat(existing, sessionCode);
        return;
      }

      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('players')
        .insert([
          {
            game_id: game.id,
            user_name: sanitized.name,
            avatar_class: sanitized.characterClass,
            stats: sanitized.stats,
            current_hp: 15,
            max_hp: 15,
          },
        ])
        .select()
        .single();

      if (error) {
        if (isUniqueViolation(error)) {
          const raced = await resolveExistingSeat(game.id, sanitized.name, cached);
          if (raced) {
            adoptPlayerSeat(raced, sessionCode);
            return;
          }
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

      // Keep the board usable with a local fallback seat if the write path collapses.
      const fallbackSeat: PlayerEntity = {
        id: `local-${Date.now()}`,
        game_id: game.id,
        user_name: sanitized.name,
        avatar_class: sanitized.characterClass,
        stats: sanitized.stats,
        current_hp: 15,
        max_hp: 15,
        created_at: new Date().toISOString(),
      };
      adoptPlayerSeat(fallbackSeat, sessionCode);
      setSyncNotice(
        'Seat write failed — running on local fallback until sync recovers.'
      );
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
        .slice(-10);

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

  const activeName = currentPlayer?.user_name ?? '';
  const adjacentPlayers = players.filter(
    (player) => (player?.user_name ?? '') !== activeName
  );
  const leftParty = adjacentPlayers.slice(0, Math.ceil(adjacentPlayers.length / 2));
  const rightParty = adjacentPlayers.slice(Math.ceil(adjacentPlayers.length / 2));
  const activeHp = safeHp(currentPlayer);
  const narrative =
    game?.current_narrative ?? 'The dynamic void initializes. Welcome, degenerates.';

  const healthTone =
    channelHealth === 'joined'
      ? 'bg-emerald-400 shadow-[0_0_12px_#34d399]'
      : channelHealth === 'connecting'
        ? 'bg-amber-400 shadow-[0_0_12px_#fbbf24] animate-pulse'
        : 'bg-red-400 shadow-[0_0_12px_#f87171] animate-pulse';

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col overflow-hidden antialiased select-none relative">
      <canvas ref={canvasRef} className="absolute inset-0 z-40 pointer-events-none" />

      <div
        className="absolute inset-0 bg-cover bg-center -z-20 opacity-25 ken-burns"
        style={{ backgroundImage: `url(${assetLibrary.boardArt})` }}
        aria-hidden
      />
      <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/55 to-transparent -z-10" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_10%,rgba(10,10,10,0.85)_75%,#0a0a0a_100%)] -z-10" />

      <header className="relative z-20 border-b border-white/10 bg-neutral-950/55 backdrop-blur-2xl px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${healthTone}`} />
          <div className="min-w-0">
            <h1 className="font-display text-sm font-black tracking-widest uppercase bg-gradient-to-r from-purple-400 via-pink-400 to-red-500 bg-clip-text text-transparent truncate">
              Voidline Tactical Board
            </h1>
            <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">
              Session {sessionCode} · sync {channelHealth}
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

      {syncNotice && (
        <div className="relative z-30 px-4 py-2 text-[10px] font-mono uppercase tracking-widest text-amber-200 bg-amber-950/50 border-b border-amber-500/20">
          {syncNotice}
        </div>
      )}

      <main className="relative z-10 flex-1 grid grid-cols-12 gap-3 sm:gap-4 p-3 sm:p-4 h-[calc(100vh-61px)] max-h-[calc(100vh-61px)] overflow-hidden">
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

        <section className="col-span-12 sm:col-span-8 flex flex-col gap-3 min-h-0 z-10 order-1 sm:order-2">
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
                  {isGMLoading ? 'Weaving chaos across the board...' : narrative}
                </p>
              </div>
            </div>
          </div>

          <div
            className="mx-auto w-full max-w-sm"
            data-player-anchor={currentPlayer?.user_name ?? 'self'}
          >
            <PlayerBoardCard
              player={currentPlayer}
              emphasized
              onMount={recordPosition}
            />
          </div>

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
                const isGm = message?.sender === 'GM';
                const isSelf = message?.sender === currentPlayer?.user_name;
                return (
                  <div
                    key={`${message.id}-${message.created_at}`}
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
                        {message?.sender ?? 'Unknown'}
                      </span>
                      <span className="text-[10px] font-mono text-neutral-600">
                        {message?.created_at
                          ? new Date(message.created_at).toLocaleTimeString()
                          : '--'}
                      </span>
                    </div>
                    <p className="text-sm text-neutral-100 whitespace-pre-wrap leading-relaxed">
                      {message?.content ?? ''}
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
                {currentPlayer?.user_name ?? 'Operative'}
              </h2>
              <p className="text-[10px] font-mono text-neutral-500 mt-1 uppercase tracking-wider">
                HP {activeHp.current}/{activeHp.max} · STR {safeStat(currentPlayer, 'STR')} · DEX{' '}
                {safeStat(currentPlayer, 'DEX')} · CHA {safeStat(currentPlayer, 'CHA')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsTrayOpen(false)}
              className="text-[10px] font-mono uppercase tracking-widest px-3 py-2 rounded-xl border border-white/10 text-neutral-400 hover:text-white"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-mono uppercase tracking-wider text-neutral-400 border border-white/10 rounded-2xl p-3 bg-black/30">
            {(
              Object.keys(currentPlayer?.stats ?? {
                STR: 10,
                DEX: 10,
                CON: 10,
                INT: 10,
                WIS: 10,
                CHA: 10,
              }) as Array<keyof AbilityScores>
            ).map((stat) => (
              <div key={stat} className="py-1">
                <div className="text-neutral-500">{stat}</div>
                <div className="text-neutral-100 font-black text-sm">
                  {safeStat(currentPlayer, stat)}
                </div>
              </div>
            ))}
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
