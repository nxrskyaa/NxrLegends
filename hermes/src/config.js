// Config loading. Everything tunable lives here so thresholds can be changed
// without touching code — the defaults are a starting point, not gospel.

import fs from 'node:fs';
import path from 'node:path';

export const DEFAULTS = {
  chain: {
    name: 'Robinhood Chain',
    rpcUrl: '',
    headers: {},
    chainId: null,
    explorerTx: 'https://robinscan.io/tx/',
    explorerAddress: 'https://robinscan.io/address/',
    marketplaceCollection: '',
  },
  scan: {
    confirmations: 2,
    maxLogRange: 2000,
    maxBlocksPerCycle: 5000,
    intervalSec: 45,
    startBlock: null, // null = start `lookbackBlocks` behind head
    lookbackBlocks: 3000,
    rps: 8,
    batchSize: 20,
    enrichTopN: 40, // how many candidates get contract/wallet probing per cycle
    maxMinterProbes: 240, // eth_getCode budget per cycle for EOA-vs-contract checks (batched)
    maxNewAddressFollowUp: 300, // freshly discovered collections we re-query for secondary flow
    maxTimestampFetch: 200, // block timestamps fetched per cycle before interpolating
    addressBatch: 100,
    bucketSeconds: 300,
  },
  tiers: { watch: 42, signal: 55, alpha: 68, urgent: 80 },
  weights: {}, // per-signal overrides, e.g. { "smart_money": 34 }
  signals: {
    smartMoneyMid: 1.6,
    minMintsForRate: 5,
    mintsPerMinMid: 4,
    accelRatioMid: 2.2,
    idealMintsPerWallet: 1.7,
    minMinterProbes: 10,
    bulkShareMid: 0.3,
    idealSecondaryRatio: 0.18,
    quickSecondarySec: 2700,
    freshSec: 3600,
    scarceSupplyMid: 4000,
    crowdHolderMid: 900,
    crowdAgeSec: 21600,
    stealthFloor: 0.35,
    stealthPeak: 1.15,
  },
  filters: {
    requireKnownStandard: true,
    minUniqueMinters: 4,
    minMints: 8,
    maxTop1Share: 0.8,
    maxOwnerShare: 0.85,
    maxSupply: 250000,
    maxMintsPerWallet: 60,
    maxContractMinterShare: 0.7,
    staleSec: 21600,
    forgetAfterSec: 259200,
    maxTracked: 3000,
  },
  alerts: {
    minTier: 'SIGNAL',
    reAlertOnUpgrade: true,
    cooldownSec: 1800,
    webhookUrl: '',
    discordWebhookUrl: '',
    telegram: { botToken: '', chatId: '' },
    jsonlFile: 'state/alerts.jsonl',
  },
  blocklist: [],
  paths: { state: 'state/hermes-state.json', wallets: 'state/wallets.json' },
};

function deepMerge(base, over) {
  if (Array.isArray(over)) return over;
  if (over == null || typeof over !== 'object') return over === undefined ? base : over;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = k in base && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k]) ? deepMerge(base[k], v) : v;
  }
  return out;
}

export function loadConfig(file) {
  const p = path.resolve(file || process.env.HERMES_CONFIG || 'hermes.config.json');
  let user = {};
  if (fs.existsSync(p)) {
    user = JSON.parse(fs.readFileSync(p, 'utf8'));
  }
  const cfg = deepMerge(DEFAULTS, user);

  // Env overrides — handy for servers and CI where a config file is awkward.
  if (process.env.HERMES_RPC_URL) cfg.chain.rpcUrl = process.env.HERMES_RPC_URL;
  if (process.env.HERMES_DISCORD_WEBHOOK) cfg.alerts.discordWebhookUrl = process.env.HERMES_DISCORD_WEBHOOK;
  if (process.env.HERMES_WEBHOOK) cfg.alerts.webhookUrl = process.env.HERMES_WEBHOOK;
  if (process.env.HERMES_TELEGRAM_TOKEN) cfg.alerts.telegram.botToken = process.env.HERMES_TELEGRAM_TOKEN;
  if (process.env.HERMES_TELEGRAM_CHAT) cfg.alerts.telegram.chatId = process.env.HERMES_TELEGRAM_CHAT;

  cfg.__file = p;
  cfg.blocklist = (cfg.blocklist || []).map((a) => a.toLowerCase());
  return cfg;
}
