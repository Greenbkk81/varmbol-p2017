"use client";

import React from "react";
import { Shield } from "lucide-react";

interface PlayerAvatarProps {
  name: string;
  avatarUrl?: string;
  showPhoto?: boolean;
  isGoalkeeper?: boolean;
  isSelected?: boolean;
  selectionType?: "out" | "in";
  size?: "xs" | "sm" | "md" | "lg";
  number?: string;
  posCode?: string;
  stat?: string;
  statTone?: "good" | "mid" | "low";
}

export function PlayerAvatar({
  name,
  avatarUrl,
  showPhoto = false,
  isGoalkeeper = false,
  isSelected = false,
  selectionType,
  size = "sm",
  number,
  posCode,
  stat,
  statTone = "good",
}: PlayerAvatarProps) {
  const initial = name.trim().slice(0, 2).toUpperCase() || "?";

  const sizeClasses = {
    xs: "w-7 h-7 text-[11px]",
    sm: "w-8 h-8 text-xs",
    md: "w-9 h-9 sm:w-10 sm:h-10 text-xs sm:text-sm",
    lg: "w-11 h-11 text-sm",
  }[size];

  const ringClass = isSelected
    ? selectionType === "out"
      ? "ring-2 ring-orange-300 border-2 border-orange-500 shadow-[0_0_12px_rgba(249,115,22,0.9)] scale-105"
      : "ring-2 ring-emerald-300 border-2 border-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.9)] scale-105"
    : isGoalkeeper
    ? "ring-2 ring-[#facc15] border-2 border-slate-950 shadow-[0_2px_8px_rgba(0,0,0,0.75)]"
    : "ring-2 ring-white/90 border border-slate-950 shadow-[0_2px_8px_rgba(0,0,0,0.75)]";

  const bgStyle = isSelected
    ? selectionType === "out"
      ? "bg-[radial-gradient(circle_at_32%_28%,#fb923c_0%,#ea580c_65%,#7c2d12_100%)] text-slate-950"
      : "bg-[radial-gradient(circle_at_32%_28%,#34d399_0%,#059669_65%,#064e3b_100%)] text-slate-950"
    : isGoalkeeper
    ? "bg-[radial-gradient(circle_at_32%_28%,#fef08a_0%,#facc15_55%,#ca8a04_100%)] text-slate-950"
    : "bg-[radial-gradient(circle_at_32%_28%,#38bdf8_0%,#005cb9_52%,#002b5c_100%)] text-white";

  return (
    <div className="relative inline-flex items-center justify-center shrink-0 select-none">
      {/* Klassisk CM 2D-cirkel / Thumbnail-cirkel */}
      <div
        className={`relative ${sizeClasses} rounded-full overflow-hidden flex items-center justify-center font-mono-cm font-extrabold tracking-tight transition-all duration-150 ${ringClass} ${bgStyle}`}
      >
        {/* 3D glans-effekt i överkant som i klassiska CM4 2D-motorn */}
        <div
          className="absolute inset-x-1 top-0.5 h-2.5 rounded-full bg-gradient-to-b from-white/40 to-transparent pointer-events-none z-10"
          aria-hidden="true"
        />

        {showPhoto && avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt={name}
            className="w-full h-full object-cover object-top"
          />
        ) : (
          <span className="relative z-20 font-mono-cm font-extrabold leading-none drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]">
            {number || initial}
          </span>
        )}
      </div>

      {isGoalkeeper && (
        <span className="absolute -top-1 -right-1 z-30 inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-[#facc15] text-slate-950 border border-slate-950 shadow">
          <Shield className="w-2 h-2 fill-slate-950" />
        </span>
      )}

      {!isGoalkeeper && posCode && !stat && (
        <span className="absolute -top-1 -right-1.5 z-30 px-1 py-[1px] rounded-full bg-[#040d1a] text-[#facc15] text-[8px] font-mono-cm font-extrabold uppercase border border-[#facc15]/60 shadow leading-none">
          {posCode}
        </span>
      )}

      {stat && (
        <span
          className={`absolute left-1/2 -translate-x-1/2 -bottom-1.5 z-30 px-1 py-[1px] rounded-full font-mono-cm font-extrabold text-[8px] leading-none border border-slate-950 shadow tabular-nums ${
            statTone === "low"
              ? "bg-rose-500 text-white"
              : statTone === "mid"
              ? "bg-amber-300 text-slate-950"
              : "bg-emerald-400 text-slate-950"
          }`}
        >
          {stat}
        </span>
      )}
    </div>
  );
}
