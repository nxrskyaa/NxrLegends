// Two-way Telegram bot. Alerts go out; questions come back.
//
// Long polling, not webhooks: it works from a laptop behind NAT with no domain,
// no TLS certificate and no port forwarding — which is the setup most people
// actually have.

import { nowSec, shortAddr, fmtAge, pct, isAddr } from './util.js';
import { thesisProgress } from './thesis.js';
import { scoreCollection } from './score.js';

const esc = (s) =>
  String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

const TIER_ICON = { URGENT: '🔴', ALPHA: '🟢', SIGNAL: '🔵', WATCH: '🟡', NOISE: '⚪' };

const HELP = `<b>Hermes</b> — what I can tell you:

/status — am I alive, where am I in the chain
/top — best candidates right now
/top 5 — just the top 5
/theses — what I am managing, and what would break it
/i &lt;address&gt; — full breakdown for one collection
/wallets — my smart-money registry
/tier ALPHA — only alert me at ALPHA or above
/mute · /unmute — stop / resume alerts
/help — this message

Tip: tap any <code>/i_0x…</code> link in my messages to inspect that collection.`;

export class TelegramBot {
  constructor(cfg, agent) {
    this.cfg = cfg;
    this.agent = agent;
    this.token = cfg.telegram?.botToken || cfg.alerts?.telegram?.botToken || '';
    this.chatId = String(cfg.telegram?.chatId || cfg.alerts?.telegram?.chatId || '');
    this.allow = new Set([this.chatId, ...(cfg.telegram?.allowFrom || []).map(String)].filter(Boolean));
    this.apiBase = cfg.telegram?.apiBase || 'https://api.telegram.org';
    this.offset = 0;
    this.running = false;
    this.me = null;
  }

  get configured() {
    return !!this.token;
  }

  async api(method, params = {}) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), (this.cfg.telegram?.pollTimeoutSec ?? 30) * 1000 + 15000);
    try {
      const res = await fetch(`${this.apiBase}/bot${this.token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(params),
        signal: ac.signal,
      });
      const body = await res.json();
      if (!body.ok) throw new Error(body.description || `telegram ${method} failed`);
      return body.result;
    } finally {
      clearTimeout(timer);
    }
  }

  async send(chatId, text, extra = {}) {
    // Telegram hard-caps messages at 4096 characters.
    const chunks = splitMessage(text, 3900);
    let last;
    for (const c of chunks) {
      last = await this.api('sendMessage', {
        chat_id: chatId,
        text: c,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...extra,
      }).catch((e) => {
        process.stderr.write(`telegram send failed: ${e.message}\n`);
        return null;
      });
    }
    return last;
  }

  async start() {
    if (!this.configured) throw new Error('telegram.botToken is not set');
    this.me = await this.api('getMe');
    this.running = true;

    await this.api('setMyCommands', {
      commands: [
        { command: 'status', description: 'agent health and position in the chain' },
        { command: 'top', description: 'best candidates right now' },
        { command: 'theses', description: 'what I am managing' },
        { command: 'i', description: 'inspect one collection by address' },
        { command: 'wallets', description: 'smart-money registry' },
        { command: 'tier', description: 'set the alert threshold' },
        { command: 'mute', description: 'stop alerts' },
        { command: 'unmute', description: 'resume alerts' },
        { command: 'help', description: 'what I can do' },
      ],
    }).catch(() => {});

    // Drop anything queued while we were offline, so a restart does not replay
    // a backlog of old commands.
    const backlog = await this.api('getUpdates', { offset: -1, timeout: 0 }).catch(() => []);
    if (backlog.length) this.offset = backlog[backlog.length - 1].update_id + 1;

    this.loop();
    return this.me;
  }

  stop() {
    this.running = false;
  }

  async loop() {
    while (this.running) {
      try {
        const updates = await this.api('getUpdates', {
          offset: this.offset,
          timeout: this.cfg.telegram?.pollTimeoutSec ?? 30,
          allowed_updates: ['message'],
        });
        for (const u of updates) {
          this.offset = u.update_id + 1;
          await this.handle(u).catch((e) => process.stderr.write(`telegram handler: ${e.message}\n`));
        }
      } catch (e) {
        if (!this.running) return;
        process.stderr.write(`telegram poll: ${e.message}\n`);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }

  async handle(update) {
    const msg = update.message;
    const text = msg?.text?.trim();
    if (!text) return;
    const chatId = String(msg.chat.id);

    // Onboarding: with no chat id configured yet, the only thing the bot will
    // say is which id to configure. It answers nothing else to strangers.
    if (!this.allow.size) {
      await this.send(chatId, `Your chat id is <code>${esc(chatId)}</code>\n\nPut it in <code>hermes.config.json</code> under <code>telegram.chatId</code>, then restart me.`);
      return;
    }
    if (!this.allow.has(chatId)) return;

    const [rawCmd, ...args] = text.split(/\s+/);
    const cmd = rawCmd.replace(/@\w+$/, '').toLowerCase();

    // Tappable shortcuts embedded in alerts: /i_0xabc…
    if (cmd.startsWith('/i_')) return this.cmdInspect(chatId, [cmd.slice(3)]);
    if (cmd.startsWith('/t_')) return this.cmdThesis(chatId, cmd.slice(3));

    switch (cmd) {
      case '/start':
      case '/help':
        return this.send(chatId, HELP);
      case '/status':
        return this.cmdStatus(chatId);
      case '/top':
        return this.cmdTop(chatId, args);
      case '/theses':
        return this.cmdTheses(chatId);
      case '/i':
      case '/inspect':
        return this.cmdInspect(chatId, args);
      case '/wallets':
        return this.cmdWallets(chatId);
      case '/tier':
        return this.cmdTier(chatId, args);
      case '/mute':
        this.cfg.alerts.muted = true;
        return this.send(chatId, '🔕 Alerts muted. I keep scanning and managing theses — I just stop messaging. /unmute when you want them back.');
      case '/unmute':
        this.cfg.alerts.muted = false;
        return this.send(chatId, '🔔 Alerts back on.');
      default:
        return this.send(chatId, `I don't know <code>${esc(cmd)}</code>. /help lists what I understand.`);
    }
  }

  async cmdStatus(chatId) {
    const s = this.agent.store;
    const behind = s.meta.head != null && s.cursor != null ? s.meta.head - s.cursor : null;
    const open = [...s.theses.values()].filter((t) => t.status === 'open').length;
    await this.send(
      chatId,
      `<b>Hermes</b> · ${esc(this.cfg.chain.name)}\n` +
        `block <b>${s.cursor ?? '—'}</b>${behind != null ? ` <i>(${behind} behind head)</i>` : ''}\n` +
        `tracking <b>${s.collections.size}</b> collections · <b>${open}</b> open theses\n` +
        `smart wallets <b>${this.agent.wallets.map.size}</b> · scans <b>${s.meta.scans ?? 0}</b>\n` +
        `alerting at <b>${esc(this.cfg.alerts.minTier)}</b> and above · ${this.cfg.alerts.muted ? '🔕 muted' : '🔔 on'}`
    );
  }

  async cmdTop(chatId, args) {
    const n = Math.min(20, Math.max(1, Number(args[0]) || 8));
    const rows = (await this.agent.scoreAll([...this.agent.store.collections.values()]))
      .filter((r) => r.result.tier !== 'NOISE')
      .slice(0, n);

    if (!rows.length) return this.send(chatId, 'Nothing above NOISE yet. Either the chain is quiet or I have not scanned far enough — /status shows where I am.');

    const body = rows
      .map(({ col, result }) => {
        const d = result.derived;
        return (
          `${TIER_ICON[result.tier]} <b>${result.tier} ${result.score}</b> · ${esc(col.name || shortAddr(col.address))}\n` +
          `<i>${d.mints} mints / ${d.uniqueMinters} minters · ${d.mintsPerMin.toFixed(1)}/min · ${d.absorb?.verdict ?? 'no flow yet'} · crowd ${pct(result.crowdIndex)} · ${fmtAge(d.ageSec)}</i>\n` +
          `/i_${col.address}`
        );
      })
      .join('\n\n');
    await this.send(chatId, `<b>Top ${rows.length}</b>\n\n${body}`);
  }

  async cmdTheses(chatId) {
    const open = [...this.agent.store.theses.values()].filter((t) => t.status === 'open');
    if (!open.length) return this.send(chatId, 'Nothing under management right now.');

    const body = open
      .map((t) => {
        const col = this.agent.store.collections.get(t.address);
        const d = col ? col.derive(nowSec()) : null;
        const p = d ? thesisProgress(t, d) : null;
        const i = t.invalidation;
        return (
          `${TIER_ICON[t.tier]} <b>${esc(t.name || shortAddr(t.address))}</b> — ${t.tier} ${t.score}, size <b>${t.size}</b>, ${t.layersMet}/4 layers\n` +
          (p ? `<i>holders ${p.holders}${p.holderMult ? ` (${p.holderMult.toFixed(2)}×)` : ''} · flow ${p.rate} · ${p.absorb}</i>\n` : '') +
          `<i>exits if: flow &lt; ${i.rateFloor.toFixed(2)}/min · holders &lt; ${i.holderFloor} · top10 &gt; ${pct(i.top10Cap)} · sellers stop being absorbed</i>\n` +
          `/i_${t.address}`
        );
      })
      .join('\n\n');
    await this.send(chatId, `<b>${open.length} open thesis${open.length > 1 ? 'es' : ''}</b>\n\n${body}`);
  }

  async cmdInspect(chatId, args) {
    const addr = String(args[0] || '').toLowerCase();
    if (!isAddr(addr)) return this.send(chatId, 'Give me an address: <code>/i 0x…</code>');

    const col = this.agent.store.collections.get(addr);
    if (!col) return this.send(chatId, `I have not seen <code>${esc(addr)}</code> yet. I only know collections that minted while I was scanning.`);

    const d = col.derive(nowSec());
    const result = await scoreCollection({
      col,
      d,
      wallets: this.agent.wallets,
      chain: this.agent.chain,
      cfg: this.cfg,
      history: this.agent.store.ownerHistory(),
    });

    const bars = result.parts
      .map((p) => {
        const filled = p.score == null ? '·········' : '█'.repeat(Math.round(p.score * 9)).padEnd(9, '░');
        const pctTxt = p.score == null ? ' n/a' : `${(p.score * 100).toFixed(0)}%`.padStart(4);
        return `<code>${filled} ${pctTxt}</code> ${esc(p.label)}\n<i>   ${esc(p.note)}</i>`;
      })
      .join('\n');

    const layers = Object.entries(result.layers)
      .map(([k, v]) => `${v.met ? '✅' : v.score == null ? '⬜' : '⚠️'} ${k}`)
      .join('  ');

    const th = this.agent.store.theses.get(addr);
    const thesisLine = th
      ? `\n\n<b>Thesis: ${th.status.toUpperCase()}</b> · ${th.checks} re-checks` +
        (th.status === 'open'
          ? `\n<i>exits if: flow &lt; ${th.invalidation.rateFloor.toFixed(2)}/min · holders &lt; ${th.invalidation.holderFloor} · top10 &gt; ${pct(th.invalidation.top10Cap)}</i>`
          : `\n${(th.closeReason || []).map((r) => `✕ <i>${esc(r)}</i>`).join('\n')}`)
      : '';

    const blockers = result.blockers.length ? `\n\n❌ <b>Disqualified</b>\n${result.blockers.map((b) => `• ${esc(b)}`).join('\n')}` : '';
    const link = this.cfg.chain.explorerAddress ? `\n\n<a href="${this.cfg.chain.explorerAddress}${addr}">open in explorer</a>` : '';

    await this.send(
      chatId,
      `${TIER_ICON[result.tier]} <b>${esc(col.name || '(unnamed)')}</b>${col.symbol ? ` (${esc(col.symbol)})` : ''}\n` +
        `<code>${esc(addr)}</code>\n\n` +
        `<b>${result.tier} ${result.score}</b> · size ${result.size} · confluence ${result.layersMet}/4` +
        (result.tierCapped ? ` <i>(capped from ${result.rawTier})</i>` : '') +
        `\n${layers}\n\n` +
        `<i>${d.mints} mints · ${d.uniqueMinters} minters · ${d.holders} holders · ${d.mintsPerMin.toFixed(2)}/min · ${d.absorb?.verdict ?? 'no flow yet'} · crowd ${pct(result.crowdIndex)} · ${fmtAge(d.ageSec)}</i>\n\n` +
        bars +
        blockers +
        thesisLine +
        link
    );
  }

  async cmdThesis(chatId, addr) {
    return this.cmdInspect(chatId, [addr]);
  }

  async cmdWallets(chatId) {
    const w = this.agent.wallets;
    if (!w.map.size) {
      return this.send(
        chatId,
        'My smart-money registry is <b>empty</b>, so my strongest signal is switched off and I can never reach URGENT.\n\nFill it by pointing me at collections that already worked:\n<code>hermes wallets learn 0xWINNER1 0xWINNER2 0xWINNER3</code>'
      );
    }
    const byTier = { S: 0, A: 0, B: 0 };
    for (const v of w.map.values()) byTier[v.tier] = (byTier[v.tier] || 0) + 1;
    const top = [...w.map]
      .filter(([, v]) => v.tier === 'S')
      .slice(0, 10)
      .map(([a, v]) => `<code>${shortAddr(a)}</code> — ${esc(v.note || 'no note')}`)
      .join('\n');
    await this.send(
      chatId,
      `<b>Smart money</b>: ${w.map.size} wallets\nS-tier <b>${byTier.S || 0}</b> · A-tier <b>${byTier.A || 0}</b> · B-tier <b>${byTier.B || 0}</b>` +
        (top ? `\n\n<b>S-tier</b>\n${top}` : '')
    );
  }

  async cmdTier(chatId, args) {
    const tiers = ['WATCH', 'SIGNAL', 'ALPHA', 'URGENT'];
    const want = String(args[0] || '').toUpperCase();
    if (!tiers.includes(want)) return this.send(chatId, `Pick one: ${tiers.map((t) => `<code>/tier ${t}</code>`).join(' · ')}`);
    this.cfg.alerts.minTier = want;
    await this.send(chatId, `Alert threshold is now <b>${want}</b> and above.\n\n<i>This lasts until I restart — to make it permanent set <code>alerts.minTier</code> in hermes.config.json.</i>`);
  }
}

/** Splits on paragraph boundaries where possible, hard-splits only if it must. */
function splitMessage(text, limit) {
  if (text.length <= limit) return [text];
  const out = [];
  let buf = '';
  for (const para of text.split('\n\n')) {
    if (buf && buf.length + para.length + 2 > limit) {
      out.push(buf);
      buf = '';
    }
    if (para.length > limit) {
      if (buf) { out.push(buf); buf = ''; }
      for (let i = 0; i < para.length; i += limit) out.push(para.slice(i, i + limit));
      continue;
    }
    buf = buf ? `${buf}\n\n${para}` : para;
  }
  if (buf) out.push(buf);
  return out;
}
