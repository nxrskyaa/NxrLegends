// The signal layer. Each signal is independent, returns a 0..1 score plus the
// evidence behind it, and may return `null` when it has no data — in that case
// its weight is removed from the denominator instead of scoring it a zero.

import { ramp, decay, bell, clamp01, pct, shortAddr, fmtAge } from './util.js';
import { TIER_WEIGHT } from './wallets.js';

/**
 * ctx = { col, d, wallets, chain, cfg, history }
 *   col     — Collection instance
 *   d       — col.derive() output
 *   history — Map<ownerAddr, {collections:[{address, peakScore}]}> from the store
 */
export const SIGNALS = [
  {
    id: 'smart_money',
    label: 'Smart money present',
    weight: 26,
    async evaluate({ col, wallets, cfg }) {
      const hits = wallets.hitsIn(col);
      if (wallets.map.size === 0) return null; // empty registry -> no opinion
      const total = hits.reduce((a, h) => a + h.weight, 0);
      // Two S-tier wallets, or a handful of B-tier, is already a strong read.
      const score = ramp(total, 0, cfg.signals.smartMoneyMid ?? 1.6);
      return {
        score,
        note: hits.length ? `${hits.length} tracked wallet(s), weight ${total.toFixed(2)}` : 'no tracked wallets yet',
        evidence: hits.slice(0, 8).map((h) => `${h.tier}:${shortAddr(h.addr)}×${h.mints}`),
      };
    },
  },

  {
    id: 'mint_acceleration',
    label: 'Mint velocity accelerating',
    weight: 16,
    evaluate({ d, cfg }) {
      if (d.mints < (cfg.signals.minMintsForRate ?? 5)) return null;
      const speed = ramp(d.mintsPerMin, 0.2, cfg.signals.mintsPerMinMid ?? 4);
      const accel = ramp(d.accelRatio, 1, cfg.signals.accelRatioMid ?? 2.2);
      return {
        score: clamp01(0.45 * speed + 0.55 * accel),
        note: `${d.mintsPerMin.toFixed(2)}/min, ${d.accelRatio.toFixed(2)}× baseline`,
        evidence: [`rate=${d.mintsPerMin.toFixed(2)}/min`, `accel=${d.accelPerMin.toFixed(3)}/min²`],
      };
    },
  },

  {
    id: 'organic_distribution',
    label: 'Organic mint spread',
    weight: 14,
    evaluate({ d, cfg }) {
      if (d.uniqueMinters < 3) return null;
      // ~1.6 mints per wallet is the sweet spot: real interest, not one whale,
      // not a thousand wallets taking exactly one each (that is a sybil farm).
      const perWallet = bell(d.mintsPerWallet, cfg.signals.idealMintsPerWallet ?? 1.7, 1.5);
      const spread = 1 - d.minterGini;
      const bulk = decay(d.bulkShare, cfg.signals.bulkShareMid ?? 0.3);
      return {
        score: clamp01(0.4 * perWallet + 0.35 * spread + 0.25 * bulk),
        note: `${d.uniqueMinters} minters, ${d.mintsPerWallet.toFixed(2)}/wallet, gini ${d.minterGini.toFixed(2)}`,
        evidence: [`bulkShare=${pct(d.bulkShare)}`, `biggestTx=${d.biggestTxMints}`],
      };
    },
  },

  {
    id: 'sybil_resistance',
    label: 'Not a bot farm',
    weight: 8,
    evaluate({ col, d, cfg }) {
      // Never claim a collection is clean on the strength of a handful of
      // probes — an unprobed minter set is missing data, not a good result.
      const minProbed = cfg.signals.minMinterProbes ?? 10;
      if (d.mintersProbed < Math.min(minProbed, d.uniqueMinters)) return null;

      const notContracts = decay(d.contractMinterShare, 0.15);
      const notOneBlock = decay(d.biggestTxMints / Math.max(1, d.mints), 0.35);
      const raw = clamp01(0.6 * notContracts + 0.4 * notOneBlock);
      // Partial coverage pulls the verdict back toward neutral: a sample of 20
      // out of 500 minters is a hint, not a clean bill of health.
      const shrink = clamp01(Math.sqrt(clamp01(d.minterProbeCoverage)));
      return {
        score: clamp01(0.5 + (raw - 0.5) * shrink),
        note: `${pct(d.contractMinterShare)} of ${d.mintersProbed}/${d.uniqueMinters} probed minters are contracts`,
        evidence: [`contractMinters=${col.contractMinters.size}`, `coverage=${pct(d.minterProbeCoverage)}`],
      };
    },
  },

  {
    id: 'holder_spread',
    label: 'Supply not concentrated',
    weight: 10,
    evaluate({ d }) {
      if (d.holders < 3) return null;
      const top10 = 1 - clamp01(d.top10Share);
      const whale = decay(d.top1Share, 0.18);
      const creator = decay(d.ownerShare, 0.25);
      return {
        score: clamp01(0.45 * top10 + 0.3 * whale + 0.25 * creator),
        note: `top10 ${pct(d.top10Share)}, top1 ${pct(d.top1Share)}, creator ${pct(d.ownerShare)}`,
        evidence: [`holders=${d.holders}`, `holderGini=${d.holderGini.toFixed(2)}`],
      };
    },
  },

  {
    id: 'secondary_demand',
    label: 'Early secondary demand',
    weight: 10,
    evaluate({ d, cfg }) {
      if (d.mints < 10) return null;
      if (d.secondary === 0) {
        // Nothing has moved yet. On a fresh collection that is neutral-good
        // (nobody is dumping); on an old one it means nobody wants it.
        return { score: d.ageSec < (cfg.signals.freshSec ?? 3600) ? 0.5 : 0.15, note: 'no secondary movement yet', evidence: [] };
      }
      // Some flipping proves a bid exists; a flood means the mint is being dumped.
      const healthy = bell(d.secondaryRatio, cfg.signals.idealSecondaryRatio ?? 0.18, 0.16);
      const quick = d.timeToFirstSecondary != null ? decay(d.timeToFirstSecondary, cfg.signals.quickSecondarySec ?? 2700) : 0.4;
      return {
        score: clamp01(0.65 * healthy + 0.35 * quick),
        note: `secondary ${pct(d.secondaryRatio)} of mints, first at ${fmtAge(d.timeToFirstSecondary)}`,
        evidence: [`secondaryTransfers=${d.secondary}`],
      };
    },
  },

  {
    id: 'supply_scarcity',
    label: 'Scarce supply filling fast',
    weight: 6,
    evaluate({ d, cfg }) {
      if (d.supplyFilled == null) return null;
      const small = decay(d.supply, cfg.signals.scarceSupplyMid ?? 4000);
      const filling = clamp01(d.supplyFilled);
      return {
        score: clamp01(0.5 * small + 0.5 * filling),
        note: `${d.supply} minted, ${pct(d.supplyFilled)} of cap`,
        evidence: [],
      };
    },
  },

  {
    id: 'deployer_pedigree',
    label: 'Deployer has a track record',
    weight: 8,
    evaluate({ col, wallets, history }) {
      if (!col.owner) return null;
      const known = wallets.get(col.owner);
      const prior = history?.get(col.owner) || [];
      const priorGood = prior.filter((p) => p.peakScore >= 60 && p.address !== col.address);
      if (!known && prior.length === 0) return null;
      const fromRegistry = known ? TIER_WEIGHT[known.tier] ?? 0.2 : 0;
      const fromHistory = ramp(priorGood.length, 0, 1.5);
      return {
        score: clamp01(Math.max(fromRegistry, fromHistory)),
        note: known ? `deployer is ${known.tier}-tier` : `deployer shipped ${priorGood.length} prior hit(s)`,
        evidence: priorGood.slice(0, 4).map((p) => `${shortAddr(p.address)}@${p.peakScore}`),
      };
    },
  },

  {
    id: 'contract_health',
    label: 'Contract looks legit',
    weight: 6,
    evaluate({ col, d }) {
      let s = 0;
      const ev = [];
      if (col.standard) { s += 0.3; ev.push(col.standard); } else ev.push('standard:unknown');
      if (col.name && col.symbol) { s += 0.25; ev.push(`${col.name} (${col.symbol})`); } else ev.push('no name/symbol');
      if (col.revealed !== false) s += 0.2;
      else ev.push('metadata unrevealed');
      if (d.ownerShare < 0.5) s += 0.25;
      else ev.push(`creator holds ${pct(d.ownerShare)}`);
      return { score: clamp01(s), note: ev.join(', '), evidence: ev };
    },
  },
];

/**
 * Stealth multiplier — the part that makes this a *pre-crowd* detector.
 * A collection that already has thousands of holders is not alpha any more,
 * however good its other numbers look, so we scale the whole score down as
 * crowd awareness rises and give a small boost while it is still tiny.
 */
export function stealth(d, cfg) {
  const holderMid = cfg.signals.crowdHolderMid ?? 900;
  const ageMid = cfg.signals.crowdAgeSec ?? 6 * 3600;
  const crowdIndex = clamp01(0.65 * ramp(d.holders, 0, holderMid) + 0.35 * ramp(d.ageSec, 0, ageMid));
  const floorMult = cfg.signals.stealthFloor ?? 0.35;
  const peakMult = cfg.signals.stealthPeak ?? 1.15;
  return { crowdIndex, multiplier: floorMult + (peakMult - floorMult) * (1 - crowdIndex) };
}
