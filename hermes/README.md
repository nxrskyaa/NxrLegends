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
hermes doctor      # is the RPC alive?
hermes watch       # the normal mode: scan, score, alert, repeat
hermes serve       # live dashboard at localhost:8787
```

---

## What it actually measures

Nine independent signals, each producing a 0–1 score plus the evidence behind
it. A signal with no data returns *nothing* rather than zero, and its weight is
removed from the denominator — a five-minute-old collection is not punished for
facts nobody could know yet.

| Signal | Weight | What it reads |
|---|---:|---|
| `smart_money` | 26 | Wallets from your registry minting this. The strongest single input. |
| `mint_acceleration` | 16 | Mints/min **and** whether that rate is climbing vs its own baseline. |
| `organic_distribution` | 14 | Mints per wallet near ~1.7, low minter Gini, low bulk-tx share. |
| `holder_spread` | 10 | Top-10 share, biggest whale, how much the creator kept. |
| `secondary_demand` | 10 | Early resales prove a bid exists; a flood means it's being dumped. |
| `sybil_resistance` | 8 | Share of minters that are contracts, shrunk toward neutral by sample coverage. |
| `deployer_pedigree` | 8 | Has this deployer shipped something that worked before? |
| `supply_scarcity` | 6 | Small cap filling fast beats a 100k free-for-all. |
| `contract_health` | 6 | Real ERC-721/1155, named, metadata revealed, creator not holding the float. |

```
score = 100 × (Σ wᵢ·sᵢ / Σ wᵢ) × stealth × confidence
```

- **stealth** — `0.35 … 1.15`, driven by holder count and age. This is what makes
  it a *pre-crowd* detector instead of a trending list.
- **confidence** — damps the score while few signals have data, so a thin read
  never produces a loud call.

Tiers: `WATCH 42` · `SIGNAL 55` · `ALPHA 68` · `URGENT 80`.

### Hard filters run first

Scoring never rescues a collection that trips a disqualifier — self-mints,
whale-owned supply, airdrop spam, contract-only minter sets, blocklisted
deployers, dead collections. Those are reported as `DISQUALIFIED` with reasons,
not silently dropped, so you can see what was rejected and why.

---

## Setup

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

### Alerts

Console always. Beyond that, fill in any of `alerts.discordWebhookUrl`,
`alerts.telegram`, or a generic `alerts.webhookUrl`; every alert is also
appended to `state/alerts.jsonl`. Each one carries the top three signal
contributions as its `why` — an alert you cannot audit is noise.

One alert per collection per tier upgrade, with a cooldown (default 30 min) to
stop a single hot mint from flooding the channel.

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

22 checks against a synthetic Robinhood-Chain-shaped RPC (`test/mockchain.js`)
carrying an organic launch, a whale self-mint, a bot farm, and an ERC-20 decoy.
It asserts the things that are easy to get quietly wrong: that a 3-topic ERC-20
`Transfer` is never mistaken for an NFT, that the holder ledger always balances
against supply, that the whale is disqualified, that the bot farm scores below
the organic launch, and that state survives a save/reload round trip.

---

## Architecture

```
src/index.js       CLI + dashboard server
src/agent.js       scan cycle: fetch → fold → enrich → score → alert
src/rpc.js         JSON-RPC: throttled, retrying, batching, auto-splits log ranges
src/chain.js       contract probing (ERC-165, metadata, batched EOA-vs-contract)
src/events.js      log → normalized mint / transfer / burn
src/collection.js  rolling per-collection state and derived metrics
src/signals.js     the nine signals + the stealth multiplier
src/score.js       weighted composition, tiering, driver attribution
src/filters.js     hard disqualifiers
src/wallets.js     smart-money registry + `learn` from past winners
src/store.js       atomic JSON state
src/notify.js      console / jsonl / webhook / Discord / Telegram
src/backtest.js    lookahead-free replay with outcome measurement
dashboard/         live radar UI (served by `hermes serve`)
test/              mock chain + end-to-end checks
```

A cycle is: pull every chain-wide mint log → pull all movement for tracked
collections → go back for the non-mint history of collections discovered *in
this same range* (otherwise a first sweep sees zero secondary flow) → fold into
state → probe the top candidates → score → alert → advance the cursor and save.

---

## Honest limitations

- **Price is not read.** Hermes measures participation, not money. Floor price,
  mint cost in USD and marketplace listings need a marketplace API that isn't
  wired up — `chain.marketplaceCollection` only builds links today. Adding a
  price feed is the single highest-value extension.
- **No social layer.** "Crowd awareness" is inferred from on-chain holder growth
  and age, not from mentions. A collection being farmed quietly in a paid
  Discord will look stealthier than it is.
- **Deployer identity is approximated** by `owner()`. A contract with renounced
  or unusual ownership reports no deployer, and `deployer_pedigree` abstains.
- **The registry is the ceiling.** With an empty smart-money list the strongest
  signal is switched off and everything else has to carry the score.
- **Thresholds are unvalidated against live Robinhood Chain data.** They were
  reasoned from how launches behave generally and verified against a synthetic
  chain. Run `backtest` on real history before trusting a tier.

None of this is financial advice, and a high score is a reason to look, not a
reason to buy.
