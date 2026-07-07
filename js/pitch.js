/* ============================================================
   NxrLegends — pixel renderers
   - crest drawing (team badges)
   - player face sprites
   - top-down animated match pitch
   ============================================================ */

/* ---------- tiny helpers ---------- */
function px(ctx, x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), w, h); }

/* seeded hash for stable per-team patterns */
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/* ---------- team crest: 12x12 pixel shield ---------- */
function drawCrest(canvas, team, size) {
  const c = canvas.getContext('2d');
  const S = size || canvas.width;
  canvas.width = S; canvas.height = S;
  const u = S / 12;
  const [c1, c2] = team.colors;
  const seed = hashStr(team.id);
  c.clearRect(0, 0, S, S);
  // shield outline
  const shield = [
    '.##########.',
    '#..........#',
    '#..........#',
    '#..........#',
    '#..........#',
    '#..........#',
    '.#........#.',
    '.#........#.',
    '..#......#..',
    '...#....#...',
    '....#..#....',
    '.....##.....'
  ];
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
    const ch = shield[y][x];
    if (ch === '#') px(c, x * u, y * u, Math.ceil(u), Math.ceil(u), '#05070f');
    else if (ch === '.') continue;
  }
  // fill interior with pattern based on seed
  for (let y = 1; y < 11; y++) for (let x = 1; x < 11; x++) {
    if (shield[y][x] !== '.') continue;
    // stay inside shield: reuse outline row bounds
    let inside = true;
    // find outline columns for this row
    const row = shield[y];
    const first = row.indexOf('#'), last = row.lastIndexOf('#');
    if (x <= first || x >= last) inside = false;
    if (!inside) continue;
    const mode = seed % 4;
    let col;
    if (mode === 0) col = (x < 6) ? c1 : c2;                    // halves
    else if (mode === 1) col = (Math.floor(y / 2) % 2 === 0) ? c1 : c2; // hoops
    else if (mode === 2) col = (Math.floor(x / 2) % 2 === 0) ? c1 : c2; // stripes
    else col = (x + y) % 4 < 2 ? c1 : c2;                        // diagonal
    px(c, x * u, y * u, Math.ceil(u), Math.ceil(u), col);
  }
  // star for legend teams
  if (team.hasLegend) {
    px(c, 5 * u, 3 * u, Math.ceil(u * 2), Math.ceil(u), '#ffd23f');
    px(c, 4 * u, 4 * u, Math.ceil(u * 4), Math.ceil(u), '#ffd23f');
    px(c, 5 * u, 5 * u, Math.ceil(u * 2), Math.ceil(u), '#ffd23f');
  }
}

/* ---------- player face sprite: 11x11 ---------- */
function drawFace(canvas, player, teamColors, size) {
  const c = canvas.getContext('2d');
  const S = size || canvas.width;
  canvas.width = S; canvas.height = S;
  const u = S / 11;
  const seed = hashStr(player.name);
  const skins = ['#c68642', '#8d5524', '#e0ac69', '#f1c27d', '#a0673f'];
  const hairs = ['#0b0b0b', '#2a1a0a', '#4a2c10', '#111122', '#3a3a3a'];
  const skin = player.legend ? '#e0ac69' : skins[seed % skins.length];
  const hair = player.legend ? '#ffd23f' : hairs[(seed >> 3) % hairs.length];
  const shirt = teamColors ? teamColors[0] : '#e63946';
  c.clearRect(0, 0, S, S);
  const B = '#05070f';
  // hair
  px(c, 2 * u, 1 * u, 7 * u, 2 * u, hair);
  px(c, 2 * u, 3 * u, 2 * u, 1 * u, hair);
  px(c, 7 * u, 3 * u, 2 * u, 1 * u, hair);
  // face
  px(c, 3 * u, 3 * u, 5 * u, 4 * u, skin);
  // eyes
  px(c, 4 * u, 4 * u, u, u, B);
  px(c, 6 * u, 4 * u, u, u, B);
  // mouth
  px(c, 5 * u, 6 * u, u, u * .6, '#7a3b2e');
  // shoulders / shirt
  px(c, 2 * u, 7 * u, 7 * u, 4 * u, shirt);
  px(c, 4 * u, 7 * u, 3 * u, u, skin); // neck
  if (player.legend) {
    // golden crown
    px(c, 3 * u, 0, u, u, '#ffd23f');
    px(c, 5 * u, 0, u, u, '#ffd23f');
    px(c, 7 * u, 0, u, u, '#ffd23f');
  } else if (player.icon) {
    // cyan icon headband
    px(c, 2 * u, 2 * u, 7 * u, u, '#38e1ff');
  }
}

/* ============================================================
   Top-down match pitch
   ============================================================ */
const PITCH = { W: 480, H: 300, U: 4 }; // canvas units; 1 tile = 4px

function drawPitchBg(c, W, H) {
  // mowing stripes
  for (let i = 0; i < 12; i++) {
    px(c, i * (W / 12), 0, Math.ceil(W / 12), H, i % 2 === 0 ? '#3f8f34' : '#357c2b');
  }
  // pixel noise for texture
  const seed = 12345;
  for (let i = 0; i < 420; i++) {
    const x = (Math.imul(i, 2654435761) >>> 8) % W;
    const y = (Math.imul(i + 7, 40503) >>> 6) % H;
    px(c, x, y, 2, 2, (i % 2) ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.05)');
  }
  const L = '#dff0d4';
  const line = 2;
  // border
  c.strokeStyle = L; c.lineWidth = line;
  c.strokeRect(8, 8, W - 16, H - 16);
  // halfway
  px(c, W / 2 - 1, 8, line, H - 16, L);
  // center circle (pixelated)
  c.beginPath(); c.arc(W / 2, H / 2, 34, 0, Math.PI * 2); c.stroke();
  px(c, W / 2 - 2, H / 2 - 2, 4, 4, L);
  // boxes
  c.strokeRect(8, H / 2 - 62, 56, 124);
  c.strokeRect(W - 64, H / 2 - 62, 56, 124);
  c.strokeRect(8, H / 2 - 30, 22, 60);
  c.strokeRect(W - 30, H / 2 - 30, 22, 60);
  // goals with a pixel net mesh
  [2, W - 8].forEach(x0 => {
    px(c, x0, H / 2 - 22, 6, 44, 'rgba(232,236,255,.85)');
    for (let y = H / 2 - 22; y <= H / 2 + 22; y += 3) px(c, x0, y, 6, 1, 'rgba(11,16,32,.35)');
    for (let x = 0; x <= 6; x += 2) px(c, x0 + x, H / 2 - 22, 1, 44, 'rgba(11,16,32,.30)');
  });
}

/* draw a little top-down player: shirt blob + head + shadow */
function drawKitPlayer(c, x, y, shirt, shorts, isLegend, frame) {
  const bob = (frame + Math.round(x)) % 20 < 10 ? 0 : 1;
  px(c, x - 4, y + 5, 8, 2, 'rgba(0,0,0,.3)');        // shadow
  px(c, x - 3, y - 2 + bob, 6, 6, shirt);              // torso
  px(c, x - 3, y + 3 + bob, 2, 2, shorts);             // leg L
  px(c, x + 1, y + 3 + bob, 2, 2, shorts);             // leg R
  px(c, x - 2, y - 6 + bob, 4, 4, '#e0ac69');          // head
  if (isLegend) {
    px(c, x - 2, y - 8 + bob, 1, 2, '#ffd23f');
    px(c, x, y - 8 + bob, 1, 2, '#ffd23f');
    px(c, x + 1, y - 8 + bob, 1, 2, '#ffd23f');
  }
}

/* formation slots in pitch fraction coords (attacking left->right) */
const FORMATION = [
  [0.06, 0.50],                                        // GK
  [0.22, 0.20], [0.20, 0.42], [0.20, 0.58], [0.22, 0.80], // DF
  [0.38, 0.28], [0.36, 0.50], [0.38, 0.72], [0.30, 0.50], // MF (last sits deep)
  [0.46, 0.38], [0.46, 0.62]                           // FW
];

class MatchScene {
  constructor(canvas, home, away) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.home = home; this.away = away;
    this.frame = 0;
    this.ball = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
    this.attackSide = 'home';
    this.flash = 0;         // goal flash frames
    this.confetti = [];
    this.shake = 0;         // screen-shake frames
    this.celebrate = 0;     // freeze/celebration frames
    this.netRipple = { side: null, t: 0 };
    this.momentum = 0.5;    // 0 = away pressing, 1 = home pressing
    this.setAttack(Math.random() < 0.5 ? 'home' : 'away');
    this.players = this.makePlayers();
  }

  makePlayers() {
    const xi = side => FORMATION.map(([fx, fy], i) => ({
      i, side,
      hx: side === 'home' ? fx : 1 - fx,
      hy: fy,
      x: side === 'home' ? fx : 1 - fx,
      y: fy,
      jx: Math.random() * 1000, jy: Math.random() * 1000
    }));
    return [...xi('home'), ...xi('away')];
  }

  setAttack(side) {
    this.attackSide = side;
    this.newBallTarget();
  }

  newBallTarget() {
    const towardHomeGoal = this.attackSide === 'away';
    const zone = towardHomeGoal ? [0.08, 0.45] : [0.55, 0.92];
    this.ball.tx = zone[0] + Math.random() * (zone[1] - zone[0]);
    this.ball.ty = 0.18 + Math.random() * 0.64;
  }

  goal(side, player) {
    this.flash = 34;
    this.shake = 18;
    this.celebrate = 46;             // freeze the ball in the net a beat
    const W = this.canvas.width, H = this.canvas.height;
    const special = player && (player.legend || player.icon);
    const gx = side === 'home' ? W - 10 : 10;
    this.netRipple = { side, t: 26 };
    // snap the ball into the scoring goal, then let the celebration ride
    this.ball.x = side === 'home' ? 0.985 : 0.015;
    this.ball.y = 0.5;
    this.ball.tx = this.ball.x; this.ball.ty = this.ball.y;
    const cols = special
      ? ['#ffd23f', '#ffe27a', '#fff7cf', '#ff9df5']
      : ['#ffd23f', '#ff4757', '#38e1ff', '#dff0d4'];
    const burst = special ? 130 : 90;
    for (let i = 0; i < burst; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 6;
      this.confetti.push({
        x: gx, y: H / 2,
        vx: Math.cos(a) * sp * (side === 'home' ? -1 : 1) - (side === 'home' ? 1.5 : -1.5),
        vy: Math.sin(a) * sp - 1.5,
        life: 34 + Math.random() * 40,
        col: cols[i % cols.length]
      });
    }
  }

  tick() {
    this.frame++;
    if (this.shake > 0) this.shake--;
    if (this.netRipple.t > 0) this.netRipple.t--;
    // during the celebration freeze, keep the ball parked in the net
    if (this.celebrate > 0) {
      this.celebrate--;
      this.confetti = this.confetti.filter(f => f.life-- > 0);
      this.confetti.forEach(f => { f.x += f.vx; f.y += f.vy; f.vy += 0.12; });
      if (this.flash > 0) this.flash--;
      if (this.celebrate === 0) this.setAttack(this.attackSide === 'home' ? 'away' : 'home');
      return;
    }
    // ball drifts to target; new target when reached
    const b = this.ball;
    const dx = b.tx - b.x, dy = b.ty - b.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.02) {
      if (Math.random() < 0.25) this.setAttack(this.attackSide === 'home' ? 'away' : 'home');
      else this.newBallTarget();
    } else {
      b.x += dx / d * 0.006; b.y += dy / d * 0.006;
    }
    this.momentum += ((this.attackSide === 'home' ? 1 : 0) - this.momentum) * 0.01;

    // players: home position + shift toward ball with jitter
    const shift = (this.momentum - 0.5) * 0.16;
    this.players.forEach(p => {
      const pull = p.side === this.attackSide ? 0.12 : 0.07;
      const tx = p.hx + shift * (p.side === 'home' ? 1 : 1) + (b.x - p.hx) * pull;
      const ty = p.hy + (b.y - p.hy) * pull;
      p.jx += 0.05; p.jy += 0.06;
      p.x += (tx - p.x) * 0.04 + Math.sin(p.jx) * 0.0008;
      p.y += (ty - p.y) * 0.04 + Math.cos(p.jy) * 0.0008;
    });

    this.confetti = this.confetti.filter(f => f.life-- > 0);
    this.confetti.forEach(f => { f.x += f.vx; f.y += f.vy; f.vy += 0.12; });
    if (this.flash > 0) this.flash--;
  }

  render() {
    const c = this.ctx, W = this.canvas.width, H = this.canvas.height;
    c.save();
    if (this.shake > 0) {
      const s = this.shake / 3;
      c.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }
    drawPitchBg(c, W, H);
    // net ripple at the scoring goal
    if (this.netRipple.t > 0) drawNetRipple(c, W, H, this.netRipple.side, this.netRipple.t);
    // players (away first so home renders on top when overlapping)
    const kit = t => t.colors;
    this.players.forEach(p => {
      const t = p.side === 'home' ? this.home : this.away;
      const legend = t.hasLegend && p.i === 10; // striker slot carries the legend
      drawKitPlayer(c, p.x * W, p.y * H, kit(t)[0], kit(t)[1], legend, this.frame);
    });
    // ball
    const bx = this.ball.x * W, by = this.ball.y * H;
    px(c, bx - 2, by + 3, 5, 2, 'rgba(0,0,0,.35)');
    px(c, bx - 2, by - 2, 4, 4, '#ffffff');
    px(c, bx - 1, by - 1, 2, 2, '#05070f');
    // confetti
    this.confetti.forEach(f => px(c, f.x, f.y, 3, 3, f.col));
    c.restore();
    // goal flash (over the shake so it fills the frame)
    if (this.flash > 0 && this.flash % 4 < 2) {
      c.fillStyle = 'rgba(255, 210, 63, .20)';
      c.fillRect(0, 0, W, H);
    }
  }
}

/* net mesh that wobbles when the ball hits it */
function drawNetRipple(c, W, H, side, t) {
  const x0 = side === 'home' ? W - 8 : 2;
  const gy = H / 2 - 22, gh = 44, gw = 6;
  for (let y = 0; y <= gh; y += 3) {
    const wob = Math.sin((y + t * 3) * 0.5) * (t / 12);
    px(c, x0 + wob, gy + y, gw, 1, 'rgba(255,255,255,.5)');
  }
  for (let x = 0; x <= gw; x += 2) {
    px(c, x0 + x, gy, 1, gh, 'rgba(255,255,255,.35)');
  }
}

/* ---------- title screen mini pitch: idle kickabout ---------- */
function startTitlePitch() {
  const canvas = document.getElementById('title-pitch');
  if (!canvas) return;
  const c = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  let f = 0;
  const dots = Array.from({ length: 10 }, (_, i) => ({
    x: Math.random() * W, y: Math.random() * H,
    a: Math.random() * Math.PI * 2, sp: 0.3 + Math.random() * 0.4,
    col: i < 5 ? '#e63946' : '#1b3fa0'
  }));
  const ball = { x: W / 2, y: H / 2, a: Math.random() * 6 };
  function loop() {
    f++;
    drawPitchBg(c, W, H);
    ball.a += (Math.random() - 0.5) * 0.3;
    ball.x += Math.cos(ball.a) * 0.8; ball.y += Math.sin(ball.a) * 0.8;
    if (ball.x < 14 || ball.x > W - 14) ball.a = Math.PI - ball.a;
    if (ball.y < 14 || ball.y > H - 14) ball.a = -ball.a;
    dots.forEach(d => {
      d.x += (ball.x - d.x) * 0.004 + Math.cos(d.a + f / 40) * d.sp;
      d.y += (ball.y - d.y) * 0.004 + Math.sin(d.a + f / 40) * d.sp;
      drawKitPlayer(c, d.x, d.y, d.col, '#ffffff', false, f);
    });
    px(c, ball.x - 2, ball.y - 2, 4, 4, '#ffffff');
    px(c, ball.x - 1, ball.y - 1, 2, 2, '#05070f');
    requestAnimationFrame(loop);
  }
  loop();
}
