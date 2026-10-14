// Dev-only: happy hour, announcements and tournaments end to end (kmr = admin, larp = player) on the mock DB.
// Needs the preview (4173) and tools/mock-db.mjs (9199). Usage: node tools/events-test.mjs [base] [shotsDir]
import {chromium} from 'playwright';
const base = process.argv[2] ?? 'http://127.0.0.1:4173';
const shots = process.argv[3];
const DB = 'http://127.0.0.1:9199';
const browser = await chromium.launch({headless: true, executablePath: '/opt/google/chrome/chrome'});
let fails = 0;
const check = (n, ok, x = '') => (ok || fails++, console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ` — ${x}` : ''}`));
await fetch(`${DB}/__reset`, {method: 'POST'});
const get = async p => (await fetch(`${DB}/${p}.json`)).json();

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
const poke = page => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); // check now instead of in 15s
const bal = page => page.evaluate(() => JSON.parse(localStorage.getItem('kmr.wallet.v2') ?? '{}').balance ?? 10000);

const A = await device('kmr', 'a'.repeat(48));
const B = await device('larp', 'b'.repeat(48));
const C = await device('sneaky', 'c'.repeat(48));
await A.page.waitForTimeout(4500);
await A.page.click('.admin-btn');
await A.page.waitForTimeout(1200);
await A.page.click('.adm-all');
await A.page.waitForTimeout(300);
check('Everyone panel opens', !!(await A.page.$('.adm-target.is-all')));

// Happy hour: Very lucky for 30 min
await A.page.click('.adm-sec:has-text("Happy hour") button:has-text("Very lucky")');
await A.page.click('.adm-sec:has-text("Happy hour") .adm-act.is-green');
await A.page.waitForTimeout(700);
check('Happy hour written', (await get('events/happy'))?.level === 2);
await poke(B.page);
await B.page.waitForSelector('.event-banner.is-happy', {timeout: 8000}).catch(() => {});
check('larp sees the happy hour banner', !!(await B.page.$('.event-banner.is-happy')), (await B.page.textContent('.event-banner').catch(() => '')) ?? '');
if (shots) await B.page.screenshot({path: `${shots}/e1-happy.png`});
await B.page.waitForTimeout(800);
check('larp has the Happy luck badge', ((await B.page.textContent('.luck-badge').catch(() => '')) ?? '').includes('Happy'));

// Announcement typed on the keyboard
await A.page.focus('.adm-msg');
await A.page.keyboard.press('Enter');
await A.page.waitForTimeout(500);
check('Message keyboard opens', !!(await A.page.$('.adm-tkb')));
for (const ch of 'Hi') await A.page.click(`.adm-tkb .adm-keys button:text-is("${ch}")`);
await A.page.click('.adm-tkb button[aria-label="Space"]');
for (const ch of 'all') await A.page.click(`.adm-tkb .adm-keys button:text-is("${ch}")`);
await A.page.click('.adm-tkb .adm-keys button:text-is("!")');
if (shots) await A.page.screenshot({path: `${shots}/e2-kb.png`});
await A.page.click('.adm-tkb .adm-act.is-green');
await A.page.waitForTimeout(400);
check('Message filled in', ((await A.page.textContent('.adm-msg')) ?? '').includes('Hi all!'));
await A.page.click('.adm-send');
await A.page.waitForTimeout(700);
check('Announcement written', (await get('events/announce'))?.msg === 'Hi all!');
await B.page.waitForTimeout(6800); // let the happy banner finish
await poke(B.page);
await B.page.waitForSelector('.event-banner.is-announce', {timeout: 8000}).catch(() => {});
check('larp sees the announcement', ((await B.page.textContent('.event-banner.is-announce').catch(() => '')) ?? '').includes('Hi all!'));
if (shots) await B.page.screenshot({path: `${shots}/e3-announce.png`});

// Tournament: 1 day, 50K prizes, repeats
await A.page.click('.adm-sec:has-text("Tournament") button:has-text("1 day")');
await A.page.click('.adm-sec:has-text("Tournament") button[aria-label^="Prizes 50K"]');
await A.page.click('.adm-sec:has-text("Tournament") .adm-act.is-green');
await A.page.waitForTimeout(800);
const t1 = await get('events/tourney');
check('Tournament written', t1?.status === 'live' && t1.days === 1, JSON.stringify(t1));
if (shots) await A.page.screenshot({path: `${shots}/e4-everyone.png`});
await poke(B.page);
await B.page.waitForTimeout(9000); // banner + push to the board
const boardB = await get('board/larp');
check('larp joined the tournament on the board', boardB?.tid === t1.id, JSON.stringify({tid: boardB?.tid, tp: boardB?.tp}));
// larp opens the leaderboard: Tournament tab first
await B.page.click('.lb-btn');
await B.page.waitForTimeout(1500);
check('Leaderboard opens on the Tournament tab', ((await B.page.textContent('.lb-tab.is-on').catch(() => '')) ?? '').includes('Tournament'));
if (shots) await B.page.screenshot({path: `${shots}/e5-board.png`});
// larp is up 500 in the tournament (posted with larp's own key, like the app does)
const st = await (await fetch(`${DB}/.json`, {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({'stamp/larp': {k: 'b'.repeat(48), t: {'.sv': 'timestamp'}}, 'board/larp': {...boardB, tp: 500, updated: {'.sv': 'timestamp'}}})})).status;
check('larp posts tournament profit', st === 200, String(st));
// Pay out now
const b0 = await bal(B.page);
await A.page.click('.adm-sec:has-text("Tournament") .adm-act:has-text("End")');
await A.page.waitForTimeout(1500);
const t2 = await get('events/tourney');
check('Paid and the next one started (repeats); only players in profit place', t2?.status === 'live' && t2.id !== t1.id && Array.isArray(t2.last) && t2.last.length === 1 && t2.last[0].name === 'larp', JSON.stringify(t2?.last));
await poke(B.page);
await B.page.waitForFunction(b => (JSON.parse(localStorage.getItem('kmr.wallet.v2') ?? '{}').balance ?? 0) > b, b0, {timeout: 12000}).catch(() => {});
const won = Math.round((await bal(B.page)) - b0);
check('larp received the 1st place prize', won === 50000, String(won));

// Security
const forged = await C.page.evaluate(async db => {
  const r = await fetch(`${db}/.json`, {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({'stamp/sneaky': {k: 'c'.repeat(48), t: {'.sv': 'timestamp'}}, 'events/announce': {msg: 'hacked', t: {'.sv': 'timestamp'}, by: 'sneaky'}})});
  return r.status;
}, DB);
check('Non-admin cannot post events', forged === 401, String(forged));
// End happy hour
await A.page.click('.adm-sec:has-text("Happy hour") .adm-act:has-text("End")');
await A.page.waitForTimeout(700);
check('Happy hour ended', (await get('events/happy')) === null);
check('No console errors', [...A.errors, ...B.errors, ...C.errors].length === 0, [...A.errors, ...B.errors, ...C.errors].join(' | '));
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
await browser.close();
