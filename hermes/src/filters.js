// Hard gates. These run before scoring: anything that trips a disqualifier is
// never alerted, no matter how pretty its momentum looks.

import { pct } from './util.js';

export function disqualify(col, d, cfg) {
  const f = cfg.filters || {};
  const reasons = [];

  if (!col.standard && (f.requireKnownStandard ?? true)) reasons.push('not a recognised ERC-721/1155');
  if (d.uniqueMinters < (f.minUniqueMinters ?? 4)) reasons.push(`only ${d.uniqueMinters} unique minters`);
  if (d.mints < (f.minMints ?? 8)) reasons.push(`only ${d.mints} mints`);

  // One wallet took nearly everything: a self-mint, not a launch.
  if (d.uniqueMinters >= 3 && d.top1Share > (f.maxTop1Share ?? 0.8)) reasons.push(`top holder owns ${pct(d.top1Share)}`);
  if (d.ownerShare > (f.maxOwnerShare ?? 0.85)) reasons.push(`creator holds ${pct(d.ownerShare)}`);

  // Airdrop spam: enormous supply sprayed to wallets that never asked for it.
  if (d.supply > (f.maxSupply ?? 250000)) reasons.push(`supply ${d.supply} above cap`);
  if (d.mintsPerWallet > (f.maxMintsPerWallet ?? 60)) reasons.push(`${d.mintsPerWallet.toFixed(1)} mints per wallet`);

  // Almost every minter is a contract — bot theatre, no humans behind it.
  if (d.contractMinterShare > (f.maxContractMinterShare ?? 0.7) && d.mintersProbed >= 10) {
    reasons.push(`${pct(d.contractMinterShare)} of minters are contracts`);
  }

  if ((cfg.blocklist || []).includes(col.address)) reasons.push('blocklisted');
  if (col.owner && (cfg.blocklist || []).includes(col.owner)) reasons.push('blocklisted deployer');

  // Dead on arrival: no activity for a long while.
  if (d.staleSec != null && d.staleSec > (f.staleSec ?? 6 * 3600)) reasons.push(`idle for ${Math.round(d.staleSec / 60)}m`);

  return reasons;
}

/** Collections we can drop from memory entirely to keep the state file small. */
export function isExpired(col, nowTs, cfg) {
  const ttl = cfg.filters?.forgetAfterSec ?? 3 * 86400;
  return col.lastTs != null && nowTs - col.lastTs > ttl && (col.lastScore?.score ?? 0) < (cfg.tiers?.watch ?? 42);
}
