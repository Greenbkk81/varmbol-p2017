"use client";

import React, { useState } from "react";
import {
  Check,
  Copy,
  KeyRound,
  LogOut,
  MessageCircle,
  Plus,
  RefreshCw,
  Shield,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  AuthRole,
  MatchFormat,
  TeamColors,
  TeamProfile,
  TeamRegistryEntry,
} from "@/lib/types";

const COLOR_PRESETS: { label: string; colors: TeamColors }[] = [
  {
    label: "Värmbol Blå & Gul",
    colors: { primary: "#005cb9", secondary: "#facc15" },
  },
  {
    label: "Röd & Vit (KAIK / KSK)",
    colors: { primary: "#b91c1c", secondary: "#facc15" },
  },
  {
    label: "Grön & Gul (Flen / Vingåker)",
    colors: { primary: "#15803d", secondary: "#facc15" },
  },
  {
    label: "Svart & Gul",
    colors: { primary: "#1e293b", secondary: "#facc15" },
  },
  {
    label: "Himmelsblå & Guld",
    colors: { primary: "#0284c7", secondary: "#fde047" },
  },
  {
    label: "Orange & Vit",
    colors: { primary: "#c2410c", secondary: "#fde047" },
  },
];

interface AdminTeamsModalProps {
  open: boolean;
  onClose: () => void;
  role: AuthRole;
  currentTeam: TeamProfile;
  allTeams: TeamRegistryEntry[];
  authToken: string | null;
  onSwitchTeam: (teamId: string) => void;
  onTeamsUpdated: (
    teams: TeamRegistryEntry[],
    updatedCurrent?: TeamProfile
  ) => void;
  onLogout: () => void;
}

export function AdminTeamsModal({
  open,
  onClose,
  role,
  currentTeam,
  allTeams,
  authToken,
  onSwitchTeam,
  onTeamsUpdated,
  onLogout,
}: AdminTeamsModalProps) {
  const isSuperAdmin = role === "superadmin";

  // State för att skapa nytt lag (Superadmin)
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [clubName, setClubName] = useState("Värmbols FC");
  const [teamName, setTeamName] = useState("");
  const [shortName, setShortName] = useState("VFC");
  const [coachesInput, setCoachesInput] = useState("");
  const [defaultFormat, setDefaultFormat] = useState<MatchFormat>("7v7");
  const [selectedColors, setSelectedColors] = useState<TeamColors>({
    primary: "#005cb9",
    secondary: "#facc15",
  });
  const [initialPlayersInput, setInitialPlayersInput] = useState("");
  const [customCoachCode, setCustomCoachCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // State för att redigera nuvarande lags profil (Coach eller Superadmin)
  const [editCoaches, setEditCoaches] = useState(
    currentTeam.coaches.join(", ")
  );
  const [editClubName, setEditClubName] = useState(currentTeam.clubName);
  const [editTeamName, setEditTeamName] = useState(currentTeam.teamName);
  const [editShortName, setEditShortName] = useState(currentTeam.shortName);
  const [editColors, setEditColors] = useState<TeamColors>(currentTeam.colors);
  const [profileSaved, setProfileSaved] = useState(false);

  if (!open) return null;

  const baseUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://varmbol-p2017.vercel.app";

  function authHeaders(): HeadersInit {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (authToken) {
      h["Authorization"] = `Bearer ${authToken}`;
    }
    return h;
  }

  function buildCoachInviteText(entry: TeamRegistryEntry): string {
    const url = `${baseUrl}/?join=${encodeURIComponent(entry.coachCode)}`;
    return [
      `⚽ *${entry.displayName} – Sidlinjen (Match & Speltid)*`,
      ``,
      `Här är er direkta inloggningslänk för tränare:`,
      `${url}`,
      ``,
      `🔑 Lagkod: *${entry.coachCode}*`,
      ...(entry.followCode
        ? [
            `👀 Följ-länk (endast titta live): ${baseUrl}/?join=${encodeURIComponent(
              entry.followCode
            )}&mode=follow`,
          ]
        : []),
    ].join("\n");
  }

  function handleCopyInvite(entry: TeamRegistryEntry) {
    const text = buildCoachInviteText(entry);
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        setCopiedId(entry.id);
        setTimeout(() => setCopiedId(null), 2500);
      });
    }
  }

  function handleShareWhatsApp(entry: TeamRegistryEntry) {
    const text = buildCoachInviteText(entry);
    const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(waUrl, "_blank", "noopener,noreferrer");
  }

  async function handleCreateTeam(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    if (!clubName.trim() || !teamName.trim()) {
      setErrorMsg("Fyll i både klubbnamn och lag (t.ex. P2016).");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/teams", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          clubName: clubName.trim(),
          teamName: teamName.trim(),
          shortName: shortName.trim(),
          coaches: coachesInput,
          colors: selectedColors,
          defaultFormat,
          defaultFormation: defaultFormat === "7v7" ? "1-4-1" : "1-2-1",
          coachCode: customCoachCode.trim() || undefined,
          initialPlayers: initialPlayersInput,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setErrorMsg(data?.error || "Kunde inte skapa lag.");
        setBusy(false);
        return;
      }
      onTeamsUpdated(data.teams);
      setTeamName("");
      setCoachesInput("");
      setInitialPlayersInput("");
      setCustomCoachCode("");
      setShowCreateForm(false);
    } catch {
      setErrorMsg("Nätverksfel vid skapande av lag.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRegenerateCode(entry: TeamRegistryEntry) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/teams", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          id: entry.id,
          regenerateCodes: true,
        }),
      });
      const data = await res.json();
      if (res.ok && data?.ok) {
        onTeamsUpdated(data.teams);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteTeam(entry: TeamRegistryEntry) {
    if (entry.id === "vfc-p2017") return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Vill du ta bort laget ${entry.displayName}?`)
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/teams?teamId=${encodeURIComponent(entry.id)}`,
        {
          method: "DELETE",
          headers: authHeaders(),
        }
      );
      const data = await res.json();
      if (res.ok && data?.ok) {
        onTeamsUpdated(data.teams);
        if (currentTeam.id === entry.id) {
          onSwitchTeam("vfc-p2017");
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveCurrentTeamProfile(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/teams", {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({
          teamId: currentTeam.id,
          clubName: editClubName.trim(),
          teamName: editTeamName.trim(),
          shortName: editShortName.trim(),
          coaches: editCoaches,
          colors: editColors,
        }),
      });
      const data = await res.json();
      if (res.ok && data?.ok) {
        onTeamsUpdated(data.allTeams || allTeams, data.team);
        setProfileSaved(true);
        setTimeout(() => setProfileSaved(false), 2000);
      } else {
        setErrorMsg(data?.error || "Kunde inte spara laginställningar");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="max-w-2xl w-full my-auto cm-bevel rounded-2xl border-2 border-[#facc15] overflow-hidden shadow-2xl flex flex-col max-h-[92dvh]">
        {/* Header */}
        <div className="cm-header-bar px-4 py-3 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-[#facc15]" />
            <div>
              <h2 className="font-display font-extrabold text-base sm:text-lg uppercase tracking-wider text-white">
                {isSuperAdmin
                  ? "ADMIN · LAG & WHATSAPP-INBJUDNINGAR"
                  : `LAGINSTÄLLNINGAR · ${currentTeam.displayName}`}
              </h2>
              <p className="text-[11px] font-mono-cm text-sky-100">
                {isSuperAdmin
                  ? "Skapa lag, skicka länk i WhatsApp-gruppen eller växla aktivt lag"
                  : "Anpassa tränarnamn och färger för ert lag"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-black/30 text-sky-100 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-5 overflow-y-auto">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-950/80 border border-rose-400/50 text-xs font-mono-cm text-rose-200">
              {errorMsg}
            </div>
          )}

          {/* SUPERADMIN: LISTA ALLA LAG + SKAPA NYTT LAG */}
          {isSuperAdmin && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display font-extrabold text-sm uppercase tracking-wider text-[#facc15] flex items-center gap-1.5">
                  <Users className="w-4 h-4" />
                  <span>Alla lag ({allTeams.length})</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setShowCreateForm((v) => !v)}
                  className="px-3 py-1.5 rounded-lg bg-[#facc15] hover:bg-yellow-300 text-slate-950 font-display font-extrabold text-xs uppercase tracking-wider flex items-center gap-1 shadow"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{showCreateForm ? "Stäng formulär" : "Skapa nytt lag"}</span>
                </button>
              </div>

              {/* SKAPA NYTT LAG FORMULÄR */}
              {showCreateForm && (
                <form
                  onSubmit={handleCreateTeam}
                  className="p-3.5 rounded-xl bg-[#040c1a] border-2 border-[#facc15]/60 space-y-3"
                >
                  <div className="font-display font-extrabold text-sm uppercase text-[#facc15] flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4" />
                    <span>Nytt lag till WhatsApp-gruppen</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[10px] font-mono-cm uppercase text-sky-300 mb-1">
                        Klubbnamn
                      </label>
                      <input
                        type="text"
                        value={clubName}
                        onChange={(e) => {
                          setClubName(e.target.value);
                          const initials = e.target.value
                            .split(/\s+/)
                            .map((w) => w[0] || "")
                            .join("")
                            .toUpperCase()
                            .slice(0, 4);
                          if (initials) setShortName(initials);
                        }}
                        placeholder="t.ex. Värmbols FC"
                        className="w-full px-2.5 py-1.5 rounded bg-[#081529] border border-sky-400/30 text-xs text-white font-mono-cm"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-mono-cm uppercase text-sky-300 mb-1">
                        Lag / Ålderskull
                      </label>
                      <input
                        type="text"
                        value={teamName}
                        onChange={(e) => setTeamName(e.target.value)}
                        placeholder="t.ex. P2016 eller F2017"
                        className="w-full px-2.5 py-1.5 rounded bg-[#081529] border border-sky-400/30 text-xs text-white font-mono-cm"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-mono-cm uppercase text-sky-300 mb-1">
                        Kortkod (3–4 tecken)
                      </label>
                      <input
                        type="text"
                        maxLength={5}
                        value={shortName}
                        onChange={(e) =>
                          setShortName(e.target.value.toUpperCase())
                        }
                        placeholder="VFC"
                        className="w-full px-2.5 py-1.5 rounded bg-[#081529] border border-sky-400/30 text-xs text-white font-mono-cm uppercase"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[10px] font-mono-cm uppercase text-sky-300 mb-1">
                        Tränarnas förnamn
                      </label>
                      <input
                        type="text"
                        value={coachesInput}
                        onChange={(e) => setCoachesInput(e.target.value)}
                        placeholder="t.ex. Anders, Maria"
                        className="w-full px-2.5 py-1.5 rounded bg-[#081529] border border-sky-400/30 text-xs text-white font-mono-cm"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-mono-cm uppercase text-sky-300 mb-1">
                        Standard spelform
                      </label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {(["7v7", "5v5"] as const).map((fmt) => (
                          <button
                            key={fmt}
                            type="button"
                            onClick={() => setDefaultFormat(fmt)}
                            className={`py-1.5 rounded font-mono-cm font-bold text-xs border ${
                              defaultFormat === fmt
                                ? "bg-[#facc15] text-slate-950 border-yellow-200"
                                : "bg-[#081529] text-slate-300 border-white/10"
                            }`}
                          >
                            {fmt}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-mono-cm uppercase text-sky-300 mb-1">
                        Egen lagkod (valfritt)
                      </label>
                      <input
                        type="text"
                        value={customCoachCode}
                        onChange={(e) =>
                          setCustomCoachCode(e.target.value.toUpperCase())
                        }
                        placeholder="Slumpas om tom"
                        className="w-full px-2.5 py-1.5 rounded bg-[#081529] border border-sky-400/30 text-xs text-white font-mono-cm uppercase"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono-cm uppercase text-sky-300 mb-1">
                      Färgtema
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {COLOR_PRESETS.map((preset) => {
                        const active =
                          selectedColors.primary === preset.colors.primary &&
                          selectedColors.secondary === preset.colors.secondary;
                        return (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => setSelectedColors(preset.colors)}
                            className={`px-2.5 py-1.5 rounded border text-left flex items-center gap-2 text-xs font-mono-cm ${
                              active
                                ? "border-[#facc15] bg-white/10 text-white font-bold"
                                : "border-white/10 bg-[#081529] text-slate-300"
                            }`}
                          >
                            <span
                              className="w-3.5 h-3.5 rounded-full border border-white/40 shrink-0"
                              style={{ backgroundColor: preset.colors.primary }}
                            />
                            <span className="truncate text-[11px]">
                              {preset.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono-cm uppercase text-sky-300 mb-1">
                      Spelarnas förnamn (valfritt – tränaren kan också lägga in dem själv)
                    </label>
                    <textarea
                      rows={2}
                      value={initialPlayersInput}
                      onChange={(e) => setInitialPlayersInput(e.target.value)}
                      placeholder="Skriv förnamn med kommatecken eller ny rad (t.ex. Kalle, Olle, Liam, Noah...)"
                      className="w-full px-2.5 py-1.5 rounded bg-[#081529] border border-sky-400/30 text-xs text-white font-mono-cm"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full py-2.5 rounded-lg bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-display font-extrabold text-sm uppercase tracking-wider shadow"
                  >
                    {busy ? "Skapar lag..." : "✓ Skapa lag & generera WhatsApp-inbjudan"}
                  </button>
                </form>
              )}

              {/* LISTA PÅ LAG */}
              <div className="space-y-2">
                {allTeams.map((entry) => {
                  const isCurrent = entry.id === currentTeam.id;
                  return (
                    <div
                      key={entry.id}
                      className={`p-3 rounded-xl border transition ${
                        isCurrent
                          ? "bg-[#091e3a] border-[#facc15]"
                          : "bg-[#050e1d] border-white/10"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className="w-8 h-8 rounded-lg flex items-center justify-center font-display font-extrabold text-xs text-white border border-white/30 shrink-0"
                            style={{ backgroundColor: entry.colors.primary }}
                          >
                            {entry.shortName}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-display font-extrabold text-sm sm:text-base uppercase text-white truncate">
                                {entry.displayName}
                              </span>
                              {isCurrent && (
                                <span className="px-1.5 py-0.2 rounded bg-emerald-400 text-slate-950 font-mono-cm font-extrabold text-[9px] uppercase">
                                  Aktivt nu
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] font-mono-cm text-slate-300 flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                              <span>
                                🔑 Tränarkod:{" "}
                                <strong className="text-[#facc15]">
                                  {entry.coachCode}
                                </strong>
                              </span>
                              {entry.followCode && (
                                <span>
                                  👀 Följkod:{" "}
                                  <strong className="text-sky-300">
                                    {entry.followCode}
                                  </strong>
                                </span>
                              )}
                              <span className="text-slate-400">
                                Tränare: {entry.coaches.join(", ")}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap">
                          {!isCurrent && (
                            <button
                              type="button"
                              onClick={() => {
                                onSwitchTeam(entry.id);
                                onClose();
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-[#005cb9] hover:bg-sky-600 text-white font-display font-bold text-xs uppercase border border-sky-300/40"
                            >
                              Öppna lag
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleShareWhatsApp(entry)}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-extrabold text-xs uppercase flex items-center gap-1 shadow"
                            title="Öppna WhatsApp med färdig inbjudningslänk"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span>WhatsApp</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleCopyInvite(entry)}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-200 font-mono-cm font-bold text-[11px] flex items-center gap-1 border border-white/10"
                          >
                            {copiedId === entry.id ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                                <span className="text-emerald-300">Kopierad!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Kopiera länk</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleRegenerateCode(entry)}
                            title="Slumpa ny lagkod"
                            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-white/10"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>

                          {entry.id !== "vfc-p2017" && (
                            <button
                              type="button"
                              onClick={() => handleDeleteTeam(entry)}
                              title="Ta bort lag"
                              className="p-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-500/30"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* REDIGERA NUVARANDE LAGS PROFIL (För både Coach och Superadmin) */}
          <form
            onSubmit={handleSaveCurrentTeamProfile}
            className="p-3.5 rounded-xl bg-[#050e1d] border border-white/15 space-y-3"
          >
            <div className="font-display font-extrabold text-xs uppercase tracking-wider text-sky-300">
              Anpassa aktivt lag ({currentTeam.displayName})
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[10px] font-mono-cm uppercase text-slate-400 mb-1">
                  Klubbnamn
                </label>
                <input
                  type="text"
                  value={editClubName}
                  onChange={(e) => setEditClubName(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded bg-[#040a14] border border-white/15 text-xs text-white font-mono-cm"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono-cm uppercase text-slate-400 mb-1">
                  Lagnamn
                </label>
                <input
                  type="text"
                  value={editTeamName}
                  onChange={(e) => setEditTeamName(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded bg-[#040a14] border border-white/15 text-xs text-white font-mono-cm"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono-cm uppercase text-slate-400 mb-1">
                  Tränare (komma-separerade)
                </label>
                <input
                  type="text"
                  value={editCoaches}
                  onChange={(e) => setEditCoaches(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded bg-[#040a14] border border-white/15 text-xs text-white font-mono-cm"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-mono-cm uppercase text-slate-400 mb-1">
                Färgtema för {currentTeam.displayName}
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {COLOR_PRESETS.map((preset) => {
                  const active =
                    editColors.primary === preset.colors.primary &&
                    editColors.secondary === preset.colors.secondary;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setEditColors(preset.colors)}
                      className={`px-2.5 py-1.5 rounded border text-left flex items-center gap-2 text-xs font-mono-cm ${
                        active
                          ? "border-[#facc15] bg-white/10 text-white font-bold"
                          : "border-white/10 bg-[#040a14] text-slate-300"
                      }`}
                    >
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-white/40 shrink-0"
                        style={{ backgroundColor: preset.colors.primary }}
                      />
                      <span className="truncate text-[11px]">{preset.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="submit"
                disabled={busy}
                className="px-3.5 py-1.5 rounded-lg bg-[#facc15] text-slate-950 font-display font-extrabold text-xs uppercase"
              >
                {profileSaved ? "✓ Sparat!" : "Spara lagprofil"}
              </button>

              <button
                type="button"
                onClick={onLogout}
                className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-rose-950 text-slate-300 hover:text-rose-200 border border-white/10 font-mono-cm text-xs flex items-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Byt lagkod / Logga ut</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
