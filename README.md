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

## Admin (the "kmr" account)

The glasses that own the name **kmr** get a gold 👑 button in the top bar. It opens the admin panel:

- **Pick a player** from the list (everyone on the leaderboard, you first) or **Type a name** on the on-screen keyboard.
- **Coins:** choose 1K / 10K / 100K / 1M / 10M or type any amount on the keypad, then **Add**, **Remove** or **Set** their balance.
- **Luck:** Cursed, Unlucky, Normal (clears it), Lucky, Very lucky or Godlike, for 5 min, 15 min, 1 hour, 6 hours or a day.
  Luck works in all 28 games: lucky players win noticeably more often (a 50/50 coin flip lands about 57% / 65% / 84% of the time
  for Lucky / Very lucky / Godlike, and about 42% / 35% for Unlucky / Cursed). Anyone with luck active sees a 🍀 or 💀 timer in their top bar.
- **Give reset back** (their daily balance reset is ready again) and **Bonus ready** (their daily bonus can be claimed now).

**Everyone** (top of the player list) has casino-wide controls:

- **Happy hour:** everyone gets Lucky, Very lucky or Godlike for 15 min, 30 min or 1 hour. Every player gets a green
  "Happy hour!" banner and a 🍀 Happy timer. A player's own luck (good or bad) takes priority while it lasts. **End** stops it early.
- **Announcement:** type a message (up to 120 characters) on the on-screen keyboard or pick a preset, then **Send to everyone**.
  It pops up as a gold banner on every player's glasses (players who open the casino within 6 hours still see it).
- **Tournament:** pick the prizes (🥇 50K / 250K / 1M, with 2nd and 3rd at about half and a fifth), the length (1 day, 3 days,
  1 week) and whether it **repeats**. It ranks profit made since the tournament started, shown in a **Tournament** tab
  that opens first on the leaderboard with the time left and the prizes. When it ends, your glasses pay the top 3
  automatically (players must be up to place). Prizes arrive like admin coins with a 🏆 message, and a repeating
  tournament starts the next round right away. **End & pay now** finishes it early.

Everything works on yourself too, applied instantly. For other players a command is delivered within about 15 seconds
while they have the casino open, or the next time they open it (the panel shows how many are waiting).
Admin balance changes don't count toward leaderboard profit; only bets do.

**Security:** commands are signed with the private key stored only on the glasses that own "kmr". The database rules refuse a
command from anyone else, and only the receiving player can clear their own commands.

**One-time setup:** the admin commands need the updated database rules. In the Firebase console open
*Realtime Database → Rules*, replace everything with the contents of [`firebase-rules.json`](firebase-rules.json) and press **Publish**.

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
