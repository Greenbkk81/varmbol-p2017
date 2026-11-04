# HANDOVER · Värmbols FC P2017 & Multi-Lag Matchcoach

**Senast uppdaterad:** 2026-11-04
**Produktions-URL:** `https://varmbol-p2017.vercel.app/` (även kopplad mot `varmbol.com` i Vercel-projektet `varmbol-p2017` / `prj_Bv02X5qSZQnCx78gMy3r2A9bz2Rd`)
**GitHub-repo:** `Greenbkk81/varmbol-p2017` (`main`)

---

## 1. Var vi är just nu (Status)

Säkerhetsluckorna (öppen `/api/sync` utan autentisering) är nu **helt täppta** och appen är ombyggd till en **invite-only multi-lag-plattform ("Snickar-modellen")** utan tunga databasberoenden.

### Vad som gjordes 2026-11-04:
1. **Låst inloggning & WhatsApp-"Magic Links" (`src/components/TeamAccessGate.tsx`, `src/lib/auth.ts`, `src/app/api/auth/route.ts`):**
   - Hela appen ligger bakom en Championship Manager-stylad låsskärm (`robots: noindex, nofollow`).
   - Stöd för `?join=KOD` i URL:en så tränare i en WhatsApp-grupp kan logga in med **ett klick** (URL:en tvättas direkt efter inloggning via `history.replaceState`).
   - Dubbel sessionslagring (`HttpOnly`-cookie `vfc_session` + `localStorage` Bearer-token `vfc_auth_token_v1`) så iOS Home Screen PWA aldrig tappar inloggningen.
   - Rate-limiting på `/api/auth` (max 12 misslyckade försök per 10 min per IP) + `timingSafeEqual` vid kodjämförelse.
2. **Låst `/api/sync` per lag & roll (`src/app/api/sync/route.ts`):**
   - Kräver giltig HMAC-SHA256-signerad session.
   - `follower`-rollen får `403 Forbidden` vid `POST` (kan bara läsa live-state, aldrig skriva över matchen).
   - Varje lag kan bara läsa/skriva sin egen lagsnapshot (`session.teamId`).
3. **Multi-lag-register & Superadmin-panel (`src/lib/teams.ts`, `src/app/api/admin/teams/route.ts`, `src/components/AdminTeamsModal.tsx`):**
   - Lagregistret sparas i Vercel Blob (`system/teams-registry-v1.json`).
   - **100 % bakåtkompatibilitet för Värmbols FC P2017 (`vfc-p2017`):** Använder exakt samma Blob-sökväg som tidigare (`varmbol-p2017/live-state-v1.json`) och samma `localStorage`-nycklar (`varmbol_p2017_*`).
   - Nya lag får egna isolerade `localStorage`-nycklar (`varmbol_team_<teamId>_*`) och svårgissade hashade Blob-sökvägar (`teams/<slug>-<hash>/live-state-v1.json`).
   - Via knappen **LAG / ADMIN** i headern kan Superadmin (Lars) skapa nya lag, välja färgtema, bulk-importera spelartrupp, rotera koder och dela färdiga WhatsApp-inbjudningar (`wa.me`).
4. **Snabbimport av trupp & WhatsApp-matchrapport (`src/components/VarmbolMatchApp.tsx`):**
   - Tränare kan klistra in en hel spelarlista (ett namn per rad eller `10 Loui`) under **Trupp & Match -> Snabbimportera lista**.
   - Efter matchen finns knappen **Dela i WhatsApp** under **Speltid & Mål** som skapar en färdig matchrapport med resultat och mål/assist.

---

## 2. Koder & Miljövariabler (Vercel)

Följande miljövariabler är inlagda (krypterade) i Vercel-projektet `varmbol-p2017` (`production`, `preview`, `development`):

- `BLOB_READ_WRITE_TOKEN` – Vercel Blob-lagring (`store_iAiISspnQsoSqitL`)
- `AUTH_SECRET` – 64-teckens HMAC-SHA256-nyckel för signering av sessionstokens och Blob-hashar
- `SUPERADMIN_CODE` – `LARS2017` (även `LARS-ADMIN-2017` fungerar som fallback)
- `DEFAULT_VFC_COACH_CODE` – `VFC2017` (Tränarkod för Värmbols FC P2017)
- `DEFAULT_VFC_FOLLOW_CODE` – `VFCLIVE` (Följarkod i läsläge för Värmbols FC P2017)

### Snabblänkar:
- **Superadmin (Lars):** `https://varmbol-p2017.vercel.app/?join=LARS2017`
- **Värmbols FC P2017 (Tränare):** `https://varmbol-p2017.vercel.app/?join=VFC2017`
- **Värmbols FC P2017 (Följ live / läsläge):** `https://varmbol-p2017.vercel.app/?join=VFCLIVE&mode=follow`

---

## 3. Nästa steg när vi plockar upp projektet igen

1. **Testa med 1–2 tränarkollegor i WhatsApp-gruppen:**
   - Logga in som Superadmin (`LARS2017`), klicka på **LAG / ADMIN -> Skapa nytt lag**, klistra in deras spelartrupp (bara förnamn) och tryck på **Skicka i WhatsApp**.
2. **Domänbyte till `varmbol.com` (eller egen produktsida):**
   - `varmbol.com` ligger redan som alias i Vercel-projektet; när DNS pekas om fungerar alla `?join=`-länkar automatiskt på nya domänen.
3. **Framtida idéer (vid behov):**
   - Egen klubblogga-uppladdning per lag till Vercel Blob.
   - Säsongs-/cuparkiv per lag med sammanställd tränings-/matchnärvaro.
   - Om WhatsApp-flödet växer: ev. koppla ett dedikerat svenskt mobilnummer via Zernio/WhatsApp Business API för automatiska matchkort efter avslutad match.
