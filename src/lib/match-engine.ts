import { FORMATION_SLOTS } from "./default-roster";
import {
  ComputedPlayerMetrics,
  GoalRecord,
  MatchConfig,
  MatchFormat,
  MatchPlayerState,
  MatchSnapshot,
  MatchState,
  RosterPlayer,
} from "./types";

export function pitchPositionCode(
  state: MatchState,
  player: MatchPlayerState
): string | null {
  if (!player.onPitch) return null;
  const slots =
    FORMATION_SLOTS[state.config.formation] || FORMATION_SLOTS["1-4-1"];
  const slot = player.pitchSlotIndex ?? (player.isGoalkeeper ? 0 : 1);
  return (
    slots.find((s) => s.slotIndex === slot)?.code ??
    (player.isGoalkeeper ? "MV" : null)
  );
}

function addPositionTime(
  player: MatchPlayerState,
  code: string | null,
  delta: number
): MatchPlayerState {
  if (!code || delta <= 0) return player;
  const positionMs = { ...(player.positionMs ?? {}) };
  positionMs[code] = (positionMs[code] ?? 0) + delta;
  return { ...player, positionMs };
}

export const STINT_MINUTE_CHOICES = [4, 5, 6, 7] as const;
export type StintMinutes = (typeof STINT_MINUTE_CHOICES)[number];

export function resolveStintMinutes(config: {
  stintMinutes?: number;
}): StintMinutes {
  const value = config.stintMinutes;
  if (value === 4 || value === 5 || value === 6 || value === 7) return value;
  return 5;
}

export function getPitchCapacity(format: MatchFormat): number {
  return format === "7v7" ? 7 : 5;
}

export function getCurrentPeriodElapsedMs(
  state: MatchState,
  now: number
): number {
  if (state.status === "running" && state.lastTickTimestamp !== null) {
    const delta = Math.max(0, now - state.lastTickTimestamp);
    return state.periodElapsedMs + delta;
  }
  return state.periodElapsedMs;
}

export function getTotalMatchElapsedMs(state: MatchState, now: number): number {
  const completedPeriodsMs =
    Math.max(0, state.currentPeriod - 1) *
    state.config.periodMinutes *
    60 *
    1000;
  return completedPeriodsMs + getCurrentPeriodElapsedMs(state, now);
}

/**
 * Fryser in den rullande tiden i varje spelares ackumulerade räknare fram till `now`.
 */
export function commitRunningTime(
  state: MatchState,
  now: number
): MatchState {
  if (state.status !== "running" || state.lastTickTimestamp === null) {
    return state;
  }
  const delta = Math.max(0, now - state.lastTickTimestamp);
  if (delta === 0) return state;

  const updatedPlayers = state.players.map((p) => {
    if (p.onPitch) {
      const timed = p.isGoalkeeper
        ? {
            ...p,
            accumulatedGoalkeeperMs: p.accumulatedGoalkeeperMs + delta,
          }
        : {
            ...p,
            accumulatedOutfieldMs: p.accumulatedOutfieldMs + delta,
          };
      return addPositionTime(timed, pitchPositionCode(state, p), delta);
    }
    return {
      ...p,
      accumulatedBenchMs: p.accumulatedBenchMs + delta,
    };
  });

  return {
    ...state,
    periodElapsedMs: state.periodElapsedMs + delta,
    lastTickTimestamp: now,
    players: updatedPlayers,
  };
}

export function createSnapshot(
  state: MatchState,
  label: string,
  now: number = Date.now()
): MatchSnapshot {
  const synced = commitRunningTime(state, now);
  return {
    label,
    status: synced.status,
    currentPeriod: synced.currentPeriod,
    periodElapsedMs: synced.periodElapsedMs,
    lastTickTimestamp: synced.lastTickTimestamp,
    players: synced.players.map((p) => ({
      ...p,
      gkPeriods: [...p.gkPeriods],
      positionMs: { ...(p.positionMs ?? {}) },
    })),
    logs: synced.logs.map((l) => ({ ...l })),
    ourScore: synced.ourScore,
    opponentScore: synced.opponentScore,
    goals: (synced.goals ?? []).map((goal) => ({ ...goal })),
  };
}

export function pushUndoSnapshot(
  state: MatchState,
  label: string,
  now: number = Date.now()
): MatchState {
  const snap = createSnapshot(state, label, now);
  const nextStack = [snap, ...state.undoStack].slice(0, 15);
  return {
    ...state,
    undoStack: nextStack,
  };
}

export function undoLastAction(state: MatchState, now: number): MatchState {
  if (state.undoStack.length === 0) return state;
  const [latest, ...rest] = state.undoStack;
  return {
    ...state,
    status: latest.status,
    currentPeriod: latest.currentPeriod,
    periodElapsedMs: latest.periodElapsedMs,
    lastTickTimestamp: latest.status === "running" ? now : null,
    players: latest.players,
    logs: latest.logs,
    ourScore: latest.ourScore,
    opponentScore: latest.opponentScore,
    goals: (latest.goals ?? []).map((goal) => ({ ...goal })),
    undoStack: rest,
  };
}

export function normalizePitchSlots(
  players: MatchPlayerState[],
  capacity: number
): MatchPlayerState[] {
  const onPitch = players.filter((p) => p.onPitch);
  const gk = onPitch.find((p) => p.isGoalkeeper) ?? onPitch[0];

  const usedSlots = new Set<number>();
  if (gk) usedSlots.add(0);

  const slotMap = new Map<string, number>();
  if (gk) slotMap.set(gk.id, 0);

  // Behåll befintliga giltiga slots 1..(capacity-1)
  for (const p of onPitch) {
    if (gk && p.id === gk.id) continue;
    if (
      typeof p.pitchSlotIndex === "number" &&
      p.pitchSlotIndex >= 1 &&
      p.pitchSlotIndex < capacity &&
      !usedSlots.has(p.pitchSlotIndex)
    ) {
      usedSlots.add(p.pitchSlotIndex);
      slotMap.set(p.id, p.pitchSlotIndex);
    }
  }

  // Tilldela lediga slots till resten av utespelarna på plan
  let nextSlot = 1;
  for (const p of onPitch) {
    if (slotMap.has(p.id)) continue;
    while (usedSlots.has(nextSlot) && nextSlot < capacity) {
      nextSlot++;
    }
    slotMap.set(p.id, nextSlot);
    usedSlots.add(nextSlot);
  }

  return players.map((p) => {
    if (!p.onPitch) {
      return { ...p, pitchSlotIndex: undefined, isGoalkeeper: false };
    }
    const slot = slotMap.get(p.id) ?? 1;
    return {
      ...p,
      pitchSlotIndex: slot,
      isGoalkeeper: slot === 0,
    };
  });
}

export function createInitialMatchState(
  roster: RosterPlayer[],
  config: MatchConfig,
  startingPitchIds?: string[],
  startingGkId?: string
): MatchState {
  const activeRoster = roster.filter((r) => r.activeInSquad);
  const capacity = getPitchCapacity(config.format);

  const pitchSet = new Set<string>(
    startingPitchIds && startingPitchIds.length > 0
      ? startingPitchIds.slice(0, capacity)
      : activeRoster.slice(0, capacity).map((p) => p.id)
  );

  let gkId = startingGkId;
  if (!gkId || !pitchSet.has(gkId)) {
    const firstOnPitch = activeRoster.find((p) => pitchSet.has(p.id));
    gkId = firstOnPitch?.id;
  }

  // Startlistans ordning är positionsordningen, oavsett truppens sortering.
  const outfieldIds = [...pitchSet].filter(
    (id) => id !== gkId && activeRoster.some((player) => player.id === id)
  );
  const rawPlayers: MatchPlayerState[] = activeRoster.map((r) => {
    const onPitch = pitchSet.has(r.id);
    const isGoalkeeper = onPitch && r.id === gkId;
    const pitchSlotIndex = onPitch
      ? isGoalkeeper
        ? 0
        : outfieldIds.indexOf(r.id) + 1
      : undefined;

    return {
      id: r.id,
      name: r.name,
      number: r.number,
      avatarUrl: r.avatarUrl,
      onPitch,
      isGoalkeeper,
      pitchSlotIndex,
      accumulatedOutfieldMs: 0,
      accumulatedGoalkeeperMs: 0,
      accumulatedBenchMs: 0,
      currentStintStartMatchMs: 0,
      stintsCount: onPitch ? 1 : 0,
      gkPeriods: isGoalkeeper ? [1] : [],
    };
  });

  return {
    id: `match-${Date.now()}`,
    createdAt: Date.now(),
    config,
    status: "paused",
    currentPeriod: 1,
    periodElapsedMs: 0,
    lastTickTimestamp: null,
    players: normalizePitchSlots(rawPlayers, capacity),
    logs: [],
    ourScore: 0,
    opponentScore: 0,
    goals: [],
    undoStack: [],
  };
}

export function computePlayerMetrics(
  state: MatchState,
  now: number
): ComputedPlayerMetrics[] {
  const runningDelta =
    state.status === "running" && state.lastTickTimestamp !== null
      ? Math.max(0, now - state.lastTickTimestamp)
      : 0;

  const totalMatchMs = getTotalMatchElapsedMs(state, now);
  const totalSquad = state.players.length || 1;

  const rawMetrics = state.players.map((p) => {
    const outfieldMs =
      p.accumulatedOutfieldMs +
      (p.onPitch && !p.isGoalkeeper ? runningDelta : 0);
    const goalkeeperMs =
      p.accumulatedGoalkeeperMs +
      (p.onPitch && p.isGoalkeeper ? runningDelta : 0);
    const totalPlayMs = outfieldMs + goalkeeperMs;
    const benchMs = p.accumulatedBenchMs + (!p.onPitch ? runningDelta : 0);
    const positionMs: Record<string, number> = { ...(p.positionMs ?? {}) };
    if (p.onPitch && runningDelta > 0) {
      const code = pitchPositionCode(state, p);
      if (code) positionMs[code] = (positionMs[code] ?? 0) + runningDelta;
    }
    const currentStintMs = Math.max(
      0,
      totalMatchMs - p.currentStintStartMatchMs
    );
    const fairnessMs = state.config.countGoalkeeperInFairness
      ? totalPlayMs
      : outfieldMs;

    // Kondition ska fortfarande röra sig efter en lång period.
    // 5 min ute ≈ 89, 15 min ute ≈ 62. Golvet 35 nås först efter en riktigt lång stint.
    let conditionPct = 100;
    if (p.onPitch) {
      const stintMinutesPlayed = currentStintMs / 60_000;
      const totalOutfieldMinutes = outfieldMs / 60_000;
      const drain = p.isGoalkeeper
        ? stintMinutesPlayed * 0.7
        : stintMinutesPlayed * 2.2 + totalOutfieldMinutes * 0.35;
      conditionPct = Math.max(
        p.isGoalkeeper ? 55 : 35,
        Math.min(100, Math.round(100 - drain))
      );
    } else {
      const restMinutes = currentStintMs / 60_000;
      const prevFatigue = Math.min(28, (outfieldMs / 60_000) * 1.1);
      const recovered = Math.min(prevFatigue, restMinutes * 5.5);
      conditionPct = Math.max(
        65,
        Math.min(100, Math.round(100 - prevFatigue + recovered))
      );
    }

    return {
      player: p,
      outfieldMs,
      goalkeeperMs,
      totalPlayMs,
      benchMs,
      currentStintMs,
      conditionPct,
      fairnessMs,
      positionMs,
    };
  });

  const avgFairnessMs =
    rawMetrics.reduce((acc, m) => acc + m.fairnessMs, 0) / totalSquad;

  const thresholdMs = Math.max(45_000, Math.min(120_000, totalMatchMs * 0.14));

  return rawMetrics.map((m) => {
    const delta = m.fairnessMs - avgFairnessMs;
    let fairnessStatus: "under" | "balanced" | "over" = "balanced";
    if (totalMatchMs > 25_000) {
      if (delta < -thresholdMs) fairnessStatus = "under";
      else if (delta > thresholdMs) fairnessStatus = "over";
    }

    const stintLimitMs = resolveStintMinutes(state.config) * 60 * 1000;
    const stintAlert = m.player.isGoalkeeper
      ? false
      : m.currentStintMs >= stintLimitMs;

    return {
      ...m,
      targetFairnessMs: avgFairnessMs,
      fairnessDeltaMs: delta,
      fairnessStatus,
      stintAlert,
    };
  });
}

export function suggestSubstitutions(
  state: MatchState,
  now: number,
  desiredCount?: number
): {
  outIds: string[];
  inIds: string[];
  reason: string;
} {
  const metrics = computePlayerMetrics(state, now);
  const outfieldOnPitch = metrics
    .filter((m) => m.player.onPitch && !m.player.isGoalkeeper)
    .sort((a, b) => {
      const scoreA = a.fairnessMs * 0.7 + a.currentStintMs * 0.3;
      const scoreB = b.fairnessMs * 0.7 + b.currentStintMs * 0.3;
      return scoreB - scoreA;
    });

  const onBench = metrics
    .filter((m) => !m.player.onPitch && !m.player.resting)
    .sort((a, b) => {
      const scoreA = a.fairnessMs * 0.75 - a.currentStintMs * 0.25;
      const scoreB = b.fairnessMs * 0.75 - b.currentStintMs * 0.25;
      return scoreA - scoreB;
    });

  const maxPossible = Math.min(outfieldOnPitch.length, onBench.length);
  if (maxPossible === 0) {
    return { outIds: [], inIds: [], reason: "Inga tillgängliga avbytare på bänken" };
  }

  const count = Math.min(
    maxPossible,
    desiredCount ?? (onBench.length >= 2 ? 2 : 1)
  );

  const outPlayers = outfieldOnPitch.slice(0, count);
  const inPlayers = onBench.slice(0, count);

  const pairsText = outPlayers
    .map((outP, i) => `${inPlayers[i]?.player.name} ⇄ ${outP.player.name}`)
    .join(" · ");

  return {
    outIds: outPlayers.map((p) => p.player.id),
    inIds: inPlayers.map((p) => p.player.id),
    reason: pairsText,
  };
}

/**
 * Genomför 1, 2, 3 eller 4+ byten samtidigt och låter inbytta spelare ärva exakt samma
 * positioner i 1-4-1-uppställningen som de utbytta spelarna hade.
 */
export function executeMultiSubstitution(
  state: MatchState,
  outIds: string[],
  inIds: string[],
  now: number
): MatchState {
  if (outIds.length === 0 || outIds.length !== inIds.length) {
    return state;
  }

  const withSnap = pushUndoSnapshot(
    state,
    `Byte (${outIds.length} mot ${inIds.length})`,
    now
  );
  const committed = commitRunningTime(withSnap, now);
  const totalMatchMs = getTotalMatchElapsedMs(committed, now);
  const isPreKickoff =
    totalMatchMs === 0 &&
    committed.currentPeriod === 1 &&
    committed.status === "paused";
  const capacity = getPitchCapacity(committed.config.format);

  // Para ihop varje inbytt spelare med den utbytta spelarens pitchSlotIndex
  const slotTransfer = new Map<string, { slot: number; wasGk: boolean }>();
  outIds.forEach((outId, idx) => {
    const outPlayer = committed.players.find((p) => p.id === outId);
    const inId = inIds[idx];
    if (outPlayer && inId) {
      slotTransfer.set(inId, {
        slot: outPlayer.pitchSlotIndex ?? idx + 1,
        wasGk: outPlayer.isGoalkeeper,
      });
    }
  });

  const outSet = new Set(outIds);
  const inSet = new Set(inIds);

  const playersOutInfo = committed.players
    .filter((p) => outSet.has(p.id))
    .map((p) => ({ id: p.id, name: p.name }));
  const playersInInfo = committed.players
    .filter((p) => inSet.has(p.id))
    .map((p) => ({ id: p.id, name: p.name }));

  const updatedPlayers = committed.players.map((p) => {
    if (outSet.has(p.id)) {
      return {
        ...p,
        onPitch: false,
        isGoalkeeper: false,
        pitchSlotIndex: undefined,
        currentStintStartMatchMs: totalMatchMs,
        stintsCount: isPreKickoff ? 0 : p.stintsCount,
        gkPeriods: isPreKickoff ? [] : p.gkPeriods,
      };
    }
    if (inSet.has(p.id)) {
      const transfer = slotTransfer.get(p.id);
      const becomesGk = transfer?.wasGk ?? false;
      const gkPeriods =
        becomesGk && !p.gkPeriods.includes(committed.currentPeriod)
          ? [...p.gkPeriods, committed.currentPeriod]
          : p.gkPeriods;
      return {
        ...p,
        onPitch: true,
        resting: false,
        isGoalkeeper: becomesGk,
        pitchSlotIndex: transfer?.slot ?? 1,
        currentStintStartMatchMs: totalMatchMs,
        stintsCount: isPreKickoff ? 1 : p.stintsCount + 1,
        gkPeriods,
      };
    }
    return p;
  });

  if (isPreKickoff) {
    return {
      ...committed,
      players: normalizePitchSlots(updatedPlayers, capacity),
    };
  }

  const newLog = {
    id: `log-${now}-${Math.random().toString(36).slice(2, 6)}`,
    period: committed.currentPeriod,
    matchTimeMs: committed.periodElapsedMs,
    timestamp: now,
    type: "sub" as const,
    playersOut: playersOutInfo,
    playersIn: playersInInfo,
  };

  return {
    ...committed,
    players: normalizePitchSlots(updatedPlayers, capacity),
    logs: [newLog, ...committed.logs],
  };
}

/**
 * Byter plats på två spelare som redan är inne på planen (t.ex. i 1-4-1).
 * Om en av dem är målvakt (slot 0) tar den andra över målvaktskragen!
 */
export function swapPitchPositions(
  state: MatchState,
  playerAId: string,
  playerBId: string,
  now: number
): MatchState {
  if (playerAId === playerBId) return state;
  const playerA = state.players.find((p) => p.id === playerAId);
  const playerB = state.players.find((p) => p.id === playerBId);
  if (!playerA || !playerB || !playerA.onPitch || !playerB.onPitch) {
    return state;
  }

  const withSnap = pushUndoSnapshot(
    state,
    `Positionsbyte ${playerA.name} ⇄ ${playerB.name}`,
    now
  );
  const committed = commitRunningTime(withSnap, now);

  const slotA = playerA.pitchSlotIndex ?? 1;
  const slotB = playerB.pitchSlotIndex ?? 2;
  const aBecomesGk = slotB === 0;
  const bBecomesGk = slotA === 0;

  const updatedPlayers = committed.players.map((p) => {
    if (p.id === playerAId) {
      return {
        ...p,
        pitchSlotIndex: slotB,
        isGoalkeeper: aBecomesGk,
        gkPeriods:
          aBecomesGk && !p.gkPeriods.includes(committed.currentPeriod)
            ? [...p.gkPeriods, committed.currentPeriod]
            : p.gkPeriods,
      };
    }
    if (p.id === playerBId) {
      return {
        ...p,
        pitchSlotIndex: slotA,
        isGoalkeeper: bBecomesGk,
        gkPeriods:
          bBecomesGk && !p.gkPeriods.includes(committed.currentPeriod)
            ? [...p.gkPeriods, committed.currentPeriod]
            : p.gkPeriods,
      };
    }
    return p;
  });

  return {
    ...committed,
    players: updatedPlayers,
  };
}

export function assignGoalkeeperCollar(
  state: MatchState,
  targetPlayerId: string,
  now: number,
  swapIfOnBench = true
): MatchState {
  const target = state.players.find((p) => p.id === targetPlayerId);
  if (!target || target.isGoalkeeper) return state;

  const withSnap = pushUndoSnapshot(state, `Ny målvakt: ${target.name}`, now);
  const committed = commitRunningTime(withSnap, now);
  const totalMatchMs = getTotalMatchElapsedMs(committed, now);
  const capacity = getPitchCapacity(committed.config.format);
  const currentGk = committed.players.find((p) => p.isGoalkeeper);
  const targetOldSlot = target.pitchSlotIndex ?? 1;

  const updatedPlayers = committed.players.map((p) => {
    if (p.id === targetPlayerId) {
      const gkPeriods = p.gkPeriods.includes(committed.currentPeriod)
        ? p.gkPeriods
        : [...p.gkPeriods, committed.currentPeriod];
      return {
        ...p,
        onPitch: true,
        isGoalkeeper: true,
        pitchSlotIndex: 0,
        currentStintStartMatchMs: !p.onPitch
          ? totalMatchMs
          : p.currentStintStartMatchMs,
        stintsCount: !p.onPitch ? p.stintsCount + 1 : p.stintsCount,
        gkPeriods,
      };
    }
    if (currentGk && p.id === currentGk.id) {
      const goesToBench = !target.onPitch && swapIfOnBench;
      return {
        ...p,
        onPitch: !goesToBench,
        isGoalkeeper: false,
        pitchSlotIndex: goesToBench ? undefined : targetOldSlot,
        currentStintStartMatchMs: goesToBench
          ? totalMatchMs
          : p.currentStintStartMatchMs,
      };
    }
    return p;
  });

  const newLog = {
    id: `log-gk-${now}`,
    period: committed.currentPeriod,
    matchTimeMs: committed.periodElapsedMs,
    timestamp: now,
    type: "gk_change" as const,
    playersOut: currentGk ? [{ id: currentGk.id, name: currentGk.name }] : [],
    playersIn: [{ id: target.id, name: target.name }],
    note: !target.onPitch
      ? `${target.name} byttes in i mål (MV)`
      : `${target.name} tog över målvaktskragen (MV)`,
  };

  return {
    ...committed,
    players: normalizePitchSlots(updatedPlayers, capacity),
    logs: [newLog, ...committed.logs],
  };
}

export function addOurGoal(
  state: MatchState,
  now: number,
  goalId: string
): MatchState {
  const committed = commitRunningTime(state, now);
  const withUndo = pushUndoSnapshot(committed, "Mål");
  const goal: GoalRecord = {
    id: goalId,
    side: "ours",
    period: withUndo.currentPeriod,
    matchTimeMs: getTotalMatchElapsedMs(withUndo, now),
  };
  return {
    ...withUndo,
    ourScore: withUndo.ourScore + 1,
    goals: [...(withUndo.goals ?? []), goal],
  };
}

export function addOpponentGoal(state: MatchState, now: number): MatchState {
  const committed = commitRunningTime(state, now);
  const withUndo = pushUndoSnapshot(committed, "Baklängesmål", now);
  const goal: GoalRecord = {
    id: `goal-${now}-${Math.random().toString(36).slice(2, 6)}`,
    side: "theirs",
    period: withUndo.currentPeriod,
    matchTimeMs: getTotalMatchElapsedMs(withUndo, now),
    assistResolved: true,
  };
  return {
    ...withUndo,
    opponentScore: withUndo.opponentScore + 1,
    goals: [...(withUndo.goals ?? []), goal],
  };
}

export function stampGoalPlayer(
  state: MatchState,
  goalId: string,
  role: "scorer" | "assist",
  player: { id: string; name: string; position: string | null }
): MatchState {
  return {
    ...state,
    goals: (state.goals ?? []).map((goal) => {
      if (goal.id !== goalId) return goal;
      if (role === "scorer") {
        return {
          ...goal,
          scorerId: player.id,
          scorerName: player.name,
          scorerPosition: player.position ?? undefined,
        };
      }
      return {
        ...goal,
        assistId: player.id,
        assistName: player.name,
        assistPosition: player.position ?? undefined,
        assistResolved: true,
      };
    }),
  };
}

export function markGoalAssistDone(
  state: MatchState,
  goalId: string | undefined
): MatchState {
  if (!goalId) return state;
  return {
    ...state,
    goals: (state.goals ?? []).map((goal) =>
      goal.id === goalId ? { ...goal, assistResolved: true } : goal
    ),
  };
}

export function removeLastGoal(
  state: MatchState,
  side: "ours" | "theirs"
): MatchState {
  const goals = state.goals ?? [];
  let index = -1;
  for (let i = goals.length - 1; i >= 0; i--) {
    if (goals[i].side === side) {
      index = i;
      break;
    }
  }
  const nextGoals = index === -1 ? goals : goals.filter((_, i) => i !== index);
  if (side === "ours") {
    return {
      ...state,
      ourScore: Math.max(0, state.ourScore - 1),
      goals: nextGoals,
    };
  }
  return {
    ...state,
    opponentScore: Math.max(0, state.opponentScore - 1),
    goals: nextGoals,
  };
}

export function formatDurationMmSs(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

