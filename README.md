# ⚽ NxrLegends

**Pixel-art, top-down retro football manager for the browser.**
Chase the perfect **38-0** season, build custom leagues, and unleash the one and only 99-rated legend — **NXRSKYAA**.

## Features

- 🎮 **Season Mode** — pick any of 20 teams in the Nusantara Legends League (double round-robin, 38 matches) and try to finish the season 38-0.
- 🕹️ **Top-down pixel match engine** — animated pitch, pixel players, goal confetti, live commentary, retro chiptune SFX, 1x/2x speed and skip.
- 🇮🇩 **Timnas Indonesia database** — the full Indonesia national team squad (Jay Idzes, Maarten Paes, Thom Haye, Marselino Ferdinan, Ragnar Oratmangoen and more) competing against Asian nations and Liga 1 clubs.
- ⭐ **NXRSKYAA** — special legend character, 99 in every stat, exclusive to Timnas Indonesia. Golden crown included.
- 🏆 **Custom League Builder** — name your league, pick 4–20 teams (nations and/or Liga 1 clubs), single or home-and-away format, and choose which team is yours.
- 💾 Season progress auto-saves to `localStorage`.

## Tech

Zero dependencies, zero build step — pure HTML/CSS/JS with canvas-rendered pixel art. Deploys anywhere static files are served.

```bash
# run locally
npx serve .
```

## Structure

```
index.html      screens & layout
css/style.css   pixel-art theme (CRT scanlines, hard shadows, retro palette)
js/data.js      teams, squads, the Legend
js/engine.js    match simulation + fixtures + league table
js/pitch.js     canvas renderers: crests, faces, top-down match scene
js/ui.js        navigation, season flow, builder, database
```

All player ratings are original game values. Built with ❤️ for the Garuda.
