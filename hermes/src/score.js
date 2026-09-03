// Composes signal outputs into one explainable 0..100 score.

import { SIGNALS, stealth } from './signals.js';
import { disqualify } from './filters.js';

export const TIER_ORDER = ['NOISE', 'WATCH', 'SIGNAL', 'ALPHA', 'URGENT'];

export function tierOf(score, cfg) {
  const t = cfg.tiers || {};
  if (score >= (t.urgent ?? 80)) return 'URGENT';
  if (score >= (t.alpha ?? 68)) return 'ALPHA';
  if (score >= (t.signal ?? 55)) return 'SIGNAL';
  if (score >= (t.watch ?? 42)) return 'WATCH';
  return 'NOISE';
}

export async function scoreCollection(ctx) {
  const { col, cfg } = ctx;
  const d = ctx.d;
  const blockers = disqualify(col, d, cfg);

  const parts = [];
  let weighted = 0;
  let totalWeight = 0;

  for (const sig of SIGNALS) {
    const weight = cfg.weights?.[sig.id] ?? sig.weight;
    if (weight <= 0) continue;
    let out = null;
    try {
      out = await sig.evaluate(ctx);
    } catch (e) {
      out = null;
      parts.push({ id: sig.id, label: sig.label, weight, score: null, note: `error: ${e.message}`, evidence: [] });
      continue;
    }
    if (out == null) {
      // No data for this signal — drop its weight rather than scoring it zero,
      // so a young collection is not punished for facts we cannot know yet.
      parts.push({ id: sig.id, label: sig.label, weight, score: null, note: 'no data', evidence: [] });
      continue;
    }
    weighted += weight * out.score;
    totalWeight += weight;
    parts.push({ id: sig.id, label: sig.label, weight, score: out.score, note: out.note, evidence: out.evidence || [] });
  }

  const base = totalWeight > 0 ? weighted / totalWeight : 0;
  const st = stealth(d, cfg);
  const coverage = totalWeight / SIGNALS.reduce((a, s) => a + (cfg.weights?.[s.id] ?? s.weight), 0);
  // Thin evidence should not produce loud calls: damp the score until enough
  // signals have data to stand behind it.
  const confidence = Math.min(1, 0.55 + 0.45 * coverage);
  const raw = 100 * base * st.multiplier * confidence;
  const score = blockers.length ? 0 : Math.round(Math.min(100, raw) * 10) / 10;

  return {
    address: col.address,
    score,
    tier: blockers.length ? 'NOISE' : tierOf(score, cfg),
    blockers,
    crowdIndex: Math.round(st.crowdIndex * 100) / 100,
    stealthMultiplier: Math.round(st.multiplier * 100) / 100,
    coverage: Math.round(coverage * 100) / 100,
    confidence: Math.round(confidence * 100) / 100,
    parts,
    derived: d,
    at: Date.now(),
  };
}

/** The three signals that contributed the most points — the "why" line in alerts. */
export function topDrivers(result, n = 3) {
  return result.parts
    .filter((p) => p.score != null)
    .map((p) => ({ ...p, contribution: p.weight * p.score }))
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, n);
}
