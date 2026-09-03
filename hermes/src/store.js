// Durable state: scan cursor, tracked collections, alert log.
// Plain JSON with atomic writes — no database to install, easy to inspect.

import fs from 'node:fs';
import path from 'node:path';
import { Collection } from './collection.js';
import { isExpired } from './filters.js';

export class Store {
  constructor(file) {
    this.file = file;
    this.cursor = null;
    this.collections = new Map();
    this.alerts = [];
    this.meta = { createdAt: new Date().toISOString(), scans: 0 };
    this.load();
  }

  load() {
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      return;
    }
    this.cursor = raw.cursor ?? null;
    this.meta = raw.meta || this.meta;
    this.alerts = raw.alerts || [];
    for (const c of raw.collections || []) this.collections.set(c.address, Collection.revive(c));
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const payload = {
      cursor: this.cursor,
      meta: { ...this.meta, savedAt: new Date().toISOString() },
      collections: [...this.collections.values()].map((c) => c.toJSON()),
      alerts: this.alerts.slice(-500),
    };
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload));
    fs.renameSync(tmp, this.file); // atomic: a crash mid-write never truncates state
  }

  upsert(address, opts) {
    const key = address.toLowerCase();
    let c = this.collections.get(key);
    if (!c) {
      c = new Collection(key, opts);
      this.collections.set(key, c);
    }
    return c;
  }

  /** deployer/owner -> prior collections, feeds the deployer_pedigree signal. */
  ownerHistory() {
    const m = new Map();
    for (const c of this.collections.values()) {
      if (!c.owner) continue;
      if (!m.has(c.owner)) m.set(c.owner, []);
      m.get(c.owner).push({ address: c.address, peakScore: c.peakScore ?? c.lastScore?.score ?? 0 });
    }
    return m;
  }

  prune(nowTs, cfg) {
    let removed = 0;
    for (const [k, c] of this.collections) {
      if (isExpired(c, nowTs, cfg)) {
        this.collections.delete(k);
        removed++;
      }
    }
    const hard = cfg.filters?.maxTracked ?? 3000;
    if (this.collections.size > hard) {
      const sorted = [...this.collections.values()].sort((a, b) => (a.lastTs || 0) - (b.lastTs || 0));
      for (const c of sorted.slice(0, this.collections.size - hard)) {
        this.collections.delete(c.address);
        removed++;
      }
    }
    return removed;
  }

  recordAlert(a) {
    this.alerts.push(a);
  }
}
