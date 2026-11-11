import { list, put } from "@vercel/blob";
import crypto from "node:crypto";
import { INITIAL_KAIK_SETUP } from "./cup-plan";
import { createInitialMatchState } from "./match-engine";
import {
  LiveSyncSnapshot,
  MatchConfig,
  MatchFormat,
  RosterPlayer,
  TacticalFormation,
  TeamColors,
  TeamProfile,
  TeamRegistry,
  TeamRegistryEntry,
} from "./types";

const REGISTRY_BLOB_PATH = "system/teams-registry-v1.json";
export const VFC_P2017_TEAM_ID = "vfc-p2017";
export const LEGACY_VFC_BLOB_PATH = "varmbol-p2017/live-state-v1.json";

declare global {
  var __varmbolTeamRegistryMemory: TeamRegistry | null | undefined;
  var __varmbolTeamSnapshotsMemory: Map<string, LiveSyncSnapshot> | undefined;
}

export function hasBlobToken(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function getSnapshotsMap(): Map<string, LiveSyncSnapshot> {
  if (!globalThis.__varmbolTeamSnapshotsMemory) {
    globalThis.__varmbolTeamSnapshotsMemory = new Map<string, LiveSyncSnapshot>();
  }
  return globalThis.__varmbolTeamSnapshotsMemory;
}

export function normalizeCode(raw: string | undefined | null): string {
  return (raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

export function buildDefaultVfcEntry(): TeamRegistryEntry {
  const coachCode = normalizeCode(
    process.env.DEFAULT_VFC_COACH_CODE || "VFC2017"
  );
  const followCode = normalizeCode(
    process.env.DEFAULT_VFC_FOLLOW_CODE || "VFCLIVE"
  );
  return {
    id: VFC_P2017_TEAM_ID,
    clubName: "Värmbols FC",
    teamName: "P2017",
    displayName: "Värmbols FC P2017",
    shortName: "VFC",
    arenaName: "Värmbols IP · Katrineholm",
    coaches: ["Lars", "Jocke", "Sofia"],
    logoUrl: "/club/varmbol-logo-white.png",
    colors: {
      primary: "#005cb9",
      secondary: "#facc15",
    },
    defaultFormat: "7v7",
    defaultFormation: "1-4-1",
    isDefaultVfcTeam: true,
    coachCode,
    followCode,
    blobPath: LEGACY_VFC_BLOB_PATH,
    active: true,
    createdAt: 1729843200000,
    updatedAt: Date.now(),
  };
}

export function toPublicTeamProfile(entry: TeamRegistryEntry): TeamProfile {
  return {
    id: entry.id,
    clubName: entry.clubName,
    teamName: entry.teamName,
    displayName: entry.displayName,
    shortName: entry.shortName,
    arenaName: entry.arenaName,
    coaches: entry.coaches,
    logoUrl: entry.logoUrl,
    colors: entry.colors,
    defaultFormat: entry.defaultFormat,
    defaultFormation: entry.defaultFormation,
    isDefaultVfcTeam: entry.isDefaultVfcTeam,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

export const DEFAULT_PUBLIC_VFC_PROFILE: TeamProfile = toPublicTeamProfile(
  buildDefaultVfcEntry()
);

function ensureDefaultTeamInRegistry(registry: TeamRegistry): TeamRegistry {
  const defaultVfc = buildDefaultVfcEntry();
  const exists = registry.teams.some((t) => t.id === VFC_P2017_TEAM_ID);
  if (!exists) {
    return {
      ...registry,
      teams: [defaultVfc, ...registry.teams],
    };
  }
  return {
    ...registry,
    teams: registry.teams.map((t) =>
      t.id === VFC_P2017_TEAM_ID
        ? {
            ...defaultVfc,
            ...t,
            blobPath: LEGACY_VFC_BLOB_PATH,
            isDefaultVfcTeam: true,
          }
        : t
    ),
  };
}

export async function getTeamRegistry(): Promise<TeamRegistry> {
  if (!hasBlobToken()) {
    if (!globalThis.__varmbolTeamRegistryMemory) {
      globalThis.__varmbolTeamRegistryMemory = {
        version: 1,
        updatedAt: Date.now(),
        teams: [buildDefaultVfcEntry()],
      };
    }
    return ensureDefaultTeamInRegistry(globalThis.__varmbolTeamRegistryMemory);
  }

  try {
    const { blobs } = await list({ prefix: REGISTRY_BLOB_PATH, limit: 5 });
    const exact =
      blobs.find((item) => item.pathname === REGISTRY_BLOB_PATH) ?? blobs[0];
    if (!exact) {
      const initial: TeamRegistry = {
        version: 1,
        updatedAt: Date.now(),
        teams: [buildDefaultVfcEntry()],
      };
      globalThis.__varmbolTeamRegistryMemory = initial;
      return initial;
    }
    const res = await fetch(`${exact.url}?t=${Date.now()}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error("Kunde inte läsa lagregister");
    }
    const parsed = (await res.json()) as TeamRegistry;
    const normalized = ensureDefaultTeamInRegistry(parsed);
    globalThis.__varmbolTeamRegistryMemory = normalized;
    return normalized;
  } catch {
    if (globalThis.__varmbolTeamRegistryMemory) {
      return ensureDefaultTeamInRegistry(globalThis.__varmbolTeamRegistryMemory);
    }
    return {
      version: 1,
      updatedAt: Date.now(),
      teams: [buildDefaultVfcEntry()],
    };
  }
}

export async function saveTeamRegistry(
  registry: TeamRegistry
): Promise<TeamRegistry> {
  const next: TeamRegistry = ensureDefaultTeamInRegistry({
    ...registry,
    version: (registry.version ?? 0) + 1,
    updatedAt: Date.now(),
  });
  globalThis.__varmbolTeamRegistryMemory = next;
  if (hasBlobToken()) {
    await put(REGISTRY_BLOB_PATH, JSON.stringify(next), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 0,
      contentType: "application/json",
    });
  }
  return next;
}

export function slugifyTeamId(clubName: string, teamName: string): string {
  const raw = `${clubName}-${teamName}`
    .toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return raw || `lag-${Date.now().toString(36)}`;
}

export function generateTeamCode(prefix: string): string {
  const cleanPrefix = prefix
    .toUpperCase()
    .replace(/[ÅÄ]/g, "A")
    .replace(/Ö/g, "O")
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 4) || "LAG";
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let suffix = "";
  const bytes = crypto.randomBytes(4);
  for (let i = 0; i < 4; i++) {
    suffix += chars[bytes[i] % chars.length];
  }
  return `${cleanPrefix}-${suffix}`;
}

export function generateOpaqueBlobPath(teamId: string): string {
  if (teamId === VFC_P2017_TEAM_ID) {
    return LEGACY_VFC_BLOB_PATH;
  }
  const secret =
    process.env.AUTH_SECRET ||
    process.env.BLOB_READ_WRITE_TOKEN ||
    "vfc-blob-salt-2017";
  const hash = crypto
    .createHmac("sha256", secret)
    .update(`team-blob:${teamId}`)
    .digest("hex")
    .slice(0, 16);
  return `teams/${teamId}-${hash}/live-state-v1.json`;
}

export function buildInitialSnapshotForTeam(
  entry: TeamRegistryEntry,
  initialPlayerNames?: string[]
): LiveSyncSnapshot {
  if (entry.id === VFC_P2017_TEAM_ID) {
    const matchState = createInitialMatchState(
      INITIAL_KAIK_SETUP.roster,
      INITIAL_KAIK_SETUP.config,
      INITIAL_KAIK_SETUP.pitchIds,
      INITIAL_KAIK_SETUP.goalkeeperId
    );
    return {
      version: 1,
      updatedAt: Date.now(),
      teamId: entry.id,
      teamProfile: toPublicTeamProfile(entry),
      controllerId: "seed",
      roster: INITIAL_KAIK_SETUP.roster,
      matchState,
      savedMatches: [],
    };
  }

  const cleanNames = (initialPlayerNames ?? [])
    .map((n) => n.trim())
    .filter(Boolean);

  const roster: RosterPlayer[] = cleanNames.map((name, idx) => ({
    id: `p-${idx + 1}-${Date.now().toString(36)}`,
    name,
    activeInSquad: true,
  }));

  const format: MatchFormat = entry.defaultFormat || "7v7";
  const formation: TacticalFormation =
    entry.defaultFormation || (format === "7v7" ? "1-4-1" : "1-2-1");
  const capacity = format === "7v7" ? 7 : 5;

  const config: MatchConfig = {
    format,
    formation,
    periods: 3,
    periodMinutes: 15,
    opponent: "Motståndare",
    location: "Hemma",
    eventTitle: `${entry.displayName} · Match`,
    countGoalkeeperInFairness: false,
    stintMinutes: 5,
  };

  const pitchIds = roster.slice(0, capacity).map((p) => p.id);
  const goalkeeperId = pitchIds[0] || "";

  const matchState = createInitialMatchState(
    roster,
    config,
    pitchIds,
    goalkeeperId
  );

  return {
    version: 1,
    updatedAt: Date.now(),
    teamId: entry.id,
    teamProfile: toPublicTeamProfile(entry),
    controllerId: "seed",
    roster,
    matchState,
    savedMatches: [],
  };
}

export async function readTeamSnapshot(
  teamId: string,
  registry?: TeamRegistry
): Promise<LiveSyncSnapshot | null> {
  const reg = registry ?? (await getTeamRegistry());
  const team =
    reg.teams.find((t) => t.id === teamId) ??
    (teamId === VFC_P2017_TEAM_ID ? buildDefaultVfcEntry() : undefined);
  if (!team) return null;

  const blobPath =
    team.id === VFC_P2017_TEAM_ID
      ? LEGACY_VFC_BLOB_PATH
      : team.blobPath || generateOpaqueBlobPath(team.id);

  const memoryMap = getSnapshotsMap();

  if (!hasBlobToken()) {
    const existing = memoryMap.get(team.id);
    if (existing) {
      return {
        ...existing,
        teamId: team.id,
        teamProfile: toPublicTeamProfile(team),
      };
    }
    const seeded = buildInitialSnapshotForTeam(team);
    memoryMap.set(team.id, seeded);
    return seeded;
  }

  try {
    const { blobs } = await list({ prefix: blobPath, limit: 5 });
    const exact =
      blobs.find((item) => item.pathname === blobPath) ?? blobs[0];
    if (!exact) {
      const mem = memoryMap.get(team.id);
      if (mem) return mem;
      const seeded = buildInitialSnapshotForTeam(team);
      memoryMap.set(team.id, seeded);
      return seeded;
    }
    const res = await fetch(`${exact.url}?t=${Date.now()}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      return memoryMap.get(team.id) ?? buildInitialSnapshotForTeam(team);
    }
    const snapshot = (await res.json()) as LiveSyncSnapshot;
    const enriched: LiveSyncSnapshot = {
      ...snapshot,
      teamId: team.id,
      teamProfile: toPublicTeamProfile(team),
    };
    memoryMap.set(team.id, enriched);
    return enriched;
  } catch {
    return memoryMap.get(team.id) ?? buildInitialSnapshotForTeam(team);
  }
}

export async function writeTeamSnapshot(
  teamId: string,
  snapshot: LiveSyncSnapshot,
  registry?: TeamRegistry
): Promise<"blob" | "memory"> {
  const reg = registry ?? (await getTeamRegistry());
  const team =
    reg.teams.find((t) => t.id === teamId) ??
    (teamId === VFC_P2017_TEAM_ID ? buildDefaultVfcEntry() : undefined);

  const blobPath =
    !team || team.id === VFC_P2017_TEAM_ID
      ? LEGACY_VFC_BLOB_PATH
      : team.blobPath || generateOpaqueBlobPath(team.id);

  const enriched: LiveSyncSnapshot = {
    ...snapshot,
    teamId,
    teamProfile: team ? toPublicTeamProfile(team) : snapshot.teamProfile,
  };

  const memoryMap = getSnapshotsMap();
  memoryMap.set(teamId, enriched);

  if (!hasBlobToken()) {
    return "memory";
  }

  await put(blobPath, JSON.stringify(enriched), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 0,
    contentType: "application/json",
  });
  return "blob";
}

export const PRESET_TEAM_COLOR_THEMES: {
  label: string;
  colors: TeamColors;
}[] = [
  {
    label: "Värmbol Blå & Gul",
    colors: { primary: "#005cb9", secondary: "#facc15" },
  },
  {
    label: "Röd & Vit (KAIK / KSK)",
    colors: { primary: "#b91c1c", secondary: "#f8fafc" },
  },
  {
    label: "Grön & Vit (Flen / Vingåker)",
    colors: { primary: "#15803d", secondary: "#facc15" },
  },
  {
    label: "Svart & Gul (AIK / Elfsborg)",
    colors: { primary: "#1e293b", secondary: "#facc15" },
  },
  {
    label: "Ljusblå & Vit (MFF / Sleipner)",
    colors: { primary: "#0284c7", secondary: "#fde047" },
  },
  {
    label: "Orange & Svart",
    colors: { primary: "#c2410c", secondary: "#fde047" },
  },
];
