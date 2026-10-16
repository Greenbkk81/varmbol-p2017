import { list, put } from "@vercel/blob";
import { NextResponse } from "next/server";
import type { MatchState, RosterPlayer, SavedMatchSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

const BLOB_PATH = "varmbol-p2017/live-state-v1.json";

export interface LiveSyncSnapshot {
  version: number;
  updatedAt: number;
  controllerId: string;
  controllerLabel?: string;
  roster: RosterPlayer[];
  matchState: MatchState;
  savedMatches: SavedMatchSummary[];
}

declare global {
  var __varmbolLiveSyncMemory: LiveSyncSnapshot | null | undefined;
}

function hasBlobToken() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function readSnapshot(): Promise<LiveSyncSnapshot | null> {
  if (!hasBlobToken()) {
    return globalThis.__varmbolLiveSyncMemory ?? null;
  }
  try {
    const { blobs } = await list({ prefix: BLOB_PATH, limit: 5 });
    const exact =
      blobs.find((item) => item.pathname === BLOB_PATH) ?? blobs[0];
    if (!exact) return null;
    const res = await fetch(`${exact.url}?t=${Date.now()}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as LiveSyncSnapshot;
  } catch {
    return globalThis.__varmbolLiveSyncMemory ?? null;
  }
}

async function writeSnapshot(snapshot: LiveSyncSnapshot): Promise<"blob" | "memory"> {
  globalThis.__varmbolLiveSyncMemory = snapshot;
  if (!hasBlobToken()) {
    return "memory";
  }
  await put(BLOB_PATH, JSON.stringify(snapshot), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 0,
    contentType: "application/json",
  });
  return "blob";
}

export async function GET() {
  const snapshot = await readSnapshot();
  return NextResponse.json(
    {
      ok: true,
      storage: hasBlobToken() ? "blob" : "memory",
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
  try {
    const body = (await request.json()) as Partial<LiveSyncSnapshot>;
    if (!body?.matchState || !Array.isArray(body.roster)) {
      return NextResponse.json(
        { ok: false, error: "Ogiltigt matchdata" },
        { status: 400 }
      );
    }

    const current = await readSnapshot();
    const version = (current?.version ?? 0) + 1;
    const snapshot: LiveSyncSnapshot = {
      version,
      updatedAt: Date.now(),
      controllerId: body.controllerId || "unknown",
      controllerLabel: body.controllerLabel,
      roster: body.roster,
      matchState: body.matchState,
      savedMatches: Array.isArray(body.savedMatches) ? body.savedMatches : [],
    };

    const storage = await writeSnapshot(snapshot);
    return NextResponse.json(
      {
        ok: true,
        storage,
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
