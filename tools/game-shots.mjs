// Dev-only: open a game and run steps, taking screenshots.
// Usage: node tools/game-shots.mjs <url> <outDir> <gameId> step step ...
// Steps: click:<css>  key:<Key>  wait:<ms>  shot:<name>  eval:<js>
import {chromium} from 'playwright';
const [base, out, id, ...steps] = process.argv.slice(2);
const browser = await chromium.launch({headless: true, executablePath: '/opt/google/chrome/chrome'});
const page = await browser.newPage({viewport: {width: 600, height: 600}});
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
await page.goto(base, {waitUntil: 'load'});
await page.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('kmr.dbOverride', 'http://127.0.0.1:9199');
  localStorage.setItem('kmr.profile.v1', JSON.stringify({name: 'Shots', claimed: true, secret: 'x'.repeat(48), sound: false}));
  localStorage.setItem('kmr.wallet.v2', JSON.stringify({balance: 100000, betAmount: 10}));
});
for (const s of steps.filter(x => x.startsWith('pre:'))) await page.evaluate(s.slice(4));
await page.reload({waitUntil: 'load'});
await page.waitForTimeout(400);
for (let i = 0; i < 6 && !(await page.$(`[data-game="${id}"]`)); i++) {
  await page.click('.pager-btn[aria-label="Next page"]');
  await page.waitForTimeout(150);
}
await page.click(`[data-game="${id}"]`);
await page.waitForSelector('.game');
await page.waitForTimeout(500);
for (const s of steps.filter(x => !x.startsWith('pre:'))) {
  const [k, ...rest] = s.split(':');
  const v = rest.join(':');
  if (k === 'click') await page.click(v);
  else if (k === 'key') await page.keyboard.press(v);
  else if (k === 'wait') await page.waitForTimeout(Number(v));
  else if (k === 'shot') await page.screenshot({path: `${out}/${v}.png`});
  else if (k === 'eval') console.log(await page.evaluate(v));
}
console.log(errors.length ? `ERRORS: ${errors.join(' | ')}` : 'no errors');
await browser.close();
