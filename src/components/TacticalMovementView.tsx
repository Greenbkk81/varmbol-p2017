"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Compass,
  Hand,
  Pause,
  Play,
  RotateCcw,
  Shield,
  Sparkles,
  Target,
  Zap,
} from "lucide-react";
import { TacticalFormation } from "@/lib/types";
import { FORMATION_SLOTS } from "@/lib/default-roster";

export interface PitchPlayerToken {
  id: string;
  name: string;
  number?: string;
  isGoalkeeper: boolean;
  pitchSlotIndex?: number;
}

interface TacticalMovementViewProps {
  currentFormation: TacticalFormation;
  onSelectFormation: (fmt: TacticalFormation) => void;
  pitchPlayers: PitchPlayerToken[];
  disabled?: boolean;
}

interface SlotMove {
  slotIndex: number;
  code: string;
  roleTitle: string;
  partnerLabel: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  actionBadge: string;
  attackTask: string;
  defenseTask: string;
  scenarioNote: string;
  zoneColor: "yellow" | "sky" | "emerald" | "amber";
}

interface TacticalScenario {
  id: string;
  title: string;
  shortTitle: string;
  badge: string;
  summary: string;
  coachKeyPoint: string;
  ballX: number;
  ballY: number;
  moves: SlotMove[];
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

const SCENARIOS_1_4_1: TacticalScenario[] = [
  {
    id: "base",
    title: "1. Grundposition · Vänsterpar & Högerpar",
    shortTitle: "⚖️ Grundposition",
    badge: "UTGÅNGSLÄGE",
    summary:
      "Fyra mittfältare uppdelade i två tydliga par: Vänsterparet (VM + IMV) har hela vänstersidan tillsammans och Högerparet (IMH + HM) har hela högersidan tillsammans.",
    coachKeyPoint:
      "Tänk att du och din kantkompis sitter ihop i ett gummiband! Ingen lämnar sin sida helt ensam.",
    ballX: 50,
    ballY: 50,
    moves: [
      {
        slotIndex: 0,
        code: "MV",
        roleTitle: "Målvakt",
        partnerLabel: "Samarbetar med Back (LIB)",
        fromX: 50,
        fromY: 88,
        toX: 50,
        toY: 88,
        actionBadge: "Styr bakifrån",
        attackTask: "Sätt igång spelet snabbt ut mot kantparen eller via backen.",
        defenseTask: "Prata högt och styr backen var faran finns.",
        scenarioNote: "Redo på linjen och spelbar bakåt.",
        zoneColor: "amber",
      },
      {
        slotIndex: 1,
        code: "LIB",
        roleTitle: "Back / Sista man",
        partnerLabel: "Styr mitten bakom IMV & IMH",
        fromX: 50,
        fromY: 70,
        toX: 50,
        toY: 70,
        actionBadge: "Låser mitten",
        attackTask: "Var spelbar bakåt och vänd spelet från ena sidan till den andra.",
        defenseTask: "Skydda ytan framför mål — gå inte bort dig ute vid hörnflaggan.",
        scenarioNote: "Står centralt framför målvakten och läser spelet.",
        zoneColor: "emerald",
      },
      {
        slotIndex: 2,
        code: "VM",
        roleTitle: "Vänsterytter (Vänsterpar)",
        partnerLabel: "Kompis med CM Vänster (IMV)",
        fromX: 16,
        fromY: 42,
        toX: 16,
        toY: 42,
        actionBadge: "Vänsterpar",
        attackTask: "Håll bredden till vänster, utmana framåt eller skär in mot mål.",
        defenseTask: "Kämpa ihop med CM Vänster (IMV) så vänsterkanten alltid är stängd.",
        scenarioNote: "Håller bredden på vänsterkanten i par med IMV.",
        zoneColor: "yellow",
      },
      {
        slotIndex: 3,
        code: "IMV",
        roleTitle: "CM Vänster (Vänsterpar)",
        partnerLabel: "Kompis med Vänsterytter (VM)",
        fromX: 37,
        fromY: 49,
        toX: 37,
        toY: 49,
        actionBadge: "Vänsterpar",
        attackTask: "Följ med bakom VM som passningsstöd och skjut lägen utanför boxen.",
        defenseTask: "Om VM går fram tar du ansvar snett bakåt (lagom djupt, inte i knät på backen!).",
        scenarioNote: "Snett innanför/bakom VM — redo att både hjälpa framåt och täcka kanten.",
        zoneColor: "yellow",
      },
      {
        slotIndex: 4,
        code: "IMH",
        roleTitle: "CM Höger (Högerpar)",
        partnerLabel: "Kompis med Högerytter (HM)",
        fromX: 63,
        fromY: 49,
        toX: 63,
        toY: 49,
        actionBadge: "Högerpar",
        attackTask: "Följ med bakom HM som passningsstöd eller vänd spelet.",
        defenseTask: "Om HM går fram tar du ansvar snett bakåt så högerkanten aldrig lämnas öppen.",
        scenarioNote: "Snett innanför/bakom HM — håller ihop högersidan.",
        zoneColor: "sky",
      },
      {
        slotIndex: 5,
        code: "HM",
        roleTitle: "Högerytter (Högerpar)",
        partnerLabel: "Kompis med CM Höger (IMH)",
        fromX: 84,
        fromY: 42,
        toX: 84,
        toY: 42,
        actionBadge: "Högerpar",
        attackTask: "Håll bredden till höger, utmana framåt eller kliv in på bortre stolpen.",
        defenseTask: "Kämpa ihop med CM Höger (IMH) om hela högersidan.",
        scenarioNote: "Håller bredden på högerkanten i par med IMH.",
        zoneColor: "sky",
      },
      {
        slotIndex: 6,
        code: "FW",
        roleTitle: "Forward / Spets",
        partnerLabel: "Spelbar i djupet & i boxen",
        fromX: 50,
        fromY: 18,
        toX: 50,
        toY: 18,
        actionBadge: "Hotar i djupet",
        attackTask: "Löpa i djupled och in framför mål när kanterna kommer runt.",
        defenseTask: "Styr motståndarnas uppspel ut mot en kant där våra sidopar väntar.",
        scenarioNote: "Ligger på lur mellan motståndarnas backar.",
        zoneColor: "amber",
      },
    ],
  },
  {
    id: "attack_left",
    title: "2. Anfall Vänster · VM går fram, IMV säkrar bakom",
    shortTitle: "⚡⬅️ Anfall Vänster",
    badge: "VI HAR BOLLEN TILL VÄNSTER",
    summary:
      "När Vänsteryttern (VM) trycker fram med bollen följer CM Vänster (IMV) med snett bakom på vänstersidan (inte förbi och inte ända nere hos backen). Då är kanten säkrad om vi tappar bollen!",
    coachKeyPoint:
      "VM utmanar framåt → IMV säkrar 8–10m snett bakom på vänstersidan → FW och HM (bortre yttern) fyller på framför mål!",
    ballX: 16,
    ballY: 22,
    moves: [
      {
        slotIndex: 0,
        code: "MV",
        roleTitle: "Målvakt",
        partnerLabel: "Samarbetar med Back (LIB)",
        fromX: 50,
        fromY: 88,
        toX: 46,
        toY: 82,
        actionBadge: "Flyttar fram",
        attackTask: "Kliv ut några meter ur målet så du kan ta hand om långa bollar.",
        defenseTask: "Var vaken på omställning.",
        scenarioNote: "Flyttar upp lite och håller koll på djupledsbollar.",
        zoneColor: "amber",
      },
      {
        slotIndex: 1,
        code: "LIB",
        roleTitle: "Back / Sista man",
        partnerLabel: "Täcker bakom mittfältet",
        fromX: 50,
        fromY: 70,
        toX: 42,
        toY: 58,
        actionBadge: "Flyttar upp",
        attackTask: "Följ med upp bakom mittlinjen så laget sitter ihop.",
        defenseTask: "Ha koll på deras forward så ingen ligger bakom din rygg.",
        scenarioNote: "Kliver upp till mittplan men stannar bakom IMV och IMH.",
        zoneColor: "emerald",
      },
      {
        slotIndex: 2,
        code: "VM",
        roleTitle: "Vänsterytter (Vänsterpar)",
        partnerLabel: "Kompis med CM Vänster (IMV)",
        fromX: 16,
        fromY: 42,
        toX: 15,
        toY: 20,
        actionBadge: "DRIVER FRAMÅT ⚽",
        attackTask: "Utmana längs vänsterkanten! Inspel snett inåt, avslut eller passa bakåt till IMV.",
        defenseTask: "Om du tappar bollen: stanna inte och titta, utan pressa direkt 2 sekunder!",
        scenarioNote: "Anfaller med fart på vänsterkanten — har IMV som stöd direkt snett bakom.",
        zoneColor: "yellow",
      },
      {
        slotIndex: 3,
        code: "IMV",
        roleTitle: "CM Vänster (Vänsterpar)",
        partnerLabel: "Säkrar bakom VM!",
        fromX: 37,
        fromY: 49,
        toX: 27,
        toY: 36,
        actionBadge: "SÄKRAR VÄNSTER",
        attackTask: "Följ med snett bakom VM (lagom avstånd!) så VM kan passa bakåt till dig.",
        defenseTask: "Du är nyckeln! Tappar VM bollen står du redan i vägen på vänsterkanten.",
        scenarioNote: "Täcker upp snett bakom VM — lämnar aldrig vänsterkanten öppen!",
        zoneColor: "yellow",
      },
      {
        slotIndex: 4,
        code: "IMH",
        roleTitle: "CM Höger (Högerpar)",
        partnerLabel: "Balanserar mitten",
        fromX: 63,
        fromY: 49,
        toX: 53,
        toY: 40,
        actionBadge: "Spelbar i mitten",
        attackTask: "Kliv in i mitten utanför straffområdet — redo för skott eller spelvändning.",
        defenseTask: "Hjälp LIB att stänga mitten om de rensar ut bollen.",
        scenarioNote: "Kliver in centralt som balans och skottalternativ.",
        zoneColor: "sky",
      },
      {
        slotIndex: 5,
        code: "HM",
        roleTitle: "Högerytter (Högerpar)",
        partnerLabel: "Smyger in på bortre!",
        fromX: 84,
        fromY: 42,
        toX: 68,
        toY: 24,
        actionBadge: "Bortre stolpen!",
        attackTask: "När bollen är på vänsterkanten: kliv in mot bortre stolpen och gör mål på inspel!",
        defenseTask: "Om de vänder spelet till din kant: skynda ut tillsammans med IMH.",
        scenarioNote: "Skär in mot bortre ytan i straffområdet för att trycka in inspelet.",
        zoneColor: "sky",
      },
      {
        slotIndex: 6,
        code: "FW",
        roleTitle: "Forward / Spets",
        partnerLabel: "Första stolpen / Mål",
        fromX: 50,
        fromY: 18,
        toX: 42,
        toY: 14,
        actionBadge: "In framför mål!",
        attackTask: "Rör dig in framför mål mot första stolpen så VM kan passa dig.",
        defenseTask: "Återpressa direkt om målvakten eller backen bryter.",
        scenarioNote: "Löper in i boxen framför mål.",
        zoneColor: "amber",
      },
    ],
  },
  {
    id: "attack_right",
    title: "3. Anfall Höger · HM går fram, IMH säkrar bakom",
    shortTitle: "⚡➡️ Anfall Höger",
    badge: "VI HAR BOLLEN TILL HÖGER",
    summary:
      "Samma regel på högersidan! När Högeryttern (HM) går till anfall tar CM Höger (IMH) ansvar snett bakom på högerkanten. Vänsteryttern (VM) kliver in på bortre stolpen.",
    coachKeyPoint:
      "HM utmanar framåt → IMH säkrar snett bakom på högerkanten → FW och VM går på avslut i boxen!",
    ballX: 84,
    ballY: 22,
    moves: [
      {
        slotIndex: 0,
        code: "MV",
        roleTitle: "Målvakt",
        partnerLabel: "Samarbetar med Back (LIB)",
        fromX: 50,
        fromY: 88,
        toX: 54,
        toY: 82,
        actionBadge: "Flyttar fram",
        attackTask: "Kliv upp några meter och var spelbar.",
        defenseTask: "Redo om det kommer en lång kontringsboll.",
        scenarioNote: "Håller hög utgångsposition.",
        zoneColor: "amber",
      },
      {
        slotIndex: 1,
        code: "LIB",
        roleTitle: "Back / Sista man",
        partnerLabel: "Täcker bakom mittfältet",
        fromX: 50,
        fromY: 70,
        toX: 58,
        toY: 58,
        actionBadge: "Flyttar upp",
        attackTask: "Håll ihop laget strax bakom mittlinjen.",
        defenseTask: "Lås mitten bakom IMV och IMH.",
        scenarioNote: "Flyttar upp och säkrar centralt.",
        zoneColor: "emerald",
      },
      {
        slotIndex: 2,
        code: "VM",
        roleTitle: "Vänsterytter (Vänsterpar)",
        partnerLabel: "Smyger in på bortre!",
        fromX: 16,
        fromY: 42,
        toX: 32,
        toY: 24,
        actionBadge: "Bortre stolpen!",
        attackTask: "Kliv in från vänsterkanten mot bortre stolpen — där dyker returen upp!",
        defenseTask: "Jobba tillbaka till vänsterkanten direkt om vi tappar bollen.",
        scenarioNote: "Fyller på in i straffområdet på bortre stolpen.",
        zoneColor: "yellow",
      },
      {
        slotIndex: 3,
        code: "IMV",
        roleTitle: "CM Vänster (Vänsterpar)",
        partnerLabel: "Balanserar mitten",
        fromX: 37,
        fromY: 49,
        toX: 47,
        toY: 40,
        actionBadge: "Spelbar i mitten",
        attackTask: "Kliv in centralt för skott eller för att vända spelet till vänster.",
        defenseTask: "Täck ytan framför LIB.",
        scenarioNote: "Balanserar i mitten medan VM går in på bortre stolpen.",
        zoneColor: "yellow",
      },
      {
        slotIndex: 4,
        code: "IMH",
        roleTitle: "CM Höger (Högerpar)",
        partnerLabel: "Säkrar bakom HM!",
        fromX: 63,
        fromY: 49,
        toX: 73,
        toY: 36,
        actionBadge: "SÄKRAR HÖGER",
        attackTask: "Följ med snett bakom HM som enkel passningsväg.",
        defenseTask: "Stanna på rätt sida! Går HM fram håller du högerkanten stängd bakåt.",
        scenarioNote: "Säkrar högerkanten snett bakom HM — lagom djupt!",
        zoneColor: "sky",
      },
      {
        slotIndex: 5,
        code: "HM",
        roleTitle: "Högerytter (Högerpar)",
        partnerLabel: "Kompis med CM Höger (IMH)",
        fromX: 84,
        fromY: 42,
        toX: 85,
        toY: 20,
        actionBadge: "DRIVER FRAMÅT ⚽",
        attackTask: "Ta fart längs högerkanten, spela snett inåt bakåt eller avsluta!",
        defenseTask: "Om du tappar bollen: pressa direkt medan IMH täcker bakom dig.",
        scenarioNote: "Anfaller på högerkanten med IMH som säkring bakom.",
        zoneColor: "sky",
      },
      {
        slotIndex: 6,
        code: "FW",
        roleTitle: "Forward / Spets",
        partnerLabel: "Första stolpen / Mål",
        fromX: 50,
        fromY: 18,
        toX: 58,
        toY: 14,
        actionBadge: "In framför mål!",
        attackTask: "Möt inspelet framför mål!",
        defenseTask: "Förhindra snabb kontring.",
        scenarioNote: "Attackerar ytan framför mål.",
        zoneColor: "amber",
      },
    ],
  },
  {
    id: "defense_flank",
    title: "4. Försvar & Omställning · En pressar, kompisen täcker!",
    shortTitle: "🛡️ Försvar (Kantpar)",
    badge: "MOTSTÅNDAREN HAR BOLLEN",
    summary:
      "När motståndaren anfaller på en kant jobbar kantparet tillsammans: en sätter press på bollhållaren och kompisen i paret täcker ytan snett bakom (utan att sjunka ända ner i knät på backen).",
    coachKeyPoint:
      "Lämna aldrig kanten åt bara en spelare! En stöter på bollen — kompisen stänger passningen/löpningen bakom.",
    ballX: 18,
    ballY: 48,
    moves: [
      {
        slotIndex: 0,
        code: "MV",
        roleTitle: "Målvakt",
        partnerLabel: "Styr försvaret",
        fromX: 50,
        fromY: 88,
        toX: 46,
        toY: 88,
        actionBadge: "Styr & ropar",
        attackTask: "När du tar bollen: titta direkt efter fri kantspelare.",
        defenseTask: "Stäng första stolpen och ropa vem som tar bollen.",
        scenarioNote: "Vaktar målet och styr backen.",
        zoneColor: "amber",
      },
      {
        slotIndex: 1,
        code: "LIB",
        roleTitle: "Back / Sista man",
        partnerLabel: "Skyddar straffområdet",
        fromX: 50,
        fromY: 70,
        toX: 42,
        toY: 72,
        actionBadge: "Vaktar framför mål",
        attackTask: "Redo att spela loss bollen när vi bryter.",
        defenseTask: "Stanna centralt framför mål! Vänsterparet (VM+IMV) sköter kanten.",
        scenarioNote: "Ligger kvar i farliga ytan framför mål så ingen blir fri i mitten.",
        zoneColor: "emerald",
      },
      {
        slotIndex: 2,
        code: "VM",
        roleTitle: "Vänsterytter (Vänsterpar)",
        partnerLabel: "Pressar med IMV bakom",
        fromX: 16,
        fromY: 42,
        toX: 18,
        toY: 44,
        actionBadge: "1:a PRESS PÅ BOLL",
        attackTask: "Vinner du bollen har du FW och IMV direkt spelbara.",
        defenseTask: "Gå fram och ställ dig i vägen för bollhållaren — tvinga dem längs sidlinjen!",
        scenarioNote: "Sätter press på bollhållaren på vänsterkanten.",
        zoneColor: "yellow",
      },
      {
        slotIndex: 3,
        code: "IMV",
        roleTitle: "CM Vänster (Vänsterpar)",
        partnerLabel: "Täcker bakom VM!",
        fromX: 37,
        fromY: 49,
        toX: 28,
        toY: 57,
        actionBadge: "2:a SÄKRAR BAKOM",
        attackTask: "Bryter du passningen: driv framåt eller släpp till VM/FW!",
        defenseTask: "Täck ytan snett bakom VM (inte ända ner till LIB!). Blir VM bortspelad tar du bollen direkt.",
        scenarioNote: "Står snett bakom VM — stänger både kanten och inspel i mitten!",
        zoneColor: "yellow",
      },
      {
        slotIndex: 4,
        code: "IMH",
        roleTitle: "CM Höger (Högerpar)",
        partnerLabel: "Stänger mitten",
        fromX: 63,
        fromY: 49,
        toX: 50,
        toY: 56,
        actionBadge: "Flyttar in i mitten",
        attackTask: "Spelbar för att vända spelet till höger när vi vinner boll.",
        defenseTask: "Glid in i mitten så deras centrala mittfältare inte får bollen fri.",
        scenarioNote: "Täcker upp centralt bredvid IMV.",
        zoneColor: "sky",
      },
      {
        slotIndex: 5,
        code: "HM",
        roleTitle: "Högerytter (Högerpar)",
        partnerLabel: "Kliv in & ha koll på bortre",
        fromX: 84,
        fromY: 42,
        toX: 70,
        toY: 50,
        actionBadge: "Flyttar inåt",
        attackTask: "Så fort vi vinner bollen: bredda snabbt ut till höger för kontring!",
        defenseTask: "Stå inte kvar vid sidlinjen när bollen är på andra kanten — glid in lite och hjälp laget.",
        scenarioNote: "Kryper inåt för att hjälpa mitten men har koll på högerkanten.",
        zoneColor: "sky",
      },
      {
        slotIndex: 6,
        code: "FW",
        roleTitle: "Forward / Spets",
        partnerLabel: "Stänger bakåtpass",
        fromX: 50,
        fromY: 18,
        toX: 38,
        toY: 30,
        actionBadge: "Stänger vändning",
        attackTask: "Ligg på rulle för snabb kontring så fort VM/IMV vinner bollen!",
        defenseTask: "Stäng passningen bakåt till deras back så de fastnar på vår vänsterkant.",
        scenarioNote: "Skär av tillbakapassningen och är redo för kontring.",
        zoneColor: "amber",
      },
    ],
  },
  {
    id: "build_up",
    title: "5. Uppspel från Målvakt · Bredda & visa er i par",
    shortTitle: "🎯 Uppspel MV",
    badge: "MÅLVAKTEN HAR BOLLEN",
    summary:
      "När vår målvakt har bollen: Yttrarna (VM & HM) går hela vägen ut till sidlinjen. Innermittfältarna (IMV & IMH) möter i fickorna snett framför backen så vi har trianglar på båda sidorna!",
    coachKeyPoint:
      "Göm dig aldrig bakom en motståndare! Ta 3 snabba steg ut i en fri yta så målvakten eller backen ser dig.",
    ballX: 50,
    ballY: 86,
    moves: [
      {
        slotIndex: 0,
        code: "MV",
        roleTitle: "Målvakt",
        partnerLabel: "Startar anfallet ⚽",
        fromX: 50,
        fromY: 88,
        toX: 50,
        toY: 86,
        actionBadge: "HAR BOLLEN ⚽",
        attackTask: "Titta upp: Är VM/HM fria på kanten, eller IMV/IMH i fickan?",
        defenseTask: "Stå kvar som säkert tillbakaspel.",
        scenarioNote: "Sätter igång spelet lugnt längs marken.",
        zoneColor: "amber",
      },
      {
        slotIndex: 1,
        code: "LIB",
        roleTitle: "Back / Sista man",
        partnerLabel: "Spelbar nära MV",
        fromX: 50,
        fromY: 70,
        toX: 38,
        toY: 74,
        actionBadge: "Spelbar kort",
        attackTask: "Kliv ut lite åt sidan så målvakten kan rulla till dig och du ser hela planen.",
        defenseTask: "Redo att täcka direkt om passningen bryts.",
        scenarioNote: "Öppnar upp passningsvinkel nära målvakten.",
        zoneColor: "emerald",
      },
      {
        slotIndex: 2,
        code: "VM",
        roleTitle: "Vänsterytter (Vänsterpar)",
        partnerLabel: "Maxbredd till vänster",
        fromX: 16,
        fromY: 42,
        toX: 10,
        toY: 48,
        actionBadge: "Bredda till linjen!",
        attackTask: "Stå med fötterna nästan på vänstra sidlinjen och vänd dig så du ser både MV och motståndarnas mål!",
        defenseTask: "Hjälp IMV om vi tappar bollen.",
        scenarioNote: "Drar isär motståndarna genom att hålla full bredd.",
        zoneColor: "yellow",
      },
      {
        slotIndex: 3,
        code: "IMV",
        roleTitle: "CM Vänster (Vänsterpar)",
        partnerLabel: "Möter i vänsterfickan",
        fromX: 37,
        fromY: 49,
        toX: 32,
        toY: 58,
        actionBadge: "Möt i fickan",
        attackTask: "Visa dig i ytan mellan deras forward och mittfält — skarva direkt ut till VM på kanten!",
        defenseTask: "Säkra upp bakom VM när bollen går ut på kanten.",
        scenarioNote: "Bildar en triangel med LIB och VM på vänstersidan.",
        zoneColor: "yellow",
      },
      {
        slotIndex: 4,
        code: "IMH",
        roleTitle: "CM Höger (Högerpar)",
        partnerLabel: "Möter i högerfickan",
        fromX: 63,
        fromY: 49,
        toX: 68,
        toY: 58,
        actionBadge: "Möt i fickan",
        attackTask: "Visa dig spelbar till höger i mitten så vi kan spela förbi deras första press.",
        defenseTask: "Säkra bakom HM när bollen spelas ut.",
        scenarioNote: "Bildar en triangel med LIB och HM på högersidan.",
        zoneColor: "sky",
      },
      {
        slotIndex: 5,
        code: "HM",
        roleTitle: "Högerytter (Högerpar)",
        partnerLabel: "Maxbredd till höger",
        fromX: 84,
        fromY: 42,
        toX: 90,
        toY: 48,
        actionBadge: "Bredda till linjen!",
        attackTask: "Håll full bredd på högerkanten så du kan få bollen med tid och yta!",
        defenseTask: "Jobba ihop med IMH.",
        scenarioNote: "Sträcker ut motståndarnas lag på högerkanten.",
        zoneColor: "sky",
      },
      {
        slotIndex: 6,
        code: "FW",
        roleTitle: "Forward / Spets",
        partnerLabel: "Trycker bort deras back",
        fromX: 50,
        fromY: 18,
        toX: 50,
        toY: 22,
        actionBadge: "Håll djupet",
        attackTask: "Stanna högt upp så deras back inte vågar kliva fram — då får våra mittfältare stor yta!",
        defenseTask: "Första press om vi tappar bollen.",
        scenarioNote: "Håller isär motståndarna på djupet.",
        zoneColor: "amber",
      },
    ],
  },
];

const SCENARIOS_1_1_3_1: TacticalScenario[] = [
  {
    id: "base",
    title: "1. Grundposition (Jocke) · Back + Ankare + 3 Mitt",
    shortTitle: "⚖️ Grundposition",
    badge: "1-1-3-1 UTGÅNGSLÄGE",
    summary:
      "En sista back (LIB) och ett defensivt ankare (DM) strax framför som låser mitten. Framför dem ligger 3 mittfältare (VM–CM–HM) och 1 forward (FW).",
    coachKeyPoint:
      "Ankaret (DM) är navet som håller ihop laget mellan backen och de tre offensiva mittfältarna!",
    ballX: 50,
    ballY: 52,
    moves: [
      {
        slotIndex: 0,
        code: "MV",
        roleTitle: "Målvakt",
        partnerLabel: "Samarbetar med Back (LIB)",
        fromX: 50,
        fromY: 88,
        toX: 50,
        toY: 88,
        actionBadge: "Styr bakifrån",
        attackTask: "Sätt igång spelet via LIB/DM eller ut på VM/HM.",
        defenseTask: "Styr försvaret högt och tydligt.",
        scenarioNote: "Trygg längst bak.",
        zoneColor: "amber",
      },
      {
        slotIndex: 1,
        code: "LIB",
        roleTitle: "Back / Sista man",
        partnerLabel: "Centrallås med Ankare (DM)",
        fromX: 50,
        fromY: 73,
        toX: 50,
        toY: 73,
        actionBadge: "Sista säkerhet",
        attackTask: "Spelbar bakåt och fördelar bollen till DM eller kanterna.",
        defenseTask: "Håll rent bakom DM och ta djupledsbollarna.",
        scenarioNote: "Sista utespelare framför målvakten.",
        zoneColor: "emerald",
      },
      {
        slotIndex: 2,
        code: "VM",
        roleTitle: "Vänstermitt / Ytter",
        partnerLabel: "Vänster i 3-mannamittfältet",
        fromX: 18,
        fromY: 36,
        toX: 18,
        toY: 36,
        actionBadge: "Vänsterkant",
        attackTask: "Håll bredd, utmana på vänsterkanten och fyll på i boxen.",
        defenseTask: "Jobba hem längs vänsterkanten så DM och LIB inte blir ensamma.",
        scenarioNote: "Utgångsposition till vänster på mittfältet.",
        zoneColor: "yellow",
      },
      {
        slotIndex: 3,
        code: "DM",
        roleTitle: "Defensiv mitt / Ankare",
        partnerLabel: "Städgumma framför Back (LIB)",
        fromX: 50,
        fromY: 56,
        toX: 50,
        toY: 56,
        actionBadge: "ANKARE (DM)",
        attackTask: "Var alltid spelbar snett bakom VM, CM och HM — vänd spelet från kant till kant!",
        defenseTask: "Bryt motståndarnas anfall i mitten innan de når vår back (LIB).",
        scenarioNote: "Ligger som sköld mellan backen och tremannamittfältet.",
        zoneColor: "emerald",
      },
      {
        slotIndex: 4,
        code: "CM",
        roleTitle: "Central offensiv mitt",
        partnerLabel: "Mitten i 3-mannamittfältet",
        fromX: 50,
        fromY: 36,
        toX: 50,
        toY: 36,
        actionBadge: "Spelfördelare",
        attackTask: "Vänd upp med bollen, kombinera med FW och gå på skott!",
        defenseTask: "Första press i mitten framför vårt ankare (DM).",
        scenarioNote: "Länken mellan mittfält och forward.",
        zoneColor: "sky",
      },
      {
        slotIndex: 5,
        code: "HM",
        roleTitle: "Högermitt / Ytter",
        partnerLabel: "Höger i 3-mannamittfältet",
        fromX: 82,
        fromY: 36,
        toX: 82,
        toY: 36,
        actionBadge: "Högerkant",
        attackTask: "Håll bredd till höger, utmana och skär in mot mål.",
        defenseTask: "Jobba hem längs högerkanten i försvar.",
        scenarioNote: "Utgångsposition till höger på mittfältet.",
        zoneColor: "sky",
      },
      {
        slotIndex: 6,
        code: "FW",
        roleTitle: "Forward / Spets",
        partnerLabel: "Längst fram",
        fromX: 50,
        fromY: 16,
        toX: 50,
        toY: 16,
        actionBadge: "Spets",
        attackTask: "Hota i djupled och håll fast bollen tills VM–CM–HM fyller på.",
        defenseTask: "Styr motståndarnas backar åt ett håll.",
        scenarioNote: "Spets längst fram.",
        zoneColor: "amber",
      },
    ],
  },
  {
    id: "attack",
    title: "2. Anfall i 1-1-3-1 · Trean fyller på, Ankaret (DM) säkrar!",
    shortTitle: "⚡ Anfall (4 fram, DM säkrar)",
    badge: "VI ANFALLER",
    summary:
      "I 1-1-3-1 fyller VM, CM, HM och FW på i anfallet medan Ankaret (DM) stannar kvar utanför straffområdet som trygg vägg och kontringsstoppare framför backen (LIB).",
    coachKeyPoint:
      "DM rusar INTE in i målgården! DM ligger strax bakom anfallet och tar hand om alla andrabollar.",
    ballX: 50,
    ballY: 24,
    moves: [
      {
        slotIndex: 0,
        code: "MV",
        roleTitle: "Målvakt",
        partnerLabel: "Hög position",
        fromX: 50,
        fromY: 88,
        toX: 50,
        toY: 82,
        actionBadge: "Flyttar upp",
        attackTask: "Spelbar långt bak om LIB behöver vända hem.",
        defenseTask: "Vaken på långbollar.",
        scenarioNote: "Flyttar fram några steg.",
        zoneColor: "amber",
      },
      {
        slotIndex: 1,
        code: "LIB",
        roleTitle: "Back / Sista man",
        partnerLabel: "Säkrar bakom DM",
        fromX: 50,
        fromY: 73,
        toX: 50,
        toY: 62,
        actionBadge: "Sista man",
        attackTask: "Flytta upp bakom DM så det inte blir stort hål i laget.",
        defenseTask: "Ha koll på deras anfallare om de slår långt.",
        scenarioNote: "Kliver upp till mittplan bakom DM.",
        zoneColor: "emerald",
      },
      {
        slotIndex: 2,
        code: "VM",
        roleTitle: "Vänstermitt / Ytter",
        partnerLabel: "Fyller på till vänster",
        fromX: 18,
        fromY: 36,
        toX: 20,
        toY: 22,
        actionBadge: "Anfall Vänster",
        attackTask: "Ta löpningen framåt på vänsterkanten eller in mot bortre stolpen!",
        defenseTask: "Återpressa eller spring hem på din kant om vi tappar bollen.",
        scenarioNote: "Hotar på vänsterkanten och i straffområdet.",
        zoneColor: "yellow",
      },
      {
        slotIndex: 3,
        code: "DM",
        roleTitle: "Defensiv mitt / Ankare",
        partnerLabel: "Stannar som balans & vägg!",
        fromX: 50,
        fromY: 56,
        toX: 50,
        toY: 44,
        actionBadge: "STANNAR & SÄKRAR",
        attackTask: "Ligg spelbar bakom CM — vänd spelet eller skjut om bollen rullar ut!",
        defenseTask: "Stoppa deras kontring direkt om vi tappar bollen i straffområdet.",
        scenarioNote: "Går INTE in i gröten framför mål utan säkrar ytan bakom trean!",
        zoneColor: "emerald",
      },
      {
        slotIndex: 4,
        code: "CM",
        roleTitle: "Central offensiv mitt",
        partnerLabel: "Driver anfallet med FW",
        fromX: 50,
        fromY: 36,
        toX: 48,
        toY: 24,
        actionBadge: "DRIVER & SKJUTER ⚽",
        attackTask: "Fyll på i skottsektorn precis bakom FW — passa ut på kant eller skjut!",
        defenseTask: "Sätt press direkt vid bolltapp.",
        scenarioNote: "Kliver upp som extra anfallare nära FW.",
        zoneColor: "sky",
      },
      {
        slotIndex: 5,
        code: "HM",
        roleTitle: "Högermitt / Ytter",
        partnerLabel: "Fyller på till höger",
        fromX: 82,
        fromY: 36,
        toX: 80,
        toY: 22,
        actionBadge: "Anfall Höger",
        attackTask: "Fyll på längs högerkanten för inspel eller avslut!",
        defenseTask: "Ta hemjobbet på högerkanten direkt vid omställning.",
        scenarioNote: "Hotar på högerkanten och mot bortre stolpen.",
        zoneColor: "sky",
      },
      {
        slotIndex: 6,
        code: "FW",
        roleTitle: "Forward / Spets",
        partnerLabel: "I straffområdet",
        fromX: 50,
        fromY: 16,
        toX: 52,
        toY: 13,
        actionBadge: "I målområdet!",
        attackTask: "Var framför mål på alla skott och inspel!",
        defenseTask: "Jaga bollhållaren vid bolltapp.",
        scenarioNote: "Högst upp framför målvakten.",
        zoneColor: "amber",
      },
    ],
  },
  {
    id: "defense",
    title: "3. Försvar i 1-1-3-1 · DM möter tidigt, yttrarna jobbar hem",
    shortTitle: "🛡️ Försvar (Centrallås)",
    badge: "MOTSTÅNDAREN ANFALLER",
    summary:
      "När motståndaren anfaller kliver Ankaret (DM) fram och bromsar dem medan Backen (LIB) täcker ytan bakom. Yttrarna (VM & HM) måste jobba hem så vi inte blir 2-mot-4!",
    coachKeyPoint:
      "DM tar första smällen framför straffområdet — LIB ligger kvar som säkerhet bakom!",
    ballX: 35,
    ballY: 46,
    moves: [
      {
        slotIndex: 0,
        code: "MV",
        roleTitle: "Målvakt",
        partnerLabel: "Styr LIB & DM",
        fromX: 50,
        fromY: 88,
        toX: 48,
        toY: 88,
        actionBadge: "Redo i mål",
        attackTask: "Sätt igång kontring direkt när du plockar bollen.",
        defenseTask: "Prata med LIB och DM så ni inte går på samma boll.",
        scenarioNote: "Styr försvaret bakifrån.",
        zoneColor: "amber",
      },
      {
        slotIndex: 1,
        code: "LIB",
        roleTitle: "Back / Sista man",
        partnerLabel: "Täcker bakom DM",
        fromX: 50,
        fromY: 73,
        toX: 46,
        toY: 75,
        actionBadge: "Säkrar bakom DM",
        attackTask: "Slå passningen framåt till CM/FW när vi vinner bollen.",
        defenseTask: "Stöt inte på samma spelare som DM — täck djupleden bakom DM!",
        scenarioNote: "Ligger som lås bakom DM framför eget straffområde.",
        zoneColor: "emerald",
      },
      {
        slotIndex: 2,
        code: "VM",
        roleTitle: "Vänstermitt / Ytter",
        partnerLabel: "Jobbar hem på vänsterkanten",
        fromX: 18,
        fromY: 36,
        toX: 20,
        toY: 54,
        actionBadge: "Jobbar hem!",
        attackTask: "Löp framåt direkt när DM/LIB vinner bollen.",
        defenseTask: "Spring hem på rätt sida om deras högerytter så DM slipper gå ut till sidlinjen!",
        scenarioNote: "Tar hemjobbet längs vänsterkanten.",
        zoneColor: "yellow",
      },
      {
        slotIndex: 3,
        code: "DM",
        roleTitle: "Defensiv mitt / Ankare",
        partnerLabel: "Möter bollhållaren!",
        fromX: 50,
        fromY: 56,
        toX: 42,
        toY: 56,
        actionBadge: "STOPPAR I MITTEN",
        attackTask: "När du vinner bollen: spela enkelt till CM, VM eller HM!",
        defenseTask: "Kliv fram och stoppa bollhållaren innan de får skjuta — du har LIB i ryggen!",
        scenarioNote: "Bromsar och bryter anfallet framför backen.",
        zoneColor: "emerald",
      },
      {
        slotIndex: 4,
        code: "CM",
        roleTitle: "Central offensiv mitt",
        partnerLabel: "Hjälper DM i mitten",
        fromX: 50,
        fromY: 36,
        toX: 46,
        toY: 45,
        actionBadge: "Pressar i mitten",
        attackTask: "Var första passningsalternativ när DM vinner bollen!",
        defenseTask: "Jobba hem och kläm åt motståndaren bakifrån/från sidan tillsammans med DM.",
        scenarioNote: "Hjälper DM att göra mitten trång.",
        zoneColor: "sky",
      },
      {
        slotIndex: 5,
        code: "HM",
        roleTitle: "Högermitt / Ytter",
        partnerLabel: "Jobbar hem på högerkanten",
        fromX: 82,
        fromY: 36,
        toX: 78,
        toY: 54,
        actionBadge: "Jobbar hem!",
        attackTask: "Stick på kontring längs högerkanten när vi bryter!",
        defenseTask: "Följ med hem på högersidan och täck bortre ytan.",
        scenarioNote: "Tar hemjobbet på högersidan.",
        zoneColor: "sky",
      },
      {
        slotIndex: 6,
        code: "FW",
        roleTitle: "Forward / Spets",
        partnerLabel: "Redo för kontring",
        fromX: 50,
        fromY: 16,
        toX: 46,
        toY: 28,
        actionBadge: "Kontringsredo",
        attackTask: "Stick i djupet direkt när vi vinner bollen!",
        defenseTask: "Stäng enkel tillbakapassning till deras back.",
        scenarioNote: "Ligger på rulle för omställning.",
        zoneColor: "amber",
      },
    ],
  },
  {
    id: "build_up",
    title: "4. Uppspel i 1-1-3-1 · LIB & DM nära, VM & HM breddar",
    shortTitle: "🎯 Uppspel MV",
    badge: "MÅLVAKTEN HAR BOLLEN",
    summary:
      "Vid inspark kliver Backen (LIB) lite åt sidan och Ankaret (DM) möter i mitten. Yttrarna (VM & HM) breddar helt ut till sidlinjen och CM hittar fria ytan högre upp.",
    coachKeyPoint:
      "Spelar vi till DM i mitten kan DM vända upp och slå ut bollen till en helt fri ytter (VM eller HM)!",
    ballX: 50,
    ballY: 86,
    moves: [
      {
        slotIndex: 0,
        code: "MV",
        roleTitle: "Målvakt",
        partnerLabel: "Startar spelet ⚽",
        fromX: 50,
        fromY: 88,
        toX: 50,
        toY: 86,
        actionBadge: "HAR BOLLEN ⚽",
        attackTask: "Rulla till LIB, DM eller direkt ut till VM/HM på kanten.",
        defenseTask: "Spelbar för tillbakapass.",
        scenarioNote: "Startar uppspelet.",
        zoneColor: "amber",
      },
      {
        slotIndex: 1,
        code: "LIB",
        roleTitle: "Back / Sista man",
        partnerLabel: "Kort alternativ",
        fromX: 50,
        fromY: 73,
        toX: 36,
        toY: 74,
        actionBadge: "Öppnar vinkel",
        attackTask: "Ta emot från MV och spela fram till DM, VM eller CM.",
        defenseTask: "Säkra bakåt direkt.",
        scenarioNote: "Kliver ut lite så MV får fri passningsväg.",
        zoneColor: "emerald",
      },
      {
        slotIndex: 2,
        code: "VM",
        roleTitle: "Vänstermitt / Ytter",
        partnerLabel: "Breddar vänster",
        fromX: 18,
        fromY: 36,
        toX: 10,
        toY: 46,
        actionBadge: "Vid sidlinjen!",
        attackTask: "Stå helt ute vid vänstra sidlinjen så DM eller LIB kan passa dig i fart!",
        defenseTask: "Redo att täcka vänstersidan.",
        scenarioNote: "Håller maximal bredd till vänster.",
        zoneColor: "yellow",
      },
      {
        slotIndex: 3,
        code: "DM",
        roleTitle: "Defensiv mitt / Ankare",
        partnerLabel: "Spelbar i mitten",
        fromX: 50,
        fromY: 56,
        toX: 54,
        toY: 62,
        actionBadge: "Spelnav i mitten",
        attackTask: "Visa dig i en fri yta framför LIB — ta emot och vänd ut spelet på kanten!",
        defenseTask: "Täck mitten om passningen bryts.",
        scenarioNote: "Binder ihop uppspelet från eget straffområde.",
        zoneColor: "emerald",
      },
      {
        slotIndex: 4,
        code: "CM",
        roleTitle: "Central offensiv mitt",
        partnerLabel: "Hittar ytan bakom pressen",
        fromX: 50,
        fromY: 36,
        toX: 48,
        toY: 40,
        actionBadge: "Fri yta högre upp",
        attackTask: "Ligg i fickan bakom deras mittfält — redo att vända rättvänd mot mål!",
        defenseTask: "Återpressa vid bolltapp.",
        scenarioNote: "Spelbar ett steg högre upp i banan.",
        zoneColor: "sky",
      },
      {
        slotIndex: 5,
        code: "HM",
        roleTitle: "Högermitt / Ytter",
        partnerLabel: "Breddar höger",
        fromX: 82,
        fromY: 36,
        toX: 90,
        toY: 46,
        actionBadge: "Vid sidlinjen!",
        attackTask: "Stå helt ute vid högra sidlinjen och begär bollen!",
        defenseTask: "Redo att täcka högersidan.",
        scenarioNote: "Håller maximal bredd till höger.",
        zoneColor: "sky",
      },
      {
        slotIndex: 6,
        code: "FW",
        roleTitle: "Forward / Spets",
        partnerLabel: "Trycker ner deras back",
        fromX: 50,
        fromY: 16,
        toX: 50,
        toY: 20,
        actionBadge: "Sträcker ut laget",
        attackTask: "Håll djupet så CM och DM får stor yta i mitten!",
        defenseTask: "Redo att pressa.",
        scenarioNote: "Binder upp motståndarnas sista back.",
        zoneColor: "amber",
      },
    ],
  },
];

/**
 * Smart kontinuerlig beräkning av alla 7 spelares positioner & uppgifter
 * när man drar bollen fritt på planen (eller kör Auto-Play).
 */
function computeBallDrivenScenario(
  boardFormation: "1-4-1" | "1-1-3-1",
  ballX: number,
  ballY: number,
  baseScenario: TacticalScenario
): TacticalScenario {
  const bx = clamp(ballX, 7, 93);
  const by = clamp(ballY, 9, 90);

  // -1 = helt till vänster, 0 = mitten, +1 = helt till höger
  const side = clamp((bx - 50) / 36, -1, 1);
  const leftFactor = clamp(-side, 0, 1);
  const rightFactor = clamp(side, 0, 1);

  // Hur högt upp i banan bollen är (attackFactor: 1 vid KAIK:s mål, defenseFactor: 1 vid vårt mål)
  const attackFactor = clamp((54 - by) / 36, 0, 1);
  const defenseFactor = clamp((by - 46) / 38, 0, 1);
  const isBuildUp = by > 76 && Math.abs(side) < 0.55;

  const baseMoves = baseScenario.moves;

  if (boardFormation === "1-4-1") {
    // 1. Målvakt (MV)
    const mvX = clamp(50 + side * 6, 42, 58);
    const mvY = isBuildUp ? 86 : clamp(88 - attackFactor * 6, 81, 88);

    // 2. Back / Sista man (LIB)
    const libX = isBuildUp
      ? bx >= 50
        ? 38
        : 62
      : clamp(50 + side * 12, 36, 64);
    const libY = isBuildUp
      ? 74
      : clamp(70 - attackFactor * 12 + defenseFactor * 4, 56, 75);

    // 3. Vänsterytter (VM) - slot 2
    let vmX: number;
    let vmY: number;
    let vmBadge: string;
    let vmNote: string;

    if (isBuildUp) {
      vmX = 10;
      vmY = 48;
      vmBadge = "BREDDA VÄNSTER!";
      vmNote = "Breddar ända ut till vänstra sidlinjen så målvakten/backen kan spela ut.";
    } else if (leftFactor >= 0.15) {
      // Bollen på vänster sida -> VM kliver mot bollen i djupled/press
      vmX = clamp(lerp(18, 13, leftFactor), 11, 24);
      vmY = clamp(lerp(42, by, 0.78), 16, 52);
      vmBadge = by < 36 ? "DRIVER FRAMÅT ⚽" : "PRESSAR / MÖTER ⚽";
      vmNote =
        by < 36
          ? "Utmanar framåt på vänsterkanten med IMV som säkring snett bakom!"
          : "Möter/pressar bollen på vänsterkanten medan IMV täcker ytan bakom.";
    } else {
      // Bollen i mitten eller till höger -> VM flyttar över!
      vmX = clamp(
        16 + rightFactor * (attackFactor > 0.35 ? 18 : 13),
        16,
        35
      );
      vmY = clamp(
        42 - attackFactor * (rightFactor > 0.2 ? 18 : 12) + defenseFactor * 10,
        21,
        54
      );
      vmBadge =
        rightFactor > 0.25 && attackFactor > 0.35
          ? "BORTRE STOLPEN!"
          : rightFactor > 0.25
          ? "FLYTTAR INÅT ➡️"
          : "HÅLLER BREDD";
      vmNote =
        rightFactor > 0.25 && attackFactor > 0.35
          ? "Smyger in från vänsterkanten mot bortre stolpen för att göra mål på inspel!"
          : "Flyttar över mot mitten så laget sitter ihop.";
    }

    // 4. CM Vänster (IMV) - slot 3 (Gummiband med VM!)
    let imvX: number;
    let imvY: number;
    let imvBadge: string;
    let imvNote: string;

    if (isBuildUp) {
      imvX = 32;
      imvY = 58;
      imvBadge = "MÖT I FICKAN";
      imvNote = "Möter spelbar snett framför backen och bildar triangel med VM.";
    } else if (leftFactor >= 0.15) {
      // Sitter ihop i gummiband snett bakom VM (13-15 steg bakom VM, aldrig i knät på LIB!)
      imvX = clamp(vmX + 12, 24, 38);
      imvY = clamp(vmY + 15, 34, 60);
      imvBadge = "SÄKRAR BAKOM VM!";
      imvNote =
        "Gummibandet! Följer med snett bakom VM på vänstersidan (utan att falla ner i knät på backen).";
    } else {
      // Bollen till höger/mitten -> IMV kliver in och balanserar mitten
      imvX = clamp(37 + rightFactor * 12, 36, 50);
      imvY = clamp(49 - attackFactor * 10 + defenseFactor * 8, 38, 58);
      imvBadge = rightFactor > 0.25 ? "STÄNGER MITTEN" : "BALANSERAR";
      imvNote = "Glider in centralt och hjälper till att låsa mitten.";
    }

    // 6. Högerytter (HM) - slot 5
    let hmX: number;
    let hmY: number;
    let hmBadge: string;
    let hmNote: string;

    if (isBuildUp) {
      hmX = 90;
      hmY = 48;
      hmBadge = "BREDDA HÖGER!";
      hmNote = "Breddar ända ut till högra sidlinjen för uppspel.";
    } else if (rightFactor >= 0.15) {
      // Bollen på höger sida -> HM kliver mot bollen
      hmX = clamp(lerp(82, 87, rightFactor), 76, 89);
      hmY = clamp(lerp(42, by, 0.78), 16, 52);
      hmBadge = by < 36 ? "DRIVER FRAMÅT ⚽" : "PRESSAR / MÖTER ⚽";
      hmNote =
        by < 36
          ? "Utmanar framåt på högerkanten med IMH som säkring snett bakom!"
          : "Möter/pressar bollen på högerkanten medan IMH täcker ytan bakom.";
    } else {
      // Bollen i mitten eller till vänster -> HM flyttar över!
      hmX = clamp(
        84 - leftFactor * (attackFactor > 0.35 ? 18 : 13),
        65,
        84
      );
      hmY = clamp(
        42 - attackFactor * (leftFactor > 0.2 ? 18 : 12) + defenseFactor * 10,
        21,
        54
      );
      hmBadge =
        leftFactor > 0.25 && attackFactor > 0.35
          ? "BORTRE STOLPEN!"
          : leftFactor > 0.25
          ? "⬅️ FLYTTAR INÅT"
          : "HÅLLER BREDD";
      hmNote =
        leftFactor > 0.25 && attackFactor > 0.35
          ? "Smyger in från högerkanten mot bortre stolpen redo att trycka in inspelet!"
          : "Flyttar inåt från sidlinjen när bollen är på andra kanten.";
    }

    // 5. CM Höger (IMH) - slot 4 (Gummiband med HM!)
    let imhX: number;
    let imhY: number;
    let imhBadge: string;
    let imhNote: string;

    if (isBuildUp) {
      imhX = 68;
      imhY = 58;
      imhBadge = "MÖT I FICKAN";
      imhNote = "Möter spelbar i högerfickan framför backen.";
    } else if (rightFactor >= 0.15) {
      // Gummiband snett bakom HM
      imhX = clamp(hmX - 12, 62, 76);
      imhY = clamp(hmY + 15, 34, 60);
      imhBadge = "SÄKRAR BAKOM HM!";
      imhNote =
        "Gummibandet! Följer med snett bakom HM på högersidan så kanten aldrig lämnas öppen.";
    } else {
      // Bollen till vänster/mitten -> IMH balanserar mitten
      imhX = clamp(63 - leftFactor * 12, 50, 64);
      imhY = clamp(49 - attackFactor * 10 + defenseFactor * 8, 38, 58);
      imhBadge = leftFactor > 0.25 ? "STÄNGER MITTEN" : "BALANSERAR";
      imhNote = "Glider in i mitten som skottalternativ och balans.";
    }

    // 7. Forward (FW) - slot 6
    const fwX = clamp(50 + side * 14, 34, 66);
    const fwY = isBuildUp
      ? 22
      : clamp(18 - attackFactor * 5 + defenseFactor * 13, 12, 32);
    const fwBadge =
      attackFactor > 0.4
        ? "IN FRAMFÖR MÅL!"
        : defenseFactor > 0.3
        ? "STÄNGER BAKÅTPASS"
        : "SPELBAR I DJUPET";

    const dynamicTitle = isBuildUp
      ? "🎯 Bollen hos Målvakt · Yttrarna breddar & CM möter i fickorna"
      : leftFactor > 0.25
      ? by < 42
        ? "⚡⬅️ Bollen till Vänster · VM går fram & IMV säkrar bakom!"
        : "🛡️⬅️ Bollen på Vänsterkant · Vänsterparet (VM+IMV) stänger sidan!"
      : rightFactor > 0.25
      ? by < 42
        ? "⚡➡️ Bollen till Höger · HM går fram & IMH säkrar bakom!"
        : "🛡️➡️ Bollen på Högerkant · Högerparet (IMH+HM) stänger sidan!"
      : by < 36
      ? "⚡ Bollen högt i Mitten · Båda paren fyller på & säkrar!"
      : "⚖️ Bollen i Mitten · Vänsterpar & Högerpar håller ihop laget";

    const dynamicSummary =
      leftFactor > 0.25
        ? "Ser du hur hela laget flyttar över mot vänster? VM går på bollen, IMV följer med i gummibandet snett bakom, och HM smyger in från högerkanten!"
        : rightFactor > 0.25
        ? "Ser du hur hela laget flyttar över mot höger? HM går på bollen, IMH säkrar snett bakom i gummibandet, och VM kliver in från vänsterkanten!"
        : "Dra bollen ⚽ åt vänster, höger, framåt eller bakåt så ser du hur Vänsterparet (VM+IMV) och Högerparet (IMH+HM) rör sig i takt med bollen!";

    const updatedMoves: SlotMove[] = [
      {
        ...baseMoves[0],
        toX: Math.round(mvX * 10) / 10,
        toY: Math.round(mvY * 10) / 10,
        actionBadge: isBuildUp ? "SPELAR UT ⚽" : attackFactor > 0.4 ? "KLIVER FRAM" : "STYR FÖRSVARET",
      },
      {
        ...baseMoves[1],
        toX: Math.round(libX * 10) / 10,
        toY: Math.round(libY * 10) / 10,
        actionBadge: isBuildUp
          ? "ÖPPNAR VINKEL"
          : leftFactor > 0.3
          ? "TÄCKER VÄNSTER-MITT"
          : rightFactor > 0.3
          ? "TÄCKER HÖGER-MITT"
          : "LÅSER MITTEN",
      },
      {
        ...baseMoves[2],
        toX: Math.round(vmX * 10) / 10,
        toY: Math.round(vmY * 10) / 10,
        actionBadge: vmBadge,
        scenarioNote: vmNote,
      },
      {
        ...baseMoves[3],
        toX: Math.round(imvX * 10) / 10,
        toY: Math.round(imvY * 10) / 10,
        actionBadge: imvBadge,
        scenarioNote: imvNote,
      },
      {
        ...baseMoves[4],
        toX: Math.round(imhX * 10) / 10,
        toY: Math.round(imhY * 10) / 10,
        actionBadge: imhBadge,
        scenarioNote: imhNote,
      },
      {
        ...baseMoves[5],
        toX: Math.round(hmX * 10) / 10,
        toY: Math.round(hmY * 10) / 10,
        actionBadge: hmBadge,
        scenarioNote: hmNote,
      },
      {
        ...baseMoves[6],
        toX: Math.round(fwX * 10) / 10,
        toY: Math.round(fwY * 10) / 10,
        actionBadge: fwBadge,
      },
    ];

    return {
      ...baseScenario,
      id: "live_ball",
      badge: "🖐️ BOLLSTYRD RÖRELSE (LIVE)",
      title: dynamicTitle,
      summary: dynamicSummary,
      ballX: bx,
      ballY: by,
      moves: updatedMoves,
    };
  }

  // =====================================================================
  // 1-1-3-1 (JOCKE: BACK + ANKARE + 3 MITT + SPETS)
  // =====================================================================
  const mvX = clamp(50 + side * 6, 42, 58);
  const mvY = isBuildUp ? 86 : clamp(88 - attackFactor * 6, 81, 88);

  const libX = isBuildUp
    ? bx >= 50
      ? 36
      : 64
    : clamp(50 + side * 11, 37, 63);
  const libY = isBuildUp
    ? 74
    : clamp(73 - attackFactor * 11 + defenseFactor * 3, 60, 76);

  // DM (Ankare - slot 3): Följer bollen i sidled framför LIB och stannar utanför boxen i anfall!
  const dmX = isBuildUp ? 52 : clamp(50 + side * 16, 32, 68);
  const dmY = isBuildUp
    ? 62
    : clamp(56 - attackFactor * 13 + defenseFactor * 5, 42, 62);

  // CM (Central offensiv mitt - slot 4)
  const cmX = clamp(50 + side * 19, 28, 72);
  const cmY = isBuildUp
    ? 40
    : clamp(36 - attackFactor * 14 + defenseFactor * 11, 21, 48);

  // VM (Vänstermitt - slot 2)
  const vmX = isBuildUp
    ? 10
    : leftFactor >= 0.15
    ? clamp(lerp(18, 13, leftFactor), 11, 22)
    : clamp(18 + rightFactor * 14, 18, 34);
  const vmY = isBuildUp
    ? 46
    : leftFactor >= 0.15
    ? clamp(lerp(36, by, 0.72), 18, 54)
    : clamp(36 - attackFactor * 14 + defenseFactor * 18, 21, 55);

  // HM (Högermitt - slot 5)
  const hmX = isBuildUp
    ? 90
    : rightFactor >= 0.15
    ? clamp(lerp(82, 87, rightFactor), 78, 89)
    : clamp(82 - leftFactor * 14, 66, 82);
  const hmY = isBuildUp
    ? 46
    : rightFactor >= 0.15
    ? clamp(lerp(36, by, 0.72), 18, 54)
    : clamp(36 - attackFactor * 14 + defenseFactor * 18, 21, 55);

  // FW (Spets - slot 6)
  const fwX = clamp(50 + side * 14, 34, 66);
  const fwY = isBuildUp
    ? 20
    : clamp(16 - attackFactor * 4 + defenseFactor * 12, 12, 30);

  const updatedMoves1131: SlotMove[] = [
    {
      ...baseMoves[0],
      toX: Math.round(mvX * 10) / 10,
      toY: Math.round(mvY * 10) / 10,
      actionBadge: isBuildUp ? "SPELAR UT ⚽" : "STYR FÖRSVARET",
    },
    {
      ...baseMoves[1],
      toX: Math.round(libX * 10) / 10,
      toY: Math.round(libY * 10) / 10,
      actionBadge: "SÄKRAR BAKOM DM",
    },
    {
      ...baseMoves[2],
      toX: Math.round(vmX * 10) / 10,
      toY: Math.round(vmY * 10) / 10,
      actionBadge:
        leftFactor > 0.25
          ? by < 40
            ? "DRIVER VÄNSTER ⚽"
            : "PRESSAR VÄNSTER"
          : defenseFactor > 0.25
          ? "JOBBAR HEM!"
          : "FYLLER PÅ",
    },
    {
      ...baseMoves[3],
      toX: Math.round(dmX * 10) / 10,
      toY: Math.round(dmY * 10) / 10,
      actionBadge:
        attackFactor > 0.3
          ? "ANKARE · SÄKRAR"
          : "STOPPAR FRAMFÖR LIB",
    },
    {
      ...baseMoves[4],
      toX: Math.round(cmX * 10) / 10,
      toY: Math.round(cmY * 10) / 10,
      actionBadge:
        attackFactor > 0.3 ? "DRIVER & SKJUTER" : "PRESSAR I MITTEN",
    },
    {
      ...baseMoves[5],
      toX: Math.round(hmX * 10) / 10,
      toY: Math.round(hmY * 10) / 10,
      actionBadge:
        rightFactor > 0.25
          ? by < 40
            ? "DRIVER HÖGER ⚽"
            : "PRESSAR HÖGER"
          : defenseFactor > 0.25
          ? "JOBBAR HEM!"
          : "FYLLER PÅ",
    },
    {
      ...baseMoves[6],
      toX: Math.round(fwX * 10) / 10,
      toY: Math.round(fwY * 10) / 10,
      actionBadge: attackFactor > 0.35 ? "I STRAFFOMRÅDET!" : "HOTAR I DJUPET",
    },
  ];

  return {
    ...baseScenario,
    id: "live_ball",
    badge: "🖐️ BOLLSTYRD RÖRELSE (LIVE)",
    title:
      leftFactor > 0.25
        ? "⬅️ Bollen till Vänster i 1-1-3-1 · DM & LIB skjuter över och täcker!"
        : rightFactor > 0.25
        ? "➡️ Bollen till Höger i 1-1-3-1 · DM & LIB skjuter över och täcker!"
        : by < 36
        ? "⚡ Anfall i 1-1-3-1 · VM–CM–HM fyller på, Ankaret (DM) säkrar bakom!"
        : "🛡️ Försvar & Balans i 1-1-3-1 · DM bromsar framför LIB",
    summary:
      "Dra bollen ⚽ fritt över planen! Ankaret (DM) och Backen (LIB) flyttar med i sidled i sitt gröna gummiband medan VM–CM–HM arbetar framåt och hemåt.",
    ballX: bx,
    ballY: by,
    moves: updatedMoves1131,
  };
}

// Auto-play rutt (Uppspel -> Vänsterkant -> Spelvändning -> Högerkant -> Avslut -> Försvar)
const AUTO_PLAY_WAYPOINTS: Array<{ x: number; y: number }> = [
  { x: 50, y: 84 }, // Uppspel MV
  { x: 32, y: 58 }, // Uppspel via IMV/DM
  { x: 15, y: 38 }, // Ut på vänsterkanten
  { x: 15, y: 20 }, // Anfall högt vänster
  { x: 28, y: 36 }, // Tillbakapass till säkrande IMV
  { x: 54, y: 40 }, // Spelvändning via mitten
  { x: 84, y: 34 }, // Ut på högerkanten
  { x: 85, y: 19 }, // Anfall högt höger
  { x: 52, y: 14 }, // Inspel framför mål
  { x: 76, y: 52 }, // Omställning / försvar höger
  { x: 22, y: 52 }, // Omställning / försvar vänster
];

export function TacticalMovementView({
  currentFormation,
  onSelectFormation,
  pitchPlayers,
  disabled = false,
}: TacticalMovementViewProps) {
  const boardFormation: "1-4-1" | "1-1-3-1" =
    currentFormation === "1-1-3-1" ? "1-1-3-1" : "1-4-1";

  const scenarios =
    boardFormation === "1-1-3-1" ? SCENARIOS_1_1_3_1 : SCENARIOS_1_4_1;

  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(
    scenarios[1]?.id ?? "base"
  );
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number>(3);

  // Fri bollposition när man drar bollen eller trycker på planen
  const [customBall, setCustomBall] = useState<{ x: number; y: number } | null>(
    null
  );
  const [isDraggingBall, setIsDraggingBall] = useState<boolean>(false);
  const [isAutoPlaying, setIsAutoPlaying] = useState<boolean>(false);

  const pitchRef = useRef<HTMLDivElement | null>(null);

  // Auto-play loop som flyttar bollen mjukt längs banan så gubbarna rör sig i takt
  useEffect(() => {
    if (!isAutoPlaying) return;
    let animationFrameId: number;
    const startTime = performance.now();
    const segmentDurationMs = 1900; // 1.9 sek per passning/rörelse

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const totalSegments = AUTO_PLAY_WAYPOINTS.length;
      const floatIdx = (elapsed / segmentDurationMs) % totalSegments;
      const idx = Math.floor(floatIdx);
      const nextIdx = (idx + 1) % totalSegments;
      const rawT = floatIdx - idx;
      // Smoothstep-kurva så bollen bromsar mjukt vid varje station
      const smoothT = rawT * rawT * (3 - 2 * rawT);

      const fromWp = AUTO_PLAY_WAYPOINTS[idx];
      const toWp = AUTO_PLAY_WAYPOINTS[nextIdx];

      setCustomBall({
        x: lerp(fromWp.x, toWp.x, smoothT),
        y: lerp(fromWp.y, toWp.y, smoothT),
      });

      animationFrameId = requestAnimationFrame(tick);
    };

    animationFrameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isAutoPlaying]);

  const presetScenario = useMemo(() => {
    return (
      scenarios.find((s) => s.id === selectedScenarioId) ?? scenarios[0]
    );
  }, [scenarios, selectedScenarioId]);

  const activeScenario = useMemo(() => {
    if (!customBall) return presetScenario;
    return computeBallDrivenScenario(
      boardFormation,
      customBall.x,
      customBall.y,
      scenarios[0]
    );
  }, [boardFormation, customBall, presetScenario, scenarios]);

  // Hitta den utespelare som är närmast bollen just nu (för visuell passnings-/presslinje)
  const closestSlotToBall = useMemo(() => {
    let bestSlot = 2;
    let bestDist = 999;
    activeScenario.moves.forEach((m) => {
      const d = Math.hypot(
        m.toX - activeScenario.ballX,
        m.toY - activeScenario.ballY
      );
      if (d < bestDist) {
        bestDist = d;
        bestSlot = m.slotIndex;
      }
    });
    return bestSlot;
  }, [activeScenario]);

  const playerBySlot = useMemo(() => {
    const map = new Map<number, PitchPlayerToken>();
    const sorted = [...pitchPlayers].sort((a, b) => {
      const sA = a.pitchSlotIndex ?? (a.isGoalkeeper ? 0 : 9);
      const sB = b.pitchSlotIndex ?? (b.isGoalkeeper ? 0 : 9);
      return sA - sB;
    });
    const slots = FORMATION_SLOTS[boardFormation] || FORMATION_SLOTS["1-4-1"];
    sorted.forEach((p, idx) => {
      const slotIdx =
        typeof p.pitchSlotIndex === "number"
          ? p.pitchSlotIndex
          : p.isGoalkeeper
          ? 0
          : idx;
      if (!map.has(slotIdx) && slotIdx < slots.length) {
        map.set(slotIdx, p);
      } else {
        map.set(idx, p);
      }
    });
    return map;
  }, [pitchPlayers, boardFormation]);

  const selectedMove = useMemo(() => {
    return (
      activeScenario.moves.find((m) => m.slotIndex === selectedSlotIndex) ??
      activeScenario.moves[3] ??
      activeScenario.moves[0]
    );
  }, [activeScenario, selectedSlotIndex]);

  const selectedPlayer = playerBySlot.get(selectedMove.slotIndex);

  function handleSwitchBoardFormation(fmt: "1-4-1" | "1-1-3-1") {
    onSelectFormation(fmt);
    setIsAutoPlaying(false);
    setCustomBall(null);
    const nextList = fmt === "1-1-3-1" ? SCENARIOS_1_1_3_1 : SCENARIOS_1_4_1;
    setSelectedScenarioId(nextList[1]?.id ?? nextList[0].id);
  }

  function updateBallFromPointerEvent(e: React.PointerEvent<HTMLDivElement>) {
    const rect = pitchRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const relX = ((e.clientX - rect.left) / rect.width) * 100;
    const relY = ((e.clientY - rect.top) / rect.height) * 100;
    setCustomBall({
      x: clamp(relX, 7, 93),
      y: clamp(relY, 9, 90),
    });
  }

  function handlePitchPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // Ignorera om man klickade på en spelarknapp
    const target = e.target as HTMLElement;
    if (target.closest("[data-player-token='true']")) {
      return;
    }
    setIsAutoPlaying(false);
    setIsDraggingBall(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Fallback om pointerCapture inte stöds
    }
    updateBallFromPointerEvent(e);
  }

  function handlePitchPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDraggingBall) return;
    updateBallFromPointerEvent(e);
  }

  function handlePitchPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDraggingBall) return;
    setIsDraggingBall(false);
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore
    }
  }

  // Snabb transition vid drag/autoplay så det aldrig laggar eller buggar
  const isLiveContinuous = isDraggingBall || isAutoPlaying;

  return (
    <div className="space-y-3 pb-8">
      {/* ============================================================
          TOPPKORT: VÄXLA FORMATION DIREKT (1-4-1 LARS VS 1-1-3-1 JOCKE)
         ============================================================ */}
      <section className="cm-bevel rounded-xl p-3.5 border border-[#facc15]/60 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#facc15] text-slate-950 font-mono-cm font-extrabold text-[10px] uppercase tracking-wider">
              <Compass className="w-3.5 h-3.5" />
              <span>Interaktiv Rörelse- & Taktiktavla · Dra bollen fritt!</span>
            </div>
            <h2 className="font-display font-extrabold text-lg sm:text-xl uppercase text-white mt-1">
              Hur vi springer i {boardFormation} (KAIK-matchen)
            </h2>
            <p className="text-xs text-sky-100/90">
              <strong>Nytt:</strong> Dra bollen ⚽ med fingret (eller tryck var du vill på gräset) så rör sig alla gubbarna direkt i takt med bollen!
            </p>
          </div>
        </div>

        {/* Stor tydlig uppställnings-toggle som även byter live-formationen */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => handleSwitchBoardFormation("1-4-1")}
            className={`p-3 rounded-xl border-2 text-left transition active:scale-[0.99] ${
              boardFormation === "1-4-1"
                ? "bg-[#005cb9]/50 border-[#facc15] shadow-[0_0_20px_rgba(250,204,21,0.3)]"
                : "bg-[#050e1d] border-sky-400/25 hover:border-sky-400/50"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-display font-extrabold text-sm sm:text-base uppercase text-white">
                1-4-1 · Lars (Vänsterpar & Högerpar)
              </span>
              <span
                className={`px-2 py-0.5 rounded font-mono-cm font-extrabold text-[10px] uppercase ${
                  boardFormation === "1-4-1"
                    ? "bg-[#facc15] text-slate-950"
                    : "bg-slate-800 text-slate-300"
                }`}
              >
                {boardFormation === "1-4-1" ? "✓ AKTIV I MATCHEN" : "BYT TILL 1-4-1"}
              </span>
            </div>
            <p className="text-xs text-slate-200 mt-1">
              <strong>VM + CM Vänster</strong> kämpar ihop till vänster ·{" "}
              <strong>HM + CM Höger</strong> kämpar ihop till höger. Går yttern fram säkrar CM upp bakom!
            </p>
          </button>

          <button
            type="button"
            disabled={disabled}
            onClick={() => handleSwitchBoardFormation("1-1-3-1")}
            className={`p-3 rounded-xl border-2 text-left transition active:scale-[0.99] ${
              boardFormation === "1-1-3-1"
                ? "bg-[#005cb9]/50 border-[#facc15] shadow-[0_0_20px_rgba(250,204,21,0.3)]"
                : "bg-[#050e1d] border-sky-400/25 hover:border-sky-400/50"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-display font-extrabold text-sm sm:text-base uppercase text-white">
                1-1-3-1 · Jocke (Back + Ankare + 3 Mitt)
              </span>
              <span
                className={`px-2 py-0.5 rounded font-mono-cm font-extrabold text-[10px] uppercase ${
                  boardFormation === "1-1-3-1"
                    ? "bg-[#facc15] text-slate-950"
                    : "bg-slate-800 text-slate-300"
                }`}
              >
                {boardFormation === "1-1-3-1"
                  ? "✓ AKTIV I MATCHEN"
                  : "BYT TILL 1-1-3-1"}
              </span>
            </div>
            <p className="text-xs text-slate-200 mt-1">
              <strong>Back (LIB) + Ankare (DM)</strong> låser mitten ·{" "}
              <strong>VM–CM–HM</strong> fyller på bakom <strong>Forward (FW)</strong>.
            </p>
          </button>
        </div>

        {/* Scenario-knappar + Auto-play boll */}
        <div className="pt-1 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] font-mono-cm font-extrabold uppercase text-[#facc15]">
              Välj fast spelsituation eller dra bollen ⚽ fritt på planen:
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsAutoPlaying((prev) => !prev)}
                className={`px-2.5 py-1 rounded-lg font-display font-extrabold text-xs uppercase tracking-wide border flex items-center gap-1.5 transition active:scale-95 ${
                  isAutoPlaying
                    ? "bg-emerald-400 text-slate-950 border-emerald-200 shadow-[0_0_15px_rgba(52,211,153,0.5)]"
                    : "bg-[#0f2547] text-emerald-300 border-emerald-400/40 hover:bg-emerald-950/60"
                }`}
              >
                {isAutoPlaying ? (
                  <>
                    <Pause className="w-3.5 h-3.5" />
                    <span>Pausa bollrörelse</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    <span>Autokör bollen ⚽</span>
                  </>
                )}
              </button>

              {customBall && (
                <button
                  type="button"
                  onClick={() => {
                    setIsAutoPlaying(false);
                    setCustomBall(null);
                  }}
                  className="px-2.5 py-1 rounded-lg font-display font-extrabold text-xs uppercase tracking-wide border bg-[#061224] text-sky-200 border-sky-400/30 hover:bg-[#0f2547] flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Återställ läge</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
            {scenarios.map((scen) => {
              const active = !customBall && scen.id === presetScenario.id;
              return (
                <button
                  key={scen.id}
                  type="button"
                  onClick={() => {
                    setIsAutoPlaying(false);
                    setCustomBall(null);
                    setSelectedScenarioId(scen.id);
                  }}
                  className={`py-2 px-2.5 rounded-lg font-display font-extrabold text-xs uppercase tracking-wide border transition text-center active:scale-95 ${
                    active
                      ? "bg-[#facc15] text-slate-950 border-yellow-200 shadow-[0_0_15px_rgba(250,204,21,0.35)]"
                      : "bg-[#061224] text-sky-200 border-sky-400/30 hover:bg-[#0f2547]"
                  }`}
                >
                  {scen.shortTitle}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============================================================
          ANIMERAD 2D TAKTIKPLAN MED BOLL-DRAGNING & RIKTIGA NAMN
         ============================================================ */}
      <section className="rounded-xl overflow-hidden border-2 border-white/25 shadow-2xl bg-[#061224]">
        {/* Scenario-header */}
        <div className="bg-[#050e1d] px-3.5 py-2.5 border-b border-sky-400/30 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`px-2 py-0.5 rounded font-mono-cm font-extrabold text-[10px] uppercase ${
                  customBall
                    ? "bg-emerald-400 text-slate-950"
                    : "bg-[#facc15] text-slate-950"
                }`}
              >
                {activeScenario.badge}
              </span>
              <h3 className="font-display font-extrabold text-sm sm:text-base uppercase text-white">
                {activeScenario.title}
              </h3>
            </div>
            <p className="text-xs text-slate-200 mt-1 leading-relaxed">
              {activeScenario.summary}
            </p>
          </div>
        </div>

        {/* Gul coach-regel */}
        <div className="bg-[#facc15] text-slate-950 px-3.5 py-1.5 font-display font-extrabold text-xs sm:text-sm flex items-center gap-2">
          <Sparkles className="w-4 h-4 shrink-0" />
          <span>HUVUDREGEL: {activeScenario.coachKeyPoint}</span>
        </div>

        {/* Riktningsindikator + Dra-bollen-instruktion */}
        <div className="bg-[#14532d] px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono-cm font-bold uppercase text-emerald-100 border-b border-black/25">
          <span>⬆️ ANFALLSRIKTNING (MOT KAIK:S MÅL)</span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-black/50 text-[#facc15]">
            <Hand className="w-3 h-3" />
            <span>PEKA ELLER DRA BOLLEN ⚽ PÅ GRÄSET SÅ FÖLJER LAGET MED!</span>
          </span>
        </div>

        {/* 2D Gräsplan med Pointer-styrning av bollen (touch-none förhindrar scroll-buggar vid drag) */}
        <div
          ref={pitchRef}
          onPointerDown={handlePitchPointerDown}
          onPointerMove={handlePitchPointerMove}
          onPointerUp={handlePitchPointerUp}
          onPointerCancel={handlePitchPointerUp}
          className="cm-pitch-surface relative h-[480px] sm:h-[530px] select-none overflow-hidden touch-none cursor-grab active:cursor-grabbing"
        >
          {/* Planlinjer */}
          <div className="absolute inset-3 border border-white/25 rounded pointer-events-none" />
          <div className="absolute inset-x-3 top-1/2 -translate-y-1/2 h-px bg-white/25 pointer-events-none" />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full border border-white/25 pointer-events-none" />
          <div className="absolute left-1/2 -translate-x-1/2 top-3 w-36 sm:w-48 h-10 border-b border-x border-white/25 pointer-events-none" />
          <div className="absolute left-1/2 -translate-x-1/2 bottom-3 w-40 sm:w-52 h-16 border-t border-x border-white/30 pointer-events-none" />

          {/* Visuella kantpars-zoner i 1-4-1 */}
          {boardFormation === "1-4-1" && (
            <>
              <div className="absolute left-[4%] w-[43%] top-[18%] h-[46%] rounded-2xl border border-dashed border-[#facc15]/45 bg-[#facc15]/[0.05] pointer-events-none flex items-start justify-center pt-1">
                <span className="px-2 py-0.5 rounded bg-black/65 text-[#facc15] font-mono-cm font-extrabold text-[9px] uppercase tracking-wider">
                  Vänsterpar (VM + IMV) · Vänster sida
                </span>
              </div>
              <div className="absolute right-[4%] w-[43%] top-[18%] h-[46%] rounded-2xl border border-dashed border-sky-300/45 bg-sky-400/[0.05] pointer-events-none flex items-start justify-center pt-1">
                <span className="px-2 py-0.5 rounded bg-black/65 text-sky-200 font-mono-cm font-extrabold text-[9px] uppercase tracking-wider">
                  Högerpar (IMH + HM) · Höger sida
                </span>
              </div>
            </>
          )}

          {/* Visuell ankare-zon i 1-1-3-1 */}
          {boardFormation === "1-1-3-1" && (
            <div className="absolute left-1/2 -translate-x-1/2 w-[38%] top-[40%] h-[38%] rounded-2xl border border-dashed border-emerald-300/45 bg-emerald-400/[0.06] pointer-events-none flex items-start justify-center pt-1">
              <span className="px-2 py-0.5 rounded bg-black/65 text-emerald-200 font-mono-cm font-extrabold text-[9px] uppercase tracking-wider">
                Centrallås · Ankare (DM) + Back (LIB)
              </span>
            </div>
          )}

          {/* SVG Löpvägspilar + Gummiband mellan paren + Aktiv boll-koppling */}
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full pointer-events-none z-10"
          >
            <defs>
              <marker
                id="arrow-yellow"
                markerWidth="3.5"
                markerHeight="3.5"
                refX="2.8"
                refY="1.75"
                orient="auto"
              >
                <path d="M0,0 L3.5,1.75 L0,3.5 Z" fill="#facc15" />
              </marker>
              <marker
                id="arrow-sky"
                markerWidth="3.5"
                markerHeight="3.5"
                refX="2.8"
                refY="1.75"
                orient="auto"
              >
                <path d="M0,0 L3.5,1.75 L0,3.5 Z" fill="#38bdf8" />
              </marker>
              <marker
                id="arrow-emerald"
                markerWidth="3.5"
                markerHeight="3.5"
                refX="2.8"
                refY="1.75"
                orient="auto"
              >
                <path d="M0,0 L3.5,1.75 L0,3.5 Z" fill="#34d399" />
              </marker>
            </defs>

            {/* Linje från bollen till närmaste spelare som pressar/driver */}
            {(() => {
              const closestMove = activeScenario.moves.find(
                (m) => m.slotIndex === closestSlotToBall
              );
              if (!closestMove) return null;
              return (
                <line
                  x1={activeScenario.ballX}
                  y1={activeScenario.ballY}
                  x2={closestMove.toX}
                  y2={closestMove.toY}
                  stroke="#ffffff"
                  strokeWidth="0.55"
                  strokeDasharray="1.2 1.2"
                  opacity="0.7"
                />
              );
            })()}

            {/* Gummiband mellan Vänsterparet (slot 2 & 3) och Högerparet (slot 4 & 5) i 1-4-1 */}
            {boardFormation === "1-4-1" &&
              (() => {
                const vm = activeScenario.moves.find((m) => m.slotIndex === 2);
                const imv = activeScenario.moves.find((m) => m.slotIndex === 3);
                const imh = activeScenario.moves.find((m) => m.slotIndex === 4);
                const hm = activeScenario.moves.find((m) => m.slotIndex === 5);
                return (
                  <>
                    {vm && imv && (
                      <line
                        x1={vm.toX}
                        y1={vm.toY}
                        x2={imv.toX}
                        y2={imv.toY}
                        stroke="#facc15"
                        strokeWidth="0.75"
                        strokeDasharray="1.5 1.2"
                        opacity="0.85"
                      />
                    )}
                    {imh && hm && (
                      <line
                        x1={imh.toX}
                        y1={imh.toY}
                        x2={hm.toX}
                        y2={hm.toY}
                        stroke="#38bdf8"
                        strokeWidth="0.75"
                        strokeDasharray="1.5 1.2"
                        opacity="0.85"
                      />
                    )}
                  </>
                );
              })()}

            {/* Gummiband mellan LIB (slot 1) och DM (slot 3) i 1-1-3-1 */}
            {boardFormation === "1-1-3-1" &&
              (() => {
                const lib = activeScenario.moves.find((m) => m.slotIndex === 1);
                const dm = activeScenario.moves.find((m) => m.slotIndex === 3);
                if (!lib || !dm) return null;
                return (
                  <line
                    x1={lib.toX}
                    y1={lib.toY}
                    x2={dm.toX}
                    y2={dm.toY}
                    stroke="#34d399"
                    strokeWidth="0.75"
                    strokeDasharray="1.5 1.2"
                    opacity="0.85"
                  />
                );
              })()}

            {/* Löpvägspilar från grundposition till aktuell position */}
            {activeScenario.moves.map((m) => {
              const dx = m.toX - m.fromX;
              const dy = m.toY - m.fromY;
              const dist = Math.hypot(dx, dy);
              if (dist < 2) return null;
              const ux = dx / dist;
              const uy = dy / dist;
              const startX = m.fromX + ux * 2.5;
              const startY = m.fromY + uy * 2.5;
              const endX = m.toX - ux * 4.2;
              const endY = m.toY - uy * 4.2;
              const isSelected = m.slotIndex === selectedSlotIndex;
              const strokeColor =
                m.zoneColor === "yellow"
                  ? "#facc15"
                  : m.zoneColor === "sky"
                  ? "#38bdf8"
                  : "#34d399";
              const markerId =
                m.zoneColor === "yellow"
                  ? "url(#arrow-yellow)"
                  : m.zoneColor === "sky"
                  ? "url(#arrow-sky)"
                  : "url(#arrow-emerald)";

              return (
                <g key={`arrow-${m.slotIndex}`}>
                  <circle
                    cx={m.fromX}
                    cy={m.fromY}
                    r="1.3"
                    fill={strokeColor}
                    opacity="0.4"
                  />
                  <line
                    x1={startX}
                    y1={startY}
                    x2={endX}
                    y2={endY}
                    stroke={strokeColor}
                    strokeWidth={isSelected ? "1.05" : "0.7"}
                    strokeDasharray="1.6 1"
                    markerEnd={markerId}
                    opacity={isSelected ? "0.95" : "0.75"}
                  />
                </g>
              );
            })}
          </svg>

          {/* Fotbollen på planen (Draggbar med tydlig gloria) */}
          <div
            style={{
              left: `${activeScenario.ballX}%`,
              top: `${activeScenario.ballY}%`,
              transition: isLiveContinuous
                ? "none"
                : "left 380ms cubic-bezier(0.22, 1, 0.36, 1), top 380ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
            className="absolute -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none"
          >
            <div className="relative flex flex-col items-center">
              <span className="mb-0.5 px-1.5 py-[1px] rounded-full bg-[#facc15] text-slate-950 font-mono-cm font-extrabold text-[8px] uppercase shadow whitespace-nowrap">
                {isDraggingBall ? "DRAR BOLLEN" : "DRA MIG ⚽"}
              </span>
              <div
                className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white text-slate-950 border-2 border-[#facc15] shadow-[0_0_18px_rgba(250,204,21,0.95)] flex items-center justify-center text-base transition-transform ${
                  isDraggingBall ? "scale-125 ring-4 ring-[#facc15]/60" : " animate-pulse"
                }`}
              >
                ⚽
              </div>
            </div>
          </div>

          {/* Spelare på planen (rör sig mjukt och direkt i takt med bollen) */}
          {activeScenario.moves.map((m) => {
            const p = playerBySlot.get(m.slotIndex);
            const displayName = p?.name || m.code;
            const isSelected = m.slotIndex === selectedSlotIndex;
            const isClosest = m.slotIndex === closestSlotToBall;

            const badgeBg =
              m.zoneColor === "yellow"
                ? "bg-[#facc15] text-slate-950 border-yellow-100"
                : m.zoneColor === "sky"
                ? "bg-sky-400 text-slate-950 border-sky-100"
                : m.zoneColor === "emerald"
                ? "bg-emerald-400 text-slate-950 border-emerald-100"
                : "bg-amber-300 text-slate-950 border-amber-100";

            const circleBg =
              m.slotIndex === 0
                ? "bg-[#facc15] text-slate-950 border-white"
                : m.zoneColor === "yellow"
                ? "bg-[#005cb9] text-white border-[#facc15]"
                : m.zoneColor === "sky"
                ? "bg-[#005cb9] text-white border-sky-300"
                : "bg-[#0f2547] text-white border-emerald-300";

            return (
              <div
                key={m.slotIndex}
                style={{
                  left: `${m.toX}%`,
                  top: `${m.toY}%`,
                  transition: isLiveContinuous
                    ? "left 95ms linear, top 95ms linear"
                    : "left 380ms cubic-bezier(0.22, 1, 0.36, 1), top 380ms cubic-bezier(0.22, 1, 0.36, 1)",
                }}
                className="absolute -translate-x-1/2 -translate-y-1/2 z-20"
              >
                <button
                  type="button"
                  data-player-token="true"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => setSelectedSlotIndex(m.slotIndex)}
                  className={`relative flex flex-col items-center focus:outline-none transition-transform ${
                    isSelected ? "scale-110 z-30" : "hover:scale-105"
                  }`}
                >
                  {/* Uppgifts-etikett ovanför spelaren */}
                  <span
                    className={`mb-1 px-1.5 py-[1px] rounded font-mono-cm font-extrabold text-[8px] sm:text-[9px] uppercase tracking-tight border shadow whitespace-nowrap ${badgeBg}`}
                  >
                    {m.actionBadge}
                  </span>

                  {/* Spelarcirkel med positionskod */}
                  <div
                    className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full border-2 flex flex-col items-center justify-center shadow-lg ${circleBg} ${
                      isSelected
                        ? "ring-4 ring-[#facc15]/80 shadow-[0_0_20px_rgba(250,204,21,0.7)]"
                        : isClosest
                        ? "ring-2 ring-white/90 shadow-[0_0_14px_rgba(255,255,255,0.6)]"
                        : ""
                    }`}
                  >
                    <span className="font-mono-cm font-extrabold text-[10px] leading-none text-[#facc15]">
                      {m.code}
                    </span>
                    <span className="font-display font-extrabold text-[11px] uppercase leading-tight truncate max-w-[40px]">
                      {displayName.slice(0, 6)}
                    </span>
                  </div>

                  {/* Spelarens hela förnamn under cirkeln */}
                  <span className="mt-0.5 px-1.5 py-[1px] rounded bg-black/75 text-white font-display font-extrabold text-[10px] sm:text-[11px] uppercase leading-none shadow whitespace-nowrap">
                    {displayName}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* ============================================================
          SPELAR-SPOTLIGHT: VAD GÖR JUST DEN HÄR SPELAREN I ANFALL & FÖRSVAR?
         ============================================================ */}
      <section className="cm-bevel rounded-xl p-3.5 border-2 border-[#facc15] space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 rounded bg-[#facc15] text-slate-950 font-mono-cm font-extrabold text-xs uppercase">
              {selectedMove.code}
            </span>
            <div>
              <h3 className="font-display font-extrabold text-base sm:text-lg uppercase text-white">
                {selectedPlayer ? `${selectedPlayer.name} · ` : ""}
                {selectedMove.roleTitle}
              </h3>
              <p className="text-xs font-mono-cm text-sky-300">
                {selectedMove.partnerLabel}
              </p>
            </div>
          </div>

          {/* Snabbknappar för att klicka runt mellan positionerna */}
          <div className="flex items-center gap-1 flex-wrap">
            {activeScenario.moves.map((m) => {
              const p = playerBySlot.get(m.slotIndex);
              return (
                <button
                  key={m.slotIndex}
                  type="button"
                  onClick={() => setSelectedSlotIndex(m.slotIndex)}
                  className={`px-2 py-1 rounded font-mono-cm font-extrabold text-[10px] uppercase border transition ${
                    m.slotIndex === selectedMove.slotIndex
                      ? "bg-[#facc15] text-slate-950 border-yellow-200"
                      : "bg-[#050e1d] text-sky-200 border-sky-400/25"
                  }`}
                >
                  {m.code}
                  {p ? ` (${p.name})` : ""}
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-2.5 rounded-lg bg-[#050e1d] border border-white/10 text-xs sm:text-sm text-amber-200 font-medium">
          <strong>I detta läge:</strong> {selectedMove.scenarioNote}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className="p-3 rounded-lg bg-emerald-950/50 border border-emerald-400/40 space-y-1">
            <div className="font-display font-extrabold text-xs uppercase text-emerald-300 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" />
              <span>När vi anfaller (Vi har bollen)</span>
            </div>
            <p className="text-xs sm:text-sm text-white leading-relaxed">
              {selectedMove.attackTask}
            </p>
          </div>

          <div className="p-3 rounded-lg bg-sky-950/50 border border-sky-400/40 space-y-1">
            <div className="font-display font-extrabold text-xs uppercase text-sky-300 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" />
              <span>När vi försvarar (Motståndaren har bollen)</span>
            </div>
            <p className="text-xs sm:text-sm text-white leading-relaxed">
              {selectedMove.defenseTask}
            </p>
          </div>
        </div>
      </section>

      {/* ============================================================
          SNABB JÄMFÖRELSE: 3 ENKLA REGLER FÖR KILLARNA ATT MINNAS
         ============================================================ */}
      <section className="cm-bevel rounded-xl p-3.5 space-y-2.5">
        <h3 className="font-display font-extrabold text-sm sm:text-base uppercase tracking-wider text-[#facc15] flex items-center gap-1.5">
          <Target className="w-4 h-4" />
          <span>
            3 enkla kom-ihåg till laget i{" "}
            {boardFormation === "1-4-1"
              ? "1-4-1 (Lars Sidopar)"
              : "1-1-3-1 (Jockes Ankare)"}
          </span>
        </h3>

        {boardFormation === "1-4-1" ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="p-3 rounded-lg bg-[#050e1d] border border-[#facc15]/40">
              <div className="font-display font-extrabold text-xs uppercase text-[#facc15]">
                1. Vänsterpar & Högerpar
              </div>
              <p className="text-xs text-slate-200 mt-1 leading-relaxed">
                <strong>VM + CM Vänster</strong> äger vänstersidan ihop.{" "}
                <strong>HM + CM Höger</strong> äger högersidan ihop. Ni lämnar aldrig er kompis ensam på kanten!
              </p>
            </div>
            <div className="p-3 rounded-lg bg-[#050e1d] border border-sky-400/40">
              <div className="font-display font-extrabold text-xs uppercase text-sky-300">
                2. En går fram → En säkrar bakom
              </div>
              <p className="text-xs text-slate-200 mt-1 leading-relaxed">
                Om yttern springer hela vägen fram i anfall stannar innermittfältaren snett bakom på samma sida — <strong>lagom långt bak</strong> (inte i knät på backen).
              </p>
            </div>
            <div className="p-3 rounded-lg bg-[#050e1d] border border-emerald-400/40">
              <div className="font-display font-extrabold text-xs uppercase text-emerald-300">
                3. Bortre yttern in i boxen
              </div>
              <p className="text-xs text-slate-200 mt-1 leading-relaxed">
                Anfaller vi på vänsterkanten? Då smyger högeryttern in framför mål vid bortre stolpen för att trycka in inspelet!
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="p-3 rounded-lg bg-[#050e1d] border border-emerald-400/40">
              <div className="font-display font-extrabold text-xs uppercase text-emerald-300">
                1. Ankaret (DM) stänger mitten
              </div>
              <p className="text-xs text-slate-200 mt-1 leading-relaxed">
                <strong>DM</strong> spelar precis framför vår back (<strong>LIB</strong>). I anfall stannar DM utanför straffområdet som trygg vägg och stoppar kontringar!
              </p>
            </div>
            <div className="p-3 rounded-lg bg-[#050e1d] border border-sky-400/40">
              <div className="font-display font-extrabold text-xs uppercase text-sky-300">
                2. Trean (VM–CM–HM) fyller på
              </div>
              <p className="text-xs text-slate-200 mt-1 leading-relaxed">
                När vi vinner bollen fyller <strong>VM, CM och HM</strong> på framåt tillsammans med vår <strong>Forward (FW)</strong>.
              </p>
            </div>
            <div className="p-3 rounded-lg bg-[#050e1d] border border-[#facc15]/40">
              <div className="font-display font-extrabold text-xs uppercase text-[#facc15]">
                3. Yttrarna måste jobba hem
              </div>
              <p className="text-xs text-slate-200 mt-1 leading-relaxed">
                Eftersom vi har 1 back och 1 ankare i mitten måste <strong>VM och HM</strong> springa hem på sina kanter när motståndaren har bollen!
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
