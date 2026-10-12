// Dev-only: names, leaderboard, favorites and daily reset, driven by D-pad keys only.
// Needs the preview (4173) and tools/mock-db.mjs (9199) running.
import {chromium} from 'playwright';
const base = process.argv[2] ?? 'http://127.0.0.1:4173';
const DB = 'http://127.0.0.1:9199';
const shots = process.argv[3];
const browser = await chromium.launch({headless: true, executablePath: '/opt/google/chrome/chrome'});
let fails = 0;
await fetch(`${DB}/__reset`, {method: 'POST'});
const check = (n, ok, x = '') => {
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ` — ${x}` : ''}`);
};

async function device() {
  const ctx = await browser.newContext({viewport: {width: 600, height: 600}});
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await page.goto(base, {waitUntil: 'load'});
  await page.evaluate(db => {
    localStorage.clear();
    localStorage.setItem('kmr.dbOverride', db);
  }, DB);
  await page.reload({waitUntil: 'load'});
  await page.waitForTimeout(500);
  return {page, errors};
}
const focused = page => page.evaluate(() => document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent?.trim() || 'none');

// Walk the D-pad toward a key, one swipe at a time, then pinch it.
async function pressKey(page, label) {
  for (let i = 0; i < 30; i++) {
    const d = await page.evaluate(l => {
      const t = [...document.querySelectorAll('.ns button')].find(b => (b.getAttribute('aria-label') || b.textContent.trim()) === l);
      const a = document.activeElement;
      if (!t || !a) return null;
      if (t === a) return 'here';
      const r1 = a.getBoundingClientRect(), r2 = t.getBoundingClientRect();
      const dx = r2.left + r2.width / 2 - (r1.left + r1.width / 2), dy = r2.top + r2.height / 2 - (r1.top + r1.height / 2);
      if (Math.abs(dy) > 8) return dy > 0 ? 'ArrowDown' : 'ArrowUp';
      return dx > 0 ? 'ArrowRight' : 'ArrowLeft';
    }, label);
    if (d === 'here') return page.keyboard.press('Enter');
    if (!d) throw new Error(`no key ${label}`);
    await page.keyboard.press(d);
    await page.waitForTimeout(25);
  }
  throw new Error(`could not reach ${label}`);
}
async function typeName(page, name) {
  for (const ch of name) {
    const shiftOn = await page.evaluate(() => document.querySelector('.ns')?.dataset.shift === 'true');
    if (/[A-Za-z]/.test(ch)) {
      const wantUpper = ch === ch.toUpperCase();
      if (wantUpper !== shiftOn) await pressKey(page, shiftOn ? 'Shift on' : 'Shift');
      await pressKey(page, ch);
    } else await pressKey(page, ch === '_' ? 'Underscore' : ch);
    await page.waitForTimeout(40);
  }
}

// ---- Device A picks a name ----
const A = await device();
check('First launch shows the name screen', !!(await A.page.$('.ns')));
check('Focus starts on a key', (await focused(A.page)) === 'Q', await focused(A.page));
if (shots) await A.page.screenshot({path: `${shots}/p-name0.png`});
await typeName(A.page, 'Kuyro_7');
await A.page.waitForTimeout(700);
check('Typed with D-pad + pinch', (await A.page.$eval('.ns-name', e => e.textContent)) === 'Kuyro_7', await A.page.$eval('.ns-name', e => e.textContent));
check('Name shows as available', (await A.page.$eval('.ns-status', e => e.textContent)) === 'Available', await A.page.$eval('.ns-status', e => e.textContent));
if (shots) await A.page.screenshot({path: `${shots}/p-name1.png`});
await pressKey(A.page, 'Start playing');
await A.page.waitForSelector('.lobby', {timeout: 5000}).catch(() => {});
check('Joining opens the lobby', !!(await A.page.$('.lobby')));
let board = await (await fetch(`${DB}/board.json`)).json();
check('Name claimed on the leaderboard', board.kuyro_7?.name === 'Kuyro_7', JSON.stringify(Object.keys(board)));
const prof = await A.page.evaluate(() => JSON.parse(localStorage.getItem('kmr.profile.v1')));
check('Profile saved on device', prof.name === 'Kuyro_7' && prof.claimed === true);

// ---- Device B tries the same name ----
const B = await device();
await typeName(B.page, 'KUYRO_7');
await B.page.waitForTimeout(800);
check('Second device sees the name as taken', (await B.page.$eval('.ns-status', e => e.textContent)).startsWith('Taken'), await B.page.$eval('.ns-status', e => e.textContent));
await pressKey(B.page, 'Start playing');
await B.page.waitForTimeout(600);
check('Taken name cannot be joined', !!(await B.page.$('.ns')));
// Forge attempt: B posts to A's board entry with its own key.
const forged = await fetch(`${DB}/.json`, {
  method: 'PATCH',
  body: JSON.stringify({'stamp/kuyro_7': {k: 'x'.repeat(48), t: {'.sv': 'timestamp'}}, 'board/kuyro_7': {...board.kuyro_7, profit: 1e9, updated: {'.sv': 'timestamp'}}}),
});
check('Another device cannot overwrite the name', forged.status === 401);
// B takes a random name instead.
await pressKey(B.page, 'Random name');
await B.page.waitForTimeout(700);
await pressKey(B.page, 'Start playing');
await B.page.waitForSelector('.lobby', {timeout: 5000}).catch(() => {});
check('Random name works', !!(await B.page.$('.lobby')));

// ---- A plays a bet; stats sync ----
await A.page.click('[data-game="drill"]');
await A.page.waitForSelector('.game');
await A.page.waitForTimeout(400);
await A.page.click('.side .play-btn');
await A.page.waitForTimeout(3500); // a full drill run
// Favorite via the star in the top bar.
await A.page.focus('.fav-btn');
await A.page.keyboard.press('Enter');
await A.page.waitForTimeout(200);
check('Star marks a favorite', await A.page.evaluate(() => JSON.parse(localStorage.getItem('kmr.profile.v1')).favorites.includes('drill')));
await A.page.keyboard.press('Escape');
await A.page.waitForTimeout(500);
check('My Games tab appears', await A.page.evaluate(() => [...document.querySelectorAll('.tab')].some(t => t.textContent.includes('My Games'))));
await A.page.waitForTimeout(7000);
board = await (await fetch(`${DB}/board.json`)).json();
check('Bet synced to the leaderboard', board.kuyro_7?.bets === 1 && (board.kuyro_7.recent?.length ?? 0) === 1, `bets ${board.kuyro_7?.bets}`);

// ---- Daily reset ----
await A.page.focus('.wallet-btn');
await A.page.keyboard.press('Enter');
await A.page.waitForTimeout(400);
const resetBtn = await A.page.$('.wa-btn:not(.tone-green)');
await resetBtn.click();
await resetBtn.click();
await A.page.waitForTimeout(300);
const st = await A.page.evaluate(() => ({p: JSON.parse(localStorage.getItem('kmr.profile.v1')), w: JSON.parse(localStorage.getItem('kmr.wallet.v2'))}));
check('Reset refills to 10,000 and keeps stats', st.w.balance === 10000 && st.w.bets === 1 && st.p.resets === 1, `balance ${st.w.balance}, bets ${st.w.bets}, resets ${st.p.resets}`);
check('Second reset is blocked for 24h', await A.page.$eval('.wa-btn:not(.tone-green)', b => b.disabled && b.textContent.includes('Next reset')));
if (shots) await A.page.screenshot({path: `${shots}/p-wallet.png`});
await A.page.keyboard.press('Escape');
await A.page.waitForTimeout(400);

// ---- Leaderboard ----
await A.page.waitForTimeout(6500); // let the reset sync
await A.page.focus('.lb-btn');
await A.page.keyboard.press('Enter');
await A.page.waitForSelector('.lb-row', {timeout: 5000}).catch(() => {});
await A.page.waitForTimeout(500);
const rows = await A.page.$$eval('.lb-row', r => r.map(x => x.textContent));
check('Leaderboard lists both players', rows.some(r => r.includes('Kuyro_7')) && rows.length >= 2, rows.join(' | '));
check('Reset count shows on the leaderboard', rows.some(r => r.includes('Kuyro_7') && r.includes('1 reset')));
check('Focus lands on the first row', (await focused(A.page)).startsWith('#1'), await focused(A.page));
if (shots) await A.page.screenshot({path: `${shots}/p-board.png`});
await A.page.keyboard.press('Enter');
await A.page.waitForSelector('.lb-card');
check('Pinch a row opens the player card', !!(await A.page.$('.lb-card')));
if (shots) await A.page.screenshot({path: `${shots}/p-card.png`});
await A.page.keyboard.press('Escape');
await A.page.waitForTimeout(400);
check('Back closes the card', !(await A.page.$('.lb-card')));
await A.page.focus('.lb-tab:last-child');
await A.page.keyboard.press('Enter');
await A.page.waitForTimeout(400);
if (shots) await A.page.screenshot({path: `${shots}/p-live.png`});
check('Recent bets tab shows bets', (await A.page.$$('.lb-row.is-bet')).length >= 1);
await A.page.keyboard.press('Escape');
await A.page.waitForTimeout(500);
check('Back returns to the lobby', !!(await A.page.$('.lobby')));
check('Focus returns to the trophy button', (await focused(A.page)) === 'Leaderboard', await focused(A.page));
if (shots) await A.page.screenshot({path: `${shots}/p-lobby.png`});

check('No page errors', A.errors.length + B.errors.length === 0, [...A.errors, ...B.errors].join(' | '));
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
await browser.close();
