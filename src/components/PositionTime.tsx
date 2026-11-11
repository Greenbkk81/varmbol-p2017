import { POSITION_LABELS } from "@/lib/default-roster";
import { formatDurationMmSs } from "@/lib/match-engine";

export interface RoleZoneSummary {
  leftSideMs: number;   // Vänsterparet: VM + IMV + VB
  rightSideMs: number;  // Högerparet: HM + IMH + HB
  centralMs: number;    // Back / Ankare / C-mitt: LIB + DM + CM + MB
  attackMs: number;     // Spets: FW + FWM + FWH + FWV
}

export function summarizeRoleZones(
  positionMs?: Record<string, number>
): RoleZoneSummary {
  const p = positionMs ?? {};
  return {
    leftSideMs: (p.VM ?? 0) + (p.IMV ?? 0) + (p.VB ?? 0),
    rightSideMs: (p.HM ?? 0) + (p.IMH ?? 0) + (p.HB ?? 0),
    centralMs: (p.LIB ?? 0) + (p.DM ?? 0) + (p.CM ?? 0) + (p.MB ?? 0),
    attackMs: (p.FW ?? 0) + (p.FWM ?? 0) + (p.FWH ?? 0) + (p.FWV ?? 0),
  };
}

export function PositionTime({
  positionMs,
  showZones = false,
}: {
  positionMs?: Record<string, number>;
  showZones?: boolean;
}) {
  const entries = Object.entries(positionMs ?? {})
    .filter(([, ms]) => ms >= 1000)
    .sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    return <span className="text-slate-500">—</span>;
  }

  const zones = summarizeRoleZones(positionMs);
  const zoneBadges: { label: string; ms: number; tone: string }[] = [
    {
      label: "Vänsterpar (VM+IMV)",
      ms: zones.leftSideMs,
      tone: "border-emerald-400/35 text-emerald-200 bg-emerald-950/40",
    },
    {
      label: "Högerpar (HM+IMH)",
      ms: zones.rightSideMs,
      tone: "border-sky-400/35 text-sky-200 bg-sky-950/40",
    },
    {
      label: "Centralt (LIB/DM/CM)",
      ms: zones.centralMs,
      tone: "border-amber-400/35 text-amber-200 bg-amber-950/40",
    },
    {
      label: "Spets (FW)",
      ms: zones.attackMs,
      tone: "border-purple-400/35 text-purple-200 bg-purple-950/40",
    },
  ].filter((z) => z.ms >= 1000);

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1">
        {entries.map(([code, ms]) => (
          <span
            key={code}
            title={POSITION_LABELS[code] || code}
            className="px-1.5 py-0.5 rounded bg-[#07111f] border border-white/10 font-mono-cm text-[10px] text-sky-100 leading-none"
          >
            <span className="text-[#facc15] font-extrabold">{code}</span>{" "}
            {formatDurationMmSs(ms)}
          </span>
        ))}
      </div>
      {showZones && zoneBadges.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {zoneBadges.map((z) => (
            <span
              key={z.label}
              className={`px-1.5 py-0.5 rounded border font-mono-cm text-[9px] leading-none ${z.tone}`}
            >
              <span className="font-bold">{z.label}:</span>{" "}
              {formatDurationMmSs(z.ms)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
