// Smart-money registry. The single highest-signal input Hermes has: which
// wallets were early on things that later worked.

import fs from 'node:fs';
import path from 'node:path';
import { TOPIC } from './abi.js';
import { ZERO_TOPIC, topicToAddr, isAddr, lc, shortAddr } from './util.js';
import { isErc721Transfer, normalize } from './events.js';

export const TIER_WEIGHT = { S: 1.0, A: 0.65, B: 0.35 };

export class Wallets {
  constructor(file) {
    this.file = file;
    this.map = new Map(); // addr -> { tier, tags, note, hits, addedAt }
    this._info = new Map(); // addr -> { isContract, nonce }
    this.load();
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      for (const [addr, v] of Object.entries(raw.wallets || {})) this.map.set(lc(addr), v);
    } catch {
      /* first run — empty registry is fine */
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const wallets = Object.fromEntries([...this.map].sort((a, b) => (TIER_WEIGHT[b[1].tier] || 0) - (TIER_WEIGHT[a[1].tier] || 0)));
    fs.writeFileSync(this.file, JSON.stringify({ updatedAt: new Date().toISOString(), wallets }, null, 2));
  }

  add(addr, { tier = 'B', tags = [], note = '', hits = 1 } = {}) {
    if (!isAddr(addr)) throw new Error(`not an address: ${addr}`);
    const key = lc(addr);
    const prev = this.map.get(key);
    this.map.set(key, {
      tier: prev && TIER_WEIGHT[prev.tier] > TIER_WEIGHT[tier] ? prev.tier : tier,
      tags: [...new Set([...(prev?.tags || []), ...tags])],
      note: note || prev?.note || '',
      hits: Math.max(hits, prev?.hits || 0),
      addedAt: prev?.addedAt || new Date().toISOString(),
    });
    return this.map.get(key);
  }

  remove(addr) {
    return this.map.delete(lc(addr));
  }

  get(addr) {
    return this.map.get(lc(addr)) || null;
  }

  weight(addr) {
    const w = this.get(addr);
    return w ? TIER_WEIGHT[w.tier] ?? 0.2 : 0;
  }

  /** Cached wallet fingerprint, so repeated scans do not re-query the same EOAs. */
  async info(chain, addr) {
    const key = lc(addr);
    if (this._info.has(key)) return this._info.get(key);
    const v = await chain.walletInfo(key).catch(() => ({ address: key, isContract: false, nonce: null }));
    this._info.set(key, v);
    return v;
  }

  /**
   * Builds the registry from collections that already worked out.
   * Takes the first `earlyN` unique minters of each winner; wallets that show
   * up early across several winners are promoted — one hit is luck, three is edge.
   */
  async learn(rpc, winners, { earlyN = 60, fromBlock = 0, toBlock = 'latest', tags = [] } = {}) {
    const head = toBlock === 'latest' ? await rpc.blockNumber() : Number(toBlock);
    const tally = new Map(); // addr -> Set(collection)

    for (const addr of winners) {
      const logs = await rpc.getLogs({
        fromBlock: Number(fromBlock),
        toBlock: head,
        address: addr,
        topics: [[TOPIC.transfer, TOPIC.transferSingle, TOPIC.transferBatch]],
      });
      const evs = logs
        .filter((l) => isErc721Transfer(l) || l.topics[0] !== TOPIC.transfer)
        .flatMap(normalize)
        .filter((e) => e.kind === 'mint')
        .sort((a, b) => a.block - b.block || a.logIndex - b.logIndex);

      const seen = new Set();
      for (const e of evs) {
        if (seen.size >= earlyN) break;
        if (seen.has(e.to)) continue;
        seen.add(e.to);
        if (!tally.has(e.to)) tally.set(e.to, new Set());
        tally.get(e.to).add(addr.toLowerCase());
      }
      process.stderr.write(`  learned ${seen.size} early minters from ${shortAddr(addr)}\n`);
    }

    let added = 0;
    for (const [addr, cols] of tally) {
      const hits = cols.size;
      const tier = hits >= 3 ? 'S' : hits === 2 ? 'A' : 'B';
      // A single hit only earns a slot when we studied more than one winner —
      // otherwise the whole mint list would be "smart money".
      if (hits === 1 && winners.length > 1) continue;
      this.add(addr, { tier, tags: [...tags, 'learned'], hits, note: `early on ${hits} winner(s)` });
      added++;
    }
    this.save();
    return { scanned: winners.length, candidates: tally.size, added };
  }

  /** Which registry wallets touched this collection, and how heavily they weigh. */
  hitsIn(collection) {
    const hits = [];
    for (const [addr, m] of collection.minters) {
      const w = this.get(addr);
      if (w) hits.push({ addr, tier: w.tier, weight: TIER_WEIGHT[w.tier] ?? 0.2, mints: m.count, firstTs: m.firstTs, tags: w.tags });
    }
    return hits.sort((a, b) => b.weight - a.weight);
  }
}

export { topicToAddr, ZERO_TOPIC };
