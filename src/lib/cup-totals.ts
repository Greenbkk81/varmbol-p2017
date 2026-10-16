import { SavedMatchSummary } from "./types";

export interface CupPlayerRow {
  id: string;
  name: string;
  number?: string;
  matches: number;
  totalPlayMs: number;
  benchMs: number;
  goalkeeperMs: number;
  positionMs: Record<string, number>;
}

/**
 * Summerar sparade matcher. Pågående match ersätter en sparad kopia med samma id
 * så att tiden inte räknas två gånger.
 */
export function mergeCupRows(
  saved: SavedMatchSummary[],
  live: SavedMatchSummary | null
): CupPlayerRow[] {
  const source = saved.map((match) => ({ ...match, players: match.players }));
  if (live) {
    const index = source.findIndex((match) => match.id === live.id);
    if (index >= 0) source[index] = live;
    else source.push(live);
  }

  const byId = new Map<string, CupPlayerRow>();
  for (const match of source) {
    for (const player of match.players) {
      const row = byId.get(player.id) ?? {
        id: player.id,
        name: player.name,
        number: player.number,
        matches: 0,
        totalPlayMs: 0,
        benchMs: 0,
        goalkeeperMs: 0,
        positionMs: {},
      };
      row.name = player.name;
      row.number = player.number ?? row.number;
      row.matches += 1;
      row.totalPlayMs += player.totalPlayMs;
      row.benchMs += player.benchMs;
      row.goalkeeperMs += player.goalkeeperMs;
      for (const [code, ms] of Object.entries(player.positionMs ?? {})) {
        if (ms > 0) row.positionMs[code] = (row.positionMs[code] ?? 0) + ms;
      }
      byId.set(player.id, row);
    }
  }

  return [...byId.values()].sort((a, b) => b.totalPlayMs - a.totalPlayMs);
}
