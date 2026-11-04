import { NextResponse } from "next/server";
import {
  buildLogoutCookieHeader,
  buildSessionCookieHeader,
  clearFailedAttempts,
  createSessionToken,
  getClientIp,
  isRateLimited,
  isSuperAdminCode,
  recordFailedAttempt,
  verifyRequestAuth,
} from "@/lib/auth";
import {
  buildDefaultVfcEntry,
  getTeamRegistry,
  normalizeCode,
  readTeamSnapshot,
  toPublicTeamProfile,
  VFC_P2017_TEAM_ID,
} from "@/lib/teams";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = verifyRequestAuth(request);
  if (!session) {
    return NextResponse.json(
      { ok: true, authenticated: false },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  const registry = await getTeamRegistry();
  const url = new URL(request.url);
  const requestedTeamId = url.searchParams.get("teamId");

  let activeTeamId =
    session.role === "superadmin"
      ? requestedTeamId || VFC_P2017_TEAM_ID
      : session.teamId;

  let entry = registry.teams.find((t) => t.id === activeTeamId && t.active);
  if (!entry && session.role === "superadmin") {
    entry =
      registry.teams.find((t) => t.id === VFC_P2017_TEAM_ID) ??
      registry.teams[0] ??
      buildDefaultVfcEntry();
    activeTeamId = entry.id;
  }

  if (!entry) {
    return NextResponse.json(
      {
        ok: true,
        authenticated: false,
        error: "Laget hittades inte eller är inaktiverat",
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
          "Set-Cookie": buildLogoutCookieHeader(),
        },
      }
    );
  }

  const snapshot = await readTeamSnapshot(entry.id, registry);

  return NextResponse.json(
    {
      ok: true,
      authenticated: true,
      role: session.role,
      team: toPublicTeamProfile(entry),
      snapshot,
      ...(session.role === "superadmin"
        ? {
            allTeams: registry.teams.filter((t) => t.active),
          }
        : {}),
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  if (isRateLimited(ip)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "För många misslyckade försök. Vänta några minuter och prova igen.",
      },
      { status: 429 }
    );
  }

  try {
    const body = (await request.json()) as {
      code?: string;
      teamId?: string;
    };
    const code = normalizeCode(body?.code);
    if (!code) {
      return NextResponse.json(
        { ok: false, error: "Ange en lagkod" },
        { status: 400 }
      );
    }

    const registry = await getTeamRegistry();

    // 1. Kolla om det är Superadmin-koden
    if (isSuperAdminCode(code)) {
      clearFailedAttempts(ip);
      const token = createSessionToken("superadmin", "*");
      const targetTeamId = body?.teamId || VFC_P2017_TEAM_ID;
      const entry =
        registry.teams.find((t) => t.id === targetTeamId) ??
        registry.teams.find((t) => t.id === VFC_P2017_TEAM_ID) ??
        buildDefaultVfcEntry();
      const snapshot = await readTeamSnapshot(entry.id, registry);

      return NextResponse.json(
        {
          ok: true,
          authenticated: true,
          token,
          role: "superadmin",
          team: toPublicTeamProfile(entry),
          snapshot,
          allTeams: registry.teams.filter((t) => t.active),
        },
        {
          headers: {
            "Cache-Control": "no-store, max-age=0",
            "Set-Cookie": buildSessionCookieHeader(token),
          },
        }
      );
    }

    // 2. Kolla om det är en Tränarkod (coachCode)
    const coachTeam = registry.teams.find(
      (t) => t.active && normalizeCode(t.coachCode) === code
    );
    if (coachTeam) {
      clearFailedAttempts(ip);
      const token = createSessionToken("coach", coachTeam.id);
      const snapshot = await readTeamSnapshot(coachTeam.id, registry);

      return NextResponse.json(
        {
          ok: true,
          authenticated: true,
          token,
          role: "coach",
          team: toPublicTeamProfile(coachTeam),
          snapshot,
        },
        {
          headers: {
            "Cache-Control": "no-store, max-age=0",
            "Set-Cookie": buildSessionCookieHeader(token),
          },
        }
      );
    }

    // 3. Kolla om det är en Följkod (followCode)
    const followTeam = registry.teams.find(
      (t) =>
        t.active &&
        t.followCode &&
        normalizeCode(t.followCode) === code
    );
    if (followTeam) {
      clearFailedAttempts(ip);
      const token = createSessionToken("follower", followTeam.id);
      const snapshot = await readTeamSnapshot(followTeam.id, registry);

      return NextResponse.json(
        {
          ok: true,
          authenticated: true,
          token,
          role: "follower",
          team: toPublicTeamProfile(followTeam),
          snapshot,
        },
        {
          headers: {
            "Cache-Control": "no-store, max-age=0",
            "Set-Cookie": buildSessionCookieHeader(token),
          },
        }
      );
    }

    recordFailedAttempt(ip);
    return NextResponse.json(
      {
        ok: false,
        error: "Felaktig lagkod. Kontrollera koden i WhatsApp-inbjudan.",
      },
      { status: 401 }
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "Kunde inte verifiera lagkod" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  return NextResponse.json(
    { ok: true },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Set-Cookie": buildLogoutCookieHeader(),
      },
    }
  );
}
