#!/usr/bin/env node
// Hermes CLI.

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { loadConfig, DEFAULTS } from './config.js';
import { Agent } from './agent.js';
import { backtest, renderBacktest } from './backtest.js';
import { scoreCollection } from './score.js';
import { colors as C } from './notify.js';
import { nowSec, shortAddr, pct, fmtAge, isAddr } from './util.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, inline] = a.slice(2).split('=');
      if (inline !== undefined) out[k] = inline;
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) out[k] = argv[++i];
      else out[k] = true;
    } else out._.push(a);
  }
  return out;
}

const USAGE = `
${C.bold}Hermes${C.reset} — NFT alpha detection agent for Robinhood Chain

  hermes init                          write a starter hermes.config.json
  hermes doctor                        check RPC connectivity and chain head
  hermes scan [--once]                 run a single scan cycle
  hermes watch                         run continuously (the normal mode)
  hermes top [--n 20] [--tier WATCH]   ranked candidates from current state
  hermes inspect <address>             full score breakdown for one collection
  hermes wallets list                  show the smart-money registry
  hermes wallets add <addr> [--tier S|A|B] [--note "..."]
  hermes wallets remove <addr>
  hermes wallets learn <winner...> [--early 60] [--from 0]
                                       build the registry from collections that already worked
  hermes backtest --from N --to N [--cycle 500] [--horizon 5000] [--tier SIGNAL] [--target 3]
  hermes serve [--port 8787]           dashboard + JSON API over the local state

  global: --config path/to/hermes.config.json
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0] || 'help';

  if (cmd === 'help' || args.help) {
    process.stdout.write(USAGE);
    return;
  }

  if (cmd === 'init') {
    const target = path.resolve(args.config || 'hermes.config.json');
    if (fs.existsSync(target) && !args.force) {
      process.stderr.write(`${target} already exists (use --force to overwrite)\n`);
      process.exit(1);
    }
    const seed = JSON.parse(JSON.stringify(DEFAULTS));
    delete seed.__file;
    seed.chain.rpcUrl = seed.chain.rpcUrl || 'https://<your-robinhood-chain-rpc>';
    fs.writeFileSync(target, JSON.stringify(seed, null, 2));
    process.stdout.write(`wrote ${target}\nSet chain.rpcUrl, then run: hermes doctor\n`);
    return;
  }

  const cfg = loadConfig(args.config);

  if (cmd === 'doctor') {
    process.stdout.write(`config      ${cfg.__file}${fs.existsSync(cfg.__file) ? '' : ' (missing — using defaults)'}\n`);
    process.stdout.write(`rpc         ${cfg.chain.rpcUrl || C.red + 'NOT SET' + C.reset}\n`);
    if (!cfg.chain.rpcUrl) {
      process.stderr.write('\nSet chain.rpcUrl in your config (or HERMES_RPC_URL) and re-run.\n');
      process.exit(1);
    }
    const agent = new Agent(cfg);
    const t0 = Date.now();
    const head = await agent.rpc.blockNumber();
    const block = await agent.rpc.getBlock(head);
    const chainId = await agent.rpc.send('eth_chainId').catch(() => null);
    process.stdout.write(`chainId     ${chainId ? Number(BigInt(chainId)) : '?'}\n`);
    process.stdout.write(`head        ${head} (${fmtAge(nowSec() - Number(BigInt(block.timestamp)))} old)\n`);
    process.stdout.write(`latency     ${Date.now() - t0}ms\n`);
    process.stdout.write(`state       ${cfg.paths.state} (${agent.store.collections.size} collections, cursor ${agent.store.cursor ?? '—'})\n`);
    process.stdout.write(`wallets     ${cfg.paths.wallets} (${agent.wallets.map.size} tracked)\n`);
    if (agent.wallets.map.size === 0) {
      process.stdout.write(`\n${C.yellow}Note:${C.reset} the smart-money registry is empty, so the strongest signal is\n`);
      process.stdout.write(`disabled. Seed it with:  hermes wallets learn <past-winner-address> …\n`);
    }
    return;
  }

  requireRpc(cfg);

  if (cmd === 'scan') {
    const agent = new Agent(cfg);
    const r = await agent.cycle();
    if (r.skipped) process.stdout.write('caught up — nothing new\n');
    else {
      process.stdout.write(
        `blocks ${r.from}–${r.to} · ${r.logs} logs · ${r.events} events · ${r.touched} active · ${r.tracked} tracked · ${r.alerts.length} alert(s)\n`
      );
      printTop(r.results.slice(0, Number(args.n || 10)));
    }
    return;
  }

  if (cmd === 'watch') {
    const agent = new Agent(cfg);
    agent.log(`Hermes watching ${cfg.chain.name} every ${cfg.scan.intervalSec}s · alert tier ≥ ${cfg.alerts.minTier}`);
    await agent.watch({ once: !!args.once });
    return;
  }

  if (cmd === 'top') {
    const agent = new Agent(cfg);
    const minTier = String(args.tier || 'WATCH').toUpperCase();
    const rows = await agent.scoreAll([...agent.store.collections.values()]);
    const order = ['NOISE', 'WATCH', 'SIGNAL', 'ALPHA', 'URGENT'];
    printTop(rows.filter((r) => order.indexOf(r.result.tier) >= order.indexOf(minTier)).slice(0, Number(args.n || 20)));
    return;
  }

  if (cmd === 'inspect') {
    const addr = (args._[1] || '').toLowerCase();
    if (!isAddr(addr)) {
      process.stderr.write('usage: hermes inspect <0xaddress>\n');
      process.exit(1);
    }
    const agent = new Agent(cfg);
    const col = agent.store.collections.get(addr);
    if (!col) {
      process.stderr.write(`${addr} is not in state yet — run a scan that covers its mints first\n`);
      process.exit(1);
    }
    await agent.enrich([col]);
    const d = col.derive(nowSec());
    const result = await scoreCollection({ col, d, wallets: agent.wallets, chain: agent.chain, cfg, history: agent.store.ownerHistory() });
    printInspect(col, result, cfg);
    agent.store.save();
    return;
  }

  if (cmd === 'wallets') {
    const agent = new Agent(cfg);
    const sub = args._[1] || 'list';

    if (sub === 'list') {
      if (agent.wallets.map.size === 0) process.stdout.write('registry is empty\n');
      for (const [addr, w] of agent.wallets.map) {
        process.stdout.write(`${w.tier}  ${addr}  hits=${w.hits ?? 1}  ${w.tags?.join(',') || ''}  ${w.note || ''}\n`);
      }
      return;
    }
    if (sub === 'add') {
      const w = agent.wallets.add(args._[2], { tier: String(args.tier || 'B').toUpperCase(), note: args.note || '', tags: args.tags ? String(args.tags).split(',') : [] });
      agent.wallets.save();
      process.stdout.write(`added ${args._[2]} as ${w.tier}\n`);
      return;
    }
    if (sub === 'remove') {
      agent.wallets.remove(args._[2]);
      agent.wallets.save();
      process.stdout.write(`removed ${args._[2]}\n`);
      return;
    }
    if (sub === 'learn') {
      const winners = args._.slice(2).filter(isAddr);
      if (!winners.length) {
        process.stderr.write('usage: hermes wallets learn <winner-collection-address> [more…]\n');
        process.exit(1);
      }
      process.stdout.write(`learning early minters from ${winners.length} winner collection(s)…\n`);
      const r = await agent.wallets.learn(agent.rpc, winners, { earlyN: Number(args.early || 60), fromBlock: Number(args.from || 0) });
      process.stdout.write(`scanned ${r.scanned}, ${r.candidates} candidate wallets, ${r.added} added to registry\n`);
      return;
    }
    process.stderr.write(`unknown wallets subcommand: ${sub}\n`);
    process.exit(1);
  }

  if (cmd === 'backtest') {
    if (!args.from || !args.to) {
      process.stderr.write('usage: hermes backtest --from <block> --to <block>\n');
      process.exit(1);
    }
    const res = await backtest(cfg, {
      from: Number(args.from),
      to: Number(args.to),
      cycleBlocks: Number(args.cycle || 500),
      horizonBlocks: Number(args.horizon || 5000),
      minTier: String(args.tier || 'SIGNAL').toUpperCase(),
      target: Number(args.target || 3),
    });
    process.stdout.write(renderBacktest(res) + '\n');
    if (args.json) fs.writeFileSync(String(args.json), JSON.stringify(res, null, 2));
    return;
  }

  if (cmd === 'serve') {
    await serve(cfg, Number(args.port || 8787));
    return;
  }

  process.stderr.write(`unknown command: ${cmd}\n${USAGE}`);
  process.exit(1);
}

function requireRpc(cfg) {
  if (!cfg.chain.rpcUrl) {
    process.stderr.write(`${C.red}chain.rpcUrl is not set.${C.reset} Run \`hermes init\`, fill it in, then \`hermes doctor\`.\n`);
    process.exit(1);
  }
}

function printTop(rows) {
  if (!rows.length) {
    process.stdout.write('nothing to show yet\n');
    return;
  }
  process.stdout.write(`\n${C.dim}  TIER    SCORE  COLLECTION                      MINTS  MINTRS  HOLD   /MIN  CROWD  AGE${C.reset}\n`);
  for (const { col, result } of rows) {
    const d = result.derived;
    const label = `${col.name || shortAddr(col.address)}`.slice(0, 30).padEnd(30);
    process.stdout.write(
      `  ${result.tier.padEnd(7)} ${String(result.score).padStart(5)}  ${label} ${String(d.mints).padStart(5)}  ${String(d.uniqueMinters).padStart(6)}  ${String(d.holders).padStart(4)}  ${d.mintsPerMin.toFixed(1).padStart(5)}  ${pct(result.crowdIndex).padStart(5)}  ${fmtAge(d.ageSec)}\n`
    );
  }
  process.stdout.write('\n');
}

function printInspect(col, result, cfg) {
  const d = result.derived;
  process.stdout.write(`\n${C.bold}${col.name || '(unnamed)'}${col.symbol ? ` (${col.symbol})` : ''}${C.reset}  ${col.address}\n`);
  process.stdout.write(`${C.dim}${col.standard || 'unknown standard'} · deployer ${col.owner ? shortAddr(col.owner) : '?'} · age ${fmtAge(d.ageSec)}${C.reset}\n\n`);
  process.stdout.write(`  ${C.bold}SCORE ${result.score}${C.reset}  tier ${result.tier}  crowd ${pct(result.crowdIndex)}  stealth ×${result.stealthMultiplier}  confidence ${pct(result.confidence)}\n\n`);

  if (result.blockers.length) {
    process.stdout.write(`  ${C.red}DISQUALIFIED${C.reset}\n`);
    for (const b of result.blockers) process.stdout.write(`    ✕ ${b}\n`);
    process.stdout.write('\n');
  }

  for (const p of result.parts) {
    const bar = p.score == null ? `${C.dim}·········${C.reset}` : '█'.repeat(Math.round(p.score * 9)).padEnd(9, '░');
    const s = p.score == null ? ' n/a ' : (p.score * 100).toFixed(0).padStart(4) + '%';
    process.stdout.write(`  ${bar} ${s}  w${String(p.weight).padStart(3)}  ${p.label}\n        ${C.dim}${p.note}${C.reset}\n`);
  }

  process.stdout.write(`\n  ${C.dim}mints ${d.mints} · minters ${d.uniqueMinters} · holders ${d.holders} · secondary ${d.secondary}\n`);
  process.stdout.write(`  rate ${d.mintsPerMin.toFixed(2)}/min (${d.accelRatio.toFixed(2)}× baseline) · top10 ${pct(d.top10Share)} · bulk ${pct(d.bulkShare)}${C.reset}\n`);
  if (cfg.chain.explorerAddress) process.stdout.write(`  ${cfg.chain.explorerAddress}${col.address}\n`);
  process.stdout.write('\n');
}

async function serve(cfg, port) {
  const agent = new Agent(cfg);
  const dashDir = path.join(ROOT, 'dashboard');

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname === '/api/state') {
        agent.store.load();
        const rows = await agent.scoreAll([...agent.store.collections.values()]);
        const body = {
          chain: cfg.chain.name,
          cursor: agent.store.cursor,
          head: agent.store.meta.head ?? null,
          scans: agent.store.meta.scans ?? 0,
          tracked: agent.store.collections.size,
          walletsTracked: agent.wallets.map.size,
          explorer: cfg.chain.explorerAddress,
          tiers: cfg.tiers,
          collections: rows.slice(0, 150).map(({ col, result }) => ({
            address: col.address,
            name: col.name,
            symbol: col.symbol,
            standard: col.standard,
            score: result.score,
            tier: result.tier,
            crowdIndex: result.crowdIndex,
            confidence: result.confidence,
            blockers: result.blockers,
            parts: result.parts.map((p) => ({ id: p.id, label: p.label, weight: p.weight, score: p.score, note: p.note })),
            d: result.derived,
          })),
          alerts: agent.store.alerts.slice(-60).reverse(),
        };
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify(body));
        return;
      }

      const file = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
      const full = path.join(dashDir, file);
      if (!full.startsWith(dashDir) || !fs.existsSync(full)) {
        res.writeHead(404).end('not found');
        return;
      }
      const type = full.endsWith('.html') ? 'text/html' : full.endsWith('.css') ? 'text/css' : full.endsWith('.js') ? 'text/javascript' : 'application/octet-stream';
      res.writeHead(200, { 'content-type': `${type}; charset=utf-8` });
      res.end(fs.readFileSync(full));
    } catch (e) {
      res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ error: e.message }));
    }
  });

  server.listen(port, () => process.stdout.write(`Hermes dashboard  →  http://localhost:${port}\n`));
}

main().catch((e) => {
  process.stderr.write(`${C.red}error:${C.reset} ${e.stack || e.message}\n`);
  process.exit(1);
});
