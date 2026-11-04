"use client";

import React, { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, Lock, Shield, Sparkles, Users } from "lucide-react";
import {
  AuthRole,
  LiveSyncSnapshot,
  TeamProfile,
  TeamRegistryEntry,
} from "@/lib/types";
import { VarmbolMatchApp } from "@/components/VarmbolMatchApp";
import { AdminTeamsModal } from "@/components/AdminTeamsModal";

const AUTH_TOKEN_STORAGE_KEY = "vfc_auth_token_v1";
const ACTIVE_TEAM_STORAGE_KEY = "vfc_active_team_id_v1";

interface AuthApiResponse {
  ok: boolean;
  authenticated?: boolean;
  token?: string;
  role?: AuthRole;
  team?: TeamProfile;
  snapshot?: LiveSyncSnapshot | null;
  allTeams?: TeamRegistryEntry[];
  error?: string;
}

export function TeamAccessGate() {
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [role, setRole] = useState<AuthRole>("coach");
  const [currentTeam, setCurrentTeam] = useState<TeamProfile | null>(null);
  const [allTeams, setAllTeams] = useState<TeamRegistryEntry[]>([]);
  const [initialSnapshot, setInitialSnapshot] =
    useState<LiveSyncSnapshot | null>(null);

  const [codeInput, setCodeInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [adminModalOpen, setAdminModalOpen] = useState(false);

  const applyAuthSuccess = useCallback(
    (data: AuthApiResponse, fallbackToken: string | null) => {
      if (!data.team || !data.role) return;
      const nextToken = data.token ?? fallbackToken;
      if (nextToken) {
        setAuthToken(nextToken);
        try {
          window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, nextToken);
        } catch {
          // ignore storage quota errors
        }
      }
      try {
        window.localStorage.setItem(ACTIVE_TEAM_STORAGE_KEY, data.team.id);
      } catch {
        // ignore
      }
      setRole(data.role);
      setCurrentTeam(data.team);
      setInitialSnapshot(data.snapshot ?? null);
      if (Array.isArray(data.allTeams)) {
        setAllTeams(data.allTeams);
      }
      setAuthenticated(true);
      setErrorMsg(null);
    },
    []
  );

  const loginWithCode = useCallback(
    async (rawCode: string, preferredTeamId?: string | null) => {
      const trimmed = rawCode.trim();
      if (!trimmed) {
        setErrorMsg("Ange en lagkod");
        return false;
      }
      setSubmitting(true);
      setErrorMsg(null);
      try {
        const res = await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: trimmed,
            teamId: preferredTeamId ?? undefined,
          }),
        });
        const data = (await res.json()) as AuthApiResponse;
        if (!res.ok || !data.ok || !data.authenticated || !data.team) {
          setErrorMsg(data.error || "Ogiltig lagkod. Kontrollera och försök igen.");
          return false;
        }
        applyAuthSuccess(data, data.token ?? null);
        return true;
      } catch {
        setErrorMsg("Kunde inte nå servern. Kontrollera din uppkoppling.");
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [applyAuthSuccess]
  );

  useEffect(() => {
    let cancelled = false;

    async function bootstrapAuth() {
      let savedToken: string | null = null;
      let savedTeamId: string | null = null;
      try {
        savedToken = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
        savedTeamId = window.localStorage.getItem(ACTIVE_TEAM_STORAGE_KEY);
      } catch {
        // ignore
      }

      const url = new URL(window.location.href);
      const joinCode =
        url.searchParams.get("join") || url.searchParams.get("code");

      if (joinCode) {
        // Ta bort ?join= ur adressfältet direkt så koden inte ligger kvar synlig
        url.searchParams.delete("join");
        url.searchParams.delete("code");
        const cleanSearch = url.searchParams.toString();
        const cleanUrl =
          url.pathname + (cleanSearch ? `?${cleanSearch}` : "") + url.hash;
        window.history.replaceState({}, "", cleanUrl);

        const ok = await loginWithCode(joinCode, savedTeamId);
        if (!cancelled) {
          setChecking(false);
        }
        if (ok) return;
      }

      // Annars verifiera befintlig session (cookie eller Bearer-token i localStorage)
      try {
        const headers: Record<string, string> = {};
        if (savedToken) {
          headers.Authorization = `Bearer ${savedToken}`;
        }
        const query = savedTeamId
          ? `?teamId=${encodeURIComponent(savedTeamId)}`
          : "";
        const res = await fetch(`/api/auth${query}`, {
          method: "GET",
          headers,
          cache: "no-store",
        });
        const data = (await res.json()) as AuthApiResponse;
        if (!cancelled && res.ok && data.authenticated && data.team) {
          applyAuthSuccess(data, savedToken);
        }
      } catch {
        // Utloggad eller offline
      } finally {
        if (!cancelled) {
          setChecking(false);
        }
      }
    }

    bootstrapAuth();
    return () => {
      cancelled = true;
    };
  }, [applyAuthSuccess, loginWithCode]);

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    let savedTeamId: string | null = null;
    try {
      savedTeamId = window.localStorage.getItem(ACTIVE_TEAM_STORAGE_KEY);
    } catch {
      // ignore
    }
    await loginWithCode(codeInput, savedTeamId);
  }

  async function handleSwitchTeam(nextTeamId: string) {
    if (!nextTeamId || nextTeamId === currentTeam?.id) {
      setAdminModalOpen(false);
      return;
    }
    try {
      const headers: Record<string, string> = {};
      if (authToken) {
        headers.Authorization = `Bearer ${authToken}`;
      }
      const res = await fetch(
        `/api/auth?teamId=${encodeURIComponent(nextTeamId)}`,
        {
          method: "GET",
          headers,
          cache: "no-store",
        }
      );
      const data = (await res.json()) as AuthApiResponse;
      if (res.ok && data.authenticated && data.team) {
        applyAuthSuccess(data, authToken);
        setAdminModalOpen(false);
      }
    } catch {
      // ignore
    }
  }

  async function handleLogout() {
    try {
      await fetch("/api/auth", { method: "DELETE" });
    } catch {
      // ignore
    }
    try {
      window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    } catch {
      // ignore
    }
    setAuthenticated(false);
    setAuthToken(null);
    setCurrentTeam(null);
    setAllTeams([]);
    setInitialSnapshot(null);
    setCodeInput("");
    setAdminModalOpen(false);
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-[#020814] flex flex-col items-center justify-center p-4 select-none">
        <div className="cm-bevel rounded-2xl border-2 border-[#facc15]/80 p-6 max-w-sm w-full text-center space-y-3 shadow-2xl">
          <Loader2 className="w-8 h-8 text-[#facc15] animate-spin mx-auto" />
          <div className="font-display font-extrabold text-base uppercase tracking-wider text-white">
            Laddar Matchcoach...
          </div>
          <p className="text-xs font-mono-cm text-sky-200">
            Kontrollerar lagåtkomst & synkar matchdata
          </p>
        </div>
      </div>
    );
  }

  if (!authenticated || !currentTeam) {
    return (
      <div className="min-h-screen bg-[#020814] flex flex-col items-center justify-center p-4 select-none">
        <div className="max-w-md w-full cm-bevel rounded-2xl border-2 border-[#facc15] overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.85)]">
          {/* Top bar */}
          <div className="cm-header-bar px-5 py-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/10 p-1.5 flex items-center justify-center border border-[#facc15]/80 shadow-inner shrink-0">
              <img
                src="/club/varmbol-logo-white.png"
                alt="Matchcoach"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-display font-extrabold text-lg sm:text-xl uppercase tracking-wider text-white">
                  MATCHCOACH · LAGINLOGGNING
                </span>
              </div>
              <p className="text-[11px] font-mono-cm text-[#facc15] uppercase tracking-wider">
                Endast för inbjudna tränare & ledare
              </p>
            </div>
          </div>

          <form onSubmit={handleFormSubmit} className="p-5 space-y-4">
            <div className="p-3 rounded-xl bg-[#050e1d] border border-sky-400/25 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-mono-cm font-bold uppercase text-sky-200">
                <Lock className="w-3.5 h-3.5 text-[#facc15]" />
                <span>Låst lagmiljö</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Skriv in din <strong>lagkod</strong> som du fått i WhatsApp-gruppen
                (eller klicka direkt på inbjudningslänken i WhatsApp så loggas du
                in automatiskt).
              </p>
            </div>

            <div>
              <label
                htmlFor="team-access-code"
                className="block text-xs font-mono-cm font-bold uppercase text-[#facc15] mb-1.5"
              >
                Lagkod / Tränarkod
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="team-access-code"
                  type="text"
                  autoCapitalize="characters"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                  placeholder="T.EX. VFC2017"
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#040a15] border-2 border-sky-400/40 focus:border-[#facc15] focus:outline-none text-white font-mono-cm font-extrabold text-lg tracking-widest uppercase placeholder:text-slate-600"
                />
              </div>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-400/50 text-xs font-mono-cm text-rose-200">
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !codeInput.trim()}
              className={`w-full py-3.5 rounded-xl font-display font-extrabold text-base uppercase tracking-wider flex items-center justify-center gap-2 transition active:scale-98 ${
                submitting || !codeInput.trim()
                  ? "bg-slate-800 text-slate-400 cursor-not-allowed"
                  : "bg-[#facc15] hover:bg-amber-300 text-slate-950 shadow-[0_0_25px_rgba(250,204,21,0.45)]"
              }`}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Öppnar laget...</span>
                </>
              ) : (
                <>
                  <Shield className="w-4 h-4" />
                  <span>Logga in till laget</span>
                </>
              )}
            </button>

            <div className="pt-2 border-t border-white/10 grid grid-cols-2 gap-2 text-[11px] font-mono-cm text-slate-400">
              <div className="p-2 rounded-lg bg-[#040a14] border border-white/5">
                <div className="text-emerald-300 font-bold uppercase flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Tränarkod
                </div>
                <div className="mt-0.5">
                  Styr klocka, byten, trupp och taktik för ditt lag.
                </div>
              </div>
              <div className="p-2 rounded-lg bg-[#040a14] border border-white/5">
                <div className="text-sky-300 font-bold uppercase flex items-center gap-1">
                  <Users className="w-3 h-3" /> Följarkod
                </div>
                <div className="mt-0.5">
                  Följ matchen live i realtid vid sidlinjen (läsläge).
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <>
      <VarmbolMatchApp
        key={currentTeam.id}
        teamProfile={currentTeam}
        authRole={role}
        authToken={authToken}
        initialRemoteSnapshot={initialSnapshot}
        onOpenAdminModal={() => setAdminModalOpen(true)}
      />

      <AdminTeamsModal
        open={adminModalOpen}
        onClose={() => setAdminModalOpen(false)}
        role={role}
        currentTeam={currentTeam}
        allTeams={allTeams}
        authToken={authToken}
        onSwitchTeam={handleSwitchTeam}
        onTeamsUpdated={(teams, updatedCurrent) => {
          if (teams.length > 0) {
            setAllTeams(teams);
          }
          if (updatedCurrent) {
            setCurrentTeam(updatedCurrent);
          } else if (currentTeam) {
            const match = teams.find((t) => t.id === currentTeam.id);
            if (match) {
              setCurrentTeam({
                id: match.id,
                clubName: match.clubName,
                teamName: match.teamName,
                displayName: match.displayName,
                shortName: match.shortName,
                coaches: match.coaches,
                colors: match.colors,
                logoUrl: match.logoUrl,
                defaultFormat: match.defaultFormat,
                defaultFormation: match.defaultFormation,
                createdAt: match.createdAt,
                updatedAt: match.updatedAt,
              });
            }
          }
        }}
        onLogout={handleLogout}
      />
    </>
  );
}
