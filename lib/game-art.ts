/** Authored Voidline art plates — painted D&D product style (local /public). */

export const BOARD_TEXTURE = '/art/env/table-felt.webp';
export const MAP_SCENE = '/art/env/room-bg.webp';
export const PARCHMENT_GRAIN = '/art/env/parchment.webp';
export const GM_PORTRAIT = '/art/env/gm-screen.webp';
export const ROOM_BG = '/art/env/room-bg.webp';
export const TABLE_FELT = '/art/env/table-felt.webp';

const CLASS_PORTRAITS: Record<string, string> = {
  Bard: '/art/portraits/portrait-bard.webp',
  Barbarian: '/art/portraits/portrait-barbarian.webp',
  Rogue: '/art/portraits/portrait-rogue.webp',
  Sorcerer: '/art/portraits/portrait-sorcerer.webp',
  Paladin: '/art/portraits/portrait-paladin.webp',
  Adventurer: '/art/portraits/portrait-adventurer.webp',
};

/** Stable plates for Aden / Edward / Jamie. */
const NAME_PORTRAITS: Record<string, string> = {
  aden: '/art/portraits/portrait-aden.webp',
  edward: '/art/portraits/portrait-edward.webp',
  jamie: '/art/portraits/portrait-jamie.webp',
};

export function portraitForPlayer(userName?: string | null, avatarClass?: string | null): string {
  const nameKey = (userName ?? '').trim().toLowerCase();
  if (nameKey && NAME_PORTRAITS[nameKey]) {
    return NAME_PORTRAITS[nameKey];
  }

  const classKey = (avatarClass ?? 'Adventurer').trim();
  return CLASS_PORTRAITS[classKey] || CLASS_PORTRAITS.Adventurer;
}

export const ICON_BASE = 'https://raw.githubusercontent.com/game-icons/icons/master';

export const RELIC_ICONS = {
  mainWeapon: `${ICON_BASE}/lorc/broadsword.svg`,
  shield: `${ICON_BASE}/lorc/checked-shield.svg`,
  armor: `${ICON_BASE}/lorc/breastplate.svg`,
  cloak: `${ICON_BASE}/lorc/robe.svg`,
  ring: `${ICON_BASE}/delapouite/ring.svg`,
  amulet: `${ICON_BASE}/lorc/gem-pendant.svg`,
} as const;

export const INVENTORY_SLOTS = [
  { id: 'mainWeapon', label: 'Main Weapon', src: RELIC_ICONS.mainWeapon },
  { id: 'shield', label: 'Shield', src: RELIC_ICONS.shield },
  { id: 'armor', label: 'Gothic Chest Plate', src: RELIC_ICONS.armor },
  { id: 'cloak', label: 'Cloak', src: RELIC_ICONS.cloak },
  { id: 'ring', label: 'Enchanted Ring', src: RELIC_ICONS.ring },
  { id: 'amulet', label: 'Enchanted Jewel', src: RELIC_ICONS.amulet },
] as const;

export const CAMPAIGN_ART = {
  ashcrown: {
    cover: '/art/campaigns/campaign-ashcrown.webp',
    table: '/art/env/table-felt.webp',
    map: '/art/campaigns/campaign-ashcrown.webp',
    gm: '/art/env/gm-screen.webp',
  },
  saltwake: {
    cover: '/art/campaigns/campaign-saltwake.webp',
    table: '/art/env/table-felt.webp',
    map: '/art/campaigns/campaign-saltwake.webp',
    gm: '/art/env/gm-screen.webp',
  },
  blackroot: {
    cover: '/art/campaigns/campaign-blackroot.webp',
    table: '/art/env/table-felt.webp',
    map: '/art/campaigns/campaign-blackroot.webp',
    gm: '/art/env/gm-screen.webp',
  },
} as const;
