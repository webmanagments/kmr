// Dev-only: approximate the glasses browser, which does its own spatial navigation.
// Chrome's --enable-spatial-navigation moves focus on arrow keys; our page-level
// arrow handler is bypassed so we see what the *browser* would select.
import {chromium} from 'playwright';
const base = process.argv[2] ?? 'http://127.0.0.1:4173';
const browser = await chromium.launch({
  headless: true,
  executablePath: '/opt/google/chrome/chrome',
  args: ['--enable-spatial-navigation'],
});
const page = await browser.newPage({viewport: {width: Number(process.env.VW || 600), height: Number(process.env.VH || 600)}});
await page.addInitScript(() => {
  // Swallow arrows before the app's document listener, without preventDefault.
  window.addEventListener('keydown', e => { if (e.key.startsWith('Arrow')) e.stopImmediatePropagation(); }, true);
});
await page.goto(base, {waitUntil: 'load'});
await page.evaluate(() => localStorage.clear());
await page.reload({waitUntil: 'load'});
await page.waitForTimeout(500);
const where = () =>
  page.evaluate(() => {
    const a = document.activeElement;
    if (!a) return 'none';
    const r = a.getBoundingClientRect();
    return `${a.tagName.toLowerCase()}${a.id ? '#' + a.id : ''}${a.className ? '.' + String(a.className).split(' ')[0] : ''} "${(a.getAttribute('aria-label') || a.textContent || '').trim().slice(0, 24)}" ${Math.round(r.width)}×${Math.round(r.height)}`;
  });
console.log('start  ', await where());
for (const k of ['ArrowDown', 'ArrowDown', 'ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
  await page.keyboard.press(k);
  await page.waitForTimeout(150);
  console.log(k.padEnd(11), await where());
}
await page.keyboard.press('Enter');
await page.waitForTimeout(600);
console.log('Enter →', (await page.$('.game')) ? 'opened a game' : (await page.$('.modal')) ? 'opened wallet' : 'nothing happened');
await browser.close();
