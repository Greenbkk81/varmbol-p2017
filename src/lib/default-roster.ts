import { RosterPlayer, TacticalFormation } from "./types";

export const DEFAULT_ROSTER: RosterPlayer[] = [
  {
    id: "p-abdoulaye",
    name: "Abdullahi",
    number: "1",
    avatarUrl: "/players/abdoulaye.jpg",
    activeInSquad: true,
  },
  {
    id: "p-bilel",
    name: "Bilel",
    number: "2",
    activeInSquad: true,
  },
  {
    id: "p-edvin",
    name: "Edvin",
    number: "4",
    avatarUrl: "/players/edvin.jpg",
    activeInSquad: true,
  },
  {
    id: "p-gabriel",
    name: "Gabriel",
    number: "7",
    avatarUrl: "/players/gabriel.jpg",
    activeInSquad: true,
  },
  {
    id: "p-holger",
    name: "Holger",
    number: "8",
    avatarUrl: "/players/holger.jpg",
    activeInSquad: true,
  },
  {
    id: "p-kasper",
    name: "Kasper",
    number: "6",
    activeInSquad: true,
  },
  {
    id: "p-lukas",
    name: "Lukas",
    number: "9",
    activeInSquad: true,
  },
  {
    id: "p-mahir",
    name: "Mahir",
    number: "10",
    activeInSquad: true,
  },
  {
    id: "p-mille",
    name: "Mille",
    number: "11",
    activeInSquad: true,
  },
  {
    id: "p-oliver",
    name: "Oliver",
    number: "5",
    avatarUrl: "/players/oliver.jpg",
    activeInSquad: true,
  },
  {
    id: "p-oscar",
    name: "Oscar",
    number: "3",
    avatarUrl: "/players/oscar.jpg",
    activeInSquad: true,
  },
  {
    id: "p-scott",
    name: "Scott",
    number: "12",
    activeInSquad: true,
  },
  { id: "p-charlie", name: "Charlie", activeInSquad: true },
  { id: "p-ebbe", name: "Ebbe", activeInSquad: true },
];

export const POSITION_LABELS: Record<string, string> = {
  MV: "Målvakt",
  LIB: "Libero",
  VB: "Vänsterback",
  HB: "Högerback",
  MB: "Mittback",
  VM: "Vänstermitt",
  HM: "Högermitt",
  IMV: "Innermitt V",
  IMH: "Innermitt H",
  CM: "Central mitt",
  FW: "Forward",
  FWM: "Anfall V",
  FWH: "Anfall H",
  FWV: "Anfall V",
};

export interface TacticalSlot {
  slotIndex: number;
  code: string; // t.ex. "MV", "MB", "VM", "IM", "HM", "FW"
  label: string; // t.ex. "Målvakt", "Libero / Back", "Vänstermitt"
  xPct: number; // 0..100 horisontellt på planen
  yPct: number; // 0..100 vertikalt (topp = anfall, botten = eget mål)
}

export const FORMATION_SLOTS: Record<TacticalFormation, TacticalSlot[]> = {
  "1-4-1": [
    { slotIndex: 0, code: "MV", label: "Målvakt", xPct: 50, yPct: 88 },
    { slotIndex: 1, code: "LIB", label: "Ankare / Back", xPct: 50, yPct: 68 },
    { slotIndex: 2, code: "VM", label: "Vänstermitt", xPct: 16, yPct: 44 },
    { slotIndex: 3, code: "IMV", label: "Innermitt V", xPct: 39, yPct: 47 },
    { slotIndex: 4, code: "IMH", label: "Innermitt H", xPct: 61, yPct: 47 },
    { slotIndex: 5, code: "HM", label: "Högermitt", xPct: 84, yPct: 44 },
    { slotIndex: 6, code: "FW", label: "Forward / Spets", xPct: 50, yPct: 18 },
  ],
  "2-3-1": [
    { slotIndex: 0, code: "MV", label: "Målvakt", xPct: 50, yPct: 88 },
    { slotIndex: 1, code: "VB", label: "Vänsterback", xPct: 30, yPct: 68 },
    { slotIndex: 2, code: "HB", label: "Högerback", xPct: 70, yPct: 68 },
    { slotIndex: 3, code: "VM", label: "Vänstermitt", xPct: 18, yPct: 43 },
    { slotIndex: 4, code: "CM", label: "Central mitt", xPct: 50, yPct: 45 },
    { slotIndex: 5, code: "HM", label: "Högermitt", xPct: 82, yPct: 43 },
    { slotIndex: 6, code: "FW", label: "Forward", xPct: 50, yPct: 18 },
  ],
  "2-2-2": [
    { slotIndex: 0, code: "MV", label: "Målvakt", xPct: 50, yPct: 88 },
    { slotIndex: 1, code: "VB", label: "Vänsterback", xPct: 30, yPct: 68 },
    { slotIndex: 2, code: "HB", label: "Högerback", xPct: 70, yPct: 68 },
    { slotIndex: 3, code: "VM", label: "Vänstermitt", xPct: 26, yPct: 44 },
    { slotIndex: 4, code: "HM", label: "Högermitt", xPct: 74, yPct: 44 },
    { slotIndex: 5, code: "FWM", label: "Anfall V", xPct: 34, yPct: 20 },
    { slotIndex: 6, code: "FWH", label: "Anfall H", xPct: 66, yPct: 20 },
  ],
  "3-2-1": [
    { slotIndex: 0, code: "MV", label: "Målvakt", xPct: 50, yPct: 88 },
    { slotIndex: 1, code: "VB", label: "Vänsterback", xPct: 20, yPct: 68 },
    { slotIndex: 2, code: "MB", label: "Mittback", xPct: 50, yPct: 70 },
    { slotIndex: 3, code: "HB", label: "Högerback", xPct: 80, yPct: 68 },
    { slotIndex: 4, code: "IMV", label: "Mittfält V", xPct: 34, yPct: 43 },
    { slotIndex: 5, code: "IMH", label: "Mittfält H", xPct: 66, yPct: 43 },
    { slotIndex: 6, code: "FW", label: "Forward", xPct: 50, yPct: 18 },
  ],
  "1-2-1": [
    { slotIndex: 0, code: "MV", label: "Målvakt", xPct: 50, yPct: 86 },
    { slotIndex: 1, code: "MB", label: "Back", xPct: 50, yPct: 64 },
    { slotIndex: 2, code: "VM", label: "Vänster", xPct: 24, yPct: 42 },
    { slotIndex: 3, code: "HM", label: "Höger", xPct: 76, yPct: 42 },
    { slotIndex: 4, code: "FW", label: "Forward", xPct: 50, yPct: 20 },
  ],
  "2-2": [
    { slotIndex: 0, code: "MV", label: "Målvakt", xPct: 50, yPct: 86 },
    { slotIndex: 1, code: "VB", label: "Back V", xPct: 30, yPct: 62 },
    { slotIndex: 2, code: "HB", label: "Back H", xPct: 70, yPct: 62 },
    { slotIndex: 3, code: "FWV", label: "Anfall V", xPct: 30, yPct: 26 },
    { slotIndex: 4, code: "FWH", label: "Anfall H", xPct: 70, yPct: 26 },
  ],
};

export const QUICK_OPPONENTS = [
  "IK Sleipner",
  "IFK Norrköping",
  "Katrineholms AIK",
  "Katrineholms SK",
  "Flens IF-Södra",
  "Vingåkers IF",
  "Smedby AIS",
  "Lindö FF",
];

export interface PresetEvent {
  id: string;
  title: string;
  subtitle: string;
  opponent: string;
  location: "Hemma" | "Borta" | "Cup";
  format: "7v7" | "5v5";
  formation: TacticalFormation;
  periods: number;
  periodMinutes: number;
}

export const PRESET_EVENTS: PresetEvent[] = [
  {
    id: "sleipner-cup",
    title: "Provcup 7v7 Norrköping (IK Sleipner)",
    subtitle: "Sön 25 okt · Samling 08:00 Värmbols IP · 1-4-1",
    opponent: "IK Sleipner",
    location: "Cup",
    format: "7v7",
    formation: "1-4-1",
    periods: 2,
    periodMinutes: 25,
  },
  {
    id: "seriematch-7v7",
    title: "Sjumanna 3×15 min (1-4-1)",
    subtitle: "Standard 7v7 med 3 perioder",
    opponent: "Katrineholms AIK",
    location: "Hemma",
    format: "7v7",
    formation: "1-4-1",
    periods: 3,
    periodMinutes: 15,
  },
  {
    id: "cupmatch-2x25",
    title: "Sjumanna 2×25 min (1-4-1)",
    subtitle: "Två halvlekar à 25 min",
    opponent: "Katrineholms SK",
    location: "Hemma",
    format: "7v7",
    formation: "1-4-1",
    periods: 2,
    periodMinutes: 25,
  },
  {
    id: "femmanna-3x15",
    title: "Femmanna 3×15 min (1-2-1)",
    subtitle: "4 utespelare + 1 målvakt",
    opponent: "Vingåkers IF",
    location: "Hemma",
    format: "5v5",
    formation: "1-2-1",
    periods: 3,
    periodMinutes: 15,
  },
];

