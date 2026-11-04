import { NextResponse } from "next/server";
import { getSuperAdminCodeDisplay, verifyRequestAuth } from "@/lib/auth";
import {
  buildInitialSnapshotForTeam,
  generateOpaqueBlobPath,
  generateTeamCode,
  getTeamRegistry,
  normalizeCode,
  saveTeamRegistry,
  slugifyTeamId,
  toPublicTeamProfile,
  VFC_P2017_TEAM_ID,
  writeTeamSnapshot,
} from "@/lib/teams";
import {
  MatchFormat,
  TacticalFormation,
  TeamColors,
  TeamRegistryEntry,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = verifyRequestAuth(request);
  if (!session || session.role !== "superadmin") {
    return NextResponse.json(
      { ok: false, error: "Kräver Superadmin-behörighet" },
      { status: 403 }
    );
  }

  const registry = await getTeamRegistry();
  return NextResponse.json(
    {
      ok: true,
      superAdminCode: getSuperAdminCodeDisplay(),
      teams: registry.teams.filter((t) => t.active),
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

export async function POST(request: Request) {
  const session = verifyRequestAuth(request);
  if (!session || session.role !== "superadmin") {
    return NextResponse.json(
      { ok: false, error: "Kräver Superadmin-behörighet" },
      { status: 403 }
    );
  }

  try {
    const body = (await request.json()) as {
      id?: string;
      clubName?: string;
      teamName?: string;
      shortName?: string;
      arenaName?: string;
      coaches?: string[] | string;
      colors?: TeamColors;
      defaultFormat?: MatchFormat;
      defaultFormation?: TacticalFormation;
      coachCode?: string;
      followCode?: string;
      initialPlayers?: string[] | string;
      regenerateCodes?: boolean;
    };

    const registry = await getTeamRegistry();

    const clubName = (body.clubName || "").trim();
    const teamName = (body.teamName || "").trim();

    if (!body.id && (!clubName || !teamName)) {
      return NextResponse.json(
        { ok: false, error: "Ange både klubbnamn och lagnamn (t.ex. P2016)" },
        { status: 400 }
      );
    }

    const coachesList: string[] = Array.isArray(body.coaches)
      ? body.coaches.map((c) => c.trim()).filter(Boolean)
      : typeof body.coaches === "string"
      ? body.coaches
          .split(/[,&\n]+/)
          .map((c) => c.trim())
          .filter(Boolean)
      : [];

    const initialPlayersList: string[] = Array.isArray(body.initialPlayers)
      ? body.initialPlayers.map((p) => p.trim()).filter(Boolean)
      : typeof body.initialPlayers === "string"
      ? body.initialPlayers
          .split(/[,\n]+/)
          .map((p) => p.trim())
          .filter(Boolean)
      : [];

    // Uppdatera befintligt lag om body.id finns i registret
    const existingIndex = body.id
      ? registry.teams.findIndex((t) => t.id === body.id)
      : -1;

    if (existingIndex !== -1) {
      const current = registry.teams[existingIndex];
      const nextClub = clubName || current.clubName;
      const nextTeam = teamName || current.teamName;
      const nextShort =
        (body.shortName || "").trim().toUpperCase() || current.shortName;

      const nextCoachCode = body.regenerateCodes
        ? generateTeamCode(nextShort)
        : body.coachCode
        ? normalizeCode(body.coachCode)
        : current.coachCode;

      const nextFollowCode = body.regenerateCodes
        ? `${nextShort}-LIVE-${nextCoachCode.slice(-2)}`
        : body.followCode !== undefined
        ? normalizeCode(body.followCode)
        : current.followCode;

      const updated: TeamRegistryEntry = {
        ...current,
        clubName: nextClub,
        teamName: nextTeam,
        displayName: `${nextClub} ${nextTeam}`.trim(),
        shortName: nextShort,
        arenaName:
          body.arenaName !== undefined
            ? body.arenaName.trim()
            : current.arenaName,
        coaches: coachesList.length > 0 ? coachesList : current.coaches,
        colors: body.colors || current.colors,
        defaultFormat: body.defaultFormat || current.defaultFormat,
        defaultFormation: body.defaultFormation || current.defaultFormation,
        coachCode: nextCoachCode,
        followCode: nextFollowCode,
        updatedAt: Date.now(),
      };

      const nextTeams = [...registry.teams];
      nextTeams[existingIndex] = updated;
      const savedReg = await saveTeamRegistry({
        ...registry,
        teams: nextTeams,
      });

      return NextResponse.json({
        ok: true,
        team: updated,
        teams: savedReg.teams.filter((t) => t.active),
      });
    }

    // Skapa helt nytt lag
    let baseSlug = slugifyTeamId(clubName, teamName);
    let uniqueId = baseSlug;
    let counter = 2;
    while (registry.teams.some((t) => t.id === uniqueId)) {
      uniqueId = `${baseSlug}-${counter}`;
      counter += 1;
    }

    const shortName =
      (body.shortName || "").trim().toUpperCase() ||
      clubName
        .split(/\s+/)
        .map((w) => w[0] || "")
        .join("")
        .toUpperCase()
        .slice(0, 4) ||
      "LAG";

    let coachCode = body.coachCode
      ? normalizeCode(body.coachCode)
      : generateTeamCode(shortName);

    while (
      registry.teams.some(
        (t) =>
          normalizeCode(t.coachCode) === coachCode ||
          normalizeCode(t.followCode) === coachCode
      )
    ) {
      coachCode = generateTeamCode(shortName);
    }

    const followCode = body.followCode
      ? normalizeCode(body.followCode)
      : `${shortName}-LIVE-${coachCode.slice(-2)}`;

    const defaultFormat: MatchFormat = body.defaultFormat || "7v7";
    const defaultFormation: TacticalFormation =
      body.defaultFormation || (defaultFormat === "7v7" ? "1-4-1" : "1-2-1");

    const isVfcClub =
      clubName.toLowerCase().includes("värmbol") ||
      clubName.toLowerCase().includes("varmbol") ||
      shortName === "VFC";

    const newEntry: TeamRegistryEntry = {
      id: uniqueId,
      clubName,
      teamName,
      displayName: `${clubName} ${teamName}`.trim(),
      shortName,
      arenaName: (body.arenaName || "").trim() || `${clubName} · Hemmaplan`,
      coaches: coachesList.length > 0 ? coachesList : ["Tränare"],
      logoUrl: isVfcClub ? "/club/varmbol-logo-white.png" : undefined,
      colors: body.colors || {
        primary: "#005cb9",
        secondary: "#facc15",
      },
      defaultFormat,
      defaultFormation,
      isDefaultVfcTeam: false,
      coachCode,
      followCode,
      blobPath: generateOpaqueBlobPath(uniqueId),
      active: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const nextRegistry = await saveTeamRegistry({
      ...registry,
      teams: [...registry.teams, newEntry],
    });

    const initialSnapshot = buildInitialSnapshotForTeam(
      newEntry,
      initialPlayersList
    );
    await writeTeamSnapshot(newEntry.id, initialSnapshot, nextRegistry);

    return NextResponse.json({
      ok: true,
      team: newEntry,
      teams: nextRegistry.teams.filter((t) => t.active),
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Kunde inte spara laget" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const session = verifyRequestAuth(request);
  if (!session || session.role !== "superadmin") {
    return NextResponse.json(
      { ok: false, error: "Kräver Superadmin-behörighet" },
      { status: 403 }
    );
  }

  const url = new URL(request.url);
  const teamId = url.searchParams.get("teamId");
  if (!teamId || teamId === VFC_P2017_TEAM_ID) {
    return NextResponse.json(
      { ok: false, error: "Huvudlaget VFC P2017 kan inte tas bort" },
      { status: 400 }
    );
  }

  const registry = await getTeamRegistry();
  const nextTeams = registry.teams.map((t) =>
    t.id === teamId ? { ...t, active: false, updatedAt: Date.now() } : t
  );
  const saved = await saveTeamRegistry({ ...registry, teams: nextTeams });

  return NextResponse.json({
    ok: true,
    teams: saved.teams.filter((t) => t.active),
  });
}

export async function PATCH(request: Request) {
  const session = verifyRequestAuth(request);
  if (!session || session.role === "follower") {
    return NextResponse.json(
      { ok: false, error: "Kräver tränarbehörighet" },
      { status: 403 }
    );
  }

  try {
    const body = (await request.json()) as {
      teamId?: string;
      clubName?: string;
      teamName?: string;
      shortName?: string;
      arenaName?: string;
      coaches?: string[] | string;
      colors?: TeamColors;
    };

    const targetTeamId =
      session.role === "superadmin"
        ? body.teamId || VFC_P2017_TEAM_ID
        : session.teamId;

    const registry = await getTeamRegistry();
    const idx = registry.teams.findIndex((t) => t.id === targetTeamId);
    if (idx === -1) {
      return NextResponse.json(
        { ok: false, error: "Laget hittades inte" },
        { status: 404 }
      );
    }

    const current = registry.teams[idx];
    const coachesList: string[] = Array.isArray(body.coaches)
      ? body.coaches.map((c) => c.trim()).filter(Boolean)
      : typeof body.coaches === "string"
      ? body.coaches
          .split(/[,&\n]+/)
          .map((c) => c.trim())
          .filter(Boolean)
      : [];

    const nextClub = (body.clubName || "").trim() || current.clubName;
    const nextTeam = (body.teamName || "").trim() || current.teamName;
    const nextShort =
      (body.shortName || "").trim().toUpperCase() || current.shortName;

    const updated: TeamRegistryEntry = {
      ...current,
      clubName: nextClub,
      teamName: nextTeam,
      displayName: `${nextClub} ${nextTeam}`.trim(),
      shortName: nextShort,
      arenaName:
        body.arenaName !== undefined
          ? body.arenaName.trim()
          : current.arenaName,
      coaches: coachesList.length > 0 ? coachesList : current.coaches,
      colors: body.colors || current.colors,
      updatedAt: Date.now(),
    };

    const nextTeams = [...registry.teams];
    nextTeams[idx] = updated;
    const saved = await saveTeamRegistry({ ...registry, teams: nextTeams });

    return NextResponse.json({
      ok: true,
      team: toPublicTeamProfile(updated),
      ...(session.role === "superadmin"
        ? { allTeams: saved.teams.filter((t) => t.active) }
        : {}),
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Kunde inte uppdatera lagprofil" },
      { status: 500 }
    );
  }
}

