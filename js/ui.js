/* ============================================================
   NxrLegends — UI, screens, season flow, squad & gacha
   ============================================================ */

const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];

/* ---------------- tiny sfx (WebAudio, no assets) ---------------- */
const SFX = (() => {
  let ac = null;
  function ctx() { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)(); return ac; }
  function beep(freq, dur, type, vol) {
    try {
      const a = ctx(), o = a.createOscillator(), g = a.createGain();
      o.type = type || 'square'; o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.04, a.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
      o.connect(g).connect(a.destination);
      o.start(); o.stop(a.currentTime + dur);
    } catch (e) { /* audio blocked, fine */ }
  }
  return {
    click: () => beep(660, 0.06),
    nav:   () => beep(440, 0.08),
    coin:  () => { beep(880, 0.07); setTimeout(() => beep(1320, 0.1), 70); },
    goal:  () => { beep(523, 0.12); setTimeout(() => beep(659, 0.12), 110); setTimeout(() => beep(784, 0.25), 220); },
    whistle: () => beep(2200, 0.3, 'sawtooth', 0.03),
    reveal: (i) => beep(500 + i * 120, 0.09),
    legend: () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.14), i * 90)); }
  };
})();

/* ---------------- navigation ---------------- */
function show(id) {
  $$('.screen').forEach(s => s.classList.remove('active'));
  $('#screen-' + id).classList.add('active');
  window.scrollTo(0, 0);
}
$$('[data-nav]').forEach(b => b.addEventListener('click', () => { SFX.nav(); navTo(b.dataset.nav); }));

function navTo(id) {
  if (id === 'hubentry') { enterSeason(); return; }
  if (id === 'squad') renderSquadScreen();
  if (id === 'store') renderStore();
  if (id === 'customleague') renderBuilder();
  if (id === 'database') renderDatabase();
  if (id === 'legend') renderLegend();
  show(id);
}

/* ---------------- season state ---------------- */
const SAVE_KEY = 'nxrlegends-season-v2';
let SEASON = null;

function newSeason(userTeamId, teamIds, rounds, leagueName) {
  SEASON = {
    leagueName,
    user: userTeamId,
    teams: teamIds,
    fixtures: makeFixtures(teamIds, rounds)
  };
  saveSeason();
}
function saveSeason() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(SEASON)); } catch (e) {} }
function loadSeason() { try { const s = localStorage.getItem(SAVE_KEY); if (s) SEASON = JSON.parse(s); } catch (e) {} }
function clearSeason() { SEASON = null; try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }

function userMatches() { return SEASON.fixtures.filter(f => f.home === SEASON.user || f.away === SEASON.user); }
function nextUserMatch() { return userMatches().find(f => !f.played); }

/* SEASON button: resume an unfinished season, else start the 38-0 challenge
   (your club + all 19 English league clubs, home & away = 38 matches) */
function enterSeason() {
  if (!SEASON || !nextUserMatch()) {
    if (SEASON && !nextUserMatch()) clearSeason();
    newSeason(USER_TEAM_ID, [USER_TEAM_ID, ...EPL_IDS], 2, 'THE 38-0 CHALLENGE');
  }
  renderHub();
  show('hub');
}

/* ---------------- shared cards ---------------- */
function teamCard(team, opts) {
  const div = document.createElement('div');
  div.className = 'team-card';
  const cv = document.createElement('canvas');
  drawCrest(cv, team, 48);
  const info = document.createElement('div');
  info.innerHTML = `<div class="tc-name">${team.name}</div><div class="tc-sub">${team.desc}</div>`;
  const ovr = document.createElement('div');
  ovr.className = 'tc-ovr';
  ovr.textContent = Math.round(team.str);
  div.append(cv, info, ovr);
  if (team.hasLegend && !(opts && opts.noStar)) {
    const star = document.createElement('div');
    star.className = 'tc-star';
    star.textContent = '★ LEGEND';
    div.appendChild(star);
  }
  return div;
}

function playerCardEl(p, team, opts) {
  const div = document.createElement('div');
  div.className = 'player-card r-' + rarityOf(p) + (p.legend ? ' legend-card' : '');
  const cv = document.createElement('canvas');
  drawFace(cv, p, team ? team.colors : ['#e63946', '#fff'], 44);
  div.innerHTML = `
    <div class="pc-ovr">${p.ovr}</div>
    <div class="pc-top"></div>
    <div class="pc-stats">
      <div>PAC<b>${p.stats.PAC}</b></div><div>SHO<b>${p.stats.SHO}</b></div><div>PAS<b>${p.stats.PAS}</b></div>
      <div>DRI<b>${p.stats.DRI}</b></div><div>DEF<b>${p.stats.DEF}</b></div><div>PHY<b>${p.stats.PHY}</b></div>
    </div>`;
  const top = div.querySelector('.pc-top');
  top.appendChild(cv);
  const sub = p.legend ? 'THE LEGEND' : (team ? team.short : '');
  top.insertAdjacentHTML('beforeend', `<div><div class="pc-name">${p.name}</div><div class="pc-pos">${p.pos} — ${sub}</div></div>`);
  if (opts && opts.sellable) {
    const inXI = COLL.xi.includes(p.pid);
    if (inXI) {
      div.insertAdjacentHTML('beforeend', '<div class="pc-xi-tag">★ IN STARTING XI</div>');
    } else {
      const act = document.createElement('div');
      act.className = 'pc-actions';
      const sell = document.createElement('button');
      sell.className = 'px-btn small';
      sell.textContent = `SELL +${sellValue(p)}`;
      sell.addEventListener('click', () => {
        SFX.coin();
        sellPlayer(p.pid);
        renderSquadScreen();
      });
      act.appendChild(sell);
      div.appendChild(act);
    }
  }
  return div;
}

/* ============================================================
   MY SQUAD
   ============================================================ */
let COLL_FILTER = 'ALL';
let CHOOSER_SLOT = null;

function renderSquadScreen() {
  $('#squad-coins').textContent = COLL.coins.toLocaleString('en-US');
  $('#club-name').value = COLL.club;
  $('#squad-ovr').textContent = squadOVR();

  // formation buttons
  const seg = $('#formation-seg');
  seg.innerHTML = '';
  Object.keys(FORMATIONS).forEach(f => {
    const b = document.createElement('button');
    b.className = 'px-tab' + (COLL.formation === f ? ' active' : '');
    b.textContent = f;
    b.addEventListener('click', () => { SFX.click(); setFormation(f); renderSquadScreen(); });
    seg.appendChild(b);
  });

  // pitch slots
  const pitch = $('#squad-pitch');
  pitch.innerHTML = '';
  const form = FORMATIONS[COLL.formation];
  const xi = resolvedXI();
  form.slots.forEach((pos, i) => {
    const p = xi[i];
    const empty = !COLL.xi[i];
    const slot = document.createElement('button');
    slot.className = 'slot' + (empty ? ' empty' : '') + (p.legend ? ' legend-slot' : '');
    slot.style.left = form.xy[i][0] + '%';
    slot.style.top = form.xy[i][1] + '%';
    if (!empty) {
      const cv = document.createElement('canvas');
      drawFace(cv, p, COLL.colors, 28);
      slot.appendChild(cv);
    }
    slot.insertAdjacentHTML('beforeend',
      `<span class="slot-pos">${pos}</span>${empty ? 'TAP TO SET' : `${shortName(p.name)}<br><span class="slot-ovr">${p.ovr}</span>`}`);
    slot.addEventListener('click', () => openChooser(i, pos));
    pitch.appendChild(slot);
  });

  // collection
  const owned = ownedPlayers().sort((a, b) => b.ovr - a.ovr)
    .filter(p => COLL_FILTER === 'ALL' || p.pos === COLL_FILTER);
  $('#coll-count').textContent = COLL.owned.length;
  const grid = $('#coll-grid');
  grid.innerHTML = '';
  owned.forEach(p => grid.appendChild(playerCardEl(p, PLAYER_INDEX[p.pid].team, { sellable: true })));
}

function shortName(n) {
  const parts = n.split(' ');
  return parts.length > 1 ? parts[parts.length - 1].slice(0, 9) : n.slice(0, 9);
}

$('#club-name').addEventListener('change', () => {
  COLL.club = ($('#club-name').value.trim() || 'NXR FC').toUpperCase();
  saveCollection();
});

$('#btn-auto-xi').addEventListener('click', () => {
  SFX.click();
  autoBestXI();
  saveCollection();
  renderSquadScreen();
});

$$('#coll-filter .px-tab').forEach(t => t.addEventListener('click', () => {
  SFX.click();
  COLL_FILTER = t.dataset.pos;
  $$('#coll-filter .px-tab').forEach(x => x.classList.toggle('active', x === t));
  renderSquadScreen();
}));

function openChooser(slotIdx, pos) {
  SFX.click();
  CHOOSER_SLOT = slotIdx;
  $('#chooser-title').textContent = `PICK ${pos} FOR SLOT ${slotIdx + 1}`;
  const list = $('#chooser-list');
  list.innerHTML = '';
  const candidates = ownedPlayers().filter(p => p.pos === pos).sort((a, b) => b.ovr - a.ovr);
  if (!candidates.length) list.innerHTML = '<p class="px-label">NO PLAYERS FOR THIS POSITION — HIT THE GACHA STORE!</p>';
  candidates.forEach(p => {
    const row = document.createElement('button');
    row.className = 'chooser-row';
    const cv = document.createElement('canvas');
    drawFace(cv, p, COLL.colors, 26);
    row.appendChild(cv);
    const inXI = COLL.xi.includes(p.pid);
    row.insertAdjacentHTML('beforeend',
      `<span>${p.name}${p.legend ? ' ★' : ''}${inXI ? ' <span style="color:var(--cyan)">(XI)</span>' : ''}</span><span class="cr-ovr">${p.ovr}</span>`);
    row.addEventListener('click', () => {
      SFX.click();
      assignSlot(CHOOSER_SLOT, p.pid);
      closeChooser();
      renderSquadScreen();
    });
    list.appendChild(row);
  });
  $('#slot-chooser').classList.remove('hidden');
}
function closeChooser() { $('#slot-chooser').classList.add('hidden'); }
$('#chooser-close').addEventListener('click', closeChooser);
$('#chooser-clear').addEventListener('click', () => {
  assignSlot(CHOOSER_SLOT, null);
  closeChooser();
  renderSquadScreen();
});

/* ============================================================
   GACHA STORE
   ============================================================ */
function renderStore() {
  $('#store-coins').textContent = COLL.coins.toLocaleString('en-US');
  const grid = $('#pack-grid');
  grid.innerHTML = '';
  Object.entries(PACKS).forEach(([key, pack]) => {
    const card = document.createElement('button');
    card.className = 'pack-card';
    card.disabled = COLL.coins < pack.cost;
    card.innerHTML = `
      <div class="pack-art" style="background:${pack.color}"></div>
      <div class="pack-name">${pack.name}</div>
      <div class="pack-desc">${pack.desc}</div>
      <div class="pack-cost">◉ ${pack.cost.toLocaleString('en-US')}</div>`;
    card.addEventListener('click', () => {
      card.classList.add('shake');
      SFX.coin();
      setTimeout(() => {
        card.classList.remove('shake');
        const pulls = openPack(key);
        if (pulls) showReveal(pack, pulls);
      }, 550);
    });
    grid.appendChild(card);
  });
}

function showReveal(pack, pulls) {
  $('#reveal-title').textContent = pack.name + ' OPENED!';
  const box = $('#reveal-cards');
  box.innerHTML = '';
  pulls.forEach((pull, i) => {
    const p = pull.player;
    const r = rarityOf(p);
    const card = document.createElement('div');
    card.className = 'reveal-card r-' + r;
    const cv = document.createElement('canvas');
    drawFace(cv, p, PLAYER_INDEX[p.pid].team.colors, 56);
    card.appendChild(cv);
    card.insertAdjacentHTML('beforeend', `
      <div class="rv-name">${p.name}</div>
      <div class="rv-ovr">${p.ovr}</div>
      <div class="rv-pos">${p.pos} · ${r.toUpperCase()}${p.legend ? ' ★' : ''}</div>
      <div class="rv-tag ${pull.dupe ? '' : 'rv-new'}">${pull.dupe ? 'DUPLICATE +' + pull.refund + ' ◉' : 'NEW!'}</div>`);
    box.appendChild(card);
    setTimeout(() => {
      card.classList.add('flip');
      if (p.legend) SFX.legend(); else SFX.reveal(i);
    }, 350 + i * 420);
  });
  $('#pack-reveal').classList.remove('hidden');
}
$('#reveal-done').addEventListener('click', () => {
  SFX.nav();
  $('#pack-reveal').classList.add('hidden');
  renderStore();
});

/* ============================================================
   SEASON HUB
   ============================================================ */
$$('.px-tab[data-tab]').forEach(t => t.addEventListener('click', () => {
  SFX.click();
  $$('.px-tab[data-tab]').forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  $$('.hub-panel').forEach(p => p.classList.remove('active'));
  $('#hub-panel-' + t.dataset.tab).classList.add('active');
}));

$('#btn-abandon').addEventListener('click', () => {
  if (confirm('ABANDON THIS SEASON? Progress will be lost.')) {
    SFX.nav();
    clearSeason();
    show('title');
  }
});

function resetHubTabs() {
  $$('.px-tab[data-tab]').forEach(x => x.classList.toggle('active', x.dataset.tab === 'next'));
  $$('.hub-panel').forEach(p => p.classList.toggle('active', p.id === 'hub-panel-next'));
}

function userRecord() {
  const played = userMatches().filter(f => f.played);
  const w = played.filter(f => (f.home === SEASON.user ? f.hg > f.ag : f.ag > f.hg)).length;
  const d = played.filter(f => f.hg === f.ag).length;
  return { played: played.length, w, d, l: played.length - w - d };
}

function renderHub() {
  resetHubTabs();
  const user = getTeam(SEASON.user);
  $('#hub-title').textContent = SEASON.leagueName;
  const um = userMatches();
  const r = userRecord();
  $('#hub-record').innerHTML = `${user.name}<br>${r.w}W ${r.d}D ${r.l}L — ${r.played}/${um.length}`;
  renderNextPanel();
  renderTablePanel();
  renderFixturesPanel();
  renderSquadPanel();
}

function renderNextPanel() {
  const panel = $('#hub-panel-next');
  const fx = nextUserMatch();
  const um = userMatches();
  const r = userRecord();
  const perfect = r.l === 0 && r.d === 0;

  if (!fx) {
    const table = computeTable(SEASON.teams, SEASON.fixtures);
    const pos = table.findIndex(row => row.id === SEASON.user) + 1;
    panel.innerHTML = `
      <div class="next-match-card season-over">
        <span class="trophy">${pos === 1 ? '🏆' : '🎖️'}</span>
        <p>SEASON COMPLETE!</p>
        <p>FINAL POSITION: ${pos}${pos === 1 ? 'ST — CHAMPIONS!' : pos === 2 ? 'ND' : pos === 3 ? 'RD' : 'TH'}</p>
        <p>RECORD: ${r.w}W ${r.d}D ${r.l}L</p>
        ${perfect && r.played >= 38 ? '<p style="color:var(--gold)">★ THE PERFECT ' + r.played + '-0 SEASON — IMMORTAL! ★</p>' :
          perfect ? '<p style="color:var(--gold)">★ UNBEATEN, UNDRAWN — PERFECT SEASON! ★</p>' :
          r.l === 0 ? '<p style="color:var(--cyan)">UNBEATEN SEASON — THE INVINCIBLES!</p>' : ''}
        <br><button class="px-btn big gold" onclick="navTo('title')">BACK TO TITLE</button>
      </div>`;
    return;
  }

  const home = getTeam(fx.home), away = getTeam(fx.away);
  panel.innerHTML = `
    <div class="next-match-card">
      <div class="nm-meta">MATCHDAY ${fx.md} — ${SEASON.leagueName}</div>
      <div class="nm-vs">
        <div class="nm-team" id="nm-home"></div>
        <div class="nm-x">VS</div>
        <div class="nm-team" id="nm-away"></div>
      </div>
      <div class="nm-meta">${home.name} PLAY AT HOME</div>
      <button class="px-btn big gold" id="btn-play">KICK OFF ►</button>
      ${perfect && r.played > 2 ? `<div class="streak-banner">★ PERFECT RUN: ${r.played} WINS FROM ${r.played} — KEEP THE ${um.length}-0 DREAM ALIVE ★</div>` :
        r.l === 0 && r.played > 2 ? `<div class="streak-banner">UNBEATEN IN ${r.played} — DON'T BLINK NOW</div>` : ''}
    </div>`;
  [['#nm-home', home], ['#nm-away', away]].forEach(([sel, t]) => {
    const el = $(sel);
    const cv = document.createElement('canvas');
    drawCrest(cv, t, 72);
    el.appendChild(cv);
    el.insertAdjacentHTML('beforeend', `<div class="nm-name">${t.name}</div><div class="nm-ovr">OVR ${Math.round(t.str)}</div>`);
  });
  $('#btn-play').addEventListener('click', () => { SFX.whistle(); startMatch(fx); });
}

function renderTablePanel() {
  const table = computeTable(SEASON.teams, SEASON.fixtures);
  let html = '<div class="table-scroll"><table class="px-table"><tr><th>#</th><th>TEAM</th><th class="num">P</th><th class="num">W</th><th class="num">D</th><th class="num">L</th><th class="num">GF</th><th class="num">GA</th><th class="num">GD</th><th class="num">PTS</th></tr>';
  table.forEach((row, i) => {
    const t = getTeam(row.id);
    html += `<tr class="${row.id === SEASON.user ? 'user-row' : ''}">
      <td class="pos-badge">${i + 1}</td><td>${t.name}${t.hasLegend ? ' ★' : ''}</td>
      <td class="num">${row.P}</td><td class="num">${row.W}</td><td class="num">${row.D}</td><td class="num">${row.L}</td>
      <td class="num">${row.GF}</td><td class="num">${row.GA}</td><td class="num">${row.GF - row.GA}</td><td class="num">${row.PTS}</td></tr>`;
  });
  $('#hub-panel-table').innerHTML = html + '</table></div>';
}

function renderFixturesPanel() {
  const panel = $('#hub-panel-fixtures');
  const next = nextUserMatch();
  let html = '';
  userMatches().forEach(f => {
    const h = getTeam(f.home), a = getTeam(f.away);
    const cls = f === next ? 'fx-next' : 'fx-user';
    const score = f.played ? `${f.hg} - ${f.ag}` : (f === next ? 'NEXT ►' : '- : -');
    html += `<div class="fixture-row ${cls}">
      <span class="fx-md">MD ${f.md}</span>
      <span class="fx-teams">${h.name} vs ${a.name}</span>
      <span class="fx-score">${score}</span></div>`;
  });
  panel.innerHTML = html;
}

function renderSquadPanel() {
  const panel = $('#hub-panel-squad');
  panel.innerHTML = '';
  const team = getTeam(SEASON.user);
  if (team.id === USER_TEAM_ID) {
    panel.insertAdjacentHTML('beforeend',
      '<p class="px-label" style="margin-bottom:12px">YOUR STARTING XI — EDIT IT IN MY SQUAD (CHANGES APPLY NEXT KICK-OFF)</p>');
  }
  const grid = document.createElement('div');
  grid.className = 'squad-grid';
  team.squadFull.forEach(p => grid.appendChild(playerCardEl(p, team.id === USER_TEAM_ID ? null : team)));
  panel.appendChild(grid);
}

/* ============================================================
   MATCH PLAYBACK
   ============================================================ */
let MATCH = null;

function startMatch(fixture) {
  const home = getTeam(fixture.home), away = getTeam(fixture.away);
  const sim = simulateMatch(home, away);
  MATCH = {
    fixture, home, away, sim,
    minute: 0, hg: 0, ag: 0, evIdx: 0,
    speed: 1, timer: null,
    scene: new MatchScene($('#pitch'), home, away)
  };
  [['#sb-home', home], ['#sb-away', away]].forEach(([sel, t]) => {
    const el = $(sel); el.innerHTML = '';
    const cv = document.createElement('canvas');
    drawCrest(cv, t, 36);
    el.appendChild(cv);
    el.insertAdjacentHTML('beforeend', `<span>${t.short}</span>`);
  });
  $('#sb-score-h').textContent = '0';
  $('#sb-score-a').textContent = '0';
  $('#sb-clock').textContent = "00'";
  $('#commentary').innerHTML = '<p>The referee blows the whistle — we are LIVE!</p>';
  $('#btn-speed').textContent = 'SPEED x1';
  show('match');
  runMatchLoop();
}

function runMatchLoop() {
  cancelAnimationFrame(MATCH.raf);
  clearInterval(MATCH.timer);
  const msPerMin = () => MATCH.speed === 1 ? 420 : 140;
  function animate() {
    MATCH.scene.tick();
    MATCH.scene.render();
    MATCH.raf = requestAnimationFrame(animate);
  }
  animate();
  MATCH.timer = setInterval(() => stepMinute(), msPerMin());
}

function stepMinute() {
  const M = MATCH;
  M.minute++;
  $('#sb-clock').textContent = String(M.minute).padStart(2, '0') + "'";
  while (M.evIdx < M.sim.events.length && M.sim.events[M.evIdx].min <= M.minute) {
    applyEvent(M.sim.events[M.evIdx++], true);
  }
  if (M.minute >= 90) finishMatch();
  else if (M.minute % 15 === 0) {
    logLine(pick([
      'The pixel crowd starts a wave...',
      'Tactical shouting from the dugout.',
      'The groundskeeper approves of this tempo.',
      'Drums echo around the stadium!'
    ]), '');
  }
}

function applyEvent(ev, live) {
  const M = MATCH;
  if (ev.type === 'goal') {
    if (ev.side === 'home') M.hg++; else M.ag++;
    $('#sb-score-h').textContent = M.hg;
    $('#sb-score-a').textContent = M.ag;
    if (live) {
      M.scene.goal(ev.side);
      if (ev.player && ev.player.legend) SFX.legend(); else SFX.goal();
    }
    logLine(`${ev.min}' ${ev.text}`, ev.player && ev.player.legend ? 'legend' : 'goal');
  } else if (ev.type === 'chance') {
    logLine(`${ev.min}' ${ev.text}`, 'chance');
    if (live && Math.random() < 0.5) M.scene.setAttack(ev.side);
  } else if (ev.type === 'card') {
    logLine(`${ev.min}' ${ev.text}`, 'card');
  }
}

function logLine(text, cls) {
  const box = $('#commentary');
  const p = document.createElement('p');
  if (cls) p.className = cls;
  p.textContent = text;
  box.appendChild(p);
  box.scrollTop = box.scrollHeight;
}

$('#btn-speed').addEventListener('click', () => {
  SFX.click();
  MATCH.speed = MATCH.speed === 1 ? 2 : 1;
  $('#btn-speed').textContent = 'SPEED x' + MATCH.speed;
  runMatchLoop();
});

$('#btn-skip').addEventListener('click', () => {
  SFX.click();
  while (MATCH.evIdx < MATCH.sim.events.length) applyEvent(MATCH.sim.events[MATCH.evIdx++], false);
  MATCH.minute = 90;
  finishMatch();
});

function finishMatch() {
  const M = MATCH;
  clearInterval(M.timer);
  cancelAnimationFrame(M.raf);
  SFX.whistle();
  M.fixture.played = true;
  M.fixture.hg = M.sim.hg;
  M.fixture.ag = M.sim.ag;
  SEASON.fixtures.filter(f => !f.played && f.md === M.fixture.md &&
    f.home !== SEASON.user && f.away !== SEASON.user).forEach(f => {
      const s = simulateMatch(getTeam(f.home), getTeam(f.away));
      f.played = true; f.hg = s.hg; f.ag = s.ag;
    });
  saveSeason();
  renderResult();
  show('result');
}

function renderResult() {
  const M = MATCH;
  const isUserHome = M.fixture.home === SEASON.user;
  const userInMatch = isUserHome || M.fixture.away === SEASON.user;
  const ug = isUserHome ? M.sim.hg : M.sim.ag;
  const og = isUserHome ? M.sim.ag : M.sim.hg;
  const won = ug > og, drew = ug === og;

  $('#result-headline').textContent = won ? '🏆 VICTORY!' : drew ? 'ALL SQUARE' : '💔 DEFEAT';
  $('#result-headline').style.color = won ? 'var(--gold)' : drew ? 'var(--cyan)' : 'var(--red)';
  $('#result-score').innerHTML = `${M.home.name}<span class="big-score">${M.sim.hg} — ${M.sim.ag}</span>${M.away.name}`;

  const scorers = M.sim.events.filter(e => e.type === 'goal')
    .map(e => `${e.min}' ${e.player.name} (${e.side === 'home' ? M.home.short : M.away.short})${e.player.legend ? ' ★' : ''}`);
  $('#result-scorers').innerHTML = scorers.length ? scorers.join('<br>') : 'NO GOALS — A DEFENSIVE MASTERCLASS?';

  // coin reward for the user's match
  let coinMsg = '';
  if (userInMatch) {
    const earned = matchReward(won, drew, ug);
    coinMsg = `+${earned} ◉ EARNED — BALANCE ${COLL.coins.toLocaleString('en-US')} ◉`;
    SFX.coin();
  }
  $('#result-coins').textContent = coinMsg;

  const um = userMatches();
  const r = userRecord();
  let streakMsg = '';
  if (r.l === 0 && r.d === 0) streakMsg = `★ PERFECT: ${r.played} WINS / ${r.played} GAMES — ${um.length - r.played} TO GO FOR ${um.length}-0 ★`;
  else if (r.l === 0) streakMsg = `UNBEATEN IN ${r.played} — INVINCIBLE VIBES`;
  else streakMsg = `RECORD: ${r.w}W ${r.d}D ${r.l}L`;
  $('#result-streak').textContent = streakMsg;
}

$('#btn-continue').addEventListener('click', () => {
  SFX.nav();
  renderHub();
  show('hub');
});

/* ============================================================
   CUSTOM LEAGUE BUILDER
   ============================================================ */
const BUILDER = { selected: [], userPick: null, rounds: 2 };

function renderBuilder() {
  BUILDER.selected = [];
  BUILDER.userPick = null;
  BUILDER.rounds = 2;
  $('#cl-double').classList.add('active');
  $('#cl-single').classList.remove('active');
  $('#cl-error').textContent = '';
  const grid = $('#cl-grid');
  grid.innerHTML = '';
  const pool = [getUserTeam(), ...DB];
  pool.forEach(team => {
    const card = teamCard(team, { noStar: true });
    card.dataset.id = team.id;
    card.addEventListener('click', () => {
      SFX.click();
      const i = BUILDER.selected.indexOf(team.id);
      if (i === -1) {
        BUILDER.selected.push(team.id);
        if (!BUILDER.userPick) BUILDER.userPick = team.id;
      } else if (BUILDER.userPick !== team.id) {
        BUILDER.userPick = team.id; // second tap on a selected card = make it yours
      } else {
        BUILDER.selected.splice(i, 1);
        BUILDER.userPick = BUILDER.selected[0] || null;
      }
      refreshBuilderGrid();
    });
    grid.appendChild(card);
  });
  refreshBuilderGrid();
}

function refreshBuilderGrid() {
  $$('#cl-grid .team-card').forEach(card => {
    const id = card.dataset.id;
    card.classList.toggle('selected', BUILDER.selected.includes(id));
    card.classList.toggle('userpick', BUILDER.userPick === id);
    let star = card.querySelector('.tc-star');
    if (BUILDER.userPick === id) {
      if (!star) {
        star = document.createElement('div');
        star.className = 'tc-star';
        card.appendChild(star);
      }
      star.textContent = '★ YOU';
    } else if (star) star.remove();
  });
  $('#cl-count').textContent = BUILDER.selected.length;
}

[['#cl-double', 2], ['#cl-single', 1]].forEach(([sel, r]) => {
  $(sel).addEventListener('click', () => {
    SFX.click();
    BUILDER.rounds = r;
    $('#cl-double').classList.toggle('active', r === 2);
    $('#cl-single').classList.toggle('active', r === 1);
  });
});

function bulkPick(filter, defaultUser) {
  DB.filter(filter).forEach(t => {
    if (!BUILDER.selected.includes(t.id)) BUILDER.selected.push(t.id);
  });
  if (!BUILDER.userPick) BUILDER.userPick = defaultUser || BUILDER.selected[0];
  refreshBuilderGrid();
}
$('#cl-pick-epl').addEventListener('click', () => { SFX.click(); bulkPick(t => t.type === 'epl'); });
$('#cl-pick-national').addEventListener('click', () => { SFX.click(); bulkPick(t => t.type === 'nation', 'idn'); });
$('#cl-pick-liga1').addEventListener('click', () => { SFX.click(); bulkPick(t => t.type === 'club'); });
$('#cl-clear').addEventListener('click', () => {
  SFX.click();
  BUILDER.selected = [];
  BUILDER.userPick = null;
  refreshBuilderGrid();
});

$('#cl-start').addEventListener('click', () => {
  const name = ($('#cl-name').value.trim() || 'NXR SUPER LEAGUE').toUpperCase();
  if (BUILDER.selected.length < 4) { $('#cl-error').textContent = 'PICK AT LEAST 4 TEAMS!'; return; }
  if (BUILDER.selected.length > 20) { $('#cl-error').textContent = 'MAX 20 TEAMS!'; return; }
  SFX.whistle();
  newSeason(BUILDER.userPick, [...BUILDER.selected], BUILDER.rounds, name);
  renderHub();
  show('hub');
});

/* ============================================================
   DATABASE
   ============================================================ */
function renderDatabase() {
  const list = $('#db-teams');
  list.innerHTML = '';
  DB.forEach((team, i) => {
    const btn = document.createElement('button');
    btn.className = 'db-team-btn' + (i === 0 ? ' active' : '');
    const cv = document.createElement('canvas');
    drawCrest(cv, team, 28);
    btn.appendChild(cv);
    btn.insertAdjacentHTML('beforeend', `<span>${team.name}${team.hasLegend ? ' ★' : ''}</span>`);
    btn.addEventListener('click', () => {
      SFX.click();
      $$('.db-team-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderDbSquad(team);
    });
    list.appendChild(btn);
  });
  renderDbSquad(DB[0]);
}

function renderDbSquad(team) {
  const box = $('#db-squad');
  box.innerHTML = `<h3>${team.name} — ${team.desc} (TEAM OVR ${Math.round(team.str)})</h3>`;
  const grid = document.createElement('div');
  grid.className = 'squad-grid';
  team.squadFull.forEach(p => grid.appendChild(playerCardEl(p, team)));
  box.appendChild(grid);
}

/* ============================================================
   LEGEND PAGE
   ============================================================ */
function renderLegend() {
  const stage = $('#legend-stage');
  stage.innerHTML = '';
  const owned = COLL.owned.includes('idn:0');
  const card = document.createElement('div');
  card.className = 'legend-big-card';
  const cv = document.createElement('canvas');
  drawFace(cv, NXRSKYAA, ['#e63946', '#fff'], 160);
  card.appendChild(cv);
  card.insertAdjacentHTML('beforeend', `
    <h3>${NXRSKYAA.name}</h3>
    <div class="lg-ovr">99 OVR</div>
    <div class="lg-pos">FW — TIMNAS INDONESIA ★${owned ? ' · IN YOUR COLLECTION!' : ''}</div>
    <div class="legend-stats">
      ${Object.entries(NXRSKYAA.stats).map(([k, v]) => `<div>${k}<b>${v}</b></div>`).join('')}
    </div>`);
  stage.appendChild(card);
  stage.insertAdjacentHTML('beforeend', `<p class="legend-lore">${NXRSKYAA.lore}</p>
    ${owned
      ? '<button class="px-btn big gold" onclick="navTo(\'squad\')">PUT HIM IN YOUR XI ►</button>'
      : '<button class="px-btn big gold" onclick="navTo(\'store\')">PULL HIM IN THE GACHA ►</button>'}`);
  SFX.legend();
}

/* ---------------- boot ---------------- */
startTitlePitch();
loadCollection();
loadSeason();
