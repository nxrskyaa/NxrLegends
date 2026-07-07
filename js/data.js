/* ============================================================
   NxrLegends — data: teams, squads, gacha pool, the Legend
   All ratings are original NxrLegends gameplay values.
   Squad generation is seeded so player IDs stay stable
   across sessions (required for the gacha collection).
   ============================================================ */

const POSITIONS = ['GK','DF','MF','FW'];
const USER_TEAM_ID = 'usr';

/* ---- seeded PRNG (mulberry32) for stable database ---- */
function mulberry32(a) {
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const dbRand = mulberry32(0x38a0);
function rndInt(a, b) { return a + Math.floor(dbRand() * (b - a + 1)); }
function pickSeeded(arr) { return arr[Math.floor(dbRand() * arr.length)]; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

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

/* ---- Hall of Legends: iconic players as gacha legend pulls (names are facts; ratings are ours) ---- */
const LEGENDS_SQUAD = [
  { name: 'GIANLUIGI BUFFON',   pos: 'GK', ovr: 92, icon: true },
  { name: 'IKER CASILLAS',      pos: 'GK', ovr: 92, icon: true },
  { name: 'PAOLO MALDINI',      pos: 'DF', ovr: 94, icon: true },
  { name: 'FABIO CANNAVARO',    pos: 'DF', ovr: 92, icon: true },
  { name: 'CARLES PUYOL',       pos: 'DF', ovr: 91, icon: true },
  { name: 'ROBERTO CARLOS',     pos: 'DF', ovr: 92, icon: true },
  { name: 'CAFU',               pos: 'DF', ovr: 91, icon: true },
  { name: 'RIO FERDINAND',      pos: 'DF', ovr: 91, icon: true },
  { name: 'ZINEDINE ZIDANE',    pos: 'MF', ovr: 95, icon: true },
  { name: 'XAVI',               pos: 'MF', ovr: 93, icon: true },
  { name: 'ANDRES INIESTA',     pos: 'MF', ovr: 93, icon: true },
  { name: 'RONALDINHO',         pos: 'MF', ovr: 93, icon: true },
  { name: 'ANDREA PIRLO',       pos: 'MF', ovr: 92, icon: true },
  { name: 'STEVEN GERRARD',     pos: 'MF', ovr: 92, icon: true },
  { name: 'FRANK LAMPARD',      pos: 'MF', ovr: 91, icon: true },
  { name: 'DAVID BECKHAM',      pos: 'MF', ovr: 91, icon: true },
  { name: 'CRISTIANO RONALDO',  pos: 'FW', ovr: 94, icon: true },
  { name: 'LIONEL MESSI',       pos: 'FW', ovr: 94, icon: true },
  { name: 'RONALDO NAZARIO',    pos: 'FW', ovr: 94, icon: true },
  { name: 'THIERRY HENRY',      pos: 'FW', ovr: 93, icon: true },
  { name: 'ZLATAN IBRAHIMOVIC', pos: 'FW', ovr: 92, icon: true },
  { name: 'DIDIER DROGBA',      pos: 'FW', ovr: 91, icon: true },
  { name: 'WAYNE ROONEY',       pos: 'FW', ovr: 91, icon: true },
  { name: 'GABRIEL BATISTUTA',  pos: 'FW', ovr: 91, icon: true }
];

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

/* ---- Name pools for generated squad fillers ---- */
const NAME_POOLS = {
  id:  ['BAGAS','DAFFA','RIO','ANDIKA','SATRIA','GALIH','PUTRA','BAYU','RANGGA','EKA','ARYA','DIMAS','FAJAR','GILANG','REZA','YUDHA','TEGAR','PANJI','BIMA','WAHYU','ADIT','SLAMET','JOKO','AGUS'],
  en:  ['HARRISON','CARTER','BENNETT','WRIGHT','COLE','TURNER','HUGHES','MORGAN','DAVIES','CLARKE','FOSTER','GRAY','BAKER','KNIGHT','SHAW','DEAN','PARKER','REED','WEBB','HOLT','BARNES','DAY','FINCH','STONE'],
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

/* ---- Notable real players seeded into squads (names are facts; ratings are ours) ---- */
const STARS = {
  japan:      [{ name: 'KAORU MITOMA', pos: 'FW', ovr: 85 }, { name: 'TAKEFUSA KUBO', pos: 'MF', ovr: 84 }, { name: 'WATARU ENDO', pos: 'MF', ovr: 82 }],
  southkorea: [{ name: 'SON HEUNG-MIN', pos: 'FW', ovr: 87 }, { name: 'LEE KANG-IN', pos: 'MF', ovr: 84 }, { name: 'KIM MIN-JAE', pos: 'DF', ovr: 85 }],
  saudi:      [{ name: 'SALEM AL-DAWSARI', pos: 'FW', ovr: 82 }, { name: 'FIRAS AL-BURAIKAN', pos: 'FW', ovr: 77 }],
  australia:  [{ name: 'JACKSON IRVINE', pos: 'MF', ovr: 77 }, { name: 'MAT RYAN', pos: 'GK', ovr: 78 }],
  iran:       [{ name: 'MEHDI TAREMI', pos: 'FW', ovr: 83 }, { name: 'SARDAR AZMOUN', pos: 'FW', ovr: 80 }],
  qatar:      [{ name: 'AKRAM AFIF', pos: 'FW', ovr: 82 }, { name: 'ALMOEZ ALI', pos: 'FW', ovr: 79 }],
  vietnam:    [{ name: 'NGUYEN QUANG HAI', pos: 'MF', ovr: 74 }, { name: 'NGUYEN TIEN LINH', pos: 'FW', ovr: 72 }],
  thailand:   [{ name: 'CHANATHIP SONGKRASIN', pos: 'MF', ovr: 75 }, { name: 'SUPACHOK SARACHAT', pos: 'MF', ovr: 73 }],
  malaysia:   [{ name: 'ARIF AIMAN', pos: 'FW', ovr: 73 }, { name: 'FAISAL HALIM', pos: 'FW', ovr: 71 }],

  arsenal:    [{ name: 'BUKAYO SAKA', pos: 'FW', ovr: 87 }, { name: 'MARTIN ODEGAARD', pos: 'MF', ovr: 87 }, { name: 'DECLAN RICE', pos: 'MF', ovr: 86 }, { name: 'WILLIAM SALIBA', pos: 'DF', ovr: 87 }, { name: 'DAVID RAYA', pos: 'GK', ovr: 84 }],
  villa:      [{ name: 'OLLIE WATKINS', pos: 'FW', ovr: 84 }, { name: 'EMILIANO MARTINEZ', pos: 'GK', ovr: 84 }, { name: 'MORGAN ROGERS', pos: 'MF', ovr: 80 }],
  bournemouth:[{ name: 'ANTOINE SEMENYO', pos: 'FW', ovr: 80 }, { name: 'JUSTIN KLUIVERT', pos: 'MF', ovr: 78 }],
  brentford:  [{ name: 'BRYAN MBEUMO', pos: 'FW', ovr: 81 }, { name: 'YOANE WISSA', pos: 'FW', ovr: 79 }],
  brighton:   [{ name: 'KAORU MITOMA', pos: 'FW', ovr: 85 }, { name: 'JOAO PEDRO', pos: 'FW', ovr: 81 }, { name: 'CARLOS BALEBA', pos: 'MF', ovr: 79 }],
  chelsea:    [{ name: 'COLE PALMER', pos: 'MF', ovr: 87 }, { name: 'MOISES CAICEDO', pos: 'MF', ovr: 85 }, { name: 'ENZO FERNANDEZ', pos: 'MF', ovr: 84 }, { name: 'NICOLAS JACKSON', pos: 'FW', ovr: 80 }],
  palace:     [{ name: 'EBERECHI EZE', pos: 'MF', ovr: 83 }, { name: 'MARC GUEHI', pos: 'DF', ovr: 82 }, { name: 'JEAN-PHILIPPE MATETA', pos: 'FW', ovr: 80 }],
  everton:    [{ name: 'JORDAN PICKFORD', pos: 'GK', ovr: 83 }, { name: 'JARRAD BRANTHWAITE', pos: 'DF', ovr: 80 }, { name: 'DOMINIC CALVERT-LEWIN', pos: 'FW', ovr: 76 }],
  fulham:     [{ name: 'BERND LENO', pos: 'GK', ovr: 80 }, { name: 'ALEX IWOBI', pos: 'MF', ovr: 78 }, { name: 'RAUL JIMENEZ', pos: 'FW', ovr: 77 }],
  liverpool:  [{ name: 'MOHAMED SALAH', pos: 'FW', ovr: 89 }, { name: 'VIRGIL VAN DIJK', pos: 'DF', ovr: 88 }, { name: 'ALISSON BECKER', pos: 'GK', ovr: 87 }, { name: 'ALEXIS MAC ALLISTER', pos: 'MF', ovr: 85 }, { name: 'DOMINIK SZOBOSZLAI', pos: 'MF', ovr: 83 }],
  mancity:    [{ name: 'ERLING HAALAND', pos: 'FW', ovr: 90 }, { name: 'RODRI', pos: 'MF', ovr: 89 }, { name: 'KEVIN DE BRUYNE', pos: 'MF', ovr: 88 }, { name: 'PHIL FODEN', pos: 'MF', ovr: 86 }, { name: 'EDERSON', pos: 'GK', ovr: 85 }],
  manutd:     [{ name: 'BRUNO FERNANDES', pos: 'MF', ovr: 86 }, { name: 'KOBBIE MAINOO', pos: 'MF', ovr: 79 }, { name: 'AMAD DIALLO', pos: 'FW', ovr: 79 }, { name: 'ANDRE ONANA', pos: 'GK', ovr: 80 }],
  newcastle:  [{ name: 'ALEXANDER ISAK', pos: 'FW', ovr: 86 }, { name: 'BRUNO GUIMARAES', pos: 'MF', ovr: 84 }, { name: 'ANTHONY GORDON', pos: 'FW', ovr: 82 }],
  forest:     [{ name: 'MORGAN GIBBS-WHITE', pos: 'MF', ovr: 80 }, { name: 'CHRIS WOOD', pos: 'FW', ovr: 78 }, { name: 'MATZ SELS', pos: 'GK', ovr: 79 }],
  spurs:      [{ name: 'SON HEUNG-MIN', pos: 'FW', ovr: 87 }, { name: 'CRISTIAN ROMERO', pos: 'DF', ovr: 84 }, { name: 'DEJAN KULUSEVSKI', pos: 'MF', ovr: 83 }, { name: 'JAMES MADDISON', pos: 'MF', ovr: 82 }],
  westham:    [{ name: 'JARROD BOWEN', pos: 'FW', ovr: 82 }, { name: 'LUCAS PAQUETA', pos: 'MF', ovr: 82 }],
  wolves:     [{ name: 'MATHEUS CUNHA', pos: 'FW', ovr: 82 }, { name: 'RAYAN AIT-NOURI', pos: 'DF', ovr: 79 }, { name: 'JOSE SA', pos: 'GK', ovr: 79 }],
  leicester:  [{ name: 'JAMIE VARDY', pos: 'FW', ovr: 77 }, { name: 'WILFRED NDIDI', pos: 'MF', ovr: 76 }],
  southampton:[{ name: 'AARON RAMSDALE', pos: 'GK', ovr: 78 }, { name: 'TYLER DIBLING', pos: 'MF', ovr: 74 }]
};

/* ---- Teams ----
   type: 'nation' | 'club' | 'epl'
   colors: [shirt, shorts/accent]
   base: average strength used to generate filler players
*/
const TEAMS = [
  { id: 'idn', name: 'INDONESIA',      short: 'IDN', type: 'nation', colors: ['#e63946', '#ffffff'], base: 78, pool: 'id', squad: INDONESIA_SQUAD, hasLegend: true,
    desc: 'TIMNAS GARUDA — THE HOME OF THE LEGEND' },
  { id: 'leg', name: 'HALL OF LEGENDS', short: 'LEG', type: 'legends', colors: ['#ffd23f', '#0b1020'], base: 92, pool: 'en', squad: LEGENDS_SQUAD,
    desc: 'THE GREATEST OF ALL TIME — FINAL BOSS' },

  /* --- English league clubs --- */
  { id: 'ars', name: 'ARSENAL',        short: 'ARS', type: 'epl', colors: ['#e63946', '#ffffff'], base: 83, pool: 'en', stars: 'arsenal',     desc: 'THE GUNNERS' },
  { id: 'avl', name: 'ASTON VILLA',    short: 'AVL', type: 'epl', colors: ['#7a1029', '#8fd0ff'], base: 79, pool: 'en', stars: 'villa',       desc: 'THE VILLANS' },
  { id: 'bou', name: 'BOURNEMOUTH',    short: 'BOU', type: 'epl', colors: ['#d40000', '#0b1020'], base: 76, pool: 'en', stars: 'bournemouth', desc: 'THE CHERRIES' },
  { id: 'bre', name: 'BRENTFORD',      short: 'BRE', type: 'epl', colors: ['#e63946', '#ffffff'], base: 76, pool: 'en', stars: 'brentford',   desc: 'THE BEES' },
  { id: 'bha', name: 'BRIGHTON',       short: 'BHA', type: 'epl', colors: ['#1b6fd6', '#ffffff'], base: 78, pool: 'en', stars: 'brighton',    desc: 'THE SEAGULLS' },
  { id: 'che', name: 'CHELSEA',        short: 'CHE', type: 'epl', colors: ['#1b3fa0', '#ffffff'], base: 81, pool: 'en', stars: 'chelsea',     desc: 'THE BLUES' },
  { id: 'cry', name: 'CRYSTAL PALACE', short: 'CRY', type: 'epl', colors: ['#1b3fa0', '#d40000'], base: 77, pool: 'en', stars: 'palace',      desc: 'THE EAGLES' },
  { id: 'eve', name: 'EVERTON',        short: 'EVE', type: 'epl', colors: ['#12295e', '#ffffff'], base: 76, pool: 'en', stars: 'everton',     desc: 'THE TOFFEES' },
  { id: 'ful', name: 'FULHAM',         short: 'FUL', type: 'epl', colors: ['#f5f5f5', '#0b1020'], base: 76, pool: 'en', stars: 'fulham',      desc: 'THE COTTAGERS' },
  { id: 'liv', name: 'LIVERPOOL',      short: 'LIV', type: 'epl', colors: ['#d40000', '#ffffff'], base: 84, pool: 'en', stars: 'liverpool',   desc: 'THE REDS' },
  { id: 'mci', name: 'MAN CITY',       short: 'MCI', type: 'epl', colors: ['#8fd0ff', '#ffffff'], base: 84, pool: 'en', stars: 'mancity',     desc: 'THE CITIZENS' },
  { id: 'mun', name: 'MAN UNITED',     short: 'MUN', type: 'epl', colors: ['#d40000', '#0b1020'], base: 79, pool: 'en', stars: 'manutd',      desc: 'THE RED DEVILS' },
  { id: 'new', name: 'NEWCASTLE',      short: 'NEW', type: 'epl', colors: ['#0b1020', '#ffffff'], base: 80, pool: 'en', stars: 'newcastle',   desc: 'THE MAGPIES' },
  { id: 'nfo', name: 'NOTTM FOREST',   short: 'NFO', type: 'epl', colors: ['#d40000', '#ffffff'], base: 77, pool: 'en', stars: 'forest',      desc: 'THE TRICKY TREES' },
  { id: 'tot', name: 'TOTTENHAM',      short: 'TOT', type: 'epl', colors: ['#f5f5f5', '#12295e'], base: 80, pool: 'en', stars: 'spurs',       desc: 'THE LILYWHITES' },
  { id: 'whu', name: 'WEST HAM',       short: 'WHU', type: 'epl', colors: ['#7a1029', '#8fd0ff'], base: 77, pool: 'en', stars: 'westham',     desc: 'THE HAMMERS' },
  { id: 'wol', name: 'WOLVES',         short: 'WOL', type: 'epl', colors: ['#ffb400', '#0b1020'], base: 76, pool: 'en', stars: 'wolves',      desc: 'THE WANDERERS' },
  { id: 'lei', name: 'LEICESTER',      short: 'LEI', type: 'epl', colors: ['#1b6fd6', '#ffffff'], base: 74, pool: 'en', stars: 'leicester',   desc: 'THE FOXES' },
  { id: 'sou', name: 'SOUTHAMPTON',    short: 'SOU', type: 'epl', colors: ['#d40000', '#ffffff'], base: 72, pool: 'en', stars: 'southampton', desc: 'THE SAINTS' },

  /* --- Asian national teams --- */
  { id: 'jpn', name: 'JAPAN',          short: 'JPN', type: 'nation', colors: ['#1b3fa0', '#ffffff'], base: 82, pool: 'jp', stars: 'japan',      desc: 'SAMURAI BLUE' },
  { id: 'kor', name: 'SOUTH KOREA',    short: 'KOR', type: 'nation', colors: ['#d40000', '#0b1020'], base: 81, pool: 'kr', stars: 'southkorea', desc: 'TAEGEUK WARRIORS' },
  { id: 'ksa', name: 'SAUDI ARABIA',   short: 'KSA', type: 'nation', colors: ['#0a7a3c', '#ffffff'], base: 78, pool: 'sa', stars: 'saudi',      desc: 'THE GREEN FALCONS' },
  { id: 'aus', name: 'AUSTRALIA',      short: 'AUS', type: 'nation', colors: ['#ffb400', '#0a5c36'], base: 77, pool: 'au', stars: 'australia',  desc: 'THE SOCCEROOS' },
  { id: 'irn', name: 'IRAN',           short: 'IRN', type: 'nation', colors: ['#f5f5f5', '#d40000'], base: 79, pool: 'ir', stars: 'iran',       desc: 'TEAM MELLI' },
  { id: 'qat', name: 'QATAR',          short: 'QAT', type: 'nation', colors: ['#7a1029', '#ffffff'], base: 76, pool: 'qa', stars: 'qatar',      desc: 'THE MAROONS' },
  { id: 'vnm', name: 'VIETNAM',        short: 'VNM', type: 'nation', colors: ['#d40000', '#ffd23f'], base: 72, pool: 'vn', stars: 'vietnam',    desc: 'GOLDEN STAR WARRIORS' },
  { id: 'tha', name: 'THAILAND',       short: 'THA', type: 'nation', colors: ['#12295e', '#d40000'], base: 72, pool: 'th', stars: 'thailand',   desc: 'THE WAR ELEPHANTS' },
  { id: 'mys', name: 'MALAYSIA',       short: 'MYS', type: 'nation', colors: ['#ffd23f', '#0b1020'], base: 70, pool: 'my', stars: 'malaysia',   desc: 'HARIMAU MALAYA' },

  /* --- Liga 1 clubs --- */
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

const EPL_IDS = TEAMS.filter(t => t.type === 'epl').map(t => t.id);

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
        do { nm = pickSeeded(pool) + ' ' + pickSeeded(pool); } while (named.has(nm));
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

/* team strength = weighted best XI */
function teamStrength(team) {
  const xi = bestXI(team.squadFull);
  return xi.reduce((s, p) => s + p.ovr, 0) / xi.length;
}

function bestXI(squad) {
  const by = pos => squad.filter(p => p.pos === pos).sort((a, b) => b.ovr - a.ovr);
  return [...by('GK').slice(0, 1), ...by('DF').slice(0, 4), ...by('MF').slice(0, 4), ...by('FW').slice(0, 2)];
}

/* materialise all squads once, in fixed order (stable pids) */
const DB = TEAMS.map(t => {
  const team = { ...t };
  team.squadFull = buildSquad(team);
  team.str = 0;
  return team;
});
DB.forEach(t => {
  t.str = teamStrength(t);
  t.squadFull.forEach((p, i) => { p.pid = t.id + ':' + i; p.teamId = t.id; });
});

/* pid -> { player, team } index; pools (icons & the Legend excluded from normal pulls) */
const PLAYER_INDEX = {};
DB.forEach(t => t.squadFull.forEach(p => PLAYER_INDEX[p.pid] = { player: p, team: t }));
const GACHA_POOL = Object.values(PLAYER_INDEX).map(e => e.player).filter(p => !p.legend && !p.icon);
const ICON_POOL = Object.values(PLAYER_INDEX).map(e => e.player).filter(p => p.icon);

/* rarity tiers */
function rarityOf(p) {
  if (p.legend) return 'legend';
  if (p.icon) return 'icon';
  if (p.ovr >= 89) return 'hero';
  if (p.ovr >= 81) return 'gold';
  if (p.ovr >= 73) return 'silver';
  return 'bronze';
}
function sellValue(p) {
  if (p.legend) return 5000;
  if (p.icon) return 3000;
  if (p.ovr >= 89) return 1500;
  if (p.ovr >= 81) return 600;
  if (p.ovr >= 73) return 250;
  return 100;
}

function getTeam(id) {
  if (id === USER_TEAM_ID && typeof getUserTeam === 'function') return getUserTeam();
  return DB.find(t => t.id === id);
}
