/* ============================================================
   NxrLegends — data: teams, squads, the Legend
   All ratings are original NxrLegends gameplay values.
   ============================================================ */

const POSITIONS = ['GK','DF','MF','FW'];

/* ---- The special legend character ---- */
const NXRSKYAA = {
  name: 'NXRSKYAA',
  pos: 'FW',
  ovr: 99,
  legend: true,
  stats: { PAC: 99, SHO: 99, PAS: 99, DRI: 99, DEF: 99, PHY: 99 },
  lore: 'Forged in the warungs of Jakarta and the arcades of the north, ' +
        'NXRSKYAA is the only player in history rated 99 in every stat. ' +
        'When the Legend is on the pitch, the Garuda flies higher. ' +
        'Some say the 38-0 season is impossible. The Legend says: watch me.'
};

/* ---- Timnas Indonesia squad (real national team roster names; ratings are game values) ---- */
const INDONESIA_SQUAD = [
  { name: 'MAARTEN PAES',        pos: 'GK', ovr: 82 },
  { name: 'ERNANDO ARI',         pos: 'GK', ovr: 75 },
  { name: 'JAY IDZES',           pos: 'DF', ovr: 83 },
  { name: 'RIZKY RIDHO',         pos: 'DF', ovr: 78 },
  { name: 'JUSTIN HUBNER',       pos: 'DF', ovr: 79 },
  { name: 'KEVIN DIKS',          pos: 'DF', ovr: 81 },
  { name: 'CALVIN VERDONK',      pos: 'DF', ovr: 79 },
  { name: 'SANDY WALSH',         pos: 'DF', ovr: 77 },
  { name: 'PRATAMA ARHAN',       pos: 'DF', ovr: 74 },
  { name: 'ASNAWI MANGKUALAM',   pos: 'DF', ovr: 75 },
  { name: 'MEES HILGERS',        pos: 'DF', ovr: 82 },
  { name: 'SHAYNE PATTYNAMA',    pos: 'DF', ovr: 74 },
  { name: 'THOM HAYE',           pos: 'MF', ovr: 81 },
  { name: 'IVAR JENNER',         pos: 'MF', ovr: 77 },
  { name: 'MARSELINO FERDINAN',  pos: 'MF', ovr: 78 },
  { name: 'NATHAN TJOE-A-ON',    pos: 'MF', ovr: 76 },
  { name: 'RICKY KAMBUAYA',      pos: 'MF', ovr: 73 },
  { name: 'EGY MAULANA VIKRI',   pos: 'MF', ovr: 74 },
  { name: 'WITAN SULAEMAN',      pos: 'MF', ovr: 74 },
  { name: 'RAFAEL STRUICK',      pos: 'FW', ovr: 77 },
  { name: 'RAGNAR ORATMANGOEN',  pos: 'FW', ovr: 78 },
  { name: 'OLE ROMENY',          pos: 'FW', ovr: 79 },
  { name: 'HOKKY CARAKA',        pos: 'FW', ovr: 72 },
  { name: 'DIMAS DRAJAD',        pos: 'FW', ovr: 72 }
];

/* ---- Name pools for generated squads ---- */
const NAME_POOLS = {
  id:  ['BAGAS','DAFFA','RIO','ANDIKA','SATRIA','GALIH','PUTRA','BAYU','RANGGA','EKA','ARYA','DIMAS','FAJAR','GILANG','REZA','YUDHA','TEGAR','PANJI','BIMA','WAHYU','ADIT','SLAMET','JOKO','AGUS'],
  jp:  ['SATO','SUZUKI','TANAKA','WATANABE','ITO','YAMAMOTO','KOBAYASHI','KATO','YOSHIDA','SASAKI','MATSUMOTO','INOUE','KIMURA','HAYASHI','SHIMIZU','MORI','ABE','IKEDA','OGAWA','GOTO','OKADA','FUJITA'],
  kr:  ['KIM','LEE','PARK','CHOI','JUNG','KANG','CHO','YOON','JANG','LIM','HAN','OH','SEO','SHIN','KWON','HWANG','AHN','SONG','RYU','HONG','JEON','MOON'],
  sa:  ['AL-HARBI','AL-QAHTANI','AL-GHAMDI','AL-ZAHRANI','AL-SHEHRI','AL-MUTAIRI','AL-OTAIBI','AL-DOSARI','AL-SUBAIE','AL-AMRI','AL-JUHANI','AL-MALKI','AL-RASHIDI','AL-YAMI','AL-SHAMRANI','AL-BISHI'],
  au:  ['SMITH','JONES','WILLIAMS','BROWN','WILSON','TAYLOR','JOHNSON','WHITE','MARTIN','ANDERSON','THOMPSON','NGUYEN','WALKER','HARRIS','KELLY','RYAN','KING','MITCHELL'],
  ir:  ['HOSSEINI','AHMADI','MOHAMMADI','REZAEI','MORADI','JAFARI','KARIMI','RAHIMI','SADEGHI','EBRAHIMI','GHOLAMI','SALEHI','HASHEMI','AZIZI','NOROUZI','KAZEMI'],
  qa:  ['AL-ANSARI','AL-KUWARI','AL-SULAITI','AL-EMADI','AL-MARRI','AL-NAIMI','AL-KAABI','AL-HAJRI','AL-MOHANNADI','AL-SUWAIDI','AL-ATTIYAH','AL-MANSOURI'],
  vn:  ['NGUYEN','TRAN','LE','PHAM','HOANG','PHAN','VU','DANG','BUI','DO','HO','NGO','DUONG','LY','TRUONG','DINH'],
  th:  ['SOMCHAI','ANAN','KITTISAK','PRAYUT','THAKSIN','NIRAN','CHAI','KRIT','PONGSAK','SURACHAI','WICHAI','THANAWAT','ARTHIT','NATTAPONG','PITI','DECHA'],
  my:  ['AHMAD','ISMAIL','HASSAN','IBRAHIM','YUSOF','ABDULLAH','RAZAK','OMAR','AZIZ','HAMID','SALLEH','ZAINAL','KAMAL','ROSLI','FAIZAL','SYAFIQ']
};

/* ---- Notable real internationals seeded into national squads (names are facts; ratings are ours) ---- */
const STARS = {
  japan:      [{ name: 'KAORU MITOMA', pos: 'FW', ovr: 85 }, { name: 'TAKEFUSA KUBO', pos: 'MF', ovr: 84 }, { name: 'WATARU ENDO', pos: 'MF', ovr: 82 }],
  southkorea: [{ name: 'SON HEUNG-MIN', pos: 'FW', ovr: 87 }, { name: 'LEE KANG-IN', pos: 'MF', ovr: 84 }, { name: 'KIM MIN-JAE', pos: 'DF', ovr: 85 }],
  saudi:      [{ name: 'SALEM AL-DAWSARI', pos: 'FW', ovr: 82 }, { name: 'FIRAS AL-BURAIKAN', pos: 'FW', ovr: 77 }],
  australia:  [{ name: 'JACKSON IRVINE', pos: 'MF', ovr: 77 }, { name: 'MAT RYAN', pos: 'GK', ovr: 78 }],
  iran:       [{ name: 'MEHDI TAREMI', pos: 'FW', ovr: 83 }, { name: 'SARDAR AZMOUN', pos: 'FW', ovr: 80 }],
  qatar:      [{ name: 'AKRAM AFIF', pos: 'FW', ovr: 82 }, { name: 'ALMOEZ ALI', pos: 'FW', ovr: 79 }],
  vietnam:    [{ name: 'NGUYEN QUANG HAI', pos: 'MF', ovr: 74 }, { name: 'NGUYEN TIEN LINH', pos: 'FW', ovr: 72 }],
  thailand:   [{ name: 'CHANATHIP SONGKRASIN', pos: 'MF', ovr: 75 }, { name: 'SUPACHOK SARACHAT', pos: 'MF', ovr: 73 }],
  malaysia:   [{ name: 'ARIF AIMAN', pos: 'FW', ovr: 73 }, { name: 'FAISAL HALIM', pos: 'FW', ovr: 71 }]
};

/* ---- Teams ----
   type: 'nation' | 'club'
   colors: [shirt, shorts/accent]
   base: average squad strength used to generate players
*/
const TEAMS = [
  { id: 'idn', name: 'INDONESIA',      short: 'IDN', type: 'nation', colors: ['#e63946', '#ffffff'], base: 78, pool: 'id', squad: INDONESIA_SQUAD, hasLegend: true,
    desc: 'TIMNAS GARUDA — THE HOME OF THE LEGEND' },
  { id: 'jpn', name: 'JAPAN',          short: 'JPN', type: 'nation', colors: ['#1b3fa0', '#ffffff'], base: 82, pool: 'jp', stars: 'japan',      desc: 'SAMURAI BLUE' },
  { id: 'kor', name: 'SOUTH KOREA',    short: 'KOR', type: 'nation', colors: ['#d40000', '#0b1020'], base: 81, pool: 'kr', stars: 'southkorea', desc: 'TAEGEUK WARRIORS' },
  { id: 'ksa', name: 'SAUDI ARABIA',   short: 'KSA', type: 'nation', colors: ['#0a7a3c', '#ffffff'], base: 78, pool: 'sa', stars: 'saudi',      desc: 'THE GREEN FALCONS' },
  { id: 'aus', name: 'AUSTRALIA',      short: 'AUS', type: 'nation', colors: ['#ffb400', '#0a5c36'], base: 77, pool: 'au', stars: 'australia',  desc: 'THE SOCCEROOS' },
  { id: 'irn', name: 'IRAN',           short: 'IRN', type: 'nation', colors: ['#f5f5f5', '#d40000'], base: 79, pool: 'ir', stars: 'iran',       desc: 'TEAM MELLI' },
  { id: 'qat', name: 'QATAR',          short: 'QAT', type: 'nation', colors: ['#7a1029', '#ffffff'], base: 76, pool: 'qa', stars: 'qatar',      desc: 'THE MAROONS' },
  { id: 'vnm', name: 'VIETNAM',        short: 'VNM', type: 'nation', colors: ['#d40000', '#ffd23f'], base: 72, pool: 'vn', stars: 'vietnam',    desc: 'GOLDEN STAR WARRIORS' },
  { id: 'tha', name: 'THAILAND',       short: 'THA', type: 'nation', colors: ['#12295e', '#d40000'], base: 72, pool: 'th', stars: 'thailand',   desc: 'THE WAR ELEPHANTS' },
  { id: 'mys', name: 'MALAYSIA',       short: 'MYS', type: 'nation', colors: ['#ffd23f', '#0b1020'], base: 70, pool: 'my', stars: 'malaysia',   desc: 'HARIMAU MALAYA' },

  { id: 'psj', name: 'PERSIJA JAKARTA', short: 'PSJ', type: 'club', colors: ['#e63946', '#ff8c00'], base: 74, pool: 'id', desc: 'MACAN KEMAYORAN' },
  { id: 'psb', name: 'PERSIB BANDUNG',  short: 'PSB', type: 'club', colors: ['#1b6fd6', '#ffffff'], base: 75, pool: 'id', desc: 'MAUNG BANDUNG' },
  { id: 'arm', name: 'AREMA FC',        short: 'ARM', type: 'club', colors: ['#12295e', '#38e1ff'], base: 71, pool: 'id', desc: 'SINGO EDAN' },
  { id: 'pby', name: 'PERSEBAYA',       short: 'PBY', type: 'club', colors: ['#0a7a3c', '#ffffff'], base: 72, pool: 'id', desc: 'BAJUL IJO' },
  { id: 'bli', name: 'BALI UNITED',     short: 'BLI', type: 'club', colors: ['#d40000', '#0b1020'], base: 73, pool: 'id', desc: 'SERDADU TRIDATU' },
  { id: 'psm', name: 'PSM MAKASSAR',    short: 'PSM', type: 'club', colors: ['#d40000', '#ffffff'], base: 72, pool: 'id', desc: 'JUKU EJA' },
  { id: 'brn', name: 'BORNEO FC',       short: 'BRN', type: 'club', colors: ['#ff8c00', '#0b1020'], base: 73, pool: 'id', desc: 'PESUT ETAM' },
  { id: 'dwu', name: 'DEWA UNITED',     short: 'DWU', type: 'club', colors: ['#ffd23f', '#0b1020'], base: 70, pool: 'id', desc: 'BANTEN WARRIORS' },
  { id: 'mdu', name: 'MADURA UNITED',   short: 'MDU', type: 'club', colors: ['#d40000', '#ffd23f'], base: 70, pool: 'id', desc: 'LASKAR SAPE KERRAB' },
  { id: 'pss', name: 'PSS SLEMAN',      short: 'PSS', type: 'club', colors: ['#0a7a3c', '#ffd23f'], base: 69, pool: 'id', desc: 'SUPER ELANG JAWA' }
];

/* ---- deterministic-ish RNG ---- */
function rndInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/* ---- squad generation ---- */
function statsFor(pos, ovr) {
  const j = () => rndInt(-6, 6);
  const clamp = v => Math.max(30, Math.min(99, v));
  const s = { PAC: ovr + j(), SHO: ovr + j(), PAS: ovr + j(), DRI: ovr + j(), DEF: ovr + j(), PHY: ovr + j() };
  if (pos === 'GK') { s.DEF = clamp(ovr + 8); s.SHO = clamp(ovr - 25); s.PAC = clamp(ovr - 15); }
  if (pos === 'DF') { s.DEF = clamp(ovr + 6); s.SHO = clamp(ovr - 12); }
  if (pos === 'MF') { s.PAS = clamp(ovr + 6); s.DRI = clamp(ovr + 3); }
  if (pos === 'FW') { s.SHO = clamp(ovr + 6); s.PAC = clamp(ovr + 4); s.DEF = clamp(ovr - 18); }
  Object.keys(s).forEach(k => s[k] = clamp(s[k]));
  return s;
}

function buildSquad(team) {
  const squad = [];
  const layout = [['GK', 2], ['DF', 6], ['MF', 6], ['FW', 4]];
  const named = new Set();

  if (team.squad) {
    team.squad.forEach(p => {
      squad.push({ ...p, stats: statsFor(p.pos, p.ovr) });
      named.add(p.name);
    });
  } else {
    if (team.stars && STARS[team.stars]) {
      STARS[team.stars].forEach(p => {
        squad.push({ ...p, stats: statsFor(p.pos, p.ovr) });
        named.add(p.name);
      });
    }
    const pool = NAME_POOLS[team.pool] || NAME_POOLS.id;
    layout.forEach(([pos, count]) => {
      const have = squad.filter(p => p.pos === pos).length;
      for (let i = have; i < count; i++) {
        let nm;
        do { nm = pick(pool) + ' ' + pick(pool); } while (named.has(nm));
        named.add(nm);
        const ovr = Math.max(58, Math.min(90, team.base + rndInt(-6, 5)));
        squad.push({ name: nm, pos, ovr, stats: statsFor(pos, ovr) });
      }
    });
  }

  if (team.hasLegend) {
    squad.unshift({ ...NXRSKYAA, stats: { ...NXRSKYAA.stats } });
  }
  squad.sort((a, b) => (b.legend ? 1 : 0) - (a.legend ? 1 : 0) || b.ovr - a.ovr);
  return squad;
}

/* team strength = weighted best XI, legend counts big */
function teamStrength(team) {
  const xi = bestXI(team.squadFull);
  const avg = xi.reduce((s, p) => s + p.ovr, 0) / xi.length;
  return avg;
}

function bestXI(squad) {
  const by = pos => squad.filter(p => p.pos === pos).sort((a, b) => b.ovr - a.ovr);
  return [...by('GK').slice(0, 1), ...by('DF').slice(0, 4), ...by('MF').slice(0, 4), ...by('FW').slice(0, 2)];
}

/* materialise all squads once */
const DB = TEAMS.map(t => {
  const team = { ...t };
  team.squadFull = buildSquad(team);
  team.str = 0;
  return team;
});
DB.forEach(t => t.str = teamStrength(t));

function getTeam(id) { return DB.find(t => t.id === id); }
