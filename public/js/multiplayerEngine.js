/**
 * Multiplayer perspective engine — localized seat mapping, dice trajectories,
 * and delta-time token lerping. Absolute positions sync over the network;
 * each device remaps seats and animates locally.
 */
(function initMultiplayerEngine(global) {
  'use strict';

  const SEAT = {
    BOTTOM: 'bottom',
    LEFT: 'left',
    RIGHT: 'right',
    FAR: 'far',
  };

  const SEAT_ANCHORS = {
    bottom: { x: 50, y: 78 },
    left: { x: 16, y: 46 },
    right: { x: 84, y: 46 },
    far: { x: 50, y: 18 },
  };

  const DICE_LAUNCH = {
    bottom: { ox: 0, oy: 36, vx: 0, vy: -1, spread: 0.35 },
    left: { ox: -42, oy: 0, vx: 1, vy: -0.15, spread: 0.4 },
    right: { ox: 42, oy: 0, vx: -1, vy: -0.15, spread: 0.4 },
    far: { ox: 0, oy: -28, vx: 0, vy: 0.55, spread: 0.3 },
  };

  const DICE_REST = { x: 50, y: 22 };
  const LERP_MS = 150;
  const TABLE_PERSPECTIVE = '900px';
  const TABLE_ROTATE_X = '22deg';

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function easeOutCubic(t) {
    const u = clamp(t, 0, 1);
    return 1 - Math.pow(1 - u, 3);
  }

  function getStore() {
    return global.gameStore || null;
  }

  function profileIdOf(player) {
    if (!player) return null;
    if (player.id != null) return String(player.id);
    if (player.profileId != null) return String(player.profileId);
    if (player.user_name) return String(player.user_name);
    if (player.name) return String(player.name);
    return null;
  }

  /**
   * Build localized seat slots from absolute player roster.
   * Active local profile always maps to Bottom; remaining peers fill Left then Right.
   * Arbiter / GM stays on the far horizon seat.
   */
  function buildLocalSeatMap(players, activeProfileId) {
    const list = Array.isArray(players) ? players.slice() : [];
    const activeId = activeProfileId == null ? null : String(activeProfileId);
    const map = {
      activeProfileId: activeId,
      seats: {
        bottom: null,
        left: null,
        right: null,
        far: null,
      },
      byProfileId: {},
    };

    const peers = [];
    for (let i = 0; i < list.length; i++) {
      const player = list[i];
      const id = profileIdOf(player);
      if (!id) continue;
      const name = String(player.user_name || player.name || id).toLowerCase();
      const isGm =
        name === 'gm' ||
        name === 'arbiter' ||
        player.role === 'gm' ||
        player.isGm === true;
      if (isGm) {
        map.seats.far = id;
        map.byProfileId[id] = SEAT.FAR;
        continue;
      }
      if (activeId && id === activeId) {
        map.seats.bottom = id;
        map.byProfileId[id] = SEAT.BOTTOM;
        continue;
      }
      peers.push(id);
    }

    if (activeId && !map.byProfileId[activeId]) {
      map.seats.bottom = activeId;
      map.byProfileId[activeId] = SEAT.BOTTOM;
    }

    peers.sort();
    for (let i = 0; i < peers.length; i++) {
      const id = peers[i];
      if (map.byProfileId[id]) continue;
      const slot = !map.seats.left ? SEAT.LEFT : !map.seats.right ? SEAT.RIGHT : SEAT.FAR;
      map.seats[slot] = map.seats[slot] || id;
      map.byProfileId[id] = slot;
    }

    return map;
  }

  function seatForProfile(seatMap, profileId) {
    if (!seatMap || profileId == null) return SEAT.FAR;
    return seatMap.byProfileId[String(profileId)] || SEAT.FAR;
  }

  /**
   * Convert absolute table percent coords into the local seat-relative view.
   * Rotation keeps the active player visually at the bottom edge.
   */
  function localizeAbsolutePosition(absolutePos, seatMap, profileId) {
    const seat = seatForProfile(seatMap, profileId);
    const anchor = SEAT_ANCHORS[seat] || SEAT_ANCHORS.far;
    if (!absolutePos || typeof absolutePos.x !== 'number' || typeof absolutePos.y !== 'number') {
      return { x: anchor.x, y: anchor.y, seat };
    }

    const cx = 50;
    const cy = 50;
    const dx = absolutePos.x - cx;
    const dy = absolutePos.y - cy;
    const localSeat = seatMap && seatMap.seats ? seatMap.seats.bottom : null;
    const rotationTurns = localSeat ? seatRotationTurns(seatMap, localSeat) : 0;
    const angle = rotationTurns * (Math.PI / 2);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const rx = dx * cos - dy * sin;
    const ry = dx * sin + dy * cos;

    return {
      x: clamp(cx + rx, 8, 92),
      y: clamp(cy + ry, 12, 88),
      seat,
    };
  }

  function seatRotationTurns(seatMap, bottomProfileId) {
    const players = [];
    const store = getStore();
    const roster = store && Array.isArray(store.state.players) ? store.state.players : [];
    for (let i = 0; i < roster.length; i++) {
      const id = profileIdOf(roster[i]);
      if (!id) continue;
      const name = String(roster[i].user_name || roster[i].name || '').toLowerCase();
      if (name === 'gm' || name === 'arbiter') continue;
      players.push(id);
    }
    if (!players.length) return 0;
    const idx = players.indexOf(String(bottomProfileId));
    if (idx < 0) return 0;
    return idx % 4;
  }

  function seatAnchorPosition(seat) {
    const anchor = SEAT_ANCHORS[seat] || SEAT_ANCHORS.far;
    return { x: anchor.x, y: anchor.y, seat: seat || SEAT.FAR };
  }

  /**
   * Resolve the on-screen seat slot position for a profile in the local viewport.
   * Prefers absolute synced coords remapped into local space; falls back to seat anchors.
   */
  function resolveLocalTokenPosition(profileId, absolutePositions, seatMap) {
    const id = profileId == null ? null : String(profileId);
    const absMap = absolutePositions || {};
    const absolute = id ? absMap[id] : null;
    if (absolute) {
      return localizeAbsolutePosition(absolute, seatMap, id);
    }
    const seat = seatForProfile(seatMap, id);
    return seatAnchorPosition(seat);
  }

  function applyTablePerspective(planeEl) {
    if (!planeEl || !planeEl.style) return;
    planeEl.style.transform = `perspective(${TABLE_PERSPECTIVE}) rotateX(${TABLE_ROTATE_X})`;
    planeEl.style.transformOrigin = '50% 100%';
    planeEl.style.transformStyle = 'preserve-3d';
  }

  function applyStagePerspective(stageEl) {
    if (!stageEl || !stageEl.style) return;
    stageEl.style.perspective = TABLE_PERSPECTIVE;
    stageEl.style.perspectiveOrigin = '50% 78%';
  }

  /** Token mesh lerper — glides toward network targets over 150ms using delta time. */
  function createTokenLerpController() {
    const meshes = new Map();

    function ensure(profileId) {
      const id = String(profileId);
      let entry = meshes.get(id);
      if (!entry) {
        entry = {
          profileId: id,
          current: { x: 50, y: 50 },
          from: { x: 50, y: 50 },
          target: { x: 50, y: 50 },
          elapsed: LERP_MS,
          duration: LERP_MS,
          element: null,
        };
        meshes.set(id, entry);
      }
      return entry;
    }

    return {
      attach(profileId, element) {
        const entry = ensure(profileId);
        entry.element = element || null;
        return entry;
      },

      setImmediate(profileId, pos) {
        const entry = ensure(profileId);
        entry.current.x = pos.x;
        entry.current.y = pos.y;
        entry.from.x = pos.x;
        entry.from.y = pos.y;
        entry.target.x = pos.x;
        entry.target.y = pos.y;
        entry.elapsed = entry.duration;
        paint(entry);
      },

      /**
       * Peer position packet received — start a 150ms glide instead of snapping.
       */
      setTarget(profileId, pos, durationMs) {
        const entry = ensure(profileId);
        entry.from.x = entry.current.x;
        entry.from.y = entry.current.y;
        entry.target.x = clamp(pos.x, 8, 92);
        entry.target.y = clamp(pos.y, 12, 88);
        entry.duration = typeof durationMs === 'number' ? durationMs : LERP_MS;
        entry.elapsed = 0;
      },

      tick(dtMs) {
        const dt = typeof dtMs === 'number' && dtMs > 0 ? dtMs : 16.67;
        meshes.forEach((entry) => {
          if (entry.elapsed >= entry.duration) {
            entry.current.x = entry.target.x;
            entry.current.y = entry.target.y;
            paint(entry);
            return;
          }
          entry.elapsed = Math.min(entry.duration, entry.elapsed + dt);
          const t = easeOutCubic(entry.elapsed / entry.duration);
          entry.current.x = lerp(entry.from.x, entry.target.x, t);
          entry.current.y = lerp(entry.from.y, entry.target.y, t);
          paint(entry);
        });
      },

      getCurrent(profileId) {
        const entry = meshes.get(String(profileId));
        return entry ? { x: entry.current.x, y: entry.current.y } : null;
      },

      clear() {
        meshes.clear();
      },
    };

    function paint(entry) {
      if (!entry.element || !entry.element.style) return;
      entry.element.style.left = `${entry.current.x}%`;
      entry.element.style.top = `${entry.current.y}%`;
    }
  }

  /**
   * Local dice launch vector from a seat slot. Network only carries the final face
   * integer (and seed); trajectory mesh motion is computed per device.
   */
  function createLocalDiceTrajectory(seat, finalValue, tableRect) {
    const launch = DICE_LAUNCH[seat] || DICE_LAUNCH.bottom;
    const width = tableRect && tableRect.width ? tableRect.width : 800;
    const height = tableRect && tableRect.height ? tableRect.height : 600;
    const originX =
      seat === SEAT.BOTTOM
        ? width * 0.5
        : seat === SEAT.LEFT
          ? width * 0.08
          : seat === SEAT.RIGHT
            ? width * 0.92
            : width * 0.5;
    const originY =
      seat === SEAT.BOTTOM
        ? height * 0.92
        : seat === SEAT.LEFT || seat === SEAT.RIGHT
          ? height * 0.55
          : height * 0.18;
    const restX = width * (DICE_REST.x / 100);
    const restY = height * (DICE_REST.y / 100);
    const face = clamp(Math.floor(Number(finalValue) || 1), 1, 20);

    const particles = [];
    for (let i = 0; i < 5; i++) {
      const jitter = (Math.random() - 0.5) * launch.spread;
      const speed = 9 + Math.random() * 7;
      particles.push({
        id: Math.random(),
        x: originX + launch.ox + (Math.random() - 0.5) * 16,
        y: originY + launch.oy + (Math.random() - 0.5) * 12,
        vx: launch.vx * speed + jitter * 10,
        vy: launch.vy * speed + (Math.random() - 0.5) * 3,
        rotation: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 0.45,
        size: 16 + Math.random() * 10,
        alpha: 1,
        value: face,
        settleX: restX + (Math.random() - 0.5) * 26,
        settleY: restY + (Math.random() - 0.5) * 18,
        age: 0,
        settled: false,
      });
    }
    return particles;
  }

  function stepDiceParticles(particles, dtMs) {
    const dt = typeof dtMs === 'number' && dtMs > 0 ? dtMs : 16.67;
    const scale = dt / 16.67;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      if (!p.settled) {
        p.x += p.vx * scale;
        p.y += p.vy * scale;
        p.rotation += p.vRot * scale;
        p.vy += 0.22 * scale;
        const toRestX = p.settleX - p.x;
        const toRestY = p.settleY - p.y;
        p.vx += toRestX * 0.018 * scale;
        p.vy += toRestY * 0.018 * scale;
        p.vx *= Math.pow(0.985, scale);
        p.vy *= Math.pow(0.985, scale);
        if (p.age > 700 && Math.abs(toRestX) < 8 && Math.abs(toRestY) < 8) {
          p.settled = true;
          p.x = p.settleX;
          p.y = p.settleY;
          p.vx = 0;
          p.vy = 0;
          p.vRot *= 0.2;
        }
      } else {
        p.rotation += p.vRot * scale;
        p.vRot *= Math.pow(0.96, scale);
        p.alpha -= 0.004 * scale;
      }
      if (p.alpha <= 0) {
        particles.splice(i, 1);
      }
    }
    return particles;
  }

  /**
   * Broadcast payload for a roll — seed + final integer only. No per-frame coords.
   */
  function buildRollBroadcast({ rollerId, expression, total, seed }) {
    return {
      type: 'dice_roll',
      rollerId: rollerId == null ? null : String(rollerId),
      expression: expression || '1d20',
      total: clamp(Math.floor(Number(total) || 1), 1, 999),
      seed: seed == null ? Date.now() : seed,
      at: Date.now(),
    };
  }

  function createEngine(options) {
    const opts = options || {};
    const tokenLerp = createTokenLerpController();
    const diceParticles = [];
    let lastTs = 0;
    let rafId = 0;
    let running = false;
    let seatMap = buildLocalSeatMap([], null);

    function refreshSeatMap() {
      const store = getStore();
      const players = store ? store.state.players : opts.players || [];
      const activeId = store ? store.state.activeProfileId : opts.activeProfileId || null;
      seatMap = buildLocalSeatMap(players, activeId);
      return seatMap;
    }

    function ingestPeerPosition(profileId, absolutePos) {
      refreshSeatMap();
      const local = resolveLocalTokenPosition(
        profileId,
        { [String(profileId)]: absolutePos },
        seatMap
      );
      tokenLerp.setTarget(profileId, local, LERP_MS);
      return local;
    }

    function ingestAbsolutePositions(absoluteMap) {
      refreshSeatMap();
      const ids = Object.keys(absoluteMap || {});
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const local = resolveLocalTokenPosition(id, absoluteMap, seatMap);
        const existing = tokenLerp.getCurrent(id);
        if (!existing) {
          tokenLerp.setImmediate(id, local);
        } else {
          tokenLerp.setTarget(id, local, LERP_MS);
        }
      }
      return seatMap;
    }

    function handleRollBroadcast(packet, tableRect) {
      refreshSeatMap();
      const rollerId = packet && packet.rollerId != null ? String(packet.rollerId) : null;
      const seat = seatForProfile(seatMap, rollerId);
      const total = packet && packet.total != null ? packet.total : 1;
      const spawned = createLocalDiceTrajectory(seat, total, tableRect);
      for (let i = 0; i < spawned.length; i++) {
        diceParticles.push(spawned[i]);
      }
      const store = getStore();
      if (store) store.setLastRoll(packet);
      return { seat, total, count: spawned.length };
    }

    function frame(ts) {
      if (!running) return;
      if (!lastTs) lastTs = ts;
      const dt = Math.min(48, ts - lastTs);
      lastTs = ts;
      tokenLerp.tick(dt);
      stepDiceParticles(diceParticles, dt);
      if (typeof opts.onFrame === 'function') {
        opts.onFrame({
          dt,
          diceParticles,
          seatMap,
          tokenLerp,
        });
      }
      rafId = global.requestAnimationFrame(frame);
    }

    return {
      SEAT,
      refreshSeatMap,
      getSeatMap() {
        return seatMap;
      },
      resolveLocalTokenPosition(profileId, absoluteMap) {
        refreshSeatMap();
        return resolveLocalTokenPosition(profileId, absoluteMap || {}, seatMap);
      },
      ingestPeerPosition,
      ingestAbsolutePositions,
      handleRollBroadcast,
      buildRollBroadcast,
      applyTablePerspective,
      applyStagePerspective,
      tokenLerp,
      getDiceParticles() {
        return diceParticles;
      },
      start() {
        if (running) return;
        running = true;
        lastTs = 0;
        refreshSeatMap();
        rafId = global.requestAnimationFrame(frame);
      },
      stop() {
        running = false;
        if (rafId) global.cancelAnimationFrame(rafId);
        rafId = 0;
        lastTs = 0;
      },
    };
  }

  const api = {
    SEAT,
    SEAT_ANCHORS,
    DICE_REST,
    LERP_MS,
    TABLE_PERSPECTIVE,
    TABLE_ROTATE_X,
    lerp,
    easeOutCubic,
    buildLocalSeatMap,
    seatForProfile,
    localizeAbsolutePosition,
    resolveLocalTokenPosition,
    seatAnchorPosition,
    createLocalDiceTrajectory,
    stepDiceParticles,
    buildRollBroadcast,
    createTokenLerpController,
    applyTablePerspective,
    applyStagePerspective,
    createEngine,
  };

  global.multiplayerEngine = api;
  return api;
})(typeof window !== 'undefined' ? window : globalThis);
