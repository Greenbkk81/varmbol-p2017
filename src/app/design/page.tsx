"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowLeftRight,
  Check,
  Clock,
  Compass,
  Copy,
  LayoutGrid,
  Lock,
  Pause,
  Play,
  RotateCcw,
  Share2,
  Shield,
  Sparkles,
  Unlock,
} from "lucide-react";
import { FORMATION_SLOTS } from "@/lib/default-roster";
import { PlayerAvatar } from "@/components/PlayerAvatar";

type ThemeId = "svenskalag" | "mobbin" | "nordic";
type FormationId = "1-4-1" | "1-1-3-1";
type SubViewId = "match" | "tactics";
type TacticScenarioId = "base" | "attack_left" | "high_press" | "low_block";

interface DemoPlayer {
  id: string;
  name: string;
  number: string;
  avatarUrl?: string;
  onPitch: boolean;
  slotIndex: number; // 0..6 on pitch, -1 on bench
  isGoalkeeper?: boolean;
  playMin: number;
  stintMin: number;
  benchMin: number;
  note?: string;
}

const INITIAL_DEMO_PLAYERS: DemoPlayer[] = [
  {
    id: "p-oscar",
    name: "Oscar",
    number: "3",
    avatarUrl: "/players/oscar.jpg",
    onPitch: true,
    slotIndex: 0,
    isGoalkeeper: true,
    playMin: 14,
    stintMin: 14,
    benchMin: 0,
  },
  {
    id: "p-oliver",
    name: "Oliver",
    number: "5",
    avatarUrl: "/players/oliver.jpg",
    onPitch: true,
    slotIndex: 1,
    playMin: 12,
    stintMin: 6,
    benchMin: 2,
  },
  {
    id: "p-gabriel",
    name: "Gabriel",
    number: "7",
    avatarUrl: "/players/gabriel.jpg",
    onPitch: true,
    slotIndex: 2,
    playMin: 11,
    stintMin: 5,
    benchMin: 3,
  },
  {
    id: "p-edvin",
    name: "Edvin",
    number: "4",
    avatarUrl: "/players/edvin.jpg",
    onPitch: true,
    slotIndex: 3,
    playMin: 10,
    stintMin: 4,
    benchMin: 4,
  },
  {
    id: "p-holger",
    name: "Holger",
    number: "8",
    avatarUrl: "/players/holger.jpg",
    onPitch: true,
    slotIndex: 4,
    playMin: 13,
    stintMin: 7,
    benchMin: 1,
  },
  {
    id: "p-scott",
    name: "Scott",
    number: "12",
    onPitch: true,
    slotIndex: 5,
    playMin: 9,
    stintMin: 4,
    benchMin: 5,
  },
  {
    id: "p-abdoulaye",
    name: "Abdullahi",
    number: "1",
    avatarUrl: "/players/abdoulaye.jpg",
    onPitch: true,
    slotIndex: 6,
    playMin: 11,
    stintMin: 6,
    benchMin: 3,
  },
  {
    id: "p-mattheo",
    name: "Mattheo",
    number: "14",
    onPitch: false,
    slotIndex: -1,
    playMin: 7,
    stintMin: 0,
    benchMin: 6,
    note: "P2018",
  },
  {
    id: "p-charlie",
    name: "Charlie",
    number: "15",
    onPitch: false,
    slotIndex: -1,
    playMin: 7,
    stintMin: 0,
    benchMin: 5,
    note: "P2018",
  },
];

const SCENARIO_OFFSETS: Record<
  TacticScenarioId,
  {
    label: string;
    subtitle: string;
    ball: { x: number; y: number };
    dx: number[];
    dy: number[];
  }
> = {
  base: {
    label: "Grundposition",
    subtitle: "Balanserade avstånd & tydliga roller i 7-mot-7",
    ball: { x: 50, y: 50 },
    dx: [0, 0, 0, 0, 0, 0, 0],
    dy: [0, 0, 0, 0, 0, 0, 0],
  },
  attack_left: {
    label: "Anfall Vänster",
    subtitle: "VM går högt på kanten · IMV/DM säkrar snett bakom",
    ball: { x: 20, y: 26 },
    dx: [0, -6, -4, -8, -4, -6, -8],
    dy: [-2, -8, -15, -6, -10, -8, -6],
  },
  high_press: {
    label: "Hög Press",
    subtitle: "FW styr ut mot kanten · Ytter sätter 1:a press · Mittfält låser",
    ball: { x: 28, y: 16 },
    dx: [0, -4, -2, -6, -4, -8, -14],
    dy: [-4, -14, -18, -14, -14, -12, -4],
  },
  low_block: {
    label: "Försvar Lågt",
    subtitle: "Kompakt lag framför eget straffområde · Stäng mitten",
    ball: { x: 50, y: 72 },
    dx: [0, 0, 8, 4, -4, -8, 0],
    dy: [2, 8, 16, 14, 14, 16, 18],
  },
};

export default function DesignProposalsPage() {
  const [theme, setTheme] = useState<ThemeId>("svenskalag");
  const [formation, setFormation] = useState<FormationId>("1-4-1");
  const [subView, setSubView] = useState<SubViewId>("match");
  const [scenario, setScenario] = useState<TacticScenarioId>("base");
  const [players, setPlayers] = useState<DemoPlayer[]>(INITIAL_DEMO_PLAYERS);
  const [selectedOutIds, setSelectedOutIds] = useState<string[]>([
    "p-holger",
    "p-oliver",
  ]);
  const [selectedInIds, setSelectedInIds] = useState<string[]>([
    "p-mattheo",
    "p-charlie",
  ]);
  const [isRunning, setIsRunning] = useState<boolean>(true);
  const [seconds, setSeconds] = useState<number>(14 * 60 + 20);
  const [rainLock, setRainLock] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [justSubbedBanner, setJustSubbedBanner] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("theme");
    if (t === "1" || t === "svenskalag") setTheme("svenskalag");
    if (t === "2" || t === "mobbin") setTheme("mobbin");
    if (t === "3" || t === "nordic") setTheme("nordic");
    const f = params.get("formation");
    if (f === "1-1-3-1" || f === "1-4-1") setFormation(f);
  }, []);

  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => {
      setSeconds((s) => (s < 20 * 60 ? s + 1 : s));
    }, 1000);
    return () => clearInterval(timer);
  }, [isRunning]);

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  const slots = FORMATION_SLOTS[formation];
  const pitchPlayers = players
    .filter((p) => p.onPitch)
    .sort((a, b) => a.slotIndex - b.slotIndex);
  const benchPlayers = players
    .filter((p) => !p.onPitch)
    .sort((a, b) => b.benchMin - a.benchMin);

  function toggleOut(id: string) {
    if (rainLock) return;
    setJustSubbedBanner(null);
    setSelectedOutIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function toggleIn(id: string) {
    if (rainLock) return;
    setJustSubbedBanner(null);
    setSelectedInIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function handleSuggest2x() {
    if (rainLock) return;
    setJustSubbedBanner(null);
    const longestStintOutfield = [...pitchPlayers]
      .filter((p) => !p.isGoalkeeper)
      .sort((a, b) => b.stintMin - a.stintMin || b.playMin - a.playMin)
      .slice(0, 2)
      .map((p) => p.id);
    const longestBench = [...benchPlayers].slice(0, 2).map((p) => p.id);
    setSelectedOutIds(longestStintOutfield);
    setSelectedInIds(longestBench);
  }

  function handleExecuteSub() {
    if (
      rainLock ||
      selectedOutIds.length === 0 ||
      selectedOutIds.length !== selectedInIds.length
    ) {
      return;
    }
    const outNames: string[] = [];
    const inNames: string[] = [];

    setPlayers((prev) => {
      const next = prev.map((p) => ({ ...p }));
      for (let i = 0; i < selectedOutIds.length; i++) {
        const outP = next.find((p) => p.id === selectedOutIds[i]);
        const inP = next.find((p) => p.id === selectedInIds[i]);
        if (outP && inP) {
          outNames.push(outP.name);
          inNames.push(inP.name);
          const slot = outP.slotIndex;
          const wasGk = outP.isGoalkeeper;
          outP.onPitch = false;
          outP.slotIndex = -1;
          outP.isGoalkeeper = false;
          outP.stintMin = 0;
          outP.benchMin = 0;

          inP.onPitch = true;
          inP.slotIndex = slot;
          inP.isGoalkeeper = wasGk;
          inP.stintMin = 0;
          inP.benchMin = 0;
        }
      }
      return next;
    });

    setJustSubbedBanner(`Bytte in ${inNames.join(" & ")} (ut: ${outNames.join(" & ")})`);
    setSelectedOutIds([]);
    setSelectedInIds([]);
  }

  function handleCopyShareLink() {
    const url = new URL(window.location.href);
    url.searchParams.set("theme", theme);
    url.searchParams.set("formation", formation);
    navigator.clipboard.writeText(url.toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  const canConfirmSub =
    selectedOutIds.length > 0 && selectedOutIds.length === selectedInIds.length;

  const selectedOutNames = selectedOutIds
    .map((id) => players.find((p) => p.id === id)?.name)
    .filter(Boolean);
  const selectedInNames = selectedInIds
    .map((id) => players.find((p) => p.id === id)?.name)
    .filter(Boolean);

  return (
    <div
      style={{
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Inter", "Segoe UI", Roboto, sans-serif',
      }}
      className="min-h-screen bg-[#0b111e] text-slate-100 pb-16 selection:bg-sky-500 selection:text-white"
    >
      {/* =====================================================================
          ÖVRE FÖRSLAGSVÄLJARE (FÖR LARS & JOCKE)
         ===================================================================== */}
      <div className="sticky top-0 z-50 bg-[#0b111e]/95 backdrop-blur-md border-b border-white/10 px-3 py-2.5">
        <div className="max-w-md mx-auto flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Link
                href="/"
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition shrink-0"
                title="Tillbaka till nuvarande matchapp"
              >
                <ArrowLeft className="w-4 h-4" />
              </Link>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-200 truncate">
                  Designförslag · Värmbols FC P2017
                </div>
                <div className="text-[11px] text-slate-400 truncate">
                  Tryck nedan för att testa 3 lugnare & mer avskalade stilar
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleCopyShareLink}
              className="px-2.5 py-1.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-400/30 text-xs font-medium flex items-center gap-1.5 shrink-0 transition active:scale-95"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-300">Länk kopierad!</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Dela till Jocke</span>
                </>
              )}
            </button>
          </div>

          {/* 3 Tabbar för de 3 designförslagen */}
          <div className="grid grid-cols-3 gap-1.5 bg-slate-900/90 p-1 rounded-xl border border-white/10">
            <button
              type="button"
              onClick={() => setTheme("svenskalag")}
              className={`py-2 px-2 rounded-lg text-left transition ${
                theme === "svenskalag"
                  ? "bg-white text-slate-900 shadow-sm font-semibold"
                  : "text-slate-300 hover:text-white hover:bg-white/5"
              }`}
            >
              <div className="text-[11px] leading-tight font-bold">
                1. Svenskalag
              </div>
              <div
                className={`text-[10px] leading-tight mt-0.5 ${
                  theme === "svenskalag" ? "text-[#005cb9]" : "text-slate-400"
                }`}
              >
                Ljus föreningsapp
              </div>
            </button>

            <button
              type="button"
              onClick={() => setTheme("mobbin")}
              className={`py-2 px-2 rounded-lg text-left transition ${
                theme === "mobbin"
                  ? "bg-[#1e293b] text-white border border-sky-400/40 shadow-sm font-semibold"
                  : "text-slate-300 hover:text-white hover:bg-white/5"
              }`}
            >
              <div className="text-[11px] leading-tight font-bold">
                2. Apple / Fixtured
              </div>
              <div
                className={`text-[10px] leading-tight mt-0.5 ${
                  theme === "mobbin" ? "text-sky-300" : "text-slate-400"
                }`}
              >
                Mobbin iOS Glass
              </div>
            </button>

            <button
              type="button"
              onClick={() => setTheme("nordic")}
              className={`py-2 px-2 rounded-lg text-left transition ${
                theme === "nordic"
                  ? "bg-emerald-700 text-white shadow-sm font-semibold"
                  : "text-slate-300 hover:text-white hover:bg-white/5"
              }`}
            >
              <div className="text-[11px] leading-tight font-bold">
                3. Sideline Clean
              </div>
              <div
                className={`text-[10px] leading-tight mt-0.5 ${
                  theme === "nordic" ? "text-emerald-100" : "text-slate-400"
                }`}
              >
                Ren Taktiktavla
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* =====================================================================
          MOBILRAM / PREVIEW CONTAINER
         ===================================================================== */}
      <div className="max-w-md mx-auto px-0 sm:px-3 pt-0 sm:pt-4">
        {/* ===================================================================
            FÖRSLAG 1: SVENSKALAG CLEAN (LJUS, LUFTIG SVENSK FÖRENINGSAPP)
           =================================================================== */}
        {theme === "svenskalag" && (
          <div className="bg-[#F3F5F8] text-slate-900 sm:rounded-[28px] overflow-hidden shadow-2xl border border-slate-200">
            {/* Svenskalag Blå App-Header */}
            <header className="bg-[#005CB9] text-white px-4 pt-3.5 pb-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-white p-1 flex items-center justify-center shadow-sm shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/club/varmbol-logo.png"
                      alt="Värmbols FC"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold tracking-tight truncate">
                      Värmbols FC · P2017
                    </div>
                    <div className="text-[11px] text-sky-100 truncate">
                      Sammandrag 7v7 · IFK Norrköping (B)
                    </div>
                  </div>
                </div>

                {/* Uppställnings-växlare Lars vs Jocke */}
                <button
                  type="button"
                  onClick={() =>
                    setFormation((f) => (f === "1-4-1" ? "1-1-3-1" : "1-4-1"))
                  }
                  className="px-2.5 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-semibold flex items-center gap-1.5 border border-white/20 transition shrink-0"
                >
                  <span>{formation}</span>
                  <span className="text-[10px] text-sky-200">
                    ({formation === "1-4-1" ? "Lars" : "Jocke"}) ⇄
                  </span>
                </button>
              </div>

              {/* Segmented Control i Svenskalag-stil (Bara de 2 viktiga vyerna!) */}
              <div className="mt-3 grid grid-cols-2 gap-1 bg-[#00468E] p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setSubView("match")}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                    subView === "match"
                      ? "bg-white text-[#005CB9] shadow-sm"
                      : "text-sky-100 hover:text-white"
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Spel & Byten</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSubView("tactics")}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                    subView === "tactics"
                      ? "bg-white text-[#005CB9] shadow-sm"
                      : "text-sky-100 hover:text-white"
                  }`}
                >
                  <Compass className="w-3.5 h-3.5" />
                  <span>Taktiktavla</span>
                </button>
              </div>
            </header>

            <div className="p-3 space-y-3">
              {/* Vitt Matchkort (Klocka + Ställning + Snabbval) */}
              <div className="bg-white rounded-2xl p-3.5 shadow-sm border border-slate-200/80 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsRunning((r) => !r)}
                    className={`w-11 h-11 rounded-xl flex items-center justify-center text-white shadow-sm transition active:scale-95 ${
                      isRunning ? "bg-[#005CB9]" : "bg-emerald-600"
                    }`}
                    title={isRunning ? "Pausa" : "Starta"}
                  >
                    {isRunning ? (
                      <Pause className="w-5 h-5 fill-white" />
                    ) : (
                      <Play className="w-5 h-5 fill-white ml-0.5" />
                    )}
                  </button>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Period 2 av 3
                      </span>
                      <span className="text-[11px] text-slate-400 font-medium">
                        · 20 min
                      </span>
                    </div>
                    <div className="text-2xl font-bold tracking-tight text-slate-900 tabular-nums leading-tight mt-0.5">
                      {mm}:{ss}
                    </div>
                  </div>
                </div>

                {/* Ställning + Snabbknapp för byte */}
                <div className="flex items-center gap-2">
                  <div className="text-right px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200/80">
                    <div className="text-[10px] font-semibold text-slate-400 uppercase">
                      VFC – IFK
                    </div>
                    <div className="text-base font-bold text-slate-800 tabular-nums">
                      4 – 2
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setRainLock((r) => !r)}
                    className={`p-2.5 rounded-xl border text-xs font-semibold transition ${
                      rainLock
                        ? "bg-amber-50 border-amber-300 text-amber-800"
                        : "bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-800"
                    }`}
                    title="Skärmlås mot regn"
                  >
                    {rainLock ? (
                      <Lock className="w-4 h-4" />
                    ) : (
                      <Unlock className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {subView === "match" ? (
                <>
                  {/* Svenskalag Byteskort (visas direkt och tydligt) */}
                  <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-200/80">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <ArrowLeftRight className="w-3.5 h-3.5 text-[#005CB9]" />
                        <span>Nästa byte</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handleSuggest2x}
                          className="px-2.5 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 text-[#005CB9] text-[11px] font-semibold transition"
                        >
                          Föreslå 2x
                        </button>
                        {(selectedOutIds.length > 0 ||
                          selectedInIds.length > 0) && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedOutIds([]);
                              setSelectedInIds([]);
                            }}
                            className="px-2 py-1 rounded-lg text-slate-400 hover:text-slate-600 text-[11px]"
                          >
                            Rensa
                          </button>
                        )}
                      </div>
                    </div>

                    {justSubbedBanner ? (
                      <div className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center justify-between">
                        <span>✓ {justSubbedBanner}</span>
                        <button
                          type="button"
                          onClick={handleSuggest2x}
                          className="text-[11px] font-semibold underline"
                        >
                          Nytt förslag
                        </button>
                      </div>
                    ) : canConfirmSub ? (
                      <div className="flex items-center justify-between gap-2 bg-[#F8FAFC] p-2.5 rounded-xl border border-slate-200">
                        <div className="text-xs leading-snug min-w-0">
                          <div className="text-slate-500">
                            <span className="font-semibold text-amber-600">
                              Ut:
                            </span>{" "}
                            <span className="font-medium text-slate-800">
                              {selectedOutNames.join(", ")}
                            </span>
                          </div>
                          <div className="text-slate-500 mt-0.5">
                            <span className="font-semibold text-emerald-600">
                              In:
                            </span>{" "}
                            <span className="font-medium text-slate-800">
                              {selectedInNames.join(", ")}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleExecuteSub}
                          className="px-4 py-2.5 rounded-xl bg-[#16A34A] hover:bg-emerald-700 text-white text-xs font-bold shadow-sm shrink-0 transition active:scale-95"
                        >
                          Genomför byte ({selectedOutIds.length})
                        </button>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500 bg-slate-50 rounded-xl px-3 py-2">
                        Tryck på spelare på planen och bänken för att byta, eller
                        tryck <span className="font-semibold">Föreslå 2x</span>.
                      </div>
                    )}
                  </div>

                  {/* Ljus, lugn fotbollsplan med Svenskalag-brickor */}
                  <div className="bg-white rounded-2xl p-2.5 shadow-sm border border-slate-200/80">
                    <div className="flex items-center justify-between px-1 pb-2">
                      <span className="text-xs font-bold text-slate-700">
                        På planen (7 spelare)
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Uppställning:{" "}
                        <strong className="text-slate-800">
                          {formation === "1-4-1"
                            ? "1-4-1 (Sidopar V/H)"
                            : "1-1-3-1 (Back + Ankare)"}
                        </strong>
                      </span>
                    </div>

                    <div className="relative h-[340px] rounded-xl bg-[#2E7D32] overflow-hidden border border-emerald-800/20 shadow-inner">
                      {/* Diskreta linjer */}
                      <div className="absolute inset-2.5 border border-white/30 rounded-lg pointer-events-none" />
                      <div className="absolute inset-x-2.5 top-1/2 h-px bg-white/30 pointer-events-none" />
                      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full border border-white/30 pointer-events-none" />
                      <div className="absolute left-1/2 -translate-x-1/2 top-2.5 w-28 h-7 border-b border-x border-white/30 pointer-events-none" />
                      <div className="absolute left-1/2 -translate-x-1/2 bottom-2.5 w-32 h-10 border-t border-x border-white/30 pointer-events-none" />

                      {/* Diskret sidopar-markering i 1-4-1 */}
                      {formation === "1-4-1" && (
                        <>
                          <div className="absolute left-[6%] w-[41%] top-[33%] h-[25%] rounded-xl border border-dashed border-white/40 bg-white/[0.06] pointer-events-none" />
                          <div className="absolute right-[6%] w-[41%] top-[33%] h-[25%] rounded-xl border border-dashed border-white/40 bg-white/[0.06] pointer-events-none" />
                        </>
                      )}

                      {pitchPlayers.map((player) => {
                        const slot =
                          slots[player.slotIndex] ?? slots[0];
                        const isSelectedOut = selectedOutIds.includes(
                          player.id
                        );
                        return (
                          <button
                            key={player.id}
                            type="button"
                            onClick={() => toggleOut(player.id)}
                            style={{
                              left: `${slot.xPct}%`,
                              top: `${slot.yPct}%`,
                            }}
                            className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group focus:outline-none"
                          >
                            <div
                              className={`relative rounded-full p-0.5 transition-transform ${
                                isSelectedOut
                                  ? "ring-4 ring-amber-400 scale-105 bg-amber-400"
                                  : player.isGoalkeeper
                                  ? "ring-2 ring-amber-300 bg-white"
                                  : "ring-2 ring-white bg-white shadow-md"
                              }`}
                            >
                              <PlayerAvatar
                                name={player.name}
                                number={player.number}
                                avatarUrl={player.avatarUrl}
                                isGoalkeeper={player.isGoalkeeper}
                                size="md"
                              />
                              <span className="absolute -top-1 -right-1 px-1.5 py-[1px] rounded-full bg-[#005CB9] text-white text-[9px] font-bold shadow">
                                {slot.code}
                              </span>
                            </div>
                            <div
                              className={`mt-1 px-2 py-0.5 rounded-full text-[11px] font-semibold shadow-sm flex items-center gap-1 whitespace-nowrap ${
                                isSelectedOut
                                  ? "bg-amber-400 text-slate-950 font-bold"
                                  : "bg-white text-slate-900"
                              }`}
                            >
                              <span>{player.name}</span>
                              <span
                                className={`text-[10px] ${
                                  isSelectedOut
                                    ? "text-slate-900"
                                    : player.stintMin >= 6
                                    ? "text-amber-600 font-bold"
                                    : "text-slate-400"
                                }`}
                              >
                                {player.stintMin}m
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Svenskalag Avbytarbänk (Runda vita kort i lista) */}
                  <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-200/80">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-700">
                        Avbytare ({benchPlayers.length} redo)
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Tryck för att välja inbyte
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {benchPlayers.map((player) => {
                        const isSelectedIn = selectedInIds.includes(player.id);
                        return (
                          <button
                            key={player.id}
                            type="button"
                            onClick={() => toggleIn(player.id)}
                            className={`p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition ${
                              isSelectedIn
                                ? "bg-emerald-50 border-emerald-500 ring-1 ring-emerald-500"
                                : "bg-slate-50/80 border-slate-200 hover:bg-slate-100"
                            }`}
                          >
                            <PlayerAvatar
                              name={player.name}
                              number={player.number}
                              avatarUrl={player.avatarUrl}
                              size="sm"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-bold text-slate-900 truncate flex items-center gap-1">
                                <span>{player.name}</span>
                                {isSelectedIn && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-600 text-white font-bold">
                                    IN
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                Vilat {player.benchMin}m · Spelat{" "}
                                {player.playMin}m
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : (
                /* SVENSKALAG TAKTIKTAVLA / RÖRELSE */
                <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-200/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-slate-800">
                        Taktiktavla · {SCENARIO_OFFSETS[scenario].label}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {SCENARIO_OFFSETS[scenario].subtitle}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5">
                    {(
                      Object.keys(SCENARIO_OFFSETS) as TacticScenarioId[]
                    ).map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setScenario(key)}
                        className={`py-2 px-2 rounded-xl text-[11px] font-semibold border transition ${
                          scenario === key
                            ? "bg-[#005CB9] text-white border-[#005CB9] shadow-sm"
                            : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                        }`}
                      >
                        {SCENARIO_OFFSETS[key].label}
                      </button>
                    ))}
                  </div>

                  <div className="relative h-[340px] rounded-xl bg-[#2E7D32] overflow-hidden border border-emerald-800/20">
                    <div className="absolute inset-2.5 border border-white/30 rounded-lg pointer-events-none" />
                    <div className="absolute inset-x-2.5 top-1/2 h-px bg-white/30 pointer-events-none" />
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full border border-white/30 pointer-events-none" />

                    {/* Boll */}
                    <div
                      style={{
                        left: `${SCENARIO_OFFSETS[scenario].ball.x}%`,
                        top: `${SCENARIO_OFFSETS[scenario].ball.y}%`,
                      }}
                      className="absolute -translate-x-1/2 -translate-y-1/2 z-20 w-7 h-7 rounded-full bg-white shadow-lg flex items-center justify-center text-sm transition-all duration-500"
                    >
                      ⚽
                    </div>

                    {pitchPlayers.map((player, idx) => {
                      const slot = slots[player.slotIndex] ?? slots[0];
                      const x =
                        slot.xPct + (SCENARIO_OFFSETS[scenario].dx[idx] ?? 0);
                      const y =
                        slot.yPct + (SCENARIO_OFFSETS[scenario].dy[idx] ?? 0);
                      return (
                        <div
                          key={player.id}
                          style={{ left: `${x}%`, top: `${y}%` }}
                          className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center transition-all duration-500"
                        >
                          <div className="rounded-full bg-white p-0.5 shadow-md">
                            <PlayerAvatar
                              name={player.name}
                              number={player.number}
                              avatarUrl={player.avatarUrl}
                              isGoalkeeper={player.isGoalkeeper}
                              size="sm"
                            />
                          </div>
                          <span className="mt-1 px-2 py-0.5 rounded-full bg-white text-slate-900 text-[10px] font-bold shadow">
                            {slot.code} · {player.name}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Kort förklaring till Jocke & Lars */}
              <div className="bg-sky-50/90 border border-sky-200 rounded-xl p-3 text-xs text-slate-700 leading-relaxed">
                <strong className="text-[#005CB9] block mb-0.5">
                  Förslag 1: Svenskalag Clean (Ljus Föreningsapp)
                </strong>
                Samma ljusa, rena kortspråk och Värmbols-blå topplist som i
                Svenskalag-appen i mobilen. Alla blinkande CM-ramar, gula
                tickers och småknappar är bortstädade. Superlätt att läsa ute i
                dagsljus på Värmbols IP.
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            FÖRSLAG 2: APPLE SPORTS / FIXTURED (MOBBIN MODERN DARK GLASS)
           =================================================================== */}
        {theme === "mobbin" && (
          <div className="bg-gradient-to-b from-[#0F1B3D] via-[#0B132B] to-[#090D16] text-white sm:rounded-[28px] overflow-hidden shadow-2xl border border-white/10">
            {/* Fixtured / Apple Sports Top Header */}
            <header className="px-4 pt-4 pb-3 text-center relative">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 border border-white/10 text-[11px] font-medium text-sky-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  7 mot 7 · Period 2
                </span>

                <button
                  type="button"
                  onClick={() =>
                    setFormation((f) => (f === "1-4-1" ? "1-1-3-1" : "1-4-1"))
                  }
                  className="px-3 py-1 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 text-[11px] font-semibold text-white flex items-center gap-1 transition"
                >
                  <span>{formation}</span>
                  <span className="text-sky-300">
                    ({formation === "1-4-1" ? "Lars" : "Jocke"}) ⇄
                  </span>
                </button>
              </div>

              {/* Fixtured / Apple News Centrerad Matchklocka & Resultat */}
              <div className="mt-3 flex items-center justify-between px-4 py-3 rounded-2xl bg-white/[0.06] backdrop-blur-md border border-white/10">
                <div className="flex items-center gap-2.5 text-left">
                  <div className="w-10 h-10 rounded-full bg-white/10 p-1.5 border border-white/15 flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/club/varmbol-logo-white.png"
                      alt="VFC"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">
                      Värmbol
                    </div>
                    <div className="text-[10px] text-slate-400">P2017</div>
                  </div>
                </div>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setIsRunning((r) => !r)}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-semibold tabular-nums"
                  >
                    {isRunning ? (
                      <Pause className="w-3 h-3 fill-emerald-300" />
                    ) : (
                      <Play className="w-3 h-3 fill-emerald-300" />
                    )}
                    <span>
                      {mm}:{ss}
                    </span>
                  </button>
                  <div className="text-2xl font-bold tracking-tight text-white tabular-nums mt-0.5">
                    4 – 2
                  </div>
                </div>

                <div className="flex items-center gap-2.5 text-right">
                  <div>
                    <div className="text-xs font-bold text-white">
                      IFK Norrk.
                    </div>
                    <div className="text-[10px] text-slate-400">Borta</div>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-xs font-bold text-sky-200">
                    IFK
                  </div>
                </div>
              </div>
            </header>

            <div className="px-3.5 pb-4 space-y-3">
              {subView === "match" ? (
                <>
                  {/* Frostat Glaskort för Direktbyte */}
                  <div className="rounded-2xl bg-white/[0.06] backdrop-blur-md border border-white/10 p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium text-sky-300 flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        <span>Smart byte (stint 5 min)</span>
                      </div>
                      {justSubbedBanner ? (
                        <div className="text-xs font-semibold text-emerald-300 mt-0.5 truncate">
                          ✓ {justSubbedBanner}
                        </div>
                      ) : canConfirmSub ? (
                        <div className="text-xs text-slate-200 mt-0.5 truncate">
                          <span className="text-rose-300">
                            Ut: {selectedOutNames.join(", ")}
                          </span>{" "}
                          →{" "}
                          <span className="text-emerald-300 font-semibold">
                            In: {selectedInNames.join(", ")}
                          </span>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400 mt-0.5">
                          Välj spelare eller tryck Föreslå 2x
                        </div>
                      )}
                    </div>

                    {canConfirmSub ? (
                      <button
                        type="button"
                        onClick={handleExecuteSub}
                        className="px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs shrink-0 shadow-lg shadow-sky-500/20 transition active:scale-95"
                      >
                        Byt nu ({selectedOutIds.length})
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleSuggest2x}
                        className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold text-xs shrink-0 border border-white/10 transition"
                      >
                        Föreslå 2x
                      </button>
                    )}
                  </div>

                  {/* Modern Mörkgrön iOS-plan utan retro-ränder */}
                  <div className="relative h-[340px] rounded-2xl bg-gradient-to-b from-[#134E32] to-[#0E3A25] border border-white/15 overflow-hidden shadow-inner">
                    <div className="absolute inset-3 border border-white/15 rounded-xl pointer-events-none" />
                    <div className="absolute inset-x-3 top-1/2 h-px bg-white/15 pointer-events-none" />
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full border border-white/15 pointer-events-none" />
                    <div className="absolute left-1/2 -translate-x-1/2 top-3 w-28 h-7 border-b border-x border-white/15 pointer-events-none" />
                    <div className="absolute left-1/2 -translate-x-1/2 bottom-3 w-32 h-10 border-t border-x border-white/15 pointer-events-none" />

                    {pitchPlayers.map((player) => {
                      const slot = slots[player.slotIndex] ?? slots[0];
                      const isSelectedOut = selectedOutIds.includes(player.id);
                      return (
                        <button
                          key={player.id}
                          type="button"
                          onClick={() => toggleOut(player.id)}
                          style={{
                            left: `${slot.xPct}%`,
                            top: `${slot.yPct}%`,
                          }}
                          className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center focus:outline-none"
                        >
                          <div
                            className={`relative rounded-full p-0.5 transition-all ${
                              isSelectedOut
                                ? "ring-2 ring-rose-400 bg-rose-500/30 scale-105"
                                : "ring-1 ring-white/40 bg-slate-900/60 backdrop-blur-sm"
                            }`}
                          >
                            <PlayerAvatar
                              name={player.name}
                              number={player.number}
                              avatarUrl={player.avatarUrl}
                              isGoalkeeper={player.isGoalkeeper}
                              size="md"
                            />
                            <span className="absolute -top-1 -right-1 px-1.5 py-[1px] rounded-full bg-slate-900/90 border border-white/20 text-sky-300 text-[9px] font-semibold">
                              {slot.code}
                            </span>
                          </div>
                          <div
                            className={`mt-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium backdrop-blur-md border flex items-center gap-1 ${
                              isSelectedOut
                                ? "bg-rose-500/90 text-white border-rose-300 font-semibold"
                                : "bg-slate-950/75 text-white border-white/15"
                            }`}
                          >
                            <span>{player.name}</span>
                            <span className="text-[10px] text-sky-300 tabular-nums">
                              {player.stintMin}′
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Avbytare i frostade iOS-piller */}
                  <div className="rounded-2xl bg-white/[0.05] border border-white/10 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-slate-300">
                        Bänk · Redo att byta in
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Tryck för inbyte
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {benchPlayers.map((player) => {
                        const isSelectedIn = selectedInIds.includes(player.id);
                        return (
                          <button
                            key={player.id}
                            type="button"
                            onClick={() => toggleIn(player.id)}
                            className={`p-2 rounded-xl border text-left flex items-center gap-2.5 transition ${
                              isSelectedIn
                                ? "bg-emerald-500/20 border-emerald-400/60 text-white"
                                : "bg-white/[0.04] border-white/10 text-slate-200 hover:bg-white/[0.08]"
                            }`}
                          >
                            <PlayerAvatar
                              name={player.name}
                              number={player.number}
                              avatarUrl={player.avatarUrl}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <div className="text-xs font-semibold truncate">
                                {player.name}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                Bänk {player.benchMin}′ · Spelat{" "}
                                {player.playMin}′
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : (
                /* MOBBIN GLASS TAKTIKTAVLA */
                <div className="rounded-2xl bg-white/[0.06] border border-white/10 p-3 space-y-3">
                  <div className="grid grid-cols-4 gap-1.5">
                    {(
                      Object.keys(SCENARIO_OFFSETS) as TacticScenarioId[]
                    ).map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setScenario(key)}
                        className={`py-2 px-2 rounded-xl text-[11px] font-semibold border transition ${
                          scenario === key
                            ? "bg-sky-500 text-slate-950 border-sky-400"
                            : "bg-white/5 text-slate-300 border-white/10 hover:bg-white/10"
                        }`}
                      >
                        {SCENARIO_OFFSETS[key].label}
                      </button>
                    ))}
                  </div>
                  <div className="relative h-[340px] rounded-2xl bg-gradient-to-b from-[#134E32] to-[#0E3A25] border border-white/15 overflow-hidden">
                    <div className="absolute inset-3 border border-white/15 rounded-xl pointer-events-none" />
                    <div className="absolute inset-x-3 top-1/2 h-px bg-white/15 pointer-events-none" />
                    <div
                      style={{
                        left: `${SCENARIO_OFFSETS[scenario].ball.x}%`,
                        top: `${SCENARIO_OFFSETS[scenario].ball.y}%`,
                      }}
                      className="absolute -translate-x-1/2 -translate-y-1/2 z-20 w-7 h-7 rounded-full bg-white shadow-lg flex items-center justify-center text-sm transition-all duration-500"
                    >
                      ⚽
                    </div>
                    {pitchPlayers.map((player, idx) => {
                      const slot = slots[player.slotIndex] ?? slots[0];
                      const x =
                        slot.xPct + (SCENARIO_OFFSETS[scenario].dx[idx] ?? 0);
                      const y =
                        slot.yPct + (SCENARIO_OFFSETS[scenario].dy[idx] ?? 0);
                      return (
                        <div
                          key={player.id}
                          style={{ left: `${x}%`, top: `${y}%` }}
                          className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center transition-all duration-500"
                        >
                          <PlayerAvatar
                            name={player.name}
                            number={player.number}
                            avatarUrl={player.avatarUrl}
                            isGoalkeeper={player.isGoalkeeper}
                            size="sm"
                          />
                          <span className="mt-1 px-2 py-0.5 rounded-full bg-slate-950/80 border border-white/15 text-white text-[10px] font-medium">
                            {slot.code} · {player.name}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Apple News / Fixtured Floating Glass Pill Bar längst ner */}
              <div className="pt-1 flex justify-center">
                <div className="inline-flex items-center gap-1 p-1 rounded-full bg-white/10 backdrop-blur-xl border border-white/15 shadow-lg">
                  <button
                    type="button"
                    onClick={() => setSubView("match")}
                    className={`px-5 py-2 rounded-full text-xs font-semibold flex items-center gap-1.5 transition ${
                      subView === "match"
                        ? "bg-white text-slate-950 shadow"
                        : "text-slate-300 hover:text-white"
                    }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span>Spel & Byten</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubView("tactics")}
                    className={`px-5 py-2 rounded-full text-xs font-semibold flex items-center gap-1.5 transition ${
                      subView === "tactics"
                        ? "bg-white text-slate-950 shadow"
                        : "text-slate-300 hover:text-white"
                    }`}
                  >
                    <Compass className="w-3.5 h-3.5" />
                    <span>Taktiktavla</span>
                  </button>
                </div>
              </div>

              <div className="bg-white/[0.05] border border-white/10 rounded-xl p-3 text-xs text-slate-300 leading-relaxed">
                <strong className="text-sky-300 block mb-0.5">
                  Förslag 2: Mobbin Sports Glass (Fixtured & Apple Sports)
                </strong>
                Inspirerat av{" "}
                <span className="underline decoration-sky-400/50">
                  Fixtured
                </span>
                ,{" "}
                <span className="underline decoration-sky-400/50">
                  Apple News Sports
                </span>{" "}
                och{" "}
                <span className="underline decoration-sky-400/50">WHOOP</span>{" "}
                på Mobbin. Behåller mörkt läge men ersätter alla skarpa gula
                CM-kanter med mjuk marinblå/skiffer, frostade glaskort och en
                svävande bottenmeny för tummen.
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            FÖRSLAG 3: SIDELINE NORDIC (AVSKALAD TAKTIKTAVLA & TRÄNARMAPP)
           =================================================================== */}
        {theme === "nordic" && (
          <div className="bg-[#F6F5F2] text-slate-900 sm:rounded-[28px] overflow-hidden shadow-2xl border border-stone-300">
            {/* Superkompakt, regnsäker Tränar-topp */}
            <header className="bg-[#111827] text-white px-3.5 py-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsRunning((r) => !r)}
                  className={`h-11 px-3.5 rounded-xl font-bold text-sm flex items-center gap-2 transition active:scale-95 ${
                    isRunning
                      ? "bg-emerald-500 text-slate-950"
                      : "bg-amber-400 text-slate-950"
                  }`}
                >
                  {isRunning ? (
                    <Pause className="w-4 h-4 fill-slate-950" />
                  ) : (
                    <Play className="w-4 h-4 fill-slate-950" />
                  )}
                  <span className="tabular-nums text-base font-extrabold">
                    {mm}:{ss}
                  </span>
                </button>
                <div>
                  <div className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider">
                    P2 · VFC 4–2 IFK
                  </div>
                  <div className="text-xs font-bold text-white">
                    {formation === "1-4-1"
                      ? "1-4-1 · Lars Sidopar"
                      : "1-1-3-1 · Jockes Ankare"}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setFormation((f) => (f === "1-4-1" ? "1-1-3-1" : "1-4-1"))
                  }
                  className="h-11 px-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-bold text-white flex items-center gap-1"
                >
                  <span>{formation}</span>
                  <span className="text-emerald-400">⇄</span>
                </button>

                <button
                  type="button"
                  onClick={() => setRainLock((r) => !r)}
                  className={`h-11 px-3 rounded-xl border text-xs font-bold flex items-center gap-1 transition ${
                    rainLock
                      ? "bg-sky-400 text-slate-950 border-sky-200"
                      : "bg-white/5 text-stone-300 border-white/10"
                  }`}
                  title="Regnlås"
                >
                  {rainLock ? (
                    <Lock className="w-4 h-4" />
                  ) : (
                    <Unlock className="w-4 h-4" />
                  )}
                </button>
              </div>
            </header>

            <div className="p-3 space-y-2.5">
              {subView === "match" ? (
                <>
                  {/* Matt Nordisk Taktiktavla i centrum (Stora, rena magnetbrickor) */}
                  <div className="relative h-[360px] rounded-2xl bg-[#1B4332] border-2 border-[#112A20] overflow-hidden shadow-md">
                    <div className="absolute inset-3 border-2 border-white/25 rounded-xl pointer-events-none" />
                    <div className="absolute inset-x-3 top-1/2 h-0.5 bg-white/25 pointer-events-none" />
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full border-2 border-white/25 pointer-events-none" />

                    {/* Magnetiska spelarbrickor med maximal läsbarhet i regn */}
                    {pitchPlayers.map((player) => {
                      const slot = slots[player.slotIndex] ?? slots[0];
                      const isSelectedOut = selectedOutIds.includes(player.id);
                      return (
                        <button
                          key={player.id}
                          type="button"
                          onClick={() => toggleOut(player.id)}
                          style={{
                            left: `${slot.xPct}%`,
                            top: `${slot.yPct}%`,
                          }}
                          className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center focus:outline-none"
                        >
                          <div
                            className={`px-3 py-1.5 rounded-2xl shadow-md border-2 transition-transform flex items-center gap-1.5 ${
                              isSelectedOut
                                ? "bg-amber-400 text-slate-950 border-white scale-105"
                                : player.isGoalkeeper
                                ? "bg-amber-100 text-slate-900 border-amber-400"
                                : "bg-white text-slate-900 border-stone-200"
                            }`}
                          >
                            <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-md bg-slate-900 text-white">
                              {slot.code}
                            </span>
                            <div className="text-left leading-tight">
                              <div className="text-xs font-extrabold">
                                {player.name}
                              </div>
                              <div className="text-[10px] font-semibold text-slate-500 tabular-nums">
                                Inne {player.stintMin}m
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* 1-Trycks Bytespanel + Bänk i samma rena kort */}
                  <div className="bg-white rounded-2xl p-3 border border-stone-200 shadow-sm space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wide">
                        Bänk ({benchPlayers.length})
                      </span>
                      <button
                        type="button"
                        onClick={handleSuggest2x}
                        className="px-2.5 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-slate-800 text-xs font-bold transition"
                      >
                        Föreslå nästa 2x
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {benchPlayers.map((player) => {
                        const isSelectedIn = selectedInIds.includes(player.id);
                        return (
                          <button
                            key={player.id}
                            type="button"
                            onClick={() => toggleIn(player.id)}
                            className={`p-2.5 rounded-xl border-2 text-left flex items-center justify-between transition ${
                              isSelectedIn
                                ? "bg-emerald-50 border-emerald-600 text-slate-900"
                                : "bg-stone-50 border-stone-200 text-slate-800"
                            }`}
                          >
                            <div>
                              <div className="text-xs font-extrabold">
                                {player.name}
                              </div>
                              <div className="text-[11px] text-slate-500 font-medium">
                                Vilat {player.benchMin}m
                              </div>
                            </div>
                            <span
                              className={`px-2 py-1 rounded-lg text-[10px] font-extrabold ${
                                isSelectedIn
                                  ? "bg-emerald-600 text-white"
                                  : "bg-stone-200 text-slate-700"
                              }`}
                            >
                              {isSelectedIn ? "VALD IN" : "VÄLJ"}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {canConfirmSub && (
                      <button
                        type="button"
                        onClick={handleExecuteSub}
                        className="w-full py-3 rounded-xl bg-[#111827] hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-2 shadow transition active:scale-[0.99]"
                      >
                        <ArrowLeftRight className="w-4 h-4 text-emerald-400" />
                        <span>
                          Byt ut {selectedOutNames.join(" & ")} → In med{" "}
                          {selectedInNames.join(" & ")}
                        </span>
                      </button>
                    )}
                  </div>
                </>
              ) : (
                /* NORDIC TAKTIKTAVLA */
                <div className="space-y-2.5">
                  <div className="grid grid-cols-4 gap-1.5">
                    {(
                      Object.keys(SCENARIO_OFFSETS) as TacticScenarioId[]
                    ).map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setScenario(key)}
                        className={`py-2.5 px-2 rounded-xl text-[11px] font-bold border transition ${
                          scenario === key
                            ? "bg-[#111827] text-white border-[#111827]"
                            : "bg-white text-slate-700 border-stone-200"
                        }`}
                      >
                        {SCENARIO_OFFSETS[key].label}
                      </button>
                    ))}
                  </div>
                  <div className="relative h-[360px] rounded-2xl bg-[#1B4332] border-2 border-[#112A20] overflow-hidden">
                    <div className="absolute inset-3 border-2 border-white/25 rounded-xl pointer-events-none" />
                    <div className="absolute inset-x-3 top-1/2 h-0.5 bg-white/25 pointer-events-none" />
                    <div
                      style={{
                        left: `${SCENARIO_OFFSETS[scenario].ball.x}%`,
                        top: `${SCENARIO_OFFSETS[scenario].ball.y}%`,
                      }}
                      className="absolute -translate-x-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center text-base transition-all duration-500"
                    >
                      ⚽
                    </div>
                    {pitchPlayers.map((player, idx) => {
                      const slot = slots[player.slotIndex] ?? slots[0];
                      const x =
                        slot.xPct + (SCENARIO_OFFSETS[scenario].dx[idx] ?? 0);
                      const y =
                        slot.yPct + (SCENARIO_OFFSETS[scenario].dy[idx] ?? 0);
                      return (
                        <div
                          key={player.id}
                          style={{ left: `${x}%`, top: `${y}%` }}
                          className="absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-500"
                        >
                          <div className="px-2.5 py-1.5 rounded-xl bg-white text-slate-900 shadow-md border border-stone-200 flex items-center gap-1.5">
                            <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-slate-900 text-white">
                              {slot.code}
                            </span>
                            <span className="text-xs font-extrabold">
                              {player.name}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Stora Regnsäkra Bottenknappar (bara de 2 saker som används vid sidlinjen!) */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setSubView("match")}
                  className={`min-h-[50px] rounded-xl font-bold text-xs flex items-center justify-center gap-2 border-2 transition ${
                    subView === "match"
                      ? "bg-[#111827] text-white border-[#111827] shadow-sm"
                      : "bg-white text-slate-700 border-stone-200"
                  }`}
                >
                  <LayoutGrid className="w-4 h-4" />
                  <span>1. Spel & Byten</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSubView("tactics")}
                  className={`min-h-[50px] rounded-xl font-bold text-xs flex items-center justify-center gap-2 border-2 transition ${
                    subView === "tactics"
                      ? "bg-[#111827] text-white border-[#111827] shadow-sm"
                      : "bg-white text-slate-700 border-stone-200"
                  }`}
                >
                  <Compass className="w-4 h-4" />
                  <span>2. Taktiktavla</span>
                </button>
              </div>

              <div className="bg-stone-200/70 border border-stone-300 rounded-xl p-3 text-xs text-slate-700 leading-relaxed">
                <strong className="text-slate-900 block mb-0.5">
                  Förslag 3: Sideline Clean (Ren Taktiktavla & Regnsäker)
                </strong>
                Byggt för kalla fingrar, duggregn och surfplatta/mobil vid
                sidlinjen. Inga små ikoner – bara stora vita magnetbrickor med{" "}
                <strong>Roll + Namn + Minuter inne</strong> och två stora
                tumknappar längst ner.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
