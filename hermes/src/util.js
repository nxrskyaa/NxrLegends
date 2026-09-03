// Small helpers. Zero dependencies on purpose — Hermes runs anywhere Node 20+ runs.

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const hex = (n) => '0x' + BigInt(n).toString(16);
export const toNum = (h) => (h == null ? null : Number(BigInt(h)));
export const toBig = (h) => (h == null ? null : BigInt(h));

export const ZERO = '0x0000000000000000000000000000000000000000';
export const ZERO_TOPIC = '0x' + '0'.repeat(64);

/** topic (32 bytes) -> checksum-less lowercase address */
export const topicToAddr = (t) => '0x' + t.slice(26).toLowerCase();
export const addrToTopic = (a) => '0x' + '0'.repeat(24) + a.replace(/^0x/, '').toLowerCase();
export const isAddr = (a) => typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a);
export const lc = (a) => (a || '').toLowerCase();

export const clamp01 = (x) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

/** Maps x into 0..1 with a soft knee: 0 at `lo`, ~0.63 at `mid`, saturating toward 1. */
export function ramp(x, lo, mid) {
  if (!Number.isFinite(x) || x <= lo) return 0;
  const k = Math.max(1e-9, mid - lo);
  return clamp01(1 - Math.exp(-(x - lo) / k));
}

/** Inverse ramp: 1 while x is small, decaying to 0 as x grows past `mid`. */
export const decay = (x, mid) => (Number.isFinite(x) && x > 0 ? clamp01(Math.exp(-x / Math.max(1e-9, mid))) : 1);

/** Bell curve — rewards values near `ideal`, punishes both extremes. */
export function bell(x, ideal, spread) {
  if (!Number.isFinite(x)) return 0;
  const d = (x - ideal) / Math.max(1e-9, spread);
  return clamp01(Math.exp(-0.5 * d * d));
}

/** Gini coefficient of a distribution (0 = perfectly flat, 1 = one holder owns everything). */
export function gini(values) {
  const v = values.filter((x) => x > 0).sort((a, b) => a - b);
  const n = v.length;
  if (n === 0) return 0;
  if (n === 1) return 1;
  const sum = v.reduce((a, b) => a + b, 0);
  if (sum === 0) return 0;
  let acc = 0;
  for (let i = 0; i < n; i++) acc += (i + 1) * v[i];
  return clamp01((2 * acc) / (n * sum) - (n + 1) / n);
}

/** Share of supply held by the top `k` holders. */
export function topShare(values, k) {
  const v = [...values].sort((a, b) => b - a);
  const sum = v.reduce((a, b) => a + b, 0);
  if (sum === 0) return 0;
  return v.slice(0, k).reduce((a, b) => a + b, 0) / sum;
}

/** Least-squares slope of y over evenly spaced x. Used for mint acceleration. */
export function slope(series) {
  const n = series.length;
  if (n < 2) return 0;
  const mx = (n - 1) / 2;
  const my = series.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - mx) * (series[i] - my);
    den += (i - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

export const pct = (x) => `${(x * 100).toFixed(1)}%`;
export const shortAddr = (a) => (isAddr(a) ? `${a.slice(0, 6)}…${a.slice(-4)}` : String(a));
export const nowSec = () => Math.floor(Date.now() / 1000);

export function fmtAge(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '?';
  if (sec < 90) return `${Math.round(sec)}s`;
  if (sec < 5400) return `${Math.round(sec / 60)}m`;
  if (sec < 172800) return `${Math.round(sec / 3600)}h`;
  return `${Math.round(sec / 86400)}d`;
}

/** Groups an array by a key function into a Map. */
export function groupBy(arr, fn) {
  const m = new Map();
  for (const item of arr) {
    const k = fn(item);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(item);
  }
  return m;
}

export function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
