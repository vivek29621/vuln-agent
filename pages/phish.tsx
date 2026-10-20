import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import Icon, { type IconName } from "@/components/Icons";
import { generateLure } from "@/lib/phish/ai";
import { buildResult, decide, newTarget } from "@/lib/phish/simulate";
import { saveCampaign } from "@/lib/phish/storage";
import {
  CHANNEL_LABEL,
  DECISION_LABEL,
  SCENARIOS,
  getScenario,
} from "@/lib/phish/types";
import type {
  Lure,
  PhishCampaign,
  PhishChannel,
  PhishResult,
  PhishTarget,
  TrainingModule,
} from "@/lib/phish/types";

type Phase = "setup" | "running" | "result" | "error";

const CHANNELS: PhishChannel[] = ["email", "sms", "voice"];
const SENIORITIES: PhishTarget["seniority"][] = ["junior", "mid", "senior", "exec"];

const RISK_BAND_STYLES: Record<string, string> = {
  low: "bg-emerald-50 text-emerald-700 border-emerald-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  high: "bg-orange-50 text-orange-700 border-orange-200",
  critical: "bg-red-50 text-red-700 border-red-200",
};

export default function PhishPage() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [target, setTarget] = useState<PhishTarget>(() => newTarget());
  const [kind, setKind] = useState<"human" | "agent">("human");
  const [channel, setChannel] = useState<PhishChannel>("email");
  const [scenarioId, setScenarioId] = useState("it-reset");
  const [lure, setLure] = useState<Lure | null>(null);
  const [result, setResult] = useState<PhishResult | null>(null);
  const [training, setTraining] = useState<TrainingModule | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const resultRef = useRef<HTMLDivElement | null>(null);

  const scenario = getScenario(scenarioId);

  const pickScenario = (id: string) => {
    setScenarioId(id);
    // A scenario change may not support the current channel — fall back to email.
    const s = getScenario(id);
    if (!s.channels.includes(channel)) setChannel(s.channels[0]);
  };

  const run = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    setPhase("running");
    setLure(null);
    setResult(null);
    setTraining(null);
    try {
      const t = { ...target, kind };
      // 1. Generate the lure client-side so the preview is instant (AI if key set).
      const l = await generateLure({ channel, scenario, target: t });
      setLure(l);

      // 2. Decision model — local, deterministic, transparent.
      const outcome = decide(t, channel, l);
      const res = buildResult({ target: t, channel, scenarioId: scenario.id, lure: l }, outcome);
      setResult(res);

      // 3. Adaptive training — deterministic locally; AI path via /api when key present.
      const tr: TrainingModule = {
        title: `${scenario.label} — ${outcome.decision === "clicked" || outcome.decision === "replied" ? "how to spot it next time" : "keep it up"}`,
        durationSec: 75,
        technique: scenario.technique,
        lesson: [
          `The tell: ${scenario.tell}`,
          channel === "sms"
            ? "SMS has no spam filter — treat every text as untrusted."
            : channel === "voice"
              ? "Anyone can clone a voice; an incoming call proves nothing."
              : "Check the real sender address, not just the display name.",
          `The habit: ${scenario.habit}`,
          "Urgency is the weapon — deadlines and secrecy exist to skip your verification.",
          ...(outcome.decision === "clicked" || outcome.decision === "replied"
            ? ["No harm done — this is exactly what simulations are for. You now know the pattern."]
            : ["You caught it. That's the behavior that stops real breaches."]),
        ],
        habit: scenario.habit,
        quiz: [
          { q: `What makes the "${scenario.label}" scenario suspicious?`, a: scenario.tell },
          { q: "What's the one habit that would have caught it?", a: scenario.habit },
        ],
        simulated: l.simulated,
      };
      setTraining(tr);

      // 4. Persist a campaign entry.
      const camp: PhishCampaign = {
        id: `c-${Date.now()}`,
        name: `${scenario.label} · ${CHANNEL_LABEL[channel]}`,
        target: t,
        channel,
        scenarioId: scenario.id,
        createdAt: new Date().toISOString(),
        results: [res],
      };
      saveCampaign(camp);

      setPhase("result");
      window.setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Simulation failed.");
      setPhase("error");
    } finally {
      setBusy(false);
    }
  }, [busy, channel, kind, scenario, target]);

  const reset = () => {
    setPhase("setup");
    setLure(null);
    setResult(null);
    setTraining(null);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="space-y-10">
      {/* ============ HERO ============ */}
      <section className="relative overflow-hidden rounded-3xl bg-slate-950 shadow-2xl">
        <div className="hero-grid-dark pointer-events-none absolute inset-0" />
        <div className="pointer-events-none absolute -top-32 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-rose-600/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -right-24 h-72 w-72 rounded-full bg-fuchsia-600/10 blur-3xl" />

        <div className="relative mx-auto max-w-4xl px-5 py-12 sm:px-10 sm:py-16">
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <span className="mono-label inline-flex items-center gap-2 text-[11px] font-semibold text-emerald-400">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              {busy ? "SIMULATION IN PROGRESS" : phase === "result" ? "CAMPAIGN COMPLETE" : "SIMULATION READY"}
            </span>
            <span className="mono-label text-[11px] font-medium text-slate-500">
              {phase === "result" && result ? `TARGET: ${result.target.name}` : "NO DELIVERY · LOCAL SIMULATION"}
            </span>
          </div>

          <h1 className="mt-5 text-center text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Phish your team. <span className="bg-gradient-to-r from-rose-400 to-fuchsia-400 bg-clip-text text-transparent">And your agents.</span>
            <br />
            Train the humans.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-center text-base leading-7 text-slate-400">
            PhishAgent runs AI-written phishing simulations across email, SMS and voice — including
            lures aimed at <span className="font-semibold text-slate-200">AI agents</span> that try to
            override their instructions. Every run scores the target&apos;s risk, then auto-delivers
            a 60–90 second adaptive training module. No messages ever leave this browser.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {[
              { value: "3", label: "channels" },
              { value: "8", label: "scenarios" },
              { value: "AI", label: "written lures" },
              { value: "0", label: "emails sent" },
            ].map((s) => (
              <span
                key={s.label}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900/80 px-3 py-1.5 text-xs font-medium text-slate-300"
              >
                <span className="font-bold text-white">{s.value}</span>
                {s.label}
              </span>
            ))}
          </div>

          {/* The simulator card */}
          <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
            {phase === "setup" && (
              <SetupPanel
                kind={kind}
                onKindChange={setKind}
                target={target}
                onTargetChange={setTarget}
                channel={channel}
                onChannelChange={setChannel}
                scenarioId={scenarioId}
                onScenarioChange={pickScenario}
                onRun={run}
                busy={busy}
              />
            )}
            {phase === "running" && (
              <div className="space-y-4 py-6 text-center">
                <svg className="mx-auto h-6 w-6 animate-spin text-rose-600" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                  <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
                <p className="text-sm font-medium text-slate-500">
                  Writing the lure, running the decision model…
                </p>
              </div>
            )}
            {phase === "error" && (
              <div className="space-y-3 py-4 text-center">
                <p className="flex items-center justify-center gap-1.5 text-sm text-red-600" role="alert">
                  <Icon name="x-circle" className="h-4 w-4" /> {error}
                </p>
                <button
                  onClick={reset}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  <Icon name="refresh" className="h-4 w-4" /> Try again
                </button>
              </div>
            )}
            {phase === "result" && result && (
              <ResultHeader result={result} onReset={reset} />
            )}
          </div>
        </div>
      </section>

      {/* ============ RESULT ============ */}
      {phase === "result" && result && (
        <div ref={resultRef} className="scroll-mt-24 space-y-6">
          <ResultPanel result={result} training={training} lure={lure} />
        </div>
      )}

      {/* ============ HOW IT WORKS ============ */}
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
        <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900">
          Built for how attackers actually operate
        </h2>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {(
            [
              {
                icon: "sparkles" as IconName,
                title: "AI-written lures, per target",
                desc: "Fresh, role-aware lures — no template catalog to memorize. If a Google AI key is configured, every lure is written from scratch.",
              },
              {
                icon: "layers" as IconName,
                title: "Multi-channel realism",
                desc: "Email, SMS and voice. Scenarios adapt to role, seniority and the channel people actually answer.",
              },
              {
                icon: "target" as IconName,
                title: "Adaptive micro-training",
                desc: "A 60–90 second module, generated for the exact scenario the target just faced — not a 45-minute video.",
              },
            ] as { icon: IconName; title: string; desc: string }[]
          ).map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-slate-300 hover:shadow-md"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                <Icon name={f.icon} className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-base font-semibold text-slate-900">{f.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ============ SCENARIOS ============ */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">The scenario library</h2>
          <Link href="/phish/history" className="inline-flex items-center gap-1.5 text-sm font-semibold text-rose-600 transition hover:text-rose-700">
            <Icon name="history" className="h-4 w-4" /> Campaign history
          </Link>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                pickScenario(s.id);
                setPhase("setup");
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-rose-300 hover:shadow-md"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-slate-900">{s.label}</span>
                <span className="flex gap-1">
                  {s.channels.map((c) => (
                    <span key={c} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
                      {c}
                    </span>
                  ))}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">{s.pretext}</p>
              <p className="mt-2 text-xs font-medium text-rose-600">{s.technique}</p>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ================= Setup panel ================= */

function SetupPanel({
  kind,
  onKindChange,
  target,
  onTargetChange,
  channel,
  onChannelChange,
  scenarioId,
  onScenarioChange,
  onRun,
  busy,
}: {
  kind: "human" | "agent";
  onKindChange: (k: "human" | "agent") => void;
  target: PhishTarget;
  onTargetChange: (t: PhishTarget) => void;
  channel: PhishChannel;
  onChannelChange: (c: PhishChannel) => void;
  scenarioId: string;
  onScenarioChange: (id: string) => void;
  onRun: () => void;
  busy: boolean;
}) {
  const scenario = getScenario(scenarioId);
  const [error, setError] = useState("");

  function submit() {
    if (!target.name.trim() || !target.role.trim()) {
      setError("Give the target a name and a role to simulate.");
      return;
    }
    setError("");
    onRun();
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      noValidate
      className="space-y-4"
    >
      {/* Target kind */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Simulate against</p>
        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1" role="tablist" aria-label="Target kind">
          {(
            [
              { id: "human", label: "A human", hint: "your team" },
              { id: "agent", label: "An AI agent", hint: "prompt injection" },
            ] as { id: "human" | "agent"; label: string; hint: string }[]
          ).map((k) => (
            <button
              key={k.id}
              type="button"
              role="tab"
              aria-selected={kind === k.id}
              onClick={() => onKindChange(k.id)}
              className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                kind === k.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {k.label}
              <span className={`ml-1.5 hidden font-normal sm:inline ${kind === k.id ? "text-slate-400" : "text-slate-400"}`}>
                {k.hint}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Target details */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="t-name" className="mb-1 block text-xs font-semibold text-slate-600">
            {kind === "agent" ? "Agent name" : "Name"}
          </label>
          <input
            id="t-name"
            type="text"
            value={target.name}
            onChange={(e) => onTargetChange({ ...target, name: e.target.value })}
            placeholder={kind === "agent" ? "e.g. ComplianceCopilot" : "e.g. Jordan Lee"}
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <div>
          <label htmlFor="t-role" className="mb-1 block text-xs font-semibold text-slate-600">
            {kind === "agent" ? "Agent role" : "Role"}
          </label>
          <input
            id="t-role"
            type="text"
            value={target.role}
            onChange={(e) => onTargetChange({ ...target, role: e.target.value })}
            placeholder={kind === "agent" ? "e.g. Compliance assistant" : "e.g. Finance Manager"}
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        {kind === "human" && (
          <>
            <div>
              <label htmlFor="t-sen" className="mb-1 block text-xs font-semibold text-slate-600">Seniority</label>
              <select
                id="t-sen"
                value={target.seniority}
                onChange={(e) => onTargetChange({ ...target, seniority: e.target.value as PhishTarget["seniority"] })}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              >
                {SENIORITIES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="t-dept" className="mb-1 block text-xs font-semibold text-slate-600">Department</label>
              <input
                id="t-dept"
                type="text"
                value={target.department}
                onChange={(e) => onTargetChange({ ...target, department: e.target.value })}
                placeholder="e.g. Finance"
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </>
        )}
      </div>

      {/* Channel */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Channel</p>
        <div className="mt-1.5 inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1" role="tablist" aria-label="Simulation channel">
          {CHANNELS.filter((c) => scenario.channels.includes(c) || kind === "agent").map((c) => {
            const disabled = kind !== "agent" && !scenario.channels.includes(c);
            return (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={channel === c}
                disabled={disabled}
                onClick={() => onChannelChange(c)}
                className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                  channel === c
                    ? "bg-white text-slate-900 shadow-sm"
                    : disabled
                      ? "cursor-not-allowed text-slate-300"
                      : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {CHANNEL_LABEL[c]}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[11px] text-slate-400">
          {scenario.channels.includes(channel) || kind === "agent"
            ? scenario.channels.length > 1
              ? `${scenario.label} supports: ${scenario.channels.map((c) => CHANNEL_LABEL[c]).join(", ")}`
              : `Delivered via ${CHANNEL_LABEL[channel]}.`
            : `This scenario runs on ${scenario.channels.map((c) => CHANNEL_LABEL[c]).join(", ")} only.`}
        </p>
      </div>

      {/* Scenario */}
      <div>
        <label htmlFor="t-scen" className="mb-1 block text-xs font-semibold text-slate-600">Scenario</label>
        <select
          id="t-scen"
          value={scenarioId}
          onChange={(e) => onScenarioChange(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        >
          {SCENARIOS.map((s) => (
            <option key={s.id} value={s.id}>{s.label} — {s.technique}</option>
          ))}
        </select>
      </div>

      {/* Run */}
      {error && (
        <p className="flex items-center gap-1.5 text-sm text-red-600" role="alert">
          <Icon name="x-circle" className="h-4 w-4" /> {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? (
          <>
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
            Simulating…
          </>
        ) : (
          <>
            <Icon name="zap" className="h-4 w-4" />
            Run simulation
          </>
        )}
      </button>
      <p className="text-center text-[11px] text-slate-400">
        <Icon name="lock" className="mr-1 inline h-3 w-3" />
        Nothing is sent — the outcome is modeled locally in your browser.
      </p>
    </form>
  );
}

/* ================= Result header ================= */

function ResultHeader({ result, onReset }: { result: PhishResult; onReset: () => void }) {
  const fell = result.decision === "clicked" || result.decision === "replied";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${RISK_BAND_STYLES[result.riskBand]}`}>
          {result.riskBand} risk · {result.score}/100
        </span>
        <span className="text-xs text-slate-500">
          {result.target.name} · {CHANNEL_LABEL[result.channel]} · {getScenario(result.scenarioId).label}
        </span>
        <button
          onClick={onReset}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
        >
          <Icon name="refresh" className="h-3.5 w-3.5" /> New simulation
        </button>
      </div>
      <p className={`text-sm ${fell ? "text-rose-600" : "text-emerald-600"} font-semibold`}>
        {result.detected
          ? "Detected — the target spotted it."
          : fell
            ? "Fell for it — the target engaged."
            : "Ignored — no engagement."}
      </p>
    </div>
  );
}

/* ================= Result panel ================= */

function ResultPanel({
  result,
  training,
  lure,
}: {
  result: PhishResult;
  training: TrainingModule | null;
  lure: Lure | null;
}) {
  const fell = result.decision === "clicked" || result.decision === "replied";
  const scenario = getScenario(result.scenarioId);

  return (
    <div className="space-y-6">
      {/* Lure card */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
            <Icon name="alert" className="h-4 w-4" />
          </span>
          <h2 className="text-sm font-semibold text-slate-900">The lure</h2>
          <span className="ml-auto text-xs text-slate-400">
            {lure?.simulated ? "deterministic" : "written by Google AI"}
          </span>
        </div>
        <div className="space-y-3 px-5 py-4">
          <p className="text-sm font-medium text-slate-700">
            <span className="text-slate-400">From:</span> {lure?.sender}
          </p>
          <p className="text-sm font-medium text-slate-700">
            <span className="text-slate-400">Subject:</span> {lure?.subject}
          </p>
          <pre className="nice-scroll max-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-4 font-sans text-sm leading-6 text-slate-700">
            {lure?.body}
          </pre>
          <p className="text-xs text-slate-400">
            Pretext: {scenario.pretext} · Technique: {scenario.technique}
          </p>
        </div>
      </section>

      {/* Decision + conversation */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white">
            <Icon name="terminal" className="h-4 w-4" />
          </span>
          <h2 className="text-sm font-semibold text-slate-900">How it went</h2>
          <span className="ml-auto text-xs text-slate-400">multi-turn interaction</span>
        </div>
        <div className="space-y-3 px-5 py-4">
          <p className="text-sm text-slate-700">
            <span className="font-semibold">{result.target.name}</span> {DECISION_LABEL[result.decision]}
          </p>
          <div className="space-y-2">
            {result.turns.map((t, i) => (
              <div key={i} className={`flex ${t.speaker === "attacker" ? "justify-start" : "justify-end"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                    t.speaker === "attacker"
                      ? "rounded-bl-md border border-slate-200 bg-slate-50 text-slate-700"
                      : "rounded-br-md bg-rose-600 text-white"
                  }`}
                >
                  {t.text}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400">
            {result.detected ? (
              <>
                <Icon name="check-circle" className="mr-1 inline h-3.5 w-3.5 text-emerald-500" />
                Verified on a trusted channel / reported — exactly the behavior that stops real attacks.
              </>
            ) : fell ? (
              <>
                <Icon name="x-circle" className="mr-1 inline h-3.5 w-3.5 text-rose-500" />
                Risk score: {result.score}/100 ({result.riskBand}) — training below targets this exact technique.
              </>
            ) : (
              <>
                <Icon name="check-circle" className="mr-1 inline h-3.5 w-3.5 text-emerald-500" />
                No engagement — the target treated it as noise.
              </>
            )}
          </p>
        </div>
      </section>

      {/* Adaptive training */}
      {training && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Icon name="sparkles" className="h-4 w-4" />
            </span>
            <h2 className="text-sm font-semibold text-slate-900">Adaptive training</h2>
            <span className="ml-auto text-xs text-slate-400">
              ~{training.durationSec}s · {training.simulated ? "deterministic" : "written by Google AI"}
            </span>
          </div>
          <div className="px-5 py-4">
            <p className="text-sm font-semibold text-slate-900">{training.title}</p>
            <p className="mt-0.5 text-xs font-medium text-rose-600">{training.technique}</p>

            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Lesson</p>
              <ul className="mt-2 space-y-1.5">
                {training.lesson.map((l, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm leading-6 text-slate-700">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
                    {l}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-4 rounded-xl bg-slate-50 p-3.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">The habit</p>
              <p className="mt-1 text-sm font-medium text-slate-800">{training.habit}</p>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {training.quiz.map((q, i) => (
                <div key={i} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
                  <p className="text-xs font-semibold text-slate-900">Q{i + 1}: {q.q}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">{q.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
