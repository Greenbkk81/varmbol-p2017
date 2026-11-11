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

// Dagens trupp mot KAIK (7 anmälda i Svenskalag där Bilel ersätter Oliver + Jack & Amr inlånade från P2018 = 9 spelare)
export const KAIK_SQUAD_IDS = [
  "p-oscar",
  "p-bilel",
  "p-edvin",
  "p-scott",
  "p-holger",
  "p-gabriel",
  "p-abdoulaye",
  "p-jack",
  "p-amr",
];

const FIRST_LINEUP = CUP_SQUAD_IDS.slice(0, 7);

export const CUP_MATCHES: CupMatch[] = [
  { id: "cup-2026-10-25-0930", kickoff: "09.30", opponent: "Söderköping", location: "Borta", goalkeeperId: "p-oscar", title: "09.30 · Söderköping", subtitle: "Borta · Målvakt Oscar · 1 × 25 min", format: "7v7", formation: "1-4-1", periods: 1, periodMinutes: 25 },
  { id: "cup-2026-10-25-1030", kickoff: "10.30", opponent: "Västerhaninge", location: "Hemma", goalkeeperId: "p-scott", title: "10.30 · Västerhaninge", subtitle: "Hemma · Målvakt Scott · 1 × 25 min", format: "7v7", formation: "1-4-1", periods: 1, periodMinutes: 25 },
  { id: "cup-2026-10-25-1200", kickoff: "12.00", opponent: "Ekängen", location: "Borta", goalkeeperId: "p-holger", title: "12.00 · Ekängen", subtitle: "Borta · Målvakt Holger · 1 × 25 min", format: "7v7", formation: "1-4-1", periods: 1, periodMinutes: 25 },
  { id: "cup-2026-10-25-1400", kickoff: "14.00", opponent: "Svärtinge", location: "Hemma", goalkeeperId: "p-edvin", title: "14.00 · Svärtinge", subtitle: "Hemma · Målvakt Edvin · 1 × 25 min", format: "7v7", formation: "1-4-1", periods: 1, periodMinutes: 25 },
];

export const CUP_COACH_NOTES = [
  {
    role: "Vänsterparet (VM + CM Vänster)",
    text: "Kämpa ihop om hela vänstersidan! Går vänsteryttern (VM) fram tar CM Vänster (IMV) ansvar lite bakåt på vänstersidan (inte ända ner i knät på backen) så kanten aldrig lämnas öppen.",
  },
  {
    role: "Högerparet (HM + CM Höger)",
    text: "Kämpa ihop om hela högersidan! Går högeryttern (HM) fram säkrar CM Höger (IMH) upp bakåt på högersidan så vi alltid är två som tar ansvar.",
  },
  {
    role: "Back & Ankare",
    text: "Styr spelet bakifrån. Ropa och prata om var motståndarna finns och spela ut till våra sidopar.",
  },
  {
    role: "Alla",
    text: "Positivt snack och hjälpa varandra två och två!",
  },
];

export const FORMATION_COACH_NOTES: Record<
  string,
  { role: string; text: string }[]
> = {
  "1-4-1": CUP_COACH_NOTES,
  "1-1-3-1": [
    {
      role: "Back (LIB) + Ankare (DM)",
      text: "En sista back och en defensiv mittfältare (DM) strax framför som stänger mitten och stoppar kontringar tidigt.",
    },
    {
      role: "Yttrar (VM & HM)",
      text: "Håll bredden i anfall och jobba hem längs kanten i försvar så DM och backen får hjälp.",
    },
    {
      role: "Central mitt (CM) & Forward (FW)",
      text: "Länka ihop spelet framåt, vänd upp och fyll på i straffområdet tillsammans.",
    },
    {
      role: "Alla",
      text: "Positivt snack och tydliga roller när vi byter mellan 1-4-1 och 1-1-3-1!",
    },
  ],
};

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

export function buildKaikSetup(
  existingRoster: RosterPlayer[],
  formation: "1-4-1" | "1-1-3-1" = "1-4-1"
) {
  const merged = [...existingRoster];
  for (const player of DEFAULT_ROSTER) {
    if (!merged.some((existing) => existing.id === player.id)) {
      const sameName = merged.find(
        (existing) =>
          existing.name.trim().toLocaleLowerCase("sv-SE") ===
          player.name.toLocaleLowerCase("sv-SE")
      );
      if (!sameName) merged.push({ ...player });
    }
  }
  const resolveId = (id: string) => {
    if (merged.some((player) => player.id === id)) return id;
    const name = DEFAULT_ROSTER.find((player) => player.id === id)?.name;
    return (
      merged.find(
        (player) =>
          player.name.trim().toLocaleLowerCase("sv-SE") ===
          name?.toLocaleLowerCase("sv-SE")
      )?.id ?? id
    );
  };
  const squadIds = new Set(KAIK_SQUAD_IDS.map(resolveId));
  const roster = merged.map((player) => ({
    ...player,
    name: player.id === "p-abdoulaye" ? "Abdullahi" : player.name,
    activeInSquad: squadIds.has(player.id),
  }));
  const pitchIds = KAIK_SQUAD_IDS.slice(0, 7).map(resolveId);
  const config: MatchConfig = {
    format: "7v7",
    formation,
    periods: 3,
    periodMinutes: 15,
    opponent: "Katrineholms AIK",
    location: "Hemma",
    eventTitle:
      formation === "1-1-3-1"
        ? "Träningsmatch mot KAIK · 1-1-3-1 (Jocke)"
        : "Träningsmatch mot KAIK · 1-4-1 (Lars)",
    countGoalkeeperInFairness: false,
    stintMinutes: 5,
  };
  return {
    roster,
    config,
    pitchIds,
    goalkeeperId: resolveId("p-oscar"),
  };
}

export const INITIAL_KAIK_SETUP = buildKaikSetup(DEFAULT_ROSTER, "1-4-1");

// Uppdatera dagens sparade cupmatcher utan att nollställa spelad tid.
export function upgradeCupDuration(state: MatchState): MatchState {
  if (state.status === "finished" || state.config.periods !== 2 ||
      ![15, 25].includes(state.config.periodMinutes) ||
      !state.config.eventTitle?.startsWith("Provcup 25 okt · ")) return state;
  const oldPeriodMs = state.config.periodMinutes * 60_000;
  const upgradeSnapshot = <T extends MatchSnapshot>(snapshot: T): T => ({
    ...snapshot,
    status: snapshot.status === "period_break" ? "paused" : snapshot.status,
    currentPeriod: 1,
    periodElapsedMs: snapshot.periodElapsedMs + (snapshot.currentPeriod - 1) * oldPeriodMs,
    players: snapshot.players.map((player) => ({
      ...player,
      gkPeriods: player.gkPeriods.length ? [1] : [],
    })),
    logs: snapshot.logs.map((log) => ({
      ...log,
      period: 1,
      matchTimeMs: log.matchTimeMs + (log.period - 1) * oldPeriodMs,
    })),
    goals: (snapshot.goals ?? []).map((goal) => ({ ...goal, period: 1 })),
  });
  const upgraded = upgradeSnapshot({ ...state, label: "" });
  return {
    ...state,
    config: { ...state.config, periods: 1, periodMinutes: 25 },
    status: upgraded.status,
    currentPeriod: 1,
    periodElapsedMs: upgraded.periodElapsedMs,
    players: upgraded.players,
    logs: upgraded.logs,
    goals: upgraded.goals,
    undoStack: (state.undoStack ?? []).map(upgradeSnapshot),
  };
}
