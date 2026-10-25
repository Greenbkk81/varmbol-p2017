export type SoundCue =
  | "kickoff"
  | "resume"
  | "pause"
  | "period"
  | "fulltime"
  | "sub"
  | "stint"
  | "goal"
  | "conceded"
  | "gk"
  | "swap";

export const SOUND_CUES: { cue: SoundCue; label: string; hint: string }[] = [
  { cue: "kickoff", label: "Avspark", hint: "Två korta signaler och en stigande vissling" },
  { cue: "resume", label: "Fortsätt", hint: "Kort uppåtvissling när klockan drar igång igen" },
  { cue: "pause", label: "Paus", hint: "Kort nedåtvissling" },
  { cue: "stint", label: "Bytesdags (5m)", hint: "Dubbelpip när det är dags att förbereda byte" },
  { cue: "period", label: "Periodslut", hint: "Lång domarvissling när tiden är ute" },
  { cue: "fulltime", label: "Slutsignal", hint: "Lång vissling, en gång till" },
  { cue: "sub", label: "Byte", hint: "Bytebräda och en kort pip" },
  { cue: "goal", label: "Mål", hint: "Kort jubel när Värmbol gör mål" },
  { cue: "conceded", label: "Insläppt", hint: "Dov signal när motståndaren gör mål" },
  { cue: "gk", label: "MV-krage", hint: "Två mjuka toner när kragen byter spelare" },
  { cue: "swap", label: "Platsbyte", hint: "Kort drag när två på planen byter plats" },
];

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) return null;
  if (!audioCtx || audioCtx.state === "closed") {
    audioCtx = new AudioCtx();
  }
  return audioCtx;
}

export function resumeSound() {
  const ctx = getCtx();
  if (ctx && ctx.state === "suspended") {
    void ctx.resume();
  }
}

function tone(
  ctx: AudioContext,
  dest: AudioNode,
  t: number,
  freq: number,
  dur: number,
  peak: number,
  type: OscillatorType = "sine",
  slideTo?: number
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(40, freq), t);
  if (slideTo) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t + dur);
  }
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.03, dur * 0.25));
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain);
  gain.connect(dest);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noiseBurst(
  ctx: AudioContext,
  dest: AudioNode,
  t: number,
  dur: number,
  peak: number,
  fromHz: number,
  toHz: number
) {
  const length = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 0.7;
  filter.frequency.setValueAtTime(fromHz, t);
  filter.frequency.exponentialRampToValueAtTime(Math.max(80, toHz), t + dur);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + dur * 0.15);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(dest);
  src.start(t);
  src.stop(t + dur + 0.02);
}

function whistle(
  ctx: AudioContext,
  dest: AudioNode,
  t: number,
  from: number,
  to: number,
  dur: number,
  peak: number
) {
  tone(ctx, dest, t, from, dur, peak * 0.85, "sine", to);
  tone(ctx, dest, t, from * 2.01, dur, peak * 0.18, "sine", to * 2);
  noiseBurst(ctx, dest, t, dur, peak * 0.12, 1400, 2200);
}

export function playSound(cue: SoundCue) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      if (cue === "stint") navigator.vibrate([180, 90, 180]);
      else if (cue === "period" || cue === "fulltime") navigator.vibrate([300, 120, 300]);
      else if (cue === "sub" || cue === "goal") navigator.vibrate(80);
    } catch {
      // ignore
    }
  }
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    void ctx.resume();
  }
  const t = ctx.currentTime + 0.02;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.85, t);
  master.connect(ctx.destination);

  switch (cue) {
    case "kickoff":
      tone(ctx, master, t, 1480, 0.08, 0.12);
      tone(ctx, master, t + 0.14, 1760, 0.09, 0.13);
      whistle(ctx, master, t + 0.3, 880, 1760, 0.48, 0.16);
      break;
    case "resume":
      whistle(ctx, master, t, 700, 1320, 0.22, 0.12);
      break;
    case "pause":
      whistle(ctx, master, t, 1200, 520, 0.28, 0.11);
      break;
    case "stint":
      tone(ctx, master, t, 880, 0.11, 0.16, "triangle");
      tone(ctx, master, t + 0.15, 1175, 0.16, 0.18, "triangle");
      break;
    case "period":
      whistle(ctx, master, t, 980, 1240, 0.72, 0.18);
      break;
    case "fulltime":
      whistle(ctx, master, t, 880, 1320, 0.7, 0.18);
      whistle(ctx, master, t + 0.82, 880, 1560, 0.85, 0.18);
      break;
    case "sub":
      tone(ctx, master, t, 180, 0.05, 0.2, "square");
      tone(ctx, master, t + 0.07, 140, 0.06, 0.16, "square");
      tone(ctx, master, t + 0.16, 990, 0.12, 0.1);
      break;
    case "goal":
      tone(ctx, master, t, 523, 0.16, 0.14);
      tone(ctx, master, t + 0.12, 659, 0.16, 0.14);
      tone(ctx, master, t + 0.24, 784, 0.28, 0.16);
      noiseBurst(ctx, master, t, 0.7, 0.08, 400, 1800);
      break;
    case "conceded":
      tone(ctx, master, t, 220, 0.28, 0.12, "triangle", 110);
      tone(ctx, master, t + 0.16, 174, 0.32, 0.08, "triangle", 90);
      break;
    case "gk":
      tone(ctx, master, t, 698, 0.18, 0.1);
      tone(ctx, master, t + 0.12, 880, 0.26, 0.1);
      break;
    case "swap":
      noiseBurst(ctx, master, t, 0.22, 0.1, 300, 1600);
      tone(ctx, master, t, 440, 0.16, 0.06, "sine", 880);
      break;
    default:
      break;
  }
}
