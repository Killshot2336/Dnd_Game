/**
 * Voidline gameStore — local multiplayer profile + table state.
 * Absolute positions live here for sync; each device remaps seats locally.
 */
(function initGameStore(global) {
  'use strict';

  const listeners = new Set();

  const state = {
    activeProfileId: null,
    profiles: {},
    players: [],
    absoluteTokenPositions: {},
    lastRoll: null,
    gmSeatId: 'arbiter',
  };

  function emit() {
    listeners.forEach((fn) => {
      try {
        fn(state);
      } catch (err) {
        console.error('gameStore listener error', err);
      }
    });
  }

  const gameStore = {
    state,

    setActiveProfile(profileId) {
      state.activeProfileId = profileId == null ? null : String(profileId);
      emit();
      return state.activeProfileId;
    },

    upsertProfile(profile) {
      if (!profile || profile.id == null) return null;
      const id = String(profile.id);
      state.profiles[id] = {
        id,
        name: profile.name || 'Adventurer',
        hp: typeof profile.hp === 'number' ? profile.hp : null,
        maxHp: typeof profile.maxHp === 'number' ? profile.maxHp : null,
        ...profile,
        id,
      };
      emit();
      return state.profiles[id];
    },

    setPlayers(playerList) {
      state.players = Array.isArray(playerList) ? playerList.slice() : [];
      state.players.forEach((player) => {
        if (player && player.id != null) {
          gameStore.upsertProfile(player);
        }
      });
      emit();
      return state.players;
    },

    /**
     * Absolute table coordinates only — never write localized seat coords to sync.
     * @param {string} profileId
     * @param {{ x: number, y: number }} pos percent coords on the absolute table plane
     */
    setAbsoluteTokenPosition(profileId, pos) {
      if (profileId == null || !pos) return null;
      const id = String(profileId);
      const x = Math.min(92, Math.max(8, Number(pos.x)));
      const y = Math.min(88, Math.max(12, Number(pos.y)));
      if (Number.isNaN(x) || Number.isNaN(y)) return null;
      state.absoluteTokenPositions[id] = { x, y };
      emit();
      return state.absoluteTokenPositions[id];
    },

    setAbsoluteTokenPositions(map) {
      const next = {};
      if (map && typeof map === 'object') {
        Object.keys(map).forEach((key) => {
          const pos = map[key];
          if (!pos) return;
          const x = Number(pos.x);
          const y = Number(pos.y);
          if (Number.isNaN(x) || Number.isNaN(y)) return;
          next[String(key)] = {
            x: Math.min(92, Math.max(8, x)),
            y: Math.min(88, Math.max(12, y)),
          };
        });
      }
      state.absoluteTokenPositions = next;
      emit();
      return state.absoluteTokenPositions;
    },

    setLastRoll(roll) {
      state.lastRoll = roll || null;
      emit();
      return state.lastRoll;
    },

    subscribe(fn) {
      if (typeof fn !== 'function') return () => {};
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };

  global.gameStore = gameStore;
  return gameStore;
})(typeof window !== 'undefined' ? window : globalThis);
