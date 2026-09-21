import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Search } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { ScoreWordmark } from "@/lib/brand";
import { PRESET_MAP, type PresetId } from "@shared/presets";
import type { Track } from "@shared/schema";

interface OpsResponse {
  tracks: Track[];
  stats: {
    total: number;
    ready: number;
    inFlight: number;
    failed: number;
    byPreset: { preset: string; label: string; count: number }[];
    medianSeconds: number | null;
  };
}

/**
 * Floor operator view. The point of this screen is that a host standing at the
 * booth can answer "where is my song?" in one look, and fix a failure without
 * making the guest start over.
 */
interface StorageHealth {
  configured: boolean;
  ok: boolean;
  detail: string;
  readyCount: number;
  storedCount: number;
  retentionDays: number;
}

export default function Ops() {
  const [q, setQ] = useState("");
  const [retrying, setRetrying] = useState<string | null>(null);

  const { data, isLoading } = useQuery<OpsResponse>({
    queryKey: ["/api/ops/tracks"],
    refetchInterval: 5000,
  });

  const { data: credits } = useQuery<{ credits: number | null }>({
    queryKey: ["/api/ops/credits"],
    refetchInterval: 60000,
  });

  const { data: store } = useQuery<StorageHealth>({
    queryKey: ["/api/ops/storage"],
    refetchInterval: 30000,
  });

  const retry = async (code: string) => {
    setRetrying(code);
    try {
      await apiRequest("POST", `/api/ops/tracks/${code}/retry`);
    } catch {
      /* the row's error message updates on the next poll */
    } finally {
      setRetrying(null);
      queryClient.invalidateQueries({ queryKey: ["/api/ops/tracks"] });
    }
  };

  const rows = (data?.tracks ?? []).filter((t) => {
    if (!q.trim()) return true;
    const needle = q.trim().toLowerCase();
    return (
      t.claimCode.toLowerCase().includes(needle) ||
      (t.firstName ?? "").toLowerCase().includes(needle) ||
      t.preset.includes(needle)
    );
  });

  const s = data?.stats;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-6xl px-6 py-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <ScoreWordmark />
          <div className="flex items-center gap-3">
            <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Floor operations
            </div>
            {store && (
              <span
                className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 font-mono text-[11px] text-muted-foreground"
                title={store.detail}
                data-testid="chip-storage"
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    !store.configured
                      ? "bg-muted-foreground"
                      : store.ok && store.storedCount === store.readyCount
                        ? "bg-primary"
                        : "bg-destructive"
                  }`}
                />
                {!store.configured
                  ? "No storage"
                  : `Saved ${store.storedCount}/${store.readyCount}`}
              </span>
            )}
            <span className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Live
            </span>
          </div>
        </header>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="Tracks made" value={s?.total ?? "—"} />
          <Stat label="In flight" value={s?.inFlight ?? "—"} tone={s?.inFlight ? "active" : undefined} />
          <Stat label="Ready" value={s?.ready ?? "—"} />
          <Stat
            label="Failed"
            value={s?.failed ?? "—"}
            tone={s?.failed ? "bad" : undefined}
          />
          <Stat
            label="Median render"
            value={s?.medianSeconds != null ? `${s.medianSeconds}s` : "—"}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {s?.byPreset.map((p) => (
            <span
              key={p.preset}
              style={{ ["--hue" as any]: PRESET_MAP[p.preset as PresetId]?.accent }}
              className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em]"
            >
              <span className="h-2 w-2 rounded-full bg-hue" />
              {p.label}
              <span className="text-muted-foreground">{p.count}</span>
            </span>
          ))}
          {credits?.credits != null && (
            <span className="ml-auto font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              API credits: <span className="text-foreground">{credits.credits}</span>
            </span>
          )}
        </div>

        <div className="relative mt-8">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search a claim code, name, or style"
            data-testid="input-search"
            className="h-12 rounded-xl border-border bg-card pl-11"
          />
        </div>

        <div className="mt-5 overflow-hidden rounded-xl border border-card-border bg-card">
          <div className="hidden grid-cols-[110px_1fr_140px_120px_100px_110px] gap-4 border-b border-border px-5 py-3 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground md:grid">
            <span>Code</span>
            <span>Guest / title</span>
            <span>Style</span>
            <span>Status</span>
            <span>Render</span>
            <span />
          </div>

          {isLoading && (
            <div className="space-y-2 p-5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-md bg-secondary" />
              ))}
            </div>
          )}

          {!isLoading && rows.length === 0 && (
            <div className="px-5 py-16 text-center">
              <p className="text-lg font-medium">No tracks yet</p>
              <p className="mt-2 text-sm text-muted-foreground">
                The queue fills as guests finish at the booth.
              </p>
            </div>
          )}

          {rows.map((t) => (
            <div
              key={t.claimCode}
              data-testid={`row-track-${t.claimCode}`}
              style={{ ["--hue" as any]: PRESET_MAP[t.preset as PresetId]?.accent }}
              className="grid grid-cols-1 gap-2 border-b border-border px-5 py-4 last:border-0 md:grid-cols-[110px_1fr_140px_120px_100px_110px] md:items-center md:gap-4"
            >
              <span className="font-mono text-sm font-semibold tracking-[0.15em] text-hue">
                {t.claimCode}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{t.title}</span>
                {t.status === "failed" && t.errorMessage ? (
                  // A host needs the actual reason on screen, not in a tooltip.
                  <span className="block truncate text-xs text-destructive" title={t.errorMessage}>
                    {t.errorMessage}
                  </span>
                ) : (
                  t.goal && (
                    <span className="block truncate text-xs text-muted-foreground">{t.goal}</span>
                  )
                )}
              </span>
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                {PRESET_MAP[t.preset as PresetId]?.label}
              </span>
              <StatusPill status={t.status} error={t.errorMessage} />
              <span className="font-mono text-xs text-muted-foreground">
                {t.readyAt ? `${Math.round((t.readyAt - t.createdAt) / 1000)}s` : "—"}
              </span>
              <span className="flex justify-start md:justify-end">
                {t.status === "failed" && (
                  <button
                    onClick={() => retry(t.claimCode)}
                    disabled={retrying === t.claimCode}
                    data-testid={`button-retry-${t.claimCode}`}
                    className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs hover-elevate disabled:opacity-50"
                  >
                    {retrying === t.claimCode ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                    Retry
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "active" | "bad";
}) {
  return (
    <div className="rounded-xl border border-card-border bg-card p-5">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div
        className={`mt-2 text-xl font-semibold tabular-nums ${
          tone === "bad" ? "text-destructive" : tone === "active" ? "text-primary" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function StatusPill({ status, error }: { status: string; error: string | null }) {
  if (status === "ready") {
    return (
      <span className="flex items-center gap-2 text-xs text-primary">
        <CheckCircle2 className="h-3.5 w-3.5" /> Ready
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="flex items-center gap-2 text-xs text-destructive" title={error ?? undefined}>
        <AlertTriangle className="h-3.5 w-3.5" /> Failed
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2 text-xs text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      {status === "queued" ? "Queued" : "Generating"}
    </span>
  );
}
