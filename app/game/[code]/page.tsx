'use client';

import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import type { RealtimeChannel } from '@supabase/supabase-js';
import CharacterSetup, { type ForgeJoinPayload } from '@/components/CharacterSetup';
import GameStage from '@/components/aaa/GameStage';
import DiceResultBadge from '@/components/tabletop/DiceResultBadge';
import DraggableToken from '@/components/tabletop/DraggableToken';
import ReactiveStateStrip from '@/components/tabletop/ReactiveStateStrip';
import StateFanfareBanner from '@/components/tabletop/StateFanfareBanner';
import BeatChoices from '@/components/vault/BeatChoices';
import ClashHud from '@/components/vault/ClashHud';
import HostSatchel from '@/components/vault/HostSatchel';
import LevelUpRitual from '@/components/vault/LevelUpRitual';
import PendingChecks from '@/components/vault/PendingChecks';
import TitleCard from '@/components/vault/TitleCard';
import MomentsStrip from '@/components/vault/MomentsStrip';
import type { RollOutcomePayload } from '@/lib/arbiter-director';
import {
  buildColdOpen,
  mergeMemoryPatch,
  readArbiterMemory,
  shouldOfferColdOpen,
  writeArbiterMemory,
} from '@/lib/arbiter-memory';
import {
  formatBuddyTableMessage,
  parseBuddyCommand,
  parseBuddyTableMessage,
} from '@/lib/buddy-gm';
import {
  applyReactivePatch,
  buildInitialStateData,
  getCampaign,
  isCampaignId,
  readReactiveState,
  type ReactiveCampaignState,
} from '@/lib/campaigns';
import {
  BOARD_TEXTURE,
  GM_PORTRAIT,
  INVENTORY_SLOTS,
  portraitForPlayer,
} from '@/lib/game-art';
import {
  abilityModifier,
  compactSheetForGm,
  sheetSnapshot,
  type CharacterSheet,
} from '@/lib/character-sheet';
import { extractGmProtocol, mergeProtocolIntoVault } from '@/lib/gm-protocol';
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
import { buildSessionRecap, diffReactiveFanfare, type FanfareEvent } from '@/lib/state-fanfare';
import {
  canSeeWhisper,
  formatRollMessage,
  formatSpotlightMessage,
  formatWhisperMessage,
  gradeRollOutcome,
  isRollCommand,
  parseRollExpression,
  parseRollMessage,
  parseSpotlightCommand,
  parseWhisper,
  parseWhisperMessage,
  resolveRoll,
  type RollResult,
} from '@/lib/table-fun';
import {
  defaultTokenPos,
  readTableMeta,
  writeTableMeta,
  type TokenTablePos,
} from '@/lib/table-meta';
import {
  playDiceClack,
  playFanfareTick,
  playScreenPunch,
  playWaxStamp,
  playWhisperRustle,
  setTableSfxMuted,
} from '@/lib/table-sfx';
import {
  getSupabaseBrowserClient,
  mapChannelStatus,
  safeRemoveChannel,
  type ChannelHealth,
} from '@/lib/supabase';
import {
  buildLocalVaultEntry,
  deriveChapterFromState,
  ensureClashCombatant,
  readVaultRoom,
  upsertLocalVault,
  writeVaultRoom,
  type ClashZone,
  type VaultBeat,
  type VaultCheck,
} from '@/lib/vault';
import type {
  AbilityScores,
  GameRecord,
  PlayerEntity,
  ThreadMessage,
} from '@/types/database';

const HEARTBEAT_MS = 12_000;

function abilityKeyFromLabel(raw: string): keyof AbilityScores {
  const key = raw.trim().toLowerCase().slice(0, 3);
  if (key === 'str') return 'STR';
  if (key === 'dex') return 'DEX';
  if (key === 'con') return 'CON';
  if (key === 'int') return 'INT';
  if (key === 'wis') return 'WIS';
  if (key === 'cha') return 'CHA';
  return 'DEX';
}

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

export default function GameRoomPage({ params }: { params: { code: string } }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen tabletop-shell flex items-center justify-center loading-ember text-sm">
          Lighting the table…
        </div>
      }
    >
      <GameRoom params={params} />
    </Suspense>
  );
}

function GameRoom({ params }: { params: { code: string } }) {
  const sessionCode = String(params?.code ?? '').toUpperCase();
  const searchParams = useSearchParams();
  const campaignParam = searchParams?.get('campaign') ?? null;
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
  const [fanfareEvents, setFanfareEvents] = useState<FanfareEvent[]>([]);
  const [diceBadge, setDiceBadge] = useState<{
    sender: string;
    result: RollResult;
  } | null>(null);
  const [sfxMuted, setSfxMuted] = useState(false);
  const [lastSpeaker, setLastSpeaker] = useState<string | null>(null);
  const [screenPunch, setScreenPunch] = useState(false);
  const [hostOpen, setHostOpen] = useState(false);
  const [levelUpOpen, setLevelUpOpen] = useState(false);
  const [localTitleDismissed, setLocalTitleDismissed] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const terminalEndRef = useRef<HTMLDivElement | null>(null);
  const diceParticlesRef = useRef<DiceParticle[]>([]);
  const playerPositionsRef = useRef<Record<string, { x: number; y: number }>>({});
  const currentPlayerNameRef = useRef<string | null>(null);
  const gameIdRef = useRef<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const reconnectLockRef = useRef(false);
  const tablePersistTimerRef = useRef<number | null>(null);
  const vaultPersistTimerRef = useRef<number | null>(null);
  const reactivePrevRef = useRef<ReactiveCampaignState | null>(null);
  const openingLockRef = useRef(false);
  const coldOpenLockRef = useRef(false);

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

            const roll = parseRollMessage(incoming.content ?? '');
            if (roll) {
              setDiceBadge({
                sender: roll.sender,
                result: {
                  expression: roll.expression,
                  rolls: [],
                  modifier: 0,
                  total: roll.total,
                  detail: roll.detail,
                },
              });
              playDiceClack();
              window.setTimeout(() => setDiceBadge(null), 4200);
            }

            if (incoming.sender && incoming.sender !== 'GM') {
              setLastSpeaker(incoming.sender);
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
          const campaignId = isCampaignId(campaignParam ?? '')
            ? (campaignParam as string)
            : null;
          const campaign = getCampaign(campaignId);
          const baseState = campaignId
            ? buildInitialStateData(campaignId as 'ashcrown' | 'saltwake' | 'blackroot')
            : { campaignId: null, reactive: null };
          const stateData = writeTableMeta(baseState as Record<string, unknown>, {
            openingPosted: true,
          });
          const opening =
            campaign?.openingNarrative ??
            'The dynamic void initializes. Welcome, degenerates.';

          const { data: newGame, error: insertError } = await supabase
            .from('games')
            .insert([
              {
                session_code: sessionCode,
                current_narrative: opening,
                state_data: stateData,
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
            // Session open ritual — first chronicle ink
            try {
              await supabase.from('messages').insert([
                {
                  game_id: newGame.id,
                  sender: 'GM',
                  content: opening,
                },
              ]);
            } catch (openError) {
              console.error('Opening ritual message failed:', openError);
            }
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
  }, [attachRealtimeChannel, campaignParam, refreshRoomState, sessionCode]);

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

  // Reactive state fanfare — loud when the world moves
  useEffect(() => {
    const next = readReactiveState(game?.state_data);
    const prev = reactivePrevRef.current;
    if (next && prev) {
      const events = diffReactiveFanfare(prev, next);
      if (events.length > 0) {
        setFanfareEvents(events);
        playFanfareTick();
        playWaxStamp();
        playScreenPunch();
        setScreenPunch(true);
        window.setTimeout(() => setScreenPunch(false), 320);
      }

      const campaignTitle =
        getCampaign(
          typeof game?.state_data?.campaignId === 'string'
            ? (game.state_data.campaignId as string)
            : next.campaignId
        )?.title ?? 'Campaign';
      const chapter = deriveChapterFromState(prev, next, campaignTitle);
      if (chapter && game?.id) {
        const vault = readVaultRoom(game.state_data);
        const chapters = [chapter, ...vault.chapters].slice(0, 12);
        const titleCard = {
          title: chapter.title,
          subtitle: chapter.summary,
          kind: 'clock' as const,
        };
        const nextData = writeVaultRoom(game.state_data, { chapters, titleCard });
        setGame((g) => (g ? { ...g, state_data: nextData } : g));
        setLocalTitleDismissed(null);
        void (async () => {
          try {
            const supabase = getSupabaseBrowserClient();
            await supabase.from('games').update({ state_data: nextData }).eq('id', game.id);
          } catch (error) {
            console.error('Chapter vault persist failed:', error);
          }
        })();
      }
    }
    reactivePrevRef.current = next;
  }, [game?.id, game?.state_data]);

  // Mirror table into local continue vault
  useEffect(() => {
    if (!game || !currentPlayer || typeof window === 'undefined') return;
    const reactive = readReactiveState(game.state_data);
    const vault = readVaultRoom(game.state_data);
    const campaignId =
      (typeof game.state_data?.campaignId === 'string'
        ? game.state_data.campaignId
        : reactive?.campaignId) ?? null;
    if (!campaignId) return;
    const entry = buildLocalVaultEntry({
      campaignId,
      code: sessionCode,
      characters: players.map((p) => p.user_name).filter(Boolean),
      reactive,
      lastChapter: vault.chapters[0]?.title ?? vault.chapters[0]?.summary,
    });
    if (entry) upsertLocalVault(entry);
  }, [game, currentPlayer, players, sessionCode]);

  useEffect(() => {
    setTableSfxMuted(sfxMuted);
  }, [sfxMuted]);

  // Backfill opening ritual for campaigns that never posted it
  useEffect(() => {
    if (!game?.id || openingLockRef.current) return;
    const meta = readTableMeta(game.state_data);
    if (meta.openingPosted) return;
    if (messages.length > 0) {
      openingLockRef.current = true;
      return;
    }
    const campaign = getCampaign(
      typeof game.state_data?.campaignId === 'string'
        ? (game.state_data.campaignId as string)
        : null
    );
    const opening = campaign?.openingNarrative ?? game.current_narrative;
    if (!opening) return;

    openingLockRef.current = true;
    const run = async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        let nextData = writeTableMeta(game.state_data, { openingPosted: true });
        const memory = readArbiterMemory(game.state_data);
        const cold =
          shouldOfferColdOpen(memory) && campaign
            ? buildColdOpen(memory, campaign.title)
            : null;
        if (cold) {
          nextData = writeArbiterMemory(nextData, {
            lastColdOpenAt: new Date().toISOString(),
          });
        }
        const inserts = [{ game_id: game.id, sender: 'GM', content: opening }];
        if (cold) {
          inserts.push({ game_id: game.id, sender: 'GM', content: cold });
        }
        await supabase.from('messages').insert(inserts);
        await supabase
          .from('games')
          .update({ state_data: nextData })
          .eq('id', game.id);
        setGame((prev) => (prev ? { ...prev, state_data: nextData } : prev));
      } catch (error) {
        console.error('Opening backfill failed:', error);
        openingLockRef.current = false;
      }
    };
    void run();
  }, [game, messages.length]);

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

  const persistTablePatch = useCallback(
    (patch: Parameters<typeof writeTableMeta>[1]) => {
      if (!game?.id) return;
      const nextData = writeTableMeta(game.state_data, patch);
      setGame((prev) => (prev ? { ...prev, state_data: nextData } : prev));

      if (tablePersistTimerRef.current) {
        window.clearTimeout(tablePersistTimerRef.current);
      }
      tablePersistTimerRef.current = window.setTimeout(() => {
        void (async () => {
          try {
            const supabase = getSupabaseBrowserClient();
            await supabase
              .from('games')
              .update({ state_data: nextData })
              .eq('id', game.id);
          } catch (error) {
            console.error('Table meta persist failed:', error);
          }
        })();
      }, 350);
    },
    [game?.id, game?.state_data]
  );

  const persistVaultPatch = useCallback(
    (patch: Parameters<typeof writeVaultRoom>[1]) => {
      if (!game?.id) return;
      const nextData = writeVaultRoom(game.state_data, patch);
      setGame((prev) => (prev ? { ...prev, state_data: nextData } : prev));

      if (vaultPersistTimerRef.current) {
        window.clearTimeout(vaultPersistTimerRef.current);
      }
      vaultPersistTimerRef.current = window.setTimeout(() => {
        void (async () => {
          try {
            const supabase = getSupabaseBrowserClient();
            await supabase
              .from('games')
              .update({ state_data: nextData })
              .eq('id', game.id);
          } catch (error) {
            console.error('Vault persist failed:', error);
          }
        })();
      }, 350);
    },
    [game?.id, game?.state_data]
  );

  const persistStateData = useCallback(
    (nextData: Record<string, unknown>) => {
      if (!game?.id) return;
      setGame((prev) => (prev ? { ...prev, state_data: nextData } : prev));
      void (async () => {
        try {
          const supabase = getSupabaseBrowserClient();
          await supabase.from('games').update({ state_data: nextData }).eq('id', game.id);
        } catch (error) {
          console.error('State data persist failed:', error);
        }
      })();
    },
    [game?.id]
  );

  const postTableMessage = useCallback(
    async (sender: string, content: string) => {
      if (!game?.id) return;
      const optimistic = createOptimisticMessage(game.id, sender, content);
      setMessages((prev) => mergeMessageLedger(prev, optimistic));
      try {
        const supabase = getSupabaseBrowserClient();
        await supabase.from('messages').insert([
          { game_id: game.id, sender, content },
        ]);
      } catch (error) {
        console.error('Table message persist failed:', error);
        setSyncNotice('Table note held locally — sync will retry.');
      }
    },
    [game?.id]
  );

  // Cold open when returning to a remembered table (opening already posted)
  useEffect(() => {
    if (!game?.id || !currentPlayer || coldOpenLockRef.current) return;
    const meta = readTableMeta(game.state_data);
    if (!meta.openingPosted) return;
    if (messages.length < 1) return;
    const memory = readArbiterMemory(game.state_data);
    if (!shouldOfferColdOpen(memory)) {
      coldOpenLockRef.current = true;
      return;
    }
    const campaign = getCampaign(
      typeof game.state_data?.campaignId === 'string'
        ? (game.state_data.campaignId as string)
        : readReactiveState(game.state_data)?.campaignId
    );
    if (!campaign) return;
    const cold = buildColdOpen(memory, campaign.title);
    if (!cold) return;

    coldOpenLockRef.current = true;
    const run = async () => {
      try {
        const nextData = writeArbiterMemory(game.state_data, {
          lastColdOpenAt: new Date().toISOString(),
        });
        setGame((prev) => (prev ? { ...prev, state_data: nextData } : prev));
        const supabase = getSupabaseBrowserClient();
        await supabase.from('games').update({ state_data: nextData }).eq('id', game.id);
        await postTableMessage('GM', cold);
      } catch (error) {
        console.error('Cold open failed:', error);
        coldOpenLockRef.current = false;
      }
    };
    void run();
  }, [game, currentPlayer, messages.length, postTableMessage]);

  const handleTokenDrag = useCallback(
    (name: string, pos: TokenTablePos) => {
      const meta = readTableMeta(game?.state_data);
      persistTablePatch({
        tokenPositions: {
          ...meta.tokenPositions,
          [name]: pos,
        },
      });
    },
    [game?.state_data, persistTablePatch]
  );

  const runArbiterTurn = useCallback(
    async (opts: {
      mode: 'play' | 'buddy' | 'resolve';
      playerInput: string;
      senderName: string;
      activeGameId: string;
      buddyKind?: 'ask' | 'help' | 'banter' | 'remember';
      rollOutcome?: RollOutcomePayload;
      playerMessageContent?: string;
      skipPlayerMessage?: boolean;
    }) => {
      if (!game) return;
      const {
        mode,
        playerInput,
        senderName,
        activeGameId,
        buddyKind,
        rollOutcome,
        playerMessageContent,
        skipPlayerMessage,
      } = opts;

      const displayPlayer = playerMessageContent ?? playerInput;
      let optimisticPlayerMsg = null as ReturnType<typeof createOptimisticMessage> | null;

      if (!skipPlayerMessage) {
        optimisticPlayerMsg = createOptimisticMessage(
          activeGameId,
          senderName,
          displayPlayer
        );
        setMessages((prev) => mergeMessageLedger(prev, optimisticPlayerMsg!));
        try {
          const supabase = getSupabaseBrowserClient();
          const { error: playerMsgError } = await supabase.from('messages').insert([
            {
              game_id: activeGameId,
              sender: senderName,
              content: displayPlayer,
            },
          ]);
          if (playerMsgError) throw playerMsgError;
        } catch (writeError) {
          console.error('Player message persist failure:', writeError);
          setSyncNotice('Action kept locally — DB write delayed.');
        }
      }

      const historySource = optimisticPlayerMsg
        ? messages.concat(optimisticPlayerMsg)
        : messages;
      const activeHistory = historySource
        .map((message) => ({
          sender: message?.sender ?? 'Unknown',
          content: message?.content ?? '',
        }))
        .filter((message) => message.content.length > 0)
        .slice(mode === 'buddy' ? -8 : -14);

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

      const tableMeta = readTableMeta(game.state_data);
      const vaultLive = readVaultRoom(game.state_data);
      const reactive = readReactiveState(game.state_data);
      const campaignId =
        (typeof game.state_data?.campaignId === 'string'
          ? game.state_data.campaignId
          : reactive?.campaignId) ?? null;
      const arbiterMemory = readArbiterMemory(game.state_data);

      let gmReply =
        mode === 'buddy'
          ? 'Still here — say that again?'
          : 'The simulation warped. Repeat your raw action.';
      let statePatch: Partial<ReactiveCampaignState> | null = null;
      let protocol = extractGmProtocol('');

      try {
        const res = await fetch('/api/gm-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            playerInput,
            sender: senderName,
            gameId: activeGameId,
            history: activeHistory,
            partySheets,
            actorSheet: compactSheetForGm(activeSheet),
            campaignId,
            reactiveState: reactive,
            mode,
            buddyKind,
            rollOutcome,
            arbiterMemory,
            clashActive: vaultLive.clash.active,
            hasPendingChecks: vaultLive.pendingChecks.length > 0,
            spotlight: tableMeta.spotlight,
          }),
        });

        const data = (await res.json()) as {
          reply?: string;
          statePatch?: Partial<ReactiveCampaignState> | null;
          beats?: VaultBeat[] | null;
          checks?: VaultCheck[] | null;
          harm?: { target: string; amount: number }[] | null;
          loot?: string[] | null;
          titleCard?: { title: string; subtitle: string; kind?: string } | null;
          clashStart?: unknown;
          clashEnd?: boolean;
          memory?: Parameters<typeof mergeMemoryPatch>[1];
        };

        if (typeof data?.reply === 'string' && data.reply.trim()) {
          protocol = extractGmProtocol(data.reply.trim());
          gmReply = protocol.cleanReply || data.reply.trim();
          // If server already stripped protocol, cleanReply may equal reply
          if (data.statePatch) statePatch = data.statePatch;
          else statePatch = protocol.statePatch;

          // Prefer server-parsed protocol fields when present
          if (!protocol.beats && data.beats) protocol = { ...protocol, beats: data.beats };
          if (!protocol.checks && data.checks)
            protocol = { ...protocol, checks: data.checks };
          if (!protocol.harm && data.harm) protocol = { ...protocol, harm: data.harm };
          if (!protocol.loot && data.loot) protocol = { ...protocol, loot: data.loot };
          if (!protocol.titleCard && data.titleCard) {
            protocol = {
              ...protocol,
              titleCard: {
                title: data.titleCard.title,
                subtitle: data.titleCard.subtitle ?? '',
                kind:
                  data.titleCard.kind === 'clock' ||
                  data.titleCard.kind === 'clash' ||
                  data.titleCard.kind === 'loot' ||
                  data.titleCard.kind === 'chapter'
                    ? data.titleCard.kind
                    : 'chapter',
              },
            };
          }
          if (data.clashEnd) protocol = { ...protocol, clashEnd: true };
          if (data.clashStart)
            protocol = {
              ...protocol,
              clashStart: data.clashStart as typeof protocol.clashStart,
            };
          if (data.memory) protocol = { ...protocol, memory: data.memory };
          if (data.beats) protocol = { ...protocol, beats: data.beats };
          if (data.checks) protocol = { ...protocol, checks: data.checks };
          if (data.harm) protocol = { ...protocol, harm: data.harm };
          if (data.loot) protocol = { ...protocol, loot: data.loot };
          if (data.statePatch) protocol = { ...protocol, statePatch: data.statePatch };
        }
      } catch (apiError) {
        console.error('GM API transport failure:', apiError);
        gmReply =
          mode === 'buddy'
            ? 'Glitched for a sec — I am still at the table. Ask me again.'
            : 'The matrix caught fire mid-turn. Spit that chaos at me again.';
      }

      const optimisticGmMsg = createOptimisticMessage(activeGameId, 'GM', gmReply);
      setMessages((prev) => mergeMessageLedger(prev, optimisticGmMsg));

      let nextStateData = (game.state_data ?? {}) as Record<string, unknown>;
      if (statePatch && mode !== 'buddy') {
        nextStateData = applyReactivePatch(nextStateData, statePatch);
      } else if (statePatch && mode === 'buddy') {
        // Buddy may still touch light memory STATE — allow small patches
        nextStateData = applyReactivePatch(nextStateData, statePatch);
      }

      const vaultMerged = mergeProtocolIntoVault(readVaultRoom(nextStateData), protocol);
      if (protocol.loot && protocol.loot.length > 0) {
        await postTableMessage(
          'Chronicle',
          `Loot surfaces:\n${protocol.loot.map((item) => `• ${item}`).join('\n')}`
        );
      }
      nextStateData = writeVaultRoom(nextStateData, vaultMerged);

      const memoryNext = mergeMemoryPatch(
        readArbiterMemory(nextStateData),
        protocol.memory
      );
      nextStateData = writeArbiterMemory(nextStateData, memoryNext);

      if (protocol.titleCard) setLocalTitleDismissed(null);

      if (protocol.clashStart && protocol.clashStart.length > 0) {
        let clash = vaultMerged.clash;
        for (const player of players) {
          clash = ensureClashCombatant(
            clash,
            player.user_name,
            Math.max(1, player.max_hp || 10)
          );
          clash = {
            ...clash,
            combatants: clash.combatants.map((c) =>
              c.name.toLowerCase() === player.user_name.toLowerCase()
                ? {
                    ...c,
                    hp: Math.max(0, player.current_hp ?? c.hp),
                    maxHp: Math.max(1, player.max_hp || c.maxHp),
                  }
                : c
            ),
          };
        }
        nextStateData = writeVaultRoom(nextStateData, { clash });
      }

      const supabase = getSupabaseBrowserClient();
      if (protocol.harm && protocol.harm.length > 0) {
        for (const h of protocol.harm) {
          const target = players.find(
            (p) =>
              p.user_name.toLowerCase() === h.target.toLowerCase() ||
              p.user_name.toLowerCase().includes(h.target.toLowerCase())
          );
          if (!target) continue;
          const nextHp = Math.max(0, (target.current_hp ?? 0) - h.amount);
          setPlayers((prev) =>
            prev.map((p) => (p.id === target.id ? { ...p, current_hp: nextHp } : p))
          );
          try {
            await supabase
              .from('players')
              .update({ current_hp: nextHp })
              .eq('id', target.id);
          } catch (hpError) {
            console.error('Harm HP persist failed:', hpError);
          }
        }
      }

      setGame((prev) =>
        prev
          ? {
              ...prev,
              current_narrative: gmReply,
              state_data: nextStateData,
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
        if (gmMsgError) throw gmMsgError;
      } catch (gmWriteError) {
        console.error('GM message persist failure:', gmWriteError);
        setSyncNotice('GM reply held locally — persistence retry on heartbeat.');
      }

      try {
        await supabase
          .from('games')
          .update({
            current_narrative: gmReply,
            state_data: nextStateData,
          })
          .eq('id', activeGameId);
      } catch (narrativeError) {
        console.error('Narrative persist failure:', narrativeError);
      }
    },
    [
      activeSheet,
      game,
      messages,
      players,
      postTableMessage,
    ]
  );

  const handleExecuteAction = async () => {
    if (!inputMessage.trim() || !currentPlayer?.user_name || !game?.id || isGMLoading) {
      return;
    }

    const userText = inputMessage.trim();
    const senderName = currentPlayer.user_name;
    const activeGameId = game.id;

    // --- Table commands (no GM API) ---
    if (isRollCommand(userText)) {
      const parsed = parseRollExpression(userText);
      if (!parsed) {
        setSyncNotice('Dice expression unclear — try /roll 1d20+5');
        return;
      }
      setInputMessage('');
      const result = resolveRoll(parsed);
      const content = formatRollMessage(senderName, result);
      setDiceBadge({ sender: senderName, result });
      playDiceClack();
      triggerDiceFromUser(senderName);
      window.setTimeout(() => setDiceBadge(null), 4200);
      setLastSpeaker(senderName);
      await postTableMessage(senderName, content);

      // Honest dice: if there's a DC (or pending check), Arbiter narrates the outcome
      const vaultNow = readVaultRoom(game.state_data);
      const pending = vaultNow.pendingChecks[0];
      const dc = result.dc ?? pending?.dc;
      const label = result.label ?? pending?.label;
      const ability = result.ability ?? pending?.ability;
      const graded = gradeRollOutcome(result, dc);

      if (dc != null || graded.outcome === 'crit_success' || graded.outcome === 'crit_fail') {
        if (pending) {
          persistVaultPatch({
            pendingChecks: vaultNow.pendingChecks.filter((c) => c.id !== pending.id),
          });
        }
        const rollOutcome: RollOutcomePayload = {
          roller: senderName,
          expression: result.expression,
          total: result.total,
          detail: result.detail,
          dc,
          label,
          ability,
          outcome: graded.outcome,
          margin: graded.margin,
        };
        setIsGMLoading(true);
        try {
          await runArbiterTurn({
            mode: 'resolve',
            playerInput: `${senderName} rolled ${result.expression} → ${result.total}${
              label ? ` for ${label}` : ''
            }${dc != null ? ` vs DC ${dc}` : ''}. Outcome: ${graded.outcome}.`,
            senderName,
            activeGameId,
            rollOutcome,
            skipPlayerMessage: true,
          });
        } finally {
          setIsGMLoading(false);
        }
      }
      return;
    }

    const buddy = parseBuddyCommand(userText);
    if (buddy) {
      setInputMessage('');
      setLastSpeaker(senderName);
      playWhisperRustle();
      const tableLine = formatBuddyTableMessage(senderName, buddy.body);
      setIsGMLoading(true);
      try {
        await runArbiterTurn({
          mode: 'buddy',
          buddyKind: buddy.kind,
          playerInput: buddy.body,
          senderName,
          activeGameId,
          playerMessageContent: tableLine,
        });
      } finally {
        setIsGMLoading(false);
      }
      return;
    }

    const whisper = parseWhisper(userText);
    if (whisper) {
      setInputMessage('');
      const content = formatWhisperMessage(senderName, whisper.target, whisper.body);
      playWhisperRustle();
      await postTableMessage(senderName, content);
      return;
    }

    const spotlightTarget = parseSpotlightCommand(userText);
    if (spotlightTarget !== undefined) {
      setInputMessage('');
      persistTablePatch({ spotlight: spotlightTarget });
      playWaxStamp();
      await postTableMessage('GM', formatSpotlightMessage(spotlightTarget));
      return;
    }

    // --- Normal action → GM ---
    setInputMessage('');
    const vaultBefore = readVaultRoom(game.state_data);
    if (vaultBefore.hostSkipArbiter) {
      setLastSpeaker(senderName);
      await postTableMessage(senderName, userText);
      persistVaultPatch({ hostSkipArbiter: false, pendingBeats: [] });
      void postTableMessage(
        'Chronicle',
        'Host sealed the ink without the Arbiter — the table holds the deed.'
      );
      return;
    }

    setIsGMLoading(true);
    triggerDiceFromUser(senderName);
    setLastSpeaker(senderName);
    try {
      await runArbiterTurn({
        mode: 'play',
        playerInput: userText,
        senderName,
        activeGameId,
      });
    } finally {
      setIsGMLoading(false);
    }
  };

  const handleQuickRoll = (expression: string) => {
    setInputMessage(`/roll ${expression}`);
  };

  const handlePassSpotlight = (name: string | null) => {
    persistTablePatch({ spotlight: name });
    playWaxStamp();
    void postTableMessage('GM', formatSpotlightMessage(name));
  };

  const handleRecap = () => {
    const reactive = readReactiveState(game?.state_data);
    const campaign = getCampaign(
      typeof game?.state_data?.campaignId === 'string'
        ? (game.state_data.campaignId as string)
        : reactive?.campaignId
    );
    const recap = buildSessionRecap(campaign?.title, reactive);
    playWaxStamp();
    void postTableMessage('Chronicle', `📜 Session recap\n${recap}`);
  };

  const handleBeatChoice = (beat: VaultBeat) => {
    playWaxStamp();
    persistVaultPatch({ pendingBeats: [] });
    const line = `[Beat] ${beat.label}${beat.hint ? ` — ${beat.hint}` : ''}`;
    setInputMessage(line);
  };

  const handlePendingCheck = (check: VaultCheck) => {
    const ability = abilityKeyFromLabel(check.ability);
    const score =
      activeSheet?.stats?.[ability] ??
      safeStat(currentPlayer, ability);
    const mod = abilityModifier(score);
    const expr = `1d20${mod >= 0 ? `+${mod}` : mod}`;
    playDiceClack();
    persistVaultPatch({
      pendingChecks: readVaultRoom(game?.state_data).pendingChecks.filter(
        (c) => c.id !== check.id
      ),
    });
    setInputMessage(
      `/roll ${expr} (${ability} · ${check.label} · DC ${check.dc})`
    );
  };

  const handleClashZone = (name: string, zone: ClashZone) => {
    const vault = readVaultRoom(game?.state_data);
    persistVaultPatch({
      clash: {
        ...vault.clash,
        combatants: vault.clash.combatants.map((c) =>
          c.name === name ? { ...c, zone } : c
        ),
      },
    });
  };

  const handleHostAdvanceClock = (clockId: string, delta: number) => {
    const reactive = readReactiveState(game?.state_data);
    if (!reactive?.clocks[clockId] || !game) return;
    const clock = reactive.clocks[clockId];
    const filled = Math.max(0, Math.min(clock.segments, clock.filled + delta));
    const next = applyReactivePatch(game.state_data as Record<string, unknown>, {
      clocks: {
        [clockId]: { ...clock, filled },
      },
      lastConsequence:
        delta > 0
          ? `${clock.name} advances to ${filled}/${clock.segments}.`
          : `${clock.name} eases to ${filled}/${clock.segments}.`,
    });
    persistStateData(next);
    playWaxStamp();
  };

  const handleHostBumpHeat = (factionId: string, delta: number) => {
    const reactive = readReactiveState(game?.state_data);
    if (!reactive || !game) return;
    const value = Math.max(0, (reactive.heat[factionId] ?? 0) + delta);
    const next = applyReactivePatch(game.state_data as Record<string, unknown>, {
      heat: { [factionId]: value },
      lastConsequence: `Faction heat ${factionId} → ${value}.`,
    });
    persistStateData(next);
    playWaxStamp();
  };

  const handleHostWhisperNpc = (npcLabel: string, body: string) => {
    playWhisperRustle();
    void postTableMessage(
      'Chronicle',
      `NPC murmur — ${npcLabel}: ${body}`
    );
  };

  const handleInjectSetPiece = () => {
    const reactive = readReactiveState(game?.state_data);
    const liveCampaign = getCampaign(
      typeof game?.state_data?.campaignId === 'string'
        ? (game.state_data.campaignId as string)
        : reactive?.campaignId
    );
    const piece =
      liveCampaign?.sessionOneSetPiece ??
      'The wood groans. Something under the table wants a name.';
    playWaxStamp();
    void postTableMessage('GM', piece);
    persistVaultPatch({
      titleCard: {
        title: 'Set-piece',
        subtitle: liveCampaign?.title ?? 'The table turns',
        kind: 'chapter',
      },
    });
    setLocalTitleDismissed(null);
  };

  const handleStartClash = () => {
    let clash = { active: true, combatants: [] as ReturnType<typeof readVaultRoom>['clash']['combatants'] };
    for (const player of players) {
      clash = ensureClashCombatant(
        clash,
        player.user_name,
        Math.max(1, player.max_hp || 10)
      );
      clash = {
        ...clash,
        combatants: clash.combatants.map((c) =>
          c.name.toLowerCase() === player.user_name.toLowerCase()
            ? {
                ...c,
                hp: Math.max(0, player.current_hp ?? c.maxHp),
                maxHp: Math.max(1, player.max_hp || c.maxHp),
              }
            : c
        ),
      };
    }
    clash = ensureClashCombatant(clash, 'Rival Blade', 16);
    persistVaultPatch({
      clash,
      titleCard: {
        title: 'Clash',
        subtitle: 'Steel finds the light',
        kind: 'clash',
      },
    });
    setLocalTitleDismissed(null);
    playScreenPunch();
    void postTableMessage('GM', 'Steel clears the wood. Clash begins — claim your zone.');
  };

  const handleEndClash = () => {
    persistVaultPatch({ clash: { active: false, combatants: [] } });
    playWaxStamp();
    void postTableMessage('Chronicle', 'Blades lower. The clash resolves.');
  };

  const handleLevelUpConfirm = async (next: CharacterSheet) => {
    setActiveSheet(next);
    setLevelUpOpen(false);
    playWaxStamp();
    if (currentPlayer?.id) {
      try {
        const supabase = getSupabaseBrowserClient();
        await supabase
          .from('players')
          .update({
            max_hp: next.maxHp,
            current_hp: Math.min(
              next.maxHp,
              (currentPlayer.current_hp ?? next.maxHp) + 4
            ),
            sheet_snapshot: sheetSnapshot(next),
            avatar_class: `${next.className} L${next.level}`,
          })
          .eq('id', currentPlayer.id);
        setCurrentPlayer((prev) =>
          prev
            ? {
                ...prev,
                max_hp: next.maxHp,
                current_hp: Math.min(
                  next.maxHp,
                  (prev.current_hp ?? next.maxHp) + 4
                ),
                sheet_snapshot: sheetSnapshot(next),
                avatar_class: `${next.className} L${next.level}`,
              }
            : prev
        );
      } catch (error) {
        console.error('Level-up persist failed:', error);
        setSyncNotice('Level sealed locally — sync will catch up.');
      }
    }
    void postTableMessage(
      'Chronicle',
      `${next.name} rises to level ${next.level}. The vault marks the scar.`
    );
    persistVaultPatch({
      titleCard: {
        title: `Level ${next.level}`,
        subtitle: `${next.name} — the legend deepens`,
        kind: 'chapter',
      },
    });
    setLocalTitleDismissed(null);
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
      <div className="min-h-screen tabletop-shell flex items-center justify-center loading-ember text-sm">
        Lighting the table…
      </div>
    );
  }

  if (!currentPlayer) {
    return <CharacterSetup onFinish={handleCharacterDone} />;
  }

  const activeName = currentPlayer?.user_name ?? '';
  const activeHp = safeHp(currentPlayer);
  const narrative =
    game?.current_narrative ?? 'The dynamic void initializes. Welcome, degenerates.';
  const selfPortrait = portraitForPlayer(
    currentPlayer?.user_name,
    currentPlayer?.avatar_class
  );
  const reactive = readReactiveState(game?.state_data);
  const campaign = getCampaign(
    typeof game?.state_data?.campaignId === 'string'
      ? (game.state_data.campaignId as string)
      : reactive?.campaignId
  );
  const tableArt = campaign?.tableArt ?? BOARD_TEXTURE;
  const mapArt = campaign?.mapArt ?? campaign?.coverArt ?? BOARD_TEXTURE;
  const tableMeta = readTableMeta(game?.state_data);
  const vaultRoom = readVaultRoom(game?.state_data);
  const arbiterMemory = readArbiterMemory(game?.state_data);
  const dressClass = campaign ? `campaign-dress-${campaign.id}` : '';
  const sortedPlayers = [...players].sort((a, b) =>
    String(a.created_at).localeCompare(String(b.created_at))
  );
  const isHost =
    !!currentPlayer &&
    sortedPlayers.length > 0 &&
    sortedPlayers[0]?.id === currentPlayer.id;
  const titleCard =
    vaultRoom.titleCard &&
    localTitleDismissed !==
      `${vaultRoom.titleCard.title}|${vaultRoom.titleCard.subtitle}`
      ? vaultRoom.titleCard
      : null;

  const tokenPosFor = (player: PlayerEntity, index: number, isSelf: boolean) => {
    const saved = tableMeta.tokenPositions[player.user_name];
    if (saved) return saved;
    return defaultTokenPos(index, players.length, isSelf);
  };

  const visibleMessages = messages.filter((message) =>
    canSeeWhisper(message?.content ?? '', currentPlayer?.user_name)
  );

  return (
    <GameStage
      className={`tabletop-shell text-[#f0e2c4] ${dressClass}`}
      campaignId={campaign?.id}
      ambient
      muted={sfxMuted}
    >
    <div
      className={`min-h-screen overflow-hidden antialiased select-none relative ${
        screenPunch ? 'screen-punch' : ''
      }`}
    >
      <canvas ref={canvasRef} className="absolute inset-0 z-50 pointer-events-none" />

      <StateFanfareBanner
        events={fanfareEvents}
        onDismiss={() => setFanfareEvents([])}
      />

      <TitleCard
        card={titleCard}
        onDismiss={() => {
          if (vaultRoom.titleCard) {
            setLocalTitleDismissed(
              `${vaultRoom.titleCard.title}|${vaultRoom.titleCard.subtitle}`
            );
          }
          persistVaultPatch({ titleCard: null });
        }}
      />

      <LevelUpRitual
        open={levelUpOpen}
        sheet={activeSheet}
        onClose={() => setLevelUpOpen(false)}
        onConfirm={(next) => {
          void handleLevelUpConfirm(next);
        }}
      />

      {isHost && (
        <HostSatchel
          open={hostOpen}
          onClose={() => setHostOpen(false)}
          reactive={reactive}
          players={players}
          hostSkipArbiter={vaultRoom.hostSkipArbiter}
          onAdvanceClock={handleHostAdvanceClock}
          onBumpHeat={handleHostBumpHeat}
          onSpotlight={handlePassSpotlight}
          onWhisperNpc={handleHostWhisperNpc}
          onToggleSkipArbiter={() =>
            persistVaultPatch({ hostSkipArbiter: !vaultRoom.hostSkipArbiter })
          }
          onInjectSetPiece={handleInjectSetPiece}
          onStartClash={handleStartClash}
          onEndClash={handleEndClash}
          directorNote={readArbiterMemory(game?.state_data).directorNote}
          onDirectorNote={(note) => {
            const next = writeArbiterMemory(game?.state_data, { directorNote: note });
            persistStateData(next);
            playWaxStamp();
          }}
        />
      )}

      {/* Room gloom */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-38 parallax-drift plate-ink"
        style={{ backgroundImage: `url(${mapArt})` }}
        aria-hidden
      />
      <div className="absolute inset-0 bg-[#120c08]/80" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#120c08] via-transparent to-[#120c08]/88" />
      <div className="absolute left-8 top-24 w-40 h-40 torch-glow" />
      <div className="absolute right-10 bottom-40 w-48 h-48 torch-glow" />

      {/* Etched brass plaque — not a SaaS header */}
      <div className="absolute top-3 left-3 z-30 session-plaque text-[10px] sm:text-xs">
        {sessionCode}
        {campaign ? ` · ${campaign.title}` : ''}
      </div>

      {isHost && (
        <button
          type="button"
          className="vault-host-fab"
          onClick={() => setHostOpen((o) => !o)}
          title="Host satchel"
        >
          Host
        </button>
      )}

      {/* Table props: mute bell + satchel pouch */}
      <div className="absolute top-2 right-3 z-30 flex items-end gap-3">
        <button
          type="button"
          onClick={() => setSfxMuted((m) => !m)}
          className={`prop-bell ${sfxMuted ? 'prop-bell-muted' : ''}`}
          title={sfxMuted ? 'Unmute the table' : 'Mute the table'}
          aria-label={sfxMuted ? 'Unmute table sounds' : 'Mute table sounds'}
        >
          <span className="prop-bell-glyph block" />
        </button>
        <button
          type="button"
          onClick={() => setIsTrayOpen((open) => !open)}
          className="prop-pouch"
          title="Open your satchel"
          aria-label="Open satchel"
        >
          <span className="prop-pouch-glyph block" />
        </button>
      </div>

      {syncNotice && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 sync-blot max-w-[90vw]">
          {syncNotice}
        </div>
      )}

      <div className="relative z-10 room-split">
        {/* 2.5D TABLE */}
        <section className="board-frame relative overflow-hidden min-h-0 fp-table-stage">
          <div className="absolute inset-0 bg-[#1a100c]" />
          <div
            className="absolute inset-[-8%_-5%_8%] fp-table-plane fp-table-felt"
            style={{
              backgroundImage: `linear-gradient(180deg, rgba(20,12,8,0.4), rgba(10,6,4,0.7)), url(${tableArt})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            <div className="absolute left-1/4 top-1/3 w-28 h-28 fp-lantern" />
            <div className="absolute right-1/4 top-1/4 w-24 h-24 fp-lantern" />

            {/* GM screen at far end */}
            <div
              className={`absolute top-[5%] left-1/2 -translate-x-1/2 z-20 w-[min(72%,17rem)] fp-gm-seat dm-screen p-2 sm:p-3 flex flex-col items-center gap-2 text-center ${
                isGMLoading ? 'gm-breathe' : ''
              }`}
            >
              <div className="relative w-14 h-16 sm:w-16 sm:h-[4.5rem] overflow-hidden dm-screen-art shrink-0">
                <Image
                  src={campaign?.gmScreenArt ?? GM_PORTRAIT}
                  alt="Game Master"
                  fill
                  sizes="64px"
                  className="object-cover plate-ink"
                  priority
                />
              </div>
              <div className="min-w-0 px-1">
                <p className="text-[11px] italic text-[#b8965c]">The Arbiter</p>
                <p className="text-[11px] text-[#d6c4a1] line-clamp-2 italic leading-snug mt-0.5">
                  {isGMLoading
                    ? 'Leans across the wood…'
                    : narrative}
                </p>
              </div>
            </div>

            {players.map((player, index) => {
              const isSelf = player.user_name === activeName;
              return (
                <DraggableToken
                  key={player.id}
                  player={player}
                  pos={tokenPosFor(player, index, isSelf)}
                  emphasized={isSelf}
                  spotlighted={
                    !!tableMeta.spotlight &&
                    tableMeta.spotlight.toLowerCase() ===
                      player.user_name.toLowerCase()
                  }
                  size={isSelf ? 'lg' : 'sm'}
                  onMount={recordPosition}
                  onDragEnd={handleTokenDrag}
                />
              );
            })}

            {diceBadge && (
              <DiceResultBadge sender={diceBadge.sender} result={diceBadge.result} />
            )}

            <ClashHud
              active={vaultRoom.clash.active}
              combatants={vaultRoom.clash.combatants}
              onZone={isHost ? handleClashZone : undefined}
            />
          </div>

          <ReactiveStateStrip
            state={reactive}
            campaignTitle={campaign?.title ?? null}
          />
          <MomentsStrip highlights={arbiterMemory.highlights} />
        </section>

        {/* BOOK PAGE resting on the near edge */}
        <section className="parchment-panel chronicle-book min-h-0 flex flex-col overflow-hidden">
          <div className="chronicle-margin px-4 py-2 flex flex-wrap items-center justify-between gap-2">
            <p className="italic">
              {campaign ? `${campaign.title}` : 'The chronicle'}
              {lastSpeaker ? ` · last voice: ${lastSpeaker}` : ''}
            </p>
            {isGMLoading && (
              <span className="italic text-[#7f1d1d]">Ink still wet…</span>
            )}
          </div>

          {/* Lantern seats = spotlight, ribbon = recap */}
          <div className="px-3 py-1.5 flex flex-wrap items-center gap-2 border-b border-[#8b5e34]/30">
            <span className="text-[11px] italic text-[#5c3a21] mr-1">Who holds the lantern</span>
            <button
              type="button"
              onClick={() => handlePassSpotlight(null)}
              className="flex items-center gap-1"
              title="Open table"
            >
              <span
                className={`lantern-seat ${!tableMeta.spotlight ? '' : 'lantern-seat-dim'}`}
              />
              <span className="text-[11px] italic text-[#5c3a21]">open</span>
            </button>
            {players.map((player) => {
              const on =
                tableMeta.spotlight?.toLowerCase() ===
                player.user_name.toLowerCase();
              return (
                <button
                  key={`spot-${player.id}`}
                  type="button"
                  onClick={() => handlePassSpotlight(player.user_name)}
                  className="flex items-center gap-1"
                  title={`Spotlight ${player.user_name}`}
                >
                  <span className={`lantern-seat ${on ? '' : 'lantern-seat-dim'}`} />
                  <span className="text-[11px] italic text-[#2a160e]">
                    {player.user_name}
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={handleRecap}
              className="prop-ribbon ml-auto"
              title="Turn back a page — recap"
              aria-label="Session recap"
            >
              <span className="prop-ribbon-glyph block" />
            </button>
          </div>

          {vaultRoom.chapters[0] && (
            <div className="vault-chapters">
              <p className="vault-chapter-line">
                Chapter — {vaultRoom.chapters[0].title}
              </p>
            </div>
          )}

          <BeatChoices
            beats={vaultRoom.pendingBeats}
            disabled={isGMLoading}
            onChoose={handleBeatChoice}
          />

          <PendingChecks
            checks={vaultRoom.pendingChecks}
            disabled={isGMLoading}
            onRoll={handlePendingCheck}
          />

          <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-3 space-y-3">
            {visibleMessages.length === 0 && (
              <p className="ink-entry-body italic whitespace-pre-wrap">{narrative}</p>
            )}
            {visibleMessages.map((message) => {
              const isGm = message?.sender === 'GM';
              const isChronicle = message?.sender === 'Chronicle';
              const whisper = parseWhisperMessage(message?.content ?? '');
              const roll = parseRollMessage(message?.content ?? '');
              const buddyMsg = parseBuddyTableMessage(message?.content ?? '');
              return (
                <div key={`${message.id}-${message.created_at}`} className="ink-line">
                  <p
                    className={`ink-entry-name ${
                      isGm || isChronicle ? 'ink-entry-gm' : ''
                    } ${whisper ? 'text-[#1e3a5f]' : ''} ${roll ? 'text-[#8b4510]' : ''} ${
                      buddyMsg ? 'ink-entry-buddy' : ''
                    }`}
                  >
                    {whisper
                      ? `Passed note — ${whisper.from} to ${whisper.to}`
                      : buddyMsg
                        ? `To the Arbiter — ${buddyMsg.from}`
                        : roll
                          ? message?.content?.replace(/^🎲\s*/, '') ?? ''
                          : message?.sender ?? 'Unknown'}
                  </p>
                  {!roll && (
                    <p className="ink-entry-body whitespace-pre-wrap">
                      {whisper
                        ? whisper.body
                        : buddyMsg
                          ? buddyMsg.body
                          : message?.content ?? ''}
                    </p>
                  )}
                </div>
              );
            })}
            <div ref={terminalEndRef} />
          </div>

          <form
            className="quill-well px-4 py-3 space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              void handleExecuteAction();
            }}
          >
            <div className={`dice-tray ${vaultRoom.pendingChecks.length ? 'dice-tray-lit' : ''}`}>
              {['1d20', '1d20+5', '2d6', '1d8'].map((expr) => (
                <button
                  key={expr}
                  type="button"
                  onClick={() => handleQuickRoll(expr)}
                  className="bone-die"
                  title={`Roll ${expr}`}
                >
                  {expr.replace('1d', 'd')}
                </button>
              ))}
            </div>
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
              placeholder="Deed, /roll, or /gm ask your buddy…"
              className="quill-input w-full text-[16px] px-1 py-2"
              disabled={isGMLoading}
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-[12px] italic text-[#5c3a21]">
                /gm for side help · Enter seals the ink
              </p>
              <button
                type="submit"
                disabled={!inputMessage.trim() || isGMLoading}
                className="wax-button px-5 py-2 text-[11px]"
              >
                {isGMLoading ? '…' : 'Seal'}
              </button>
            </div>
          </form>
        </section>
      </div>

      {/* Leather satchel / character sheet */}
      <aside
        className={`fixed inset-y-0 right-0 w-full sm:w-[380px] z-[60] transform transition-transform duration-500 ease-out sheet-leather ${
          isTrayOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="h-full overflow-y-auto custom-scrollbar p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className="relative w-14 h-[4.5rem] overflow-hidden mini-figure shrink-0"
                style={{ borderRadius: '40% 40% 18% 18% / 28% 28% 12% 12%' }}
              >
                <Image
                  src={selfPortrait}
                  alt=""
                  fill
                  sizes="64px"
                  className="object-cover object-top plate-ink"
                />
              </div>
              <div>
                <h2 className="font-display text-xl text-[#f0e2c4]">
                  {activeSheet?.name ?? currentPlayer?.user_name ?? 'Wanderer'}
                </h2>
                <p className="text-[12px] italic text-[#b8965c]">
                  {activeSheet
                    ? `${activeSheet.race} ${activeSheet.className}`
                    : currentPlayer?.avatar_class ?? 'Adventurer'}
                </p>
                <p className="text-[12px] text-[#e8b4b4] mt-1">
                  HP {activeHp.current}/{activeHp.max}
                  {activeSheet ? ` · AC ${activeSheet.armorClass}` : ''}
                  {activeSheet ? ` · L${activeSheet.level}` : ''}
                </p>
                {activeSheet && (activeSheet.level || 1) < 5 && (
                  <button
                    type="button"
                    onClick={() => setLevelUpOpen(true)}
                    className="mt-1 text-[11px] italic text-[#f59e0b] hover:underline"
                  >
                    Level-up ritual →
                  </button>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsTrayOpen(false)}
              className="prop-pouch"
              aria-label="Close satchel"
              title="Close satchel"
            >
              <span className="prop-pouch-glyph block scale-75 origin-top-right" />
            </button>
          </div>

          {(activeSheet?.seed || currentPlayer?.seed) && (
            <div className="border border-[#8b5e34] px-3 py-2 bg-black/20">
              <p className="text-[11px] italic text-[#b8965c]">Legend seed</p>
              <p className="font-display text-sm tracking-[0.15em] text-[#f0e2c4]">
                {activeSheet?.seed ?? currentPlayer?.seed}
              </p>
              <p className="text-[11px] italic text-[#a89070] mt-1">
                Carry this seed to another table.
              </p>
            </div>
          )}

          <div className="flex gap-2">
            {(['stats', 'soul', 'gear'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setSheetTab(tab)}
                className={`flex-1 sheet-tab ${
                  sheetTab === tab ? 'sheet-tab-active' : ''
                }`}
              >
                {tab === 'stats' ? 'Body' : tab === 'soul' ? 'Soul' : 'Gear'}
              </button>
            ))}
          </div>

          {sheetTab === 'stats' && (
            <>
              <div className="grid grid-cols-3 gap-2">
                {(
                  ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as Array<keyof AbilityScores>
                ).map((stat) => (
                  <div key={stat} className="sheet-stat-box">
                    <div className="text-[10px] text-[#b8965c]">{stat}</div>
                    <div className="font-display text-lg text-[#f0e2c4]">
                      {activeSheet?.stats?.[stat] ?? safeStat(currentPlayer, stat)}
                    </div>
                  </div>
                ))}
              </div>
              {activeSheet && (
                <div className="text-[12px] text-[#e4d0a2] space-y-1 italic">
                  <p>
                    <span className="not-italic text-[#b8965c]">Skills — </span>
                    {activeSheet.skills.join(', ')}
                  </p>
                  <p>
                    <span className="not-italic text-[#b8965c]">Features — </span>
                    {activeSheet.features.join(', ')}
                  </p>
                </div>
              )}
            </>
          )}

          {sheetTab === 'soul' && (
            <div className="space-y-3 text-[13px] text-[#e4d0a2] leading-relaxed italic">
              <p>
                <span className="not-italic text-[#b8965c] block text-[11px]">
                  Appearance
                </span>
                {activeSheet?.appearance || currentPlayer?.sheet_snapshot?.appearance || '—'}
              </p>
              <p>
                <span className="not-italic text-[#b8965c] block text-[11px]">
                  Backstory
                </span>
                {activeSheet?.backstory || currentPlayer?.sheet_snapshot?.backstory || '—'}
              </p>
              <p>
                <span className="not-italic text-[#b8965c] block text-[11px]">
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
                <ul className="text-[13px] text-[#e4d0a2] list-disc pl-5 space-y-1 italic">
                  {activeSheet.equipment.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
              <p className="text-[11px] italic text-[#b8965c]">Reliquary</p>
              <div className="grid grid-cols-3 gap-3">
                {INVENTORY_SLOTS.map((slot) => (
                  <div
                    key={slot.id}
                    className="inventory-socket aspect-square border border-[#8b5e34] bg-black/25 flex items-center justify-center p-3"
                    title={slot.label}
                    aria-label={slot.label}
                  >
                    <Image
                      src={slot.src}
                      alt=""
                      width={72}
                      height={72}
                      unoptimized
                      className="inventory-glyph w-full h-full object-contain opacity-40 transition-all duration-300"
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
          className="fixed inset-0 bg-black/55 z-[55]"
          onClick={() => setIsTrayOpen(false)}
        />
      )}
    </div>
    </GameStage>
  );
}
