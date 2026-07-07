/* ============================================================
   NxrLegends — match engine
   Live minute-by-minute simulation. Ratings are recomputed each
   minute from the CURRENT on-pitch XI, so substitutions and
   tactics changes actually change what happens next.
   ============================================================ */

const CHANT_GOAL = [
  'GOOOOAL! THE NET BULGES!',
  'WHAT A STRIKE! TOP BINS!',
  'GOAL! THE CROWD ERUPTS!',
  'IT\'S IN! ABSOLUTE SCENES!',
  'GOAL! COLD-BLOODED FINISH!'
];
const CHANT_CHANCE = [
  'so close! Off the post!',
  'great save by the keeper!',
  'blazed over the bar!',
  'blocked on the line!',
  'dragged just wide!'
];
const CHANT_LEGEND = [
  'NXRSKYAA DANCES PAST THREE... UNSTOPPABLE!',
  'THE LEGEND STRIKES! 99 OVERALL, ZERO MERCY!',
  'NXRSKYAA FROM MIDFIELD?! ARE YOU KIDDING?!',
  'GARUDA MAGIC! NXRSKYAA DOES IT AGAIN!'
];

/* tactics multipliers from a chosen mentality + pressing (default = neutral) */
function tacticsMods(tactics) {
  const t = tactics;
  const m = (t && typeof MENTALITIES !== 'undefined' && MENTALITIES[t.mentality]) || { att: 0, def: 0 };
  const p = (t && typeof PRESSING !== 'undefined' && PRESSING[t.pressing]) || { press: 0 };
  return {
    att: 1 + m.att + p.press * 0.5,               // pressing high creates more chances
    def: 1 + m.def - Math.max(0, p.press) * 0.35, // ...but leaves gaps at the back
    tempo: 1 + Math.max(0, p.press) * 0.25        // high press = more end-to-end events
  };
}

/* attack / defense rating from an explicit XI array + tactics */
function ratingsFromXI(xi, tactics) {
  const mods = tacticsMods(tactics);
  const att = xi.filter(p => p.pos === 'FW' || p.pos === 'MF');
  const attBase = att.length ? att.reduce((s, p) => s + (p.pos === 'FW' ? p.ovr * 1.2 : p.ovr), 0) / att.length : 55;
  const def = xi.filter(p => p.pos === 'DF' || p.pos === 'GK' || p.pos === 'MF');
  const defBase = def.length ? def.reduce((s, p) => s + (p.pos === 'MF' ? p.ovr * 0.8 : p.ovr), 0) / def.length : 55;
  return { att: attBase * mods.att, def: defBase * mods.def, tempo: mods.tempo };
}

function pickScorerFromXI(xi) {
  const weights = xi.map(p => {
    let w = p.pos === 'FW' ? 6 : p.pos === 'MF' ? 3 : p.pos === 'DF' ? 1 : 0.1;
    if (p.legend) w *= 6;
    if (p.icon) w *= 1.6;
    return w * (p.ovr / 70);
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < xi.length; i++) { r -= weights[i]; if (r <= 0) return xi[i]; }
  return xi[xi.length - 1];
}

function goalText(scorer) {
  return scorer.legend ? pick(CHANT_LEGEND) : `${scorer.name} — ${pick(CHANT_GOAL)}`;
}

/* resolve a single minute given current ratings + XIs; returns event array */
function resolveMinute(min, home, away, hXI, aXI) {
  const hr = ratingsFromXI(hXI, home.tactics);
  const ar = ratingsFromXI(aXI, away.tactics);
  const tempo = (hr.tempo + ar.tempo) / 2;
  const homeEdge = 1.12;
  const pH = Math.max(0.008, (0.030 + (hr.att * homeEdge - ar.def) * 0.0022) * tempo);
  const pA = Math.max(0.008, (0.030 + (ar.att - hr.def * 1.05) * 0.0022) * tempo);
  const convH = 0.34 + Math.max(0, hr.att - ar.def) * 0.004;
  const convA = 0.34 + Math.max(0, ar.att - hr.def) * 0.004;
  const out = [];
  if (Math.random() < pH) {
    if (Math.random() < convH) {
      const scorer = pickScorerFromXI(hXI);
      out.push({ min, type: 'goal', side: 'home', player: scorer, text: goalText(scorer) });
    } else out.push({ min, type: 'chance', side: 'home', text: `${home.short} attack... ${pick(CHANT_CHANCE)}` });
  } else if (Math.random() < pA) {
    if (Math.random() < convA) {
      const scorer = pickScorerFromXI(aXI);
      out.push({ min, type: 'goal', side: 'away', player: scorer, text: goalText(scorer) });
    } else out.push({ min, type: 'chance', side: 'away', text: `${away.short} attack... ${pick(CHANT_CHANCE)}` });
  } else if (Math.random() < 0.006) {
    const side = Math.random() < 0.5 ? 'home' : 'away';
    const xi = side === 'home' ? hXI : aXI;
    out.push({ min, type: 'card', side, text: `Yellow card! ${pick(xi).name} goes into the book.` });
  }
  return out;
}

/* ---- live match: stepped one minute at a time, XIs are mutable ---- */
class LiveMatch {
  constructor(home, away, homeXI, awayXI) {
    this.home = home; this.away = away;
    this.homeXI = homeXI; this.awayXI = awayXI;
    this.min = 0; this.hg = 0; this.ag = 0;
  }
  step() {
    this.min++;
    const evs = resolveMinute(this.min, this.home, this.away, this.homeXI, this.awayXI);
    evs.forEach(e => { if (e.type === 'goal') { if (e.side === 'home') this.hg++; else this.ag++; } });
    return evs;
  }
  done() { return this.min >= 90; }
}

/* ---- fast whole-match sim for AI vs AI (background fixtures) ---- */
function simulateMatch(home, away) {
  const hXI = bestXI(home.squadFull), aXI = bestXI(away.squadFull);
  const events = [];
  let hg = 0, ag = 0;
  for (let min = 1; min <= 90; min++) {
    const evs = resolveMinute(min, home, away, hXI, aXI);
    evs.forEach(e => { if (e.type === 'goal') { if (e.side === 'home') hg++; else ag++; } });
    events.push(...evs);
  }
  return { events, hg, ag };
}

/* ---- penalty shootout for knockout ties level after 90 ---- */
function penaltyShootout(home, away) {
  const takerSkill = t => {
    const xi = bestXI(t.squadFull).filter(p => p.pos !== 'GK');
    return xi.reduce((s, p) => s + (p.stats.SHO + p.stats.DRI) / 2, 0) / Math.max(1, xi.length);
  };
  const gkSkill = t => {
    const gk = bestXI(t.squadFull).find(p => p.pos === 'GK');
    return gk ? gk.stats.DEF : 70;
  };
  const hTake = takerSkill(home), aTake = takerSkill(away);
  const hGk = gkSkill(home), aGk = gkSkill(away);
  const log = [];
  let h = 0, a = 0, round = 0;
  const attempt = (takeSkill, gk) => {
    const p = 0.5 + (takeSkill - gk) * 0.006; // ~0.5 base, skill-adjusted
    return Math.random() < Math.max(0.35, Math.min(0.92, p));
  };
  // best of 5, then sudden death
  while (true) {
    round++;
    const hScored = attempt(hTake, aGk); if (hScored) h++;
    const aScored = attempt(aTake, hGk); if (aScored) a++;
    log.push(`PK ${round}: ${home.short} ${hScored ? '⚽' : '✗'}  ${away.short} ${aScored ? '⚽' : '✗'}  (${h}-${a})`);
    if (round >= 5) {
      if (h !== a) break;
    }
    if (round >= 20) break; // safety
  }
  return { h, a, winner: h > a ? 'home' : 'away', log };
}

/* ---------------- league fixtures & table ---------------- */

/* circle-method round robin; rounds=2 adds mirrored second half */
function makeFixtures(teamIds, rounds) {
  const ids = [...teamIds];
  if (ids.length % 2 === 1) ids.push(null); // bye
  const n = ids.length, half = n / 2, weeks = n - 1;
  const fixtures = [];
  let arr = [...ids];
  for (let w = 0; w < weeks; w++) {
    const md = [];
    for (let i = 0; i < half; i++) {
      const a = arr[i], b = arr[n - 1 - i];
      if (a !== null && b !== null) {
        md.push(w % 2 === 0 ? { home: a, away: b } : { home: b, away: a });
      }
    }
    fixtures.push(md);
    arr = [arr[0], ...arr.slice(-1), ...arr.slice(1, -1)];
  }
  if (rounds === 2) {
    const second = fixtures.map(md => md.map(m => ({ home: m.away, away: m.home })));
    fixtures.push(...second);
  }
  const flat = [];
  fixtures.forEach((md, i) => md.forEach(m => flat.push({ ...m, md: i + 1, played: false, hg: 0, ag: 0 })));
  return flat;
}

function computeTable(teamIds, fixtures) {
  const rows = {};
  teamIds.forEach(id => rows[id] = { id, P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, PTS: 0 });
  fixtures.filter(f => f.played).forEach(f => {
    const h = rows[f.home], a = rows[f.away];
    h.P++; a.P++; h.GF += f.hg; h.GA += f.ag; a.GF += f.ag; a.GA += f.hg;
    if (f.hg > f.ag) { h.W++; a.L++; h.PTS += 3; }
    else if (f.hg < f.ag) { a.W++; h.L++; a.PTS += 3; }
    else { h.D++; a.D++; h.PTS++; a.PTS++; }
  });
  return Object.values(rows).sort((x, y) =>
    y.PTS - x.PTS || (y.GF - y.GA) - (x.GF - x.GA) || y.GF - x.GF || getTeam(x.id).name.localeCompare(getTeam(y.id).name));
}
