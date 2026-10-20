import type { NextApiRequest, NextApiResponse } from "next";
import { generateLure, generateTraining } from "@/lib/phish/ai";
import { buildResult, decide, newTarget } from "@/lib/phish/simulate";
import { getScenario } from "@/lib/phish/types";
import type { PhishChannel, PhishDecision, PhishTarget, TargetKind } from "@/lib/phish/types";

export const config = {
  api: {
    bodyParser: { sizeLimit: "64kb" },
  },
};

/**
 * POST /api/phish/simulate
 * Body: { target?, channel, scenarioId }
 * target is optional — pass { name, role, seniority, department, kind } to
 * simulate a specific person (or agent), or omit for a generated persona.
 * Returns: { result: PhishResult, training: TrainingModule }
 *
 * The simulation never sends anything — it models the outcome server-side.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const body = (req.body ?? {}) as {
    target?: Partial<PhishTarget>;
    channel?: unknown;
    scenarioId?: unknown;
  };

  const channel = validChannel(body.channel);
  const scenario = typeof body.scenarioId === "string" ? getScenario(body.scenarioId) : getScenario("it-reset");
  if (!channel) {
    res.status(400).json({ error: "A valid channel is required (email, sms, or voice)." });
    return;
  }

  try {
    const kind: TargetKind = body.target?.kind === "agent" ? "agent" : "human";
    const target = newTarget({
      ...(body.target ?? {}),
      kind,
    });

    // 1. Generate the lure (AI or deterministic).
    const lure = await generateLure({
      channel,
      scenario,
      target,
      simulate: body.target?.kind === "agent" ? false : undefined,
    });

    // 2. Run the decision simulation.
    const outcome = decide(target, channel, lure);

    // 3. Build the result and adaptive training.
    const result = buildResult({ target, channel, scenarioId: scenario.id, lure }, outcome);
    const training = await generateTraining({
      scenario,
      decision: outcome.decision as PhishDecision,
      channel,
      target,
      simulate: lure.simulated,
    });

    res.status(200).json({ result, training });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Simulation failed." });
  }
}

function validChannel(v: unknown): PhishChannel | null {
  return v === "email" || v === "sms" || v === "voice" ? v : null;
}
