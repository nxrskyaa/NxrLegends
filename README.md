# ⚽ NxrLegends

**Pixel-art, top-down retro football game for the browser.**
Open gacha packs, build your ultimate squad, take on the English league in a perfect **38-0** season — and chase the one and only 99-rated legend, **NXRSKYAA**.

## Features

- 🎴 **Gacha Store** — Bronze / Silver / Gold / Legend packs with animated pixel card reveals. Duplicates auto-convert to coins. NXRSKYAA hides in Gold (1.5%) and Legend (5%) packs.
- 🧩 **My Squad** — build your club from your collection: pick a formation (4-4-2, 4-3-3, 3-5-2, 5-3-2), place players slot by slot on a vertical pixel pitch, auto best XI, rename your club, sell spares.
- 🏆 **The 38-0 Challenge** — your squad + 19 English league clubs (Arsenal, Liverpool, Man City, Chelsea, Spurs and more, each seeded with their real stars), home & away, 38 matches. Win them all.
- 🌍 **World Cup 2026** — pick your nation from the real **48-team** field (hosts USA/Canada/Mexico plus Argentina, Brazil, France, England, Morocco, Japan… and Indonesia as a wildcard). Real format: 12 groups of 4, top 2 + 8 best thirds advance to a 32-team knockout (R32 → R16 → Quarters → Semis → Final) with **penalty shootouts**. Live group tables and bracket.
- 🎚️ **Difficulty modes** — start the 38-0 Challenge on Easy / Medium / Hard. Easy grants **4 free draft packs** (2 for Medium, 1 for Hard) that pull players of every rarity from lowest to highest, and scales rival strength and coin rewards.
- 🏆 **World Cup + season knockouts** — penalty shootouts decide any tie level after 90 minutes.
- 🔄 **Live match + substitutions** — matches are simulated live minute-by-minute, so your **3 substitutions** and tactic tweaks actually change what happens next. Speed control (x1 / x2 / x4) and skip.
- 🎽 **Team Talk (pre-match)** — before every kick-off, review your starting XI on the pitch, edit your squad, and set **five dimensions of custom tactics**: mentality, pressing, tempo, width, and defensive line. Together they swing a match from ~1 to ~16 goals a game.
- 🥅 **Cinematic pixel goals** — screen shake, net ripple, confetti bursts, and a slamming "GOAL!!!" banner with the scorer's name (special gold/pink treatment for icons and the Legend).
- ⚜️ **Hall of Legends** — icons like Cristiano Ronaldo, Messi, Zidane, Ronaldinho, Maldini, Ibrahimović, Henry and 17 more, pullable as ICON cards from Gold & Legend packs, collectible into your dream team, or faced as the **FINAL BOSS** club in a custom league.
- 🕹️ **Top-down pixel match engine** — animated pitch, pixel players, goal confetti, live commentary, retro chiptune SFX, 1x/2x speed and skip.
- 🇮🇩 **Timnas Indonesia database** — the full Indonesia national squad (Jay Idzes, Maarten Paes, Thom Haye, Marselino Ferdinan and more) plus Asian nations and Liga 1 clubs, all browsable and all in the gacha pool.
- ⭐ **NXRSKYAA** — special legend character, 99 in every stat, golden crown, own showcase page, special commentary and fanfare when he scores.
- 🛠️ **Custom League Builder** — name your league, pick 4–20 teams (England / nations / Liga 1 / your own club), single or home-and-away.
- 💰 Earn coins from every match you play; 💾 collection and season auto-save to `localStorage`.

## Tech

Zero dependencies, zero build step — pure HTML/CSS/JS with canvas-rendered pixel art. The player database is generated from a seeded PRNG so player IDs stay stable across sessions (that's what makes the gacha collection persistent). Deploys anywhere static files are served.

```bash
# run locally
npx serve .
```

## Structure

```
index.html        screens & layout
css/style.css     pixel-art theme (CRT scanlines, hard shadows, rarity frames)
js/data.js        teams, squads, gacha pool, rarities, the Legend
js/collection.js  coins, packs, collection, formations, tactics, user club
js/engine.js      live match sim + subs + penalty shootout + fixtures + table
js/pitch.js       canvas renderers: crests, faces, top-down match scene
js/ui.js          navigation, squad builder, store, pre-match, season flow
js/worldcup.js    16-nation single-elimination World Cup bracket
```

All player ratings are original game values. Built with ❤️ for the Garuda.

---

## Also in this repo

### 📡 [`hermes/`](hermes/) — NFT alpha detection agent for Robinhood Chain

A separate, self-contained Node CLI that watches Robinhood Chain for NFT
collections that are working but not yet noticed, and then manages what it
finds. It folds every mint into rolling per-collection state, scores ten
on-chain signals across four layers (attention / quality / flow / structure),
reads **who absorbs the sellers** and whether participation is stepping up leg
by leg, and requires the layers to *agree* before promoting a call. Every alert
opens a **thesis** with invalidation levels fixed at entry — flow floor, holder
floor, distribution cap — re-tested every cycle, so positions exit with a stated
reason rather than going quiet. Ships with a **two-way Telegram bot** (ask it
`/top`, `/theses`, `/i 0x…` from your phone), a live dashboard, a lookahead-free
backtester, and mock chain + mock Bot API for tests. Zero dependencies.

```bash
cd hermes && node src/index.js init && node src/index.js doctor
```

See [`hermes/README.md`](hermes/README.md) for the full write-up.
