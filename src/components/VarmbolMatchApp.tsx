"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftRight,
  Check,
  Clock,
  LayoutGrid,
  ListFilter,
  Maximize2,
  ArrowLeft,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Shield,
  Sparkles,
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
import { buildCupSetup, CUP_COACH_NOTES, CUP_MATCHES, INITIAL_CUP_SETUP, upgradeCupDuration } from "@/lib/cup-plan";
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
  pitchPositionCode,
  pushUndoSnapshot,
  removeLastGoal,
  resolveStintMinutes,
  STINT_MINUTE_CHOICES,
  stampGoalPlayer,
  suggestSubstitutions,
  swapPitchPositions,
  undoLastAction,
} from "@/lib/match-engine";
import { mergeCupRows } from "@/lib/cup-totals";
import { playSound, resumeSound, SoundCue } from "@/lib/sounds";
import { GuideView } from "./GuideView";
import { PositionTime } from "./PositionTime";
import {
  ComputedPlayerMetrics,
  GoalRecord,
  MatchConfig,
  MatchState,
  RosterPlayer,
  SavedMatchSummary,
  TacticalFormation,
} from "@/lib/types";
import { PlayerAvatar } from "./PlayerAvatar";

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

function goalDetail(goal: GoalRecord) {
  if (!goal.scorerPosition) return "utan plats";
  const shot = goal.scorerName
    ? `${goal.scorerPosition} ${goal.scorerName}`
    : goal.scorerPosition;
  if (goal.assistPosition) {
    const pass = goal.assistName
      ? `${goal.assistPosition} ${goal.assistName}`
      : goal.assistPosition;
    return `${shot} · pass ${pass}`;
  }
  return `${shot} · ingen pass`;
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

export function VarmbolMatchApp() {
  const [hydrated, setHydrated] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "match" | "setup" | "stats" | "guide"
  >("match");
  // I matchvyn kan man se 2D Taktikplan ("pitch") eller Klassisk CM Tabell ("table")
  const [pitchViewMode, setPitchViewMode] = useState<"pitch" | "table">(
    "pitch"
  );
  const [tokenStat, setTokenStat] = useState<"play" | "stint" | "bench">(
    "play"
  );

  // Cuptruppen enligt tränarnas matchplan.
  const [roster, setRoster] = useState<RosterPlayer[]>(INITIAL_CUP_SETUP.roster);

  // Matchinställningar inför ny match (med 1-4-1 som förval!)
  const [draftConfig, setDraftConfig] = useState<MatchConfig>(INITIAL_CUP_SETUP.config);

  const [setupPitchIds, setSetupPitchIds] = useState<string[]>(() =>
    [...INITIAL_CUP_SETUP.pitchIds]
  );
  const [setupGkId, setSetupGkId] = useState<string>(INITIAL_CUP_SETUP.goalkeeperId);

  // Aktiv match
  const [matchState, setMatchState] = useState<MatchState>(() =>
    createInitialMatchState(
      INITIAL_CUP_SETUP.roster,
      INITIAL_CUP_SETUP.config,
      INITIAL_CUP_SETUP.pitchIds,
      INITIAL_CUP_SETUP.goalkeeperId
    )
  );

  const [savedMatches, setSavedMatches] = useState<SavedMatchSummary[]>([]);
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
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [syncMode, setSyncMode] = useState<SyncMode>("control");
  const [syncUpdatedAt, setSyncUpdatedAt] = useState<number | null>(null);
  const [syncError, setSyncError] = useState(false);
  const deviceIdRef = useRef<string>("device");
  const lastRemoteVersionRef = useRef<number>(0);
  const skipNextPushRef = useRef<boolean>(false);
  const forceNextPushRef = useRef<boolean>(false);
  const periodAlertedRef = useRef<number | null>(null);
  const stintAlertedKeyRef = useRef<string>("");

  // Ladda från localStorage
  useEffect(() => {
    try {
      const existingDeviceId = localStorage.getItem(STORAGE_KEYS.deviceId);
      if (existingDeviceId) {
        deviceIdRef.current = existingDeviceId;
      } else {
        const created = `dev-${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 6)}`;
        deviceIdRef.current = created;
        localStorage.setItem(STORAGE_KEYS.deviceId, created);
      }

      const rawSyncMode = localStorage.getItem(STORAGE_KEYS.syncMode);
      const urlMode = new URLSearchParams(window.location.search).get("mode");
      if (urlMode === "follow" || urlMode === "live") {
        setSyncMode("follow");
      } else if (urlMode === "control" || urlMode === "styr") {
        setSyncMode("control");
      } else if (rawSyncMode === "follow" || rawSyncMode === "control") {
        setSyncMode(rawSyncMode);
      }

      const rawRoster = localStorage.getItem(STORAGE_KEYS.roster);
      if (rawRoster) {
        const parsed = JSON.parse(rawRoster) as RosterPlayer[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setRoster(
            parsed.map((player) => ({
              ...player,
              name: correctFirstName(player.name),
            }))
          );
        }
      }

      const rawMatch = localStorage.getItem(STORAGE_KEYS.activeMatch);
      if (rawMatch) {
        const parsedMatch = JSON.parse(rawMatch) as MatchState;
        if (parsedMatch && parsedMatch.players?.length > 0) {
          const normalized = normalizeMatchState(parsedMatch);
          setMatchState(normalized);
          setDraftConfig(normalized.config);
          setSetupPitchIds(normalized.players.filter((p) => p.onPitch).sort((a, b) => (a.pitchSlotIndex ?? 0) - (b.pitchSlotIndex ?? 0)).map((p) => p.id));
          setSetupGkId(normalized.players.find((p) => p.isGoalkeeper)?.id ?? INITIAL_CUP_SETUP.goalkeeperId);
        }
      }

      const rawSound = localStorage.getItem(STORAGE_KEYS.sound);
      if (rawSound === "0") setSoundEnabled(false);

      const rawFocus = localStorage.getItem(STORAGE_KEYS.focusMode);
      const urlFocus = new URLSearchParams(window.location.search).get("focus");
      if (urlFocus === "1" || urlFocus === "true" || rawFocus === "1") {
        setFocusMode(true);
      }

      const rawHistory = localStorage.getItem(STORAGE_KEYS.history);
      if (rawHistory) {
        const parsedHistory = JSON.parse(rawHistory) as SavedMatchSummary[];
        if (Array.isArray(parsedHistory)) {
          setSavedMatches(normalizeHistory(parsedHistory));
        }
      }
    } catch {
      // ignore
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEYS.roster, JSON.stringify(roster));
    } catch {
      // ignore
    }
  }, [roster, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(
        STORAGE_KEYS.activeMatch,
        JSON.stringify(matchState)
      );
    } catch {
      // ignore
    }
  }, [matchState, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(savedMatches));
    } catch {
      // ignore
    }
  }, [savedMatches, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEYS.sound, soundEnabled ? "1" : "0");
    } catch {
      // ignore
    }
  }, [soundEnabled, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEYS.focusMode, focusMode ? "1" : "0");
    } catch {
      // ignore
    }
  }, [focusMode, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEYS.syncMode, syncMode);
    } catch {
      // ignore
    }
  }, [syncMode, hydrated]);

  const applyRemoteSnapshot = React.useCallback(
    (snapshot: {
      version?: number;
      updatedAt?: number;
      roster?: RosterPlayer[];
      matchState?: MatchState;
      savedMatches?: SavedMatchSummary[];
    }) => {
      if (!snapshot?.matchState?.players?.length) return;
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
      const normalized = normalizeMatchState(adjustedMatchState);
      setMatchState(normalized);
      setDraftConfig(normalized.config);
      if (Array.isArray(snapshot.roster) && snapshot.roster.length > 0) {
        setRoster(
          snapshot.roster.map((player) => ({
            ...player,
            name: correctFirstName(player.name),
          }))
        );
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
        const res = await fetch(`/api/sync?t=${Date.now()}`, {
          cache: "no-store",
        });
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
    [applyRemoteSnapshot]
  );

  // Styrande telefon skickar upp till Vercel Blob vid varje ändring
  useEffect(() => {
    if (!hydrated || syncMode !== "control") return;
    if (skipNextPushRef.current) {
      skipNextPushRef.current = false;
      return;
    }
    const shouldForce = forceNextPushRef.current;
    forceNextPushRef.current = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
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
  }, [hydrated, syncMode, roster, matchState, savedMatches, applyRemoteSnapshot]);

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
      return `VÄRMBOLS FC P2017 STÄLLER UPP I ${currentFormation} MOT ${matchState.config.opponent.toUpperCase()} — REDO FÖR AVSPARK!`;
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
  ]);

  const isFollowing = syncMode === "follow";

  function handleSetSyncMode(nextMode: SyncMode) {
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
    if (isFollowing) return;
    setSuggestionBanner(null);
    setSelectedOutIds((prev) =>
      prev.includes(playerId)
        ? prev.filter((id) => id !== playerId)
        : [...prev, playerId]
    );
  }

  function toggleSelectBenchPlayer(playerId: string) {
    if (isFollowing) return;
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
    if (isFollowing) return;
    setSuggestionCount(count);
    const suggestion = suggestSubstitutions(matchState, Date.now(), count);
    setSelectedOutIds(suggestion.outIds);
    setSelectedInIds(suggestion.inIds);
    setSuggestionBanner(suggestion.reason);
  }

  function handleSetStintMinutes(minutes: (typeof STINT_MINUTE_CHOICES)[number]) {
    if (isFollowing) return;
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
    if (isFollowing) return;
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

  // Om man valt exakt 2 spelare på planen och 0 på bänken kan man även skifta deras positioner i 1-4-1!
  function handleSwapTwoPitchPlayers() {
    if (isFollowing) return;
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
    if (isFollowing) return;
    const ts = Date.now();
    setNow(ts);
    setMatchState((prev) => {
      if (prev.config.formation === newFormation) return prev;
      const withSnap = pushUndoSnapshot(prev, `Formation ${newFormation}`);
      const committed = commitRunningTime(withSnap, ts);
      return {
        ...committed,
        config: { ...committed.config, formation: newFormation },
        logs: [
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
      formation: newFormation,
    }));
  }

  function handleToggleClock() {
    if (isFollowing) return;
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
    if (isFollowing) return;
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
    if (isFollowing) return;
    const ts = Date.now();
    setNow(ts);
    setMatchState((prev) =>
      assignGoalkeeperCollar(prev, playerId, ts, swapIfOnBench)
    );
    setGkModalOpen(false);
    cue("gk");
  }

  function handleUndo() {
    if (isFollowing) return;
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
    if (isFollowing) return;
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
    if (isFollowing) return;
    const removedId = lastGoalId(matchState.goals, "ours");
    setMatchState((prev) => removeLastGoal(prev, "ours"));
    setGoalPick((pick) => (pick && pick.goalId === removedId ? null : pick));
  }

  function handleAddOpponentGoal() {
    if (isFollowing) return;
    const ts = Date.now();
    setNow(ts);
    setMatchState((prev) => addOpponentGoal(prev, ts));
    cue("conceded");
  }

  function handleRemoveOpponentGoal() {
    if (isFollowing) return;
    setMatchState((prev) => removeLastGoal(prev, "theirs"));
  }

  function handleSkipGoalPick() {
    if (!goalPick || isFollowing) return;
    setMatchState((prev) => markGoalAssistDone(prev, goalPick.goalId));
    setGoalPick(null);
  }

  function handlePitchPlayerClick(playerId: string) {
    if (isFollowing) return;
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
    if (isFollowing) return;
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
    if (isFollowing) return;
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
    if (isFollowing) return;
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
    setSetupPitchIds([
      gkId,
      ...sortedOutfield.slice(0, cap - 1).map((p) => p.id),
    ]);
  }

  function handleTogglePlayerInSquad(playerId: string) {
    if (isFollowing) return;
    setRoster((prev) =>
      prev.map((p) =>
        p.id === playerId ? { ...p, activeInSquad: !p.activeInSquad } : p
      )
    );
  }

  function handleTogglePlayerResting(playerId: string, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    if (isFollowing) return;
    setMatchState((prev) => ({
      ...prev,
      players: prev.players.map((p) =>
        p.id === playerId ? { ...p, resting: !p.resting } : p
      ),
    }));
    setSelectedInIds((prev) => prev.filter((id) => id !== playerId));
  }

  function handleAssignSetupSlot(playerId: string, targetSlotIndex: number) {
    if (isFollowing) return;
    if (targetSlotIndex === 0) {
      if (!setupPitchIds.includes(playerId)) {
        handleToggleSetupStarter(playerId);
      }
      setSetupGkId(playerId);
      return;
    }
    setSetupPitchIds((prev) => {
      const outfield = prev.filter((id) => id !== setupGkId);
      const currentIdx = outfield.indexOf(playerId);
      const targetIdx = Math.max(
        0,
        Math.min(outfield.length - 1, targetSlotIndex - 1)
      );
      if (currentIdx === -1 || currentIdx === targetIdx) return prev;
      const nextOutfield = [...outfield];
      const temp = nextOutfield[targetIdx];
      nextOutfield[targetIdx] = playerId;
      nextOutfield[currentIdx] = temp;
      return [setupGkId, ...nextOutfield];
    });
  }

  function handleToggleSetupStarter(playerId: string) {
    if (isFollowing) return;
    setSetupPitchIds((prev) => {
      if (prev.includes(playerId)) {
        return prev.filter((id) => id !== playerId);
      }
      if (prev.length >= pitchCapacity) {
        const withoutLast = prev.filter((id) => id !== setupGkId);
        const dropId = withoutLast[withoutLast.length - 1] ?? prev[0];
        return [...prev.filter((id) => id !== dropId), playerId];
      }
      return [...prev, playerId];
    });
  }

  function handleAddNewPlayer(e: React.FormEvent) {
    e.preventDefault();
    if (isFollowing) return;
    const trimmed = newPlayerName.trim();
    if (!trimmed) return;
    const firstNameOnly = trimmed.split(/\s+/)[0];
    const newPlayer: RosterPlayer = {
      id: `p-${Date.now()}`,
      name: firstNameOnly,
      number: String(roster.length + 1),
      activeInSquad: true,
    };
    setRoster((prev) => [...prev, newPlayer]);
    setNewPlayerName("");
  }

  function handleStartNewMatchFromSetup() {
    if (isFollowing) return;
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
    if (isFollowing || !nextCupMatch) return;
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

  function handleCopyCupSummary() {
    const lines: string[] = [];
    lines.push("⚽ VÄRMBOLS FC P2017 – SAMMANFATTNING");
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
        lines.push(
          `• Värmbols FC ${m.ourScore}–${m.opponentScore} ${m.opponent}${
            gLine ? ` (${gLine})` : ""
          }`
        );
      }
    }
    if (cupRows.length > 0) {
      lines.push("");
      lines.push("SPELTID TOTALT:");
      for (const r of [...cupRows].sort(
        (a, b) => b.totalPlayMs - a.totalPlayMs
      )) {
        const pos = Object.entries(r.positionMs ?? {})
          .filter(([, ms]) => ms >= 1000)
          .sort((a, b) => b[1] - a[1])
          .map(([code, ms]) => `${code} ${formatDurationMmSs(ms)}`)
          .join(", ");
        lines.push(
          `• ${r.name}: ${formatDurationMmSs(r.totalPlayMs)}${
            r.goalkeeperMs >= 1000
              ? ` (MV ${formatDurationMmSs(r.goalkeeperMs)})`
              : ""
          }${pos ? ` [${pos}]` : ""}`
        );
      }
    }
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(lines.join("\n")).then(() => {
        setCopiedSummary(true);
        setTimeout(() => setCopiedSummary(false), 2500);
      });
    }
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

  return (
    <div
      className={
        focusMode && activeTab === "match"
          ? "h-[100dvh] overflow-hidden flex flex-col bg-[#030914] select-none"
          : "min-h-screen flex flex-col pb-36 select-none"
      }
    >
      {(focusMode || activeTab !== "match") && (
        <button
          type="button"
          onClick={() => { setFocusMode(false); setActiveTab("match"); }}
          className="min-h-11 px-3 py-2 flex items-center gap-2 shrink-0 bg-[#050e1d] text-[#facc15] border-b border-sky-400/30 font-display font-bold text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Tillbaka till huvudmenyn
        </button>
      )}
      {/* ============================================================
          CHAMPIONSHIP MANAGER TOP TITLE BAR & NAVIGATION
         ============================================================ */}
      {(!focusMode || activeTab !== "match") && (
      <header className="sticky top-0 z-30 bg-[#050e1d]/95 backdrop-blur-md border-b-2 border-[#facc15]/80 shadow-[0_6px_30px_rgba(0,0,0,0.85)]">
        <div className="cm-header-bar px-3 py-2">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-2">
            {/* Värmbols FC Vapen & Titel */}
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded bg-white/10 p-1 flex items-center justify-center border border-[#facc15]/70 shadow-inner shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/club/varmbol-logo-white.png"
                  alt="Värmbols FC"
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-display font-extrabold text-base sm:text-xl tracking-wider uppercase text-white drop-shadow">
                    VÄRMBOLS FC · P2017
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-[#facc15] text-slate-950 font-mono-cm font-extrabold text-[10px] uppercase tracking-wider">
                    {currentFormation}
                  </span>
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

            {/* Tränarna Lars, Jocke och Sofia + Live-synk */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
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

              <div className="hidden sm:flex items-center gap-2 bg-[#040d1a]/90 border border-sky-300/30 rounded px-2.5 py-1">
                <div className="flex -space-x-1">
                  <span className="w-5 h-5 rounded-full bg-[#005cb9] border border-white/80 font-mono-cm font-extrabold text-[9px] text-white flex items-center justify-center shadow">
                    L
                  </span>
                  <span className="w-5 h-5 rounded-full bg-[#facc15] border border-slate-950 font-mono-cm font-extrabold text-[9px] text-slate-950 flex items-center justify-center shadow">
                    J
                  </span>
                  <span className="w-5 h-5 rounded-full bg-emerald-400 border border-slate-950 font-mono-cm font-extrabold text-[9px] text-slate-950 flex items-center justify-center shadow">
                    S
                  </span>
                </div>
                <div className="text-[10px] leading-tight">
                  <div className="font-mono-cm font-bold text-[#facc15] uppercase tracking-wider">
                    TRÄNARE
                  </div>
                  <div className="text-white font-display font-bold uppercase tracking-wide">
                    Lars, Jocke & Sofia
                  </div>
                </div>
              </div>

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

        {/* CM FLIK-MENY (TACTICS / SQUAD / STATS) */}
        <div className="max-w-4xl mx-auto px-3 py-1.5 flex items-center gap-1.5 bg-[#061224]">
          <button
            type="button"
            onClick={() => setActiveTab("match")}
            className={`flex-1 py-1.5 px-2.5 rounded font-display font-bold uppercase tracking-wider text-xs sm:text-sm flex items-center justify-center gap-1.5 border transition ${
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
            onClick={() => setActiveTab("setup")}
            className={`flex-1 py-1.5 px-2.5 rounded font-display font-bold uppercase tracking-wider text-xs sm:text-sm flex items-center justify-center gap-1.5 border transition ${
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
            className={`flex-1 py-1.5 px-2.5 rounded font-display font-bold uppercase tracking-wider text-xs sm:text-sm flex items-center justify-center gap-1.5 border transition ${
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
            className={`flex-1 py-1.5 px-2.5 rounded font-display font-bold uppercase tracking-wider text-xs sm:text-sm flex items-center justify-center gap-1.5 border transition ${
              activeTab === "guide"
                ? "bg-[#facc15] text-slate-950 border-[#fef08a] shadow-[0_0_15px_rgba(250,204,21,0.4)]"
                : "bg-[#0b1c36] text-sky-200 border-sky-500/25 hover:bg-[#10274a]"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 shrink-0" />
            <span>Guide</span>
          </button>
        </div>
      </header>
      )}

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
            <button
              type="button"
              onClick={() => handleSetSyncMode("control")}
              className="shrink-0 px-2 py-0.5 rounded bg-emerald-400 text-slate-950 font-extrabold uppercase text-[10px]"
            >
              Ta över
            </button>
          </div>
        )}
        {activeTab === "match" && matchState.status === "finished" && (
          <div className="rounded-xl bg-emerald-950/80 border-2 border-[#facc15] px-3 py-2.5 flex flex-wrap items-center justify-between gap-2 shrink-0 shadow-lg">
            <div>
              <div className="font-display font-extrabold text-sm uppercase text-[#facc15]">
                Matchen slut · Värmbols FC {matchState.ourScore} – {matchState.opponentScore} {matchState.config.opponent || "Motståndare"}
              </div>
              <div className="font-mono-cm text-[11px] text-emerald-200">
                Alla tider och mål räknas in i Cupen totalt.
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {nextCupMatch ? (
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
                      <span className="text-sky-300">VFC</span>
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
                        {(["1-4-1", "2-3-1", "2-2-2", "3-2-1"] as const).map(
                          (fmt) => (
                            <option key={fmt} value={fmt}>
                              {fmt}
                            </option>
                          )
                        )}
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
                        className="absolute -translate-x-1/2 -translate-y-1/2 z-20"
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
                <div className="rounded-lg bg-[#040c1a] border border-[#facc15] px-2.5 py-1.5 flex flex-col gap-1 shrink-0">
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

                {/* Scoreboard: Värmbols FC vs Motståndare */}
                <div className="sm:col-span-4 flex items-center justify-between bg-[#040a14] border border-sky-400/25 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <div className="text-left">
                      <div className="font-display font-extrabold text-xs uppercase tracking-wider text-sky-300">
                        VÄRMBOLS FC
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
              </div>

              {/* Höger: Formationsväljare (1-4-1 default) + Vy-switch (2D Plan / CM Tabell) */}
              <div className="flex items-center gap-1.5">
                {matchState.config.format === "7v7" && (
                  <div className="flex items-center bg-[#040a14] rounded p-0.5 border border-sky-400/25">
                    {(["1-4-1", "2-3-1", "2-2-2", "3-2-1"] as const).map(
                      (fmt) => (
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
                      )
                    )}
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

                <div className="flex items-center justify-between gap-2 bg-[#166534] px-3 py-1.5 border-y border-black/30">
                  <div className="flex items-center gap-2 min-w-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/club/varmbol-logo-white.png"
                      alt=""
                      className="w-5 h-5 object-contain shrink-0"
                    />
                    <span className="font-display font-extrabold text-xs sm:text-sm uppercase tracking-wide text-white truncate">
                      Värmbols FC
                    </span>
                    <span className="font-mono-cm font-bold text-[11px] text-white/80 shrink-0">
                      {currentFormation}
                    </span>
                  </div>
                  <span className="font-mono-cm font-bold text-[11px] text-white tabular-nums shrink-0">
                    P{matchState.currentPeriod}{" "}
                    {formatDurationMmSs(periodElapsedMs)}
                  </span>
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
                      className="absolute -translate-x-1/2 -translate-y-1/2 z-20"
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
                    VÄRMBOLS IP · KATRINEHOLM
                  </span>
                  <h2 className="font-display font-extrabold text-xl sm:text-2xl uppercase text-white drop-shadow mt-1">
                    VÄRMBOLS FC POJKAR 2017 · MATCHUPPSTÄLLNING
                  </h2>
                  <p className="text-xs text-sky-100/90 mt-0.5">
                    Bocka i vilka spelare som är med idag och välj startuppställning i {draftConfig.formation}.
                  </p>
                </div>
              </div>
            </div>

            <section className="cm-bevel rounded-xl p-4 space-y-3">
              <h3 className="font-display font-extrabold text-sm uppercase tracking-wider text-[#facc15]">
                Cupplan · Söndag 25 oktober
              </h3>
              <p className="text-xs text-slate-300">10 spelare · 1–4–1 · Målvakten står hela matchen och ingår inte i bytesförslagen.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {CUP_MATCHES.map((match) => (
                  <button key={match.id} type="button" disabled={isFollowing}
                    onClick={() => handleApplyPresetEvent(match)}
                    aria-pressed={draftConfig.eventTitle === `Provcup 25 okt · ${match.title}`}
                    className={`text-left p-3 rounded-lg border disabled:opacity-50 ${draftConfig.eventTitle === `Provcup 25 okt · ${match.title}` ? "bg-[#005cb9]/40 border-[#facc15]" : "bg-[#061224] border-white/10"}`}>
                    <span className="block font-display font-extrabold text-sm text-white">{match.title}</span>
                    <span className="block mt-1 text-xs text-slate-300">{match.subtitle}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-300">Välj match, kontrollera startuppställningen och tryck Starta match längst ner. Första matchen följer skissen. I övriga matcher tar Oscar den nya målvaktens utespelarplats som förval; ändra vid behov.</p>
              <div className="border-t border-white/10 pt-3 space-y-2">
                {CUP_COACH_NOTES.map((note) => <p key={note.role} className="text-sm text-slate-200"><strong className="text-[#facc15]">{note.role}:</strong> {note.text}</p>)}
              </div>
            </section>

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
                  <div className="grid grid-cols-2 gap-1.5">
                    {(["1-4-1", "2-3-1", "2-2-2", "3-2-1"] as const).map(
                      (fmt) => (
                        <button
                          key={fmt}
                          type="button"
                          onClick={() =>
                            setDraftConfig((c) => ({
                              ...c,
                              format: "7v7",
                              formation: fmt,
                            }))
                          }
                          className={`py-1.5 rounded font-mono-cm font-extrabold text-xs border ${
                            draftConfig.formation === fmt
                              ? "bg-[#facc15] text-slate-950 border-yellow-200"
                              : "bg-[#061224] text-slate-300 border-white/10"
                          }`}
                        >
                          {fmt}
                        </button>
                      )
                    )}
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {roster.map((player) => {
                  const isStarter =
                    player.activeInSquad && setupPitchIds.includes(player.id);
                  const isGk = isStarter && setupGkId === player.id;

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
                              ? "FRÅNVARANDE"
                              : isGk
                              ? "STARTAR I MÅL (MV)"
                              : isStarter
                              ? `STARTAR · ${FORMATION_SLOTS[draftConfig.formation].find((slot) => slot.slotIndex === setupPitchIds.filter((id) => id !== setupGkId).indexOf(player.id) + 1)?.label ?? "PLAN"}`
                              : "AVBYTARE (BÄNK)"}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 flex-wrap justify-end">
                        {player.activeInSquad && (
                          <>
                            {isStarter && (
                              <select
                                aria-label={`Startposition för ${player.name}`}
                                value={
                                  isGk
                                    ? 0
                                    : setupPitchIds
                                        .filter((id) => id !== setupGkId)
                                        .indexOf(player.id) + 1
                                }
                                onChange={(e) =>
                                  handleAssignSetupSlot(
                                    player.id,
                                    Number(e.target.value)
                                  )
                                }
                                className="px-1.5 py-1 rounded bg-[#040a14] border border-emerald-400/40 font-mono-cm font-extrabold text-[10px] text-emerald-200"
                              >
                                {FORMATION_SLOTS[draftConfig.formation].map(
                                  (slot) => (
                                    <option
                                      key={slot.slotIndex}
                                      value={slot.slotIndex}
                                    >
                                      {slot.code} · {slot.label}
                                    </option>
                                  )
                                )}
                              </select>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                if (!isStarter) {
                                  handleToggleSetupStarter(player.id);
                                }
                                setSetupGkId(player.id);
                              }}
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
              <div className="cm-header-bar px-4 py-2.5 flex items-center justify-between">
                <div>
                  <h2 className="font-display font-extrabold text-base uppercase tracking-wider text-white">
                    SPELTIDSRAPPORT · VÄRMBOLS FC vs{" "}
                    {matchState.config.opponent}
                  </h2>
                  <p className="text-[11px] font-mono-cm text-sky-200">
                    BLÅ STAPEL = UTESPELARE · GUL STAPEL = MÅLVAKT
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
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
                                <PositionTime positionMs={m.positionMs} />
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
              <div className="cm-header-bar px-4 py-2.5">
                <h2 className="font-display font-extrabold text-base uppercase tracking-wider text-white">
                  Cupen totalt
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
              {cupRows.length === 0 ? (
                <p className="p-4 text-sm text-slate-300">
                  Ingen tid i cupen ännu. Avspark börjar räknas direkt, och en
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
                          <PositionTime positionMs={row.positionMs} />
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
                        Värmbols FC {sm.ourScore} – {sm.opponentScore}{" "}
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

        {activeTab === "guide" && (
          <GuideView
            soundEnabled={soundEnabled}
            onPreview={(name) => cue(name)}
          />
        )}
      </main>

      {/* ============================================================
          FLYTANDE MULTI-BYTESBALK LÄNGST NER (1, 2, 3 ELLER 4 BYTEN)
         ============================================================ */}
      {activeTab === "match" &&
        !focusMode &&
        (selectedOutIds.length > 0 || selectedInIds.length > 0) && (
          <div className="fixed bottom-0 inset-x-0 z-40 p-2.5 bg-gradient-to-t from-[#02060d] via-[#040c1a]/95 to-transparent backdrop-blur-md">
            <div className="max-w-4xl mx-auto cm-bevel rounded-xl p-3 border-2 border-[#facc15]">
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
                  {matchState.config.eventTitle || "VÄRMBOLS FC P2017"} · PERIOD {matchState.currentPeriod}
                </div>
                <h3 className="font-display font-extrabold text-xl sm:text-2xl uppercase text-white">
                  SAMLING · VÄRMBOLS FC vs {matchState.config.opponent || "MOTSTÅNDARE"}
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
                  KOM IHÅG PÅ PLANEN IDAG:
                </div>
                {CUP_COACH_NOTES.map((note) => (
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

