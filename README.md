# KMR Casino — Meta Ray-Ban Display Web App

28 play-money casino games built for Meta Ray-Ban Display glasses and the Meta Neural Band.
Entertainment only: KMR Coins have no cash value and can't be bought, sold, or redeemed.

## Games

**KMR Originals (99% return):** Sky Run (plane flight, 97%), Snakes, Drill, Chicken, Tarot, Penalty Shootout, Crash, Plinko, Mines, Dice, Limbo, Towers, HiLo, Keno, Wheel, Pump, Diamonds, Coinflip, Cases, Slide
**Table games:** Blackjack (3:2, dealer stands on 17, split & double), Roulette (European), Baccarat, Video Poker (9/6 Jacks or Better), Dragon Tiger
**Slots & More:** Scratch Cards (match 3, 97%), Lucky 7s (5-line slot), Horse Racing (fresh odds every race)

Player wallet starts at 10,000 coins, with a +2,500 daily bonus and **one reset per day** (back to 10,000; lifetime stats are kept).
Rounds in progress (Mines, Towers, HiLo, Pump, Chicken, Penalty, Snakes, Scratch Cards, Coinflip streaks, Blackjack, Video Poker) survive leaving the game or reloading.

## Players and the global leaderboard

On first launch each pair of glasses picks a player name with an on-screen keyboard (swipe to a key, pinch to type, or press
**Random name**). The name is claimed on the global leaderboard and only those glasses can ever post under it.
Profiles (name, favorites, settings) are saved on each pair of glasses.

The 🏆 button opens the leaderboard: **Profit**, **Biggest win**, **Wagered** and **Recent bets** from every player, each with
bets, best multiplier and how many daily resets they've used. Pinch a player to see their full stats and last bets.

The leaderboard lives in a free Firebase Realtime Database (`src/config.ts`); its security rules are in
[`firebase-rules.json`](firebase-rules.json). Note: coins are play money kept on each device, so the board is for fun, not anti-cheat.

**My Games:** press ★ in any game's top bar to pin it; the lobby's **My Games** tab shows your favorites and recently played games.
**Sound:** synthesized sound effects for every game; mute them from Wallet.

**Auto Bet** is on every game: press the ⟳ AUTO button next to Bet to set the number of bets (5 → ∞),
stop-on-profit and stop-on-loss limits, plus game-specific options (cash out after N gems / lanes / goals,
Blackjack basic strategy, Video Poker auto-holds). Back closes the settings; Stop Auto ends it at any time.

## Controls on the glasses

| Input | Action |
| --- | --- |
| Neural Band swipe / touchpad swipe | Move focus |
| Neural Band pinch / touchpad double-tap | Press the focused button |
| Back | Close Wallet / settings, leave a game or the leaderboard, then exit the app |

In the lobby, use the **‹ Prev / More ›** buttons under the grid to change pages (swiping past the grid's right edge also flips forward).
In a desktop browser: arrow keys = swipe, Enter = pinch, Esc = back.

**Troubleshooting:** add `?debug` to the link (`https://webmanagments.github.io/kmr/?debug`) to show a live readout of
exactly what input the glasses send.

## Put it on your glasses (works from a Chromebook)

The ready-to-run site lives in [`docs/`](docs) and is served by GitHub Pages at:

**https://webmanagments.github.io/kmr/**

1. One-time: in this repo go to **Settings → Pages**, set Source to **Deploy from a branch**, branch `main`, folder `/docs`, **Save**.
2. On your phone: **Meta AI app → Devices → (your Display glasses) settings → App connections → Web apps → Add a web app**,
   name it `KMR Casino`, and paste `https://webmanagments.github.io/kmr/`.
   Developer Mode must be on (Settings → App Info → tap the App version 5 times).
   Or scan [`add-to-glasses-qr.png`](add-to-glasses-qr.png) with your glasses.
3. Open it from the apps list on the glasses.

To update the live app after changing code: `npm run build`, then copy `dist/index.html` and `dist/assets` into `docs/` and commit.

## Develop

```sh
npm install
npm run dev        # local dev server
npm run build      # production build into dist/
npm run preview    # serve the production build
```

Quality checks used during development (in `tools/`):

- `node tools/math-check.mjs` — verifies every game's payout math / return-to-player
- `node tools/flow.mjs <url>` — drives the app with arrow keys/Enter/Esc only (Neural Band simulation)
- `node tools/fuzz.mjs <url> 60` — random input across all games, then reconciles the wallet to the cent
- `node tools/auto-test.mjs <url>` — runs Auto Bet on every game and reconciles the wallet
- `node tools/mock-db.mjs` + `node tools/profile-test.mjs` — names, duplicate-name blocking, leaderboard sync, favorites and the daily reset against a local stand-in for the database
- Meta's official gate: `node <meta-wearables-webapp>/plugins/meta-wearables-webapp/skills/ai-glasses-webapp-test/scripts/check-webapp.mjs .`

Built with Meta's custom-UI scaffold (React + Vite + TypeScript) so the look could match a Stake-style design;
it follows Meta's Web Apps rules: fixed 600×600 canvas, dark canvas for the additive display,
browser-history Back (max 5 entries), D-pad focus navigation, ~154 KB gzipped, 5 requests on first load.
