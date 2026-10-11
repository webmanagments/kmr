// Dev-only: screenshot lobby pages and selected games, navigating like the wearer.
import {chromium} from 'playwright';
const [base = 'http://127.0.0.1:4173', out = 'shots', ...games] = process.argv.slice(2);
const browser = await chromium.launch({headless: true, executablePath: '/opt/google/chrome/chrome'});
const page = await browser.newPage({viewport: {width: 600, height: 600}});
await page.goto(base, {waitUntil: 'load'});
await page.evaluate(() => localStorage.clear());
await page.reload({waitUntil: 'load'});
await page.waitForTimeout(400);
for (let p = 0; p < 4; p++) {
  await page.screenshot({path: `${out}/lobby-p${p + 1}.png`});
  await page.focus('.tiles button.tile:last-of-type');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(400);
}
async function open(id) {
  for (let i = 0; i < 4; i++) {
    await page.focus('.tiles button.tile:first-of-type');
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(250);
  }
  for (let i = 0; i < 6 && !(await page.$(`[data-game="${id}"]`)); i++) {
    await page.focus('.tiles button.tile:last-of-type');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
  }
  await page.focus(`[data-game="${id}"]`);
  await page.keyboard.press('Enter');
  await page.waitForSelector('.game');
  await page.waitForTimeout(400);
}
for (const spec of games) {
  const [id, wait = '1500'] = spec.split(':');
  await open(id);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(Number(wait));
  await page.screenshot({path: `${out}/${id}-${wait}.png`});
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
}
await browser.close();
