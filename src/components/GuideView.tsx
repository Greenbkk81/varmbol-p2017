"use client";

import { SOUND_CUES, SoundCue } from "@/lib/sounds";
import { Volume2 } from "lucide-react";

const SECTIONS: { title: string; body: string }[] = [
  {
    title: "Klockan",
    body: "Avspark startar periodklockan. Pausa när ni vill frysa tiden, till exempel vid en lång avblåsning. Fortsätt tar vid där ni slutade. Klockan följer telefonens riktiga tid, så den tappar inte sekunder om skärmen slocknar. Wake Lock försöker hålla skärmen tänd under pågående period.",
  },
  {
    title: "Byten, en till fyra åt gången",
    body: "Tryck på spelarna som ska gå ut. De får en orange ring. Tryck sedan på lika många på bänken, de får en grön ring. Genomför byte längst ner. Den som kommer in tar samma plats som den som gick ut. Ångra finns bredvid klockan om det blev fel.",
  },
  {
    title: "Förslag",
    body: "Stint ställs in före avspark: 4, 5, 6 eller 7 minuter. Fem är standard. När en utespelare varit inne så länge får han BYT, och den gula raden nämner vem på bänken som väntat längst. 1x till 4x markerar bara förslaget. Inget byte sker förrän ni trycker Genomför byte, vid en död boll. Målvakten står utanför den rytmen.",
  },
  {
    title: "Skifta plats på planen",
    body: "Markera exakt två spelare som redan är inne, och ingen på bänken. Då dyker Skifta plats upp. De byter position med varandra. Tar någon målvaktsplatsen följer MV-kragen med.",
  },
  {
    title: "Målvaktskrage",
    body: "Den gula skölden visar vem som står i mål. MV-tid räknas för sig och drar inte ner spelaren i utespelarbytena. Öppna MV-krage för att ge kragen till någon annan, på planen eller från bänken.",
  },
  {
    title: "Siffrorna på cirklarna",
    body: "Speltid är total tid på plan i matchen. Inne nu är den pågående perioden på plan eller på bänken. Bänk är samlad bänktid. Färgen följer konditionen: grönt är fräscht, gult börjar ta, rött betyder att det är dags att titta på ett byte.",
  },
  {
    title: "Formation",
    body: "1-4-1 är grunduppställningen i sjumannafotboll: målvakt, libero, fyrbackslinje på mitten och en spets. 2-3-1, 2-2-2 och 3-2-1 flyttar samma sju spelare. I femmanna finns 1-2-1 och 2-2. Tiden sparas på den plats spelaren stod just då, så ett byte av formation delar upp minuterna.",
  },
  {
    title: "Statistik och cupen",
    body: "Speltidsrapport visar den här matchen: total tid, bänk och varje plats (MV, LIB, FW och så vidare). Cupen totalt lägger ihop sparade matcher plus den som pågår, utan att räkna samma match två gånger. Spara i cuplogg när matchen är slut. Startar ni nästa match sparas den förra automatiskt om klockan har gått.",
  },
  {
    title: "Ljud",
    body: "Högtalarikonen uppe till höger slår av och på ljuden. De är korta med flit, så de hörs vid sidlinjen utan att ta över. Prova dem här under.",
  },
  {
    title: "Det som sparas",
    body: "Allt ligger i den här telefonen. Inga efternamn och inga medlemsnummer. Rensar ni webbläsarens data försvinner matcherna, så spara cupen innan ni byter telefon.",
  },
];

export function GuideView({
  soundEnabled,
  onPreview,
}: {
  soundEnabled: boolean;
  onPreview: (cue: SoundCue) => void;
}) {
  return (
    <div className="space-y-4">
      <section className="cm-bevel rounded-xl overflow-hidden">
        <div className="cm-header-bar px-4 py-3">
          <h2 className="font-display font-extrabold text-lg uppercase tracking-wider text-white">
            Så funkar sidlinjen
          </h2>
          <p className="text-[11px] font-mono-cm text-sky-100 mt-0.5">
            Kort genomgång för Lars, Jocke och Sofia. En telefon, en match i taget.
          </p>
        </div>
        <div className="p-3 space-y-3">
          {SECTIONS.map((section) => (
            <article
              key={section.title}
              className="rounded-lg bg-[#050e1d] border border-white/10 px-3 py-2.5"
            >
              <h3 className="font-display font-extrabold text-sm uppercase tracking-wide text-[#facc15]">
                {section.title}
              </h3>
              <p className="mt-1 text-sm text-slate-200 leading-snug">
                {section.body}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="cm-bevel rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-white/10 flex items-center justify-between gap-2">
          <h3 className="font-display font-extrabold text-sm uppercase tracking-wider text-white">
            Prova ljuden
          </h3>
          <span className="font-mono-cm text-[10px] uppercase text-slate-400">
            {soundEnabled ? "Ljud på" : "Ljud av — slå på högtalaren först"}
          </span>
        </div>
        <div className="p-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
          {SOUND_CUES.map((item) => (
            <button
              key={item.cue}
              type="button"
              disabled={!soundEnabled}
              onClick={() => onPreview(item.cue)}
              className="text-left rounded-lg px-2.5 py-2 bg-[#07111f] border border-white/10 hover:border-[#facc15]/60 disabled:opacity-40 disabled:hover:border-white/10"
            >
              <span className="flex items-center gap-1.5 font-display font-extrabold text-xs uppercase text-white">
                <Volume2 className="w-3.5 h-3.5 text-[#facc15]" />
                {item.label}
              </span>
              <span className="block mt-0.5 text-[11px] text-slate-400 leading-snug">
                {item.hint}
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
