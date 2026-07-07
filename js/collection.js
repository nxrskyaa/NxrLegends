/* ============================================================
   NxrLegends — collection, coins, gacha packs, user club
   ============================================================ */

const COLL_KEY = 'nxrlegends-collection-v1';

/* formations: ordered slot positions + layout coords (percent of pitch, vertical view, attacking up) */
const FORMATIONS = {
  '4-4-2': { slots: ['GK','DF','DF','DF','DF','MF','MF','MF','MF','FW','FW'],
    xy: [[50,90],[15,72],[38,75],[62,75],[85,72],[15,48],[38,52],[62,52],[85,48],[38,22],[62,22]] },
  '4-3-3': { slots: ['GK','DF','DF','DF','DF','MF','MF','MF','FW','FW','FW'],
    xy: [[50,90],[15,72],[38,75],[62,75],[85,72],[28,50],[50,54],[72,50],[20,24],[50,18],[80,24]] },
  '3-5-2': { slots: ['GK','DF','DF','DF','MF','MF','MF','MF','MF','FW','FW'],
    xy: [[50,90],[25,74],[50,76],[75,74],[10,48],[32,52],[50,56],[68,52],[90,48],[38,22],[62,22]] },
  '5-3-2': { slots: ['GK','DF','DF','DF','DF','DF','MF','MF','MF','FW','FW'],
    xy: [[50,90],[10,68],[30,75],[50,77],[70,75],[90,68],[28,48],[50,52],[72,48],[38,22],[62,22]] }
};

/* pack definitions */
const PACKS = {
  bronze: { name: 'BRONZE PACK', cost: 400,  cards: 3, min: 58, max: 72, legendChance: 0,     iconChance: 0,    desc: '3 PLAYERS · OVR 58-72',                 color: '#b06f3a' },
  silver: { name: 'SILVER PACK', cost: 1000, cards: 3, min: 68, max: 80, legendChance: 0,     iconChance: 0,    desc: '3 PLAYERS · OVR 68-80',                 color: '#b9c4d6' },
  gold:   { name: 'GOLD PACK',   cost: 2500, cards: 4, min: 75, max: 88, legendChance: 0.015, iconChance: 0.05, desc: '4 PLAYERS · OVR 75+ · 5% ICON · 1.5% NXR', color: '#ffd23f' },
  legend: { name: 'LEGEND PACK', cost: 8000, cards: 5, min: 82, max: 90, legendChance: 0.05,  iconChance: 0.22, desc: '5 PLAYERS · OVR 82+ · 22% ICON · 5% NXR',  color: '#ff9df5' }
};

/* custom tactics */
const MENTALITIES = {
  defensive: { name: 'DEFENSIVE',   att: -0.12, def: 0.16,  desc: 'SIT DEEP, SOAK PRESSURE, HIT ON THE BREAK' },
  balanced:  { name: 'BALANCED',    att: 0,     def: 0,     desc: 'SOLID SHAPE, CONTROL BOTH BOXES' },
  attacking: { name: 'ATTACKING',   att: 0.16,  def: -0.09, desc: 'PUSH NUMBERS FORWARD, TAKE THE GAME TO THEM' },
  allout:    { name: 'ALL-OUT',     att: 0.32,  def: -0.24, desc: 'TOTAL RISK — CHASE GOALS, LEAVE GAPS' }
};
const PRESSING = {
  low:    { name: 'LOW BLOCK',  press: -0.10, desc: 'CONSERVE ENERGY, STAY COMPACT' },
  medium: { name: 'MEDIUM',     press: 0,     desc: 'BALANCED PRESS, PICK YOUR MOMENTS' },
  high:   { name: 'HIGH PRESS', press: 0.15,  desc: 'WIN IT HIGH — MORE CHANCES, MORE RISK' }
};
function defaultTactics() { return { mentality: 'balanced', pressing: 'medium' }; }

const ACADEMY_KID = { name: 'ACADEMY KID', pos: 'ANY', ovr: 45, stats: { PAC: 45, SHO: 45, PAS: 45, DRI: 45, DEF: 45, PHY: 45 }, pid: 'kid' };

let COLL = null;

function defaultCollection() {
  return { coins: 1500, club: 'NXR FC', colors: ['#ffd23f', '#e63946'], formation: '4-4-2', owned: [], xi: [], tactics: defaultTactics() };
}

function loadCollection() {
  try {
    const raw = localStorage.getItem(COLL_KEY);
    if (raw) { COLL = JSON.parse(raw); if (!COLL.tactics) COLL.tactics = defaultTactics(); return; }
  } catch (e) {}
  COLL = defaultCollection();
  grantStarterSquad();
  saveCollection();
}
function saveCollection() { try { localStorage.setItem(COLL_KEY, JSON.stringify(COLL)); } catch (e) {} }

/* starter: 14 budget players, guaranteed 3 Timnas Indonesia, positions covered */
function grantStarterSquad() {
  const cheap = GACHA_POOL.filter(p => p.ovr <= 72);
  const byPos = pos => cheap.filter(p => p.pos === pos && !COLL.owned.includes(p.pid));
  const take = (pos, n) => {
    for (let i = 0; i < n; i++) {
      const c = byPos(pos);
      if (!c.length) break;
      COLL.owned.push(pick(c).pid);
    }
  };
  // 3 Garuda starters for flavour
  const idn = GACHA_POOL.filter(p => p.teamId === 'idn' && p.ovr <= 75);
  for (let i = 0; i < 3 && idn.length; i++) {
    const p = pick(idn.filter(x => !COLL.owned.includes(x.pid)));
    if (p) COLL.owned.push(p.pid);
  }
  take('GK', 2); take('DF', 5); take('MF', 4); take('FW', 3);
  autoBestXI();
}

/* ---------------- gacha ---------------- */
function openPack(key) {
  const pack = PACKS[key];
  if (!pack || COLL.coins < pack.cost) return null;
  COLL.coins -= pack.cost;
  const pulls = [];
  for (let i = 0; i < pack.cards; i++) {
    let player;
    const roll = Math.random();
    if (pack.legendChance > 0 && roll < pack.legendChance) {
      player = PLAYER_INDEX['idn:0'].player; // NXRSKYAA — the one and only 99
    } else if (pack.iconChance > 0 && roll < pack.legendChance + pack.iconChance) {
      player = pick(ICON_POOL); // Ronaldo, Messi, Zidane, Ibrahimovic...
    } else {
      const pool = GACHA_POOL.filter(p => p.ovr >= pack.min && p.ovr <= pack.max);
      player = pick(pool);
    }
    const dupe = COLL.owned.includes(player.pid);
    let refund = 0;
    if (dupe) { refund = sellValue(player); COLL.coins += refund; }
    else COLL.owned.push(player.pid);
    pulls.push({ player, dupe, refund });
  }
  saveCollection();
  return pulls;
}

/* ---------------- squad management ---------------- */
function ownedPlayers() { return COLL.owned.map(pid => PLAYER_INDEX[pid] && PLAYER_INDEX[pid].player).filter(Boolean); }

function slotList() { return FORMATIONS[COLL.formation].slots; }

function setFormation(f) {
  if (!FORMATIONS[f]) return;
  COLL.formation = f;
  autoBestXI();
  saveCollection();
}

function autoBestXI() {
  const slots = slotList();
  const avail = ownedPlayers().sort((a, b) => b.ovr - a.ovr);
  const used = new Set();
  COLL.xi = slots.map(pos => {
    const p = avail.find(x => x.pos === pos && !used.has(x.pid));
    if (p) { used.add(p.pid); return p.pid; }
    return null;
  });
}

function assignSlot(slotIdx, pid) {
  const slots = slotList();
  if (pid !== null) {
    const p = PLAYER_INDEX[pid] && PLAYER_INDEX[pid].player;
    if (!p || p.pos !== slots[slotIdx]) return false;
    const existing = COLL.xi.indexOf(pid);
    if (existing !== -1) COLL.xi[existing] = COLL.xi[slotIdx]; // swap
  }
  COLL.xi[slotIdx] = pid;
  saveCollection();
  return true;
}

function sellPlayer(pid) {
  const entry = PLAYER_INDEX[pid];
  if (!entry) return 0;
  if (COLL.xi.includes(pid)) return -1; // in XI, refuse
  const i = COLL.owned.indexOf(pid);
  if (i === -1) return 0;
  COLL.owned.splice(i, 1);
  const v = sellValue(entry.player);
  COLL.coins += v;
  saveCollection();
  return v;
}

/* XI resolved to player objects; empty slots become academy kids */
function resolvedXI() {
  const slots = slotList();
  return COLL.xi.map((pid, i) => {
    const p = pid && PLAYER_INDEX[pid] ? PLAYER_INDEX[pid].player : null;
    return p || { ...ACADEMY_KID, pos: slots[i] };
  });
}

function squadOVR() {
  const xi = resolvedXI();
  return Math.round(xi.reduce((s, p) => s + p.ovr, 0) / xi.length);
}

/* dynamic user club object, engine-compatible */
function getUserTeam() {
  const xi = resolvedXI();
  const team = {
    id: USER_TEAM_ID,
    name: COLL.club || 'NXR FC',
    short: (COLL.club || 'NXR').replace(/[^A-Z0-9]/gi, '').slice(0, 3).toUpperCase() || 'NXR',
    type: 'user',
    colors: COLL.colors,
    desc: 'YOUR CLUB — BUILT FROM PACKS',
    hasLegend: xi.some(p => p.legend),
    squadFull: xi,
    tactics: COLL.tactics || defaultTactics(),
    str: 0
  };
  team.str = xi.reduce((s, p) => s + p.ovr, 0) / xi.length;
  return team;
}

function setTactic(kind, value) {
  if (kind === 'mentality' && MENTALITIES[value]) COLL.tactics.mentality = value;
  if (kind === 'pressing' && PRESSING[value]) COLL.tactics.pressing = value;
  saveCollection();
}

/* match rewards */
function matchReward(won, drew, goals) {
  const c = won ? 400 + goals * 40 : drew ? 150 : 60;
  COLL.coins += c;
  saveCollection();
  return c;
}
