export type MatchFormat = "7v7" | "5v5";

export type Formation7v7 = "1-4-1" | "2-3-1" | "2-2-2" | "3-2-1";
export type Formation5v5 = "1-2-1" | "2-2";
export type TacticalFormation = Formation7v7 | Formation5v5;

export type MatchStatus =
  | "setup" // Inför match / inställningar
  | "running" // Klockan rullar
  | "paused" // Pausad mitt i period
  | "period_break" // Periodpaus mellan perioder
  | "finished"; // Matchen slut

export interface RosterPlayer {
  id: string;
  name: string; // Endast förnamn
  number?: string;
  avatarUrl?: string;
  preferredRole?: string; // t.ex. "MV / Back", "Mittfält", "Anfall"
  activeInSquad: boolean; // Med på dagens match / cup
}

export interface MatchPlayerState {
  id: string;
  name: string;
  number?: string;
  avatarUrl?: string;
  onPitch: boolean;
  isGoalkeeper: boolean;
  pitchSlotIndex?: number; // 0 = MV, 1..6 = utespelarpositioner i formationen
  // Ackumulerad tid fram till nuvarande statusändring / klockstart (ms)
  accumulatedOutfieldMs: number;
  accumulatedGoalkeeperMs: number;
  accumulatedBenchMs: number;
  // Tidsstämpel (matchklockans förflutna ms) när nuvarande stint på plan/bänk började
  currentStintStartMatchMs: number;
  // Antal gånger inbytt / startad
  stintsCount: number;
  // Vilka perioder spelaren stått i mål
  gkPeriods: number[];
  // Tid per platskod i den formation som gällde just då, t.ex. { FW: 180000, LIB: 90000 }
  positionMs?: Record<string, number>;
}

export interface SubstitutionLogItem {
  id: string;
  period: number;
  matchTimeMs: number;
  timestamp: number;
  type: "sub" | "gk_change" | "period_start" | "period_end" | "formation";
  playersOut: { id: string; name: string }[];
  playersIn: { id: string; name: string }[];
  note?: string;
}

export interface MatchConfig {
  format: MatchFormat; // 7v7 (6+1) eller 5v5 (4+1)
  formation: TacticalFormation; // t.ex. "1-4-1"
  periods: number; // t.ex. 2 eller 3
  periodMinutes: number; // t.ex. 15 eller 20
  opponent: string;
  location: "Hemma" | "Borta" | "Cup";
  eventTitle?: string;
  countGoalkeeperInFairness: boolean; // Om målvaktstid ska räknas lika som utespelartid
  stintMinutes?: 4 | 5 | 6 | 7; // Minuter ute innan BYT och coach-raden säger till. Saknas = 5.
}

export interface MatchSnapshot {
  label: string;
  status: MatchStatus;
  currentPeriod: number;
  periodElapsedMs: number;
  lastTickTimestamp: number | null;
  players: MatchPlayerState[];
  logs: SubstitutionLogItem[];
  ourScore: number;
  opponentScore: number;
}

export interface MatchState {
  id: string;
  createdAt: number;
  config: MatchConfig;
  status: MatchStatus;
  currentPeriod: number; // 1-index
  // Förfluten tid i nuvarande period vid senaste paus/start (ms)
  periodElapsedMs: number;
  // Om status === "running": Date.now() när klockan senast startades
  lastTickTimestamp: number | null;
  players: MatchPlayerState[];
  logs: SubstitutionLogItem[];
  ourScore: number;
  opponentScore: number;
  undoStack: MatchSnapshot[];
}

export interface ComputedPlayerMetrics {
  player: MatchPlayerState;
  outfieldMs: number;
  goalkeeperMs: number;
  totalPlayMs: number;
  benchMs: number;
  currentStintMs: number;
  conditionPct: number; // CM/FM Stamina / Condition (100% -> 35%)
  fairnessMs: number; // Den tid som jämförs mot målsnittet
  targetFairnessMs: number;
  fairnessDeltaMs: number; // + = spelat mer än snittet, - = spelat mindre än snittet
  fairnessStatus: "under" | "balanced" | "over";
  stintAlert: boolean; // Har varit inne väldigt länge i sträck eller på bänken länge
  positionMs: Record<string, number>;
}

export interface SavedMatchSummary {
  id: string;
  dateIso: string;
  opponent: string;
  eventTitle?: string;
  location: string;
  format: MatchFormat;
  formation?: TacticalFormation;
  periods: number;
  periodMinutes: number;
  ourScore: number;
  opponentScore: number;
  players: {
    id: string;
    name: string;
    number?: string;
    avatarUrl?: string;
    outfieldMs: number;
    goalkeeperMs: number;
    totalPlayMs: number;
    benchMs: number;
    positionMs?: Record<string, number>;
  }[];
}
