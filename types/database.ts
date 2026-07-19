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

export interface PlayerEntity {
  id: string;
  game_id: string;
  user_name: string;
  avatar_class: string;
  current_hp: number;
  max_hp: number;
  stats: AbilityScores;
  created_at: string;
}

export interface ThreadMessage {
  id: number;
  game_id: string;
  sender: string;
  content: string;
  created_at: string;
}

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
}

export interface GmStreamResponse {
  reply: string;
}
