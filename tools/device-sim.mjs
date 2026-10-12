// Dev-only: simulate the ways the glasses browser might deliver input.
import {chromium} from 'playwright';
const base = process.argv[2] ?? 'http://127.0.0.1:4173';
const browser = await chromium.launch({headless: true, executablePath: '/opt/google/chrome/chrome'});
const ok = (name, pass, extra = '') => console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);

async function fresh(vw = 600, vh = 600) {
  const page = await browser.newPage({viewport: {width: vw, height: vh}});
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base, {waitUntil: 'load'});
  await page.evaluate(() => localStorage.clear());
  await page.reload({waitUntil: 'load'});
  await page.waitForTimeout(700);
  return {page, errors};
}
const focused = page => page.evaluate(() => document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent?.trim().slice(0, 30) || document.activeElement?.tagName);
// Untrusted key event, like a host that dispatches JS events into the page.
const synth = (page, key, opts = {}) =>
  page.evaluate(
    ([key, opts]) => {
      const kc = {ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Enter: 13}[key] ?? 0;
      const ev = new KeyboardEvent('keydown', {key, keyCode: kc, bubbles: true, cancelable: true, ...opts});
      (document.activeElement || document.body).dispatchEvent(ev);
    },
    [key, opts],
  );

// 1) Focus lost to the page at start, then synthetic arrows.
{
  const {page, errors} = await fresh();
  await page.evaluate(() => (document.activeElement)?.blur());
  ok('Focus starts lost (on body)', (await page.evaluate(() => document.activeElement === document.body)));
  await synth(page, 'ArrowDown');
  await page.waitForTimeout(100);
  ok('First synthetic swipe lands on Claim', (await focused(page)).includes('Claim'), await focused(page));
  await synth(page, 'ArrowDown', {altKey: true, metaKey: true});
  await page.waitForTimeout(100);
  ok('Swipe with modifier flags still moves', (await page.evaluate(() => document.activeElement?.getAttribute('role'))) === 'tab', await focused(page));
  await synth(page, 'ArrowDown');
  await page.waitForTimeout(100);
  const tile = await focused(page);
  ok('Down again reaches a game tile', tile.startsWith('Play '), tile);
  // 2) Synthetic Enter (pinch as key) opens the game exactly once.
  await synth(page, 'Enter');
  await page.waitForTimeout(700);
  const hist = await page.evaluate(() => history.length);
  ok('Synthetic Enter opens the game', !!(await page.$('.game')), `history ${hist}`);
  // 3) Pinch as a synthetic tap on the focused control.
  await page.waitForTimeout(400);
  const bal0 = await page.evaluate(() => JSON.parse(localStorage.getItem('kmr.wallet.v2') || '{}').balance ?? 10000);
  await page.evaluate(() => {
    const el = document.activeElement;
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2}));
  });
  await page.waitForTimeout(1200);
  const w = await page.evaluate(() => JSON.parse(localStorage.getItem('kmr.wallet.v2') || '{}'));
  ok('Synthetic tap on Bet places exactly one bet', (w.bets ?? 0) <= 1 && (w.balance !== bal0 || (w.bets ?? 0) === 1), `bets ${w.bets}, balance ${bal0} → ${w.balance}`);
  ok('No page errors', errors.length === 0, errors.join(' | '));
  await page.close();
}

// 4) Host already claimed the press (preventDefault) but did NOT move focus → we step in once.
{
  const {page} = await fresh();
  const start = await focused(page);
  await page.evaluate(() => {
    window.addEventListener('keydown', e => e.key.startsWith('Arrow') && e.preventDefault(), true);
  });
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(150);
  const after = await focused(page);
  ok('Claimed-but-unhandled press still moves exactly one step', start.includes('Claim') && /Racing|Table|Originals/.test(after), `${start} → ${after}`);
  await page.close();
}

// 5) Host claimed the press AND moved focus itself → we must not move again.
{
  const {page} = await fresh();
  await page.evaluate(() => {
    window.addEventListener(
      'keydown',
      e => {
        if (e.key !== 'ArrowDown') return;
        e.preventDefault();
        document.querySelector('.tab')?.focus();
      },
      true,
    );
  });
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(150);
  ok('Host-handled press is not doubled', (await focused(page)).includes('KMR Originals'), await focused(page));
  await page.close();
}

// 6) Smaller viewport: canvas scales, page never overflows, nav still works.
for (const [vw, vh] of [[480, 480], [600, 540]]) {
  const {page} = await fresh(vw, vh);
  const m = await page.evaluate(() => ({
    zoom: document.getElementById('root').style.zoom,
    ox: document.documentElement.scrollWidth - innerWidth,
    oy: document.documentElement.scrollHeight - innerHeight,
    rect: document.getElementById('root').getBoundingClientRect().toJSON(),
  }));
  ok(`Viewport ${vw}×${vh}: canvas fits without overflow`, m.ox <= 0 && m.oy <= 0 && m.rect.right <= vw + 1 && m.rect.bottom <= vh + 1, `zoom ${m.zoom || 1}, root ${Math.round(m.rect.width)}×${Math.round(m.rect.height)}`);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(100);
  ok(`Viewport ${vw}×${vh}: navigation works`, (await focused(page)).startsWith('Play '), await focused(page));
  await page.close();
}

// 7) Lobby page buttons work by pinch alone.
{
  const {page} = await fresh();
  await page.focus('.pager-btn:not(:disabled)');
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
  }
  const lastPage = await page.$('[data-game="horses"]');
  ok('Next-page button reaches the last page', !!lastPage);
  ok('Focus survives the Next button disabling', (await focused(page)).includes('Prev'), await focused(page));
  await page.close();
}

await browser.close();
