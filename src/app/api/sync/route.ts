import { NextResponse } from "next/server";
import { verifyRequestAuth } from "@/lib/auth";
import {
  getTeamRegistry,
  hasBlobToken,
  readTeamSnapshot,
  toPublicTeamProfile,
  VFC_P2017_TEAM_ID,
  writeTeamSnapshot,
} from "@/lib/teams";
import type { LiveSyncSnapshot } from "@/lib/types";

export const dynamic = "force-dynamic";

export type { LiveSyncSnapshot };

export async function GET(request: Request) {
  const session = verifyRequestAuth(request);
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "Ej inloggad" },
      { status: 401, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  const url = new URL(request.url);
  const requestedTeamId = url.searchParams.get("teamId");
  const targetTeamId =
    session.role === "superadmin"
      ? requestedTeamId || VFC_P2017_TEAM_ID
      : session.teamId;

  const registry = await getTeamRegistry();
  const snapshot = await readTeamSnapshot(targetTeamId, registry);

  return NextResponse.json(
    {
      ok: true,
      storage: hasBlobToken() ? "blob" : "memory",
      teamId: targetTeamId,
      snapshot,
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}

export async function POST(request: Request) {
  const session = verifyRequestAuth(request);
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "Ej inloggad" },
      { status: 401, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  if (session.role === "follower") {
    return NextResponse.json(
      {
        ok: false,
        error: "Följ-läge är skrivskyddat. Logga in med tränarkod för att styra.",
      },
      { status: 403, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  try {
    const body = (await request.json()) as Partial<LiveSyncSnapshot> & {
      force?: boolean;
      teamId?: string;
    };
    if (!body?.matchState || !Array.isArray(body.roster)) {
      return NextResponse.json(
        { ok: false, error: "Ogiltigt matchdata" },
        { status: 400 }
      );
    }

    const url = new URL(request.url);
    const requestedTeamId = body.teamId || url.searchParams.get("teamId");
    const targetTeamId =
      session.role === "superadmin"
        ? requestedTeamId || VFC_P2017_TEAM_ID
        : session.teamId;

    const registry = await getTeamRegistry();
    const teamEntry = registry.teams.find((t) => t.id === targetTeamId);
    if (!teamEntry || !teamEntry.active) {
      return NextResponse.json(
        { ok: false, error: "Laget hittades inte" },
        { status: 404 }
      );
    }

    const current = await readTeamSnapshot(targetTeamId, registry);
    const isDifferentDevice =
      current &&
      current.controllerId &&
      current.controllerId !== "seed" &&
      body.controllerId &&
      current.controllerId !== body.controllerId;

    const currentIsActive =
      current &&
      (current.matchState.status === "running" ||
        current.matchState.periodElapsedMs > 0 ||
        current.matchState.currentPeriod > 1);

    const incomingIsFreshUnstarted =
      body.matchState.status === "paused" &&
      body.matchState.currentPeriod === 1 &&
      body.matchState.periodElapsedMs === 0 &&
      (body.matchState.logs?.length ?? 0) === 0;

    if (
      !body.force &&
      isDifferentDevice &&
      currentIsActive &&
      incomingIsFreshUnstarted
    ) {
      return NextResponse.json(
        {
          ok: true,
          ignored: true,
          storage: hasBlobToken() ? "blob" : "memory",
          version: current.version,
          updatedAt: current.updatedAt,
          snapshot: current,
        },
        {
          headers: {
            "Cache-Control": "no-store, max-age=0",
          },
        }
      );
    }

    const incomingSaved = Array.isArray(body.savedMatches)
      ? body.savedMatches
      : [];
    // Skydda tidigare sparade cupmatcher från att raderas av misstag av en telefon med tom historik
    const mergedSavedMatches =
      !body.force &&
      current &&
      Array.isArray(current.savedMatches) &&
      current.savedMatches.length > incomingSaved.length
        ? [
            ...incomingSaved,
            ...current.savedMatches.filter(
              (oldMatch) => !incomingSaved.some((m) => m.id === oldMatch.id)
            ),
          ]
        : incomingSaved;

    const version = (current?.version ?? 0) + 1;
    const snapshot: LiveSyncSnapshot = {
      version,
      updatedAt: Date.now(),
      teamId: targetTeamId,
      teamProfile: toPublicTeamProfile(teamEntry),
      controllerId: body.controllerId || "unknown",
      controllerLabel: body.controllerLabel,
      roster: body.roster,
      matchState: body.matchState,
      savedMatches: mergedSavedMatches,
    };

    const storage = await writeTeamSnapshot(targetTeamId, snapshot, registry);
    return NextResponse.json(
      {
        ok: true,
        storage,
        teamId: targetTeamId,
        version: snapshot.version,
        updatedAt: snapshot.updatedAt,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "Kunde inte spara live-läge" },
      { status: 500 }
    );
  }
}
