// Dev-only: screenshots of Sky Run flights (mid-flight frames + the final frame of each outcome).
import {chromium} from 'playwright';
const [base = 'http://127.0.0.1:4173', out = '.', runs = '6'] = process.argv.slice(2);
const browser = await chromium.launch({headless: true, executablePath: '/opt/google/chrome/chrome'});
const page = await browser.newPage({viewport: {width: 600, height: 600}});
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(base, {waitUntil: 'load'});
await page.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('kmr.dbOverride', 'http://127.0.0.1:9199');
  localStorage.setItem('kmr.profile.v1', JSON.stringify({name: 'Shots', claimed: true, secret: 'x'.repeat(48)}));
  localStorage.setItem('kmr.wallet.v2', JSON.stringify({balance: 100000, betAmount: 10}));
});
await page.reload({waitUntil: 'load'});
await page.waitForTimeout(400);
await page.click('[data-game="skyrun"]');
await page.waitForSelector('.sky-view canvas');
await page.waitForTimeout(600);
await page.screenshot({path: `${out}/sky-idle.png`});
const seen = {};
for (let i = 0; i < Number(runs); i++) {
  await page.click('.side .play-btn');
  for (const ms of [700, 1600, 3000]) {
    await page.waitForTimeout(ms === 700 ? 700 : ms - (ms === 1600 ? 700 : 1600));
    if (i < 2) await page.screenshot({path: `${out}/sky-run${i}-${ms}.png`});
  }
  await page.waitForFunction(() => /Landed|Lost/.test(document.querySelector('.sky-mult span')?.textContent ?? ''), null, {timeout: 30000});
  const res = await page.$eval('.sky-mult span', e => e.textContent);
  await page.waitForTimeout(250);
  const key = res === 'Landed' ? 'win' : 'lose';
  seen[key] = (seen[key] ?? 0) + 1;
  await page.screenshot({path: `${out}/sky-end-${key}${seen[key]}.png`});
  await page.waitForTimeout(1200);
}
console.log(JSON.stringify(seen), errors.length ? errors : 'no errors');
await browser.close();
