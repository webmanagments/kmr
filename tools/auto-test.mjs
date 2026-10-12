// Dev-only: run Auto Bet on every game and check rounds settle and the wallet reconciles.
// Usage: node tools/auto-test.mjs [url] [gameIds...]
import {chromium} from 'playwright';
const [base = 'http://127.0.0.1:4173', ...only] = process.argv.slice(2);
const ALL = ['skyrun', 'chicken', 'tarot', 'penalty', 'crash', 'plinko', 'mines', 'dice', 'limbo', 'towers', 'hilo', 'keno', 'wheel', 'pump', 'diamonds', 'coinflip', 'cases', 'slide', 'blackjack', 'roulette', 'baccarat', 'videopoker', 'dragontiger', 'slots', 'horses'];
const IDS = only.length ? only : ALL;
// Prerequisites some games need before a bet can be placed.
const SETUP = {
  keno: '.btn-row .ghost-btn:first-child',
  roulette: '.rl-cell.is-red',
  baccarat: '.bac-spot.is-player',
  dragontiger: '.dt-spot.is-dragon',
};

const browser = await chromium.launch({headless: true, executablePath: '/opt/google/chrome/chrome'});
const page = await browser.newPage({viewport: {width: 600, height: 600}});
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => m.type() === 'error' && errors.push(m.text()));
await page.goto(base, {waitUntil: 'load'});
await page.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('kmr.wallet.v2', JSON.stringify({balance: 1e6, betAmount: 1}));
});
await page.reload({waitUntil: 'load'});
await page.waitForTimeout(400);

const wallet = () => page.evaluate(() => JSON.parse(localStorage.getItem('kmr.wallet.v2')));
async function open(id) {
  for (let i = 0; i < 6; i++) {
    const prev = await page.$('.pager-btn[aria-label="Previous page"]:not(:disabled)');
    if (!prev) break;
    await prev.click();
    await page.waitForTimeout(150);
  }
  for (let i = 0; i < 6 && !(await page.$(`[data-game="${id}"]`)); i++) {
    await page.click('.pager-btn[aria-label="Next page"]');
    await page.waitForTimeout(150);
  }
  await page.click(`[data-game="${id}"]`);
  await page.waitForSelector('.game');
  await page.waitForTimeout(400);
}

let failures = 0;
for (const id of IDS) {
  await page.waitForTimeout(300);
  await page.screenshot({path: '/dev/null'}).catch(() => {});
  await open(id);
  if (SETUP[id]) {
    await page.click(SETUP[id]);
    await page.waitForTimeout(200);
  }
  const before = (await wallet()).bets ?? 0;
  await page.click('.auto-btn');
  await page.waitForSelector('.sheet');
  // Number of Bets: 10 → 5 (slow games: 5 → 3 isn't on the ladder, so keep 5).
  await page.click('button[aria-label="Decrease Number of Bets"]');
  const back = await page.evaluate(() => history.state?.sheet);
  await page.click('.sheet .play-btn');
  const t0 = Date.now();
  await page.waitForSelector('.auto-stop', {timeout: 5000}).catch(() => {});
  const ran = await page.waitForSelector('.auto-stop', {state: 'detached', timeout: 240000}).then(() => true, () => false);
  await page.waitForTimeout(500); // wallet saves to storage 250ms after a change
  const after = (await wallet()).bets ?? 0;
  const rounds = after - before;
  const ok = ran && rounds === 5;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id.padEnd(12)} rounds ${rounds}/5  ${((Date.now() - t0) / 1000).toFixed(1)}s  sheet-in-history:${back === 'auto'}`);
  // Back to the lobby.
  for (let i = 0; i < 3 && !(await page.$('.lobby')); i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
}

await page.waitForTimeout(800);
const w = await wallet();
// Every round settled, nothing left riding: balance = start + profit.
const riding = await page.evaluate(() => {
  let s = 0;
  for (const g of ['mines', 'towers', 'hilo', 'pump', 'coinflip', 'videopoker', 'chicken', 'penalty']) {
    const r = JSON.parse(localStorage.getItem(`kmr.round.${g}`) || 'null');
    if (r && (r.phase === 'playing' || r.phase === 'dealt')) s += r.stake;
  }
  return s;
});
const expected = Math.round((1e6 + w.profit - riding) * 100) / 100;
console.log(`wallet: balance ${w.balance}, expected ${expected}, riding ${riding} → ${Math.abs(w.balance - expected) < 0.011 ? 'RECONCILES' : 'MISMATCH'}`);
console.log(errors.length ? `ERRORS: ${errors.join(' | ')}` : 'no page errors');
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
await browser.close();
