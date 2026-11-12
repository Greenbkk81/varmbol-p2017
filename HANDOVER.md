# HANDOVER · Värmbols FC P2017 & Matchcoach

**Senast uppdaterad:** 2026-11-12
**Aktiv URL (bokmärke / hemskärm):** `https://varmbol-p2017.vercel.app/` *(OBS: DNS-ompekning av `varmbol.com` hos Websupport är pausad – vi kör direkt på Vercel-URL:en)*
**GitHub-repo:** `Greenbkk81/varmbol-p2017` (`main`)

---

## 0. Fältrapport & Insikter efter KAIK-matchen (11 nov 2026 · Vinst 9–2! 🏆)

### Vad som fungerade klockrent:
- **Seger med 9–2 mot KAIK i 7-mot-7!** Taktiken med sidopar och kommunikation mellan ytter och innermittfältare (`VM ↔ IMV` och `HM ↔ IMH`) satt riktigt bra.
- **Interaktiv Rörelse- & Taktiktavla (`src/components/TacticalMovementView.tsx`):**
  - **Bollstyrd lagrörelse:** När man drar bollen `⚽` på planen rör sig alla 7 gubbarna (med dagens riktiga spelarnamn) och gummibanden i realtid.
  - **`⚽ Vi har bollen` vs `🛡️ Motståndaren har bollen` + `🦅 Hög Press`:** Visar tydligt hur laget flyttar upp och låser fast motståndaren när de har bollen nere vid sitt eget mål (FW styr ut mot kanten, yttern sätter 1:a press, CM säkrar snett bakom).
  - **`🔓 Frigör gubbar (Flytta fritt)`:** Knappen frigör alla gubbar så man kan dra varje enskild spelare fritt med fingret som på en magnetisk taktiktavla.
  - **`▶️ Autokör ⚽`:** Spelar upp en hel matchsekvens automatiskt.

### Viktiga fältinsikter inför nästa steg (pausat idag 12 nov):
1. **Renodla till de 2 saker som faktiskt används vid sidlinjen:**
   - I skarpt läge på match använder man egentligen bara **två grejer**:
     1. **Spel & Byten** (vem som ska byta med vem och när).
     2. **Taktiktavlan / Rörelse** (visa grabbarna hur vi tänker och står i anfall/försvar).
   - *Nästa utvecklingssteg:* Rensa bort/fäll ihop allt "nice-to-have"-brus runt omkring och gör ett **avskalat Match- & Taktikläge** med bara **Byten** och **Rörelse**.
2. **Regn på skärmen & Hårdvara (iPad):**
   - Appen funkade superbra tills det började regna – då blir det stökigt med vattendroppar och små knappar på en vanlig mobilskärm.
   - *Funderar på:* Att skaffa en **iPad / surfplatta** (med rejält regn-/stöttåligt fodral) så det blir ännu smidigare att samla killarna och visa hur vi spelar.
   - *I appen vid tillfälle:* Ett **"🌧️ Regnläge / Skärmlås"** som låser skärmen mot oavsiktliga vattendropps-tryck och bara har extrastora knappar för Byten + Taktiktavla.
3. **Domänen `varmbol.com` (Websupport) läggs på is:**
   - Krångligt att rodda med Websupport just nu och tillför inget akut värde. Vi kör på `https://varmbol-p2017.vercel.app/`.

---

## 1. Vad som ligger i koden just nu

1. **Två 7v7-uppställningar (`1-4-1` Lars Sidopar & `1-1-3-1` Jockes Ankare):**
   - **`1-4-1` (Lars – Sidopar Vänster & Höger):** Vänsterpar (`VM + IMV`) och Högerpar (`HM + IMH`) med visuella zoner och gummiband.
   - **`1-1-3-1` (Jocke – Back + Ankare + 3 Mitt + Spets):** `MV` + `LIB` + `DM` (Ankare) + `VM/CM/HM` + `FW`.
2. **Interaktiv Rörelse-flik (`src/components/TacticalMovementView.tsx`):**
   - 6 färdiga scenarier (`Grundposition`, `Anfall Vänster`, `Anfall Höger`, `Hög Press`, `Försvar Lågt`, `Uppspel MV`) + fri bollstyrning, `Frigör gubbar`-knapp och `Autokör`-animation.
3. **Live-redigering av uppställning & byten (`src/components/VarmbolMatchApp.tsx`):**
   - Går att byta vem som startar, byta positioner mellan spelare på planen och justera matchtruppen både inför och mitt under pågående match.
4. **Säkerhet & Multi-lag-stöd (`src/lib/auth.ts`, `src/app/api/sync/route.ts`):**
   - Låst bakom `TeamAccessGate` (`robots: noindex, nofollow`) med WhatsApp-länkar (`?join=KOD`) och dubbla sessioner (`HttpOnly`-cookie + `localStorage`).

---

## 2. Koder & Snabblänkar (Vercel)

- **Superadmin (Lars):** `https://varmbol-p2017.vercel.app/?join=LARS2017`
- **Värmbols FC P2017 (Tränare):** `https://varmbol-p2017.vercel.app/?join=VFC2017`
- **Värmbols FC P2017 (Följ live / läsläge):** `https://varmbol-p2017.vercel.app/?join=VFCLIVE&mode=follow`

---

## 3. Nästa gång vi öppnar projektet (Action List)

1. **Bygg "Avskalat Matchläge (Byten + Taktik)":**
   - Skala bort sekundära kort/statistikflikar under match så bara **1) Byten/Spelplan** och **2) Rörelse/Taktiktavla** syns med stora, regnsäkra knappar.
2. **iPad-/Surfplatte-vy:**
   - Optimera bredden på 2D-taktikplanen så att den fyller ut en liggande/stående iPad-skärm perfekt när man visar grabbarna före match (t.ex. inför IFK Norrköping i Teknikhallen).
