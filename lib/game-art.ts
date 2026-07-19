/** Curated high-res art plates for the Voidline tabletop client. */

export const BOARD_TEXTURE =
  'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=2400&q=80';

export const MAP_SCENE =
  'https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?auto=format&fit=crop&w=2400&q=80';

export const PARCHMENT_GRAIN =
  'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1600&q=60';

export const GM_PORTRAIT =
  'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=900&q=80';

const CLASS_PORTRAITS: Record<string, string> = {
  Bard: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=800&q=80',
  Barbarian:
    'https://images.unsplash.com/photo-1460194436988-671f763436b7?auto=format&fit=crop&w=800&q=80',
  Rogue:
    'https://images.unsplash.com/photo-1509248961158-e54f6934749c?auto=format&fit=crop&w=800&q=80',
  Sorcerer:
    'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=800&q=80',
  Paladin:
    'https://images.unsplash.com/photo-1578662996442-48f60103fc96?auto=format&fit=crop&w=800&q=80',
  Adventurer:
    'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=800&q=80',
};

/** Stable alternate plates keyed by player name for Aden / Edward / Jamie. */
const NAME_PORTRAITS: Record<string, string> = {
  aden: 'https://images.unsplash.com/photo-1460194436988-671f763436b7?auto=format&fit=crop&w=800&q=80',
  edward:
    'https://images.unsplash.com/photo-1509248961158-e54f6934749c?auto=format&fit=crop&w=800&q=80',
  jamie:
    'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=800&q=80',
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
