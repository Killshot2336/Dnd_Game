export interface AbilityScores {
  STR: number;
  DEX: number;
  CON: number;
  INT: number;
  WIS: number;
  CHA: number;
}

export interface GameRecord {
  id: string;
  session_code: string;
  current_narrative: string;
  state_data: Record<string, unknown>;
  created_at: string;
}

export interface SheetSnapshot {
  seed?: string;
  name?: string;
  templateId?: string;
  race?: string;
  className?: string;
  subclass?: string;
  background?: string;
  level?: number;
  stats?: AbilityScores;
  skills?: string[];
  features?: string[];
  equipment?: string[];
  backstory?: string;
  appearance?: string;
  ideals?: string;
  bonds?: string;
  flaws?: string;
  skin?: { portraitKey?: string; tint?: string };
  maxHp?: number;
  armorClass?: number;
  speed?: number;
}

export interface PlayerEntity {
  id: string;
  game_id: string;
  user_name: string;
  avatar_class: string;
  current_hp: number;
  max_hp: number;
  stats: AbilityScores;
  created_at: string;
  character_id?: string | null;
  seed?: string | null;
  sheet_snapshot?: SheetSnapshot;
}

export interface ThreadMessage {
  id: number;
  game_id: string;
  sender: string;
  content: string;
  created_at: string;
}

/** Legacy payload kept for compatibility with older join paths. */
export interface CharacterPayload {
  name: string;
  characterClass: string;
  stats: AbilityScores;
}

export interface HistoryMessage {
  sender: string;
  content: string;
}

export interface GmStreamRequest {
  playerInput: string;
  sender: string;
  gameId: string;
  history: HistoryMessage[];
  partySheets?: string[];
  actorSheet?: string;
}

export interface GmStreamResponse {
  reply: string;
}
