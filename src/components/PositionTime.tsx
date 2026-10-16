import { POSITION_LABELS } from "@/lib/default-roster";
import { formatDurationMmSs } from "@/lib/match-engine";

export function PositionTime({
  positionMs,
}: {
  positionMs?: Record<string, number>;
}) {
  const entries = Object.entries(positionMs ?? {})
    .filter(([, ms]) => ms >= 1000)
    .sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    return <span className="text-slate-500">—</span>;
  }

  return (
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
  );
}
