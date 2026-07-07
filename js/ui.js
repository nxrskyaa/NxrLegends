/* ============================================================
   NxrLegends — UI, screens, season flow
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
    goal:  () => { beep(523, 0.12); setTimeout(() => beep(659, 0.12), 110); setTimeout(() => beep(784, 0.25), 220); },
    whistle: () => beep(2200, 0.3, 'sawtooth', 0.03),
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
  if (id === 'teamselect') renderTeamSelect();
  if (id === 'customleague') renderBuilder();
  if (id === 'database') renderDatabase();
  if (id === 'legend') renderLegend();
  show(id);
}

/* ---------------- season state ---------------- */
const SAVE_KEY = 'nxrlegends-season-v1';
let SEASON = null;

function newSeason(userTeamId, teamIds, rounds, leagueName) {
  SEASON = {
    leagueName,
    user: userTeamId,
    teams: teamIds,
    fixtures: makeFixtures(teamIds, rounds),
    unbeaten: true,
    streak: 0
  };
  saveSeason();
}
function saveSeason() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(SEASON)); } catch (e) {} }
function loadSeason() { try { const s = localStorage.getItem(SAVE_KEY); if (s) SEASON = JSON.parse(s); } catch (e) {} }

function userMatches() { return SEASON.fixtures.filter(f => f.home === SEASON.user || f.away === SEASON.user); }
function nextUserMatch() { return userMatches().find(f => !f.played); }

/* ---------------- team select ---------------- */
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

function renderTeamSelect() {
  const grid = $('#team-grid');
  grid.innerHTML = '';
  DB.forEach(team => {
    const card = teamCard(team);
    card.addEventListener('click', () => {
      SFX.click();
      newSeason(team.id, DB.map(t => t.id), 2, 'NUSANTARA LEGENDS LEAGUE');
      renderHub();
      show('hub');
    });
    grid.appendChild(card);
  });
}

/* ---------------- hub ---------------- */
$$('.px-tab[data-tab]').forEach(t => t.addEventListener('click', () => {
  SFX.click();
  $$('.px-tab[data-tab]').forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  $$('.hub-panel').forEach(p => p.classList.remove('active'));
  $('#hub-panel-' + t.dataset.tab).classList.add('active');
}));

$('#btn-quit-season').addEventListener('click', () => {
  SFX.nav();
  show('title');
});

function resetHubTabs() {
  $$('.px-tab[data-tab]').forEach(x => x.classList.toggle('active', x.dataset.tab === 'next'));
  $$('.hub-panel').forEach(p => p.classList.toggle('active', p.id === 'hub-panel-next'));
}

function renderHub() {
  resetHubTabs();
  const user = getTeam(SEASON.user);
  $('#hub-title').textContent = SEASON.leagueName;
  const um = userMatches();
  const played = um.filter(f => f.played);
  const w = played.filter(f => (f.home === SEASON.user ? f.hg > f.ag : f.ag > f.hg)).length;
  const d = played.filter(f => f.hg === f.ag).length;
  const l = played.length - w - d;
  $('#hub-record').innerHTML = `${user.name}<br>${w}W ${d}D ${l}L — ${played.length}/${um.length}`;
  renderNextPanel();
  renderTablePanel();
  renderFixturesPanel();
  renderSquadPanel();
}

function renderNextPanel() {
  const panel = $('#hub-panel-next');
  const fx = nextUserMatch();
  const um = userMatches();
  const played = um.filter(f => f.played);
  const l = played.filter(f => (f.home === SEASON.user ? f.hg < f.ag : f.ag < f.hg)).length;
  const d = played.filter(f => f.hg === f.ag).length;
  const perfect = l === 0 && d === 0;

  if (!fx) {
    const table = computeTable(SEASON.teams, SEASON.fixtures);
    const pos = table.findIndex(r => r.id === SEASON.user) + 1;
    const champion = pos === 1;
    const w = played.length - d - l;
    panel.innerHTML = `
      <div class="next-match-card season-over">
        <span class="trophy">${champion ? '🏆' : '🎖️'}</span>
        <p>SEASON COMPLETE!</p>
        <p>FINAL POSITION: ${pos}${pos === 1 ? 'ST — CHAMPIONS!' : pos === 2 ? 'ND' : pos === 3 ? 'RD' : 'TH'}</p>
        <p>RECORD: ${w}W ${d}D ${l}L</p>
        ${perfect && played.length >= 38 ? '<p style="color:var(--gold)">★ THE PERFECT ' + played.length + '-0 SEASON — IMMORTAL! ★</p>' :
          perfect ? '<p style="color:var(--gold)">★ UNBEATEN, UNDRAWN — PERFECT SEASON! ★</p>' :
          l === 0 ? '<p style="color:var(--cyan)">UNBEATEN SEASON — THE INVINCIBLES!</p>' : ''}
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
      ${perfect && played.length > 2 ? `<div class="streak-banner">★ PERFECT RUN: ${played.length} WINS FROM ${played.length} — KEEP THE ${um.length}-0 DREAM ALIVE ★</div>` :
        l === 0 && played.length > 2 ? `<div class="streak-banner">UNBEATEN IN ${played.length} — DON'T BLINK NOW</div>` : ''}
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
  table.forEach((r, i) => {
    const t = getTeam(r.id);
    html += `<tr class="${r.id === SEASON.user ? 'user-row' : ''}">
      <td class="pos-badge">${i + 1}</td><td>${t.name}${t.hasLegend ? ' ★' : ''}</td>
      <td class="num">${r.P}</td><td class="num">${r.W}</td><td class="num">${r.D}</td><td class="num">${r.L}</td>
      <td class="num">${r.GF}</td><td class="num">${r.GA}</td><td class="num">${r.GF - r.GA}</td><td class="num">${r.PTS}</td></tr>`;
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

function playerCardEl(p, team) {
  const div = document.createElement('div');
  div.className = 'player-card' + (p.legend ? ' legend-card' : '');
  const cv = document.createElement('canvas');
  drawFace(cv, p, team.colors, 44);
  div.innerHTML = `
    <div class="pc-ovr">${p.ovr}</div>
    <div class="pc-top"></div>
    <div class="pc-stats">
      <div>PAC<b>${p.stats.PAC}</b></div><div>SHO<b>${p.stats.SHO}</b></div><div>PAS<b>${p.stats.PAS}</b></div>
      <div>DRI<b>${p.stats.DRI}</b></div><div>DEF<b>${p.stats.DEF}</b></div><div>PHY<b>${p.stats.PHY}</b></div>
    </div>`;
  const top = div.querySelector('.pc-top');
  top.appendChild(cv);
  top.insertAdjacentHTML('beforeend', `<div><div class="pc-name">${p.name}</div><div class="pc-pos">${p.pos}${p.legend ? ' — THE LEGEND' : ''}</div></div>`);
  return div;
}

function renderSquadPanel() {
  const panel = $('#hub-panel-squad');
  panel.innerHTML = '';
  const team = getTeam(SEASON.user);
  const grid = document.createElement('div');
  grid.className = 'squad-grid';
  team.squadFull.forEach(p => grid.appendChild(playerCardEl(p, team)));
  panel.appendChild(grid);
}

/* ---------------- match playback ---------------- */
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
  // scoreboard
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
  // fire events for this minute
  while (M.evIdx < M.sim.events.length && M.sim.events[M.evIdx].min <= M.minute) {
    const ev = M.sim.events[M.evIdx++];
    applyEvent(ev, true);
  }
  if (M.minute >= 90) finishMatch();
  else if (M.minute % 15 === 0) {
    // occasional flavour line
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
  // commit result
  M.fixture.played = true;
  M.fixture.hg = M.sim.hg;
  M.fixture.ag = M.sim.ag;
  // sim the rest of the matchday in background
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
  const ug = isUserHome ? M.sim.hg : M.sim.ag;
  const og = isUserHome ? M.sim.ag : M.sim.hg;
  const won = ug > og, drew = ug === og;

  $('#result-headline').textContent = won ? '🏆 VICTORY!' : drew ? 'ALL SQUARE' : '💔 DEFEAT';
  $('#result-headline').style.color = won ? 'var(--gold)' : drew ? 'var(--cyan)' : 'var(--red)';
  $('#result-score').innerHTML = `${M.home.name}<span class="big-score">${M.sim.hg} — ${M.sim.ag}</span>${M.away.name}`;

  const scorers = M.sim.events.filter(e => e.type === 'goal')
    .map(e => `${e.min}' ${e.player.name} (${e.side === 'home' ? M.home.short : M.away.short})${e.player.legend ? ' ★' : ''}`);
  $('#result-scorers').innerHTML = scorers.length ? scorers.join('<br>') : 'NO GOALS — A DEFENSIVE MASTERCLASS?';

  const um = userMatches();
  const played = um.filter(f => f.played);
  const losses = played.filter(f => (f.home === SEASON.user ? f.hg < f.ag : f.ag < f.hg)).length;
  const draws = played.filter(f => f.hg === f.ag).length;
  let streakMsg = '';
  if (losses === 0 && draws === 0) streakMsg = `★ PERFECT: ${played.length} WINS / ${played.length} GAMES — ${um.length - played.length} TO GO FOR ${um.length}-0 ★`;
  else if (losses === 0) streakMsg = `UNBEATEN IN ${played.length} — INVINCIBLE VIBES`;
  else streakMsg = `RECORD: ${played.length - draws - losses}W ${draws}D ${losses}L`;
  $('#result-streak').textContent = streakMsg;
}

$('#btn-continue').addEventListener('click', () => {
  SFX.nav();
  renderHub();
  show('hub');
});

/* ---------------- custom league builder ---------------- */
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
  DB.forEach(team => {
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

$('#cl-pick-national').addEventListener('click', () => {
  SFX.click();
  DB.filter(t => t.type === 'nation').forEach(t => {
    if (!BUILDER.selected.includes(t.id)) BUILDER.selected.push(t.id);
  });
  if (!BUILDER.userPick) BUILDER.userPick = 'idn';
  refreshBuilderGrid();
});
$('#cl-pick-liga1').addEventListener('click', () => {
  SFX.click();
  DB.filter(t => t.type === 'club').forEach(t => {
    if (!BUILDER.selected.includes(t.id)) BUILDER.selected.push(t.id);
  });
  if (!BUILDER.userPick) BUILDER.userPick = BUILDER.selected[0];
  refreshBuilderGrid();
});
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

/* ---------------- database ---------------- */
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

/* ---------------- legend page ---------------- */
function renderLegend() {
  const stage = $('#legend-stage');
  stage.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'legend-big-card';
  const cv = document.createElement('canvas');
  drawFace(cv, NXRSKYAA, ['#e63946', '#fff'], 160);
  card.appendChild(cv);
  card.insertAdjacentHTML('beforeend', `
    <h3>${NXRSKYAA.name}</h3>
    <div class="lg-ovr">99 OVR</div>
    <div class="lg-pos">FW — TIMNAS INDONESIA ★</div>
    <div class="legend-stats">
      ${Object.entries(NXRSKYAA.stats).map(([k, v]) => `<div>${k}<b>${v}</b></div>`).join('')}
    </div>`);
  stage.appendChild(card);
  stage.insertAdjacentHTML('beforeend', `<p class="legend-lore">${NXRSKYAA.lore}</p>
    <button class="px-btn big gold" onclick="navTo('teamselect')">PLAY AS INDONESIA ►</button>`);
  SFX.legend();
}

/* ---------------- boot ---------------- */
startTitlePitch();
loadSeason();
