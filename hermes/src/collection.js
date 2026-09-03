// The rolling state Hermes keeps for one candidate collection.
// Everything the signals read is derived from here, so this is the only place
// that knows how raw events turn into numbers.

import { gini, topShare, slope, ZERO } from './util.js';
import { velocityLadder, absorption } from './flow.js';

export class Collection {
  constructor(address, opts = {}) {
    this.address = address.toLowerCase();
    this.standard = opts.standard || null;
    this.name = opts.name || null;
    this.symbol = opts.symbol || null;
    this.owner = opts.owner || null;
    this.maxSupply = opts.maxSupply ?? null;
    this.mintPriceWei = opts.mintPriceWei ?? null;
    this.revealed = opts.revealed ?? null;

    this.firstBlock = null;
    this.firstTs = null;
    this.lastBlock = null;
    this.lastTs = null;

    this.mints = 0;
    this.burns = 0;
    this.secondary = 0;
    this.firstSecondaryTs = null;

    this.minters = new Map(); // addr -> { count, firstTs, firstBlock }
    this.holders = new Map(); // addr -> balance
    this.mintTxs = new Map(); // txHash -> { to, count, block }
    this.buckets = []; // see _bucket() for the shape
    this.history = []; // score-time snapshots, used for trend + thesis invalidation
    this.bucketSeconds = opts.bucketSeconds || 300;
    this.maxBuckets = opts.maxBuckets || 36;

    this.contractMinters = new Set(); // filled in later by the wallet enricher
    this.probedMinters = new Set(); // minters we already classified as EOA/contract
    this.flags = new Set();
    this.lastScore = null;
    this.peakScore = 0;
    this.alertedTier = null;
    this.alertedAt = null;
  }

  static revive(o) {
    const c = new Collection(o.address, o);
    Object.assign(c, o, {
      minters: new Map(o.minters || []),
      holders: new Map(o.holders || []),
      mintTxs: new Map(o.mintTxs || []),
      contractMinters: new Set(o.contractMinters || []),
      probedMinters: new Set(o.probedMinters || []),
      history: o.history || [],
      flags: new Set(o.flags || []),
    });
    return c;
  }

  toJSON() {
    return {
      ...this,
      // Cap the persisted maps: state files should stay small enough to reload fast.
      minters: [...this.minters].slice(-4000),
      holders: [...this.holders].filter(([, v]) => v > 0).slice(-4000),
      mintTxs: [...this.mintTxs].slice(-2000),
      contractMinters: [...this.contractMinters],
      probedMinters: [...this.probedMinters].slice(-2000),
      history: this.history.slice(-48),
      flags: [...this.flags],
    };
  }

  apply(ev, ts) {
    if (this.firstBlock == null || ev.block < this.firstBlock) {
      this.firstBlock = ev.block;
      this.firstTs = ts;
    }
    if (this.lastBlock == null || ev.block >= this.lastBlock) {
      this.lastBlock = ev.block;
      this.lastTs = ts;
    }
    if (!this.standard) this.standard = ev.standard;

    const b = this._bucket(ts);

    if (ev.kind === 'mint') {
      this.mints += ev.qty;
      b.mints += ev.qty;
      const m = this.minters.get(ev.to);
      if (m) {
        m.count += ev.qty;
      } else {
        this.minters.set(ev.to, { count: ev.qty, firstTs: ts, firstBlock: ev.block });
        b.newMinters += 1;
      }
      const tx = this.mintTxs.get(ev.txHash);
      if (tx) tx.count += ev.qty;
      else this.mintTxs.set(ev.txHash, { to: ev.to, count: ev.qty, block: ev.block });
      this._credit(ev.to, ev.qty);
    } else if (ev.kind === 'burn') {
      this.burns += ev.qty;
      this._credit(ev.from, -ev.qty);
    } else {
      this.secondary += ev.qty;
      b.secondary += ev.qty;
      if (this.firstSecondaryTs == null) this.firstSecondaryTs = ts;
      // Who is releasing supply, and who is taking it — the absorption question.
      const hadBefore = (this.holders.get(ev.to) || 0) > 0;
      this._credit(ev.from, -ev.qty);
      this._credit(ev.to, ev.qty);
      pushUniq(b.sellers, ev.from);
      pushUniq(b.buyers, ev.to);
      if (!hadBefore) b.newHolders += 1;
      if (!this.holders.has(ev.from)) b.exits += 1;
    }

    b.holders = this.holders.size;
  }

  _credit(addr, delta) {
    if (!addr || addr === ZERO) return;
    const next = (this.holders.get(addr) || 0) + delta;
    if (next <= 0) this.holders.delete(addr);
    else this.holders.set(addr, next);
  }

  _bucket(ts) {
    const t0 = Math.floor((ts ?? 0) / this.bucketSeconds) * this.bucketSeconds;
    const last = this.buckets[this.buckets.length - 1];
    if (last && last.t0 === t0) return last;
    const b = { t0, mints: 0, secondary: 0, newMinters: 0, newHolders: 0, exits: 0, holders: this.holders.size, buyers: [], sellers: [] };
    this.buckets.push(b);
    // Only the recent window matters — this is a momentum detector, not an archive.
    if (this.buckets.length > this.maxBuckets) this.buckets.splice(0, this.buckets.length - this.maxBuckets);
    return b;
  }

  /** Everything the signal layer consumes, computed once per scoring pass. */
  derive(nowTs) {
    const now = nowTs ?? this.lastTs ?? 0;
    const ageSec = this.firstTs ? Math.max(1, now - this.firstTs) : 1;
    const holderBalances = [...this.holders.values()];
    const uniqueMinters = this.minters.size;
    const supply = Math.max(1, this.mints - this.burns);

    // Mint rate over the recent buckets, and whether that rate is still climbing.
    const recent = this.buckets.slice(-8);
    const mintSeries = recent.map((b) => b.mints);
    const bucketsPerMin = this.bucketSeconds / 60;
    const mintsPerMin = recent.length ? mintSeries.reduce((a, b) => a + b, 0) / (recent.length * bucketsPerMin) : 0;
    const accel = slope(mintSeries) / bucketsPerMin;
    const early = this.buckets.slice(0, Math.max(1, this.buckets.length - 4));
    const baseline = early.length ? early.reduce((a, b) => a + b.mints, 0) / (early.length * bucketsPerMin) : 0;

    // Bulk minting: how much of supply came from wallets sweeping in one tx.
    let bulkMints = 0;
    let biggestTx = 0;
    for (const tx of this.mintTxs.values()) {
      if (tx.count > 1) bulkMints += tx.count;
      if (tx.count > biggestTx) biggestTx = tx.count;
    }

    const counts = [...this.minters.values()].map((m) => m.count);
    const ownerBal = this.owner ? this.holders.get(this.owner) || 0 : 0;

    // --- FLOW: is participation stepping up, and who absorbs the sellers? ---
    const secondaryPerMin = recent.length ? recent.reduce((a, b) => a + b.secondary, 0) / (recent.length * bucketsPerMin) : 0;
    const ladder = velocityLadder(this.buckets.slice(-9).map((b) => b.mints + b.secondary));

    const flowWindow = this.buckets.slice(-6);
    const buyers = new Set();
    const sellers = new Set();
    let sold = 0;
    for (const b of flowWindow) {
      for (const a of b.buyers || []) buyers.add(a);
      for (const a of b.sellers || []) sellers.add(a);
      sold += b.secondary || 0;
    }
    const holdersStart = flowWindow.length ? flowWindow[0].holders ?? this.holders.size : this.holders.size;
    const past = this.history.length ? this.history[Math.max(0, this.history.length - flowWindow.length)] : null;
    const absorb = absorption({
      buyers: buyers.size,
      sellers: sellers.size,
      holdersStart,
      holdersEnd: this.holders.size,
      sold,
      top10Start: past?.top10Share ?? null,
      top10End: topShare(holderBalances, 10),
    });

    return {
      ageSec,
      supply,
      mints: this.mints,
      burns: this.burns,
      secondary: this.secondary,
      uniqueMinters,
      holders: this.holders.size,
      mintsPerWallet: uniqueMinters ? this.mints / uniqueMinters : 0,
      uniqueRatio: this.mints ? uniqueMinters / this.mints : 0,
      mintsPerMin,
      baselineMintsPerMin: baseline,
      accelPerMin: accel,
      accelRatio: baseline > 0 ? mintsPerMin / baseline : mintsPerMin > 0 ? 3 : 0,
      bulkShare: this.mints ? bulkMints / this.mints : 0,
      biggestTxMints: biggestTx,
      contractMinterShare: this.probedMinters.size ? this.contractMinters.size / this.probedMinters.size : 0,
      minterProbeCoverage: uniqueMinters ? this.probedMinters.size / uniqueMinters : 0,
      mintersProbed: this.probedMinters.size,
      minterGini: gini(counts),
      holderGini: gini(holderBalances),
      top10Share: topShare(holderBalances, 10),
      top1Share: topShare(holderBalances, 1),
      ownerShare: ownerBal / supply,
      secondaryRatio: this.mints ? this.secondary / this.mints : 0,
      secondaryPerMin,
      ladder,
      absorb,
      uniqueBuyers: buyers.size,
      uniqueSellers: sellers.size,
      timeToFirstSecondary: this.firstSecondaryTs && this.firstTs ? this.firstSecondaryTs - this.firstTs : null,
      supplyFilled: this.maxSupply ? Number(this.maxSupply) > 0 ? supply / Number(this.maxSupply) : null : null,
      staleSec: this.lastTs ? Math.max(0, now - this.lastTs) : null,
    };
  }
}

function pushUniq(arr, addr) {
  if (!addr || arr.includes(addr)) return;
  arr.push(addr);
  if (arr.length > 400) arr.shift(); // buckets are minutes wide; this is plenty
}
