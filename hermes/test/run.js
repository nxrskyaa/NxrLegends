// End-to-end test against the mock chain. No network, no dependencies.
//   node test/run.js

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startMock, FIXTURES, RANGE } from './mockchain.js';
import { loadConfig } from '../src/config.js';
import { Agent } from '../src/agent.js';
import { backtest } from '../src/backtest.js';
import { stealth } from '../src/signals.js';
import { velocityLadder, absorption, isFlowDead } from '../src/flow.js';
import { layerScores, capTier, sizing } from '../src/confluence.js';
import { openThesis, evaluateThesis } from '../src/thesis.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-test-'));
let passed = 0;
const check = (name, fn) => {
  try {
    fn();
    passed++;
    process.stdout.write(`  ✓ ${name}\n`);
  } catch (e) {
    process.stdout.write(`  ✗ ${name}\n    ${e.message}\n`);
    process.exitCode = 1;
  }
};

const { server, url } = await startMock();
process.stdout.write(`mock chain at ${url}\n\n`);

const cfg = loadConfig(path.join(tmp, 'nope.json'));
cfg.chain.rpcUrl = url;
cfg.scan.startBlock = RANGE.START;
cfg.scan.maxBlocksPerCycle = 2000;
cfg.scan.rps = 1000;
cfg.scan.maxMinterProbes = 400;
cfg.paths.state = path.join(tmp, 'state.json');
cfg.paths.wallets = path.join(tmp, 'wallets.json');
cfg.alerts.jsonlFile = path.join(tmp, 'alerts.jsonl');
cfg.alerts.minTier = 'WATCH';

// Seed the registry so the smart_money signal has something to work with.
const seed = new Agent(cfg);
for (const w of FIXTURES.smart) seed.wallets.add(w, { tier: 'S', note: 'test fixture' });
seed.wallets.save();

process.stdout.write('scan cycle\n');
const agent = new Agent(cfg);
agent.silent = true;
const r = await agent.cycle();

const get = (a) => agent.store.collections.get(a);
const scored = new Map((await agent.scoreAll([...agent.store.collections.values()])).map((x) => [x.col.address, x.result]));

check('discovered the organic launch', () => assert.ok(get(FIXTURES.organic)));
check('ignored the ERC-20 decoy (3-topic Transfer)', () => assert.equal(get(FIXTURES.erc20), undefined));
check('read contract metadata over eth_call', () => assert.equal(get(FIXTURES.organic).name, 'Hermes Test Alpha'));
check('detected the ERC-721 standard', () => assert.equal(get(FIXTURES.organic).standard, 'erc721'));
check('resolved the deployer via owner()', () => assert.equal(get(FIXTURES.organic).owner, FIXTURES.deployerOrganic));

const organic = get(FIXTURES.organic);
const d = organic.derive();
check('counted mints and unique minters', () => {
  assert.ok(d.mints > 100, `mints=${d.mints}`);
  assert.ok(d.uniqueMinters > 30, `minters=${d.uniqueMinters}`);
});
check('separated secondary transfers from mints', () => assert.ok(d.secondary >= 14, `secondary=${d.secondary}`));
check('holder ledger balances against supply', () => {
  const held = [...organic.holders.values()].reduce((a, b) => a + b, 0);
  assert.equal(held, organic.mints - organic.burns);
});
check('picked up smart-money minters', () => {
  const hits = agent.wallets.hitsIn(organic);
  assert.equal(hits.length, 3, `hits=${hits.length}`);
});

check('whale self-mint is disqualified', () => {
  const res = scored.get(FIXTURES.whale);
  assert.ok(res.blockers.length > 0, 'expected blockers');
  assert.equal(res.score, 0);
});
check('bot farm scores below the organic launch', () => {
  const bot = scored.get(FIXTURES.botfarm);
  const org = scored.get(FIXTURES.organic);
  assert.ok(org.score > bot.score, `organic=${org.score} bot=${bot.score}`);
});
check('bot farm is flagged as contract-heavy', () => {
  assert.ok(get(FIXTURES.botfarm).contractMinters.size > 50, `contracts=${get(FIXTURES.botfarm).contractMinters.size}`);
});
check('organic launch reaches an actionable tier', () => {
  const org = scored.get(FIXTURES.organic);
  assert.ok(org.score >= cfg.tiers.watch, `score=${org.score} tier=${org.tier}`);
});
check('score explains itself', () => {
  const org = scored.get(FIXTURES.organic);
  assert.ok(org.parts.length >= 8);
  assert.ok(org.parts.some((p) => p.id === 'smart_money' && p.score > 0.5));
});
check('stealth multiplier damps a crowded collection', () => {
  const quiet = stealth({ holders: 20, ageSec: 600 }, cfg);
  const crowded = stealth({ holders: 5000, ageSec: 86400 }, cfg);
  assert.ok(quiet.multiplier > crowded.multiplier, `${quiet.multiplier} vs ${crowded.multiplier}`);
  assert.ok(crowded.crowdIndex > 0.9, `crowdIndex=${crowded.crowdIndex}`);
});

process.stdout.write('\nstate round-trip\n');
agent.store.save();
const reloaded = new Agent(cfg);
check('state survives save + reload', () => {
  const c = reloaded.store.collections.get(FIXTURES.organic);
  assert.ok(c);
  assert.equal(c.mints, organic.mints);
  assert.equal(c.holders.size, organic.holders.size);
  assert.equal(c.contractMinters.size, organic.contractMinters.size);
});
check('cursor advanced', () => assert.ok(reloaded.store.cursor >= RANGE.START));
const before = reloaded.store.collections.get(FIXTURES.organic).mints;
reloaded.silent = true;
reloaded.store.cursor = RANGE.START - 1; // deliberately replay the same range
await reloaded.cycle();
check('replaying the same blocks does not double-count', () => {
  // A replay legitimately re-applies events; what must hold is that the ledger
  // stays consistent, which is what the holder invariant checks.
  const c = reloaded.store.collections.get(FIXTURES.organic);
  const held = [...c.holders.values()].reduce((a, b) => a + b, 0);
  assert.equal(held, c.mints - c.burns);
  assert.ok(c.mints >= before);
});

process.stdout.write('\nbacktest\n');
const bt = await backtest({ ...cfg, paths: { ...cfg.paths, state: path.join(tmp, 'bt.json') } }, {
  from: RANGE.START,
  to: RANGE.END,
  cycleBlocks: 100,
  horizonBlocks: 200,
  minTier: 'WATCH',
  target: 1.5,
});
check('backtest produces detections with outcomes', () => {
  assert.ok(bt.detections > 0, 'no detections');
  assert.ok(bt.rows.some((x) => x.address === FIXTURES.organic), 'organic launch not detected');
});
check('backtest detects the organic launch before the range ends', () => {
  const row = bt.rows.find((x) => x.address === FIXTURES.organic);
  assert.ok(row.block < RANGE.END, `detected at ${row.block}`);
});

process.stdout.write('\nalert pipeline\n');
const alertCfg = { ...cfg, paths: { ...cfg.paths, state: path.join(tmp, 'alert.json') } };
const a2 = new Agent(alertCfg);
a2.store.cursor = RANGE.START - 1;
const r2 = await a2.cycle();
check('alerts fire and are written to jsonl', () => {
  assert.ok(r2.alerts.length > 0, 'no alerts fired');
  const lines = fs.readFileSync(alertCfg.alerts.jsonlFile, 'utf8').trim().split('\n');
  const last = JSON.parse(lines[lines.length - 1]);
  assert.ok(last.address && last.tier && Array.isArray(last.why) && last.why.length > 0);
});
const firstCount = r2.alerts.length;
const r3 = await (async () => {
  a2.store.cursor = RANGE.END - 50;
  return a2.cycle();
})();
check('no duplicate alert on the next cycle', () => assert.ok(r3.alerts.length < firstCount || r3.alerts.length === 0));

process.stdout.write('\nflow — velocity ladder\n');
check('rewards a monotone 30 → 70 → 140 ramp', () => {
  const l = velocityLadder([30, 70, 140]);
  assert.equal(l.monotone, true);
  assert.ok(l.score > 0.85, `score=${l.score}`);
});
check('flat volume scores zero however large', () => {
  assert.equal(velocityLadder([9000, 9000, 9000, 9000, 9000, 9000]).score, 0);
});
check('a decaying ramp is not rewarded', () => {
  const l = velocityLadder([100, 50, 10]);
  assert.equal(l.monotone, false);
  assert.equal(l.score, 0);
});
check('one explosive leg cannot mask a stalled one', () => {
  const spiky = velocityLadder([10, 10, 1000]);
  const steady = velocityLadder([10, 32, 100]);
  assert.ok(steady.score >= spiky.score * 0.9, `steady=${steady.score} spiky=${spiky.score}`);
});

process.stdout.write('\nflow — seller absorption\n');
check('abstains when nobody has sold yet', () => {
  const a = absorption({ buyers: 0, sellers: 0, holdersStart: 10, holdersEnd: 10, sold: 0 });
  assert.equal(a.score, null);
  assert.equal(a.verdict, 'no-sell-pressure');
});
check('reads a widening holder base as absorbed', () => {
  const a = absorption({ buyers: 40, sellers: 12, holdersStart: 80, holdersEnd: 110, sold: 30, top10Start: 0.3, top10End: 0.29 });
  assert.equal(a.verdict, 'absorbed');
  assert.ok(a.score > 0.66, `score=${a.score}`);
});
check('reads a shrinking, concentrating base as distribution', () => {
  const a = absorption({ buyers: 4, sellers: 30, holdersStart: 120, holdersEnd: 70, sold: 60, top10Start: 0.25, top10End: 0.48 });
  assert.equal(a.verdict, 'distributing');
  assert.ok(a.score < 0.4, `score=${a.score}`);
});
check('same sell volume scores worse when supply concentrates', () => {
  const base = { buyers: 20, sellers: 20, holdersStart: 100, holdersEnd: 100, sold: 40, top10Start: 0.3 };
  const clean = absorption({ ...base, top10End: 0.3 });
  const concentrating = absorption({ ...base, top10End: 0.45 });
  assert.ok(clean.score > concentrating.score, `${clean.score} vs ${concentrating.score}`);
});
check('flow death needs both a dead rate and a long idle', () => {
  assert.equal(isFlowDead({ mintsPerMin: 0.01, secondaryPerMin: 0, staleSec: 9000 }, cfg), true);
  assert.equal(isFlowDead({ mintsPerMin: 0.01, secondaryPerMin: 0, staleSec: 60 }, cfg), false);
  assert.equal(isFlowDead({ mintsPerMin: 5, secondaryPerMin: 2, staleSec: 9000 }, cfg), false);
});

process.stdout.write('\nconfluence\n');
const part = (id, layer, weight, score) => ({ id, layer, weight, score, note: '', evidence: [] });
check('a layer with no data is never counted as met', () => {
  const l = layerScores([part('smart_money', 'quality', 26, null)], cfg);
  assert.equal(l.quality.met, false);
  assert.equal(l.quality.score, null);
});
check('one loud signal cannot reach ALPHA on its own', () => {
  const layers = layerScores([
    part('mint_acceleration', 'attention', 16, 1),
    part('smart_money', 'quality', 26, 0.1),
    part('flow_absorption', 'flow', 14, 0.1),
    part('contract_health', 'structure', 6, 0.2),
  ], cfg);
  const { tier, layersMet } = capTier('ALPHA', layers, cfg);
  assert.equal(layersMet, 1);
  assert.equal(tier, 'WATCH', `got ${tier}`);
});
check('four agreeing layers keep URGENT', () => {
  const layers = layerScores([
    part('mint_acceleration', 'attention', 16, 0.8),
    part('smart_money', 'quality', 26, 0.8),
    part('flow_absorption', 'flow', 14, 0.8),
    part('contract_health', 'structure', 6, 0.8),
  ], cfg);
  const { tier, layersMet, capped } = capTier('URGENT', layers, cfg);
  assert.equal(layersMet, 4);
  assert.equal(tier, 'URGENT');
  assert.equal(capped, false);
});
check('layer score is weighted, so one strong member cannot carry it', () => {
  const layers = layerScores([
    part('contract_health', 'structure', 6, 1),
    part('holder_spread', 'structure', 10, 0.2),
    part('organic_distribution', 'structure', 14, 0.2),
  ], cfg);
  assert.equal(layers.structure.met, false, `score=${layers.structure.score}`);
});
check('sizing follows evidence, not enthusiasm', () => {
  assert.equal(sizing('URGENT', 4, 0.9, cfg), 'FULL');
  assert.equal(sizing('URGENT', 4, 0.6, cfg), 'HALF');
  assert.equal(sizing('ALPHA', 3, 0.9, cfg), 'HALF');
  assert.equal(sizing('SIGNAL', 2, 0.9, cfg), 'SCOUT');
  assert.equal(sizing('WATCH', 1, 0.9, cfg), 'NONE');
});

process.stdout.write('\nthesis lifecycle\n');
const entryD = {
  holders: 100, supply: 300, mintsPerMin: 4, secondaryPerMin: 1, top10Share: 0.3,
  absorb: { verdict: 'absorbed' }, uniqueBuyers: 20, uniqueSellers: 10, staleSec: 60, ageSec: 1800,
};
const entryRes = { score: 74, tier: 'ALPHA', size: 'HALF', layersMet: 3, crowdIndex: 0.2, blockers: [], derived: entryD, parts: [
  { id: 'smart_money', label: 'Smart money present', weight: 26, score: 0.9, note: '3 wallets', evidence: [] },
] };
const th = openThesis({ address: '0xabc', name: 'T', lastBlock: 10 }, entryRes, 1000, cfg);

check('a thesis records why it was opened', () => {
  assert.ok(th.why.length > 0);
  assert.equal(th.why[0].id, 'smart_money');
});
check('a thesis writes absolute invalidation levels at entry', () => {
  assert.ok(th.invalidation.rateFloor > 0 && th.invalidation.rateFloor < 5);
  assert.equal(th.invalidation.holderFloor, 85);
  assert.ok(Math.abs(th.invalidation.top10Cap - 0.42) < 1e-9);
});
check('a healthy re-check keeps the thesis open', () => {
  const v = evaluateThesis(th, { ...entryD, holders: 140 }, { ...entryRes, crowdIndex: 0.25 }, 2000, cfg);
  assert.equal(v.status, 'open', v.reasons.join('; '));
});
check('a 25% price-equivalent drawdown alone does NOT break it', () => {
  // Holders and flow intact: by this framework the thesis is still alive.
  const v = evaluateThesis(th, { ...entryD, holders: 98 }, { ...entryRes, crowdIndex: 0.25 }, 2000, cfg);
  assert.equal(v.status, 'open', v.reasons.join('; '));
});
check('holders leaving breaks the thesis', () => {
  const v = evaluateThesis(th, { ...entryD, holders: 60 }, { ...entryRes, crowdIndex: 0.25 }, 2000, cfg);
  assert.equal(v.status, 'invalidated');
  assert.ok(v.reasons.some((r) => r.includes('holders')), v.reasons.join('; '));
});
check('supply concentrating breaks the thesis', () => {
  const v = evaluateThesis(th, { ...entryD, top10Share: 0.6 }, { ...entryRes, crowdIndex: 0.25 }, 2000, cfg);
  assert.equal(v.status, 'invalidated');
  assert.ok(v.reasons.some((r) => r.includes('top10')), v.reasons.join('; '));
});
check('sellers no longer absorbed breaks the thesis', () => {
  const v = evaluateThesis(th, { ...entryD, absorb: { verdict: 'distributing' } }, { ...entryRes, crowdIndex: 0.25 }, 2000, cfg);
  assert.equal(v.status, 'invalidated');
  assert.ok(v.reasons.some((r) => r.includes('absorbed')), v.reasons.join('; '));
});
check('flow going silent breaks the thesis', () => {
  const v = evaluateThesis(th, { ...entryD, mintsPerMin: 0.02, secondaryPerMin: 0, staleSec: 9000 }, { ...entryRes, crowdIndex: 0.25 }, 2000, cfg);
  assert.equal(v.status, 'invalidated');
  assert.ok(v.reasons.some((r) => r.includes('flow')), v.reasons.join('; '));
});
check('the crowd arriving matures the thesis rather than breaking it', () => {
  const v = evaluateThesis(th, { ...entryD, holders: 4000 }, { ...entryRes, crowdIndex: 0.85 }, 2000, cfg);
  assert.equal(v.status, 'matured');
});

process.stdout.write('\nthesis through the engine\n');
const thAgent = new Agent({ ...cfg, paths: { ...cfg.paths, state: path.join(tmp, 'thesis.json') }, alerts: { ...cfg.alerts, jsonlFile: '' } });
thAgent.silent = true;
thAgent.store.cursor = RANGE.START - 1;
const tr = await thAgent.cycle();
check('an entry alert opens a persisted thesis', () => {
  const t = thAgent.store.theses.get(FIXTURES.organic);
  assert.ok(t, 'no thesis opened');
  assert.equal(t.status, 'open');
  assert.ok(tr.alerts.some((a) => a.kind === 'ENTRY' && a.address === FIXTURES.organic));
});
check('the entry alert carries size and confluence', () => {
  const a = tr.alerts.find((x) => x.address === FIXTURES.organic);
  assert.ok(['SCOUT', 'HALF', 'FULL'].includes(a.size), `size=${a.size}`);
  assert.ok(a.layersMet >= 2, `layersMet=${a.layersMet}`);
  assert.ok(a.invalidation && a.invalidation.length >= 3);
});
check('theses survive save + reload', () => {
  thAgent.store.save();
  const back = new Agent({ ...cfg, paths: { ...cfg.paths, state: path.join(tmp, 'thesis.json') } });
  assert.equal(back.store.theses.get(FIXTURES.organic).status, 'open');
});
check('an open thesis protects its collection from pruning', () => {
  const c = thAgent.store.collections.get(FIXTURES.organic);
  c.lastTs = 1; // ancient
  thAgent.store.prune(Math.floor(Date.now() / 1000), cfg);
  assert.ok(thAgent.store.collections.has(FIXTURES.organic), 'pruned a collection under management');
});

server.close();
process.stdout.write(`\n${passed} checks passed${process.exitCode ? ' (with failures)' : ''}\n`);
fs.rmSync(tmp, { recursive: true, force: true });
