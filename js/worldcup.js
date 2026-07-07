/* ============================================================
   NxrLegends — World Cup: 16-nation single-elimination knockout
   Reuses the pre-match / live-match / result machinery from ui.js.
   ============================================================ */

const WC_KEY = 'nxrlegends-worldcup-v1';
let WC = null;

const WC_ROUND_NAMES = { 16: 'ROUND OF 16', 8: 'QUARTER-FINAL', 4: 'SEMI-FINAL', 2: 'FINAL' };

function loadWorldCup() { try { const s = localStorage.getItem(WC_KEY); if (s) WC = JSON.parse(s); } catch (e) {} }
function saveWorldCup() { try { localStorage.setItem(WC_KEY, JSON.stringify(WC)); } catch (e) {} }
function clearWorldCup() { WC = null; try { localStorage.removeItem(WC_KEY); } catch (e) {} }

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/* build a round's ties from an ordered list of team ids */
function buildTies(ids) {
  const ties = [];
  for (let i = 0; i < ids.length; i += 2) {
    ties.push({ a: ids[i], b: ids[i + 1], done: false, ha: 0, ab: 0, winner: null, pens: null });
  }
  return ties;
}

function newWorldCup(userId) {
  const nations = DB.filter(t => t.type === 'nation').map(t => t.id);
  let field = shuffled(nations).slice(0, 16);
  if (!field.includes(userId)) { field[15] = userId; field = shuffled(field); }
  WC = { user: userId, rounds: [buildTies(field)], roundIdx: 0, alive: true, champion: null };
  saveWorldCup();
}

function wcCurrentRound() { return WC.rounds[WC.roundIdx]; }
function wcUserTie() { return wcCurrentRound().find(t => t.a === WC.user || t.b === WC.user); }

/* auto-resolve an AI-vs-AI knockout tie (with shootout if level) */
function simKnockoutTie(tie) {
  const a = getTeam(tie.a), b = getTeam(tie.b);
  const s = simulateMatch(a, b);
  tie.ha = s.hg; tie.ab = s.ag;
  if (s.hg === s.ag) { tie.pens = penaltyShootout(a, b); tie.winner = tie.pens.winner === 'home' ? tie.a : tie.b; }
  else tie.winner = s.hg > s.ag ? tie.a : tie.b;
  tie.done = true;
}

/* ---- screen ---- */
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
  renderWCBracket();
  show('worldcup');
}

function renderWCNations() {
  const grid = $('#wc-nations');
  grid.innerHTML = '';
  DB.filter(t => t.type === 'nation').forEach(team => {
    const card = teamCard(team, { noStar: true });
    card.addEventListener('click', () => {
      SFX.whistle();
      newWorldCup(team.id);
      renderWorldCup();
    });
    grid.appendChild(card);
  });
}

function renderWCStatus() {
  const box = $('#wc-status');
  const user = getTeam(WC.user);
  const roundName = WC_ROUND_NAMES[wcCurrentRound().length * 2] || 'FINAL';
  if (WC.champion) {
    const champ = getTeam(WC.champion);
    box.innerHTML = WC.champion === WC.user
      ? `<span class="wc-trophy">🏆</span><h3>WORLD CHAMPIONS!</h3><p>${champ.name} LIFT THE NXRLEGENDS WORLD CUP!</p>`
      : `<span class="wc-trophy">🎖️</span><h3>TOURNAMENT OVER</h3><p>${champ.name} WON THE WORLD CUP.</p>`;
  } else if (!WC.alive) {
    box.innerHTML = `<span class="wc-trophy">💔</span><h3>ELIMINATED</h3><p>${user.name} are out. The dream ends here.</p>`;
  } else {
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

function playWorldCupTie() {
  const tie = wcUserTie();
  const roundName = WC_ROUND_NAMES[wcCurrentRound().length * 2] || 'FINAL';
  beginFixture({
    homeId: tie.a, awayId: tie.b,
    userTeamId: WC.user,
    label: `WORLD CUP — ${roundName}`,
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

  // resolve the rest of this round
  round.forEach(t => { if (!t.done) simKnockoutTie(t); });

  const userAdvances = tie.winner === WC.user;
  const winners = round.map(t => t.winner);

  let infoLines = [];
  const roundName = WC_ROUND_NAMES[round.length * 2] || 'FINAL';
  if (winners.length === 1) {
    // that was the final
    WC.champion = winners[0];
    WC.alive = WC.champion === WC.user;
    infoLines.push(WC.champion === WC.user ? '★ YOU ARE WORLD CHAMPIONS! ★' : 'THE TOURNAMENT IS OVER.');
  } else if (userAdvances) {
    WC.rounds.push(buildTies(winners));
    WC.roundIdx++;
    const nextName = WC_ROUND_NAMES[winners.length] || 'FINAL';
    infoLines.push(`THROUGH TO THE ${nextName}!`);
  } else {
    WC.alive = false;
    infoLines.push('KNOCKED OUT — NO SECOND CHANCES.');
  }
  saveWorldCup();

  // coins for playing (win bonus scales with round)
  const won = tie.winner === WC.user;
  const earned = matchReward(won, false, won ? (tie.a === WC.user ? res.hg : res.ag) : 0) + (won ? 200 : 0);
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

function renderWCBracket() {
  const box = $('#wc-bracket');
  box.innerHTML = '';
  WC.rounds.forEach((round, ri) => {
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
          <span class="wc-short">${t.short}</span>
          <span class="wc-name">${t.name}${t.hasLegend ? ' ★' : ''}</span>
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
