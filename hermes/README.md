# 📡 Hermes — NFT alpha detection agent for Robinhood Chain

Hermes watches the chain itself, not Twitter. It reads every mint as it lands,
keeps rolling state for each collection, and scores them on how much they look
like a launch that is **working but not yet noticed**.

The whole point is the last clause. A collection with 8,000 holders is not
alpha — it's news. So every score is multiplied by a *stealth* factor that
decays as crowd awareness rises: Hermes gets quieter about a collection exactly
as everyone else gets louder.

Zero dependencies, zero build step. Node 20+ and an RPC URL is the whole setup.

```
hermes demo        # see it work right now, on a built-in fake chain — no setup
hermes doctor      # is your RPC alive?
hermes watch       # the normal mode: discover, verify, manage, repeat
hermes theses      # what is currently under management, and what would break it
hermes serve       # live dashboard at localhost:8787
```

## The pipeline

Finding a collection is one step of seven. Hermes runs the whole loop:

```
DISCOVERY   every mint on the chain, as it lands
    ↓
THESIS      why this one? written down, in falsifiable terms
    ↓
VERIFY      on-chain only: holders, distribution, wallet quality, structure
    ↓
FLOW        velocity ladder + who absorbs the sellers        ← decides timing
    ↓
CONFLUENCE  do independent layers agree, or is one signal shouting alone?
    ↓
ENTRY+SIZE  evidence quality decides position size, not enthusiasm
    ↓
MANAGE      re-test the thesis every cycle → HOLD or EXIT
```

The last two steps are what separate this from a scanner. Every call opens a
**thesis** with explicit invalidation levels written at entry; every later cycle
re-tests them. Collections leave with a stated reason, not by quietly falling
off a list.

---

## What it actually measures

Nine independent signals, each producing a 0–1 score plus the evidence behind
it. A signal with no data returns *nothing* rather than zero, and its weight is
removed from the denominator — a five-minute-old collection is not punished for
facts nobody could know yet.

| Signal | Layer | Weight | What it reads |
|---|---|---:|---|
| `smart_money` | quality | 26 | Wallets from your registry minting this. The strongest single input. |
| `mint_acceleration` | attention | 16 | Rate, acceleration vs its own baseline, **and the velocity ladder**. |
| `organic_distribution` | structure | 14 | Mints per wallet near ~1.7, low minter Gini, low bulk-tx share. |
| `flow_absorption` | flow | 14 | **Who takes the supply when holders sell.** Abstains until someone sells. |
| `holder_spread` | structure | 10 | Top-10 share, biggest whale, how much the creator kept. |
| `secondary_demand` | flow | 8 | Early resales prove a bid exists; a flood means it's being dumped. |
| `sybil_resistance` | structure | 8 | Share of minters that are contracts, shrunk toward neutral by sample coverage. |
| `deployer_pedigree` | quality | 8 | Has this deployer shipped something that worked before? |
| `supply_scarcity` | structure | 6 | Small cap filling fast beats a 100k free-for-all. |
| `contract_health` | structure | 6 | Real ERC-721/1155, named, metadata revealed, creator not holding the float. |

```
score = 100 × (Σ wᵢ·sᵢ / Σ wᵢ) × stealth × confidence
tier  = capped by how many of the four layers agree
```

- **stealth** — `0.35 … 1.15`, driven by holder count and age. This is what makes
  it a *pre-crowd* detector instead of a trending list.
- **confidence** — damps the score while few signals have data, so a thin read
  never produces a loud call.

Tiers: `WATCH 42` · `SIGNAL 55` · `ALPHA 68` · `URGENT 80`.

### FLOW — the layer that decides timing

Two ideas, neither of which a volume number can express:

**Velocity ladder.** A big 24h figure says nothing about direction. The window is
split into three legs and the question is whether each leg beat the last —
`30 → 70 → 140`. A monotone ramp scores 0.92; flat volume at any size scores 0;
`100 → 50 → 10` scores 0. The step ratios are combined geometrically, so one
explosive leg cannot paper over a stalled one.

**Seller absorption.** When holders sell, either fresh wallets take the supply or
it piles back into the same hands while the base shrinks. With no price feed,
Hermes reads it structurally: unique buyers vs unique sellers, whether the holder
base widened through the sell pressure, and whether the top-10 share crept up
while it happened. Verdict is one of `absorbed` / `contested` / `distributing`.

It **abstains** until someone actually sells — an untested market gets no marks
for passing a test it was never given.

### CONFLUENCE — one loud signal is never enough

Signals are grouped into four layers, each scored as the weighted mean of its
members that had data:

| Layer | Asks |
|---|---|
| `attention` | Is anyone showing up? |
| `quality` | Is it the *right* someone? |
| `flow` | Does the bid hold under selling? |
| `structure` | Is anything structurally wrong? |

The number of layers that clear the floor (0.55) caps the tier: **4 for URGENT,
3 for ALPHA, 2 for SIGNAL, 1 for WATCH**. A collection with perfect momentum and
nothing else scores high and still gets capped at `WATCH` — the alert says
`capped from ALPHA` so you can see it happen.

A layer with no data is never counted as met. With an empty smart-money registry
the `quality` layer cannot meet, so `URGENT` is unreachable — which is the
honest outcome when you don't know who is buying.

### ENTRY + SIZING

Evidence quality picks the size, not enthusiasm:

| Size | Requires |
|---|---|
| `FULL` | URGENT + all 4 layers + confidence ≥ 80% |
| `HALF` | ALPHA, or URGENT without full confidence |
| `SCOUT` | SIGNAL |
| `NONE` | below SIGNAL |

### MANAGE — price is not the thesis

Every entry writes down its invalidation levels **in absolute terms at entry**,
so the test cannot drift with the thing it is testing:

```
invalidates if: flow < 3.42/min · holders < 53 · top10 > 34.5% · sellers stop being absorbed
```

Each later cycle re-tests them — including for collections that saw no events at
all, because a thesis dies of silence as readily as of bad news. Four ways out:

- **flow collapsed** — rate fell below the floor, or went silent entirely
- **holders leaving** — the base is shrinking, not rotating
- **distribution** — top-10 share climbed past its cap
- **absorption failed** — sellers are no longer being taken

A drawdown with flow intact, holders intact and sellers still absorbed is **not**
an exit. Conversely, when the crowd index passes 70% the thesis is marked
`matured`, not broken: for a pre-crowd strategy, everyone arriving is the thesis
completing.

### Hard filters run first

Scoring never rescues a collection that trips a disqualifier — self-mints,
whale-owned supply, airdrop spam, contract-only minter sets, blocklisted
deployers, dead collections. Those are reported as `DISQUALIFIED` with reasons,
not silently dropped, so you can see what was rejected and why.

---

## Setup

Try it with no setup at all first — this runs the whole agent against a
built-in fake chain and prints what it found, what it is managing, and what it
threw out:

```bash
cd hermes
node src/index.js demo
```

Then for real:

```bash
cd hermes
node src/index.js init            # writes hermes.config.json
$EDITOR hermes.config.json        # set chain.rpcUrl
node src/index.js doctor          # verify RPC, chain head, latency
```

Optionally link it as a command:

```bash
npm link          # then `hermes ...` anywhere
```

Secrets can come from the environment instead of the config file:
`HERMES_RPC_URL`, `HERMES_DISCORD_WEBHOOK`, `HERMES_WEBHOOK`,
`HERMES_TELEGRAM_TOKEN`, `HERMES_TELEGRAM_CHAT`.

---

## Seed the smart-money registry first

`smart_money` carries the most weight and starts empty, which means Hermes runs
noticeably blind until you feed it. Point it at collections that already worked
and it will extract their early minters:

```bash
hermes wallets learn 0xWINNER1 0xWINNER2 0xWINNER3 --early 60
```

It takes the first 60 unique minters of each winner and tiers them by overlap:
early on 3+ winners → `S`, on 2 → `A`, on 1 → `B`. **A wallet that was early on
exactly one collection is skipped** when you supply several winners — one hit is
luck, three is edge. Add or drop wallets by hand any time:

```bash
hermes wallets add 0xabc… --tier S --note "flipped every Robinhood mint since May"
hermes wallets list
hermes wallets remove 0xabc…
```

---

## Running it

```bash
hermes watch                       # continuous; SIGINT saves state cleanly
hermes scan                        # one cycle, then print the ranking
hermes top --n 20 --tier SIGNAL    # rank what's already in state
hermes inspect 0xCOLLECTION        # full per-signal breakdown for one collection
hermes theses                      # what is under management + what would break it
hermes theses --all                # including closed ones, with their exit reasons
hermes serve --port 8787           # dashboard + JSON API
```

`hermes inspect` is the one to reach for before acting on an alert:

```
Hermes Test Alpha (HTA)  0x0000…d8e1
erc721 · deployer 0x0000…dcc8 · age 33m

  SCORE 85.7  tier URGENT  crowd 7.0%  stealth ×1.09  confidence 100.0%

  ████████░   85%  w 26  Smart money present
        3 tracked wallet(s), weight 3.00
  █████████   98%  w 16  Mint velocity accelerating
        12.73/min, 7.07× baseline
  ██████░░░   71%  w 14  Organic mint spread
        49 minters, 3.90/wallet, gini 0.06
  █████████   99%  w  8  Not a bot farm
        0.0% of 49/49 probed minters are contracts
  ████████░   86%  w 10  Supply not concentrated
        top10 22.5%, top1 2.6%, creator 0.0%
  ███████░░   81%  w 10  Early secondary demand
        secondary 7.3% of mints, first at 9m
```

```
Hermes Test Alpha 0x0000…d8e1
  open  ALPHA 77.6  size HALF  confluence 3/4  opened 12m ago  9 re-checks
  ↳ Smart money present: 3 tracked wallet(s), weight 3.00
  ↳ Sellers being absorbed: absorbed — 14 buyers vs 14 sellers, holders +24
  ↳ Organic mint spread: 49 minters, 3.90/wallet, gini 0.06
  holders 63 → 141 (2.24×) · flow 13.67 → 9.20/min · absorb absorbed → absorbed · top10 22.5% → 24.1%
  invalidates if: flow < 3.42/min · holders < 53 · top10 > 34.5% · sellers stop being absorbed
```

### Telegram

Two-way: alerts go out, and you can ask it things back from your phone.

**Setup, once:**

1. In Telegram, message **@BotFather** → `/newbot` → pick a name. It hands you a
   token like `8123456789:AA…`.
2. Put the token in `hermes.config.json` under `telegram.botToken`.
3. Run `hermes telegram`, then message your bot. It replies with your chat id —
   put that in `telegram.chatId` and restart.

From then on `hermes watch` runs the scanner and the bot together in one
process. `hermes telegram` on its own serves saved state without scanning.

| Command | |
|---|---|
| `/status` | where the agent is in the chain, what it's tracking |
| `/top` · `/top 5` | best candidates right now |
| `/theses` | what's under management + what would break each one |
| `/i 0x…` | full per-signal breakdown for one collection |
| `/wallets` | the smart-money registry |
| `/tier ALPHA` | raise or lower the alert threshold live |
| `/mute` · `/unmute` | stop or resume alerts (the agent keeps working) |

Every alert ends with a tappable `/i_0x…` shortcut, so the full breakdown is one
thumb press away.

Long polling, not webhooks — no domain, no TLS certificate, no port forwarding.
It runs from a laptop behind NAT.

**Access.** Only the configured `chatId` (plus anything in `telegram.allowFrom`)
gets answers. Before a `chatId` is set the bot replies to *any* chat with one
thing only — that chat's id — so onboarding works without leaving the bot open.
Collection names are HTML-escaped on the way out, so a contract named
`<b>…</b>` cannot inject markup into your feed.

### Alerts

Four kinds, each with its own meaning:

| Kind | When |
|---|---|
| `▲ ENTRY` | a thesis opened |
| `▲ UPGRADE` | still valid, evidence got stronger |
| `▼ THESIS BROKEN` | an invalidation level was hit — with the reason |
| `● THESIS PLAYED OUT` | crowd arrived; no longer early |

```
▲ ENTRY [URGENT 85.3] Hermes Test Alpha (HTA) 0x0000…d8e1  size:FULL
  age 29m · 191 mints / 49 minters / 63 holders · 12.73/min (21.22× base) · flow absorbed · crowd 7.0%
  confluence 4/4: attention quality flow structure
  ↳ Smart money present: 3 tracked wallet(s), weight 3.00
  ↳ Mint velocity accelerating: 12.73/min, 21.22× baseline, ladder 3 → 63 → 139 ↑
  ↳ Sellers being absorbed: absorbed — 14 buyers vs 14 sellers, holders +60
  invalidates if: flow < 3.42/min · holders < 53 · top10 > 34.5% · sellers stop being absorbed
```

Console always. Beyond that, fill in any of `alerts.discordWebhookUrl`,
`alerts.telegram`, or a generic `alerts.webhookUrl`; every alert is also
appended to `state/alerts.jsonl`. An alert you cannot audit is noise, so each
one carries its drivers, its confluence, and its invalidation levels.

After an exit, a collection cannot be re-entered for `thesis.reopenCooldownSec`
(default 2h) — no walking straight back into something that just broke.

---

## Tuning it on evidence, not vibes

The thresholds shipped here are a *starting point*. Replay history through the
same engine and see what the numbers would actually have caught:

```bash
hermes backtest --from 4200000 --to 4260000 --cycle 500 --horizon 5000 --target 3
```

```
Backtest 1000–1900 · 9 cycles · horizon 200 blocks
Tracked 3 collections → 1 detections (1 matured)
Hit = holder count grew 1.5× within the horizon

  WATCH   n=   1  precision=100.0%  median growth=3.27×

  Top detections by realised growth:
   WATCH   54.8  0x0000…d8e1 Hermes Test Alpha    15→49   3.27×  age@detect 30m
```

Detections have **no lookahead**: each cycle only ever sees blocks up to that
point, exactly as the live agent would. The outcome column is measured strictly
after the detection block. Move weights in `weights` and thresholds in
`signals` / `tiers`, re-run, compare precision.

---

## Tests

```bash
node test/run.js
```

61 checks against a synthetic Robinhood-Chain-shaped RPC (`test/mockchain.js`)
carrying an organic launch, a whale self-mint, a bot farm, and an ERC-20 decoy.
It asserts the things that are easy to get quietly wrong: that a 3-topic ERC-20
`Transfer` is never mistaken for an NFT, that the holder ledger always balances
against supply, that the whale is disqualified, that the bot farm scores below
the organic launch, and that state survives a save/reload round trip.

The flow, confluence and thesis layers are covered directly: that flat volume
scores zero at any size, that one explosive leg cannot mask a stalled one, that
the same sell volume scores worse when supply concentrates, that one loud signal
cannot reach ALPHA alone, that a strong member cannot carry a weak layer, and —
the load-bearing one — that **a drawdown with flow intact does not break a
thesis** while holders leaving, distribution or failed absorption each do.

The Telegram bot is driven end to end against a mock Bot API
(`test/mocktelegram.js`): fake user messages go in, the bot's replies come back
out. It asserts that every command answers, that a stranger gets nothing once a
chat id is configured, that an unconfigured bot hands back only your chat id and
never collection data, and that a collection named `<b>pwn</b>` cannot inject
markup into a message.

---

## Architecture

```
src/index.js       CLI + dashboard server
src/agent.js       scan cycle: fetch → fold → enrich → score → alert
src/rpc.js         JSON-RPC: throttled, retrying, batching, auto-splits log ranges
src/chain.js       contract probing (ERC-165, metadata, batched EOA-vs-contract)
src/events.js      log → normalized mint / transfer / burn
src/collection.js  rolling per-collection state and derived metrics
src/signals.js     the ten signals + the stealth multiplier
src/flow.js        velocity ladder + seller absorption
src/confluence.js  layer scoring, tier capping, position sizing
src/thesis.js      open / re-test / invalidate, with entry-fixed levels
src/score.js       weighted composition, confluence gate, driver attribution
src/filters.js     hard disqualifiers
src/wallets.js     smart-money registry + `learn` from past winners
src/store.js       atomic JSON state
src/notify.js      console / jsonl / webhook / Discord / Telegram
src/telegram.js    two-way bot: long-polling commands over the live agent
src/backtest.js    lookahead-free replay with outcome measurement
dashboard/         live radar UI (served by `hermes serve`)
test/              mock chain + end-to-end checks
```

A cycle is: pull every chain-wide mint log → pull all movement for tracked
collections → go back for the non-mint history of collections discovered *in
this same range* (otherwise a first sweep sees zero secondary flow) → fold into
state → probe the top candidates → score → apply the confluence gate → open or
re-test theses (including for collections with no events this range) → alert →
advance the cursor and save.

---

## Honest limitations

- **Price is not read.** Hermes measures participation, not money. Floor price,
  mint cost in USD and marketplace listings need a marketplace API that isn't
  wired up — `chain.marketplaceCollection` only builds links today. Adding a
  price feed is the single highest-value extension.
- **No social layer.** Discovery is on-chain only — Hermes sees the mint, not the
  callout that caused it. "Crowd awareness" is inferred from holder growth and
  age, not mentions, so a collection farmed quietly in a paid Discord looks
  stealthier than it is. Wiring a mentions feed into an `attention` signal is
  the obvious next slot; the layer already exists.
- **Absorption is structural, not priced.** It reads buyers, sellers, holder
  delta and concentration — it cannot tell a 5% dip absorbed at the bid from a
  40% one. With a price feed the same function gets much sharper.
- **Deployer identity is approximated** by `owner()`. A contract with renounced
  or unusual ownership reports no deployer, and `deployer_pedigree` abstains.
- **The registry is the ceiling.** With an empty smart-money list the strongest
  signal is switched off and everything else has to carry the score.
- **Thresholds are unvalidated against live Robinhood Chain data.** They were
  reasoned from how launches behave generally and verified against a synthetic
  chain. Run `backtest` on real history before trusting a tier.

None of this is financial advice. A high score is a reason to look; the thesis
and its invalidation levels are what you actually act on.
