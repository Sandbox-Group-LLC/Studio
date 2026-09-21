import { useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Download, Pause, Play, Share2 } from "lucide-react";
import { ScoreMark, ScoreWordmark, Waveform, LiveWaveform } from "@/lib/brand";
import { PRESET_MAP, type PresetId } from "@shared/presets";
import type { PublicTrack } from "@shared/schema";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

/**
 * The attendee's phone view. Reached only by scanning the kiosk QR, so it is
 * mobile-first and assumes a cold open with no prior context.
 */
export default function TrackPage() {
  const { code } = useParams<{ code: string }>();
  const claimCode = (code || "").toUpperCase();

  const { data, isLoading, isError } = useQuery<PublicTrack>({
    queryKey: ["/api/tracks", claimCode],
    // Poll while rendering; stop once the track resolves either way.
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === "ready" || s === "failed" ? false : 4000;
    },
    retry: 1,
  });

  const preset = data ? PRESET_MAP[data.preset as PresetId] : null;
  const hue = preset?.accent ?? "122 100% 41%";

  return (
    <div
      className="relative min-h-screen bg-background text-foreground"
      style={{ ["--hue" as any]: hue }}
    >
      <div className="desk-grid pointer-events-none absolute inset-0 opacity-60" />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-72 opacity-50"
        style={{ background: `radial-gradient(70% 100% at 50% 0%, hsl(${hue} / 0.3), transparent 70%)` }}
      />

      <div className="relative mx-auto w-full max-w-lg px-6 py-8">
        <ScoreWordmark />

        <div className="mt-10">
          {isLoading && <Skeleton />}

          {isError && (
            <Panel>
              <h1 className="text-2xl font-semibold tracking-tight">We can't find that code</h1>
              <p className="mt-3 text-muted-foreground">
                Double-check the six characters from the kiosk screen, or ask a host to look it up.
              </p>
              <div className="mt-5 font-mono text-sm tracking-[0.25em] text-muted-foreground">
                {claimCode || "——————"}
              </div>
            </Panel>
          )}

          {data?.status === "failed" && (
            <Panel>
              <h1 className="text-2xl font-semibold tracking-tight">This one didn't land</h1>
              <p className="mt-3 text-muted-foreground">
                The studio hit a snag writing your track. Show this code to a host and they'll run it
                again — same code, no need to start over.
              </p>
              <div className="mt-5 font-mono text-lg tracking-[0.25em] text-hue">{claimCode}</div>
            </Panel>
          )}

          {data && (data.status === "queued" || data.status === "generating") && (
            <Rendering track={data} />
          )}

          {data?.status === "ready" && <Player track={data} claimCode={claimCode} />}
        </div>

        <p className="mt-12 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Sandbox XM · The Score · HOOD Summit 2027
        </p>
      </div>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-card-border bg-card p-7">{children}</div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="h-8 w-2/3 animate-pulse rounded-md bg-secondary" />
      <div className="h-4 w-1/2 animate-pulse rounded-md bg-secondary" />
      <div className="h-36 animate-pulse rounded-xl bg-secondary" />
    </div>
  );
}

/** Progress is elapsed-time based — the provider exposes no percentage. */
function Rendering({ track }: { track: PublicTrack }) {
  const [elapsed, setElapsed] = useState(() => Math.floor((Date.now() - track.createdAt) / 1000));

  useEffect(() => {
    const t = window.setInterval(
      () => setElapsed(Math.floor((Date.now() - track.createdAt) / 1000)),
      1000,
    );
    return () => window.clearInterval(t);
  }, [track.createdAt]);

  const stages = [
    { at: 0, label: "Reading your inputs" },
    { at: 12, label: "Writing your lyrics" },
    { at: 40, label: "Producing the track" },
    { at: 95, label: "Final mix" },
  ];
  const current = stages.filter((s) => elapsed >= s.at).pop() ?? stages[0];
  const pct = Math.min(94, Math.round((elapsed / 130) * 100));

  return (
    <div>
      <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-hue">In the studio</div>
      <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight">
        {track.firstName ? `${track.firstName}, we're` : "We're"} writing your score.
      </h1>
      {track.goal && (
        <p className="mt-3 text-muted-foreground">
          Built around one thing: <span className="text-foreground">{track.goal.toLowerCase()}</span>.
        </p>
      )}

      <div className="mt-8 rounded-xl border border-card-border bg-card p-6">
        <Waveform seed={track.claimCode} bars={36} className="h-20" />

        <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-hue transition-all duration-1000 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="mt-4 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.16em]">
          <span className="text-hue" data-testid="text-stage">
            {current.label}
          </span>
          <span className="text-muted-foreground">
            {String(Math.floor(elapsed / 60)).padStart(2, "0")}:{String(elapsed % 60).padStart(2, "0")}
          </span>
        </div>
      </div>

      <p className="mt-6 text-sm text-muted-foreground">
        Keep this page open or come back to it — the link stays live. Most tracks finish in under two
        minutes.
      </p>
    </div>
  );
}

function Player({ track, claimCode }: { track: PublicTrack; claimCode: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioError, setAudioError] = useState(false);
  const src = `${API_BASE}/api/tracks/${claimCode}/audio`;

  // Playback state is driven by the element's own events, never assumed from
  // the click — a rejected play() must not leave a pause icon on screen.
  const toggle = async () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      try {
        await a.play();
      } catch {
        setAudioError(true);
      }
    } else {
      a.pause();
    }
  };

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: track.title, text: "My score from HOOD Summit.", url });
        return;
      } catch {
        /* user dismissed the sheet */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* clipboard unavailable — the visible link is the fallback */
    }
  };

  const fmt = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <div>
      <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-hue">Ready</div>
      <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight" data-testid="text-title">
        {track.title}
      </h1>
      <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        {PRESET_MAP[track.preset as PresetId]?.label} · {claimCode}
      </p>

      <div className="mt-7 overflow-hidden rounded-xl border border-card-border bg-card">
        {track.imageUrl && (
          <img
            src={track.imageUrl}
            alt=""
            className="h-52 w-full object-cover opacity-90"
            crossOrigin="anonymous"
          />
        )}

        <div className="p-6">
          <LiveWaveform playing={playing} seed={claimCode} />

          <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-hue"
              style={{ width: duration ? `${(progress / duration) * 100}%` : "0%" }}
            />
          </div>
          <div className="mt-2 flex justify-between font-mono text-[11px] text-muted-foreground">
            <span>{fmt(progress)}</span>
            <span>{duration ? fmt(duration) : "--:--"}</span>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={toggle}
              data-testid="button-play"
              aria-label={playing ? "Pause" : "Play"}
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-hue text-background transition-transform active:scale-95"
            >
              {playing ? <Pause className="h-6 w-6" /> : <Play className="ml-0.5 h-6 w-6" />}
            </button>
            <a
              href={`${src}?download=1`}
              download
              data-testid="link-download"
              className="flex h-14 flex-1 items-center justify-center gap-2 rounded-full border border-border text-base font-medium hover-elevate"
            >
              <Download className="h-4 w-4" /> Save
            </a>
            <button
              onClick={share}
              data-testid="button-share"
              aria-label="Share"
              className="flex h-14 w-14 items-center justify-center rounded-full border border-border hover-elevate"
            >
              <Share2 className="h-4 w-4" />
            </button>
          </div>

          <audio
            ref={audioRef}
            src={src}
            preload="metadata"
            crossOrigin="anonymous"
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
            onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime)}
            onPlay={() => {
              setPlaying(true);
              setAudioError(false);
            }}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onError={() => setAudioError(true)}
          />

          {audioError && (
            <p className="mt-4 text-sm text-destructive" data-testid="text-audio-error">
              This track won't play here. Tap Save to download it, or show your code to a host.
            </p>
          )}
        </div>
      </div>

      {/* Production credits. The provider returns no lyric sheet, so this shows
          the real style direction behind the track instead of an empty panel. */}
      {track.style && (
        <div className="mt-7 rounded-xl border border-card-border bg-card p-6">
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              How it was made
            </span>
            {track.durationSec ? (
              <span
                className="font-mono text-[11px] tracking-[0.12em] text-muted-foreground"
                data-testid="text-duration"
              >
                {Math.floor(track.durationSec / 60)}:
                {String(track.durationSec % 60).padStart(2, "0")}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {track.style
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
              .map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-card-border bg-background px-3 py-1.5 text-xs text-foreground/80"
                >
                  {tag}
                </span>
              ))}
          </div>
        </div>
      )}

      <div className="mt-7 flex items-center gap-3 rounded-xl border border-card-border bg-card p-5">
        <ScoreMark className="h-7 w-7 shrink-0 text-hue" />
        <p className="text-sm text-muted-foreground">
          Yours to keep. Save it now — the file stays available here for 14 days.
        </p>
      </div>
    </div>
  );
}
