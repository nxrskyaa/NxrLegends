// Minimal JSON-RPC client: rate limited, retrying, batching, and able to
// survive the per-request log-range limits every public endpoint imposes.

import { sleep } from './util.js';

const RANGE_ERROR = /(range|limit|too many|exceed|more than|block range|response size|larger than)/i;

export class Rpc {
  constructor(opts = {}) {
    this.url = opts.url;
    this.headers = opts.headers || {};
    this.timeoutMs = opts.timeoutMs ?? 20000;
    this.maxRetries = opts.maxRetries ?? 4;
    this.batchSize = opts.batchSize ?? 20;
    this.minIntervalMs = opts.rps ? Math.ceil(1000 / opts.rps) : 60;
    this.maxLogRange = opts.maxLogRange ?? 2000;
    this._last = 0;
    this._queue = Promise.resolve();
    this.stats = { calls: 0, retries: 0, errors: 0 };
    if (!this.url) throw new Error('rpc.url is required (set it in hermes.config.json)');
  }

  /** Serializes requests and spaces them out so we never trip endpoint rate limits. */
  _throttle() {
    this._queue = this._queue.then(async () => {
      const wait = this.minIntervalMs - (Date.now() - this._last);
      if (wait > 0) await sleep(wait);
      this._last = Date.now();
    });
    return this._queue;
  }

  async _post(payload) {
    await this._throttle();
    let lastErr;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), this.timeoutMs);
      try {
        this.stats.calls++;
        const res = await fetch(this.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...this.headers },
          body: JSON.stringify(payload),
          signal: ac.signal,
        });
        if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
        if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
        return await res.json();
      } catch (e) {
        lastErr = e;
        this.stats.retries++;
        if (attempt < this.maxRetries) await sleep(400 * 2 ** attempt + Math.random() * 200);
      } finally {
        clearTimeout(timer);
      }
    }
    this.stats.errors++;
    throw lastErr;
  }

  async send(method, params = []) {
    const out = await this._post({ jsonrpc: '2.0', id: 1, method, params });
    if (out.error) throw new Error(`${method}: ${out.error.message || JSON.stringify(out.error)}`);
    return out.result;
  }

  /**
   * Batched calls. Returns results positionally; failed entries come back as
   * `{ __error }` rather than throwing, so one bad contract cannot kill a sweep.
   */
  async batch(calls) {
    const results = new Array(calls.length);
    for (let i = 0; i < calls.length; i += this.batchSize) {
      const slice = calls.slice(i, i + this.batchSize);
      const payload = slice.map((c, j) => ({ jsonrpc: '2.0', id: i + j, method: c.method, params: c.params || [] }));
      let out;
      try {
        out = await this._post(payload);
      } catch (e) {
        for (let j = 0; j < slice.length; j++) results[i + j] = { __error: String(e.message || e) };
        continue;
      }
      const byId = new Map((Array.isArray(out) ? out : [out]).map((r) => [r.id, r]));
      for (let j = 0; j < slice.length; j++) {
        const r = byId.get(i + j);
        results[i + j] = !r ? { __error: 'no response' } : r.error ? { __error: r.error.message } : r.result;
      }
    }
    return results;
  }

  async blockNumber() {
    return Number(BigInt(await this.send('eth_blockNumber')));
  }

  async getBlock(n, withTxs = false) {
    return this.send('eth_getBlockByNumber', ['0x' + Number(n).toString(16), withTxs]);
  }

  async call(to, data, block = 'latest') {
    try {
      return await this.send('eth_call', [{ to, data }, block]);
    } catch {
      return null; // reverts are expected when probing unknown contracts
    }
  }

  async getCode(addr) {
    return this.send('eth_getCode', [addr, 'latest']);
  }

  async getTxCount(addr) {
    return Number(BigInt(await this.send('eth_getTransactionCount', [addr, 'latest'])));
  }

  async getTx(hash) {
    return this.send('eth_getTransactionByHash', [hash]);
  }

  /**
   * eth_getLogs that never gives up: it halves the block range whenever the
   * endpoint complains about size, and walks the range in maxLogRange chunks.
   */
  async getLogs({ fromBlock, toBlock, address, topics }) {
    const out = [];
    let cursor = fromBlock;
    while (cursor <= toBlock) {
      const end = Math.min(toBlock, cursor + this.maxLogRange - 1);
      const part = await this._getLogsRange(cursor, end, address, topics, 0);
      out.push(...part);
      cursor = end + 1;
    }
    return out;
  }

  async _getLogsRange(from, to, address, topics, depth) {
    const filter = { fromBlock: '0x' + from.toString(16), toBlock: '0x' + to.toString(16) };
    if (address) filter.address = address;
    if (topics) filter.topics = topics;
    try {
      return await this.send('eth_getLogs', [filter]);
    } catch (e) {
      const msg = String(e.message || e);
      if (from < to && depth < 12 && (RANGE_ERROR.test(msg) || /-32005|-32602|413/.test(msg))) {
        const mid = Math.floor((from + to) / 2);
        const a = await this._getLogsRange(from, mid, address, topics, depth + 1);
        const b = await this._getLogsRange(mid + 1, to, address, topics, depth + 1);
        return [...a, ...b];
      }
      throw e;
    }
  }
}
