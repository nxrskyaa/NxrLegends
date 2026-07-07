# ⚽ NxrLegends

**Pixel-art, top-down retro football game for the browser.**
Open gacha packs, build your ultimate squad, take on the English league in a perfect **38-0** season — and chase the one and only 99-rated legend, **NXRSKYAA**.

## Features

- 🎴 **Gacha Store** — Bronze / Silver / Gold / Legend packs with animated pixel card reveals. Duplicates auto-convert to coins. NXRSKYAA hides in Gold (1.5%) and Legend (5%) packs.
- 🧩 **My Squad** — build your club from your collection: pick a formation (4-4-2, 4-3-3, 3-5-2, 5-3-2), place players slot by slot on a vertical pixel pitch, auto best XI, rename your club, sell spares.
- 🏆 **The 38-0 Challenge** — your squad + 19 English league clubs (Arsenal, Liverpool, Man City, Chelsea, Spurs and more, each seeded with their real stars), home & away, 38 matches. Win them all.
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
js/collection.js  coins, packs, collection, formations, user club
js/engine.js      match simulation + fixtures + league table
js/pitch.js       canvas renderers: crests, faces, top-down match scene
js/ui.js          navigation, squad builder, store, season flow, database
```

All player ratings are original game values. Built with ❤️ for the Garuda.
