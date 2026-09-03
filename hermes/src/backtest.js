// Replays a historical block range through the exact same engine, so thresholds
// can be tuned on evidence instead of vibes.
//
// The key property: scores are computed cycle by cycle, and each cycle only
// ever sees blocks up to that point — there is no lookahead in a detection.

import { Agent } from './agent.js';
import { meetsTier } from './notify.js';
import { fmtAge, pct, shortAddr } from './util.js';

export async function backtest(cfg, { from, to, cycleBlocks = 500, horizonBlocks = 5000, minTier = 'SIGNAL', target = 3 }) {
  const agent = new Agent({
    ...cfg,
    scan: { ...cfg.scan, maxBlocksPerCycle: cycleBlocks, startBlock: from },
    paths: { ...cfg.paths, state: cfg.paths.state.replace(/\.json$/, '.backtest.json') },
    alerts: { ...cfg.alerts, minTier, jsonlFile: '' },
  });
  agent.silent = true;
  agent.store.collections.clear();
  agent.store.alerts = [];
  agent.store.cursor = from - 1;

  const detections = new Map(); // address -> first detection snapshot
  const timeline = new Map(); // address -> [{ block, holders, mints, secondary, score }]
  let cycles = 0;

  while (agent.store.cursor < to) {
    const r = await agent.cycle();
    if (r.skipped) break;
    cycles++;

    for (const { col, result } of r.results || []) {
      const t = timeline.get(col.address) || [];
      t.push({ block: r.to, holders: col.holders.size, mints: col.mints, secondary: col.secondary, score: result.score, tier: result.tier });
      timeline.set(col.address, t);

      if (!detections.has(col.address) && meetsTier(result.tier, minTier)) {
        detections.set(col.address, {
          address: col.address,
          name: col.name,
          block: r.to,
          score: result.score,
          tier: result.tier,
          holders: col.holders.size,
          mints: col.mints,
          ageSec: result.derived.ageSec,
          why: result.parts.filter((p) => p.score != null).sort((a, b) => b.weight * b.score - a.weight * a.score).slice(0, 2).map((p) => p.id),
        });
      }
    }
    if (r.to >= to) break;
  }

  // Outcome: holder growth between detection and detection + horizon.
  const rows = [];
  for (const [addr, det] of detections) {
    const t = timeline.get(addr) || [];
    const after = t.filter((x) => x.block >= det.block + horizonBlocks);
    const end = after[0] || t[t.length - 1];
    const measuredAt = end ? end.block : det.block;
    const growth = end && det.holders > 0 ? end.holders / det.holders : end && end.holders > 0 ? Infinity : 1;
    rows.push({
      ...det,
      endHolders: end?.holders ?? det.holders,
      endMints: end?.mints ?? det.mints,
      growth,
      measuredAt,
      matured: !!after.length,
      hit: growth >= target,
    });
  }

  rows.sort((a, b) => b.growth - a.growth);
  const matured = rows.filter((r) => r.matured);
  const byTier = {};
  for (const r of matured) {
    byTier[r.tier] ||= { n: 0, hits: 0, growths: [] };
    byTier[r.tier].n++;
    byTier[r.tier].hits += r.hit ? 1 : 0;
    byTier[r.tier].growths.push(r.growth);
  }
  for (const k of Object.keys(byTier)) {
    const g = byTier[k].growths.filter(Number.isFinite).sort((a, b) => a - b);
    byTier[k].precision = byTier[k].n ? byTier[k].hits / byTier[k].n : 0;
    byTier[k].medianGrowth = g.length ? g[Math.floor(g.length / 2)] : 0;
    delete byTier[k].growths;
  }

  return {
    range: { from, to, cycles, cycleBlocks, horizonBlocks },
    tracked: agent.store.collections.size,
    detections: rows.length,
    matured: matured.length,
    target,
    byTier,
    rows,
  };
}

export function renderBacktest(res) {
  const lines = [];
  lines.push(`Backtest ${res.range.from}–${res.range.to} · ${res.range.cycles} cycles · horizon ${res.range.horizonBlocks} blocks`);
  lines.push(`Tracked ${res.tracked} collections → ${res.detections} detections (${res.matured} matured)`);
  lines.push(`Hit = holder count grew ${res.target}× within the horizon`);
  lines.push('');
  for (const [tier, s] of Object.entries(res.byTier)) {
    lines.push(`  ${tier.padEnd(7)} n=${String(s.n).padStart(4)}  precision=${pct(s.precision).padStart(6)}  median growth=${s.medianGrowth.toFixed(2)}×`);
  }
  lines.push('');
  lines.push('  Top detections by realised growth:');
  for (const r of res.rows.slice(0, 15)) {
    const g = Number.isFinite(r.growth) ? `${r.growth.toFixed(2)}×` : '∞';
    lines.push(
      `   ${r.tier.padEnd(6)} ${String(r.score).padStart(5)}  ${shortAddr(r.address)} ${(r.name || '').slice(0, 22).padEnd(22)} ` +
        `${String(r.holders).padStart(5)}→${String(r.endHolders).padEnd(6)} ${g.padStart(7)}  age@detect ${fmtAge(r.ageSec)}  [${r.why.join(', ')}]`
    );
  }
  return lines.join('\n');
}
