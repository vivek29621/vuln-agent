import type { PhishCampaign } from "@/lib/phish/types";

/**
 * Client-side campaign history persisted in localStorage.
 * Keeps the latest 20 campaigns (results are small — a few KB each).
 */
const KEY = "phishagent:campaigns:v1";
const MAX_CAMPAIGNS = 20;

function readAll(): PhishCampaign[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PhishCampaign[]) : [];
  } catch {
    return [];
  }
}

function writeAll(campaigns: PhishCampaign[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(campaigns));
  } catch {
    /* storage full or unavailable — ignore */
  }
}

export function loadCampaigns(): PhishCampaign[] {
  return readAll().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function saveCampaign(campaign: PhishCampaign): void {
  const all = readAll().filter((c) => c.id !== campaign.id);
  all.unshift(campaign);
  writeAll(all.slice(0, MAX_CAMPAIGNS));
}

export function clearCampaigns(): void {
  writeAll([]);
}

export function removeCampaign(id: string): void {
  writeAll(readAll().filter((c) => c.id !== id));
}
