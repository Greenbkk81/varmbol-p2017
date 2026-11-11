"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftRight,
  Check,
  Clock,
  Compass,
  KeyRound,
  LayoutGrid,
  ListFilter,
  Maximize2,
  ArrowLeft,
  MessageCircle,
  Minimize2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Shield,
  Sparkles,
  Trash2,
  Trophy,
  BookOpen,
  Undo2,
  UserCheck,
  UserPlus,
  Users,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";
import {
  FORMATION_SLOTS,
  PRESET_EVENTS,
  PresetEvent,
  QUICK_OPPONENTS,
} from "@/lib/default-roster";
import {
  buildCupSetup,
  buildKaikSetup,
  CUP_COACH_NOTES,
  CUP_MATCHES,
  FORMATION_COACH_NOTES,
  INITIAL_CUP_SETUP,
  INITIAL_KAIK_SETUP,
  upgradeCupDuration,
} from "@/lib/cup-plan";
import {
  addOpponentGoal,
  addOurGoal,
  assignGoalkeeperCollar,
  commitRunningTime,
  computePlayerMetrics,
  createInitialMatchState,
  executeMultiSubstitution,
  formatDurationMmSs,
  getCurrentPeriodElapsedMs,
  getPitchCapacity,
  getTotalMatchElapsedMs,
  markGoalAssistDone,
  movePlayerToSlot,
  pitchPositionCode,
  pushUndoSnapshot,
  removeLastGoal,
  resolveStintMinutes,
  STINT_MINUTE_CHOICES,
  stampGoalPlayer,
  suggestSubstitutions,
  swapPitchPositions,
  syncSquadToLiveMatch,
  undoLastAction,
} from "@/lib/match-engine";
import { mergeCupRows } from "@/lib/cup-totals";
import { playSound, resumeSound, SoundCue } from "@/lib/sounds";
import { GuideView } from "./GuideView";
import { PositionTime, summarizeRoleZones } from "./PositionTime";
import { TacticalMovementView } from "./TacticalMovementView";
import {
  AuthRole,
  ComputedPlayerMetrics,
  GoalRecord,
  LiveSyncSnapshot,
  MatchConfig,
  MatchState,
  RosterPlayer,
  SavedMatchSummary,
  TacticalFormation,
  TeamProfile,
} from "@/lib/types";
import { PlayerAvatar } from "./PlayerAvatar";

const DEFAULT_TEAM_PROFILE: TeamProfile = {
  id: "vfc-p2017",
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
  createdAt: 1729843200000,
  updatedAt: 1729843200000,
};

function getStorageKeys(teamId: string) {
  if (!teamId || teamId === "vfc-p2017") {
    return {
      roster: "varmbol_p2017_roster_v4",
      activeMatch: "varmbol_p2017_active_match_v4",
      history: "varmbol_p2017_history_v2",
      sound: "varmbol_p2017_sound_v1",
      syncMode: "varmbol_p2017_sync_mode_v2",
      deviceId: "varmbol_p2017_device_id_v1",
      focusMode: "varmbol_p2017_focus_mode_v2",
    };
  }
  return {
    roster: `team_${teamId}_roster_v1`,
    activeMatch: `team_${teamId}_active_match_v1`,
    history: `team_${teamId}_history_v1`,
    sound: "varmbol_p2017_sound_v1",
    syncMode: `team_${teamId}_sync_mode_v1`,
    deviceId: "varmbol_p2017_device_id_v1",
    focusMode: "varmbol_p2017_focus_mode_v2",
  };
}

function buildMatchSummary(state: MatchState, ts: number): SavedMatchSummary {
  const metrics = computePlayerMetrics(state, ts);
  return {
    id: state.id,
    dateIso: new Date(ts).toISOString(),
    opponent: state.config.opponent || "Motståndare",
    eventTitle: state.config.eventTitle,
    location: state.config.location,
    format: state.config.format,
    formation: state.config.formation,
    periods: state.config.periods,
    periodMinutes: state.config.periodMinutes,
    ourScore: state.ourScore,
    opponentScore: state.opponentScore,
    goals: (state.goals ?? []).map((goal) => ({ ...goal })),
    players: metrics.map((m) => ({
      id: m.player.id,
      name: m.player.name,
      number: m.player.number,
      avatarUrl: m.player.avatarUrl,
      outfieldMs: m.outfieldMs,
      goalkeeperMs: m.goalkeeperMs,
      totalPlayMs: m.totalPlayMs,
      benchMs: m.benchMs,
      positionMs: m.positionMs,
    })),
  };
}

const STORAGE_KEYS = {
  roster: "varmbol_p2017_roster_v3",
  activeMatch: "varmbol_p2017_active_match_v3",
  history: "varmbol_p2017_history_v2",
  sound: "varmbol_p2017_sound_v1",
  syncMode: "varmbol_p2017_sync_mode_v1",
  deviceId: "varmbol_p2017_device_id_v1",
  focusMode: "varmbol_p2017_focus_mode_v1",
};

type SyncMode = "control" | "follow";

function normalizeMatchState(savedMatch: MatchState): MatchState {
  const parsedMatch = upgradeCupDuration(savedMatch);
  const formation =
    parsedMatch.config.formation ||
    (parsedMatch.config.format === "7v7" ? "1-4-1" : "1-2-1");
  return {
    ...parsedMatch,
    config: {
      ...parsedMatch.config,
      formation,
      stintMinutes: resolveStintMinutes(parsedMatch.config),
    },
    players: (parsedMatch.players ?? []).map((player) => ({
      ...player,
      name: correctFirstName(player.name),
    })),
    goals: Array.isArray(parsedMatch.goals)
      ? parsedMatch.goals.map((goal) => ({
          ...goal,
          scorerName: goal.scorerName
            ? correctFirstName(goal.scorerName)
            : goal.scorerName,
          assistName: goal.assistName
            ? correctFirstName(goal.assistName)
            : goal.assistName,
        }))
      : [],
    logs: (parsedMatch.logs ?? []).map((log) => ({
      ...log,
      playersIn: (log.playersIn ?? []).map((player) => ({
        ...player,
        name: correctFirstName(player.name),
      })),
      playersOut: (log.playersOut ?? []).map((player) => ({
        ...player,
        name: correctFirstName(player.name),
      })),
    })),
    undoStack: Array.isArray(parsedMatch.undoStack)
      ? parsedMatch.undoStack
      : [],
  };
}

function normalizeHistory(history: SavedMatchSummary[]): SavedMatchSummary[] {
  return history.map((match) => ({
    ...match,
    goals: match.goals?.map((goal) => ({
      ...goal,
      scorerName: goal.scorerName
        ? correctFirstName(goal.scorerName)
        : goal.scorerName,
      assistName: goal.assistName
        ? correctFirstName(goal.assistName)
        : goal.assistName,
    })),
    players: (match.players ?? []).map((player) => ({
      ...player,
      name: correctFirstName(player.name),
    })),
  }));
}

function correctFirstName(name: string) {
  return name === "Abdoulaye" ? "Abdullahi" : name;
}

function ensureVfcGuests(
  list: RosterPlayer[],
  isVfcDefault: boolean
): RosterPlayer[] {
  const normalized = list.map((p) => ({
    ...p,
    name: correctFirstName(p.name),
  }));
  if (!isVfcDefault) return normalized;
  const guests: RosterPlayer[] = [
    {
      id: "p-jack",
      name: "Jack",
      preferredRole: "Inlånad P2018",
      activeInSquad: true,
    },
    {
      id: "p-amr",
      name: "Amr",
      preferredRole: "Inlånad P2018",
      activeInSquad: true,
    },
  ];
  const merged = [...normalized];
  for (const g of guests) {
    const exists = merged.some(
      (p) =>
        p.id === g.id ||
        p.name.trim().toLocaleLowerCase("sv-SE") ===
          g.name.toLocaleLowerCase("sv-SE")
    );
    if (!exists) {
      merged.push(g);
    }
  }
  return merged;
}

function ourGoals(goals: GoalRecord[] | undefined) {
  return (goals ?? []).filter((goal) => goal.side === "ours");
}

function countPositionCodes(
  goals: GoalRecord[],
  key: "scorerPosition" | "assistPosition"
) {
  const counts = new Map<string, number>();
  for (const goal of goals) {
    const code = goal[key];
    if (!code) continue;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "sv"))
    .map(([code, count]) => `${code} ${count}`)
    .join(", ");
}

function goalHeadline(goals: GoalRecord[] | undefined): string | null {
  const ours = ourGoals(goals);
  if (ours.length === 0) return null;
  const from = countPositionCodes(ours, "scorerPosition");
  const pass = countPositionCodes(ours, "assistPosition");
  if (!from && !pass) return `${ours.length} mål utan plats`;
  const parts: string[] = [];
  if (from) parts.push(`Mål från ${from}`);
  if (pass) parts.push(`Pass från ${pass}`);
  return parts.join(" · ");
}

function goalMoment(goal: GoalRecord, periodMinutes: number) {
  const periodMs = Math.max(1, periodMinutes) * 60 * 1000;
  const intoPeriod = goal.matchTimeMs - (goal.period - 1) * periodMs;
  return `P${goal.period} ${formatDurationMmSs(intoPeriod)}`;
}

const FORMATIONS_7V7 = [
  "1-4-1",
  "1-1-3-1",
  "2-3-1",
  "2-2-2",
  "3-2-1",
] as const;

function goalDetail(goal: GoalRecord) {
  const fmtBadge = goal.formation ? ` [${goal.formation}]` : "";
  if (!goal.scorerPosition) return `utan plats${fmtBadge}`;
  const shot = goal.scorerName
    ? `${goal.scorerPosition} ${goal.scorerName}`
    : goal.scorerPosition;
  if (goal.assistPosition) {
    const pass = goal.assistName
      ? `${goal.assistPosition} ${goal.assistName}`
      : goal.assistPosition;
    return `${shot} · pass ${pass}${fmtBadge}`;
  }
  return `${shot} · ingen pass${fmtBadge}`;
}

function openGoalLabel(goals: GoalRecord[] | undefined, goalId: string) {
  const goal = (goals ?? []).find((item) => item.id === goalId);
  if (!goal?.scorerPosition) return null;
  return goal.scorerName
    ? `${goal.scorerPosition} ${goal.scorerName}`
    : goal.scorerPosition;
}

function GoalPickBar({
  phase,
  scorerLabel,
  onSkip,
}: {
  phase: "scorer" | "assist";
  scorerLabel: string | null;
  onSkip: () => void;
}) {
  return (
    <div className="px-3 py-2 bg-[#facc15] text-slate-950 flex items-center justify-between gap-2">
      <p className="font-display font-extrabold text-xs sm:text-sm uppercase tracking-wide leading-tight">
        {phase === "scorer"
          ? "Mål. Tryck på den som sköt."
          : `${scorerLabel ?? "Målet"} sköt. Tryck var passningen kom ifrån.`}
      </p>
      <button
        type="button"
        onClick={onSkip}
        className="shrink-0 px-2 py-1 rounded bg-slate-950 text-[#facc15] font-mono-cm font-extrabold text-[10px] uppercase"
      >
        {phase === "scorer" ? "Utan plats" : "Ingen pass"}
      </button>
    </div>
  );
}

function CoachTicker({ text }: { text: string }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const pausedRef = useRef(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReducedMotion(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;

    let frame = 0;
    let last = performance.now();
    const speed = 42;

    const tick = (now: number) => {
      const copy = track.querySelector(
        "[data-ticker-copy='a']"
      ) as HTMLElement | null;
      const copyWidth = copy?.offsetWidth ?? 0;
      const overflows = copyWidth > viewport.clientWidth + 8;

      if (pausedRef.current || !overflows || copyWidth <= 0) {
        if (!overflows) {
          offsetRef.current = 0;
          track.style.transform = "translate3d(0,0,0)";
        }
        last = now;
      } else {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        offsetRef.current = (offsetRef.current + speed * dt) % copyWidth;
        track.style.transform = `translate3d(${-offsetRef.current}px,0,0)`;
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reducedMotion]);

  if (reducedMotion) {
    return (
      <p className="min-w-0 flex-1 font-mono-cm text-xs font-bold leading-snug">
        {text}
      </p>
    );
  }

  return (
    <div
      ref={viewportRef}
      className="cm-ticker relative min-w-0 flex-1"
      title={text}
      onMouseEnter={() => {
        pausedRef.current = true;
      }}
      onMouseLeave={() => {
        pausedRef.current = false;
      }}
    >
      <div ref={trackRef} className="cm-ticker-track font-mono-cm text-xs font-bold">
        <span data-ticker-copy="a">{text}</span>
        <span data-ticker-copy="b" aria-hidden="true">
          {text}
        </span>
      </div>
    </div>
  );
}

export interface VarmbolMatchAppProps {
  teamProfile?: TeamProfile;
  authRole?: AuthRole;
  authToken?: string | null;
  initialRemoteSnapshot?: LiveSyncSnapshot | null;
  onOpenAdminModal?: () => void;
}

export function VarmbolMatchApp({
  teamProfile = DEFAULT_TEAM_PROFILE,
  authRole = "coach",
  authToken = null,
  initialRemoteSnapshot = null,
  onOpenAdminModal,
}: VarmbolMatchAppProps = {}) {
  const isVfcDefault =
    teamProfile.id === "vfc-p2017" || Boolean(teamProfile.isDefaultVfcTeam);
  const storageKeys = useMemo(
    () => getStorageKeys(teamProfile.id),
    [teamProfile.id]
  );
  const isReadOnlyFollower = authRole === "follower";

  const initialRoster = useMemo(() => {
    if (
      initialRemoteSnapshot?.roster &&
      Array.isArray(initialRemoteSnapshot.roster) &&
      (initialRemoteSnapshot.roster.length > 0 || !isVfcDefault)
    ) {
      return ensureVfcGuests(initialRemoteSnapshot.roster, isVfcDefault);
    }
    return isVfcDefault
      ? ensureVfcGuests(INITIAL_KAIK_SETUP.roster, isVfcDefault)
      : [];
  }, [initialRemoteSnapshot, isVfcDefault]);

  const initialConfig = useMemo<MatchConfig>(() => {
    if (initialRemoteSnapshot?.matchState?.config) {
      return initialRemoteSnapshot.matchState.config;
    }
    if (isVfcDefault) {
      return INITIAL_KAIK_SETUP.config;
    }
    const fmt = teamProfile.defaultFormat || "7v7";
    const form =
      teamProfile.defaultFormation || (fmt === "7v7" ? "1-4-1" : "1-2-1");
    return {
      format: fmt,
      formation: form,
      periods: 3,
      periodMinutes: 15,
      opponent: "Motståndare",
      location: "Hemma",
      eventTitle: `${teamProfile.displayName} · Match`,
      countGoalkeeperInFairness: false,
      stintMinutes: 5,
    };
  }, [initialRemoteSnapshot, isVfcDefault, teamProfile]);

  const initialCap = getPitchCapacity(initialConfig.format);
  const initialPitchIds = useMemo(() => {
    if (initialRemoteSnapshot?.matchState?.players?.length) {
      return initialRemoteSnapshot.matchState.players
        .filter((p) => p.onPitch)
        .sort((a, b) => (a.pitchSlotIndex ?? 0) - (b.pitchSlotIndex ?? 0))
        .map((p) => p.id);
    }
    if (isVfcDefault) {
      return [...INITIAL_KAIK_SETUP.pitchIds];
    }
    return initialRoster.slice(0, initialCap).map((p) => p.id);
  }, [initialRemoteSnapshot, isVfcDefault, initialRoster, initialCap]);

  const initialGkId = useMemo(() => {
    if (initialRemoteSnapshot?.matchState?.players?.length) {
      return (
        initialRemoteSnapshot.matchState.players.find((p) => p.isGoalkeeper)
          ?.id ??
        initialPitchIds[0] ??
        ""
      );
    }
    if (isVfcDefault) {
      return INITIAL_KAIK_SETUP.goalkeeperId;
    }
    return initialPitchIds[0] ?? "";
  }, [initialRemoteSnapshot, isVfcDefault, initialPitchIds]);

  const [hydrated, setHydrated] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "match" | "tactics" | "setup" | "stats" | "guide"
  >(() => (initialRoster.length === 0 ? "setup" : "match"));
  // I matchvyn kan man se 2D Taktikplan ("pitch") eller Klassisk CM Tabell ("table")
  const [pitchViewMode, setPitchViewMode] = useState<"pitch" | "table">(
    "pitch"
  );
  const [tokenStat, setTokenStat] = useState<"play" | "stint" | "bench">(
    "play"
  );

  // Spelartrupp
  const [roster, setRoster] = useState<RosterPlayer[]>(initialRoster);

  // Matchinställningar inför ny match
  const [draftConfig, setDraftConfig] = useState<MatchConfig>(initialConfig);

  const [setupPitchIds, setSetupPitchIds] = useState<string[]>(initialPitchIds);
  const [setupGkId, setSetupGkId] = useState<string>(initialGkId);

  // Aktiv match
  const [matchState, setMatchState] = useState<MatchState>(() =>
    initialRemoteSnapshot?.matchState &&
    initialRemoteSnapshot.matchState.players?.length > 0
      ? normalizeMatchState(initialRemoteSnapshot.matchState)
      : createInitialMatchState(
          initialRoster,
          initialConfig,
          initialPitchIds,
          initialGkId
        )
  );

  const [savedMatches, setSavedMatches] = useState<SavedMatchSummary[]>(() =>
    initialRemoteSnapshot?.savedMatches
      ? normalizeHistory(initialRemoteSnapshot.savedMatches)
      : []
  );
  const [now, setNow] = useState<number>(() => Date.now());

  // Multi-byte valda spelare (1, 2, 3 eller 4 samtidigt)
  const [selectedOutIds, setSelectedOutIds] = useState<string[]>([]);
  const [selectedInIds, setSelectedInIds] = useState<string[]>([]);
  const [suggestionCount, setSuggestionCount] = useState<number>(2);
  const [suggestionBanner, setSuggestionBanner] = useState<string | null>(null);
  const [goalPick, setGoalPick] = useState<{
    goalId: string;
    phase: "scorer" | "assist";
  } | null>(null);
  const goalTargetRef = useRef<HTMLElement | null>(null);

  // Målvaktskrage-väljare & Samlingstavla för laget
  const [gkModalOpen, setGkModalOpen] = useState(false);
  const [teamTalkOpen, setTeamTalkOpen] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);

  const [newPlayerName, setNewPlayerName] = useState("");
  const [bulkPlayersText, setBulkPlayersText] = useState("");
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [syncMode, setSyncMode] = useState<SyncMode>(() =>
    isReadOnlyFollower ? "follow" : "control"
  );
  const [syncUpdatedAt, setSyncUpdatedAt] = useState<number | null>(
    initialRemoteSnapshot?.updatedAt ?? null
  );
  const [syncError, setSyncError] = useState(false);
  const deviceIdRef = useRef<string>("device");
  const lastRemoteVersionRef = useRef<number>(
    initialRemoteSnapshot?.version ?? 0
  );
  const skipNextPushRef = useRef<boolean>(false);
  const forceNextPushRef = useRef<boolean>(false);
  const periodAlertedRef = useRef<number | null>(null);
  const stintAlertedKeyRef = useRef<string>("");

  // Ladda från localStorage
  useEffect(() => {
    try {
      const existingDeviceId = localStorage.getItem(storageKeys.deviceId);
      if (existingDeviceId) {
        deviceIdRef.current = existingDeviceId;
      } else {
        const created = `dev-${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 6)}`;
        deviceIdRef.current = created;
        localStorage.setItem(storageKeys.deviceId, created);
      }

      if (isReadOnlyFollower) {
        setSyncMode("follow");
      } else {
        const urlMode = new URLSearchParams(window.location.search).get("mode");
        if (urlMode === "follow" || urlMode === "live") {
          setSyncMode("follow");
        } else {
          setSyncMode("control");
        }
      }

      const hasRemoteSnapshot = Boolean(
        initialRemoteSnapshot?.matchState &&
          initialRemoteSnapshot.matchState.players?.length > 0
      );

      if (!hasRemoteSnapshot) {
        const rawRoster = localStorage.getItem(storageKeys.roster);
        if (rawRoster) {
          const parsed = JSON.parse(rawRoster) as RosterPlayer[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            setRoster(ensureVfcGuests(parsed, isVfcDefault));
            if (activeTab === "setup" && initialRoster.length === 0) {
              setActiveTab("match");
            }
          }
        }

        const rawMatch = localStorage.getItem(storageKeys.activeMatch);
        if (rawMatch) {
          const parsedMatch = JSON.parse(rawMatch) as MatchState;
          if (parsedMatch && parsedMatch.players?.length > 0) {
            const normalized = normalizeMatchState(parsedMatch);
            setMatchState(normalized);
            setDraftConfig(normalized.config);
            setSetupPitchIds(
              normalized.players
                .filter((p) => p.onPitch)
                .sort((a, b) => (a.pitchSlotIndex ?? 0) - (b.pitchSlotIndex ?? 0))
                .map((p) => p.id)
            );
            setSetupGkId(
              normalized.players.find((p) => p.isGoalkeeper)?.id ??
                initialGkId
            );
          }
        }

        const rawHistory = localStorage.getItem(storageKeys.history);
        if (rawHistory) {
          const parsedHistory = JSON.parse(rawHistory) as SavedMatchSummary[];
          if (Array.isArray(parsedHistory) && parsedHistory.length > 0) {
            setSavedMatches(normalizeHistory(parsedHistory));
          }
        }
      } else {
        skipNextPushRef.current = true;
      }

      const rawSound = localStorage.getItem(storageKeys.sound);
      if (rawSound === "0") setSoundEnabled(false);

      const urlFocus = new URLSearchParams(window.location.search).get("focus");
      if (urlFocus === "1" || urlFocus === "true") {
        setFocusMode(true);
      }
    } catch {
      // ignore
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKeys]);

  // Håll setupPitchIds & setupGkId synkade med aktuell 2D-plan
  useEffect(() => {
    const onPitchSorted = matchState.players
      .filter((p) => p.onPitch)
      .sort((a, b) => (a.pitchSlotIndex ?? 0) - (b.pitchSlotIndex ?? 0));
    if (onPitchSorted.length > 0) {
      setSetupPitchIds(onPitchSorted.map((p) => p.id));
      const gk = onPitchSorted.find((p) => p.isGoalkeeper) ?? onPitchSorted[0];
      if (gk) setSetupGkId(gk.id);
    }
  }, [matchState.players]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(storageKeys.roster, JSON.stringify(roster));
    } catch {
      // ignore
    }
  }, [roster, hydrated, storageKeys]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(
        storageKeys.activeMatch,
        JSON.stringify(matchState)
      );
    } catch {
      // ignore
    }
  }, [matchState, hydrated, storageKeys]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(storageKeys.history, JSON.stringify(savedMatches));
    } catch {
      // ignore
    }
  }, [savedMatches, hydrated, storageKeys]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(storageKeys.sound, soundEnabled ? "1" : "0");
    } catch {
      // ignore
    }
  }, [soundEnabled, hydrated, storageKeys]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(storageKeys.focusMode, focusMode ? "1" : "0");
    } catch {
      // ignore
    }
  }, [focusMode, hydrated, storageKeys]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(storageKeys.syncMode, syncMode);
    } catch {
      // ignore
    }
  }, [syncMode, hydrated, storageKeys]);

  const applyRemoteSnapshot = React.useCallback(
    (snapshot: {
      version?: number;
      updatedAt?: number;
      roster?: RosterPlayer[];
      matchState?: MatchState;
      savedMatches?: SavedMatchSummary[];
    }) => {
      if (!snapshot?.matchState) return;
      if (
        typeof snapshot.version === "number" &&
        snapshot.version <= lastRemoteVersionRef.current
      ) {
        if (typeof snapshot.updatedAt === "number") {
          setSyncUpdatedAt(snapshot.updatedAt);
        }
        return;
      }
      if (typeof snapshot.version === "number") {
        lastRemoteVersionRef.current = snapshot.version;
      }
      if (typeof snapshot.updatedAt === "number") {
        setSyncUpdatedAt(snapshot.updatedAt);
      }
      skipNextPushRef.current = true;
      const clockSkewMs =
        typeof snapshot.updatedAt === "number"
          ? Date.now() - snapshot.updatedAt
          : 0;
      const adjustedMatchState =
        snapshot.matchState.status === "running" &&
        snapshot.matchState.lastTickTimestamp !== null
          ? {
              ...snapshot.matchState,
              lastTickTimestamp:
                snapshot.matchState.lastTickTimestamp + clockSkewMs,
            }
          : snapshot.matchState;
      if (adjustedMatchState.players?.length > 0) {
        const normalized = normalizeMatchState(adjustedMatchState);
        setMatchState(normalized);
        setDraftConfig(normalized.config);
      }
      if (Array.isArray(snapshot.roster) && snapshot.roster.length > 0) {
        setRoster(ensureVfcGuests(snapshot.roster, isVfcDefault));
      }
      if (Array.isArray(snapshot.savedMatches)) {
        setSavedMatches(normalizeHistory(snapshot.savedMatches));
      }
      setSelectedOutIds([]);
      setSelectedInIds([]);
      setSuggestionBanner(null);
      setGoalPick(null);
    },
    []
  );

  const pullRemoteSnapshot = React.useCallback(
    async (force = false) => {
      try {
        if (force) lastRemoteVersionRef.current = 0;
        const headers: Record<string, string> = {};
        if (authToken) {
          headers["Authorization"] = `Bearer ${authToken}`;
        }
        const res = await fetch(
          `/api/sync?teamId=${encodeURIComponent(
            teamProfile.id
          )}&t=${Date.now()}`,
          {
            cache: "no-store",
            headers,
          }
        );
        if (!res.ok) {
          setSyncError(true);
          return;
        }
        const data = await res.json();
        setSyncError(false);
        if (data?.snapshot) {
          applyRemoteSnapshot(data.snapshot);
        }
      } catch {
        setSyncError(true);
      }
    },
    [applyRemoteSnapshot, authToken, teamProfile.id]
  );

  // Styrande telefon skickar upp till Vercel Blob vid varje ändring
  useEffect(() => {
    if (!hydrated || syncMode !== "control" || isReadOnlyFollower) return;
    if (skipNextPushRef.current) {
      skipNextPushRef.current = false;
      return;
    }
    const shouldForce = forceNextPushRef.current;
    forceNextPushRef.current = false;
    const timer = setTimeout(async () => {
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (authToken) {
          headers["Authorization"] = `Bearer ${authToken}`;
        }
        const res = await fetch("/api/sync", {
          method: "POST",
          headers,
          body: JSON.stringify({
            teamId: teamProfile.id,
            controllerId: deviceIdRef.current,
            force: shouldForce,
            roster,
            matchState,
            savedMatches,
          }),
        });
        if (!res.ok) {
          setSyncError(true);
          return;
        }
        const data = await res.json();
        setSyncError(false);
        if (data?.ignored && data?.snapshot) {
          // En annan telefon styr redan en aktiv match — växla automatiskt till Följ så vi inte skriver över den!
          setSyncMode("follow");
          applyRemoteSnapshot(data.snapshot);
          return;
        }
        if (typeof data?.version === "number") {
          lastRemoteVersionRef.current = data.version;
        }
        setSyncUpdatedAt(data?.updatedAt ?? Date.now());
      } catch {
        setSyncError(true);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [
    hydrated,
    syncMode,
    isReadOnlyFollower,
    authToken,
    teamProfile.id,
    roster,
    matchState,
    savedMatches,
    applyRemoteSnapshot,
  ]);

  // Följande telefon hämtar live varannan sekund
  useEffect(() => {
    if (!hydrated || syncMode !== "follow") return;
    pullRemoteSnapshot(true);
    const interval = setInterval(() => {
      pullRemoteSnapshot(false);
    }, 2000);
    return () => clearInterval(interval);
  }, [hydrated, syncMode, pullRemoteSnapshot]);

  useEffect(() => {
    const unlock = () => resumeSound();
    window.addEventListener("pointerdown", unlock);
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  useEffect(() => {
    if (!goalPick) return;
    goalTargetRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [goalPick?.goalId]);

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 250);
    return () => clearInterval(interval);
  }, []);

  // Wake Lock på Android & iOS (återaktiveras automatiskt när skärmen väcks)
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;
    async function requestWakeLock() {
      if (
        matchState.status === "running" &&
        typeof document !== "undefined" &&
        document.visibilityState === "visible" &&
        typeof navigator !== "undefined" &&
        "wakeLock" in navigator
      ) {
        try {
          wakeLock = await navigator.wakeLock.request("screen");
          setWakeLockActive(true);
          wakeLock.addEventListener("release", () => {
            setWakeLockActive(false);
          });
        } catch {
          setWakeLockActive(false);
        }
      }
    }
    function handleVisibilityChange() {
      setNow(Date.now());
      if (document.visibilityState === "visible") {
        requestWakeLock();
      }
    }
    requestWakeLock();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (wakeLock) {
        wakeLock.release().catch(() => {});
      }
    };
  }, [matchState.status]);

  const playerMetrics = useMemo(
    () => computePlayerMetrics(matchState, now),
    [matchState, now]
  );

  const periodElapsedMs = getCurrentPeriodElapsedMs(matchState, now);
  const periodTargetMs = matchState.config.periodMinutes * 60 * 1000;
  const periodRemainingMs = Math.max(0, periodTargetMs - periodElapsedMs);
  const isPeriodOvertime = periodElapsedMs >= periodTargetMs;

  useEffect(() => {
    if (
      matchState.status === "running" &&
      isPeriodOvertime &&
      periodAlertedRef.current !== matchState.currentPeriod
    ) {
      periodAlertedRef.current = matchState.currentPeriod;
      if (soundEnabled) {
        resumeSound();
        playSound("period");
      }
    }
  }, [
    isPeriodOvertime,
    matchState.status,
    matchState.currentPeriod,
    soundEnabled,
  ]);

  // Ljud- & vibrationspåminnelse när 5-minutersgränsen (stintMinutes) passeras
  useEffect(() => {
    if (matchState.status !== "running" || isPeriodOvertime) return;
    const stintMs = resolveStintMinutes(matchState.config) * 60 * 1000;
    const hasAlert = playerMetrics.some(
      (m) => m.player.onPitch && !m.player.isGoalkeeper && m.stintAlert
    );
    if (!hasAlert) return;
    const bucket = Math.floor(periodElapsedMs / stintMs);
    if (bucket < 1) return;
    const key = `${matchState.id}-P${matchState.currentPeriod}-B${bucket}`;
    if (stintAlertedKeyRef.current !== key) {
      stintAlertedKeyRef.current = key;
      if (soundEnabled) {
        resumeSound();
        playSound("stint");
      }
    }
  }, [
    matchState.id,
    matchState.status,
    matchState.currentPeriod,
    matchState.config,
    isPeriodOvertime,
    periodElapsedMs,
    playerMetrics,
    soundEnabled,
  ]);

  const currentFormation: TacticalFormation =
    matchState.config.formation ||
    (matchState.config.format === "7v7" ? "1-4-1" : "1-2-1");

  const formationSlots =
    FORMATION_SLOTS[currentFormation] || FORMATION_SLOTS["1-4-1"];

  const pitchMetrics = useMemo(() => {
    return playerMetrics
      .filter((m) => m.player.onPitch)
      .sort((a, b) => {
        const slotA = a.player.pitchSlotIndex ?? (a.player.isGoalkeeper ? 0 : 9);
        const slotB = b.player.pitchSlotIndex ?? (b.player.isGoalkeeper ? 0 : 9);
        return slotA - slotB;
      });
  }, [playerMetrics]);

  const benchMetrics = useMemo(() => {
    return playerMetrics
      .filter((m) => !m.player.onPitch)
      .sort((a, b) => {
        if (Math.abs(a.fairnessMs - b.fairnessMs) > 15_000) {
          return a.fairnessMs - b.fairnessMs;
        }
        return b.currentStintMs - a.currentStintMs;
      });
  }, [playerMetrics]);

  const cupRows = useMemo(() => {
    const live =
      getTotalMatchElapsedMs(matchState, now) >= 1000
        ? buildMatchSummary(matchState, now)
        : null;
    return mergeCupRows(savedMatches, live).sort(
      (a, b) =>
        a.totalPlayMs - b.totalPlayMs || a.name.localeCompare(b.name, "sv")
    );
  }, [savedMatches, matchState, now]);

  // Championship Manager Live Commentary Line
  const cmCommentaryText = useMemo(() => {
    if (suggestionBanner) {
      return `TAKTIKFÖRSLAG: ${suggestionBanner}`;
    }
    if (selectedOutIds.length > 0 || selectedInIds.length > 0) {
      const outNames = selectedOutIds
        .map((id) => matchState.players.find((p) => p.id === id)?.name)
        .filter(Boolean)
        .join(", ");
      const inNames = selectedInIds
        .map((id) => matchState.players.find((p) => p.id === id)?.name)
        .filter(Boolean)
        .join(", ");
      return `SIDLINJEN: Utbyte [ ${outNames || "välj på plan"} ] ⇄ Inbyte [ ${
        inNames || "välj på bänk"
      } ]`;
    }
    if (matchState.status === "paused" && periodElapsedMs === 0) {
      return `${teamProfile.displayName.toUpperCase()} STÄLLER UPP I ${currentFormation} MOT ${matchState.config.opponent.toUpperCase()} — REDO FÖR AVSPARK!`;
    }
    const stintLimitMs = resolveStintMinutes(matchState.config) * 60 * 1000;
    const tiredOutfield = pitchMetrics
      .filter((m) => !m.player.isGoalkeeper)
      .sort((a, b) => b.currentStintMs - a.currentStintMs)[0];
    const eagerBench = benchMetrics[0];
    if (
      tiredOutfield &&
      eagerBench &&
      tiredOutfield.currentStintMs >= stintLimitMs
    ) {
      return `COACH-RAPPORT: ${
        tiredOutfield.player.name
      } har varit inne i ${formatDurationMmSs(
        tiredOutfield.currentStintMs
      )} (${tiredOutfield.conditionPct}% kondition) — ${
        eagerBench.player.name
      } står redo på bänken!`;
    }
    if (matchState.logs.length > 0) {
      const latest = matchState.logs[0];
      if (latest.type === "sub") {
        return `SENASTE BYTE (P${latest.period} ${formatDurationMmSs(
          latest.matchTimeMs
        )}): ${latest.playersIn.map((p) => p.name).join(", ")} in för ${latest.playersOut
          .map((p) => p.name)
          .join(", ")}`;
      }
    }
    return `MATCH ENGINE LIVE · UPPSTÄLLNING ${currentFormation} · KLICKA PÅ SPELARE FÖR ATT BYTA 1–4 SAMTIDIGT`;
  }, [
    suggestionBanner,
    selectedOutIds,
    selectedInIds,
    matchState,
    periodElapsedMs,
    currentFormation,
    pitchMetrics,
    benchMetrics,
    teamProfile.displayName,
  ]);

  const isFollowing = syncMode === "follow" || isReadOnlyFollower;

  function takeCoachControl(): boolean {
    if (isReadOnlyFollower) return false;
    if (syncMode === "follow") {
      setSyncMode("control");
    }
    forceNextPushRef.current = true;
    return true;
  }

  function handleSetSyncMode(nextMode: SyncMode) {
    if (isReadOnlyFollower) return;
    if (nextMode === "control") {
      forceNextPushRef.current = true;
    }
    setSyncMode(nextMode);
    if (nextMode === "follow") {
      clearSubSelection();
      setGoalPick(null);
      setGkModalOpen(false);
    }
  }

  function toggleSelectPitchPlayer(playerId: string) {
    if (!takeCoachControl()) return;
    setSuggestionBanner(null);
    setSelectedOutIds((prev) =>
      prev.includes(playerId)
        ? prev.filter((id) => id !== playerId)
        : [...prev, playerId]
    );
  }

  function toggleSelectBenchPlayer(playerId: string) {
    if (!takeCoachControl()) return;
    setSuggestionBanner(null);
    setSelectedInIds((prev) =>
      prev.includes(playerId)
        ? prev.filter((id) => id !== playerId)
        : [...prev, playerId]
    );
  }

  function clearSubSelection() {
    setSelectedOutIds([]);
    setSelectedInIds([]);
    setSuggestionBanner(null);
  }

  function handleSuggestSubs(count: number) {
    if (!takeCoachControl()) return;
    setSuggestionCount(count);
    const suggestion = suggestSubstitutions(matchState, Date.now(), count);
    setSelectedOutIds(suggestion.outIds);
    setSelectedInIds(suggestion.inIds);
    setSuggestionBanner(suggestion.reason);
  }

  function handleSetStintMinutes(minutes: (typeof STINT_MINUTE_CHOICES)[number]) {
    if (!takeCoachControl()) return;
    setMatchState((prev) => ({
      ...prev,
      config: { ...prev.config, stintMinutes: minutes },
    }));
    setDraftConfig((prev) => ({ ...prev, stintMinutes: minutes }));
  }

  function cue(name: SoundCue) {
    resumeSound();
    if (soundEnabled) playSound(name);
  }

  function handleConfirmSubstitution() {
    if (!takeCoachControl()) return;
    if (
      selectedOutIds.length === 0 ||
      selectedOutIds.length !== selectedInIds.length
    ) {
      return;
    }
    const ts = Date.now();
    setNow(ts);
    setMatchState((prev) =>
      executeMultiSubstitution(prev, selectedOutIds, selectedInIds, ts)
    );
    cue("sub");
    clearSubSelection();
  }

  // Direkt 1-klicksbyte mellan en specifik spelare på planen och en på bänken
  function handleQuickSubPair(outPlayerId: string, inPlayerId: string) {
    if (!takeCoachControl()) return;
    const ts = Date.now();
    setNow(ts);
    setMatchState((prev) =>
      executeMultiSubstitution(prev, [outPlayerId], [inPlayerId], ts)
    );
    cue("sub");
    clearSubSelection();
  }

  // Direkt flytt av valfri spelare (på plan eller på bänk) till önskad position (slot 0..6 eller -1 för bänk)
  function handleMovePlayerToSlot(playerId: string, targetSlotIndex: number) {
    if (!takeCoachControl()) return;
    const ts = Date.now();
    setNow(ts);
    setMatchState((prev) => movePlayerToSlot(prev, playerId, targetSlotIndex, ts));
    cue("swap");
    clearSubSelection();
  }

  // Om man valt exakt 2 spelare på planen och 0 på bänken kan man även skifta deras positioner!
  function handleSwapTwoPitchPlayers() {
    if (!takeCoachControl()) return;
    if (selectedOutIds.length !== 2 || selectedInIds.length !== 0) return;
    const ts = Date.now();
    setNow(ts);
    setMatchState((prev) =>
      swapPitchPositions(prev, selectedOutIds[0], selectedOutIds[1], ts)
    );
    cue("swap");
    clearSubSelection();
  }

  function handleChangeFormation(newFormation: TacticalFormation) {
    if (isReadOnlyFollower) return;
    if (syncMode === "follow") {
      setSyncMode("control");
    }
    forceNextPushRef.current = true;
    const ts = Date.now();
    setNow(ts);
    setMatchState((prev) => {
      if (prev.config.formation === newFormation && prev.config.format === "7v7") {
        return prev;
      }
      const withSnap = pushUndoSnapshot(prev, `Formation ${newFormation}`, ts);
      const committed = commitRunningTime(withSnap, ts);
      const isPreKickoff =
        getTotalMatchElapsedMs(committed, ts) === 0 &&
        committed.currentPeriod === 1 &&
        committed.status === "paused";
      return {
        ...committed,
        config: { ...committed.config, format: "7v7", formation: newFormation },
        logs: isPreKickoff
          ? committed.logs
          : [
              {
                id: `log-form-${ts}`,
                period: committed.currentPeriod,
                matchTimeMs: getTotalMatchElapsedMs(committed, ts),
                timestamp: ts,
                type: "formation",
                playersOut: [],
                playersIn: [],
                note: `${prev.config.formation} → ${newFormation}`,
              },
              ...committed.logs,
            ],
      };
    });
    setDraftConfig((prev) => ({
      ...prev,
      format: "7v7",
      formation: newFormation,
    }));
  }

  function handleSelectKaikFormation(fmt: "1-4-1" | "1-1-3-1") {
    if (isReadOnlyFollower) return;
    const title =
      fmt === "1-1-3-1"
        ? "Träningsmatch mot KAIK · 1-1-3-1 (Jocke)"
        : "Träningsmatch mot KAIK · 1-4-1 (Lars)";
    handleChangeFormation(fmt);
    setMatchState((prev) => ({
      ...prev,
      config: {
        ...prev.config,
        format: "7v7",
        formation: fmt,
        opponent: "Katrineholms AIK",
        eventTitle: title,
      },
    }));
    setDraftConfig((prev) => ({
      ...prev,
      format: "7v7",
      formation: fmt,
      opponent: "Katrineholms AIK",
      eventTitle: title,
    }));
  }

  function handleApplyKaikSquad9Players() {
    if (isReadOnlyFollower) return;
    if (syncMode === "follow") {
      setSyncMode("control");
    }
    forceNextPushRef.current = true;
    const fmt: "1-4-1" | "1-1-3-1" =
      currentFormation === "1-1-3-1" ? "1-1-3-1" : "1-4-1";
    const setup = buildKaikSetup(roster, fmt);
    setRoster(setup.roster);
    setDraftConfig((prev) => ({
      ...prev,
      ...setup.config,
      stintMinutes: resolveStintMinutes(prev),
    }));
    setSetupPitchIds(setup.pitchIds);
    setSetupGkId(setup.goalkeeperId);
    const ts = Date.now();
    if (getTotalMatchElapsedMs(matchState, ts) === 0) {
      setMatchState(
        createInitialMatchState(
          setup.roster,
          {
            ...setup.config,
            stintMinutes: resolveStintMinutes(matchState.config),
          },
          setup.pitchIds,
          setup.goalkeeperId
        )
      );
    }
  }

  function handleToggleClock() {
    if (!takeCoachControl()) return;
    const ts = Date.now();
    const wasRunning = matchState.status === "running";
    const atKickoff =
      !wasRunning && getCurrentPeriodElapsedMs(matchState, ts) === 0;
    setNow(ts);
    setMatchState((prev) => {
      if (prev.status === "running") {
        const withSnap = pushUndoSnapshot(prev, "Pausa klockan", ts);
        const committed = commitRunningTime(withSnap, ts);
        return {
          ...committed,
          status: "paused",
          lastTickTimestamp: null,
        };
      } else {
        const totalMatchMs = getTotalMatchElapsedMs(prev, ts);
        const updatedPlayers =
          prev.currentPeriod === 1 && prev.periodElapsedMs === 0
            ? prev.players.map((p) => ({
                ...p,
                currentStintStartMatchMs: totalMatchMs,
              }))
            : prev.players;
        return {
          ...prev,
          status: "running",
          lastTickTimestamp: ts,
          players: updatedPlayers,
        };
      }
    });
    cue(wasRunning ? "pause" : atKickoff ? "kickoff" : "resume");
  }

  function handleEndPeriod() {
    if (!takeCoachControl()) return;
    const ts = Date.now();
    const elapsedInPeriod = getCurrentPeriodElapsedMs(matchState, ts);
    const targetMs = matchState.config.periodMinutes * 60 * 1000;
    if (matchState.status === "running" && elapsedInPeriod < targetMs) {
      if (
        typeof window !== "undefined" &&
        !window.confirm(
          `Period ${matchState.currentPeriod} har bara gått ${formatDurationMmSs(
            elapsedInPeriod
          )} av ${matchState.config.periodMinutes}:00. Vill du avsluta perioden nu?`
        )
      ) {
        return;
      }
    }
    const isLastPeriod =
      matchState.currentPeriod >= matchState.config.periods;
    const alreadyWhistled =
      matchState.status === "running" && elapsedInPeriod >= targetMs;
    setNow(ts);
    setMatchState((prev) => {
      const withSnap = pushUndoSnapshot(
        prev,
        `Avsluta period ${prev.currentPeriod}`,
        ts
      );
      const committed = commitRunningTime(withSnap, ts);
      const isLastPeriod = committed.currentPeriod >= committed.config.periods;

      if (isLastPeriod) {
        return {
          ...committed,
          status: "finished",
          lastTickTimestamp: null,
        };
      }

      const oldTotalMs = getTotalMatchElapsedMs(committed, ts);
      const nextPeriod = committed.currentPeriod + 1;
      const newTotalMs =
        (nextPeriod - 1) * committed.config.periodMinutes * 60 * 1000;
      const shiftMs = newTotalMs - oldTotalMs;

      return {
        ...committed,
        status: "period_break",
        currentPeriod: nextPeriod,
        periodElapsedMs: 0,
        lastTickTimestamp: null,
        players: committed.players.map((p) => ({
          ...p,
          currentStintStartMatchMs: Math.max(
            0,
            p.currentStintStartMatchMs + shiftMs
          ),
        })),
      };
    });
    clearSubSelection();
    if (isLastPeriod) cue("fulltime");
    else if (!alreadyWhistled) cue("period");
  }

  function handleAssignGoalkeeper(playerId: string, swapIfOnBench = true) {
    if (!takeCoachControl()) return;
    const ts = Date.now();
    setNow(ts);
    setMatchState((prev) =>
      assignGoalkeeperCollar(prev, playerId, ts, swapIfOnBench)
    );
    setGkModalOpen(false);
    cue("gk");
  }

  function handleUndo() {
    if (!takeCoachControl()) return;
    const ts = Date.now();
    setNow(ts);
    setMatchState((prev) => undoLastAction(prev, ts));
    clearSubSelection();
    setGoalPick(null);
  }

  function lastGoalId(goals: GoalRecord[] | undefined, side: GoalRecord["side"]) {
    const list = goals ?? [];
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].side === side) return list[i].id;
    }
    return undefined;
  }

  function handleAddOurGoal() {
    if (!takeCoachControl()) return;
    const ts = Date.now();
    const goalId = `goal-${ts}-${Math.random().toString(36).slice(2, 6)}`;
    setNow(ts);
    cue("goal");
    clearSubSelection();
    setMatchState((prev) =>
      addOurGoal(markGoalAssistDone(prev, goalPick?.goalId), ts, goalId)
    );
    setGoalPick({ goalId, phase: "scorer" });
  }

  function handleRemoveOurGoal() {
    if (!takeCoachControl()) return;
    const removedId = lastGoalId(matchState.goals, "ours");
    setMatchState((prev) => removeLastGoal(prev, "ours"));
    setGoalPick((pick) => (pick && pick.goalId === removedId ? null : pick));
  }

  function handleAddOpponentGoal() {
    if (!takeCoachControl()) return;
    const ts = Date.now();
    setNow(ts);
    setMatchState((prev) => addOpponentGoal(prev, ts));
    cue("conceded");
  }

  function handleRemoveOpponentGoal() {
    if (!takeCoachControl()) return;
    setMatchState((prev) => removeLastGoal(prev, "theirs"));
  }

  function handleSkipGoalPick() {
    if (!goalPick || !takeCoachControl()) return;
    setMatchState((prev) => markGoalAssistDone(prev, goalPick.goalId));
    setGoalPick(null);
  }

  function handlePitchPlayerClick(playerId: string) {
    if (!takeCoachControl()) return;
    if (!goalPick) {
      toggleSelectPitchPlayer(playerId);
      return;
    }
    const player = matchState.players.find((item) => item.id === playerId);
    if (!player?.onPitch) return;
    const position = pitchPositionCode(matchState, player);
    if (goalPick.phase === "scorer") {
      setMatchState((prev) =>
        stampGoalPlayer(prev, goalPick.goalId, "scorer", {
          id: player.id,
          name: player.name,
          position,
        })
      );
      setGoalPick({ goalId: goalPick.goalId, phase: "assist" });
      return;
    }
    const openGoal = (matchState.goals ?? []).find(
      (goal) => goal.id === goalPick.goalId
    );
    if (openGoal?.scorerId === playerId) return;
    setMatchState((prev) =>
      stampGoalPlayer(prev, goalPick.goalId, "assist", {
        id: player.id,
        name: player.name,
        position,
      })
    );
    setGoalPick(null);
  }

  function rememberMatch(state: MatchState, ts: number) {
    const summary = buildMatchSummary(state, ts);
    setSavedMatches((prev) => {
      const filtered = prev.filter((item) => item.id !== summary.id);
      return [summary, ...filtered];
    });
  }

  function handleSaveMatchToHistory() {
    if (!takeCoachControl()) return;
    const ts = Date.now();
    rememberMatch(matchState, ts);
    setActiveTab("stats");
  }

  const activeSquadRoster = useMemo(
    () => roster.filter((p) => p.activeInSquad),
    [roster]
  );

  const pitchCapacity = getPitchCapacity(draftConfig.format);

  function handleApplyPresetEvent(preset: PresetEvent) {
    if (!takeCoachControl()) return;
    const cupMatch = CUP_MATCHES.find((match) => match.id === preset.id);
    if (cupMatch) {
      const setup = buildCupSetup(cupMatch, roster);
      // Bevara manuell frånvaro/skada om tränaren har bockat ur någon i dagens trupp
      const currentActiveMap = new Map(
        roster.map((p) => [p.id, p.activeInSquad])
      );
      const preservedRoster = setup.roster.map((p) => ({
        ...p,
        activeInSquad:
          p.activeInSquad && currentActiveMap.get(p.id) === false
            ? false
            : p.activeInSquad,
      }));
      const activeCount = preservedRoster.filter((p) => p.activeInSquad).length;
      const finalRoster =
        activeCount >= getPitchCapacity(setup.config.format)
          ? preservedRoster
          : setup.roster;

      const activeSet = new Set(
        finalRoster.filter((p) => p.activeInSquad).map((p) => p.id)
      );
      const cap = getPitchCapacity(setup.config.format);
      const gkId = activeSet.has(setup.goalkeeperId)
        ? setup.goalkeeperId
        : finalRoster.find((p) => p.activeInSquad)?.id ?? setup.goalkeeperId;

      // Om det redan har spelats matcher i cupen (eller för match 2, 3, 4), prioritera de 6 utespelare som har minst speltid hittills
      let starters = setup.pitchIds.filter((id) => activeSet.has(id));
      if (cupRows.length > 0 && cupMatch.id !== CUP_MATCHES[0].id) {
        const cupTimeById = new Map(
          cupRows.map((r) => [r.id, r.totalPlayMs - r.goalkeeperMs])
        );
        const outfieldCandidates = finalRoster
          .filter((p) => p.activeInSquad && p.id !== gkId)
          .sort((a, b) => {
            const timeA = cupTimeById.get(a.id) ?? 0;
            const timeB = cupTimeById.get(b.id) ?? 0;
            if (Math.abs(timeA - timeB) > 10_000) return timeA - timeB;
            return setup.pitchIds.includes(a.id) ? 1 : -1;
          });
        starters = [
          gkId,
          ...outfieldCandidates.slice(0, cap - 1).map((p) => p.id),
        ];
      } else {
        for (const p of finalRoster) {
          if (starters.length >= cap) break;
          if (p.activeInSquad && !starters.includes(p.id)) {
            starters.push(p.id);
          }
        }
      }

      setRoster(finalRoster);
      setDraftConfig({
        ...setup.config,
        stintMinutes: draftConfig.stintMinutes,
      });
      setSetupPitchIds(starters.slice(0, cap));
      setSetupGkId(gkId);
      return;
    }
    const nextConfig: MatchConfig = {
      ...draftConfig,
      format: preset.format,
      formation: preset.formation,
      periods: preset.periods,
      periodMinutes: preset.periodMinutes,
      opponent: preset.opponent,
      location: preset.location,
      eventTitle: preset.title,
    };
    setDraftConfig(nextConfig);
    const cap = getPitchCapacity(preset.format);
    const activeIds = roster.filter((r) => r.activeInSquad).map((r) => r.id);
    setSetupPitchIds(activeIds.slice(0, cap));
  }

  function handleRotateStartersByCupFairness() {
    if (!takeCoachControl()) return;
    const cap = getPitchCapacity(draftConfig.format);
    const activePlayers = roster.filter((p) => p.activeInSquad);
    const gkId = activePlayers.some((p) => p.id === setupGkId)
      ? setupGkId
      : activePlayers[0]?.id ?? setupGkId;
    const cupTimeById = new Map(
      cupRows.map((r) => [r.id, r.totalPlayMs - r.goalkeeperMs])
    );
    const currentPitchSet = new Set(setupPitchIds);
    const sortedOutfield = activePlayers
      .filter((p) => p.id !== gkId)
      .sort((a, b) => {
        const timeA = cupTimeById.get(a.id) ?? 0;
        const timeB = cupTimeById.get(b.id) ?? 0;
        if (Math.abs(timeA - timeB) > 5_000) return timeA - timeB;
        // Om cup-tiden är lika (t.ex. före match 1), sätt in de som just nu är på bänken!
        const aOnPitch = currentPitchSet.has(a.id) ? 1 : 0;
        const bOnPitch = currentPitchSet.has(b.id) ? 1 : 0;
        return aOnPitch - bOnPitch;
      });
    const nextPitchIds = [
      gkId,
      ...sortedOutfield.slice(0, cap - 1).map((p) => p.id),
    ];
    setSetupPitchIds(nextPitchIds);
    const ts = Date.now();
    setNow(ts);
    setMatchState((prev) =>
      syncSquadToLiveMatch(prev, roster, nextPitchIds, gkId, ts)
    );
  }

  function handleTogglePlayerInSquad(playerId: string) {
    if (!takeCoachControl()) return;
    const nextRoster = roster.map((p) =>
      p.id === playerId ? { ...p, activeInSquad: !p.activeInSquad } : p
    );
    setRoster(nextRoster);
    const activeIds = new Set(
      nextRoster.filter((p) => p.activeInSquad).map((p) => p.id)
    );
    const nextPitchIds = setupPitchIds.filter((id) => activeIds.has(id));
    for (const p of nextRoster) {
      if (nextPitchIds.length >= pitchCapacity) break;
      if (p.activeInSquad && !nextPitchIds.includes(p.id)) {
        nextPitchIds.push(p.id);
      }
    }
    const nextGkId = activeIds.has(setupGkId)
      ? setupGkId
      : nextPitchIds[0] ?? "";
    setSetupPitchIds(nextPitchIds);
    setSetupGkId(nextGkId);
    const ts = Date.now();
    setNow(ts);
    setMatchState((prev) =>
      syncSquadToLiveMatch(prev, nextRoster, nextPitchIds, nextGkId, ts)
    );
  }

  function handleTogglePlayerResting(playerId: string, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    if (!takeCoachControl()) return;
    setMatchState((prev) => ({
      ...prev,
      players: prev.players.map((p) =>
        p.id === playerId ? { ...p, resting: !p.resting } : p
      ),
    }));
    setSelectedInIds((prev) => prev.filter((id) => id !== playerId));
  }

  function handleAssignSetupSlot(playerId: string, targetSlotIndex: number) {
    if (!takeCoachControl()) return;
    const ts = Date.now();
    setNow(ts);
    setMatchState((prev) =>
      movePlayerToSlot(prev, playerId, targetSlotIndex, ts)
    );
  }

  function handleToggleSetupStarter(playerId: string) {
    if (!takeCoachControl()) return;
    const isCurrentlyOnPitch = matchState.players.some(
      (p) => p.id === playerId && p.onPitch
    );
    const ts = Date.now();
    setNow(ts);
    if (isCurrentlyOnPitch) {
      setMatchState((prev) => movePlayerToSlot(prev, playerId, -1, ts));
    } else {
      // Byt in mot sista utespelaren på planen
      const outfieldOnPitch = matchState.players.filter(
        (p) => p.onPitch && !p.isGoalkeeper
      );
      const targetSlot =
        outfieldOnPitch[outfieldOnPitch.length - 1]?.pitchSlotIndex ?? 1;
      setMatchState((prev) => movePlayerToSlot(prev, playerId, targetSlot, ts));
    }
  }

  function handleAddNewPlayer(e: React.FormEvent) {
    e.preventDefault();
    if (!takeCoachControl()) return;
    const trimmed = newPlayerName.trim();
    if (!trimmed) return;
    const parts = trimmed
      .split(/[,\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;

    const added: RosterPlayer[] = parts.map((rawName, idx) => ({
      id: `p-${Date.now()}-${idx}`,
      name: rawName,
      number: String(roster.length + idx + 1),
      activeInSquad: true,
    }));
    const nextRoster = [...roster, ...added];
    setRoster(nextRoster);
    const activeIds = nextRoster.filter((p) => p.activeInSquad).map((p) => p.id);
    const nextStarters =
      setupPitchIds.length >= pitchCapacity
        ? setupPitchIds
        : activeIds.slice(0, pitchCapacity);
    const nextGkId = setupGkId || nextStarters[0] || "";
    setSetupPitchIds(nextStarters);
    setSetupGkId(nextGkId);
    const ts = Date.now();
    setNow(ts);
    setMatchState((prev) =>
      syncSquadToLiveMatch(prev, nextRoster, nextStarters, nextGkId, ts)
    );
    setNewPlayerName("");
  }

  function handleBulkImportPlayers(replaceExisting: boolean) {
    if (!takeCoachControl()) return;
    const names = bulkPlayersText
      .split(/[,\n;]+/)
      .map((s) => s.replace(/^\d+[\.\)\-\s]+/, "").trim())
      .filter(Boolean);
    if (names.length === 0) return;

    const base = replaceExisting ? [] : roster;
    const created: RosterPlayer[] = names.map((name, idx) => ({
      id: `p-${Date.now()}-${idx}`,
      name,
      number: String(base.length + idx + 1),
      activeInSquad: true,
    }));
    const nextRoster = [...base, ...created];
    const starters = nextRoster
      .filter((p) => p.activeInSquad)
      .slice(0, pitchCapacity)
      .map((p) => p.id);
    const nextGkId = starters[0] || "";
    setRoster(nextRoster);
    setSetupPitchIds(starters);
    setSetupGkId(nextGkId);
    const ts = Date.now();
    setNow(ts);
    setMatchState((prev) =>
      syncSquadToLiveMatch(prev, nextRoster, starters, nextGkId, ts)
    );
    setBulkPlayersText("");
    setShowBulkImport(false);
  }

  function handleRemovePlayerFromRoster(playerId: string) {
    if (!takeCoachControl()) return;
    const nextRoster = roster.filter((p) => p.id !== playerId);
    const nextStarters = setupPitchIds.filter((id) => id !== playerId);
    const nextGkId =
      setupGkId === playerId ? nextStarters[0] || "" : setupGkId;
    setRoster(nextRoster);
    setSetupPitchIds(nextStarters);
    setSetupGkId(nextGkId);
    const ts = Date.now();
    setNow(ts);
    setMatchState((prev) =>
      syncSquadToLiveMatch(prev, nextRoster, nextStarters, nextGkId, ts)
    );
  }

  function handleStartNewMatchFromSetup() {
    if (!takeCoachControl()) return;
    const ts = Date.now();
    const elapsedMs = getTotalMatchElapsedMs(matchState, ts);
    if (elapsedMs > 5_000 && matchState.status !== "finished") {
      if (
        typeof window !== "undefined" &&
        !window.confirm(
          `Pågående match mot ${matchState.config.opponent} sparas i cuploggen och en ny match mot ${draftConfig.opponent} startas på 0:00. Fortsätt?`
        )
      ) {
        return;
      }
    }
    if (elapsedMs > 20_000) {
      rememberMatch(matchState, ts);
    }

    const activeIds = new Set(
      roster.filter((p) => p.activeInSquad).map((p) => p.id)
    );
    const validStarters = setupPitchIds
      .filter((id) => activeIds.has(id))
      .slice(0, pitchCapacity);

    for (const p of roster) {
      if (validStarters.length >= pitchCapacity) break;
      if (p.activeInSquad && !validStarters.includes(p.id)) {
        validStarters.push(p.id);
      }
    }

    const gk = validStarters.includes(setupGkId)
      ? setupGkId
      : validStarters[0];

    const freshState = createInitialMatchState(
      roster,
      draftConfig,
      validStarters,
      gk
    );
    forceNextPushRef.current = true;
    setMatchState(freshState);
    clearSubSelection();
    setGoalPick(null);
    periodAlertedRef.current = null;
    stintAlertedKeyRef.current = "";
    setActiveTab("match");
  }

  const teamFairnessScore = useMemo(() => {
    const totalMatchMs = getTotalMatchElapsedMs(matchState, now);
    if (totalMatchMs < 30_000 || playerMetrics.length === 0) return 100;
    const avg =
      playerMetrics.reduce((s, m) => s + m.fairnessMs, 0) /
      playerMetrics.length;
    if (avg <= 0) return 100;
    const avgDeviation =
      playerMetrics.reduce(
        (s, m) => s + Math.abs(m.fairnessMs - avg),
        0
      ) / playerMetrics.length;
    const ratio = Math.max(0, 1 - avgDeviation / (avg * 0.85));
    return Math.round(ratio * 100);
  }, [playerMetrics, matchState, now]);

  const maxMultiSubCount = Math.min(
    pitchMetrics.filter((m) => !m.player.isGoalkeeper).length,
    benchMetrics.filter((m) => !m.player.resting).length,
    4
  );

  const isPreKickoffMatch =
    getTotalMatchElapsedMs(matchState, now) === 0 &&
    matchState.currentPeriod === 1 &&
    matchState.status === "paused";

  const nextCupMatch = useMemo(() => {
    const currentIdx = CUP_MATCHES.findIndex(
      (m) =>
        matchState.config.eventTitle === `Provcup 25 okt · ${m.title}` ||
        matchState.config.opponent === m.opponent
    );
    if (currentIdx >= 0 && currentIdx + 1 < CUP_MATCHES.length) {
      return CUP_MATCHES[currentIdx + 1];
    }
    return null;
  }, [matchState.config.eventTitle, matchState.config.opponent]);

  function handleAdvanceToNextCupMatch() {
    if (!nextCupMatch || !takeCoachControl()) return;
    const ts = Date.now();
    if (getTotalMatchElapsedMs(matchState, ts) > 5_000) {
      rememberMatch(matchState, ts);
    }
    const setup = buildCupSetup(nextCupMatch, roster);
    const currentActiveMap = new Map(
      roster.map((p) => [p.id, p.activeInSquad])
    );
    const preservedRoster = setup.roster.map((p) => ({
      ...p,
      activeInSquad:
        p.activeInSquad && currentActiveMap.get(p.id) === false
          ? false
          : p.activeInSquad,
    }));
    const cap = getPitchCapacity(setup.config.format);
    const finalRoster =
      preservedRoster.filter((p) => p.activeInSquad).length >= cap
        ? preservedRoster
        : setup.roster;
    const activeSet = new Set(
      finalRoster.filter((p) => p.activeInSquad).map((p) => p.id)
    );
    const gkId = activeSet.has(setup.goalkeeperId)
      ? setup.goalkeeperId
      : finalRoster.find((p) => p.activeInSquad)?.id ?? setup.goalkeeperId;

    // Beräkna uppdaterad cuptid inkl. den nyss avslutade matchen
    const currentSummary = buildMatchSummary(matchState, ts);
    const updatedRows = mergeCupRows(savedMatches, currentSummary);
    const cupTimeById = new Map(
      updatedRows.map((r) => [r.id, r.totalPlayMs - r.goalkeeperMs])
    );
    const outfieldCandidates = finalRoster
      .filter((p) => p.activeInSquad && p.id !== gkId)
      .sort((a, b) => {
        const timeA = cupTimeById.get(a.id) ?? 0;
        const timeB = cupTimeById.get(b.id) ?? 0;
        return timeA - timeB;
      });
    const starters = [
      gkId,
      ...outfieldCandidates.slice(0, cap - 1).map((p) => p.id),
    ];
    const nextConfig: MatchConfig = {
      ...setup.config,
      stintMinutes: resolveStintMinutes(matchState.config),
    };
    setRoster(finalRoster);
    setDraftConfig(nextConfig);
    setSetupPitchIds(starters);
    setSetupGkId(gkId);
    const freshState = createInitialMatchState(
      finalRoster,
      nextConfig,
      starters,
      gkId
    );
    forceNextPushRef.current = true;
    setMatchState(freshState);
    clearSubSelection();
    setGoalPick(null);
    periodAlertedRef.current = null;
    stintAlertedKeyRef.current = "";
    setActiveTab("match");
  }

  function handleClearMatchHistory() {
    if (!takeCoachControl()) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Vill du rensa tidigare sparade matcher ur rapporten så att endast dagens match räknas?"
      )
    ) {
      return;
    }
    forceNextPushRef.current = true;
    setSavedMatches([]);
  }

  function buildCupSummaryText(): string {
    const lines: string[] = [];
    lines.push(
      `⚽ ${teamProfile.displayName.toUpperCase()} – MATCH- & SPELTIDSRAPPORT`
    );
    const allMatches =
      getTotalMatchElapsedMs(matchState, now) > 5_000
        ? [
            buildMatchSummary(matchState, now),
            ...savedMatches.filter((m) => m.id !== matchState.id),
          ]
        : savedMatches;
    if (allMatches.length > 0) {
      lines.push("");
      lines.push("MATCHER:");
      for (const m of allMatches) {
        const gLine = goalHeadline(m.goals);
        const fmtTag = m.formation ? ` [${m.formation}]` : "";
        lines.push(
          `• ${teamProfile.clubName} ${m.ourScore}–${m.opponentScore} ${
            m.opponent
          }${fmtTag}${gLine ? ` (${gLine})` : ""}`
        );
      }
    }
    const formationLogs = matchState.logs.filter((l) => l.type === "formation");
    if (formationLogs.length > 0) {
      lines.push("");
      lines.push(
        `UPPSTÄLLNINGSSKIFTEN: ${formationLogs
          .map(
            (l) => `P${l.period} ${Math.floor(l.matchTimeMs / 60000)}' (${l.note})`
          )
          .join(", ")}`
      );
    }
    if (cupRows.length > 0) {
      lines.push("");
      lines.push("SPELTID & SIDOPAR/POSITIONER:");
      for (const r of [...cupRows].sort(
        (a, b) => b.totalPlayMs - a.totalPlayMs
      )) {
        const pos = Object.entries(r.positionMs ?? {})
          .filter(([, ms]) => ms >= 1000)
          .sort((a, b) => b[1] - a[1])
          .map(([code, ms]) => `${code} ${formatDurationMmSs(ms)}`)
          .join(", ");
        const zones = summarizeRoleZones(r.positionMs);
        const sideParts: string[] = [];
        if (zones.leftSideMs >= 1000) {
          sideParts.push(`V-sida ${formatDurationMmSs(zones.leftSideMs)}`);
        }
        if (zones.rightSideMs >= 1000) {
          sideParts.push(`H-sida ${formatDurationMmSs(zones.rightSideMs)}`);
        }
        lines.push(
          `• ${r.name}: ${formatDurationMmSs(r.totalPlayMs)}${
            r.goalkeeperMs >= 1000
              ? ` (MV ${formatDurationMmSs(r.goalkeeperMs)})`
              : ""
          }${pos ? ` [${pos}]` : ""}${
            sideParts.length > 0 ? ` (${sideParts.join(", ")})` : ""
          }`
        );
      }
    }
    return lines.join("\n");
  }

  function handleCopyCupSummary() {
    const text = buildCupSummaryText();
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        setCopiedSummary(true);
        setTimeout(() => setCopiedSummary(false), 2500);
      });
    }
  }

  function handleShareSummaryWhatsApp() {
    const text = buildCupSummaryText();
    const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(waUrl, "_blank", "noopener,noreferrer");
  }

  const selectedMismatch = selectedOutIds.length !== selectedInIds.length;
  const canExecuteSub =
    selectedOutIds.length > 0 &&
    selectedOutIds.length === selectedInIds.length;
  const canSwapPitchPair =
    selectedOutIds.length === 2 && selectedInIds.length === 0;

  // Tydlig sammanfattning av valda byten inklusive positionskod (t.ex. "Charlie ➔ Oliver (VM)")
  const subPairsSummary = useMemo(() => {
    const count = Math.max(selectedOutIds.length, selectedInIds.length);
    if (count === 0) return "";
    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
      const outP = selectedOutIds[i]
        ? matchState.players.find((p) => p.id === selectedOutIds[i])
        : undefined;
      const inP = selectedInIds[i]
        ? matchState.players.find((p) => p.id === selectedInIds[i])
        : undefined;
      const pos = outP ? pitchPositionCode(matchState, outP) : null;
      const posText = pos ? ` (${pos})` : "";
      if (inP && outP) {
        parts.push(`${inP.name} ➔ ${outP.name}${posText}`);
      } else if (outP) {
        parts.push(`? ➔ ${outP.name}${posText}`);
      } else if (inP) {
        parts.push(`${inP.name} ➔ ?`);
      }
    }
    return parts.join(" · ");
  }, [selectedOutIds, selectedInIds, matchState]);

  function metricFor(m: ComputedPlayerMetrics) {
    const ms =
      tokenStat === "play"
        ? m.totalPlayMs
        : tokenStat === "stint"
        ? m.currentStintMs
        : m.benchMs;
    const tone: "good" | "mid" | "low" = m.stintAlert
      ? "low"
      : m.conditionPct >= 75
      ? "good"
      : m.conditionPct >= 58
      ? "mid"
      : "low";
    return { text: formatDurationMmSs(ms), tone };
  }

  const recentChanges = matchState.logs
    .filter((log) => log.type === "sub" || log.type === "gk_change")
    .slice(0, 4);

  const openGoal = goalPick
    ? (matchState.goals ?? []).find((goal) => goal.id === goalPick.goalId)
    : undefined;

  const cupGoalLine = goalHeadline(
    savedMatches
      .filter((match) => match.id !== matchState.id)
      .flatMap((match) => match.goals ?? [])
      .concat(matchState.goals ?? [])
  );

  function handleToggleFocusMode() {
    setFocusMode((prev) => {
      const next = !prev;
      if (next) {
        setActiveTab("match");
        setPitchViewMode("pitch");
      }
      return next;
    });
  }

  const coachList =
    teamProfile.coaches?.length > 0 ? teamProfile.coaches : ["Tränare"];

  return (
    <div
      style={
        {
          "--cm-varmbol-blue": teamProfile.colors.primary,
          "--cm-gold": teamProfile.colors.secondary,
        } as React.CSSProperties
      }
      className={
        focusMode && activeTab === "match"
          ? "h-[100dvh] overflow-hidden flex flex-col bg-[#030914] select-none"
          : "min-h-screen flex flex-col pb-36 select-none"
      }
    >
      {/* ============================================================
          CHAMPIONSHIP MANAGER TOP TITLE BAR & NAVIGATION
         ============================================================ */}
      <header className="sticky top-0 z-30 bg-[#050e1d]/95 backdrop-blur-md border-b-2 border-[#facc15]/80 shadow-[0_6px_30px_rgba(0,0,0,0.85)]">
        {(!focusMode || activeTab !== "match") && (
        <div className="cm-header-bar px-3 py-2">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-2">
            {/* Klubbvapen & Titel */}
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded bg-white/10 p-1 flex items-center justify-center border border-[#facc15]/70 shadow-inner shrink-0">
                {teamProfile.logoUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={teamProfile.logoUrl}
                    alt={teamProfile.clubName}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <span className="font-display font-extrabold text-xs sm:text-sm uppercase text-[#facc15] tracking-tighter">
                    {teamProfile.shortName}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-display font-extrabold text-base sm:text-xl tracking-wider uppercase text-white drop-shadow truncate">
                    {teamProfile.clubName} · {teamProfile.teamName}
                  </span>
                  <button
                    type="button"
                    disabled={isReadOnlyFollower}
                    onClick={() =>
                      handleChangeFormation(
                        currentFormation === "1-4-1" ? "1-1-3-1" : "1-4-1"
                      )
                    }
                    title="Tryck för att växla direkt mellan 1-4-1 (Lars) och 1-1-3-1 (Jocke)"
                    className="px-2 py-0.5 rounded bg-[#facc15] hover:bg-yellow-300 active:scale-95 text-slate-950 font-mono-cm font-extrabold text-[10px] uppercase tracking-wider shrink-0 flex items-center gap-1 shadow transition"
                  >
                    <span>{currentFormation}</span>
                    <span className="text-[9px] opacity-80">⇄</span>
                  </button>
                </div>
                <div className="text-[11px] text-sky-100/90 font-medium truncate">
                  {matchState.config.eventTitle ||
                    `Match vs ${matchState.config.opponent}`}{" "}
                  · {matchState.config.periods}×
                  {matchState.config.periodMinutes}m · stint{" "}
                  {resolveStintMinutes(matchState.config)}m
                </div>
              </div>
            </div>

            {/* Tränare + Live-synk + Admin/Lag */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {isReadOnlyFollower ? (
                <div className="px-2 py-1 rounded bg-emerald-400/20 border border-emerald-400/50 font-mono-cm text-[10px] font-extrabold uppercase text-emerald-200 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Följ live</span>
                </div>
              ) : (
                <div
                  className="flex items-center bg-[#040d1a]/90 border border-sky-300/30 rounded p-0.5 font-mono-cm text-[10px] font-extrabold uppercase"
                  title={
                    syncUpdatedAt
                      ? `Senast synkad ${new Date(
                          syncUpdatedAt
                        ).toLocaleTimeString("sv-SE")}`
                      : "Välj Styr på den telefon som trycker, Följ live på de andra"
                  }
                >
                  <button
                    type="button"
                    onClick={() => handleSetSyncMode("control")}
                    className={`px-1.5 sm:px-2 py-1 rounded flex items-center gap-1 transition ${
                      syncMode === "control"
                        ? "bg-[#facc15] text-slate-950"
                        : "text-sky-200 hover:text-white"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        syncError
                          ? "bg-rose-500"
                          : syncMode === "control"
                          ? "bg-slate-950"
                          : "bg-slate-500"
                      }`}
                    />
                    <span>Styr</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetSyncMode("follow")}
                    className={`px-1.5 sm:px-2 py-1 rounded flex items-center gap-1 transition ${
                      syncMode === "follow"
                        ? "bg-emerald-400 text-slate-950"
                        : "text-sky-200 hover:text-white"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        syncError
                          ? "bg-rose-500"
                          : syncMode === "follow"
                          ? "bg-slate-950 animate-pulse"
                          : "bg-slate-500"
                      }`}
                    />
                    <span>Följ</span>
                  </button>
                </div>
              )}

              <div className="hidden sm:flex items-center gap-2 bg-[#040d1a]/90 border border-sky-300/30 rounded px-2.5 py-1">
                <div className="flex -space-x-1">
                  {coachList.slice(0, 4).map((coach, idx) => {
                    const badgeClasses = [
                      "bg-[#005cb9] text-white border-white/80",
                      "bg-[#facc15] text-slate-950 border-slate-950",
                      "bg-emerald-400 text-slate-950 border-slate-950",
                      "bg-sky-400 text-slate-950 border-slate-950",
                    ][idx % 4];
                    return (
                      <span
                        key={`${coach}-${idx}`}
                        className={`w-5 h-5 rounded-full border font-mono-cm font-extrabold text-[9px] flex items-center justify-center shadow uppercase ${badgeClasses}`}
                      >
                        {coach.trim()[0] || "T"}
                      </span>
                    );
                  })}
                </div>
                <div className="text-[10px] leading-tight">
                  <div className="font-mono-cm font-bold text-[#facc15] uppercase tracking-wider">
                    TRÄNARE
                  </div>
                  <div className="text-white font-display font-bold uppercase tracking-wide max-w-[130px] truncate">
                    {coachList.join(", ")}
                  </div>
                </div>
              </div>

              {onOpenAdminModal && (
                <button
                  type="button"
                  onClick={onOpenAdminModal}
                  className={`px-2 py-1.5 rounded border font-mono-cm font-extrabold text-[10px] uppercase flex items-center gap-1 transition active:scale-95 ${
                    authRole === "superadmin"
                      ? "bg-[#facc15] text-slate-950 border-yellow-200 shadow"
                      : "bg-[#040d1a]/80 border-sky-300/30 text-sky-200 hover:text-white"
                  }`}
                  title={
                    authRole === "superadmin"
                      ? "Admin: Skapa lag, WhatsApp-inbjudningar & byt aktivt lag"
                      : "Lagprofil & byt lagkod"
                  }
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>{authRole === "superadmin" ? "Admin" : "Lagkod"}</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleToggleFocusMode}
                className={`px-2 py-1.5 rounded border font-mono-cm font-extrabold text-[10px] uppercase flex items-center gap-1 transition active:scale-95 ${
                  focusMode
                    ? "bg-[#facc15] text-slate-950 border-yellow-200"
                    : "bg-[#040d1a]/80 border-sky-300/30 text-sky-200 hover:text-white"
                }`}
                title="Fokusläge: klocka, plan och bänk på en enda skärm utan scroll"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Fokus</span>
              </button>

              <button
                type="button"
                onClick={() => setSoundEnabled((s) => !s)}
                className="p-2 rounded bg-[#040d1a]/80 border border-sky-300/30 text-sky-200 hover:text-white active:scale-95"
                title={soundEnabled ? "Visselsignal på" : "Ljud av"}
              >
                {soundEnabled ? (
                  <Volume2 className="w-4 h-4 text-[#facc15]" />
                ) : (
                  <VolumeX className="w-4 h-4 text-slate-400" />
                )}
              </button>
            </div>
          </div>
        </div>
        )}

        {/* CM FLIK-MENY (TACTICS / SQUAD / STATS) */}
        <div className="max-w-4xl mx-auto px-2 sm:px-3 py-1.5 flex items-center gap-1 sm:gap-1.5 bg-[#061224]">
          <button
            type="button"
            onClick={() => setActiveTab("match")}
            className={`flex-1 py-1.5 px-2 rounded font-display font-bold uppercase tracking-wider text-xs sm:text-sm flex items-center justify-center gap-1 border transition ${
              activeTab === "match"
                ? "bg-[#facc15] text-slate-950 border-[#fef08a] shadow-[0_0_15px_rgba(250,204,21,0.4)]"
                : "bg-[#0b1c36] text-sky-200 border-sky-500/25 hover:bg-[#10274a]"
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5 shrink-0" />
            <span>Plan</span>
            {matchState.status === "running" && (
              <span className="w-2 h-2 rounded-full bg-emerald-600 animate-ping" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("tactics")}
            className={`flex-1 py-1.5 px-2 rounded font-display font-bold uppercase tracking-wider text-xs sm:text-sm flex items-center justify-center gap-1 border transition ${
              activeTab === "tactics"
                ? "bg-[#facc15] text-slate-950 border-[#fef08a] shadow-[0_0_15px_rgba(250,204,21,0.4)]"
                : "bg-[#0b1c36] text-[#facc15] border-[#facc15]/45 hover:bg-[#10274a]"
            }`}
          >
            <Compass className="w-3.5 h-3.5 shrink-0" />
            <span>Rörelse</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("setup")}
            className={`flex-1 py-1.5 px-2 rounded font-display font-bold uppercase tracking-wider text-xs sm:text-sm flex items-center justify-center gap-1 border transition ${
              activeTab === "setup"
                ? "bg-[#facc15] text-slate-950 border-[#fef08a] shadow-[0_0_15px_rgba(250,204,21,0.4)]"
                : "bg-[#0b1c36] text-sky-200 border-sky-500/25 hover:bg-[#10274a]"
            }`}
          >
            <Users className="w-3.5 h-3.5 shrink-0" />
            <span>Lag</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("stats")}
            className={`flex-1 py-1.5 px-2 rounded font-display font-bold uppercase tracking-wider text-xs sm:text-sm flex items-center justify-center gap-1 border transition ${
              activeTab === "stats"
                ? "bg-[#facc15] text-slate-950 border-[#fef08a] shadow-[0_0_15px_rgba(250,204,21,0.4)]"
                : "bg-[#0b1c36] text-sky-200 border-sky-500/25 hover:bg-[#10274a]"
            }`}
          >
            <Trophy className="w-3.5 h-3.5 shrink-0" />
            <span>Tid</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("guide")}
            className={`flex-1 py-1.5 px-2 rounded font-display font-bold uppercase tracking-wider text-xs sm:text-sm flex items-center justify-center gap-1 border transition ${
              activeTab === "guide"
                ? "bg-[#facc15] text-slate-950 border-[#fef08a] shadow-[0_0_15px_rgba(250,204,21,0.4)]"
                : "bg-[#0b1c36] text-sky-200 border-sky-500/25 hover:bg-[#10274a]"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 shrink-0" />
            <span>Guide</span>
          </button>

          {focusMode && activeTab === "match" && (
            <button
              type="button"
              onClick={() => setFocusMode(false)}
              className="py-1.5 px-2 rounded bg-slate-900 text-[#facc15] border border-[#facc15]/40 font-mono-cm font-extrabold text-[10px] uppercase shrink-0"
              title="Avsluta fokusläge"
            >
              <Minimize2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </header>

      <main
        className={
          focusMode && activeTab === "match"
            ? "max-w-4xl w-full mx-auto px-1.5 py-1.5 flex-1 min-h-0 flex flex-col gap-1.5 overflow-hidden"
            : "max-w-4xl w-full mx-auto px-2.5 sm:px-4 pt-3 flex-1 space-y-3"
        }
      >
        {isFollowing && (
          <div className="rounded-lg bg-emerald-400/15 border border-emerald-400/40 px-2.5 py-1 flex items-center justify-between gap-2 font-mono-cm text-[11px] text-emerald-200 shrink-0">
            <span className="truncate">
              Följer live — klockan och bytena styrs från en annan telefon
              {syncUpdatedAt
                ? ` · ${new Date(syncUpdatedAt).toLocaleTimeString("sv-SE")}`
                : ""}
            </span>
            {!isReadOnlyFollower && (
              <button
                type="button"
                onClick={() => handleSetSyncMode("control")}
                className="shrink-0 px-2 py-0.5 rounded bg-emerald-400 text-slate-950 font-extrabold uppercase text-[10px]"
              >
                Ta över
              </button>
            )}
          </div>
        )}
        {activeTab === "match" && matchState.status === "finished" && (
          <div className="rounded-xl bg-emerald-950/80 border-2 border-[#facc15] px-3 py-2.5 flex flex-wrap items-center justify-between gap-2 shrink-0 shadow-lg">
            <div>
              <div className="font-display font-extrabold text-sm uppercase text-[#facc15]">
                Matchen slut · {teamProfile.clubName} {matchState.ourScore} – {matchState.opponentScore} {matchState.config.opponent || "Motståndare"}
              </div>
              <div className="font-mono-cm text-[11px] text-emerald-200">
                Alla tider och mål räknas in i Cupen totalt.
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {isVfcDefault && nextCupMatch ? (
                <button
                  type="button"
                  disabled={isFollowing}
                  onClick={handleAdvanceToNextCupMatch}
                  className="px-3 py-1.5 rounded-lg bg-[#facc15] hover:bg-yellow-300 text-slate-950 font-display font-extrabold text-xs uppercase tracking-wider shadow"
                >
                  Nästa match: {nextCupMatch.title} →
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveTab("stats")}
                  className="px-3 py-1.5 rounded-lg bg-[#facc15] text-slate-950 font-display font-extrabold text-xs uppercase"
                >
                  Visa slutrapport →
                </button>
              )}
            </div>
          </div>
        )}
        {/* ============================================================
            FLIK 1: CHAMPIONSHIP MANAGER MATCH ENGINE & 2D PITCH
           ============================================================ */}
        {activeTab === "match" &&
          (focusMode ? (
            <div className="flex-1 min-h-0 flex flex-col gap-1.5 overflow-hidden">
              {/* Tydlig matchklocka + ställning + verktygsrad i fokusläge */}
              <section className="cm-bevel rounded-xl p-1.5 flex flex-col gap-1.5 shrink-0">
                <div className="flex items-stretch justify-between gap-1.5">
                  {/* Stor tydlig matchklocka + Start/Paus i egen belyst ram */}
                  <div
                    className={`flex-1 flex items-center justify-between gap-2 rounded-lg bg-[#02060d] px-2.5 py-1 border-2 transition-all shrink-0 ${
                      isPeriodOvertime
                        ? "border-[#facc15] shadow-[0_0_16px_rgba(250,204,21,0.35)]"
                        : matchState.status === "running"
                        ? "border-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.3)]"
                        : "border-[#facc15]/85 shadow-[0_0_12px_rgba(250,204,21,0.18)]"
                    }`}
                  >
                    <div
                      title="Matchklocka"
                      className="flex flex-col justify-center select-none shrink-0"
                    >
                      <div className="flex items-center gap-1 leading-none mb-0.5 whitespace-nowrap">
                        <span className="px-1.5 py-[1px] rounded bg-[#005cb9] text-[10px] font-mono-cm font-extrabold uppercase text-white">
                          P{matchState.currentPeriod}/{matchState.config.periods}
                        </span>
                        <span
                          className={`text-[10px] font-mono-cm font-extrabold uppercase tracking-tight ${
                            isPeriodOvertime
                              ? "text-[#facc15] animate-pulse"
                              : "text-sky-200"
                          }`}
                        >
                          {isPeriodOvertime
                            ? "FULL TID!"
                            : `KVAR ${formatDurationMmSs(periodRemainingMs)}`}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <span
                          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                            isPeriodOvertime
                              ? "bg-[#facc15] animate-ping"
                              : matchState.status === "running"
                              ? "bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]"
                              : "bg-[#facc15]"
                          }`}
                        />
                        <span
                          className={`font-mono-cm text-[32px] sm:text-4xl font-extrabold tracking-tight tabular-nums leading-none ${
                            isPeriodOvertime
                              ? "text-[#facc15] animate-pulse"
                              : matchState.status === "running"
                              ? "text-emerald-400"
                              : "text-[#facc15]"
                          }`}
                        >
                          {formatDurationMmSs(periodElapsedMs)}
                        </span>
                      </div>
                    </div>

                    {/* Start/Paus + ev. Nästa Period */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={handleToggleClock}
                        className={`py-2 px-2.5 rounded-lg font-display font-extrabold text-xs uppercase tracking-wider flex items-center gap-1 border shadow active:scale-95 whitespace-nowrap ${
                          matchState.status === "running"
                            ? "bg-[#facc15] text-slate-950 border-yellow-200"
                            : "bg-emerald-500 text-slate-950 border-emerald-300"
                        }`}
                      >
                        {matchState.status === "running" ? (
                          <>
                            <Pause className="w-3.5 h-3.5 fill-slate-950" />
                            <span>Paus</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5 fill-slate-950" />
                            <span>
                              {periodElapsedMs === 0
                                ? `Start P${matchState.currentPeriod}`
                                : "Kör"}
                            </span>
                          </>
                        )}
                      </button>

                      {periodElapsedMs > 0 &&
                        (matchState.status !== "running" || isPeriodOvertime) && (
                          <button
                            type="button"
                            onClick={handleEndPeriod}
                            className={`py-2 px-2 rounded-lg font-mono-cm font-extrabold text-[11px] uppercase border active:scale-95 whitespace-nowrap ${
                              isPeriodOvertime
                                ? "bg-[#facc15] text-slate-950 border-yellow-200 animate-pulse"
                                : "bg-[#102649] text-sky-200 border-sky-400/30"
                            }`}
                            title="Nästa period eller avsluta match"
                          >
                            {matchState.currentPeriod >=
                            matchState.config.periods
                              ? "Slut"
                              : `P${matchState.currentPeriod + 1}→`}
                          </button>
                        )}
                    </div>
                  </div>

                  {/* Ställning VFC : Motståndare */}
                  <div className="flex flex-col justify-center bg-[#040a14] border border-sky-400/30 rounded-lg px-2 py-1 shrink-0">
                    <div className="flex items-center justify-between text-[9px] font-display font-extrabold uppercase tracking-wider leading-none mb-1">
                      <span className="text-sky-300">{teamProfile.shortName}</span>
                      <span className="text-amber-300 truncate max-w-[52px]">
                        {matchState.config.opponent || "MOT"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={handleRemoveOurGoal}
                        aria-label="Ta bort senaste Värmbolsmål"
                        className="w-5 h-5 rounded bg-slate-800 text-slate-300 text-xs font-bold"
                      >
                        -
                      </button>
                      <span className="font-mono-cm text-lg font-extrabold text-white min-w-[1rem] text-center leading-none">
                        {matchState.ourScore}
                      </span>
                      <button
                        type="button"
                        onClick={handleAddOurGoal}
                        aria-label="Värmbols mål"
                        className="w-5 h-5 rounded bg-[#005cb9] text-white text-xs font-bold"
                      >
                        +
                      </button>
                      <span className="font-mono-cm text-slate-500 font-bold text-xs">
                        :
                      </span>
                      <button
                        type="button"
                        onClick={handleRemoveOpponentGoal}
                        aria-label="Ta bort senaste insläppta mål"
                        className="w-5 h-5 rounded bg-slate-800 text-slate-300 text-xs font-bold"
                      >
                        -
                      </button>
                      <span className="font-mono-cm text-lg font-extrabold text-white min-w-[1rem] text-center leading-none">
                        {matchState.opponentScore}
                      </span>
                      <button
                        type="button"
                        onClick={handleAddOpponentGoal}
                        aria-label="Insläppt mål"
                        className="w-5 h-5 rounded bg-slate-700 text-white text-xs font-bold"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>

                {/* Verktygsrad på en rad: Förslag 1x–4x, MV-krage, Formation, Styr/Följ, Ångra, Full */}
                <div className="flex items-center justify-between gap-1 pt-1 border-t border-sky-400/15">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-display font-extrabold uppercase text-[#facc15]">
                      Byt:
                    </span>
                    {[1, 2, 3, 4].map((count) => {
                      const disabled = count > maxMultiSubCount;
                      const active =
                        suggestionBanner !== null && suggestionCount === count;
                      return (
                        <button
                          key={count}
                          type="button"
                          disabled={disabled}
                          onClick={() => handleSuggestSubs(count)}
                          className={`px-1.5 py-0.5 rounded font-mono-cm font-extrabold text-[11px] border ${
                            disabled
                              ? "bg-slate-900/40 text-slate-600 border-white/5"
                              : active
                              ? "bg-[#facc15] text-slate-950 border-yellow-200"
                              : "bg-[#0f2547] text-white border-sky-400/30"
                          }`}
                        >
                          {count}x
                        </button>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() => setGkModalOpen(true)}
                      className="px-1.5 py-0.5 rounded font-display font-bold uppercase text-[11px] bg-amber-400/15 text-[#facc15] border border-[#facc15]/40 flex items-center gap-0.5"
                    >
                      <Shield className="w-3 h-3 fill-[#facc15]" />
                      <span>MV</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTeamTalkOpen(true)}
                      title="Visa startelva & roller på stor skärm för spelarna"
                      className="px-1.5 py-0.5 rounded font-display font-bold uppercase text-[11px] bg-[#0f2547] text-sky-200 border border-sky-400/30"
                    >
                      Samling
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab("tactics")}
                      title="Öppna animerad rörelsetaktik för Anfall & Försvar"
                      className="px-1.5 py-0.5 rounded font-display font-extrabold uppercase text-[11px] bg-[#facc15] text-slate-950 border border-yellow-200 flex items-center gap-0.5"
                    >
                      <Compass className="w-3 h-3" />
                      <span>Rörelse</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    {matchState.config.format === "7v7" && (
                      <select
                        aria-label="Formation"
                        value={currentFormation}
                        onChange={(e) =>
                          handleChangeFormation(
                            e.target.value as TacticalFormation
                          )
                        }
                        className="bg-[#040a14] border border-sky-400/30 rounded px-1 py-0.5 font-mono-cm font-bold text-[11px] text-white"
                      >
                        {FORMATIONS_7V7.map((fmt) => (
                          <option key={fmt} value={fmt}>
                            {fmt}
                          </option>
                        ))}
                      </select>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        setTokenStat((s) => (s === "play" ? "stint" : "play"))
                      }
                      title="Växla siffran under spelarna: Total speltid eller Inne nu (stint)"
                      className="px-1.5 py-0.5 rounded font-mono-cm font-extrabold text-[10px] uppercase border bg-[#040a14] text-sky-200 border-sky-400/30"
                    >
                      {tokenStat === "stint" ? "Inne nu" : "Speltid"}
                    </button>

                    {matchState.undoStack.length > 0 && (
                      <button
                        type="button"
                        onClick={handleUndo}
                        className="p-1 rounded bg-slate-900 text-[#facc15] border border-[#facc15]/40 active:scale-95"
                        title={`Ångra: ${matchState.undoStack[0].label}`}
                      >
                        <Undo2 className="w-3.5 h-3.5" />
                      </button>
                    )}


                  </div>
                </div>
              </section>

              {/* Flexibel 2D-plan som tar återstående höjd */}
              <section className="flex-1 min-h-0 flex flex-col rounded-xl overflow-hidden border border-white/25 shadow-lg">
                {goalPick ? (
                  <GoalPickBar
                    phase={goalPick.phase}
                    scorerLabel={openGoalLabel(
                      matchState.goals,
                      goalPick.goalId
                    )}
                    onSkip={handleSkipGoalPick}
                  />
                ) : (
                  <div className="bg-[#061224] text-sky-100 border-b border-sky-400/25 px-2.5 py-1 flex items-center justify-between gap-2 shrink-0">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span className="px-1 py-0.2 bg-[#facc15] text-slate-950 font-mono-cm font-extrabold text-[9px] rounded shrink-0">
                        LIVE
                      </span>
                      <CoachTicker text={cmCommentaryText} />
                    </div>
                    {goalHeadline(matchState.goals) && (
                      <span className="font-mono-cm font-extrabold text-[10px] text-[#facc15] shrink-0">
                        {goalHeadline(matchState.goals)}
                      </span>
                    )}
                  </div>
                )}

                <div className="cm-pitch-surface relative flex-1 min-h-0">
                  <div className="absolute inset-2.5 border border-white/25 rounded pointer-events-none" />
                  <div className="absolute inset-x-2.5 top-1/2 -translate-y-1/2 h-px bg-white/25 pointer-events-none" />
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full border border-white/25 pointer-events-none" />
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-white/35 pointer-events-none" />
                  <div className="absolute left-1/2 -translate-x-1/2 top-2.5 w-32 sm:w-44 h-8 border-b border-x border-white/25 pointer-events-none" />
                  <div className="absolute left-1/2 -translate-x-1/2 bottom-2.5 w-36 sm:w-48 h-12 border-t border-x border-white/30 pointer-events-none" />

                  {/* Visuell sidopar-koppling i 1-4-1 (VM+IMV till vänster, IMH+HM till höger) */}
                  {currentFormation === "1-4-1" && (
                    <>
                      <div className="absolute left-[5%] w-[42%] top-[34%] h-[25%] rounded-2xl border border-dashed border-[#facc15]/45 bg-[#facc15]/[0.05] pointer-events-none flex items-start justify-center pt-0.5">
                        <span className="px-1.5 py-[1px] rounded bg-black/55 text-[#facc15] font-mono-cm font-extrabold text-[8px] uppercase tracking-wider">
                          Vänsterpar (VM+IMV)
                        </span>
                      </div>
                      <div className="absolute right-[5%] w-[42%] top-[34%] h-[25%] rounded-2xl border border-dashed border-sky-300/45 bg-sky-400/[0.05] pointer-events-none flex items-start justify-center pt-0.5">
                        <span className="px-1.5 py-[1px] rounded bg-black/55 text-sky-200 font-mono-cm font-extrabold text-[8px] uppercase tracking-wider">
                          Högerpar (IMH+HM)
                        </span>
                      </div>
                    </>
                  )}

                  {pitchMetrics.map((m, idx) => {
                    const slotIdx =
                      m.player.pitchSlotIndex ??
                      (m.player.isGoalkeeper ? 0 : idx);
                    const slot =
                      formationSlots.find((s) => s.slotIndex === slotIdx) ||
                      formationSlots[idx % formationSlots.length];
                    const outOrderIndex = selectedOutIds.indexOf(m.player.id);
                    const isSelectedOut = outOrderIndex !== -1;
                    const pairedInPlayerId =
                      isSelectedOut && selectedInIds[outOrderIndex]
                        ? selectedInIds[outOrderIndex]
                        : undefined;
                    const pairedInPlayer = pairedInPlayerId
                      ? matchState.players.find(
                          (p) => p.id === pairedInPlayerId
                        )
                      : undefined;
                    const metric = metricFor(m);

                    return (
                      <div
                        key={m.player.id}
                        style={{
                          left: `${slot.xPct}%`,
                          top: `${slot.yPct}%`,
                        }}
                        className="absolute -translate-x-1/2 -translate-y-1/2 z-20 transition-all duration-300 ease-out"
                      >
                        <button
                          type="button"
                          onClick={() => handlePitchPlayerClick(m.player.id)}
                          className="relative flex flex-col items-center focus:outline-none active:scale-95 transition-transform"
                        >
                          {goalPick?.phase === "assist" &&
                            openGoal?.scorerId === m.player.id && (
                              <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap px-1 py-[1px] rounded bg-[#facc15] text-slate-950 font-mono-cm font-extrabold text-[8px] uppercase shadow">
                                Mål
                              </span>
                            )}
                          {!goalPick && isSelectedOut && (
                            <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap px-1 py-[1px] rounded bg-orange-500 text-slate-950 font-mono-cm font-extrabold text-[8px] uppercase shadow">
                              {pairedInPlayer
                                ? `⇄ ${pairedInPlayer.name}`
                                : `UT ${outOrderIndex + 1}`}
                            </span>
                          )}
                          {!goalPick && !isSelectedOut && m.stintAlert && (
                            <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap px-1 py-[1px] rounded bg-rose-500 text-white font-mono-cm font-extrabold text-[8px] uppercase shadow animate-pulse">
                              BYT
                            </span>
                          )}
                          <PlayerAvatar
                            name={m.player.name}
                            isGoalkeeper={m.player.isGoalkeeper}
                            isSelected={isSelectedOut}
                            selectionType="out"
                            posCode={slot.code}
                            highlight={
                              goalPick
                                ? goalPick.phase === "assist" &&
                                  openGoal?.scorerId === m.player.id
                                  ? "shot"
                                  : goalPick.phase === "scorer"
                                  ? "shot"
                                  : "pass"
                                : undefined
                            }
                            size="sm"
                            number={m.player.number}
                            stat={metric.text}
                            statTone={metric.tone}
                          />
                          <span
                            className={`absolute left-1/2 top-[calc(100%+8px)] -translate-x-1/2 max-w-[5.2rem] truncate text-center font-display font-extrabold text-[10px] uppercase leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)] ${
                              isSelectedOut ? "text-orange-300" : "text-white"
                            }`}
                          >
                            {m.player.name}
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Kompakt bytesrad direkt över bänken när spelare är valda */}
              {(selectedOutIds.length > 0 || selectedInIds.length > 0) && (
                <div className="rounded-lg bg-[#040c1a] border border-[#facc15] px-2.5 py-1.5 flex flex-col gap-1.5 shrink-0">
                  {selectedOutIds.length === 1 && selectedInIds.length === 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="font-mono-cm text-[9px] font-bold uppercase text-sky-300">
                        Flytta position:
                      </span>
                      {formationSlots.map((slot) => {
                        const occ = pitchMetrics.find(
                          (m) =>
                            (m.player.pitchSlotIndex ??
                              (m.player.isGoalkeeper ? 0 : -1)) ===
                            slot.slotIndex
                        )?.player;
                        const isSelf = occ?.id === selectedOutIds[0];
                        return (
                          <button
                            key={slot.slotIndex}
                            type="button"
                            onClick={() =>
                              handleMovePlayerToSlot(
                                selectedOutIds[0],
                                slot.slotIndex
                              )
                            }
                            className={`px-1.5 py-0.5 rounded font-mono-cm font-extrabold text-[9px] border ${
                              isSelf
                                ? "bg-[#facc15] text-slate-950 border-yellow-200"
                                : "bg-[#0f2547] text-white border-sky-400/40"
                            }`}
                          >
                            {slot.code}
                            {occ && !isSelf ? ` (${occ.name})` : ""}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div className="font-mono-cm text-[11px] font-bold text-[#facc15] leading-tight">
                    {subPairsSummary}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-mono-cm text-[10px] text-slate-300">
                      <span className="text-emerald-300 font-bold">
                        IN {selectedInIds.length}
                      </span>
                      {" ➔ "}
                      <span className="text-orange-300 font-bold">
                        UT {selectedOutIds.length}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={clearSubSelection}
                        className="px-2 py-1 rounded bg-slate-800 text-slate-200 font-display font-bold uppercase text-[11px]"
                      >
                        Avbryt
                      </button>
                      {canSwapPitchPair && (
                        <button
                          type="button"
                          onClick={handleSwapTwoPitchPlayers}
                          className="px-2.5 py-1 rounded bg-[#005cb9] text-white font-display font-extrabold uppercase text-[11px] border border-sky-300"
                        >
                          Skifta plats
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={!canExecuteSub}
                        onClick={handleConfirmSubstitution}
                        className={`px-3 py-1 rounded font-display font-extrabold text-xs uppercase flex items-center gap-1 ${
                          canExecuteSub
                            ? "bg-emerald-400 text-slate-950"
                            : "bg-slate-800 text-slate-500 cursor-not-allowed"
                        }`}
                      >
                        <ArrowLeftRight className="w-3.5 h-3.5" />
                        <span>
                          {selectedMismatch
                            ? `Välj ${Math.max(
                                selectedOutIds.length,
                                selectedInIds.length
                              )}`
                            : isPreKickoffMatch
                            ? "Ändra startelva"
                            : "Genomför byte"}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Avbytarbänken på en enda horisontell rad längst ner */}
              <section className="cm-bevel rounded-xl px-2 py-2 shrink-0">
                <div
                  className={`grid gap-1 ${
                    benchMetrics.length <= 3
                      ? "grid-cols-3"
                      : benchMetrics.length === 4
                      ? "grid-cols-4"
                      : "grid-cols-5"
                  }`}
                >
                  {benchMetrics.map((m, idx) => {
                    const inOrderIndex = selectedInIds.indexOf(m.player.id);
                    const isSelectedIn = inOrderIndex !== -1;
                    const pairedOutId =
                      isSelectedIn && selectedOutIds[inOrderIndex]
                        ? selectedOutIds[inOrderIndex]
                        : undefined;
                    const pairedOutPlayer = pairedOutId
                      ? matchState.players.find((p) => p.id === pairedOutId)
                      : undefined;
                    const pairedPos = pairedOutPlayer
                      ? pitchPositionCode(matchState, pairedOutPlayer)
                      : null;
                    const metric = metricFor(m);

                    return (
                      <div
                        key={m.player.id}
                        className={`relative flex flex-col items-center min-w-0 ${
                          m.player.resting && !isSelectedIn ? "opacity-55" : ""
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            if (goalPick) return;
                            toggleSelectBenchPlayer(m.player.id);
                          }}
                          className="relative flex flex-col items-center min-w-0 focus:outline-none active:scale-95"
                        >
                          {!isSelectedIn && m.stintAlert && !m.player.resting && (
                            <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-1 py-[1px] rounded bg-emerald-400 text-slate-950 font-mono-cm font-extrabold text-[7px] uppercase shadow z-30">
                              IN
                            </span>
                          )}
                          <PlayerAvatar
                            name={m.player.name}
                            isSelected={isSelectedIn}
                            selectionType="in"
                            size="sm"
                            number={m.player.number}
                            stat={metric.text}
                            statTone={metric.tone}
                          />
                          <span
                            className={`mt-2 max-w-full truncate text-center font-display font-extrabold text-[10px] uppercase leading-none ${
                              isSelectedIn ? "text-emerald-300" : "text-white"
                            }`}
                          >
                            {m.player.name}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleTogglePlayerResting(m.player.id, e)}
                          title="Markera att spelaren vilar / står över nästa byte"
                          className={`mt-0.5 px-1 py-[1px] rounded font-mono-cm text-[8px] font-bold uppercase leading-none border ${
                            m.player.resting
                              ? "bg-rose-500/30 text-rose-200 border-rose-400/50"
                              : isSelectedIn && pairedOutPlayer
                              ? "bg-emerald-950/60 text-emerald-300 border-emerald-400/30"
                              : "bg-slate-900/60 text-slate-300 border-white/10"
                          }`}
                        >
                          {m.player.resting
                            ? "⏸ Vilar"
                            : isSelectedIn && pairedOutPlayer
                            ? `➔ ${pairedOutPlayer.name}${
                                pairedPos ? ` (${pairedPos})` : ""
                              }`
                            : idx === 0
                            ? "Tur in · Vila?"
                            : "Bänk · Vila?"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          ) : (
          <>
            {/* CM SCOREBOARD & MATCH CLOCK */}
            <section className="cm-bevel rounded-xl overflow-hidden">
              {/* Övre rad: Lag, Resultat, Matchklocka och Start/Paus */}
              <div className="p-3 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                {/* Matchklocka + Period */}
                <div className="sm:col-span-4 flex items-center justify-between sm:justify-start gap-3 bg-[#040a14] border border-sky-400/25 rounded-lg px-3 py-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-[#005cb9] text-[10px] font-mono-cm font-bold uppercase text-white">
                        P{matchState.currentPeriod}/{matchState.config.periods}
                      </span>
                      <span className="text-[10px] font-mono-cm uppercase text-sky-300">
                        {isPeriodOvertime
                          ? "FULL TID!"
                          : `KVAR ${formatDurationMmSs(periodRemainingMs)}`}
                      </span>
                    </div>
                    <div
                      className={`font-mono-cm text-3xl sm:text-4xl font-extrabold tracking-tight tabular-nums leading-none mt-1 ${
                        isPeriodOvertime
                          ? "text-[#facc15] animate-pulse"
                          : matchState.status === "running"
                          ? "text-emerald-400"
                          : "text-white"
                      }`}
                    >
                      {formatDurationMmSs(periodElapsedMs)}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-[10px] font-mono-cm uppercase text-slate-400">
                      JÄMN SPELTID
                    </div>
                    <div
                      className={`font-mono-cm text-base font-extrabold ${
                        teamFairnessScore >= 80
                          ? "text-emerald-400"
                          : teamFairnessScore >= 65
                          ? "text-[#facc15]"
                          : "text-rose-400"
                      }`}
                    >
                      {teamFairnessScore}%
                    </div>
                    {wakeLockActive && (
                      <div className="text-[9px] text-emerald-400 font-mono-cm">
                        ● WAKE LOCK
                      </div>
                    )}
                  </div>
                </div>

                {/* Scoreboard: Lag vs Motståndare */}
                <div className="sm:col-span-4 flex items-center justify-between bg-[#040a14] border border-sky-400/25 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <div className="text-left">
                      <div className="font-display font-extrabold text-xs uppercase tracking-wider text-sky-300 truncate max-w-[110px]">
                        {teamProfile.clubName}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <button
                          type="button"
                          onClick={handleRemoveOurGoal}
                          aria-label="Ta bort senaste Värmbolsmål"
                          className="w-5 h-5 rounded bg-slate-800 text-slate-300 text-xs font-bold"
                        >
                          -
                        </button>
                        <span className="font-mono-cm text-2xl font-extrabold text-white w-7 text-center">
                          {matchState.ourScore}
                        </span>
                        <button
                          type="button"
                          onClick={handleAddOurGoal}
                          aria-label="Värmbols mål"
                          className="w-5 h-5 rounded bg-[#005cb9] text-white text-xs font-bold"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>

                  <span className="font-mono-cm text-slate-500 font-bold">
                    :
                  </span>

                  <div className="text-right">
                    <div className="font-display font-extrabold text-xs uppercase tracking-wider text-amber-300 truncate max-w-[95px]">
                      {matchState.config.opponent || "MOTSTÅNDARE"}
                    </div>
                    <div className="flex items-center justify-end gap-1 mt-0.5">
                      <button
                        type="button"
                        onClick={handleRemoveOpponentGoal}
                        aria-label="Ta bort senaste insläppta mål"
                        className="w-5 h-5 rounded bg-slate-800 text-slate-300 text-xs font-bold"
                      >
                        -
                      </button>
                      <span className="font-mono-cm text-2xl font-extrabold text-white w-7 text-center">
                        {matchState.opponentScore}
                      </span>
                        <button
                          type="button"
                          onClick={handleAddOpponentGoal}
                          aria-label="Insläppt mål"
                          className="w-5 h-5 rounded bg-slate-700 text-white text-xs font-bold"
                        >
                          +
                        </button>
                    </div>
                  </div>
                </div>

                {/* Klock-knappar: Start/Paus, Ny Period, Ångra */}
                <div className="sm:col-span-4 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleToggleClock}
                    className={`flex-1 py-2.5 px-3 rounded-lg font-display font-extrabold text-sm uppercase tracking-wider flex items-center justify-center gap-1.5 border shadow active:scale-95 transition ${
                      matchState.status === "running"
                        ? "bg-[#facc15] text-slate-950 border-yellow-200"
                        : "bg-emerald-500 text-slate-950 border-emerald-300"
                    }`}
                  >
                    {matchState.status === "running" ? (
                      <>
                        <Pause className="w-4 h-4 fill-slate-950" />
                        <span>Pausa</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 fill-slate-950" />
                        <span>
                          {periodElapsedMs === 0
                            ? `Avspark P${matchState.currentPeriod}`
                            : "Fortsätt"}
                        </span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleEndPeriod}
                    className="py-2.5 px-2.5 rounded-lg font-display font-bold text-xs uppercase tracking-wider bg-[#102649] hover:bg-[#16325e] text-sky-200 border border-sky-400/30 active:scale-95"
                  >
                    {matchState.currentPeriod >= matchState.config.periods
                      ? "Slut"
                      : `P${matchState.currentPeriod + 1} →`}
                  </button>

                  {matchState.undoStack.length > 0 && (
                    <button
                      type="button"
                      onClick={handleUndo}
                      className="p-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-[#facc15] border border-[#facc15]/40 active:scale-95"
                      title={`Ångra: ${matchState.undoStack[0].label}`}
                    >
                      <Undo2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {!goalPick && goalHeadline(matchState.goals) && (
                <div className="px-3 py-1.5 border-t border-white/10 font-mono-cm text-[11px] text-sky-200">
                  {goalHeadline(matchState.goals)}
                </div>
              )}

              {/* Klassisk Championship Manager Gul/Blå Commentary Bar */}
              <div className="bg-[#facc15] text-slate-950 px-3 py-1.5 border-t border-yellow-200 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="px-1.5 py-0.2 bg-slate-950 text-[#facc15] font-mono-cm font-extrabold text-[10px] rounded shrink-0">
                    CM LIVE
                  </span>
                  <CoachTicker text={cmCommentaryText} />
                </div>
                {suggestionBanner && (
                  <button
                    type="button"
                    onClick={clearSubSelection}
                    className="text-[10px] font-mono-cm font-extrabold uppercase underline shrink-0"
                  >
                    Rensa
                  </button>
                )}
              </div>
            </section>

            {/* TAKTIK- & SNABBBYTESVERKTYGSLÅDA */}
            <section className="cm-bevel rounded-xl p-2.5 flex flex-wrap items-center justify-between gap-2">
              {/* Vänster: Snabbförslag 1, 2, 3, 4 byten */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-display font-extrabold uppercase tracking-wider text-[#facc15] flex items-center gap-1 mr-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  Förslag:
                </span>
                {[1, 2, 3, 4].map((count) => {
                  const disabled = count > maxMultiSubCount;
                  const active =
                    suggestionBanner !== null && suggestionCount === count;
                  return (
                    <button
                      key={count}
                      type="button"
                      disabled={disabled}
                      onClick={() => handleSuggestSubs(count)}
                      className={`px-2.5 py-1 rounded font-mono-cm font-extrabold text-xs border transition active:scale-95 ${
                        disabled
                          ? "bg-slate-900/40 text-slate-600 border-white/5 cursor-not-allowed"
                          : active
                          ? "bg-[#facc15] text-slate-950 border-yellow-200 shadow"
                          : "bg-[#0f2547] hover:bg-[#173562] text-white border-sky-400/30"
                      }`}
                    >
                      {count}x
                    </button>
                  );
                })}

                <div className="flex items-center bg-[#040a14] rounded p-0.5 border border-sky-400/25">
                  {STINT_MINUTE_CHOICES.map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => handleSetStintMinutes(mins)}
                      title={`${mins} minuter innan BYT`}
                      className={`px-1.5 py-0.5 rounded text-[11px] font-mono-cm font-bold transition ${
                        resolveStintMinutes(matchState.config) === mins
                          ? "bg-[#facc15] text-slate-950"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      {mins}m
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setGkModalOpen(true)}
                  className="px-2.5 py-1 rounded font-display font-bold uppercase tracking-wider text-xs bg-amber-400/15 hover:bg-amber-400/25 text-[#facc15] border border-[#facc15]/40 flex items-center gap-1"
                >
                  <Shield className="w-3 h-3 fill-[#facc15]" />
                  <span>MV-krage</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTeamTalkOpen(true)}
                  className="px-2.5 py-1 rounded font-display font-bold uppercase tracking-wider text-xs bg-[#0f2547] hover:bg-[#173562] text-sky-200 border border-sky-400/30"
                >
                  📋 Samling
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("tactics")}
                  className="px-2.5 py-1 rounded font-display font-extrabold uppercase tracking-wider text-xs bg-[#facc15] hover:bg-yellow-300 text-slate-950 border border-yellow-200 shadow flex items-center gap-1"
                >
                  <Compass className="w-3.5 h-3.5" />
                  <span>Rörelse (Anfall / Försvar)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("setup")}
                  className="px-2.5 py-1 rounded font-display font-bold uppercase tracking-wider text-xs bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-400/40"
                >
                  🔧 Ändra Uppställning / Trupp
                </button>
              </div>

              {/* Höger: Formationsväljare (1-4-1 default) + Vy-switch (2D Plan / CM Tabell) */}
              <div className="flex items-center gap-1.5">
                {matchState.config.format === "7v7" && (
                  <div className="flex items-center bg-[#040a14] rounded p-0.5 border border-sky-400/25">
                    {FORMATIONS_7V7.map((fmt) => (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => handleChangeFormation(fmt)}
                        className={`px-2 py-0.5 rounded text-[11px] font-mono-cm font-bold transition ${
                          currentFormation === fmt
                            ? "bg-[#005cb9] text-white"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        {fmt}
                      </button>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() =>
                    setPitchViewMode((m) => (m === "pitch" ? "table" : "pitch"))
                  }
                  className="px-2.5 py-1 rounded bg-[#040a14] border border-sky-400/30 text-sky-200 hover:text-white text-xs font-display font-bold uppercase tracking-wider flex items-center gap-1"
                >
                  <ListFilter className="w-3.5 h-3.5 text-[#facc15]" />
                  <span>{pitchViewMode === "pitch" ? "Tabell" : "2D Plan"}</span>
                </button>
              </div>
            </section>

            {/* ============================================================
                FOTMOB-TÄT 2D-PLAN: cirkel, tidspiller, namn direkt på gräset
               ============================================================ */}
            {pitchViewMode === "pitch" ? (
              <section
                ref={goalTargetRef}
                className="scroll-mt-36 rounded-xl overflow-hidden border border-white/25 shadow-lg select-none"
              >
                {goalPick && (
                  <GoalPickBar
                    phase={goalPick.phase}
                    scorerLabel={openGoalLabel(matchState.goals, goalPick.goalId)}
                    onSkip={handleSkipGoalPick}
                  />
                )}
                <div className="flex items-center justify-between gap-2 bg-[#061224] px-2.5 py-1.5">
                  <div className="flex items-center gap-1">
                    {(
                      [
                        ["play", "Speltid"],
                        ["stint", "Inne nu"],
                        ["bench", "Bänk"],
                      ] as const
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setTokenStat(key)}
                        className={`px-2 py-0.5 rounded-full font-mono-cm font-bold text-[10px] uppercase tracking-wide border transition ${
                          tokenStat === key
                            ? "bg-white text-slate-950 border-white"
                            : "bg-transparent text-slate-300 border-white/20"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <span className="font-mono-cm text-[10px] text-slate-400 uppercase">
                    På cirkeln
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 bg-[#166534] px-3 py-1.5 border-y border-black/30">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {teamProfile.logoUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={teamProfile.logoUrl}
                        alt=""
                        className="w-5 h-5 object-contain shrink-0"
                      />
                    ) : (
                      <span className="px-1.5 py-0.5 rounded bg-black/30 font-display font-extrabold text-[10px] text-[#facc15] uppercase shrink-0">
                        {teamProfile.shortName}
                      </span>
                    )}
                    <span className="font-display font-extrabold text-xs sm:text-sm uppercase tracking-wide text-white truncate">
                      {teamProfile.clubName}
                    </span>

                    {/* Direkt 1-klicks toggle mellan 1-4-1 (Lars) och 1-1-3-1 (Jocke) på planlisten */}
                    <div className="flex items-center bg-black/45 rounded-lg p-0.5 border border-white/25 ml-1">
                      <button
                        type="button"
                        disabled={isReadOnlyFollower}
                        onClick={() => handleChangeFormation("1-4-1")}
                        className={`px-2 py-0.5 rounded-md font-mono-cm font-extrabold text-[10px] uppercase transition active:scale-95 ${
                          currentFormation === "1-4-1"
                            ? "bg-[#facc15] text-slate-950 shadow"
                            : "text-white/85 hover:text-white"
                        }`}
                      >
                        1-4-1 (Lars)
                      </button>
                      <button
                        type="button"
                        disabled={isReadOnlyFollower}
                        onClick={() => handleChangeFormation("1-1-3-1")}
                        className={`px-2 py-0.5 rounded-md font-mono-cm font-extrabold text-[10px] uppercase transition active:scale-95 ${
                          currentFormation === "1-1-3-1"
                            ? "bg-[#facc15] text-slate-950 shadow"
                            : "text-white/85 hover:text-white"
                        }`}
                      >
                        1-1-3-1 (Jocke)
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setActiveTab("tactics")}
                      className="px-2 py-0.5 rounded bg-black/45 hover:bg-black/65 border border-[#facc15]/60 font-mono-cm font-extrabold text-[10px] uppercase text-[#facc15] flex items-center gap-1"
                    >
                      <Compass className="w-3 h-3" />
                      <span>Rörelse</span>
                    </button>
                    <span className="font-mono-cm font-bold text-[11px] text-white tabular-nums">
                      P{matchState.currentPeriod}{" "}
                      {formatDurationMmSs(periodElapsedMs)}
                    </span>
                  </div>
                </div>

                <div className="cm-pitch-surface relative h-[480px] sm:h-[520px]">
                <div className="absolute inset-3 border border-white/25 rounded pointer-events-none" />
                <div className="absolute inset-x-3 top-1/2 -translate-y-1/2 h-px bg-white/25 pointer-events-none" />
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full border border-white/25 pointer-events-none" />
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-white/35 pointer-events-none" />
                <div className="absolute left-1/2 -translate-x-1/2 top-3 w-36 sm:w-48 h-10 border-b border-x border-white/25 pointer-events-none" />
                <div className="absolute left-1/2 -translate-x-1/2 top-3 w-16 h-4 border-b border-x border-white/25 pointer-events-none" />
                <div className="absolute left-1/2 -translate-x-1/2 bottom-3 w-40 sm:w-52 h-16 border-t border-x border-white/30 pointer-events-none" />
                <div className="absolute left-1/2 -translate-x-1/2 bottom-3 w-20 h-6 border-t border-x border-white/30 pointer-events-none" />

                {/* Visuell sidopar-koppling i 1-4-1 (VM+IMV till vänster, IMH+HM till höger) */}
                {currentFormation === "1-4-1" && (
                  <>
                    <div className="absolute left-[4%] w-[43%] top-[33%] h-[26%] rounded-2xl border border-dashed border-[#facc15]/50 bg-[#facc15]/[0.06] pointer-events-none flex items-start justify-center pt-1">
                      <span className="px-2 py-0.5 rounded bg-black/60 text-[#facc15] font-mono-cm font-extrabold text-[9px] uppercase tracking-wider">
                        Vänsterpar (VM + IMV) · Hjälps åt fram/bak
                      </span>
                    </div>
                    <div className="absolute right-[4%] w-[43%] top-[33%] h-[26%] rounded-2xl border border-dashed border-sky-300/50 bg-sky-400/[0.06] pointer-events-none flex items-start justify-center pt-1">
                      <span className="px-2 py-0.5 rounded bg-black/60 text-sky-200 font-mono-cm font-extrabold text-[9px] uppercase tracking-wider">
                        Högerpar (IMH + HM) · Hjälps åt fram/bak
                      </span>
                    </div>
                  </>
                )}

                {currentFormation === "1-1-3-1" && (
                  <div className="absolute left-1/2 -translate-x-1/2 w-[36%] top-[47%] h-[32%] rounded-2xl border border-dashed border-amber-300/40 bg-amber-400/[0.05] pointer-events-none flex items-start justify-center pt-1">
                    <span className="px-2 py-0.5 rounded bg-black/60 text-amber-200 font-mono-cm font-extrabold text-[9px] uppercase tracking-wider">
                      Ankare (DM) + Back (LIB)
                    </span>
                  </div>
                )}

                {selectedOutIds.length > 0 && (
                  <div className="absolute top-2 right-2 z-10">
                    <span className="px-1.5 py-0.5 rounded bg-orange-500 text-slate-950 font-mono-cm font-extrabold text-[9px] shadow">
                      {selectedOutIds.length} UT
                    </span>
                  </div>
                )}

                {pitchMetrics.map((m, idx) => {
                  const slotIdx =
                    m.player.pitchSlotIndex ??
                    (m.player.isGoalkeeper ? 0 : idx);
                  const slot =
                    formationSlots.find((s) => s.slotIndex === slotIdx) ||
                    formationSlots[idx % formationSlots.length];
                  const outOrderIndex = selectedOutIds.indexOf(m.player.id);
                  const isSelectedOut = outOrderIndex !== -1;
                  const pairedInPlayerId =
                    isSelectedOut && selectedInIds[outOrderIndex]
                      ? selectedInIds[outOrderIndex]
                      : undefined;
                  const pairedInPlayer = pairedInPlayerId
                    ? matchState.players.find((p) => p.id === pairedInPlayerId)
                    : undefined;
                  const metric = metricFor(m);

                  return (
                    <div
                      key={m.player.id}
                      style={{
                        left: `${slot.xPct}%`,
                        top: `${slot.yPct}%`,
                      }}
                      className="absolute -translate-x-1/2 -translate-y-1/2 z-20 transition-all duration-300 ease-out"
                    >
                      <button
                        type="button"
                        onClick={() => handlePitchPlayerClick(m.player.id)}
                        className="relative flex flex-col items-center focus:outline-none active:scale-95 transition-transform"
                      >
                        {goalPick?.phase === "assist" &&
                          openGoal?.scorerId === m.player.id && (
                            <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap px-1 py-[1px] rounded bg-[#facc15] text-slate-950 font-mono-cm font-extrabold text-[8px] uppercase shadow">
                              Mål
                            </span>
                          )}
                        {!goalPick && isSelectedOut && (
                          <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap px-1 py-[1px] rounded bg-orange-500 text-slate-950 font-mono-cm font-extrabold text-[8px] uppercase shadow">
                            {pairedInPlayer
                              ? `⇄ ${pairedInPlayer.name}`
                              : `UT ${outOrderIndex + 1}`}
                          </span>
                        )}
                        {!goalPick && !isSelectedOut && m.stintAlert && (
                          <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap px-1 py-[1px] rounded bg-rose-500 text-white font-mono-cm font-extrabold text-[8px] uppercase shadow animate-pulse">
                            BYT
                          </span>
                        )}
                        <PlayerAvatar
                          name={m.player.name}
                          isGoalkeeper={m.player.isGoalkeeper}
                          isSelected={isSelectedOut}
                          selectionType="out"
                          posCode={slot.code}
                          highlight={
                            goalPick
                              ? goalPick.phase === "assist" &&
                                openGoal?.scorerId === m.player.id
                                ? "shot"
                                : goalPick.phase === "scorer"
                                ? "shot"
                                : "pass"
                              : undefined
                          }
                          size="md"
                          number={m.player.number}
                          stat={metric.text}
                          statTone={metric.tone}
                        />
                        <span
                          className={`absolute left-1/2 top-[calc(100%+10px)] -translate-x-1/2 max-w-[5.2rem] truncate text-center font-display font-extrabold text-[10px] sm:text-[11px] uppercase leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)] ${
                            isSelectedOut ? "text-orange-300" : "text-white"
                          }`}
                        >
                          {m.player.name}
                        </span>
                      </button>
                    </div>
                  );
                })}
                </div>

                <div className="bg-[#061224] border-t border-white/10 px-3 py-1.5 space-y-0.5">
                  {recentChanges.length === 0 ? (
                    <p className="font-mono-cm text-[10px] uppercase tracking-wide text-slate-500">
                      Inga byten ännu
                    </p>
                  ) : (
                    recentChanges.map((log) => {
                      const minute = Math.max(
                        0,
                        Math.floor(log.matchTimeMs / 60000)
                      );
                      const inn = log.playersIn.map((p) => p.name).join(", ");
                      const out = log.playersOut.map((p) => p.name).join(", ");
                      const isGk = log.type === "gk_change";
                      return (
                        <div
                          key={log.id}
                          className="flex items-baseline gap-1.5 font-mono-cm text-[11px] leading-tight"
                        >
                          <span className="text-slate-400 tabular-nums w-6 shrink-0">
                            {minute}&apos;
                          </span>
                          <span className="text-emerald-400 truncate">
                            ▲ {inn || "—"} {isGk ? "MV" : "in"}
                          </span>
                          {out ? (
                            <span className="text-rose-400 truncate">
                              · ▼ {out} {isGk ? "av" : "ut"}
                            </span>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
              </section>
            ) : (
              /* ============================================================
                 ALTERNATIV VY: CHAMPIONSHIP MANAGER KLASSISK DATATABELL
                 ============================================================ */
              <section
                ref={goalTargetRef}
                className="cm-bevel scroll-mt-36 rounded-xl overflow-hidden"
              >
                {goalPick && (
                  <GoalPickBar
                    phase={goalPick.phase}
                    scorerLabel={openGoalLabel(matchState.goals, goalPick.goalId)}
                    onSkip={handleSkipGoalPick}
                  />
                )}
                <div className="bg-[#00478f] px-3 py-2 border-b border-[#facc15]/60 flex items-center justify-between">
                  <span className="font-display font-extrabold text-xs uppercase tracking-wider text-white">
                    INNE PÅ PLAN — {currentFormation} ({pitchMetrics.length}{" "}
                    SPELARE)
                  </span>
                  <span className="font-mono-cm text-[10px] text-[#facc15]">
                    {goalPick
                      ? goalPick.phase === "scorer"
                        ? "TRYCK PÅ RADEN SOM SKÖT"
                        : "TRYCK VAR PASSNINGEN KOM IFRÅN"
                      : "KLICKA PÅ RAD FÖR ATT MARKERA UTBYTE"}
                  </span>
                </div>
                <div className="divide-y divide-white/10">
                  {pitchMetrics.map((m, idx) => {
                    const slotIdx =
                      m.player.pitchSlotIndex ??
                      (m.player.isGoalkeeper ? 0 : idx);
                    const slot =
                      formationSlots.find((s) => s.slotIndex === slotIdx) ||
                      formationSlots[idx % formationSlots.length];
                    const outIdx = selectedOutIds.indexOf(m.player.id);
                    const isSelected = outIdx !== -1;

                    return (
                      <div
                        key={m.player.id}
                        onClick={() => handlePitchPlayerClick(m.player.id)}
                        className={`px-3 py-2 flex items-center justify-between gap-2 cursor-pointer transition ${
                          goalPick
                            ? goalPick.phase === "assist" &&
                              openGoal?.scorerId === m.player.id
                              ? "bg-[#facc15]/20"
                              : "bg-sky-400/10"
                            : isSelected
                            ? "bg-orange-500/25"
                            : "hover:bg-white/5"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-9 text-center py-0.5 rounded bg-slate-900 border border-white/15 font-mono-cm font-extrabold text-[11px] text-[#facc15]">
                            {slot.code}
                          </span>
                          <PlayerAvatar
                            name={m.player.name}
                            avatarUrl={m.player.avatarUrl}
                            isGoalkeeper={m.player.isGoalkeeper}
                            isSelected={isSelected}
                            selectionType="out"
                            size="sm"
                          />
                          <div>
                            <div className="font-display font-extrabold text-sm uppercase text-white flex items-center gap-1.5">
                              {m.player.name}
                              {isSelected && (
                                <span className="px-1.5 py-0.2 rounded bg-orange-500 text-slate-950 font-mono-cm text-[10px]">
                                  UT #{outIdx + 1}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] font-mono-cm text-slate-400">
                              Inne nu: {formatDurationMmSs(m.currentStintMs)} ·
                              Kondition: {m.conditionPct}%
                            </div>
                            <PositionTime positionMs={m.positionMs} />
                          </div>
                        </div>

                        <div className="text-right font-mono-cm">
                          <div className="text-base font-extrabold text-emerald-400">
                            {formatDurationMmSs(m.totalPlayMs)}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Ute {formatDurationMmSs(m.outfieldMs)} · MV{" "}
                            {formatDurationMmSs(m.goalkeeperMs)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ============================================================
                CHAMPIONSHIP MANAGER DUGOUT / AVBYTARBÄNK
               ============================================================ */}
            <section className="cm-bevel rounded-xl overflow-hidden">
              <div className="bg-gradient-to-r from-[#081b38] via-[#0d2852] to-[#081b38] px-3.5 py-2 border-b border-sky-400/30 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#38bdf8]" />
                  <h2 className="font-display font-extrabold text-sm sm:text-base uppercase tracking-wider text-white">
                    AVBYTARBÄNKEN / DUGOUT ({benchMetrics.length})
                  </h2>
                  <span className="text-[11px] font-mono-cm text-[#facc15] hidden sm:inline">
                    [SORTERAD EFTER MINST SPELTID]
                  </span>
                </div>

                {selectedInIds.length > 0 && (
                  <span className="px-2 py-0.5 rounded bg-emerald-400 text-slate-950 font-mono-cm font-extrabold text-[11px]">
                    {selectedInIds.length} REDO ATT BYTAS IN
                  </span>
                )}
              </div>

              {benchMetrics.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-400">
                  Inga avbytare på bänken. Gå till fliken{" "}
                  <strong>Kallelse & Match</strong> för att bocka i fler
                  spelare.
                </div>
              ) : (
                <div className="px-2 py-3 grid grid-cols-3 sm:grid-cols-5 gap-x-1 gap-y-4">
                  {benchMetrics.map((m, idx) => {
                    const inOrderIndex = selectedInIds.indexOf(m.player.id);
                    const isSelectedIn = inOrderIndex !== -1;
                    const pairedOutId =
                      isSelectedIn && selectedOutIds[inOrderIndex]
                        ? selectedOutIds[inOrderIndex]
                        : undefined;
                    const pairedOutPlayer = pairedOutId
                      ? matchState.players.find((p) => p.id === pairedOutId)
                      : undefined;
                    const pairedPos = pairedOutPlayer
                      ? pitchPositionCode(matchState, pairedOutPlayer)
                      : null;
                    const metric = metricFor(m);
                    const subtitle = isSelectedIn
                      ? pairedOutPlayer
                        ? `➔ ${pairedOutPlayer.name}${
                            pairedPos ? ` (${pairedPos})` : ""
                          }`
                        : `In #${inOrderIndex + 1}`
                      : idx === 0
                      ? "Tur att gå in"
                      : "Avbytare";

                    return (
                      <div
                        key={m.player.id}
                        className={`flex flex-col items-center min-w-0 ${
                          m.player.resting && !isSelectedIn ? "opacity-55" : ""
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            if (goalPick) return;
                            toggleSelectBenchPlayer(m.player.id);
                          }}
                          className="flex flex-col items-center min-w-0 focus:outline-none active:scale-95 transition-transform"
                        >
                          {!isSelectedIn && m.stintAlert && !m.player.resting && (
                            <span className="mb-1 px-1 py-[1px] rounded bg-emerald-400 text-slate-950 font-mono-cm font-extrabold text-[8px] uppercase shadow">
                              IN
                            </span>
                          )}
                          <PlayerAvatar
                            name={m.player.name}
                            isSelected={isSelectedIn}
                            selectionType="in"
                            size="md"
                            number={m.player.number}
                            stat={metric.text}
                            statTone={metric.tone}
                          />
                          <span
                            className={`mt-2 max-w-[84px] truncate text-center font-display font-extrabold text-[11px] uppercase leading-none ${
                              isSelectedIn ? "text-emerald-300" : "text-white"
                            }`}
                          >
                            {m.player.number ? `${m.player.number} ` : ""}
                            {m.player.name}
                          </span>
                          <span className="mt-0.5 max-w-[92px] truncate text-center font-mono-cm text-[10px] text-slate-400 leading-tight">
                            {m.player.resting ? "Står över förslag" : subtitle}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleTogglePlayerResting(m.player.id, e)}
                          className={`mt-1 px-2 py-0.5 rounded font-mono-cm text-[9px] font-bold uppercase border ${
                            m.player.resting
                              ? "bg-rose-500/30 text-rose-200 border-rose-400/50"
                              : "bg-slate-900/70 text-slate-300 border-white/10 hover:border-sky-400/40"
                          }`}
                        >
                          {m.player.resting ? "⏸ Vilar (PÅ)" : "⏸ Vila?"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
          ))}

        {/* ============================================================
            FLIK 2: KALLELSE, TRUPP & MATCHINSTÄLLNINGAR
           ============================================================ */}
        {activeTab === "setup" && (
          <div className="space-y-4">
            {/* CM Club Info Header (utan spretiga foton) */}
            <div className="cm-bevel rounded-xl overflow-hidden border border-[#facc15]/60">
              <div className="cm-header-bar px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <span className="px-1.5 py-0.5 rounded bg-[#facc15] text-slate-950 font-mono-cm font-extrabold text-[10px] uppercase">
                    {teamProfile.arenaName || `${teamProfile.clubName} · HEMMAPLAN`}
                  </span>
                  <h2 className="font-display font-extrabold text-xl sm:text-2xl uppercase text-white drop-shadow mt-1">
                    {teamProfile.displayName} · MATCHUPPSTÄLLNING
                  </h2>
                  <p className="text-xs text-sky-100/90 mt-0.5">
                    Bocka i vilka spelare som är med idag och välj startuppställning i {draftConfig.formation}.
                  </p>
                </div>
              </div>
            </div>

            {isVfcDefault && (
              <section className="cm-bevel rounded-xl p-4 space-y-3 border border-[#facc15]/50">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-display font-extrabold text-sm sm:text-base uppercase tracking-wider text-[#facc15]">
                      Dagens Träningsmatch · Katrineholms AIK (KAIK)
                    </h3>
                    <p className="text-xs text-slate-300 mt-0.5">
                      9 spelare idag: <strong>Gabriel, Bilel, Holger, Edvin, Oscar, Scott, Abdullahi</strong> + inlånade från P2018: <strong>Jack & Amr</strong> (Oliver utgår).
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      disabled={isReadOnlyFollower}
                      onClick={handleApplyKaikSquad9Players}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-display font-extrabold text-xs uppercase shadow"
                    >
                      ✓ Ladda dagens 9 spelare (7 + Jack & Amr)
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("tactics")}
                      className="px-2.5 py-1.5 rounded-lg bg-[#0f2547] hover:bg-[#173562] text-[#facc15] border border-[#facc15]/50 font-display font-extrabold text-xs uppercase flex items-center gap-1"
                    >
                      <Compass className="w-3.5 h-3.5" />
                      <span>Se Rörelse & Taktik →</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={isReadOnlyFollower}
                    onClick={() => handleSelectKaikFormation("1-4-1")}
                    className={`text-left p-3 rounded-lg border transition disabled:opacity-50 ${
                      currentFormation === "1-4-1"
                        ? "bg-[#005cb9]/45 border-[#facc15] shadow"
                        : "bg-[#061224] border-white/10 hover:border-sky-400/40"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-display font-extrabold text-sm uppercase text-white">
                        1-4-1 · Sidopar Vänster & Höger (Lars)
                      </span>
                      {currentFormation === "1-4-1" && (
                        <Check className="w-4 h-4 text-[#facc15]" />
                      )}
                    </div>
                    <span className="block mt-1 text-xs text-slate-300">
                      Vänsterpar (<strong>VM + IMV</strong>) och Högerpar (<strong>HM + IMH</strong>) hjälps åt på sin kant. Går yttern fram säkrar CM upp bakåt så kanten aldrig lämnas öppen!
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={isReadOnlyFollower}
                    onClick={() => handleSelectKaikFormation("1-1-3-1")}
                    className={`text-left p-3 rounded-lg border transition disabled:opacity-50 ${
                      currentFormation === "1-1-3-1"
                        ? "bg-[#005cb9]/45 border-[#facc15] shadow"
                        : "bg-[#061224] border-white/10 hover:border-sky-400/40"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-display font-extrabold text-sm uppercase text-white">
                        1-1-3-1 · Back + Ankare + 3 Mitt (Jocke)
                      </span>
                      {currentFormation === "1-1-3-1" && (
                        <Check className="w-4 h-4 text-[#facc15]" />
                      )}
                    </div>
                    <span className="block mt-1 text-xs text-slate-300">
                      1 Back (<strong>LIB</strong>), 1 Defensiv mitt/Ankare (<strong>DM</strong>) framför backen, 3 på mittfältet (<strong>VM–CM–HM</strong>) och 1 Forward (<strong>FW</strong>).
                    </span>
                  </button>
                </div>

                <div className="border-t border-white/10 pt-3 space-y-1.5">
                  <div className="font-mono-cm font-extrabold text-[11px] uppercase text-[#facc15]">
                    Taktiska fokus-punkter i {draftConfig.formation}:
                  </div>
                  {(
                    FORMATION_COACH_NOTES[draftConfig.formation] ||
                    CUP_COACH_NOTES
                  ).map((note) => (
                    <p key={note.role} className="text-xs sm:text-sm text-slate-200">
                      <strong className="text-[#facc15]">{note.role}:</strong>{" "}
                      {note.text}
                    </p>
                  ))}
                </div>

                <details className="border-t border-white/10 pt-2 text-xs text-slate-400">
                  <summary className="cursor-pointer font-mono-cm uppercase text-[11px] text-sky-300 hover:text-white">
                    Visa tidigare cupplan (Söndag 25 okt Norrköping)
                  </summary>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                    {CUP_MATCHES.map((match) => (
                      <button
                        key={match.id}
                        type="button"
                        disabled={isFollowing}
                        onClick={() => handleApplyPresetEvent(match)}
                        className={`text-left p-2.5 rounded-lg border disabled:opacity-50 ${
                          draftConfig.eventTitle ===
                          `Provcup 25 okt · ${match.title}`
                            ? "bg-[#005cb9]/40 border-[#facc15]"
                            : "bg-[#061224] border-white/10"
                        }`}
                      >
                        <span className="block font-display font-extrabold text-xs text-white">
                          {match.title}
                        </span>
                        <span className="block mt-0.5 text-[11px] text-slate-300">
                          {match.subtitle}
                        </span>
                      </button>
                    ))}
                  </div>
                </details>
              </section>
            )}

            {/* 1. Välj Match / Cup & Motståndare */}
            <section className="cm-bevel rounded-xl p-4 space-y-3">
              <h3 className="font-display font-extrabold text-sm uppercase tracking-wider text-[#facc15] flex items-center gap-1.5">
                <Zap className="w-4 h-4" />
                1. Matchtyp, Formation & Motståndare
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PRESET_EVENTS.map((preset) => {
                  const selected = draftConfig.eventTitle === preset.title;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleApplyPresetEvent(preset)}
                      className={`text-left p-3 rounded-lg border transition ${
                        selected
                          ? "bg-[#005cb9]/40 border-[#facc15] shadow"
                          : "bg-[#061224] border-white/10 hover:border-sky-400/40"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-display font-extrabold text-sm uppercase text-white">
                          {preset.title}
                        </span>
                        {selected && (
                          <Check className="w-4 h-4 text-[#facc15]" />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-300 mt-0.5">
                        {preset.subtitle}
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* Snabbval för vanliga motståndare på cupen/serien */}
              <div>
                <label className="block text-[11px] font-mono-cm font-bold uppercase text-sky-300 mb-1.5">
                  Motståndarlag (klicka eller skriv in)
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {QUICK_OPPONENTS.map((opp) => (
                    <button
                      key={opp}
                      type="button"
                      onClick={() =>
                        setDraftConfig((c) => ({ ...c, opponent: opp }))
                      }
                      className={`px-2.5 py-1 rounded text-xs font-mono-cm font-bold border transition ${
                        draftConfig.opponent === opp
                          ? "bg-[#facc15] text-slate-950 border-yellow-200"
                          : "bg-[#061224] text-slate-300 border-white/10 hover:border-sky-400/40"
                      }`}
                    >
                      {opp}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={draftConfig.opponent}
                  onChange={(e) =>
                    setDraftConfig((c) => ({ ...c, opponent: e.target.value }))
                  }
                  placeholder="Skriv annat motståndarlag..."
                  className="w-full px-3 py-2 rounded-lg bg-[#040a14] border border-sky-400/30 text-sm text-white font-mono-cm"
                />
              </div>

              {/* Formation, Perioder, Minuter */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-white/10">
                <div>
                  <label className="block text-[11px] font-mono-cm font-bold uppercase text-sky-300 mb-1">
                    Formation (7v7)
                  </label>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                    {FORMATIONS_7V7.map((fmt) => (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => handleChangeFormation(fmt)}
                        className={`py-1.5 rounded font-mono-cm font-extrabold text-xs border ${
                          currentFormation === fmt
                            ? "bg-[#facc15] text-slate-950 border-yellow-200"
                            : "bg-[#061224] text-slate-300 border-white/10"
                        }`}
                      >
                        {fmt}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-mono-cm font-bold uppercase text-sky-300 mb-1">
                    Antal Perioder
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[1, 2, 3, 4].map((pCount) => (
                      <button
                        key={pCount}
                        type="button"
                        onClick={() =>
                          setDraftConfig((c) => ({ ...c, periods: pCount }))
                        }
                        className={`py-2 rounded font-mono-cm font-extrabold text-xs border ${
                          draftConfig.periods === pCount
                            ? "bg-[#005cb9] text-white border-sky-300"
                            : "bg-[#061224] text-slate-300 border-white/10"
                        }`}
                      >
                        {pCount} st
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-mono-cm font-bold uppercase text-sky-300 mb-1">
                    Minuter / Period
                  </label>
                  <div className="grid grid-cols-5 gap-1">
                    {[10, 12, 15, 20, 25].map((mins) => (
                      <button
                        key={mins}
                        type="button"
                        onClick={() =>
                          setDraftConfig((c) => ({
                            ...c,
                            periodMinutes: mins,
                          }))
                        }
                        className={`py-2 rounded font-mono-cm font-extrabold text-xs border ${
                          draftConfig.periodMinutes === mins
                            ? "bg-[#005cb9] text-white border-sky-300"
                            : "bg-[#061224] text-slate-300 border-white/10"
                        }`}
                      >
                        {mins}m
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-mono-cm font-bold uppercase text-sky-300 mb-1">
                    Stint innan förslag
                  </label>
                  <div className="grid grid-cols-4 gap-1">
                    {STINT_MINUTE_CHOICES.map((mins) => (
                      <button
                        key={mins}
                        type="button"
                        onClick={() => handleSetStintMinutes(mins)}
                        className={`py-2 rounded font-mono-cm font-extrabold text-xs border ${
                          resolveStintMinutes(draftConfig) === mins
                            ? "bg-[#facc15] text-slate-950 border-yellow-200"
                            : "bg-[#061224] text-slate-300 border-white/10"
                        }`}
                      >
                        {mins}m
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* 2. Kallelse & Startsjua */}
            <section className="cm-bevel rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-display font-extrabold text-sm uppercase tracking-wider text-[#facc15] flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4" />
                    2. Kallelse & Startuppställning ({activeSquadRoster.length}{" "}
                    anmälda · {setupPitchIds.length}/{pitchCapacity} startar)
                  </h3>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setShowBulkImport((v) => !v)}
                    className="px-2.5 py-1 rounded bg-[#061224] hover:bg-[#0f2547] border border-sky-400/30 text-xs font-mono-cm font-bold text-sky-200"
                  >
                    📋 Klistra in trupp
                  </button>
                  <button
                    type="button"
                    onClick={handleRotateStartersByCupFairness}
                    className="px-2.5 py-1 rounded bg-[#0f2547] hover:bg-[#173562] border border-[#facc15]/50 text-xs font-mono-cm font-bold text-[#facc15]"
                    title="Välj de 6 utespelare som spelat minst i cupen hittills (eller bänkspelarna) i startelvan"
                  >
                    ⚡ Rotera startspelare (minst cuptid)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setRoster((prev) =>
                        prev.map((p) => ({ ...p, activeInSquad: true }))
                      )
                    }
                    className="px-2.5 py-1 rounded bg-[#061224] border border-sky-400/30 text-xs font-mono-cm text-sky-200"
                  >
                    Välj alla {roster.length}
                  </button>
                </div>
              </div>

              {(roster.length === 0 || showBulkImport) && !isFollowing && (
                <div className="p-3.5 rounded-xl bg-[#040c1a] border-2 border-[#facc15]/60 space-y-2.5">
                  <div className="font-display font-extrabold text-sm uppercase text-[#facc15]">
                    {roster.length === 0
                      ? `Snabbstart för ${teamProfile.displayName}: Lägg in era spelare`
                      : "Klistra in spelarnamn"}
                  </div>
                  <p className="text-xs text-slate-300">
                    Skriv eller klistra in spelarnas förnamn (ett per rad eller med kommatecken, t.ex. från laget.se eller WhatsApp).
                  </p>
                  <textarea
                    rows={3}
                    value={bulkPlayersText}
                    onChange={(e) => setBulkPlayersText(e.target.value)}
                    placeholder="Exempel: Kalle, Olle, William G, Liam, Noah, Hugo, Emil..."
                    className="w-full px-3 py-2 rounded-lg bg-[#081529] border border-sky-400/30 text-xs text-white font-mono-cm"
                  />
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleBulkImportPlayers(false)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-display font-extrabold text-xs uppercase"
                    >
                      + Lägg till i truppen
                    </button>
                    {roster.length > 0 && (
                      <button
                        type="button"
                        onClick={() => handleBulkImportPlayers(true)}
                        className="px-3 py-1.5 rounded-lg bg-amber-400/20 hover:bg-amber-400/30 text-[#facc15] border border-[#facc15]/40 font-display font-bold text-xs uppercase"
                      >
                        Ersätt hela truppen
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {roster.map((player) => {
                  const livePlayer = matchState.players.find(
                    (p) => p.id === player.id
                  );
                  const isStarter =
                    player.activeInSquad &&
                    (livePlayer ? livePlayer.onPitch : setupPitchIds.includes(player.id));
                  const isGk =
                    isStarter &&
                    (livePlayer ? livePlayer.isGoalkeeper : setupGkId === player.id);
                  const currentSlotIdx = !isStarter
                    ? -1
                    : isGk
                    ? 0
                    : livePlayer?.pitchSlotIndex ??
                      setupPitchIds
                        .filter((id) => id !== setupGkId)
                        .indexOf(player.id) + 1;
                  const activeSlots =
                    FORMATION_SLOTS[currentFormation] || FORMATION_SLOTS["1-4-1"];
                  const slotMeta = activeSlots.find(
                    (s) => s.slotIndex === currentSlotIdx
                  );

                  return (
                    <div
                      key={player.id}
                      className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 ${
                        !player.activeInSquad
                          ? "bg-slate-950/40 border-white/5 opacity-45"
                          : isStarter
                          ? "bg-emerald-950/40 border-emerald-400/40"
                          : "bg-[#061224] border-white/10"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <PlayerAvatar
                          name={player.name}
                          avatarUrl={player.avatarUrl}
                          isGoalkeeper={isGk}
                          size="sm"
                          number={player.number}
                        />
                        <div>
                          <div className="font-display font-extrabold text-base uppercase text-white">
                            {player.name}
                          </div>
                          <div className="text-[10px] font-mono-cm text-slate-400">
                            {!player.activeInSquad
                              ? "FRÅNVARANDE (EJ MED)"
                              : isGk
                              ? "STARTAR I MÅL (MV)"
                              : isStarter
                              ? `STARTAR · ${slotMeta?.code ?? ""} ${slotMeta?.label ?? "PLAN"}`
                              : "AVBYTARE (BÄNK)"}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 flex-wrap justify-end">
                        {player.activeInSquad && (
                          <>
                            <select
                              aria-label={`Position för ${player.name}`}
                              value={currentSlotIdx}
                              onChange={(e) =>
                                handleAssignSetupSlot(
                                  player.id,
                                  Number(e.target.value)
                                )
                              }
                              className={`px-1.5 py-1 rounded bg-[#040a14] border font-mono-cm font-extrabold text-[10px] ${
                                isStarter
                                  ? "border-emerald-400/50 text-emerald-200"
                                  : "border-sky-400/35 text-sky-200"
                              }`}
                            >
                              {activeSlots.map((slot) => {
                                const occ = matchState.players.find(
                                  (p) =>
                                    p.onPitch &&
                                    (p.pitchSlotIndex ??
                                      (p.isGoalkeeper ? 0 : -99)) ===
                                      slot.slotIndex
                                );
                                return (
                                  <option
                                    key={slot.slotIndex}
                                    value={slot.slotIndex}
                                  >
                                    {slot.code} · {slot.label}
                                    {occ && occ.id !== player.id
                                      ? ` (${occ.name})`
                                      : ""}
                                  </option>
                                );
                              })}
                              <option value={-1}>BÄNK · Avbytare</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => handleAssignSetupSlot(player.id, 0)}
                              className={`px-2 py-1 rounded font-mono-cm font-extrabold text-[10px] border ${
                                isGk
                                  ? "bg-[#facc15] text-slate-950 border-yellow-200"
                                  : "bg-slate-900 text-slate-300 border-white/10"
                              }`}
                            >
                              MV
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleToggleSetupStarter(player.id)
                              }
                              className={`px-2 py-1 rounded font-mono-cm font-extrabold text-[10px] border ${
                                isStarter
                                  ? "bg-emerald-400 text-slate-950 border-emerald-200"
                                  : "bg-slate-900 text-slate-300 border-white/10"
                              }`}
                            >
                              {isStarter ? "PLAN" : "BÄNK"}
                            </button>
                          </>
                        )}

                        <button
                          type="button"
                          onClick={() => handleTogglePlayerInSquad(player.id)}
                          className={`px-2 py-1 rounded font-mono-cm font-bold text-[10px] border ${
                            player.activeInSquad
                              ? "bg-[#005cb9]/40 text-sky-200 border-sky-400/40"
                              : "bg-slate-950 text-slate-500 border-white/10"
                          }`}
                        >
                          {player.activeInSquad ? "MED" : "EJ MED"}
                        </button>
                        {!isFollowing && !isVfcDefault && (
                          <button
                            type="button"
                            onClick={() => handleRemovePlayerFromRoster(player.id)}
                            title={`Ta bort ${player.name} ur truppen`}
                            className="p-1 rounded bg-slate-950/80 hover:bg-rose-950 text-slate-500 hover:text-rose-300 border border-white/10"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <form
                onSubmit={handleAddNewPlayer}
                className="flex items-center gap-2 pt-2 border-t border-white/10"
              >
                <input
                  type="text"
                  value={newPlayerName}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                  placeholder="Lägg till spelare (endast förnamn)..."
                  className="flex-1 px-3 py-2 rounded-lg bg-[#040a14] border border-sky-400/30 text-sm text-white font-mono-cm"
                />
                <button
                  type="submit"
                  className="px-3 py-2 rounded-lg bg-[#0f2547] text-[#facc15] border border-[#facc15]/40 font-display font-bold uppercase text-xs flex items-center gap-1"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Lägg till</span>
                </button>
              </form>

              <button
                type="button"
                onClick={handleStartNewMatchFromSetup}
                className="w-full py-3.5 px-4 rounded-xl bg-[#facc15] hover:bg-yellow-300 text-slate-950 font-display font-extrabold text-base uppercase tracking-wider shadow-[0_0_25px_rgba(250,204,21,0.4)] flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                <span>
                  Starta match i {draftConfig.formation} med{" "}
                  {activeSquadRoster.length} spelare ({draftConfig.periods}×
                  {draftConfig.periodMinutes}m, stint{" "}
                  {resolveStintMinutes(draftConfig)}m)
                </span>
              </button>
            </section>
          </div>
        )}

        {/* ============================================================
            FLIK 3: SPELTIDSRAPPORT (CM STAT TABLE)
           ============================================================ */}
        {activeTab === "stats" && (
          <div className="space-y-4">
            <section className="cm-bevel rounded-xl overflow-hidden">
              <div className="cm-header-bar px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-display font-extrabold text-base uppercase tracking-wider text-white">
                    SPELTIDSRAPPORT · {teamProfile.clubName} vs{" "}
                    {matchState.config.opponent}
                  </h2>
                  <p className="text-[11px] font-mono-cm text-sky-200">
                    BLÅ STAPEL = UTESPELARE · GUL STAPEL = MÅLVAKT
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={handleShareSummaryWhatsApp}
                    className="px-2.5 py-1.5 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-extrabold text-xs uppercase flex items-center gap-1 shadow"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>Dela i WhatsApp</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyCupSummary}
                    className="px-2.5 py-1.5 rounded bg-[#0f2547] hover:bg-[#173562] text-sky-200 border border-sky-400/40 font-display font-extrabold text-xs uppercase"
                  >
                    {copiedSummary ? "✓ Kopierat!" : "📋 Kopiera rapport"}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveMatchToHistory}
                    className="px-3 py-1.5 rounded bg-[#facc15] text-slate-950 font-display font-extrabold text-xs uppercase flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Spara i cuplogg</span>
                  </button>
                </div>
              </div>

              <div className="p-3 space-y-2">
                {[...playerMetrics]
                  .sort((a, b) => b.totalPlayMs - a.totalPlayMs)
                  .map((m) => {
                    const maxMs = Math.max(
                      1,
                      getTotalMatchElapsedMs(matchState, now)
                    );
                    const outfieldPct = Math.min(
                      100,
                      Math.round((m.outfieldMs / maxMs) * 100)
                    );
                    const gkPct = Math.min(
                      100 - outfieldPct,
                      Math.round((m.goalkeeperMs / maxMs) * 100)
                    );

                    return (
                      <div
                        key={m.player.id}
                        className="p-2.5 rounded-lg bg-[#050e1d] border border-white/10 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <PlayerAvatar
                              name={m.player.name}
                              avatarUrl={m.player.avatarUrl}
                              isGoalkeeper={m.player.isGoalkeeper}
                              size="sm"
                              number={m.player.number}
                            />
                            <div>
                              <div className="font-display font-extrabold text-base uppercase text-white flex items-center gap-1.5">
                                {m.player.name}
                                {m.player.gkPeriods.length > 0 && (
                                  <span className="px-1.5 py-0.2 rounded bg-[#facc15] text-slate-950 font-mono-cm text-[9px] font-extrabold">
                                    MV P{m.player.gkPeriods.join(", P")}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] font-mono-cm text-slate-400">
                                Utespel: {formatDurationMmSs(m.outfieldMs)} ·
                                MV: {formatDurationMmSs(m.goalkeeperMs)} · Bänk:{" "}
                                {formatDurationMmSs(m.benchMs)}
                              </div>
                              <div className="mt-1">
                                <PositionTime
                                  positionMs={m.positionMs}
                                  showZones
                                />
                              </div>
                            </div>
                          </div>

                          <div className="text-right font-mono-cm">
                            <div className="text-lg font-extrabold text-white">
                              {formatDurationMmSs(m.totalPlayMs)}
                            </div>
                            <div className="text-[10px] text-[#facc15]">
                              {outfieldPct + gkPct}% av matchen
                            </div>
                          </div>
                        </div>

                        <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden flex">
                          <div
                            style={{ width: `${outfieldPct}%` }}
                            className="bg-[#005cb9] h-full"
                          />
                          <div
                            style={{ width: `${gkPct}%` }}
                            className="bg-[#facc15] h-full"
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </section>

            {/* Sidopar & Formationsöversikt i matchen (1-4-1 vs 1-1-3-1) */}
            <section className="cm-bevel rounded-xl overflow-hidden">
              <div className="cm-header-bar px-4 py-2.5 flex items-center justify-between gap-2">
                <div>
                  <h2 className="font-display font-extrabold text-base uppercase tracking-wider text-white">
                    Uppställning & Sidopar ({currentFormation})
                  </h2>
                  <p className="text-[11px] font-mono-cm text-sky-200">
                    Summerad tid på Vänstersida (VM+IMV), Högersida (HM+IMH) samt Centralt/Ankare (LIB/DM/CM).
                  </p>
                </div>
              </div>
              <div className="p-3 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="p-2.5 rounded-lg bg-[#050e1d] border border-emerald-400/30">
                    <div className="font-mono-cm font-extrabold text-xs uppercase text-emerald-300">
                      Vänsterpar (VM + IMV)
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Jobbar ihop om vänsterkanten (ytter + vänster CM)
                    </p>
                    <div className="mt-2 space-y-1">
                      {playerMetrics
                        .map((m) => ({
                          name: m.player.name,
                          ms: summarizeRoleZones(m.positionMs).leftSideMs,
                        }))
                        .filter((x) => x.ms >= 1000)
                        .sort((a, b) => b.ms - a.ms)
                        .map((x) => (
                          <div
                            key={x.name}
                            className="flex items-center justify-between text-xs font-mono-cm text-white"
                          >
                            <span>{x.name}</span>
                            <span className="text-emerald-300 font-bold">
                              {formatDurationMmSs(x.ms)}
                            </span>
                          </div>
                        ))}
                      {playerMetrics.every(
                        (m) => summarizeRoleZones(m.positionMs).leftSideMs < 1000
                      ) && (
                        <div className="text-xs font-mono-cm text-slate-500">
                          Ingen tid registrerad ännu
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-[#050e1d] border border-sky-400/30">
                    <div className="font-mono-cm font-extrabold text-xs uppercase text-sky-300">
                      Högerpar (HM + IMH)
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Jobbar ihop om högerkanten (ytter + höger CM)
                    </p>
                    <div className="mt-2 space-y-1">
                      {playerMetrics
                        .map((m) => ({
                          name: m.player.name,
                          ms: summarizeRoleZones(m.positionMs).rightSideMs,
                        }))
                        .filter((x) => x.ms >= 1000)
                        .sort((a, b) => b.ms - a.ms)
                        .map((x) => (
                          <div
                            key={x.name}
                            className="flex items-center justify-between text-xs font-mono-cm text-white"
                          >
                            <span>{x.name}</span>
                            <span className="text-sky-300 font-bold">
                              {formatDurationMmSs(x.ms)}
                            </span>
                          </div>
                        ))}
                      {playerMetrics.every(
                        (m) => summarizeRoleZones(m.positionMs).rightSideMs < 1000
                      ) && (
                        <div className="text-xs font-mono-cm text-slate-500">
                          Ingen tid registrerad ännu
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-[#050e1d] border border-amber-400/30">
                    <div className="font-mono-cm font-extrabold text-xs uppercase text-amber-300">
                      Centralt & Spets (LIB / DM / CM / FW)
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Back, defensivt ankare (1-1-3-1), C-mitt & forward
                    </p>
                    <div className="mt-2 space-y-1">
                      {playerMetrics
                        .map((m) => {
                          const z = summarizeRoleZones(m.positionMs);
                          return {
                            name: m.player.name,
                            ms: z.centralMs + z.attackMs,
                          };
                        })
                        .filter((x) => x.ms >= 1000)
                        .sort((a, b) => b.ms - a.ms)
                        .map((x) => (
                          <div
                            key={x.name}
                            className="flex items-center justify-between text-xs font-mono-cm text-white"
                          >
                            <span>{x.name}</span>
                            <span className="text-amber-300 font-bold">
                              {formatDurationMmSs(x.ms)}
                            </span>
                          </div>
                        ))}
                      {playerMetrics.every((m) => {
                        const z = summarizeRoleZones(m.positionMs);
                        return z.centralMs + z.attackMs < 1000;
                      }) && (
                        <div className="text-xs font-mono-cm text-slate-500">
                          Ingen tid registrerad ännu
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {matchState.logs.some((l) => l.type === "formation") && (
                  <div className="p-2.5 rounded-lg bg-[#040a14] border border-white/10 font-mono-cm text-xs text-slate-200">
                    <span className="text-[#facc15] font-bold uppercase">
                      Skiften mellan uppställningar i matchen:{" "}
                    </span>
                    {matchState.logs
                      .filter((l) => l.type === "formation")
                      .map(
                        (l) =>
                          `P${l.period} ${Math.floor(
                            l.matchTimeMs / 60000
                          )}' (${l.note})`
                      )
                      .join(" · ")}
                  </div>
                )}
              </div>
            </section>

            <section className="cm-bevel rounded-xl overflow-hidden">
              <div className="cm-header-bar px-4 py-2.5">
                <h2 className="font-display font-extrabold text-base uppercase tracking-wider text-white">
                  Mål och pass
                </h2>
                <p className="text-[11px] font-mono-cm text-sky-200">
                  Positionen spelaren stod på när målet gjordes, och var passningen kom ifrån.
                </p>
              </div>
              {ourGoals(matchState.goals).length === 0 ? (
                <p className="p-4 text-sm text-slate-300">
                  Inga Värmbolsmål ännu. Plus vid resultattavlan, sedan ett tryck på cirkeln som sköt.
                </p>
              ) : (
                <div className="p-3 space-y-2">
                  <p className="font-mono-cm text-xs font-bold text-[#facc15]">
                    {goalHeadline(matchState.goals)}
                  </p>
                  {ourGoals(matchState.goals).map((goal) => (
                    <div
                      key={goal.id}
                      className="font-mono-cm text-[12px] text-slate-200"
                    >
                      <span className="text-slate-400">
                        {goalMoment(goal, matchState.config.periodMinutes)}
                      </span>{" "}
                      {goalDetail(goal)}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="cm-bevel rounded-xl overflow-hidden">
              <div className="cm-header-bar px-4 py-2.5 flex items-center justify-between gap-2">
                <div>
                  <h2 className="font-display font-extrabold text-base uppercase tracking-wider text-white">
                    Total speltid (Dagens matcher / Cup)
                  </h2>
                  <p className="text-[11px] font-mono-cm text-sky-200">
                    Minst speltid överst. Pågående match räknas med, en sparad
                    kopia av samma match räknas inte två gånger.
                  </p>
                  {cupGoalLine && (
                    <p className="mt-1 font-mono-cm text-[11px] text-[#facc15]">
                      {cupGoalLine}
                    </p>
                  )}
                </div>
                {savedMatches.length > 0 && !isFollowing && (
                  <button
                    type="button"
                    onClick={handleClearMatchHistory}
                    className="px-2.5 py-1.5 rounded bg-rose-500/20 hover:bg-rose-500/35 text-rose-200 border border-rose-400/40 font-mono-cm font-bold text-[10px] uppercase shrink-0"
                  >
                    Rensa tidigare matcher ({savedMatches.length})
                  </button>
                )}
              </div>
              {cupRows.length === 0 ? (
                <p className="p-4 text-sm text-slate-300">
                  Ingen tid registrerad ännu. Avspark börjar räknas direkt, och en
                  match som har gått mer än några sekunder sparas när nästa
                  startar.
                </p>
              ) : (
                <div className="p-3 space-y-2">
                  {cupRows.map((row) => (
                    <div
                      key={row.id}
                      className="p-2.5 rounded-lg bg-[#050e1d] border border-white/10 flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="font-display font-extrabold text-sm uppercase text-white">
                          {row.number ? `${row.number} ` : ""}
                          {row.name}
                        </div>
                        <div className="text-[11px] font-mono-cm text-slate-400">
                          {row.matches}{" "}
                          {row.matches === 1 ? "match" : "matcher"} · Bänk{" "}
                          {formatDurationMmSs(row.benchMs)} · MV{" "}
                          {formatDurationMmSs(row.goalkeeperMs)}
                        </div>
                        <div className="mt-1">
                          <PositionTime
                            positionMs={row.positionMs}
                            showZones
                          />
                        </div>
                      </div>
                      <div className="font-mono-cm text-lg font-extrabold text-white shrink-0">
                        {formatDurationMmSs(row.totalPlayMs)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {savedMatches.length > 0 && (
              <section className="cm-bevel rounded-xl p-4 space-y-2">
                <h3 className="font-display font-extrabold text-sm uppercase tracking-wider text-[#facc15]">
                  Sparade matcher under cupen ({savedMatches.length})
                </h3>
                {savedMatches.map((sm) => (
                  <div
                    key={sm.id}
                    className="p-3 rounded-lg bg-[#050e1d] border border-white/10 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-display font-extrabold text-sm uppercase text-white">
                        {teamProfile.clubName} {sm.ourScore} – {sm.opponentScore}{" "}
                        {sm.opponent}
                      </div>
                      <div className="text-xs font-mono-cm text-slate-400">
                        {sm.eventTitle || sm.location} · {sm.periods}×
                        {sm.periodMinutes}m
                      </div>
                      {goalHeadline(sm.goals) && (
                        <div className="text-[11px] font-mono-cm text-sky-200 mt-0.5">
                          {goalHeadline(sm.goals)}
                        </div>
                      )}
                    </div>
                    <span className="text-xs font-mono-cm text-[#facc15]">
                      {new Date(sm.dateIso).toLocaleDateString("sv-SE")}
                    </span>
                  </div>
                ))}
              </section>
            )}
          </div>
        )}

        {activeTab === "tactics" && (
          <TacticalMovementView
            currentFormation={currentFormation}
            onSelectFormation={handleChangeFormation}
            pitchPlayers={pitchMetrics.map((m) => ({
              id: m.player.id,
              name: m.player.name,
              number: m.player.number,
              isGoalkeeper: m.player.isGoalkeeper,
              pitchSlotIndex: m.player.pitchSlotIndex,
            }))}
            disabled={isReadOnlyFollower}
          />
        )}

        {activeTab === "guide" && (
          <GuideView
            soundEnabled={soundEnabled}
            onPreview={(name) => cue(name)}
            clubName={teamProfile.clubName}
            coaches={coachList}
          />
        )}
      </main>

      {/* ============================================================
          FLYTANDE MULTI-BYTESBALK & SNABB POSITIONSÄNDRING LÄNGST NER
         ============================================================ */}
      {activeTab === "match" &&
        !focusMode &&
        (selectedOutIds.length > 0 || selectedInIds.length > 0) && (
          <div className="fixed bottom-0 inset-x-0 z-40 p-2.5 bg-gradient-to-t from-[#02060d] via-[#040c1a]/95 to-transparent backdrop-blur-md">
            <div className="max-w-4xl mx-auto cm-bevel rounded-xl p-3 border-2 border-[#facc15] space-y-2.5">
              {/* 1-klicks positionsflytt & direktbyte när 1 spelare på planen är vald */}
              {selectedOutIds.length === 1 && selectedInIds.length === 0 && (
                <div className="space-y-1.5 pb-2 border-b border-white/15">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono-cm text-[10px] font-extrabold uppercase text-[#facc15]">
                      Flytta{" "}
                      {
                        matchState.players.find(
                          (p) => p.id === selectedOutIds[0]
                        )?.name
                      }{" "}
                      till position:
                    </span>
                    {formationSlots.map((slot) => {
                      const occ = pitchMetrics.find(
                        (m) =>
                          (m.player.pitchSlotIndex ??
                            (m.player.isGoalkeeper ? 0 : -1)) === slot.slotIndex
                      )?.player;
                      const isSelf = occ?.id === selectedOutIds[0];
                      return (
                        <button
                          key={slot.slotIndex}
                          type="button"
                          onClick={() =>
                            handleMovePlayerToSlot(
                              selectedOutIds[0],
                              slot.slotIndex
                            )
                          }
                          className={`px-2 py-1 rounded font-mono-cm font-extrabold text-[10px] border transition active:scale-95 ${
                            isSelf
                              ? "bg-[#facc15] text-slate-950 border-yellow-200"
                              : "bg-[#0f2547] hover:bg-[#173562] text-white border-sky-400/40"
                          }`}
                        >
                          {slot.code}
                          {occ && !isSelf ? ` (⇄ ${occ.name})` : " (Nu)"}
                        </button>
                      );
                    })}
                  </div>
                  {benchMetrics.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono-cm text-[10px] font-extrabold uppercase text-emerald-300">
                        Byt ut direkt mot bänk:
                      </span>
                      {benchMetrics.map((bm) => (
                        <button
                          key={bm.player.id}
                          type="button"
                          onClick={() =>
                            handleQuickSubPair(selectedOutIds[0], bm.player.id)
                          }
                          className="px-2.5 py-1 rounded bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-display font-extrabold text-xs uppercase shadow active:scale-95"
                        >
                          ⇄ {bm.player.name} IN
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 1-klicks inbyte på valfri position när 1 spelare på bänken är vald */}
              {selectedOutIds.length === 0 && selectedInIds.length === 1 && (
                <div className="space-y-1.5 pb-2 border-b border-white/15">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono-cm text-[10px] font-extrabold uppercase text-emerald-300">
                      Sätt in{" "}
                      {
                        matchState.players.find(
                          (p) => p.id === selectedInIds[0]
                        )?.name
                      }{" "}
                      direkt på position:
                    </span>
                    {formationSlots.map((slot) => {
                      const occ = pitchMetrics.find(
                        (m) =>
                          (m.player.pitchSlotIndex ??
                            (m.player.isGoalkeeper ? 0 : -1)) === slot.slotIndex
                      )?.player;
                      return (
                        <button
                          key={slot.slotIndex}
                          type="button"
                          onClick={() =>
                            handleMovePlayerToSlot(
                              selectedInIds[0],
                              slot.slotIndex
                            )
                          }
                          className="px-2 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/35 text-emerald-200 border border-emerald-400/50 font-mono-cm font-extrabold text-[10px] transition active:scale-95"
                        >
                          {slot.code}
                          {occ ? ` (ut: ${occ.name})` : ""}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="space-y-1 font-mono-cm text-xs">
                  {subPairsSummary && (
                    <div className="font-bold text-[#facc15] text-sm">
                      {subPairsSummary}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="px-1.5 py-0.5 rounded bg-orange-500 text-slate-950 font-extrabold">
                      ▼ UT ({selectedOutIds.length}):
                    </span>
                    <span className="font-bold text-white">
                      {selectedOutIds.length > 0
                        ? selectedOutIds
                            .map(
                              (id) =>
                                matchState.players.find((p) => p.id === id)
                                  ?.name
                            )
                            .join(", ")
                        : "Klicka på 1–4 spelare på gräsplanen..."}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="px-1.5 py-0.5 rounded bg-emerald-400 text-slate-950 font-extrabold">
                      ▲ IN ({selectedInIds.length}):
                    </span>
                    <span className="font-bold text-white">
                      {selectedInIds.length > 0
                        ? selectedInIds
                            .map(
                              (id) =>
                                matchState.players.find((p) => p.id === id)
                                  ?.name
                            )
                            .join(", ")
                        : "Klicka på lika många på bänken..."}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={clearSubSelection}
                    className="px-3 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-display font-bold uppercase text-xs"
                  >
                    Avbryt
                  </button>

                  {canSwapPitchPair && (
                    <button
                      type="button"
                      onClick={handleSwapTwoPitchPlayers}
                      className="px-3.5 py-2.5 rounded-lg bg-[#005cb9] hover:bg-sky-600 text-white font-display font-extrabold uppercase text-xs border border-sky-300"
                    >
                      Skifta plats i {currentFormation}
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={!canExecuteSub}
                    onClick={handleConfirmSubstitution}
                    className={`flex-1 sm:flex-initial px-5 py-2.5 rounded-lg font-display font-extrabold text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition active:scale-95 ${
                      canExecuteSub
                        ? "bg-emerald-400 hover:bg-emerald-300 text-slate-950 shadow-[0_0_25px_rgba(52,211,153,0.6)]"
                        : "bg-slate-800 text-slate-400 cursor-not-allowed"
                    }`}
                  >
                    <ArrowLeftRight className="w-4 h-4" />
                    {canExecuteSub ? (
                      <span>
                        {isPreKickoffMatch
                          ? `Ändra startelva (${selectedOutIds.length} mot ${selectedInIds.length})`
                          : `Genomför byte (${selectedOutIds.length} mot ${selectedInIds.length})`}
                      </span>
                    ) : selectedMismatch ? (
                      <span>
                        Välj{" "}
                        {Math.abs(
                          selectedOutIds.length - selectedInIds.length
                        )}{" "}
                        till på{" "}
                        {selectedOutIds.length > selectedInIds.length
                          ? "bänken"
                          : "planen"}
                      </span>
                    ) : (
                      <span>Välj spelare</span>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      {/* MODAL: MÅLVAKTSKRAGE */}
      {gkModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="max-w-md w-full cm-bevel rounded-xl border-2 border-[#facc15] overflow-hidden shadow-2xl">
            <div className="cm-header-bar px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-[#facc15] fill-[#facc15]" />
                <div>
                  <h3 className="font-display font-extrabold text-base uppercase text-white">
                    MÅLVAKTSKRAGE · PERIOD {matchState.currentPeriod}
                  </h3>
                  <p className="text-[11px] text-sky-200">
                    Välj vem som står i mål (målvaktstiden spåras separat)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setGkModalOpen(false)}
                className="text-xs font-mono-cm text-sky-200 hover:text-white"
              >
                [STÄNG]
              </button>
            </div>

            <div className="p-3 space-y-1.5 max-h-80 overflow-y-auto">
              {matchState.players.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleAssignGoalkeeper(p.id, true)}
                  className={`w-full p-2.5 rounded-lg border flex items-center justify-between transition ${
                    p.isGoalkeeper
                      ? "bg-[#facc15]/20 border-[#facc15] text-white"
                      : "bg-[#050e1d] border-white/10 hover:border-[#facc15]/50 text-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <PlayerAvatar
                      name={p.name}
                      avatarUrl={p.avatarUrl}
                      isGoalkeeper={p.isGoalkeeper}
                      size="sm"
                      number={p.number}
                    />
                    <div className="text-left">
                      <div className="font-display font-extrabold text-sm uppercase">
                        {p.name}
                      </div>
                      <div className="text-[10px] font-mono-cm text-slate-400">
                        {p.onPitch ? "INNE PÅ PLAN" : "PÅ BÄNKEN (BYTS IN)"}
                        {p.gkPeriods.length > 0 &&
                          ` · STOD P${p.gkPeriods.join(", P")}`}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded font-mono-cm font-extrabold text-xs ${
                      p.isGoalkeeper
                        ? "bg-[#facc15] text-slate-950"
                        : "bg-slate-800 text-[#facc15]"
                    }`}
                  >
                    {p.isGoalkeeper ? "HAR KRAGEN" : "VÄLJ MV"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SAMLING (OMKLÄDNINGSRUM / HALVTID FÖR KILLARNA) */}
      {teamTalkOpen && (
        <div className="fixed inset-0 z-50 bg-[#02060d]/95 backdrop-blur-md flex flex-col p-3 sm:p-5 overflow-y-auto">
          <div className="max-w-xl w-full mx-auto cm-bevel rounded-2xl border-2 border-[#facc15] overflow-hidden shadow-2xl flex flex-col">
            <div className="cm-header-bar px-4 py-3 flex items-center justify-between gap-2">
              <div>
                <div className="text-[11px] font-mono-cm font-bold uppercase text-[#facc15]">
                  {matchState.config.eventTitle || teamProfile.displayName} · PERIOD {matchState.currentPeriod}
                </div>
                <h3 className="font-display font-extrabold text-xl sm:text-2xl uppercase text-white">
                  SAMLING · {teamProfile.clubName} vs {matchState.config.opponent || "MOTSTÅNDARE"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setTeamTalkOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-[#facc15] text-slate-950 font-mono-cm font-extrabold text-xs uppercase"
              >
                Stäng
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="text-center py-1 rounded bg-emerald-500/15 border border-emerald-400/40 font-mono-cm font-extrabold text-xs text-emerald-300 tracking-widest uppercase">
                ▲ ANFALLSRIKTNING ({currentFormation}) ▲
              </div>

              {currentFormation === "1-4-1" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="p-3 rounded-xl bg-amber-400/10 border border-[#facc15]/60">
                    <div className="font-mono-cm font-extrabold text-xs uppercase text-[#facc15]">
                      🤝 VÄNSTERPARET (VM + CM VÄNSTER)
                    </div>
                    <div className="font-display font-extrabold text-lg uppercase text-white mt-0.5">
                      {pitchMetrics.find((m) => m.player.pitchSlotIndex === 2)
                        ?.player.name ?? "VM"}{" "}
                      &amp;{" "}
                      {pitchMetrics.find((m) => m.player.pitchSlotIndex === 3)
                        ?.player.name ?? "IMV"}
                    </div>
                    <p className="text-xs text-slate-200 mt-1">
                      Ansvarar för hela vänstersidan ihop! Går yttern fram säkrar CM Vänster upp lite bakåt så vänsterkanten aldrig lämnas öppen.
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-sky-400/10 border border-sky-300/60">
                    <div className="font-mono-cm font-extrabold text-xs uppercase text-sky-200">
                      🤝 HÖGERPARET (CM HÖGER + HM)
                    </div>
                    <div className="font-display font-extrabold text-lg uppercase text-white mt-0.5">
                      {pitchMetrics.find((m) => m.player.pitchSlotIndex === 4)
                        ?.player.name ?? "IMH"}{" "}
                      &amp;{" "}
                      {pitchMetrics.find((m) => m.player.pitchSlotIndex === 5)
                        ?.player.name ?? "HM"}
                    </div>
                    <p className="text-xs text-slate-200 mt-1">
                      Ansvarar för hela högersidan ihop! Går yttern fram säkrar CM Höger upp lite bakåt så högerkanten aldrig lämnas öppen.
                    </p>
                  </div>
                </div>
              )}

              {/* Uppställning uppifrån och ner (Anfall -> Mittfält -> Back -> Målvakt) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[...formationSlots]
                  .sort((a, b) => a.yPct - b.yPct || a.xPct - b.xPct)
                  .map((slot) => {
                    const playerOnSlot =
                      pitchMetrics.find(
                        (m) =>
                          (m.player.pitchSlotIndex ??
                            (m.player.isGoalkeeper ? 0 : -1)) === slot.slotIndex
                      )?.player ??
                      (slot.slotIndex === 0
                        ? pitchMetrics.find((m) => m.player.isGoalkeeper)?.player
                        : undefined);
                    return (
                      <div
                        key={slot.slotIndex}
                        className={`p-3 rounded-xl border flex items-center justify-between gap-2 ${
                          slot.slotIndex === 0
                            ? "sm:col-span-2 bg-amber-400/15 border-[#facc15]"
                            : "bg-[#061224] border-sky-400/30"
                        }`}
                      >
                        <div>
                          <div className="font-mono-cm font-extrabold text-xs uppercase text-[#facc15]">
                            {slot.code} · {slot.label}
                          </div>
                          <div className="font-display font-extrabold text-2xl uppercase text-white leading-tight mt-0.5">
                            {playerOnSlot ? playerOnSlot.name : "—"}
                          </div>
                        </div>
                        <span className="px-2 py-1 rounded bg-slate-950/80 font-mono-cm font-extrabold text-xs text-sky-200 border border-white/10">
                          {slot.slotIndex === 0 ? "MÅLVAKT" : "STARTAR"}
                        </span>
                      </div>
                    );
                  })}
              </div>

              {/* Bänken */}
              <div className="p-3 rounded-xl bg-[#040a14] border border-sky-400/30">
                <div className="font-mono-cm font-extrabold text-xs uppercase text-emerald-300 mb-1.5">
                  BÄNKEN · REDO FÖR FÖRSTA BYTET ({resolveStintMinutes(matchState.config)}:00)
                </div>
                <div className="flex flex-wrap gap-2">
                  {benchMetrics.map((m, i) => (
                    <span
                      key={m.player.id}
                      className="px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-400/40 font-display font-extrabold text-lg uppercase text-white"
                    >
                      {i + 1}. {m.player.name}
                      {m.player.resting ? " (Vilar)" : ""}
                    </span>
                  ))}
                </div>
              </div>

              {/* Dagens 4 fokuspunkter */}
              <div className="p-3 rounded-xl bg-[#050e1d] border border-white/10 space-y-1.5">
                <div className="font-mono-cm font-extrabold text-xs uppercase text-[#facc15]">
                  KOM IHÅG PÅ PLANEN IDAG ({currentFormation}):
                </div>
                {(
                  FORMATION_COACH_NOTES[currentFormation] || CUP_COACH_NOTES
                ).map((note) => (
                  <p key={note.role} className="text-sm text-slate-200">
                    <strong className="text-[#facc15]">{note.role}:</strong>{" "}
                    {note.text}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

