// Alert delivery. Console always; file/webhook/Discord/Telegram when configured.
// Every channel gets the same reasoning, because an alert you cannot audit is noise.

import fs from 'node:fs';
import path from 'node:path';
import { topDrivers } from './score.js';
import { thesisProgress } from './thesis.js';
import { shortAddr, fmtAge, pct } from './util.js';

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m',
};
const TIER_COLOR = { URGENT: C.magenta, ALPHA: C.green, SIGNAL: C.cyan, WATCH: C.yellow, NOISE: C.dim };
const TIER_RANK = { NOISE: 0, WATCH: 1, SIGNAL: 2, ALPHA: 3, URGENT: 4 };

export function meetsTier(tier, minTier) {
  return (TIER_RANK[tier] ?? 0) >= (TIER_RANK[minTier] ?? 2);
}

export function buildAlert(col, result, cfg, extra = {}) {
  const d = result.derived;
  const drivers = topDrivers(result, 3);
  return {
    at: new Date().toISOString(),
    kind: extra.kind || 'ENTRY',
    address: col.address,
    name: col.name || '(unnamed)',
    symbol: col.symbol || '',
    standard: col.standard,
    tier: result.tier,
    score: result.score,
    size: result.size,
    layersMet: result.layersMet,
    layers: Object.fromEntries(Object.entries(result.layers).map(([k, v]) => [k, v.score == null ? null : Math.round(v.score * 100) / 100])),
    tierCapped: result.tierCapped ? result.rawTier : null,
    crowdIndex: result.crowdIndex,
    confidence: result.confidence,
    age: fmtAge(d.ageSec),
    stats: {
      mints: d.mints,
      uniqueMinters: d.uniqueMinters,
      holders: d.holders,
      mintsPerMin: Number(d.mintsPerMin.toFixed(2)),
      accelRatio: Number(d.accelRatio.toFixed(2)),
      top10Share: Number(d.top10Share.toFixed(3)),
      secondary: d.secondary,
      absorb: d.absorb?.verdict ?? null,
      ladder: d.ladder?.steps?.join(' → ') || null,
    },
    why: drivers.map((x) => `${x.label}: ${x.note}`),
    reasons: extra.reasons || [],
    progress: extra.thesis ? thesisProgress(extra.thesis, d) : null,
    invalidation: extra.thesis?.invalidation
      ? [
          `flow < ${extra.thesis.invalidation.rateFloor.toFixed(2)}/min`,
          `holders < ${extra.thesis.invalidation.holderFloor}`,
          `top10 > ${pct(extra.thesis.invalidation.top10Cap)}`,
          'sellers stop being absorbed',
        ]
      : null,
    links: {
      explorer: cfg.chain.explorerAddress ? cfg.chain.explorerAddress + col.address : null,
      market: cfg.chain.marketplaceCollection ? cfg.chain.marketplaceCollection + col.address : null,
    },
  };
}

const KIND_LABEL = { ENTRY: '▲ ENTRY', UPGRADE: '▲ UPGRADE', INVALIDATED: '▼ THESIS BROKEN', MATURED: '● THESIS PLAYED OUT' };

export function renderConsole(a) {
  const col = TIER_COLOR[a.tier] || '';
  const kind = KIND_LABEL[a.kind] || a.kind;
  const closing = a.kind === 'INVALIDATED' || a.kind === 'MATURED';
  const kindColor = a.kind === 'INVALIDATED' ? C.red : a.kind === 'MATURED' ? C.blue : col;

  const lines = [];
  lines.push(
    `${kindColor}${C.bold}${kind}${C.reset} ${col}[${a.tier} ${a.score}]${C.reset} ${C.bold}${a.name}${C.reset} ` +
      `${C.dim}${a.symbol ? `(${a.symbol}) ` : ''}${shortAddr(a.address)}${C.reset}` +
      (a.size && a.size !== 'NONE' && !closing ? `  ${C.bold}size:${a.size}${C.reset}` : '')
  );
  lines.push(
    `${C.dim}  age ${a.age} · ${a.stats.mints} mints / ${a.stats.uniqueMinters} minters / ${a.stats.holders} holders · ` +
      `${a.stats.mintsPerMin}/min (${a.stats.accelRatio}× base) · flow ${a.stats.absorb ?? 'n/a'} · crowd ${pct(a.crowdIndex)}${C.reset}`
  );

  if (!closing) {
    const layers = Object.entries(a.layers)
      .map(([k, v]) => `${v == null ? C.dim : v >= 0.55 ? C.green : C.yellow}${k}${v == null ? '·' : ''}${C.reset}`)
      .join(' ');
    lines.push(`${C.dim}  confluence ${a.layersMet}/4:${C.reset} ${layers}${a.tierCapped ? `${C.dim}  (capped from ${a.tierCapped})${C.reset}` : ''}`);
  }

  if (closing && a.reasons.length) for (const r of a.reasons) lines.push(`${C.red}  ✕ ${C.reset}${r}`);
  else for (const w of a.why) lines.push(`${C.dim}  ↳ ${C.reset}${w}`);

  if (a.progress) {
    lines.push(
      `${C.dim}  since entry: holders ${a.progress.holders}` +
        (a.progress.holderMult ? ` (${a.progress.holderMult.toFixed(2)}×)` : '') +
        ` · flow ${a.progress.rate} · absorb ${a.progress.absorb} · top10 ${a.progress.top10}${C.reset}`
    );
  }
  if (a.invalidation && !closing) lines.push(`${C.dim}  invalidates if: ${a.invalidation.join(' · ')}${C.reset}`);
  if (a.links.explorer) lines.push(`${C.dim}  ${a.links.explorer}${C.reset}`);
  return lines.join('\n');
}

async function post(url, body, headers = {}) {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 10000);
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    clearTimeout(t);
  } catch (e) {
    process.stderr.write(`notify: ${url.slice(0, 40)}… failed: ${e.message}\n`);
  }
}

export async function dispatch(alert, cfg) {
  process.stdout.write(renderConsole(alert) + '\n\n');

  const a = cfg.alerts || {};

  if (a.jsonlFile) {
    const p = path.resolve(a.jsonlFile);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.appendFileSync(p, JSON.stringify(alert) + '\n');
  }

  if (a.webhookUrl) await post(a.webhookUrl, alert);

  if (a.discordWebhookUrl) {
    const colors = { URGENT: 0xff2fb0, ALPHA: 0x2ecc71, SIGNAL: 0x3498db, WATCH: 0xf1c40f, NOISE: 0x95a5a6 };
    await post(a.discordWebhookUrl, {
      username: 'Hermes',
      embeds: [
        {
          title: `${KIND_LABEL[alert.kind] || alert.kind} · ${alert.tier} ${alert.score} — ${alert.name}`,
          url: alert.links.explorer || undefined,
          color: colors[alert.tier] ?? 0x3498db,
          description: (alert.reasons.length ? alert.reasons : alert.why).map((w) => `• ${w}`).join('\n').slice(0, 3500),
          fields: [
            { name: 'Contract', value: `\`${alert.address}\``, inline: false },
            { name: 'Mints', value: `${alert.stats.mints} / ${alert.stats.uniqueMinters} minters`, inline: true },
            { name: 'Rate', value: `${alert.stats.mintsPerMin}/min (${alert.stats.accelRatio}×)`, inline: true },
            { name: 'Crowd', value: pct(alert.crowdIndex), inline: true },
            { name: 'Confluence', value: `${alert.layersMet}/4`, inline: true },
            { name: 'Size', value: alert.size, inline: true },
            { name: 'Absorption', value: alert.stats.absorb ?? 'n/a', inline: true },
            { name: 'Age', value: alert.age, inline: true },
            { name: 'Holders', value: String(alert.stats.holders), inline: true },
            { name: 'Confidence', value: pct(alert.confidence), inline: true },
          ],
          timestamp: alert.at,
        },
      ],
    });
  }

  if (a.telegram?.botToken && a.telegram?.chatId) {
    const text =
      `*${KIND_LABEL[alert.kind] || alert.kind}* — *${alert.tier} ${alert.score}* ${alert.name}\n` +
      `\`${alert.address}\`\n` +
      `${alert.stats.mints} mints · ${alert.stats.uniqueMinters} minters · ${alert.stats.mintsPerMin}/min (${alert.stats.accelRatio}×)\n` +
      `age ${alert.age} · crowd ${pct(alert.crowdIndex)}\n\n` +
      (alert.reasons.length ? alert.reasons : alert.why).map((w) => `• ${w}`).join('\n') +
      (alert.links.explorer ? `\n\n${alert.links.explorer}` : '');
    await post(`https://api.telegram.org/bot${a.telegram.botToken}/sendMessage`, {
      chat_id: a.telegram.chatId,
      text,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    });
  }
}

export const colors = C;
