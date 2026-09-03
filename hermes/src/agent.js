// Hermes: the scan engine. One `cycle()` walks a block range, folds every NFT
// movement into collection state, enriches the promising ones, scores them and
// fires alerts. `watch()` just runs cycles forever.

import { Rpc } from './rpc.js';
import { Chain } from './chain.js';
import { Store } from './store.js';
import { Wallets } from './wallets.js';
import { MINT_FILTERS, ALL_TRANSFER_TOPICS, normalize, isErc721Transfer } from './events.js';
import { TOPIC } from './abi.js';
import { scoreCollection, TIER_ORDER } from './score.js';
import { openThesis, evaluateThesis } from './thesis.js';
import { buildAlert, dispatch, meetsTier, colors as C } from './notify.js';
import { chunk, sleep, groupBy, nowSec } from './util.js';

export class Agent {
  constructor(cfg) {
    this.cfg = cfg;
    this.rpc = new Rpc({
      url: cfg.chain.rpcUrl,
      headers: cfg.chain.headers,
      rps: cfg.scan.rps,
      batchSize: cfg.scan.batchSize,
      maxLogRange: cfg.scan.maxLogRange,
    });
    this.chain = new Chain(this.rpc);
    this.store = new Store(cfg.paths.state);
    this.wallets = new Wallets(cfg.paths.wallets);
    this.running = false;
    this.silent = false; // backtests reuse the engine but must not fire alerts
  }

  log(msg) {
    process.stderr.write(`${C.dim}${new Date().toISOString().slice(11, 19)}${C.reset} ${msg}\n`);
  }

  /** Resolves the block window for this cycle, or null when we are caught up. */
  async window() {
    const head = (await this.rpc.blockNumber()) - (this.cfg.scan.confirmations ?? 2);
    let from = this.store.cursor != null ? this.store.cursor + 1 : this.cfg.scan.startBlock ?? head - (this.cfg.scan.lookbackBlocks ?? 3000);
    if (from < 0) from = 0;
    if (from > head) return null;
    const to = Math.min(head, from + (this.cfg.scan.maxBlocksPerCycle ?? 5000) - 1);
    return { from, to, head };
  }

  /**
   * Timestamps for the blocks we saw events in. Fetching every block is the
   * expensive part of a sweep, so past a cap we interpolate from anchors —
   * good enough for rate metrics measured in minutes.
   */
  async blockTimes(blocks) {
    const uniq = [...new Set(blocks)].sort((a, b) => a - b);
    const out = new Map();
    const cap = this.cfg.scan.maxTimestampFetch ?? 200;
    const target = uniq.length <= cap ? uniq : [uniq[0], uniq[uniq.length - 1], ...uniq.filter((_, i) => i % Math.ceil(uniq.length / cap) === 0)];

    const need = [...new Set(target)].filter((b) => !this.chain._blockTs.has(b));
    const res = await this.rpc.batch(need.map((b) => ({ method: 'eth_getBlockByNumber', params: ['0x' + b.toString(16), false] })));
    res.forEach((r, i) => {
      const ts = r && r.timestamp ? Number(BigInt(r.timestamp)) : null;
      if (ts) this.chain._blockTs.set(need[i], ts);
    });

    const anchors = uniq.filter((b) => this.chain._blockTs.has(b));
    for (const b of uniq) {
      if (this.chain._blockTs.has(b)) {
        out.set(b, this.chain._blockTs.get(b));
        continue;
      }
      out.set(b, interpolate(b, anchors, this.chain._blockTs));
    }
    return out;
  }

  async fetchLogs(from, to) {
    const seen = new Set();
    const logs = [];
    const push = (arr) => {
      for (const l of arr) {
        const k = `${l.blockNumber}:${l.transactionHash}:${l.logIndex}`;
        if (seen.has(k)) continue;
        seen.add(k);
        logs.push(l);
      }
    };
    const byAddress = async (addrs) => {
      for (const group of chunk(addrs, this.cfg.scan.addressBatch ?? 100)) {
        push(await this.rpc.getLogs({ fromBlock: from, toBlock: to, address: group, topics: ALL_TRANSFER_TOPICS }));
      }
    };

    // 1) Every mint on the chain — this is how new collections are discovered.
    for (const f of MINT_FILTERS) {
      push(await this.rpc.getLogs({ fromBlock: from, toBlock: to, topics: f.topics }));
    }

    // 2) All movement on collections we already track, so secondary flow and
    //    burns get counted too (a topic filter cannot express "from != 0").
    await byAddress([...this.store.collections.keys()]);

    // 3) Collections discovered *in this very range* would otherwise contribute
    //    mints only: step 2 could not know about them yet. Go back for their
    //    non-mint history, but only for the ones that minted enough to matter.
    const known = new Set(this.store.collections.keys());
    const mintTally = new Map();
    for (const l of logs) {
      const a = (l.address || '').toLowerCase();
      if (known.has(a)) continue;
      mintTally.set(a, (mintTally.get(a) || 0) + 1);
    }
    const minMints = this.cfg.filters?.minMints ?? 8;
    const fresh = [...mintTally]
      .filter(([, n]) => n >= minMints)
      .sort((a, b) => b[1] - a[1])
      .slice(0, this.cfg.scan.maxNewAddressFollowUp ?? 300)
      .map(([a]) => a);
    if (fresh.length) await byAddress(fresh);

    return logs;
  }

  async cycle() {
    const win = await this.window();
    if (!win) return { skipped: true, reason: 'caught up' };
    const { from, to } = win;

    const rawLogs = await this.fetchLogs(from, to);
    const events = rawLogs
      .filter((l) => (l.topics?.[0] === TOPIC.transfer ? isErc721Transfer(l) : true))
      .flatMap(normalize);

    const times = await this.blockTimes(events.map((e) => e.block));
    const byAddr = groupBy(events, (e) => e.address);

    for (const [addr, evs] of byAddr) {
      const col = this.store.upsert(addr, { bucketSeconds: this.cfg.scan.bucketSeconds ?? 300 });
      evs.sort((a, b) => a.block - b.block || a.logIndex - b.logIndex);
      for (const e of evs) col.apply(e, times.get(e.block) ?? nowSec());
    }

    const touched = [...byAddr.keys()].map((a) => this.store.collections.get(a)).filter(Boolean);
    await this.enrich(touched);

    const results = await this.scoreAll(touched);

    // Open theses are re-tested every cycle even when the collection saw no
    // events this range — a thesis dies of silence as readily as of bad news.
    const managed = new Set(touched.map((c) => c.address));
    const idle = [...this.store.theses.values()]
      .filter((t) => t.status === 'open' && !managed.has(t.address))
      .map((t) => this.store.collections.get(t.address))
      .filter(Boolean);
    const idleResults = idle.length ? await this.scoreAll(idle) : [];

    const alerts = await this.manage([...results, ...idleResults], nowSec());

    this.store.cursor = to;
    this.store.meta.scans = (this.store.meta.scans || 0) + 1;
    this.store.meta.head = win.head;
    const pruned = this.store.prune(nowSec(), this.cfg);
    this.store.save();

    return { from, to, head: win.head, logs: rawLogs.length, events: events.length, touched: touched.length, tracked: this.store.collections.size, alerts, pruned, results };
  }

  /**
   * Contract probing is rate-limit expensive, so it is reserved for the
   * candidates that actually look like launches: most mint spam never gets here.
   */
  async enrich(collections) {
    const needProbe = collections.filter((c) => !c.probed).sort((a, b) => b.mints - a.mints).slice(0, this.cfg.scan.enrichTopN ?? 40);

    for (const col of needProbe) {
      const info = await this.chain.probe(col.address).catch(() => null);
      col.probed = true;
      if (!info) {
        col.flags.add('no-code');
        continue;
      }
      col.standard = info.standard || col.standard;
      col.name = info.name;
      col.symbol = info.symbol;
      col.owner = info.owner;
      col.codeSize = info.codeSize;
      col.maxSupply = info.maxSupply != null ? Number(info.maxSupply) : null;
      col.mintPriceWei = info.mintPrice != null ? info.mintPrice.toString() : null;
      if (info.standard) {
        const meta = await this.chain.tokenUri(col.address, info.standard).catch(() => null);
        col.revealed = meta ? meta.revealed : null;
        col.tokenUri = meta?.uri ? String(meta.uri).slice(0, 200) : null;
      }
    }

    // Classify minters as EOA vs contract. Budget is shared round-robin across
    // candidates — draining it on the single biggest collection would leave
    // every other one looking falsely clean.
    const budget = this.cfg.scan.maxMinterProbes ?? 240;
    const queues = collections
      .map((col) => ({ col, pending: [...col.minters.keys()].filter((a) => !col.probedMinters.has(a)) }))
      .filter((q) => q.pending.length);

    const picked = [];
    for (let round = 0; picked.length < budget; round++) {
      let advanced = false;
      for (const q of queues) {
        if (picked.length >= budget) break;
        const addr = q.pending[round];
        if (!addr) continue;
        advanced = true;
        picked.push({ col: q.col, addr });
      }
      if (!advanced) break;
    }

    if (picked.length) {
      const cached = picked.filter((p) => this.wallets._info.has(p.addr));
      const fresh = picked.filter((p) => !this.wallets._info.has(p.addr));
      const codes = fresh.length ? await this.chain.areContracts(fresh.map((p) => p.addr)) : new Map();
      for (const p of fresh) {
        const isContract = codes.get(p.addr);
        if (isContract === undefined) continue; // probe failed — retry next cycle
        this.wallets._info.set(p.addr, { address: p.addr, isContract, nonce: null });
      }
      for (const p of [...cached, ...fresh]) {
        const info = this.wallets._info.get(p.addr);
        if (!info) continue;
        p.col.probedMinters.add(p.addr);
        if (info.isContract) p.col.contractMinters.add(p.addr);
      }
    }
  }

  async scoreAll(collections) {
    const history = this.store.ownerHistory();
    const out = [];
    for (const col of collections) {
      const d = col.derive(nowSec());
      const result = await scoreCollection({ col, d, wallets: this.wallets, chain: this.chain, cfg: this.cfg, history });
      col.lastScore = { score: result.score, tier: result.tier, at: result.at };
      col.peakScore = Math.max(col.peakScore || 0, result.score);
      // Trend memory: what absorption and distribution are measured against.
      col.history.push({
        t: nowSec(),
        score: result.score,
        holders: d.holders,
        top10Share: d.top10Share,
        ratePerMin: d.mintsPerMin + d.secondaryPerMin,
      });
      if (col.history.length > 48) col.history.shift();
      out.push({ col, result });
    }
    return out.sort((a, b) => b.result.score - a.result.score);
  }

  /**
   * The MANAGE layer. An alert is not the end of the job: every call opens a
   * thesis with explicit invalidation conditions, and every later cycle
   * re-tests it. Collections leave with a reason, not by going quiet.
   */
  async manage(results, nowTs) {
    const minTier = this.cfg.alerts.minTier || 'SIGNAL';
    const reopen = (this.cfg.thesis?.reopenCooldownSec ?? 7200) * 1000;
    const fired = [];

    const emit = async (col, result, extra) => {
      const alert = buildAlert(col, result, this.cfg, extra);
      if (!this.silent) await dispatch(alert, this.cfg);
      this.store.recordAlert(alert);
      fired.push(alert);
    };

    for (const { col, result } of results) {
      const th = this.store.theses.get(col.address);

      if (th && th.status === 'open') {
        th.checks++;
        const verdict = evaluateThesis(th, result.derived, result, nowTs, this.cfg);

        if (verdict.status !== 'open') {
          th.status = verdict.status;
          th.closedAt = nowTs;
          th.closeReason = verdict.reasons;
          await emit(col, result, { kind: verdict.status === 'matured' ? 'MATURED' : 'INVALIDATED', reasons: verdict.reasons, thesis: th });
          continue;
        }

        // Still valid, and the evidence got stronger — worth saying once.
        const upgraded = TIER_ORDER.indexOf(result.tier) > TIER_ORDER.indexOf(th.tier);
        if (upgraded && this.cfg.alerts.reAlertOnUpgrade) {
          th.tier = result.tier;
          th.size = result.size;
          th.score = result.score;
          await emit(col, result, { kind: 'UPGRADE', thesis: th });
        }
        continue;
      }

      if (!meetsTier(result.tier, minTier)) continue;
      // Don't walk straight back into something that just invalidated.
      if (th && th.closedAt && Date.now() - th.closedAt * 1000 < reopen) continue;

      const opened = openThesis(col, result, nowTs, this.cfg);
      this.store.theses.set(col.address, opened);
      col.alertedTier = result.tier;
      col.alertedAt = Date.now();
      await emit(col, result, { kind: 'ENTRY', thesis: opened });
    }

    return fired;
  }

  async watch({ once = false } = {}) {
    this.running = true;
    const stop = () => {
      this.log('shutting down, saving state…');
      this.running = false;
      this.store.save();
      process.exit(0);
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);

    while (this.running) {
      const t0 = Date.now();
      try {
        const r = await this.cycle();
        if (r.skipped) this.log(`caught up at block ${this.store.cursor}`);
        else
          this.log(
            `blocks ${r.from}–${r.to} (head ${r.head}) · ${r.events} events · ${r.touched} active · ${r.tracked} tracked · ${r.alerts.length} alert(s) · ${Date.now() - t0}ms`
          );
      } catch (e) {
        this.log(`${C.red}cycle failed:${C.reset} ${e.message}`);
        await sleep(5000);
      }
      if (once) break;
      await sleep((this.cfg.scan.intervalSec ?? 45) * 1000);
    }
  }
}

function interpolate(block, anchors, tsMap) {
  if (anchors.length === 0) return nowSec();
  if (anchors.length === 1) return tsMap.get(anchors[0]);
  let lo = anchors[0];
  let hi = anchors[anchors.length - 1];
  for (const a of anchors) {
    if (a <= block) lo = a;
    if (a >= block) { hi = a; break; }
  }
  const tLo = tsMap.get(lo);
  const tHi = tsMap.get(hi);
  if (lo === hi || tLo == null || tHi == null) return tLo ?? tHi ?? nowSec();
  return Math.round(tLo + ((tHi - tLo) * (block - lo)) / (hi - lo));
}
