// Dev-only: random D-pad/pinch/back input across every game, then reconcile the wallet.
import {chromium} from 'playwright';
const base = process.argv[2] ?? 'http://127.0.0.1:4173';
const ROUNDS = Number(process.argv[3] ?? 60);
const IDS = ['crash', 'plinko', 'mines', 'dice', 'limbo', 'towers', 'hilo', 'keno', 'wheel', 'pump', 'diamonds', 'coinflip', 'cases', 'slide', 'blackjack', 'roulette', 'baccarat', 'videopoker', 'dragontiger', 'slots', 'horses'];
const browser = await chromium.launch({headless: true, executablePath: '/opt/google/chrome/chrome'});
const page = await browser.newPage({viewport: {width: 600, height: 600}});
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => m.type() === 'error' && errors.push(m.text()));
await page.goto(base, {waitUntil: 'load'});
await page.evaluate(() => localStorage.clear());
await page.reload({waitUntil: 'load'});
await page.waitForTimeout(300);

const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Enter', 'Enter'];
async function open(id) {
  for (let i = 0; i < 4; i++) {
    const first = await page.$('.tiles button.tile:first-of-type');
    if (!first) break;
    await first.focus();
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(120);
  }
  for (let i = 0; i < 6 && !(await page.$(`[data-game="${id}"]`)); i++) {
    await page.focus('.tiles button.tile:last-of-type');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(150);
  }
  await page.focus(`[data-game="${id}"]`);
  await page.keyboard.press('Enter');
  await page.waitForSelector('.game');
  await page.waitForTimeout(300);
}

let presses = 0;
for (const id of IDS) {
  await open(id);
  for (let i = 0; i < ROUNDS; i++) {
    // Never wander into the wallet's Reset button during the fuzz.
    if (await page.$('.modal')) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
      continue;
    }
    const k = keys[Math.floor(Math.random() * keys.length)];
    const onWallet = await page.evaluate(() => document.activeElement?.classList.contains('wallet-btn'));
    if (k === 'Enter' && onWallet) continue;
    await page.keyboard.press(k);
    presses++;
    await page.waitForTimeout(k === 'Enter' ? 90 + Math.random() * 400 : 30);
  }
  // Back out mid-whatever: pending settlements must flush.
  for (let i = 0; i < 3 && !(await page.$('.lobby')); i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
  }
}
await page.waitForTimeout(800);

const audit = await page.evaluate(() => {
  const w = JSON.parse(localStorage.getItem('kmr.wallet.v2'));
  // Stakes still riding in resumable rounds (debited, not yet settled).
  let open = 0;
  for (const g of ['mines', 'towers', 'hilo', 'pump', 'coinflip', 'videopoker']) {
    const r = JSON.parse(localStorage.getItem(`kmr.round.${g}`) || 'null');
    if (r && (r.phase === 'playing' || r.phase === 'dealt')) open += r.stake;
  }
  const bj = JSON.parse(localStorage.getItem('kmr.round.blackjack') || 'null');
  if (bj && (bj.phase === 'player' || bj.phase === 'dealer')) open += bj.hands.reduce((s, h) => s + h.stake, 0);
  const bonus = w.lastBonus ? 2500 : 0;
  return {balance: w.balance, profit: w.profit, bets: w.bets, wagered: w.wagered, open, bonus, expected: Math.round((10000 + bonus + w.profit - open) * 100) / 100};
});
console.log(JSON.stringify({presses, ...audit, reconciles: Math.abs(audit.balance - audit.expected) < 0.011, errors}, null, 2));
await browser.close();
