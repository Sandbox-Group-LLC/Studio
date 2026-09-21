import { useEffect, useRef, useState } from "react";

/**
 * "The Score" mark — a candlestick chart whose bars double as an audio
 * equalizer. One shape carries both meanings: the market score and the musical
 * score. Monochrome, uses currentColor, legible from 24px to wall scale.
 */
export function ScoreMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      aria-label="The Score"
      role="img"
    >
      {/* Candle wicks + bodies rising left to right, read as EQ bars */}
      <path d="M6 20v6" />
      <path d="M6 12v5" />
      <rect x="3.5" y="17" width="5" height="3" rx="1" fill="currentColor" stroke="none" />
      <path d="M16 24v3" />
      <path d="M16 6v5" />
      <rect x="13.5" y="11" width="5" height="13" rx="1" fill="currentColor" stroke="none" />
      <path d="M26 26v2" />
      <path d="M26 3v3" />
      <rect x="23.5" y="6" width="5" height="20" rx="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ScoreWordmark({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <ScoreMark className="h-7 w-7 text-primary" />
      <div className="leading-none">
        <div className="font-semibold tracking-tight">The Score</div>
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          HOOD Summit 2027
        </div>
      </div>
    </div>
  );
}

/**
 * Deterministic bar visualiser. Bars are seeded from the claim code so a given
 * track always renders the same silhouette — it reads as that person's score.
 */
export function Waveform({
  seed = "score",
  bars = 48,
  active = true,
  className = "h-16",
}: {
  seed?: string;
  bars?: number;
  active?: boolean;
  className?: string;
}) {
  const heights = useRef<number[]>([]);
  if (heights.current.length !== bars) {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 100000;
    heights.current = Array.from({ length: bars }, (_, i) => {
      h = (h * 1103515245 + 12345) % 2147483647;
      const base = 0.25 + ((h >>> 8) % 1000) / 1000 * 0.75;
      // Gentle arc so the middle of the track reads as the chorus.
      const arc = Math.sin((i / bars) * Math.PI) * 0.35 + 0.65;
      return Math.max(0.12, Math.min(1, base * arc));
    });
  }

  return (
    <div className={`flex items-end gap-[3px] ${className}`} aria-hidden="true">
      {heights.current.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-full bg-hue"
          style={{
            height: `${v * 100}%`,
            opacity: active ? 0.55 + v * 0.45 : 0.22,
            animation: active ? `score-pulse ${1.1 + (i % 7) * 0.13}s ease-in-out ${i * 0.03}s infinite` : "none",
            transformOrigin: "bottom",
          }}
        />
      ))}
    </div>
  );
}

/**
 * Playback visualiser.
 *
 * Deliberately not a WebAudio analyser: createMediaElementSource fails silently
 * under autoplay policies, cross-origin streams, and several mobile browsers,
 * which is exactly the situation this runs in. The seeded animated bars read the
 * same at arm's length and cannot break on a show floor.
 */
export function LiveWaveform({
  playing,
  seed,
}: {
  playing: boolean;
  seed: string;
}) {
  return <Waveform seed={seed} active={playing} className="h-20" bars={40} />;
}
