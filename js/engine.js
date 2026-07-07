/* ============================================================
   NxrLegends — match engine
   Generates a minute-by-minute event timeline from squad strength.
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

function attackRating(team) {
  const xi = bestXI(team.squadFull);
  const att = xi.filter(p => p.pos === 'FW' || p.pos === 'MF');
  return att.reduce((s, p) => s + (p.pos === 'FW' ? p.ovr * 1.2 : p.ovr), 0) / att.length;
}
function defenseRating(team) {
  const xi = bestXI(team.squadFull);
  const def = xi.filter(p => p.pos === 'DF' || p.pos === 'GK' || p.pos === 'MF');
  return def.reduce((s, p) => s + (p.pos === 'MF' ? p.ovr * 0.8 : p.ovr), 0) / def.length;
}

function pickScorer(team) {
  const xi = bestXI(team.squadFull);
  const weights = xi.map(p => {
    let w = p.pos === 'FW' ? 6 : p.pos === 'MF' ? 3 : p.pos === 'DF' ? 1 : 0.1;
    if (p.legend) w *= 6;
    return w * (p.ovr / 70);
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < xi.length; i++) { r -= weights[i]; if (r <= 0) return xi[i]; }
  return xi[xi.length - 1];
}

/* Simulate 90 minutes; returns { events, hg, ag } */
function simulateMatch(home, away) {
  const events = [];
  const hAtt = attackRating(home), hDef = defenseRating(home);
  const aAtt = attackRating(away), aDef = defenseRating(away);

  // convert rating edge to per-minute chance probability
  const homeEdge = 1.12; // home advantage
  const pH = Math.max(0.008, 0.030 + (hAtt * homeEdge - aDef) * 0.0022);
  const pA = Math.max(0.008, 0.030 + (aAtt - hDef * 1.05) * 0.0022);
  const convH = 0.34 + Math.max(0, hAtt - aDef) * 0.004;
  const convA = 0.34 + Math.max(0, aAtt - hDef) * 0.004;

  let hg = 0, ag = 0;
  for (let min = 1; min <= 90; min++) {
    if (Math.random() < pH) {
      if (Math.random() < convH) {
        const scorer = pickScorer(home);
        hg++;
        events.push({ min, type: 'goal', side: 'home', player: scorer,
          text: scorer.legend ? pick(CHANT_LEGEND) : `${scorer.name} — ${pick(CHANT_GOAL)}` });
      } else {
        events.push({ min, type: 'chance', side: 'home', text: `${home.short} attack... ${pick(CHANT_CHANCE)}` });
      }
    } else if (Math.random() < pA) {
      if (Math.random() < convA) {
        const scorer = pickScorer(away);
        ag++;
        events.push({ min, type: 'goal', side: 'away', player: scorer,
          text: scorer.legend ? pick(CHANT_LEGEND) : `${scorer.name} — ${pick(CHANT_GOAL)}` });
      } else {
        events.push({ min, type: 'chance', side: 'away', text: `${away.short} attack... ${pick(CHANT_CHANCE)}` });
      }
    } else if (Math.random() < 0.006) {
      const side = Math.random() < 0.5 ? 'home' : 'away';
      const t = side === 'home' ? home : away;
      events.push({ min, type: 'card', side, text: `Yellow card! ${pick(bestXI(t.squadFull)).name} goes into the book.` });
    }
  }
  return { events, hg, ag };
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
        // alternate home/away by week for fairness
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
  // flatten with matchday index
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
