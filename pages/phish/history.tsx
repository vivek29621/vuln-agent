import { useEffect, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icons";
import {
  CHANNEL_LABEL,
  DECISION_LABEL,
  getScenario,
} from "@/lib/phish/types";
import type { PhishCampaign } from "@/lib/phish/types";
import { clearCampaigns, loadCampaigns, removeCampaign } from "@/lib/phish/storage";

const RISK_BAND_STYLES: Record<string, string> = {
  low: "bg-emerald-50 text-emerald-700 border-emerald-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  high: "bg-orange-50 text-orange-700 border-orange-200",
  critical: "bg-red-50 text-red-700 border-red-200",
};

export default function PhishHistoryPage() {
  const [campaigns, setCampaigns] = useState<PhishCampaign[]>([]);

  useEffect(() => {
    const t = setTimeout(() => setCampaigns(loadCampaigns()), 0);
    return () => clearTimeout(t);
  }, []);

  function onClear() {
    if (window.confirm("Delete all saved phishing campaigns? This cannot be undone.")) {
      clearCampaigns();
      setCampaigns([]);
    }
  }

  function onRemove(id: string) {
    removeCampaign(id);
    setCampaigns(loadCampaigns());
  }

  const fellCount = campaigns.filter((c) =>
    c.results.some((r) => r.decision === "clicked" || r.decision === "replied")
  ).length;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3.5 py-1.5 text-xs font-semibold text-rose-700">
            <Icon name="history" className="h-3.5 w-3.5" />
            Saved locally
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900">Campaign history</h1>
          <p className="mt-2 text-sm text-slate-500">
            {campaigns.length > 0
              ? `${campaigns.length} campaign${campaigns.length === 1 ? "" : "s"} · ${fellCount} ended in a fall — stored in this browser only.`
              : "Your simulations — stored in this browser only."}
          </p>
        </div>
        {campaigns.length > 0 && (
          <button
            onClick={onClear}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-100"
          >
            <Icon name="trash" className="h-4 w-4" />
            Clear all
          </button>
        )}
      </header>

      {campaigns.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white/60 px-6 py-16 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <Icon name="history" className="h-7 w-7" />
          </span>
          <h2 className="mt-4 text-lg font-semibold text-slate-900">No campaigns yet</h2>
          <p className="mx-auto mt-1.5 max-w-sm text-sm leading-6 text-slate-500">
            Run your first phishing simulation and it will appear here, ready to re-open anytime.
          </p>
          <Link
            href="/phish"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700"
          >
            <Icon name="zap" className="h-4 w-4" />
            Run a simulation
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {campaigns.map((c) => {
            const r = c.results[0];
            const scenario = getScenario(c.scenarioId);
            return (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {c.name}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span>{new Date(c.createdAt).toLocaleString()}</span>
                    <span>{c.target.name} · {c.target.role}</span>
                    <span>{CHANNEL_LABEL[c.channel]}</span>
                    {scenario && <span>{scenario.technique}</span>}
                  </p>
                </div>
                {r && (
                  <div className="flex shrink-0 items-center gap-3">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${RISK_BAND_STYLES[r.riskBand]}`}>
                      {r.riskBand} · {r.score}/100
                    </span>
                    <span className="hidden text-xs text-slate-500 sm:inline">{DECISION_LABEL[r.decision]}</span>
                    <button
                      onClick={() => onRemove(c.id)}
                      aria-label={`Delete campaign ${c.name}`}
                      className="rounded-lg border border-slate-200 p-2 text-slate-400 transition hover:border-red-200 hover:text-red-600"
                    >
                      <Icon name="trash" className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
