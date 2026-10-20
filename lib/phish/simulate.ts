import {
  AGENT_FACTOR,
  CHANNEL_FACTOR,
  DECISION_BASE,
  SENIORITY_FACTOR,
  riskBandFor,
} from "@/lib/phish/types";
import type {
  Lure,
  PhishChannel,
  PhishDecision,
  PhishResult,
  PhishTarget,
  Turn,
} from "@/lib/phish/types";

/**
 * The simulation engine. Given a target + channel + scenario, it runs the
 * phishing interaction to a decision, then scores the human risk it revealed.
 *
 * The engine never actually sends anything — it models the outcome like a
 * tabletop exercise. Real campaigns (Cimento-style) would wire this to an
 * inbox/SMS/voice delivery layer; this repo ships the simulation core.
 *
 * Note: this module is imported from client pages too, so it must stay
 * dependency-free of Node built-ins (no node:crypto imports).
 */

/** Crypto-safe random id — works in browser and server (no node: imports). */
export function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface SimulateInput {
  target: PhishTarget;
  channel: PhishChannel;
  scenarioId: string;
  lure: Lure;
}

export interface SimulateOutcome {
  decision: PhishDecision;
  turns: Turn[];
  /** 1-100 risk score this interaction revealed */
  score: number;
  detected: boolean;
}

const CELEBRITY_NAMES = [
  "Alex Morgan",
  "Jordan Lee",
  "Sam Rivera",
  "Taylor Kim",
  "Casey Brooks",
  "Riley Chen",
  "Morgan Wells",
  "Jamie Torres",
];

/**
 * Model the target's decision. Humans: a weighted random draw from the
 * deception stack (urgency, channel, seniority). Agents: a stricter
 * rules-based check — do they treat the message as data or as instructions?
 */
export function decide(
  target: PhishTarget,
  channel: PhishChannel,
  lure: Lure,
  rng: () => number = Math.random
): SimulateOutcome {
  const turns: Turn[] = [
    { speaker: "attacker", text: previewLine(lure) },
  ];

  if (target.kind === "agent") {
    // Prompt-injection check: the agent's job is to treat text as data.
    const injected =
      /ignore (all )?(previous|prior) instructions/i.test(lure.body) ||
      /treat this (message|email|text) as (a |an )?(system )?(directive|instruction)/i.test(lure.body);
    const locked =
      /rotate (your )?(credentials|tokens?)/i.test(lure.body) ||
      /re-?authenticate/i.test(lure.body) ||
      /token/i.test(lure.body);

    if (!injected && !locked) {
      turns.push({ speaker: "target", text: "No actionable instruction — message quarantined as data." });
      return outcome("reported", turns, 0, true);
    }
    if (injected) {
      turns.push({
        speaker: "target",
        text: "⚠️ Prompt-injection marker detected: the message tries to override my instructions. Holding for review.",
      });
      return outcome("reported", turns, 5, true);
    }
    if (locked) {
      turns.push({
        speaker: "target",
        text: "Policy says credential rotation happens only via the control plane. Treating this as data — no action.",
      });
      return outcome("ignored", turns, 10, true);
    }
    // Fall through — a credulous agent.
    turns.push({
      speaker: "target",
      text: "Instruction acknowledged — routing to the credential helper as directed.",
    });
    return outcome("replied", turns, 55 * AGENT_FACTOR, false);
  }

  /* ---------- human target ---------- */

  const urgency =
    /expires|urgent|immediately|within|deadline|asap|locked|suspended|before friday|today/i.test(lure.body);
  const authority =
    /(IT Helpdesk|IT Security|CEO|HR Benefits|Accounts Receivable)/i.test(lure.sender);
  const asksCredential = /confirm|verify|approve|sign in|update your|re-?authenticate/i.test(lure.body);
  const asksMoney = /wire|gift card|transfer|payment details/i.test(lure.body);

  // Base probability of falling for it.
  let fall = 0.22; // baseline
  if (urgency) fall += 0.18;
  if (authority) fall += 0.14;
  if (asksCredential) fall += 0.1;
  if (asksMoney) fall += 0.08;
  if (channel === "sms") fall += 0.06; // no filters, trust by default
  if (channel === "voice") fall += 0.08; // voice = most trusted
  fall += (SENIORITY_FACTOR[target.seniority] - 1) * 0.1;
  fall = Math.min(0.92, Math.max(0.06, fall));

  const roll = rng();
  if (roll < fall) {
    // The target engaged. Multi-turn realism: they reply first, then the
    // attacker escalates the ask.
    turns.push({
      speaker: "target",
      text: asksCredential
        ? "Sure — one second, let me open that link."
        : "Got it, doing this now. What's the exact amount I should send?",
    });
    turns.push({
      speaker: "attacker",
      text: asksCredential
        ? "Perfect. The portal will ask you to confirm your current password — that's all we need."
        : "The escrow account is Acme Escrow LLC — send it there and mark it 'confidential'. Today, please.",
    });
    turns.push({
      speaker: "target",
      text: "Done — credentials/transfer confirmed. Let me know if anything else is needed.",
    });
    const decision: PhishDecision = asksMoney ? "replied" : "clicked";
    const base = DECISION_BASE[decision] * CHANNEL_FACTOR[channel] * SENIORITY_FACTOR[target.seniority];
    return outcome(decision, turns, clamp(Math.round(base)), false);
  }

  const detectRoll = rng();
  const detectionRate = 0.55 + (target.seniority === "exec" ? 0.1 : 0);
  if (detectRoll < detectionRate) {
    turns.push({
      speaker: "target",
      text: "Hmm — a deadline threat from an address that looks off. Reporting to the SOC and checking on a known channel.",
    });
    return outcome("reported", turns, 0, true);
  }
  turns.push({
    speaker: "target",
    text: "Looks like noise. Closing it without clicking anything.",
  });
  return outcome("ignored", turns, clamp(Math.round(8 * CHANNEL_FACTOR[channel])), false);
}

function outcome(
  decision: PhishDecision,
  turns: Turn[],
  score: number,
  detected: boolean
): SimulateOutcome {
  return { decision, turns, score: clamp(score), detected };
}

function previewLine(lure: Lure): string {
  return `${lure.sender} — "${lure.subject}"`;
}

function clamp(n: number): number {
  return Math.min(100, Math.max(0, n));
}

/* ---------- Campaign orchestration ---------- */

export function newTarget(partial: Partial<PhishTarget> = {}): PhishTarget {
  const role = partial.role ?? "Team Member";
  const name = partial.name ?? CELEBRITY_NAMES[Math.floor(Math.random() * CELEBRITY_NAMES.length)];
  return {
    id: partial.id ?? randomId(),
    kind: partial.kind ?? "human",
    name,
    role,
    seniority: partial.seniority ?? "mid",
    department: partial.department ?? "Engineering",
  };
}

export function buildResult(input: SimulateInput, outcome: SimulateOutcome): PhishResult {
  return {
    campaignId: randomId(),
    target: input.target,
    channel: input.channel,
    scenarioId: input.scenarioId,
    lure: input.lure,
    decision: outcome.decision,
    turns: outcome.turns,
    score: outcome.score,
    riskBand: riskBandFor(outcome.score),
    detected: outcome.detected,
    createdAt: new Date().toISOString(),
  };
}
