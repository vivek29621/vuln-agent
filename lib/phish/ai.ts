import { extractJson, generateText } from "@/lib/ai/googleAi";
import type {
  Lure,
  PhishChannel,
  PhishTarget,
  ScenarioDef,
  TrainingModule,
} from "@/lib/phish/types";

/**
 * AI lure & training generation for PhishAgent.
 * Same pattern as the scan engine: try Google AI, fall back to a
 * deterministic engine that is honest about being simulated.
 */

function injectVars(text: string, target: PhishTarget, scenario: ScenarioDef): string {
  return text
    .replaceAll("{name}", target.name)
    .replaceAll("{role}", target.role)
    .replaceAll("{ceo}", "Alex Morgan")
    .replaceAll("{url}", scenario.url);
}

/* ---------- Lure generation ---------- */

export interface LureSpec {
  channel: PhishChannel;
  scenario: ScenarioDef;
  target: PhishTarget;
  /** Force deterministic output (used by the demo/sandbox path). */
  simulate?: boolean;
}

export async function generateLure(spec: LureSpec): Promise<Lure> {
  const { channel, scenario, target, simulate } = spec;
  const useAi = !simulate && (await isAiAvailable());

  if (useAi) {
    const prompt = `You are PhishAgent, a security training simulator. Write ONE ${channel} phishing lure for a ${target.seniority} ${target.role} (${target.department}) named ${target.name}.
Scenario: ${scenario.label} — ${scenario.pretext}
Technique: ${scenario.technique}
Sender: ${scenario.sender}

Rules:
- Make it realistic, urgent, and personalized — the way a real AI-written lure reads.
- Never include the literal destination URL in the visible body; instead use a phrase like "here" or "this link" or "the portal".
- Keep it under 160 words.
- This is simulated training content for security awareness. Do not add any disclaimer inside the lure itself.

Return STRICT JSON only, no markdown:
{"body": "the full lure content (email body, SMS text, or voice call script)", "subject": "email subject or SMS preview line or call framing", "url": "https://example-fake-destination.com/path"}`;

    const text = await generateText(prompt, { temperature: 0.8, maxTokens: 700 });
    if (text) {
      const parsed = extractJson(text) as Partial<Lure> | null;
      if (parsed && typeof parsed.body === "string" && parsed.body.trim()) {
        return {
          channel,
          sender: scenario.sender,
          subject: parsed.subject ?? scenario.subject,
          body: parsed.body.trim(),
          url: parsed.url ?? scenario.url,
          pretext: scenario.pretext,
          simulated: false,
        };
      }
    }
  }

  // Deterministic fallback — pick the variant, inject the target.
  const variant = scenario.bodies[Math.floor(Math.random() * scenario.bodies.length)];
  return {
    channel,
    sender: scenario.sender,
    subject: scenario.subject,
    body: injectVars(variant, target, scenario),
    url: scenario.url,
    pretext: scenario.pretext,
    simulated: true,
  };
}

/* ---------- Adaptive training module ---------- */

export interface TrainingSpec {
  scenario: ScenarioDef;
  decision: "clicked" | "replied" | "ignored" | "reported" | "verified";
  channel: PhishChannel;
  target: PhishTarget;
  simulate?: boolean;
}

export async function generateTraining(spec: TrainingSpec): Promise<TrainingModule> {
  const { scenario, decision, channel, target, simulate } = spec;
  const useAi = !simulate && (await isAiAvailable());

  if (useAi) {
    const prompt = `You are PhishAgent's trainer. The target (${target.name}, ${target.role}) just ${decision === "replied" ? "replied to" : decision === "clicked" ? "clicked a link in" : decision === "ignored" ? "ignored" : "correctly handled"} a ${channel} phishing lure using the "${scenario.label}" scenario (technique: ${scenario.technique}).

Write a 60-90 second adaptive micro-training module. Keep it specific to THIS attack and THIS channel. No filler, no guilt.

Return STRICT JSON only, no markdown, exactly this shape:
{"title": "short title", "technique": "the technique", "lesson": ["3-5 short bullets, each under 20 words"], "habit": "one verification habit to adopt, under 20 words", "quiz": [{"q": "one quick-check question", "a": "short answer"}]}`;

    const text = await generateText(prompt, { temperature: 0.5, maxTokens: 600 });
    if (text) {
      const parsed = extractJson(text) as Partial<TrainingModule> | null;
      if (parsed && Array.isArray(parsed.lesson) && parsed.lesson.length > 0) {
        return {
          title: parsed.title ?? `What to do about ${scenario.technique}`,
          durationSec: 75,
          technique: parsed.technique ?? scenario.technique,
          lesson: parsed.lesson.slice(0, 5),
          habit: parsed.habit ?? scenario.habit,
          quiz: Array.isArray(parsed.quiz) ? parsed.quiz.slice(0, 2) : defaultQuiz(scenario),
          simulated: false,
        };
      }
    }
  }

  const fell = decision === "clicked" || decision === "replied";
  return {
    title: `${scenario.label} — ${fell ? "how to spot it next time" : "keep it up"}`,
    durationSec: 75,
    technique: scenario.technique,
    lesson: fallbackLessons(scenario, channel, fell),
    habit: scenario.habit,
    quiz: defaultQuiz(scenario),
    simulated: true,
  };
}

function fallbackLessons(
  scenario: ScenarioDef,
  channel: PhishChannel,
  fell: boolean
): string[] {
  const channelNote =
    channel === "sms"
      ? "SMS has no spam filter or sender branding — treat every text as untrusted."
      : channel === "voice"
        ? "Anyone can clone a voice; an incoming call proves nothing."
        : "Check the real sender address, not just the display name.";
  const core = [
    `The tell: ${scenario.tell}`,
    channelNote,
    `The habit: ${scenario.habit}`,
    "Urgency is the weapon — deadlines and secrecy exist to skip your verification.",
  ];
  if (fell) core.push("No harm done — this is exactly what simulations are for. You now know the pattern.");
  else core.push("You caught it. That's the behavior that stops real breaches.");
  return core;
}

function defaultQuiz(scenario: ScenarioDef): { q: string; a: string }[] {
  return [
    { q: `What makes the "${scenario.label}" scenario suspicious?`, a: scenario.tell },
    { q: "What's the one habit that would have caught it?", a: scenario.habit },
  ];
}

/* ---------- Shared ---------- */

let aiCache: boolean | null = null;
async function isAiAvailable(): Promise<boolean> {
  if (aiCache !== null) return aiCache;
  // The availability check is synchronous (reads env) — keep it honest.
  aiCache = Boolean(
    process.env.NEXT_PUBLIC_GOOGLE_AI_API_KEY &&
      process.env.NEXT_PUBLIC_GOOGLE_AI_API_KEY !== "placeholder" &&
      process.env.NEXT_PUBLIC_GOOGLE_AI_API_KEY !== "your-google-ai-api-key"
  );
  return aiCache;
}
