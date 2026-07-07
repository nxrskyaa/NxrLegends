/* ============================================================
   NxrLegends — WORLD CUP 2026
   48 real nations · 12 groups of 4 · top 2 + 8 best thirds
   advance to a 32-team knockout with penalty shootouts.
   Reuses the pre-match / live-match / result machinery in ui.js.
   ============================================================ */

const WC_KEY = 'nxrlegends-worldcup-2026-v1';
let WC = null;

const WC_ROUND_NAMES = { 32: 'ROUND OF 32', 16: 'ROUND OF 16', 8: 'QUARTER-FINAL', 4: 'SEMI-FINAL', 2: 'FINAL' };

function loadWorldCup() { try { const s = localStorage.getItem(WC_KEY); if (s) WC = JSON.parse(s); } catch (e) {} }
function saveWorldCup() { try { localStorage.setItem(WC_KEY, JSON.stringify(WC)); } catch (e) {} }
function clearWorldCup() { WC = null; try { localStorage.removeItem(WC_KEY); } catch (e) {} }

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/* seeded group draw: 4 pots by strength, one per group */
function drawGroups(field) {
  const sorted = [...field].sort((a, b) => getTeam(b).str - getTeam(a).str);
  const pots = [0, 1, 2, 3].map(p => shuffled(sorted.slice(p * 12, p * 12 + 12)));
  const groups = [];
  for (let g = 0; g < 12; g++) {
    const teams = [pots[0][g], pots[1][g], pots[2][g], pots[3][g]];
    groups.push({ name: String.fromCharCode(65 + g), teams, fixtures: makeFixtures(teams, 1) });
  }
  return groups;
}

function newWorldCup(userId) {
  let field = [...WC2026_IDS];
  if (!field.includes(userId)) field[field.length - 1] = userId;
  WC = { user: userId, groups: drawGroups(field), groupMD: 1, phase: 'group',
    rounds: [], roundIdx: 0, alive: true, champion: null };
  saveWorldCup();
}

function wcUserGroup() { return WC.groups.find(g => g.teams.includes(WC.user)); }
function wcUserGroupFixture() {
  const g = wcUserGroup();
  return g.fixtures.find(f => !f.played && f.md === WC.groupMD && (f.home === WC.user || f.away === WC.user));
}
function wcCurrentRound() { return WC.rounds[WC.roundIdx]; }
function wcUserTie() { return wcCurrentRound() && wcCurrentRound().find(t => t.a === WC.user || t.b === WC.user); }

/* top 2 of each group + 8 best third-placed, seeded for the R32 bracket */
function computeAdvancers() {
  const firsts = [], seconds = [], thirds = [];
  WC.groups.forEach(g => {
    const table = computeTable(g.teams, g.fixtures);
    firsts.push(table[0]); seconds.push(table[1]); thirds.push(table[2]);
  });
  const rank = (a, b) => b.PTS - a.PTS || (b.GF - b.GA) - (a.GF - a.GA) || b.GF - a.GF;
  const bestThirds = [...thirds].sort(rank).slice(0, 8);
  return [...firsts.sort(rank), ...seconds.sort(rank), ...bestThirds.sort(rank)].map(r => r.id);
}

function buildTiesSeeded(ids) {
  const ties = [], n = ids.length;
  for (let i = 0; i < n / 2; i++) ties.push({ a: ids[i], b: ids[n - 1 - i], done: false, ha: 0, ab: 0, winner: null, pens: null });
  return ties;
}

function simKnockoutTie(tie) {
  const a = getTeam(tie.a), b = getTeam(tie.b);
  a.tactics = null; b.tactics = null; a.strMod = 1; b.strMod = 1;
  const s = simulateMatch(a, b);
  tie.ha = s.hg; tie.ab = s.ag;
  if (s.hg === s.ag) { tie.pens = penaltyShootout(a, b); tie.winner = tie.pens.winner === 'home' ? tie.a : tie.b; }
  else tie.winner = s.hg > s.ag ? tie.a : tie.b;
  tie.done = true;
}

/* ---------------- screen ---------------- */
function renderWorldCup() {
  if (!WC) {
    $('#wc-setup').classList.remove('hidden');
    $('#wc-tourney').classList.add('hidden');
    renderWCNations();
    show('worldcup');
    return;
  }
  $('#wc-setup').classList.add('hidden');
  $('#wc-tourney').classList.remove('hidden');
  renderWCStatus();
  renderWCActions();
  if (WC.phase === 'group') renderWCGroups(); else renderWCBracket();
  show('worldcup');
}

function renderWCNations() {
  const grid = $('#wc-nations');
  grid.innerHTML = '';
  WC2026_IDS.map(getTeam).sort((a, b) => b.str - a.str).forEach(team => {
    const card = teamCard(team, { noStar: true });
    card.addEventListener('click', () => { SFX.whistle(); newWorldCup(team.id); renderWorldCup(); });
    grid.appendChild(card);
  });
}

function renderWCStatus() {
  const box = $('#wc-status');
  const user = getTeam(WC.user);
  if (WC.champion) {
    const champ = getTeam(WC.champion);
    box.innerHTML = WC.champion === WC.user
      ? `<span class="wc-trophy">🏆</span><h3>WORLD CHAMPIONS 2026!</h3><p>${champ.name} CONQUER THE WORLD!</p>`
      : `<span class="wc-trophy">🎖️</span><h3>TOURNAMENT OVER</h3><p>${champ.name} WON THE 2026 WORLD CUP.</p>`;
  } else if (!WC.alive) {
    box.innerHTML = `<span class="wc-trophy">💔</span><h3>ELIMINATED</h3><p>${user.name} are out of the World Cup.</p>`;
  } else if (WC.phase === 'group') {
    const g = wcUserGroup();
    box.innerHTML = `<h3>${user.name} ${user.hasLegend ? '★' : ''} — GROUP ${g.name}</h3><p>GROUP STAGE · MATCHDAY ${WC.groupMD} OF 3</p>`;
  } else {
    const roundName = WC_ROUND_NAMES[wcCurrentRound().length * 2] || 'FINAL';
    box.innerHTML = `<h3>${user.name} ${user.hasLegend ? '★' : ''} — ${roundName}</h3><p>WIN OR GO HOME.</p>`;
  }
}

function renderWCActions() {
  const box = $('#wc-actions');
  box.innerHTML = '';
  if (WC.champion || !WC.alive) {
    const b = document.createElement('button');
    b.className = 'px-btn big gold';
    b.textContent = '♛ NEW WORLD CUP';
    b.addEventListener('click', () => { SFX.nav(); clearWorldCup(); renderWorldCup(); });
    box.appendChild(b);
    return;
  }
  if (WC.phase === 'group') {
    const fx = wcUserGroupFixture();
    const opp = getTeam(fx.home === WC.user ? fx.away : fx.home);
    const b = document.createElement('button');
    b.className = 'px-btn big gold';
    b.textContent = `▶ MATCHDAY ${WC.groupMD} vs ${opp.short}`;
    b.addEventListener('click', () => { SFX.click(); playWorldCupGroupMatch(); });
    box.appendChild(b);
  } else {
    const tie = wcUserTie();
    const opp = getTeam(tie.a === WC.user ? tie.b : tie.a);
    const b = document.createElement('button');
    b.className = 'px-btn big gold';
    b.textContent = `▶ PLAY vs ${opp.short}`;
    b.addEventListener('click', () => { SFX.click(); playWorldCupTie(); });
    box.appendChild(b);
  }
}

/* ---- group phase ---- */
function playWorldCupGroupMatch() {
  const fx = wcUserGroupFixture();
  const g = wcUserGroup();
  beginFixture({
    homeId: fx.home, awayId: fx.away,
    userTeamId: WC.user,
    label: `WORLD CUP 2026 — GROUP ${g.name}`,
    knockout: false,
    onComplete: res => groupMatchComplete(res),
    onBack: () => renderWorldCup()
  });
}

function groupMatchComplete(res) {
  const g = wcUserGroup();
  const fx = wcUserGroupFixture();
  fx.played = true; fx.hg = res.hg; fx.ag = res.ag;

  // sim every other fixture in this matchday, across all groups
  WC.groups.forEach(grp => grp.fixtures.filter(f => !f.played && f.md === WC.groupMD).forEach(f => {
    const s = simulateMatch(getTeam(f.home), getTeam(f.away));
    f.played = true; f.hg = s.hg; f.ag = s.ag;
  }));

  const userHome = fx.home === WC.user;
  const ug = userHome ? res.hg : res.ag, og = userHome ? res.ag : res.hg;
  const won = ug > og, drew = ug === og;
  const earned = matchReward(won, drew, ug);
  SFX.coin();

  WC.groupMD++;
  const infoLines = [];
  if (WC.groupMD > 3) {
    const advancers = computeAdvancers();
    WC.rounds = [buildTiesSeeded(advancers)];
    WC.roundIdx = 0; WC.phase = 'knockout';
    WC.alive = advancers.includes(WC.user);
    const table = computeTable(g.teams, g.fixtures);
    const pos = table.findIndex(r => r.id === WC.user) + 1;
    infoLines.push(`GROUP ${g.name}: FINISHED ${pos}${pos === 1 ? 'ST' : pos === 2 ? 'ND' : pos === 3 ? 'RD' : 'TH'}`);
    infoLines.push(WC.alive ? '★ THROUGH TO THE ROUND OF 32! ★' : 'GROUP STAGE EXIT — SO CLOSE.');
  } else {
    infoLines.push(`GROUP ${g.name} — MATCHDAY ${WC.groupMD} UP NEXT`);
  }
  saveWorldCup();

  showResult({
    state: won ? 'win' : drew ? 'draw' : 'loss',
    homeName: res.home.name, awayName: res.away.name, hg: res.hg, ag: res.ag,
    scorers: resultScorers(res),
    coinLine: `+${earned} ◉ EARNED — BALANCE ${COLL.coins.toLocaleString('en-US')} ◉`,
    infoLines,
    onContinue: () => renderWorldCup()
  });
}

/* ---- knockout phase ---- */
function playWorldCupTie() {
  const tie = wcUserTie();
  const roundName = WC_ROUND_NAMES[wcCurrentRound().length * 2] || 'FINAL';
  beginFixture({
    homeId: tie.a, awayId: tie.b,
    userTeamId: WC.user,
    label: `WORLD CUP 2026 — ${roundName}`,
    knockout: true,
    onComplete: res => worldCupComplete(res),
    onBack: () => renderWorldCup()
  });
}

function worldCupComplete(res) {
  const round = wcCurrentRound();
  const tie = wcUserTie();
  tie.ha = res.hg; tie.ab = res.ag; tie.pens = res.pens || null;
  tie.winner = res.winnerSide === 'home' ? tie.a : tie.b;
  tie.done = true;
  round.forEach(t => { if (!t.done) simKnockoutTie(t); });

  const userAdvances = tie.winner === WC.user;
  const winners = round.map(t => t.winner);
  const infoLines = [];
  if (winners.length === 1) {
    WC.champion = winners[0];
    WC.alive = WC.champion === WC.user;
    infoLines.push(WC.champion === WC.user ? '★ YOU ARE WORLD CHAMPIONS! ★' : 'THE TOURNAMENT IS OVER.');
  } else if (userAdvances) {
    WC.rounds.push(buildTiesSeeded(winners));
    WC.roundIdx++;
    infoLines.push(`THROUGH TO THE ${WC_ROUND_NAMES[winners.length] || 'FINAL'}!`);
  } else {
    WC.alive = false;
    infoLines.push('KNOCKED OUT — NO SECOND CHANCES.');
  }
  saveWorldCup();

  const won = tie.winner === WC.user;
  const earned = matchReward(won, false, won ? (tie.a === WC.user ? res.hg : res.ag) : 0) + (won ? 250 : 0);
  SFX.coin();
  const pensLine = res.pens ? `PENALTIES: ${res.home.short} ${res.pens.h}-${res.pens.a} ${res.away.short} — ${getTeam(tie.winner).short} ADVANCE` : '';

  showResult({
    state: won ? 'win' : 'loss',
    homeName: res.home.name, awayName: res.away.name, hg: res.hg, ag: res.ag,
    pensLine,
    scorers: resultScorers(res),
    coinLine: `+${earned} ◉ EARNED — BALANCE ${COLL.coins.toLocaleString('en-US')} ◉`,
    infoLines,
    onContinue: () => renderWorldCup()
  });
}

/* ---- group tables ---- */
function renderWCGroups() {
  const box = $('#wc-bracket');
  box.className = 'wc-groups';
  box.innerHTML = '';
  WC.groups.forEach(g => {
    const table = computeTable(g.teams, g.fixtures);
    const isUserGroup = g.teams.includes(WC.user);
    const card = document.createElement('div');
    card.className = 'wc-group' + (isUserGroup ? ' wc-group-user' : '');
    let rows = `<div class="wc-group-name">GROUP ${g.name}</div>
      <table class="px-table"><tr><th>#</th><th>TEAM</th><th class="num">P</th><th class="num">GD</th><th class="num">PTS</th></tr>`;
    table.forEach((r, i) => {
      const t = getTeam(r.id);
      const cls = r.id === WC.user ? 'user-row' : (i < 2 ? 'wc-adv' : '');
      rows += `<tr class="${cls}"><td>${i + 1}</td><td>${t.short} ${t.name}${t.hasLegend ? ' ★' : ''}</td>
        <td class="num">${r.P}</td><td class="num">${r.GF - r.GA}</td><td class="num">${r.PTS}</td></tr>`;
    });
    card.innerHTML = rows + '</table>';
    box.appendChild(card);
  });
}

/* ---- knockout bracket ---- */
function renderWCBracket() {
  const box = $('#wc-bracket');
  box.className = 'wc-bracket';
  box.innerHTML = '';
  WC.rounds.forEach(round => {
    const col = document.createElement('div');
    col.className = 'wc-round';
    const name = WC_ROUND_NAMES[round.length * 2] || 'FINAL';
    col.insertAdjacentHTML('beforeend', `<div class="wc-round-name">${name}</div>`);
    round.forEach(tie => {
      const a = getTeam(tie.a), b = getTeam(tie.b);
      const isUser = tie.a === WC.user || tie.b === WC.user;
      const row = document.createElement('div');
      row.className = 'wc-tie' + (isUser ? ' wc-tie-user' : '');
      const line = (t, id, score) => {
        const win = tie.done && tie.winner === id;
        return `<div class="wc-side ${win ? 'wc-win' : tie.done ? 'wc-lose' : ''}">
          <span class="wc-short">${t.short}</span><span class="wc-name">${t.name}${t.hasLegend ? ' ★' : ''}</span>
          <span class="wc-score">${tie.done ? score : '–'}</span></div>`;
      };
      row.innerHTML = line(a, tie.a, tie.ha) + line(b, tie.b, tie.ab) +
        (tie.pens ? `<div class="wc-pens">PK ${tie.pens.h}-${tie.pens.a}</div>` : '');
      col.appendChild(row);
    });
    box.appendChild(col);
  });
}

loadWorldCup();
