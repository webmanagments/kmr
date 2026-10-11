// Dev-only: screenshot every screen at the glasses' 600×600 viewport.
// Usage: node tools/shots.mjs <baseUrl> <outDir> [gameIds...]
import {chromium} from 'playwright';
import {mkdirSync} from 'node:fs';

const [base = 'http://127.0.0.1:4173', out = 'shots', ...only] = process.argv.slice(2);
mkdirSync(out, {recursive: true});
const GAMES = only.length
  ? only
  : ['crash', 'plinko', 'mines', 'dice', 'limbo', 'towers', 'hilo', 'keno', 'wheel', 'pump', 'diamonds', 'coinflip', 'cases', 'slide', 'blackjack', 'roulette', 'baccarat', 'videopoker', 'dragontiger', 'slots', 'horses'];

const browser = await chromium.launch({headless: true, executablePath: process.env.CHROME || '/opt/google/chrome/chrome'});
const page = await browser.newPage({viewport: {width: 600, height: 600}});
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('console', m => m.type() === 'error' && errors.push(`console: ${m.text()}`));

await page.goto(base, {waitUntil: 'load'});
await page.evaluate(() => localStorage.clear());
await page.reload({waitUntil: 'load'});
await page.waitForTimeout(400);
await page.screenshot({path: `${out}/00-lobby.png`});
await page.evaluate(() => document.querySelector('.lobby').scrollTo(0, 400));
await page.waitForTimeout(300);
await page.screenshot({path: `${out}/01-lobby-scrolled.png`});
await page.evaluate(() => document.querySelector('.lobby').scrollTo(0, 0));

for (const id of GAMES) {
  await page.click(`[data-game="${id}"]`);
  await page.waitForSelector('.game', {timeout: 5000});
  await page.waitForTimeout(350);
  await page.screenshot({path: `${out}/${id}-a.png`});
  // Play one round with the keyboard: Enter on the focused primary action.
  await page.keyboard.press('Enter');
  await page.waitForTimeout(id === 'crash' ? 2500 : id === 'cases' || id === 'slide' || id === 'wheel' || id === 'horses' ? 1800 : 700);
  await page.screenshot({path: `${out}/${id}-b.png`});
  // Back out to the lobby however deep we are (modal, game).
  for (let i = 0; i < 3 && !(await page.$('.lobby')); i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
}

// Wallet modal
await page.click('.wallet-btn');
await page.waitForTimeout(300);
await page.screenshot({path: `${out}/zz-wallet.png`});
console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
