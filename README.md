# Värmbols FC P2017 · Match & Speltid

Webbapp för tränarna i **Värmbols FC Pojkar 2017** (Lars, Jocke och Sofia) för att hålla koll på speltid, byten och målvaktstid i 7-manna och 5-manna.

## Funktioner

- **Hela P2017-truppen inlagd** (endast förnamn: Abdullahi, Bilel, Edvin, Gabriel, Holger, Kasper, Lukas, Mahir, Mille, Oliver, Oscar, Scott). På planen visas nummercirklar, tidspill och namn direkt på gräset.
- **Speltid per plats och cupen totalt** i Speltidsrapport. Sparas i telefonen när en match läggs i cuploggen, och när nästa match startas.
- **Korta ljudeffekter** vid avspark, byte, mål, MV-krage och slutsignal. Stängs av med högtalarikonen.
- **Guide** som förklarar klockan, byten, formationer och statistiken.
- **Kallelse / Matchval:** Bocka i vilka spelare som är med på dagens match eller cup (t.ex. *Provcup 7v7 Norrköping, IK Sleipner*), och ställ in `2×15 min`, `3×15 min`, `3×20 min` osv.
- **Multi-byte (1, 2, 3 eller 4 spelare samtidigt):** Klicka på valfritt antal spelare på planen och lika många på bänken och genomför bytet på ett tryck.
- **Förslag (1–4 spelare):** Stint ställs in före avspark (4, 5, 6 eller 7 minuter, standard 5). Då markeras BYT. 1x–4x föreslår vilka som ska bytas. Själva bytet sker först när ni trycker Genomför byte. Målvakten står utanför den rytmen.
- **Målvaktskrage (MV):** Spårar målvaktstid separat från utespelartid så att den som stått i mål en period inte straffas i utespelarbytena.
- **Exakt bakgrundsklocka + Wake Lock:** Tappar aldrig tid om skärmen på Android-telefonen slocknar eller om man byter app under matchen.

## Köra lokalt

```bash
npm install
npm run dev -- --port 43210
```
