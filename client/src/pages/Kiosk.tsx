import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, RotateCcw, Sparkles } from "lucide-react";
import QRCode from "qrcode";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScoreMark, ScoreWordmark, Waveform } from "@/lib/brand";
import { PRESETS, PRESET_MAP, type Preset, type PresetId } from "@shared/presets";

type Step = "attract" | "style" | "tune" | "you" | "handoff";

/** Return to the attract loop if a guest walks away mid-flow. */
const IDLE_MS = 75_000;

const TICKER = [
  "MOONSHOT",
  "COMPOUNDER",
  "HUSTLER",
  "LEGACY",
  "YOUR GOALS, SCORED",
  "2 MINUTES, ONE TRACK",
];

export default function Kiosk() {
  const [step, setStep] = useState<Step>("attract");
  const [presetId, setPresetId] = useState<PresetId | null>(null);
  const [vibe, setVibe] = useState<string | null>(null);
  const [angle, setAngle] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [goal, setGoal] = useState<string | null>(null);
  const [spin, setSpin] = useState("");
  const [claimCode, setClaimCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preset: Preset | null = presetId ? PRESET_MAP[presetId] : null;
  const hue = preset?.accent ?? "122 100% 41%";

  const reset = () => {
    setStep("attract");
    setPresetId(null);
    setVibe(null);
    setAngle(null);
    setFirstName("");
    setGoal(null);
    setSpin("");
    setClaimCode(null);
    setError(null);
    setSubmitting(false);
  };

  // Idle timeout — resets everything, including any personal details on screen.
  const idleRef = useRef<number | null>(null);
  useEffect(() => {
    if (step === "attract") return;
    const bump = () => {
      if (idleRef.current) window.clearTimeout(idleRef.current);
      idleRef.current = window.setTimeout(reset, IDLE_MS);
    };
    bump();
    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown"];
    events.forEach((e) => window.addEventListener(e, bump));
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      if (idleRef.current) window.clearTimeout(idleRef.current);
    };
  }, [step]);

  const submit = async () => {
    if (!presetId || !vibe || !angle) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiRequest("POST", "/api/tracks", {
        preset: presetId,
        vibe,
        angle,
        firstName: firstName.trim() || undefined,
        goal: goal || undefined,
        spin: spin.trim() || undefined,
      });
      const data = await res.json();
      setClaimCode(data.claimCode);
      setStep("handoff");
    } catch (err: any) {
      setError("We couldn't start your track. Tap to try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="kiosk-surface relative min-h-screen overflow-hidden bg-background text-foreground"
      style={{ ["--hue" as any]: hue }}
    >
      <div className="desk-grid pointer-events-none absolute inset-0 opacity-70" />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[42vh] opacity-40 transition-colors duration-700"
        style={{ background: `radial-gradient(60% 100% at 50% 0%, hsl(${hue} / 0.28), transparent 70%)` }}
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-8 py-8 md:px-14 md:py-12">
        <header className="flex items-center justify-between">
          <ScoreWordmark />
          {step !== "attract" && (
            <button
              onClick={reset}
              data-testid="button-start-over"
              className="flex items-center gap-2 rounded-full border border-border px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground hover-elevate"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Start over
            </button>
          )}
        </header>

        <AnimatePresence mode="wait">
          <motion.main
            key={step}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-1 flex-col justify-center py-8"
          >
            {step === "attract" && <Attract onStart={() => setStep("style")} />}

            {step === "style" && (
              <StepStyle
                onPick={(id) => {
                  setPresetId(id);
                  setVibe(null);
                  setAngle(null);
                  setStep("tune");
                }}
              />
            )}

            {step === "tune" && preset && (
              <StepTune
                preset={preset}
                vibe={vibe}
                angle={angle}
                onVibe={setVibe}
                onAngle={setAngle}
                onBack={() => setStep("style")}
                onNext={() => setStep("you")}
              />
            )}

            {step === "you" && preset && (
              <StepYou
                preset={preset}
                firstName={firstName}
                goal={goal}
                spin={spin}
                onName={setFirstName}
                onGoal={setGoal}
                onSpin={setSpin}
                onBack={() => setStep("tune")}
                onSubmit={submit}
                submitting={submitting}
                error={error}
              />
            )}

            {step === "handoff" && claimCode && preset && (
              <Handoff claimCode={claimCode} preset={preset} firstName={firstName} onDone={reset} />
            )}
          </motion.main>
        </AnimatePresence>

        <footer className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          <span>Sandbox XM · Experiential Studio</span>
          <StepDots step={step} />
        </footer>
      </div>
    </div>
  );
}

function StepDots({ step }: { step: Step }) {
  const order: Step[] = ["style", "tune", "you", "handoff"];
  const idx = order.indexOf(step);
  if (idx < 0) return <span>Tap to begin</span>;
  return (
    <div className="flex items-center gap-2" aria-label={`Step ${idx + 1} of 4`}>
      {order.map((s, i) => (
        <span
          key={s}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            i <= idx ? "w-8 bg-hue" : "w-3 bg-border"
          }`}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ attract */

function Attract({ onStart }: { onStart: () => void }) {
  return (
    <button
      onClick={onStart}
      data-testid="button-begin"
      className="group flex flex-1 flex-col items-center justify-center text-center"
    >
      <Waveform seed="attract-loop" bars={64} className="mb-12 h-24 w-full max-w-3xl opacity-80" />

      <h1 className="max-w-4xl text-5xl font-semibold leading-[0.95] tracking-tight md:text-7xl">
        Everyone has a
        <span className="text-hue"> score</span>.
        <br />
        Let's hear yours.
      </h1>

      <p className="mt-7 max-w-2xl text-lg text-muted-foreground md:text-xl">
        Four taps turns the way you invest into an original two-minute track. Yours to keep.
      </p>

      <span className="mt-14 inline-flex items-center gap-3 rounded-full bg-hue px-9 py-4 text-base font-semibold text-background transition-transform duration-200 group-active:scale-[0.97]">
        Tap anywhere to begin <ArrowRight className="h-5 w-5" />
      </span>

      <div className="mt-16 w-full max-w-4xl overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
        <div className="flex w-max animate-ticker gap-10 font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
          {[...TICKER, ...TICKER, ...TICKER, ...TICKER].map((t, i) => (
            <span key={i} className="flex items-center gap-10">
              {t}
              <span className="text-hue">/</span>
            </span>
          ))}
        </div>
      </div>
    </button>
  );
}

/* -------------------------------------------------------------------- step 1 */

function StepHeading({ index, title, sub }: { index: string; title: string; sub?: string }) {
  return (
    <div className="mb-10">
      <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.28em] text-hue">{index}</div>
      <h2 className="text-3xl font-semibold tracking-tight md:text-5xl">{title}</h2>
      {sub && <p className="mt-3 max-w-2xl text-base text-muted-foreground md:text-lg">{sub}</p>}
    </div>
  );
}

function StepStyle({ onPick }: { onPick: (id: PresetId) => void }) {
  return (
    <div>
      <StepHeading
        index="Step 1 of 4"
        title="Choose your trading style"
        sub="Pick the one that sounds most like you. There's no wrong answer."
      />
      <div className="grid gap-5 sm:grid-cols-2">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => onPick(p.id)}
            data-testid={`button-preset-${p.id}`}
            style={{ ["--hue" as any]: p.accent }}
            className="group relative overflow-hidden rounded-xl border border-card-border bg-card p-7 text-left transition-all duration-200 hover-elevate active:scale-[0.99]"
          >
            <div
              className="absolute inset-x-0 top-0 h-px opacity-70"
              style={{ background: `linear-gradient(to right, transparent, hsl(${p.accent}), transparent)` }}
            />
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-2xl font-semibold tracking-tight md:text-3xl">{p.label}</div>
                <div className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  {p.audience}
                </div>
              </div>
              <ArrowRight className="h-5 w-5 shrink-0 text-hue opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
            </div>
            <p className="mt-5 text-base text-foreground/80">{p.tagline}</p>
            <Waveform seed={p.id} bars={28} className="mt-7 h-10" active={false} />
          </button>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- step 2 */

function ChoiceRow({
  label,
  options,
  value,
  onChange,
  testPrefix,
}: {
  label: string;
  options: { id: string; label: string; blurb: string }[];
  value: string | null;
  onChange: (id: string) => void;
  testPrefix: string;
}) {
  return (
    <div>
      <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {options.map((o) => {
          const selected = value === o.id;
          return (
            <button
              key={o.id}
              onClick={() => onChange(o.id)}
              data-testid={`button-${testPrefix}-${o.id}`}
              aria-pressed={selected}
              className={`relative rounded-xl border p-6 text-left transition-all duration-200 active:scale-[0.99] ${
                selected
                  ? "border-hue bg-card hue-glow"
                  : "border-card-border bg-card hover-elevate"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-xl font-semibold tracking-tight">{o.label}</span>
                {selected && (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-hue">
                    <Check className="h-3.5 w-3.5 text-background" />
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{o.blurb}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StepTune({
  preset,
  vibe,
  angle,
  onVibe,
  onAngle,
  onBack,
  onNext,
}: {
  preset: Preset;
  vibe: string | null;
  angle: string | null;
  onVibe: (v: string) => void;
  onAngle: (a: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const ready = !!vibe && !!angle;
  return (
    <div>
      <StepHeading
        index="Step 2 of 4"
        title="Fine-tune the sound"
        sub={`${preset.label} — ${preset.tagline}`}
      />
      <div className="space-y-8">
        <ChoiceRow
          label="The sonic vibe"
          options={preset.vibes}
          value={vibe}
          onChange={onVibe}
          testPrefix="vibe"
        />
        <ChoiceRow
          label="The lyric focus"
          options={preset.angles}
          value={angle}
          onChange={onAngle}
          testPrefix="angle"
        />
      </div>
      <NavBar onBack={onBack} onNext={onNext} nextLabel="Make it personal" disabled={!ready} />
    </div>
  );
}

function NavBar({
  onBack,
  onNext,
  nextLabel,
  disabled,
  busy,
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel: string;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <div className="mt-12 flex items-center justify-between gap-4">
      <Button
        variant="ghost"
        onClick={onBack}
        data-testid="button-back"
        className="h-14 gap-2 px-6 text-base text-muted-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>
      <button
        onClick={onNext}
        disabled={disabled || busy}
        data-testid="button-next"
        className="flex h-14 items-center gap-3 rounded-full bg-hue px-9 text-base font-semibold text-background transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-secondary disabled:text-muted-foreground"
      >
        {busy ? "Starting…" : nextLabel}
        {!busy && <ArrowRight className="h-5 w-5" />}
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------- step 3 */

function StepYou({
  preset,
  firstName,
  goal,
  spin,
  onName,
  onGoal,
  onSpin,
  onBack,
  onSubmit,
  submitting,
  error,
}: {
  preset: Preset;
  firstName: string;
  goal: string | null;
  spin: string;
  onName: (v: string) => void;
  onGoal: (v: string) => void;
  onSpin: (v: string) => void;
  onBack: () => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
}) {
  return (
    <div>
      <StepHeading
        index="Step 3 of 4"
        title="Make it yours"
        sub="All optional — but a name and a goal is what turns a good track into your track."
      />

      <div className="grid gap-8 lg:grid-cols-[1fr_1.15fr]">
        <div>
          <label
            htmlFor="first-name"
            className="mb-3 block font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground"
          >
            First name
          </label>
          <Input
            id="first-name"
            value={firstName}
            onChange={(e) => onName(e.target.value)}
            maxLength={24}
            placeholder="Sung in your chorus"
            data-testid="input-first-name"
            className="h-16 rounded-xl border-border bg-card px-5 text-xl focus-visible:ring-[hsl(var(--hue))]"
          />
        </div>

        <div>
          <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            What are you building toward?
          </div>
          <div className="flex flex-wrap gap-3">
            {preset.goals.map((g) => {
              const selected = goal === g;
              return (
                <button
                  key={g}
                  onClick={() => onGoal(selected ? "" : g)}
                  data-testid={`button-goal-${g.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                  aria-pressed={selected}
                  className={`rounded-full border px-5 py-3 text-base transition-all duration-200 active:scale-[0.97] ${
                    selected
                      ? "border-hue bg-hue text-background"
                      : "border-border bg-card text-foreground/85 hover-elevate"
                  }`}
                >
                  {g}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-8">
        <label
          htmlFor="spin"
          className="mb-3 block font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground"
        >
          Your own spin <span className="normal-case tracking-normal">(optional)</span>
        </label>
        <Input
          id="spin"
          value={spin}
          onChange={(e) => onSpin(e.target.value)}
          maxLength={200}
          placeholder="A detail for the lyrics — a city, a person, a milestone"
          data-testid="input-spin"
          className="h-16 rounded-xl border-border bg-card px-5 text-lg focus-visible:ring-[hsl(var(--hue))]"
        />
      </div>

      {error && (
        <p className="mt-6 text-base text-destructive" data-testid="text-error">
          {error}
        </p>
      )}

      <NavBar
        onBack={onBack}
        onNext={onSubmit}
        nextLabel="Generate my score"
        busy={submitting}
      />
    </div>
  );
}

/* ------------------------------------------------------------------- handoff */

function Handoff({
  claimCode,
  preset,
  firstName,
  onDone,
}: {
  claimCode: string;
  preset: Preset;
  firstName: string;
  onDone: () => void;
}) {
  const [qr, setQr] = useState<string | null>(null);
  const url = useMemo(() => `${window.location.origin}${window.location.pathname}#/t/${claimCode}`, [claimCode]);

  useEffect(() => {
    QRCode.toDataURL(url, {
      width: 720,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#ffffff", light: "#00000000" },
    })
      .then(setQr)
      .catch(() => setQr(null));
  }, [url]);

  // Auto-return to attract so the next guest never faces someone else's screen.
  useEffect(() => {
    const t = window.setTimeout(onDone, 45_000);
    return () => window.clearTimeout(t);
  }, [onDone]);

  return (
    <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
      <div>
        <div className="mb-3 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.28em] text-hue">
          <Sparkles className="h-3.5 w-3.5" /> Step 4 of 4 · In production
        </div>
        <h2 className="text-4xl font-semibold leading-[1.02] tracking-tight md:text-5xl">
          {firstName ? `${firstName}, your score` : "Your score"} is being written.
        </h2>
        <p className="mt-5 max-w-lg text-lg text-muted-foreground">
          Scan the code to follow it on your phone. It lands in about two minutes — no need to wait
          here. Headphone stations are to your right when it's ready.
        </p>

        <div className="mt-9 rounded-xl border border-card-border bg-card p-6">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Or enter this code at the listening station
          </div>
          <div
            className="mt-2 font-mono text-4xl font-semibold tracking-[0.3em] text-hue md:text-5xl"
            data-testid="text-claim-code"
          >
            {claimCode}
          </div>
        </div>

        <Waveform seed={claimCode} bars={44} className="mt-9 h-16" />

        <button
          onClick={onDone}
          data-testid="button-done"
          className="mt-10 inline-flex items-center gap-2 rounded-full border border-border px-7 py-3.5 text-base text-muted-foreground hover-elevate"
        >
          Done — next guest
        </button>
      </div>

      <div className="flex flex-col items-center">
        <div className="relative rounded-2xl border border-card-border bg-card p-7 hue-glow">
          {qr ? (
            <img src={qr} alt={`QR code to claim track ${claimCode}`} className="h-64 w-64 md:h-72 md:w-72" />
          ) : (
            <div className="flex h-64 w-64 items-center justify-center md:h-72 md:w-72">
              <ScoreMark className="h-16 w-16 animate-pulse text-muted-foreground" />
            </div>
          )}
          <div className="pointer-events-none absolute inset-x-7 top-7 h-[1px] animate-sweep bg-hue opacity-60" />
        </div>
        <div className="mt-5 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          {preset.label} · Scan to claim
        </div>
      </div>
    </div>
  );
}
