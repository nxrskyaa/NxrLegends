// CONFLUENCE — the rule that a weighted sum alone cannot express.
//
// A single loud signal should never be enough. The best setups appear where
// independent layers agree at the same time:
//
//   attention ↑  +  quality ✓  +  flow ✓  +  structure ✓   →  act
//
// So the weighted score decides *how strong*, and this decides *how far it is
// allowed to be promoted*. A collection with brilliant momentum and nothing
// else is capped, no matter how high it scores.

export const LAYERS = {
  attention: 'Someone is showing up',
  quality: 'The right someone',
  flow: 'The bid holds under selling',
  structure: 'Nothing structurally wrong',
};

/** Weighted mean of the signals in each layer that actually had data. */
export function layerScores(parts, cfg) {
  const out = {};
  for (const key of Object.keys(LAYERS)) {
    const members = parts.filter((p) => p.layer === key && p.score != null);
    if (!members.length) {
      out[key] = { score: null, met: false, members: 0, reason: 'no data' };
      continue;
    }
    const w = members.reduce((a, p) => a + p.weight, 0);
    const score = members.reduce((a, p) => a + p.weight * p.score, 0) / w;
    const floor = cfg.confluence?.layerFloor ?? 0.55;
    out[key] = { score, met: score >= floor, members: members.length, reason: null };
  }
  return out;
}

/**
 * Caps the tier at what the number of agreeing layers can support.
 * Defaults: 4 layers for URGENT, 3 for ALPHA, 2 for SIGNAL, 1 for WATCH.
 */
export function capTier(tier, layers, cfg) {
  const met = Object.values(layers).filter((l) => l.met).length;
  const need = cfg.confluence?.tierRequires ?? { URGENT: 4, ALPHA: 3, SIGNAL: 2, WATCH: 1 };
  const order = ['URGENT', 'ALPHA', 'SIGNAL', 'WATCH', 'NOISE'];
  let capped = tier;
  for (const t of order) {
    if (t === 'NOISE') break;
    if (capped === t && met < (need[t] ?? 1)) capped = order[order.indexOf(t) + 1];
  }
  return { tier: capped, layersMet: met, capped: capped !== tier };
}

/**
 * Position size follows evidence quality, not enthusiasm.
 * Weak evidence gets a scout position; only full confluence earns full size.
 */
export function sizing(tier, layersMet, confidence, cfg) {
  const c = cfg.confluence || {};
  if (tier === 'URGENT' && layersMet >= 4 && confidence >= (c.fullSizeConfidence ?? 0.8)) return 'FULL';
  if (tier === 'URGENT' || tier === 'ALPHA') return 'HALF';
  if (tier === 'SIGNAL') return 'SCOUT';
  return 'NONE';
}
