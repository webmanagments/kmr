// Dev-only: admin commands end to end with two "devices" (kmr = admin, larp = player) on the mock DB.
// Needs the preview (4173) and tools/mock-db.mjs (9199) running. Usage: node tools/admin-test.mjs [base] [shotsDir]
import {chromium} from 'playwright';
const base = process.argv[2] ?? 'http://127.0.0.1:4173';
const shots = process.argv[3];
const DB = 'http://127.0.0.1:9199';
const browser = await chromium.launch({headless: true, executablePath: '/opt/google/chrome/chrome'});
let fails = 0;
const check = (n, ok, x = '') => (ok || fails++, console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ` — ${x}` : ''}`));
await fetch(`${DB}/__reset`, {method: 'POST'});

async function device(name, secret) {
  const ctx = await browser.newContext({viewport: {width: 600, height: 600}});
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await page.goto(base, {waitUntil: 'load'});
  await page.evaluate(
    ({db, name, secret}) => {
      localStorage.clear();
      localStorage.setItem('kmr.dbOverride', db);
      localStorage.setItem('kmr.profile.v1', JSON.stringify({name, secret, claimed: false, joined: Date.now(), resets: 0, lastReset: 0, favorites: [], recentGames: [], sound: false}));
    },
    {db: DB, name, secret},
  );
  await page.reload({waitUntil: 'load'});
  return {page, errors};
}
const key = async (page, k, wait = 160) => (await page.keyboard.press(k), await page.waitForTimeout(wait));
const focused = page => page.evaluate(() => document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent?.trim() || 'none');
const bal = page => page.evaluate(() => JSON.parse(localStorage.getItem('kmr.wallet.v2') ?? '{}').balance ?? 10000);
const store = page => page.evaluate(() => JSON.parse(localStorage.getItem('kmr.profile.v1')));

const A = await device('kmr', 'a'.repeat(48));
const B = await device('larp', 'b'.repeat(48));
const C = await device('sneaky', 'c'.repeat(48));
await A.page.waitForTimeout(4000);
check('kmr claimed its name', (await store(A.page)).claimed);
check('larp claimed its name', (await store(B.page)).claimed);
check('Crown button only for kmr', !!(await A.page.$('.admin-btn')) && !(await B.page.$('.admin-btn')));

// Open the admin panel with the D-pad: focus the crown and press it.
await A.page.focus('.admin-btn');
await key(A.page, 'Enter', 1200);
check('Admin panel opens', !!(await A.page.$('.admin')), await focused(A.page));
if (shots) await A.page.screenshot({path: `${shots}/a1-admin.png`});
// pick larp from the list
const larpRow = await A.page.$('.adm-row:has-text("larp")');
await larpRow.focus();
await key(A.page, 'Enter', 600);
check('Selecting larp targets them', (await A.page.textContent('.adm-who b')) === 'larp');
// Add 10K
const b0 = await bal(B.page);
await A.page.focus('.adm-act.is-green');
await key(A.page, 'Enter', 900);
check('Grant reached the database', JSON.stringify(await (await fetch(`${DB}/grants/larp.json`)).json()).includes('"add"'));
// Godlike for 15 min
await A.page.click('.adm-luck button:has-text("Godlike")');
await A.page.click('.adm-act.adm-wide');
await A.page.waitForTimeout(600);
if (shots) await A.page.screenshot({path: `${shots}/a2-sent.png`});
// larp picks it up on the next poll (within 15s; visibility change triggers it sooner)
await B.page.waitForFunction(b => (JSON.parse(localStorage.getItem('kmr.wallet.v2') ?? '{}').balance ?? 0) > b, b0, {timeout: 20000}).catch(() => {});
const b1 = await bal(B.page);
check('larp received +10,000', Math.round(b1 - b0) === 10000, `${b0} → ${b1}`);
const lk = await B.page.evaluate(() => JSON.parse(localStorage.getItem('kmr.luck.v1') ?? '{}'));
check('larp is Godlike for ~15 min', lk.level === 3 && Math.abs(lk.until - Date.now() - 15 * 60000) < 60000, JSON.stringify(lk));
await B.page.waitForTimeout(1500);
check('Luck badge shows on larp', !!(await B.page.$('.luck-badge.is-good')));
if (shots) await B.page.screenshot({path: `${shots}/a3-larp.png`});
check('Grants cleared after applying', (await (await fetch(`${DB}/grants/larp.json`)).json()) === null);

// Remove 1M from larp (clamps at 0), then set to 5,000
await A.page.click('.adm-chips button:has-text("1M")');
await A.page.click('.adm-act.is-red');
await A.page.waitForTimeout(400);
await A.page.click('.adm-chips button:has-text("1K")');
await A.page.waitForTimeout(100);
// custom amount via keypad: 5000
await A.page.focus('.adm-chips button[aria-label^="Custom amount"]');
await key(A.page, 'Enter', 500);
check('Amount keypad opens', !!(await A.page.$('.adm-pad')));
for (const k of ['5', '0', '0', '0']) await A.page.click(`.adm-padkeys button[aria-label="${k}"]`);
if (shots) await A.page.screenshot({path: `${shots}/a4-pad.png`});
await A.page.click('.adm-pad .adm-act.is-green');
await A.page.waitForTimeout(500);
check('Keypad closed and amount is 5,000', !(await A.page.$('.adm-pad')) && ((await A.page.textContent('.adm-act.is-green')) ?? '').includes('5,000'));
await A.page.click('.adm-actions .adm-act:has-text("= Set")');
await A.page.waitForTimeout(500);
await B.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
await B.page.waitForFunction(() => Math.round(JSON.parse(localStorage.getItem('kmr.wallet.v2') ?? '{}').balance) === 5000, null, {timeout: 20000}).catch(() => {});
check('Remove then Set → larp has 5,000', Math.round(await bal(B.page)) === 5000, String(await bal(B.page)));

// Type a name with the on-screen keyboard
await A.page.focus('.adm-typebtn');
await key(A.page, 'Enter', 500);
check('Name keyboard opens', !!(await A.page.$('.adm-kb')), await focused(A.page));
for (const ch of 'sne') await A.page.click(`.adm-keys button:text-is("${ch}")`);
if (shots) await A.page.screenshot({path: `${shots}/a5-kb.png`});
for (const ch of 'aky') await A.page.click(`.adm-keys button:text-is("${ch}")`);
await A.page.click('.adm-kb .adm-act.is-green');
await A.page.waitForTimeout(600);
check('Typed name selects the player', (await A.page.textContent('.adm-who b')) === 'sneaky');
// Back closes nothing now (keyboard already closed) → Escape leaves admin
// Admin on self: +5,000 instantly
await A.page.click('.adm-row:has-text("kmr")');
const a0 = await bal(A.page);
await A.page.click('.adm-chips button:has-text("1K")');
await A.page.click('.adm-act.is-green');
await A.page.waitForTimeout(500);
check('Admin can add to themselves instantly', Math.round((await bal(A.page)) - a0) === 1000);
await A.page.click('.adm-luck button:has-text("Unlucky")');
await A.page.click('.adm-act.adm-wide');
await A.page.waitForTimeout(400);
check('Admin can give themselves luck', (await A.page.evaluate(() => JSON.parse(localStorage.getItem('kmr.luck.v1')).level)) === -1);
await A.page.click('.adm-luck button:has-text("Normal")');
await A.page.click('.adm-act.adm-wide');
await A.page.waitForTimeout(300);
check('Clear luck', (await A.page.evaluate(() => JSON.parse(localStorage.getItem('kmr.luck.v1')).level)) === 0);

// Security: another player can't send commands
const forged = await C.page.evaluate(async db => {
  const r = await fetch(`${db}/.json`, {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({'stamp/sneaky': {k: 'c'.repeat(48), t: {'.sv': 'timestamp'}}, 'grants/larp/abcdef123': {type: 'add', amount: 999999, by: 'sneaky', t: {'.sv': 'timestamp'}}})});
  return r.status;
}, DB);
check('Non-admin cannot write grants', forged === 401, String(forged));
const forged2 = await C.page.evaluate(async db => {
  const r = await fetch(`${db}/.json`, {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({'stamp/kmr': {k: 'c'.repeat(48), t: {'.sv': 'timestamp'}}, 'grants/larp/abcdef124': {type: 'add', amount: 999999, t: {'.sv': 'timestamp'}}})});
  return r.status;
}, DB);
check('Faking the kmr stamp is refused', forged2 === 401, String(forged2));
// Back leaves admin and focus lands on the crown
await key(A.page, 'Escape', 900);
check('Back returns to the lobby', !(await A.page.$('.admin')), await focused(A.page));
check('No console errors', [...A.errors, ...B.errors, ...C.errors].length === 0, [...A.errors, ...B.errors, ...C.errors].join(' | '));
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
await browser.close();
