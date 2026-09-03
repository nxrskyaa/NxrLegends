// THESIS — an alert is a claim, and a claim has to be falsifiable.
//
// When Hermes calls something, it writes down *why*, and the specific
// conditions that would prove it wrong. Every later cycle re-tests those
// conditions. This is the difference between a scanner that shouts once and an
// agent that manages what it found.
//
// The rule it encodes: price is not the thesis. Flow, distribution and
// absorption are. A collection can be down and perfectly healthy, or flat and
// already broken.

import { topDrivers } from './score.js';
import { isFlowDead } from './flow.js';
import { clamp01, fmtAge, pct } from './util.js';

export function openThesis(col, result, nowTs, cfg) {
  const d = result.derived;
  const inv = cfg.thesis || {};
  const rate = d.mintsPerMin + d.secondaryPerMin;

  return {
    address: col.address,
    name: col.name || null,
    openedAt: nowTs,
    openBlock: col.lastBlock,
    tier: result.tier,
    score: result.score,
    size: result.size,
    layersMet: result.layersMet,
    why: topDrivers(result, 3).map((p) => ({ id: p.id, label: p.label, note: p.note })),
    entry: {
      holders: d.holders,
      supply: d.supply,
      ratePerMin: rate,
      top10Share: d.top10Share,
      absorb: d.absorb?.verdict ?? null,
      crowdIndex: result.crowdIndex,
    },
    // Written at entry, in absolute terms, so the test cannot drift with the
    // thing it is testing.
    invalidation: {
      rateFloor: Math.max(inv.absoluteRateFloor ?? 0.1, rate * (inv.rateCollapseFrac ?? 0.25)),
      holderFloor: Math.floor(d.holders * (inv.holderDrawdownFrac ?? 0.85)),
      top10Cap: clamp01(d.top10Share + (inv.distributionSlack ?? 0.12)),
      absorbFail: 'distributing',
      maxIdleSec: inv.maxIdleSec ?? 5400,
    },
    maturity: { crowdIndex: cfg.thesis?.matureCrowdIndex ?? 0.7 },
    status: 'open',
    checks: 0,
    closedAt: null,
    closeReason: null,
  };
}

/**
 * Re-tests an open thesis against current state.
 * Returns { status, reasons } — reasons are the human-readable failures.
 */
export function evaluateThesis(th, d, result, nowTs, cfg) {
  const reasons = [];
  const inv = th.invalidation;
  const rate = d.mintsPerMin + d.secondaryPerMin;

  // 1. Flow died. The cleanest invalidation there is.
  if (isFlowDead(d, cfg)) reasons.push(`flow stopped (${rate.toFixed(2)}/min, idle ${fmtAge(d.staleSec)})`);
  else if (rate < inv.rateFloor && (d.staleSec ?? 0) > (cfg.thesis?.rateGraceSec ?? 900)) {
    reasons.push(`flow collapsed to ${rate.toFixed(2)}/min (floor ${inv.rateFloor.toFixed(2)})`);
  }

  // 2. Holders leaving — the base is shrinking, not rotating.
  if (d.holders < inv.holderFloor) reasons.push(`holders ${d.holders} below floor ${inv.holderFloor} (entry ${th.entry.holders})`);

  // 3. Distribution: supply concentrating back into few hands.
  if (d.top10Share > inv.top10Cap) {
    reasons.push(`top10 ${pct(d.top10Share)} above cap ${pct(inv.top10Cap)} (entry ${pct(th.entry.top10Share)})`);
  }

  // 4. Sellers no longer absorbed — this is the one that usually fires first.
  if (d.absorb?.verdict === inv.absorbFail) {
    reasons.push(`sellers no longer absorbed (${d.uniqueBuyers} buyers vs ${d.uniqueSellers} sellers)`);
  }

  // 5. A blocker appeared that was not there at entry.
  for (const b of result.blockers) reasons.push(`disqualified: ${b}`);

  if (reasons.length) return { status: 'invalidated', reasons };

  // Not broken — but has the crowd arrived? For a pre-crowd strategy that is
  // the thesis *completing*, not failing.
  if (result.crowdIndex >= th.maturity.crowdIndex) {
    return {
      status: 'matured',
      reasons: [`crowd index ${pct(result.crowdIndex)} — no longer early (${d.holders} holders, entry ${th.entry.holders})`],
    };
  }

  return { status: 'open', reasons: [] };
}

/** One-line summary of how a thesis has travelled since it was opened. */
export function thesisProgress(th, d) {
  const holderMult = th.entry.holders > 0 ? d.holders / th.entry.holders : null;
  return {
    ageSec: d.ageSec,
    holders: `${th.entry.holders} → ${d.holders}`,
    holderMult,
    rate: `${th.entry.ratePerMin.toFixed(2)} → ${(d.mintsPerMin + d.secondaryPerMin).toFixed(2)}/min`,
    absorb: `${th.entry.absorb ?? 'n/a'} → ${d.absorb?.verdict ?? 'n/a'}`,
    top10: `${pct(th.entry.top10Share)} → ${pct(d.top10Share)}`,
  };
}
