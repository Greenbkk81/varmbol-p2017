import { DEFAULT_ROSTER, type PresetEvent } from "./default-roster";
import type { MatchConfig, MatchSnapshot, MatchState, RosterPlayer } from "./types";

export interface CupMatch extends PresetEvent {
  kickoff: string;
  goalkeeperId: string;
}

export const CUP_SQUAD_IDS = [
  "p-oscar", "p-oliver", "p-edvin", "p-scott", "p-holger",
  "p-gabriel", "p-abdoulaye", "p-kasper", "p-charlie", "p-ebbe",
];

const FIRST_LINEUP = CUP_SQUAD_IDS.slice(0, 7);

export const CUP_MATCHES: CupMatch[] = [
  { id: "cup-2026-10-25-0930", kickoff: "09.30", opponent: "Söderköping", location: "Borta", goalkeeperId: "p-oscar", title: "09.30 · Söderköping", subtitle: "Borta · Målvakt Oscar · 2 × 25 min", format: "7v7", formation: "1-4-1", periods: 2, periodMinutes: 25 },
  { id: "cup-2026-10-25-1030", kickoff: "10.30", opponent: "Västerhaninge", location: "Hemma", goalkeeperId: "p-scott", title: "10.30 · Västerhaninge", subtitle: "Hemma · Målvakt Scott · 2 × 25 min", format: "7v7", formation: "1-4-1", periods: 2, periodMinutes: 25 },
  { id: "cup-2026-10-25-1200", kickoff: "12.00", opponent: "Ekängen", location: "Borta", goalkeeperId: "p-holger", title: "12.00 · Ekängen", subtitle: "Borta · Målvakt Holger · 2 × 25 min", format: "7v7", formation: "1-4-1", periods: 2, periodMinutes: 25 },
  { id: "cup-2026-10-25-1400", kickoff: "14.00", opponent: "Svärtinge", location: "Hemma", goalkeeperId: "p-edvin", title: "14.00 · Svärtinge", subtitle: "Hemma · Målvakt Edvin · 2 × 25 min", format: "7v7", formation: "1-4-1", periods: 2, periodMinutes: 25 },
];

export const CUP_COACH_NOTES = [
  { role: "Wings", text: "Tänk anfall och försvar. Viktigt med hemjobb." },
  { role: "Centralt mittfält", text: "Stoppa kontringar så att wings hinner hem. Fördela bollar till wings och anfall." },
  { role: "Back", text: "Styr spelet. Ropa och prata om var motståndarna finns. Fördela bollen till centralt mittfält." },
  { role: "Alla", text: "Positivt snack!" },
];

export function buildCupSetup(match: CupMatch, existingRoster: RosterPlayer[]) {
  const merged = [...existingRoster];
  for (const player of DEFAULT_ROSTER) {
    if (!merged.some((existing) => existing.id === player.id)) {
      // Återanvänd även spelare som tidigare lagts till för hand.
      const sameName = merged.find((existing) =>
        existing.name.trim().toLocaleLowerCase("sv-SE") === player.name.toLocaleLowerCase("sv-SE")
      );
      if (!sameName) merged.push({ ...player });
    }
  }
  const resolveId = (id: string) => {
    if (merged.some((player) => player.id === id)) return id;
    const name = DEFAULT_ROSTER.find((player) => player.id === id)?.name;
    return merged.find((player) => player.name.trim().toLocaleLowerCase("sv-SE") === name?.toLocaleLowerCase("sv-SE"))?.id ?? id;
  };
  const squadIds = new Set(CUP_SQUAD_IDS.map(resolveId));
  const roster = merged.map((player) => ({
    ...player,
    name: player.id === "p-abdoulaye" ? "Abdullahi" : player.name,
    activeInSquad: squadIds.has(player.id),
  }));
  // När målvakten byts mellan matcher tar Oscar hans utespelarplats.
  // Tränaren kan ändra startspelarna inför varje avspark.
  const pitchIds = FIRST_LINEUP.map((id) => resolveId(
    id === "p-oscar" ? match.goalkeeperId : id === match.goalkeeperId ? "p-oscar" : id
  ));
  const config: MatchConfig = {
    format: match.format,
    formation: match.formation,
    periods: match.periods,
    periodMinutes: match.periodMinutes,
    opponent: match.opponent,
    location: match.location,
    eventTitle: `Provcup 25 okt · ${match.title}`,
    countGoalkeeperInFairness: false,
    stintMinutes: 5,
  };
  return { roster, config, pitchIds, goalkeeperId: resolveId(match.goalkeeperId) };
}

export const INITIAL_CUP_SETUP = buildCupSetup(CUP_MATCHES[0], DEFAULT_ROSTER);

// Uppdatera dagens sparade cupmatcher utan att nollställa klocka eller statistik.
export function upgradeCupDuration(state: MatchState): MatchState {
  if (state.status === "finished" || state.config.periods !== 2 ||
      state.config.periodMinutes !== 15 ||
      !state.config.eventTitle?.startsWith("Provcup 25 okt · ")) return state;
  const extraPeriodMs = 10 * 60_000;
  const upgradeSnapshot = <T extends MatchSnapshot>(snapshot: T): T => ({
    ...snapshot,
    players: snapshot.players.map((player) => ({
      ...player,
      currentStintStartMatchMs: player.currentStintStartMatchMs +
        (snapshot.currentPeriod - 1) * extraPeriodMs,
    })),
    goals: (snapshot.goals ?? []).map((goal) => ({
      ...goal,
      matchTimeMs: goal.matchTimeMs + (goal.period - 1) * extraPeriodMs,
    })),
  });
  const upgraded = upgradeSnapshot({ ...state, label: "" });
  return {
    ...state,
    config: { ...state.config, periodMinutes: 25 },
    players: upgraded.players,
    goals: upgraded.goals,
    undoStack: (state.undoStack ?? []).map(upgradeSnapshot),
  };
}
