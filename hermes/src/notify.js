// Alert delivery. Console always; file/webhook/Discord/Telegram when configured.
// Every channel gets the same reasoning, because an alert you cannot audit is noise.

import fs from 'node:fs';
import path from 'node:path';
import { topDrivers } from './score.js';
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

export function buildAlert(col, result, cfg) {
  const d = result.derived;
  const drivers = topDrivers(result, 3);
  return {
    at: new Date().toISOString(),
    address: col.address,
    name: col.name || '(unnamed)',
    symbol: col.symbol || '',
    standard: col.standard,
    tier: result.tier,
    score: result.score,
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
    },
    why: drivers.map((x) => `${x.label}: ${x.note}`),
    links: {
      explorer: cfg.chain.explorerAddress ? cfg.chain.explorerAddress + col.address : null,
      market: cfg.chain.marketplaceCollection ? cfg.chain.marketplaceCollection + col.address : null,
    },
  };
}

export function renderConsole(a) {
  const col = TIER_COLOR[a.tier] || '';
  const head = `${col}${C.bold}[${a.tier} ${a.score}]${C.reset} ${C.bold}${a.name}${C.reset} ${C.dim}${a.symbol ? `(${a.symbol}) ` : ''}${shortAddr(a.address)}${C.reset}`;
  const line2 = `${C.dim}  age ${a.age} · ${a.stats.mints} mints / ${a.stats.uniqueMinters} minters / ${a.stats.holders} holders · ${a.stats.mintsPerMin}/min (${a.stats.accelRatio}× base) · crowd ${pct(a.crowdIndex)}${C.reset}`;
  const why = a.why.map((w) => `${C.dim}  ↳ ${C.reset}${w}`).join('\n');
  const link = a.links.explorer ? `${C.dim}  ${a.links.explorer}${C.reset}` : '';
  return [head, line2, why, link].filter(Boolean).join('\n');
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
          title: `${alert.tier} · ${alert.score} — ${alert.name}`,
          url: alert.links.explorer || undefined,
          color: colors[alert.tier] ?? 0x3498db,
          description: alert.why.map((w) => `• ${w}`).join('\n').slice(0, 3500),
          fields: [
            { name: 'Contract', value: `\`${alert.address}\``, inline: false },
            { name: 'Mints', value: `${alert.stats.mints} / ${alert.stats.uniqueMinters} minters`, inline: true },
            { name: 'Rate', value: `${alert.stats.mintsPerMin}/min (${alert.stats.accelRatio}×)`, inline: true },
            { name: 'Crowd', value: pct(alert.crowdIndex), inline: true },
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
      `*${alert.tier} ${alert.score}* — ${alert.name}\n` +
      `\`${alert.address}\`\n` +
      `${alert.stats.mints} mints · ${alert.stats.uniqueMinters} minters · ${alert.stats.mintsPerMin}/min (${alert.stats.accelRatio}×)\n` +
      `age ${alert.age} · crowd ${pct(alert.crowdIndex)}\n\n` +
      alert.why.map((w) => `• ${w}`).join('\n') +
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
