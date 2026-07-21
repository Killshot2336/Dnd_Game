'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import GameStage from '@/components/aaa/GameStage';
import { CAMPAIGNS, type CampaignId } from '@/lib/campaigns';
import {
  sealToRunes,
  toAncientRune,
  triggerCosmicReverberation,
} from '@/lib/cosmic-reverberation';
import { playWaxStamp } from '@/lib/table-sfx';
import { readLocalVault, removeLocalVault, type LocalVaultEntry } from '@/lib/vault';

type GateMode = 'home' | 'campaigns';
type GatePhase = 'idle' | 'fragmenting' | 'tracker';

interface StarSpec {
  id: number;
  left: string;
  top: string;
  size: number;
  duration: number;
  delay: number;
  gold: boolean;
  dx: string;
  dy: string;
}

const STAR_COUNT = 64;

function buildStarField(count: number): StarSpec[] {
  const stars: StarSpec[] = [];
  for (let i = 0; i < count; i++) {
    const gold = i % 5 === 0 || i % 7 === 0;
    const size = gold ? 1.6 + (i % 3) * 0.4 : 0.9 + (i % 4) * 0.35;
    stars.push({
      id: i,
      left: `${(i * 37 + 11) % 100}%`,
      top: `${(i * 53 + 7) % 100}%`,
      size,
      duration: 8 + (i % 12) * 1.4,
      delay: -((i * 0.73) % 10),
      gold,
      dx: `${((i % 9) - 4) * 6}px`,
      dy: `${-28 - (i % 11) * 5}px`,
    });
  }
  return stars;
}

function sanitizeSeal(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
}

function CelestialStarfield() {
  const stars = useMemo(() => buildStarField(STAR_COUNT), []);
  return (
    <div className="celestial-starfield" aria-hidden>
      {stars.map((star) => (
        <span
          key={star.id}
          className={`celestial-star${star.gold ? ' celestial-star--gold' : ''}`}
          style={{
            left: star.left,
            top: star.top,
            width: star.size,
            height: star.size,
            animationDuration: `${star.duration}s`,
            animationDelay: `${star.delay}s`,
            ['--star-dx' as string]: star.dx,
            ['--star-dy' as string]: star.dy,
          }}
        />
      ))}
    </div>
  );
}

function CrystalHud({
  vaultCount,
  seatCount,
  lastSeal,
  heat,
}: {
  vaultCount: number;
  seatCount: number;
  lastSeal: string;
  heat: string;
}) {
  const sealDisplay = lastSeal ? sealToRunes(lastSeal.slice(0, 4)) || lastSeal.slice(0, 4) : '—';
  return (
    <div className="celestial-hud-row" role="status" aria-label="Cosmic state headers" data-node-id="1:52">
      <div className="crystal-shard" data-node-id="1:53">
        <span className="crystal-shard__label">Vaults</span>
        <span className="crystal-shard__value">{vaultCount}</span>
      </div>
      <div className="crystal-shard" data-node-id="1:56">
        <span className="crystal-shard__label">Seats</span>
        <span className="crystal-shard__value">{seatCount}</span>
      </div>
      <div className="crystal-shard" data-node-id="1:59">
        <span className="crystal-shard__label">Seal</span>
        <span className="crystal-shard__value" style={{ fontSize: sealDisplay.length > 3 ? '0.85rem' : '20px' }}>
          {sealDisplay}
        </span>
      </div>
      <div className="crystal-shard" data-node-id="1:62">
        <span className="crystal-shard__label">Heat</span>
        <span className="crystal-shard__value" style={{ fontSize: heat.length > 5 ? '0.85rem' : '20px' }}>
          {heat}
        </span>
      </div>
    </div>
  );
}

function SixGlyphSealInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const runes = value.split('').map((c, i) => (
    <span key={`${c}-${i}`} className="six-glyph-seal__rune">
      {toAncientRune(c)}
    </span>
  ));

  return (
    <div className="six-glyph-seal">
      <input
        type="text"
        inputMode="text"
        autoComplete="off"
        spellCheck={false}
        maxLength={6}
        value={value}
        disabled={disabled}
        aria-label="Six-glyph seal"
        className="six-glyph-seal__input"
        onChange={(e) => onChange(sanitizeSeal(e.target.value))}
      />
      <div className="six-glyph-seal__runes" aria-hidden>
        {value.length === 0 ? (
          <span className="six-glyph-seal__placeholder">Six-glyph seal</span>
        ) : (
          runes
        )}
      </div>
    </div>
  );
}

const TRACKER_LINES_TEMPLATE = (seal: string) => [
  `> ALIGNING ORBITAL CHANNEL…`,
  `> SEAL SIGIL ACCEPTED: ${sealToRunes(seal)} (${seal})`,
  `> FRACTURING GATE MEMBRANE…`,
  `> TILTING CAMERA INTO DEEP-SPACE TRACKER…`,
  `> OPENING CAMPAIGN CHAT BOARD…`,
  `> ARBITER UPLINK: LIVE`,
];

export default function HomeDashboard() {
  const router = useRouter();
  const [mode, setMode] = useState<GateMode>('home');
  const [loading, setLoading] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [pickedId, setPickedId] = useState<CampaignId | null>(null);
  const [vault, setVault] = useState<LocalVaultEntry[]>([]);
  const [phase, setPhase] = useState<GatePhase>('idle');
  const [trackerLines, setTrackerLines] = useState<string[]>([]);
  const [pendingRoute, setPendingRoute] = useState<string | null>(null);
  const navTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setVault(readLocalVault());
    return () => {
      if (navTimerRef.current != null) window.clearTimeout(navTimerRef.current);
    };
  }, []);

  const hud = useMemo(() => {
    const seatCount = vault.reduce((sum, e) => sum + (e.characters?.length || 0), 0);
    const latest = [...vault].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )[0];
    const heatRaw = latest?.heatSummary?.trim() || 'cold';
    const heat = heatRaw.length > 8 ? `${heatRaw.slice(0, 7)}…` : heatRaw;
    return {
      vaultCount: vault.length,
      seatCount,
      lastSeal: latest?.code || '',
      heat: heat || 'cold',
    };
  }, [vault]);

  const generateLobbyCode = (): string => {
    const pool = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += pool.charAt(Math.floor(Math.random() * pool.length));
    }
    return code;
  };

  const launchIntoTracker = useCallback((route: string, sealHint: string) => {
    setPhase('fragmenting');
    setPendingRoute(route);
    playWaxStamp();
    triggerCosmicReverberation(1.15);

    window.setTimeout(() => {
      setPhase('tracker');
      const lines = TRACKER_LINES_TEMPLATE(sealHint);
      setTrackerLines([]);
      lines.forEach((line, idx) => {
        window.setTimeout(() => {
          setTrackerLines((prev) => [...prev, line]);
        }, 180 + idx * 220);
      });
    }, 720);

    navTimerRef.current = window.setTimeout(() => {
      router.push(route);
    }, 2600);
  }, [router]);

  const handleStartCampaign = (campaignId: CampaignId) => {
    if (phase !== 'idle') return;
    setPickedId(campaignId);
    setLoading(true);
    playWaxStamp();
    const code = generateLobbyCode();
    launchIntoTracker(`/game/${code}?campaign=${campaignId}`, code);
  };

  const handleLightCampaign = () => {
    triggerCosmicReverberation(1.25);
    playWaxStamp();
    setMode('campaigns');
  };

  const handleJoinGame = (e: React.FormEvent) => {
    e.preventDefault();
    if (phase !== 'idle') return;
    const seal = joinCode.trim().toUpperCase();
    if (seal.length !== 6) return;
    launchIntoTracker(`/game/${seal}`, seal);
  };

  const handleContinue = (entry: LocalVaultEntry) => {
    if (phase !== 'idle') return;
    launchIntoTracker(`/game/${entry.code}?campaign=${entry.campaignId}`, entry.code);
  };

  const fragmenting = phase === 'fragmenting' || phase === 'tracker';
  const showTracker = phase === 'tracker';

  return (
    <GameStage className="tabletop-shell" ambient>
      <div
        className={`celestial-gate${showTracker ? ' is-tilting-to-tracker' : ''}`}
        id="cosmic-reverberation-root"
      >
        <div className="celestial-nebula" aria-hidden />
        <div className="celestial-figma-starfield" aria-hidden data-node-id="1:3" />
        <CelestialStarfield />

        <div className="relative z-10 flex flex-col items-center justify-start sm:justify-center h-full min-h-full overflow-y-auto p-4 pt-8 pb-10">
          <CrystalHud
            vaultCount={hud.vaultCount}
            seatCount={hud.seatCount}
            lastSeal={hud.lastSeal}
            heat={hud.heat}
          />

          <header className="text-center mb-6 space-y-2 relative z-10" data-node-id="1:65">
            <p className="celestial-section-title" data-node-id="1:66">
              Voidline Galaxy Farm
            </p>
            <h1 className="celestial-brand" data-node-id="1:67">
              Voidline
            </h1>
            <p className="celestial-tagline" data-node-id="1:68">
              {mode === 'home'
                ? 'Aden · Edward · Jamie — where the Arbiter waits beyond the veil.'
                : 'Three doors into deep space. Choose which cosmos burns first.'}
            </p>
          </header>

          {mode === 'home' ? (
            <div
              className={`celestial-obsidian-card${fragmenting ? ' is-fragmenting' : ''}`}
              aria-hidden={showTracker}
              data-node-id="1:70"
            >
              <div className="celestial-fragment-left space-y-4">
                {vault.length > 0 && (
                  <div className="space-y-2 mb-1">
                    <p className="celestial-section-title text-left">Continue from the vault</p>
                    {vault.map((entry) => (
                      <div key={entry.code} className="relative">
                        <button
                          type="button"
                          onClick={() => handleContinue(entry)}
                          disabled={fragmenting}
                          className="celestial-vault-row group"
                        >
                          <div className="relative w-14 h-14 shrink-0 overflow-hidden">
                            <Image
                              src={entry.coverArt}
                              alt=""
                              fill
                              sizes="56px"
                              className="object-cover opacity-90"
                            />
                          </div>
                          <div className="min-w-0 flex-1 pr-5">
                            <p
                              className="font-display text-sm text-[#f0e2c4] truncate"
                              style={{ textShadow: '0 0 15px var(--glow-color)' }}
                            >
                              {entry.title}
                            </p>
                            <p className="text-[11px] italic text-cyan-200/70 truncate">
                              <span className="six-glyph-seal__rune" style={{ fontSize: '0.85rem' }}>
                                {sealToRunes(entry.code)}
                              </span>{' '}
                              · {entry.characters.join(', ') || 'empty seats'}
                            </p>
                            <p className="text-[11px] italic text-amber-200/55 line-clamp-1 mt-0.5">
                              {entry.lastChapter}
                            </p>
                          </div>
                        </button>
                        <button
                          type="button"
                          className="celestial-forget"
                          title="Forget this seal"
                          disabled={fragmenting}
                          onClick={() => {
                            removeLocalVault(entry.code);
                            setVault(readLocalVault());
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleLightCampaign}
                  disabled={fragmenting}
                  className="celestial-cta"
                >
                  Light a New Campaign
                </button>
              </div>

              <div className="celestial-fragment-right space-y-3 mt-1">
                <div className="celestial-divider">or join by seal</div>

                <form onSubmit={handleJoinGame} className="space-y-3">
                  <SixGlyphSealInput
                    value={joinCode}
                    onChange={setJoinCode}
                    disabled={fragmenting}
                  />
                  <button
                    type="submit"
                    disabled={fragmenting || joinCode.trim().length !== 6}
                    className="celestial-cta"
                  >
                    Sit at the Table
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div className="relative z-10 w-full max-w-5xl space-y-4">
              <div className="celestial-campaign-grid">
                {CAMPAIGNS.map((campaign) => {
                  const busy = loading && pickedId === campaign.id;
                  return (
                    <button
                      key={campaign.id}
                      type="button"
                      disabled={loading || fragmenting}
                      onClick={() => handleStartCampaign(campaign.id as CampaignId)}
                      className="celestial-campaign-card"
                    >
                      <div className="relative h-36 w-full">
                        <Image
                          src={campaign.coverArt}
                          alt=""
                          fill
                          sizes="(max-width:640px) 100vw, 33vw"
                          className="object-cover opacity-75 group-hover:opacity-100 transition-opacity"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#04050f] via-[#04050f]/55 to-transparent" />
                      </div>
                      <div className="p-4 space-y-2 relative z-[1]">
                        <p className="celestial-section-title">Campaign</p>
                        <h2
                          className="font-display text-lg text-[#f8fafc] leading-tight"
                          style={{ textShadow: '0 0 15px var(--glow-color)' }}
                        >
                          {campaign.title}
                        </h2>
                        <p className="text-[13px] text-cyan-100/75 italic leading-snug">
                          {campaign.tagline}
                        </p>
                        <p className="text-[11px] text-amber-100/55 line-clamp-2 italic">
                          {campaign.tone}
                        </p>
                        <span className="inline-block mt-2 text-[12px] italic text-amber-300">
                          {busy ? 'Carving the seal…' : 'Take this table →'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                disabled={fragmenting}
                onClick={() => {
                  setMode('home');
                  setLoading(false);
                  setPickedId(null);
                }}
                className="celestial-back-link"
              >
                ← Return to the vault
              </button>
            </div>
          )}
        </div>

        <div
          className={`celestial-tracker${showTracker ? ' is-visible' : ''}`}
          aria-live="polite"
          aria-busy={!pendingRoute}
        >
          <div className="celestial-tracker__board">
            <p className="celestial-section-title mb-2">
              <span className="celestial-tracker__pulse" />
              Deep-Space Campaign Tracker
            </p>
            <h2
              className="font-display text-2xl text-white"
              style={{ textShadow: '0 0 15px var(--cosmic-cyan)' }}
            >
              Board uplink
            </h2>
            <div className="celestial-tracker__log">
              {trackerLines.map((line, i) => (
                <div
                  key={`${line}-${i}`}
                  className="celestial-tracker__log-line"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  {line}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </GameStage>
  );
}
