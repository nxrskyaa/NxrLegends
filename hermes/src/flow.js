// FLOW analysis: who is actually absorbing supply, and is participation
// climbing step by step or just large in aggregate.
//
// This is the layer that decides *timing*. A collection with great structure
// and dead flow is a museum piece; one with rising flow and sellers being
// absorbed is a live market.

import { clamp01, ramp, decay } from './util.js';

/**
 * Volume velocity ladder. A 24h volume number says nothing about direction —
 * what matters is whether each step is bigger than the last (30K → 70K → 140K).
 * Splits the window into three legs and rewards monotone growth, scaled by how
 * hard each step grew.
 */
export function velocityLadder(series, legs = 3) {
  const per = Math.floor(series.length / legs);
  if (per < 1) return { steps: [], monotone: false, growth: 0, score: 0, legs: 0 };

  const steps = [];
  const end = series.length;
  for (let i = 0; i < legs; i++) {
    const a = end - (legs - i) * per;
    steps.push(series.slice(a, a + per).reduce((x, y) => x + y, 0));
  }

  let monotone = true;
  const ratios = [];
  for (let i = 1; i < steps.length; i++) {
    if (steps[i] <= steps[i - 1]) monotone = false;
    ratios.push(steps[i - 1] > 0 ? steps[i] / steps[i - 1] : steps[i] > 0 ? 2 : 1);
  }
  // Geometric mean of the step ratios — one explosive leg should not paper over
  // a stalled one.
  const growth = ratios.length ? Math.exp(ratios.reduce((a, r) => a + Math.log(Math.max(0.05, r)), 0) / ratios.length) : 1;
  const score = clamp01((monotone ? 0.45 : 0) + 0.55 * ramp(growth, 1, 1.6));
  return { steps, monotone, growth, score, legs: per };
}

/**
 * Seller absorption. When holders sell, either fresh wallets take the supply
 * (healthy — the bid is real) or it piles into the same few hands while the
 * holder base shrinks (weak — no one is left to buy).
 *
 * With no price feed we read it structurally: unique buyers vs unique sellers,
 * whether the holder base grew through the sell pressure, and whether supply
 * concentrated while it happened.
 */
export function absorption({ buyers, sellers, holdersStart, holdersEnd, sold, top10Start, top10End }) {
  if (!sellers) {
    return { ratio: null, holderDelta: holdersEnd - holdersStart, verdict: 'no-sell-pressure', score: null };
  }

  const ratio = buyers / Math.max(1, sellers);
  const holderDelta = holdersEnd - holdersStart;
  // How much of what was sold ended up widening the holder base.
  const spread = sold > 0 ? clamp01(holderDelta / sold) : 0;
  const concentrating = top10Start != null && top10End != null ? top10End - top10Start : 0;

  const breadth = ramp(ratio, 0.6, 1.4); // >1 buyer per seller is the healthy side
  const growing = holderDelta >= 0 ? clamp01(0.5 + 0.5 * spread) : clamp01(0.5 * decay(-holderDelta, Math.max(4, holdersStart * 0.15)));
  const notConcentrating = decay(Math.max(0, concentrating), 0.06);

  const score = clamp01(0.45 * breadth + 0.35 * growing + 0.2 * notConcentrating);
  const verdict =
    score >= 0.66 ? 'absorbed' : score >= 0.4 ? 'contested' : 'distributing';

  return { ratio, holderDelta, spread, concentrating, verdict, score };
}

/** Has flow simply stopped? The cleanest invalidation there is. */
export function isFlowDead(d, cfg) {
  const floor = cfg.flow?.deadRatePerMin ?? 0.15;
  const idle = cfg.flow?.deadIdleSec ?? 2700;
  return (d.mintsPerMin + d.secondaryPerMin) < floor && (d.staleSec ?? 0) > idle;
}
