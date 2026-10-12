// Dev-only: drive the app with D-pad (arrows) + pinch (Enter) + Back (Escape) only.
import {chromium} from 'playwright';

const base = process.argv[2] ?? 'http://127.0.0.1:4173';
const browser = await chromium.launch({headless: true, executablePath: '/opt/google/chrome/chrome'});
const page = await browser.newPage({viewport: {width: 600, height: 600}});
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => m.type() === 'error' && errors.push(m.text()));
const results = [];
const check = (name, ok, extra = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
const focused = () =>
  page.evaluate(() => {
    const a = document.activeElement;
    return a ? a.getAttribute('aria-label') || a.textContent.trim().slice(0, 40) : 'none';
  });
const key = async (k, n = 1, wait = 120) => {
  for (let i = 0; i < n; i++) {
    await page.keyboard.press(k);
    await page.waitForTimeout(wait);
  }
};
const balance = () => page.evaluate(() => document.querySelector('.balance')?.textContent);

await page.goto(base, {waitUntil: 'load'});
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('kmr.dbOverride', 'http://127.0.0.1:9199'); localStorage.setItem('kmr.profile.v1', JSON.stringify({name: 'Tester', claimed: false, secret: 'x'.repeat(48), sound: false})); });
await page.reload({waitUntil: 'load'});
await page.waitForTimeout(500);

check('Initial focus on Claim', (await focused()).includes('Claim'), await focused());
await key('ArrowDown');
check('Down → nearest category tab', (await page.evaluate(() => document.activeElement?.getAttribute('role'))) === 'tab', await focused());
await key('ArrowDown');
check('Down → tile below', (await focused()) === 'Play Chicken', await focused());
await key('ArrowLeft', 3);
check('Left ×3 → Sky Run', (await focused()) === 'Play Sky Run', await focused());
await key('ArrowRight', 3);
check('Right ×3 → Chicken', (await focused()) === 'Play Chicken', await focused());
await key('ArrowDown', 1, 200);
await key('ArrowRight', 1, 400);
check('Right off edge → page 2, first tile', (await focused()) === 'Play Mines', await focused());
await key('ArrowLeft', 1, 400);
check('Left off edge → back to page 1 last tile', (await focused()) === 'Play Plinko', await focused());
await key('ArrowDown', 1, 300);
check('Down from bottom row → Next page button', (await focused()) === 'Next page', await focused());
await key('Enter', 1, 400);
check('Next page button flips to page 2', !!(await page.$('[data-game="wheel"]')));
await key('ArrowUp', 1, 200);
await key('ArrowLeft', 1, 150);
check('Navigate to Wheel', (await focused()) === 'Play Wheel', await focused());

// Open Wheel, spin with pinch, go Back mid-spin: bet must still settle.
const before = await balance();
await key('Enter', 1, 700);
check('Pinch opens game', !!(await page.$('.game')));
check('Game focus lands on Spin', (await focused()).includes('Spin'), await focused());
await key('Enter', 1, 300);
await key('Escape', 1, 600);
check('Back returns to lobby', !!(await page.$('.lobby')));
check('Focus restored to Wheel tile', (await focused()) === 'Play Wheel', await focused());
const recent = await page.evaluate(() => JSON.parse(localStorage.getItem('kmr.wallet.v2') || '{}').recent?.length ?? 0);
check('Mid-spin Back still settled the bet', recent === 1, `recent=${recent}, balance ${before} → ${await balance()}`);

// Tabs: jump to Table Games, open Blackjack, deal + stand by D-pad only.
await key('ArrowUp', 2, 200); // Wheel tile → HiLo → tab above it
check('Up from tile → tab', (await page.evaluate(() => document.activeElement?.getAttribute('role'))) === 'tab', await focused());
await key('ArrowLeft', 3, 150); // to the first tab (My Games now exists)
await key('ArrowRight', 2, 150); // Table Games
check('Right along tabs → Table Games', (await focused()).includes('Table'), await focused());
await key('Enter', 1, 400);
check('Table Games tab selected', (await page.$eval('.tab.is-on', e => e.textContent)).includes('Table'));
await key('ArrowDown', 1, 200);
await key('ArrowLeft', 2, 120);
check('Down + Left → Blackjack tile', (await focused()) === 'Play Blackjack', await focused());
await key('Enter', 1, 800);
check('Blackjack focus on Deal', (await focused()).includes('Deal'), await focused());
await key('Enter', 1, 500);
const bjPhase = await page.evaluate(() => JSON.parse(localStorage.getItem('kmr.round.blackjack') ?? '{}').phase);
if (!bjPhase) {
  console.log(results.join('\n'));
  console.log('Blackjack did not deal; focus is on:', await focused());
  await page.screenshot({path: '/tmp/claude-0/-home-claude/4da8730e-463a-5afe-a0d4-f693daad4e35/scratchpad/flow-bj.png'});
  process.exit(1);
}
if (bjPhase === 'player') {
  check('After Deal focus on Hit', (await focused()) === 'Hit', await focused());
  await key('ArrowRight');
  check('Right → Stand', (await focused()) === 'Stand', await focused());
  await key('Enter', 1, 2600);
} else await page.waitForTimeout(2600); // natural blackjack: dealer reveal plays out
const bj = await page.evaluate(() => JSON.parse(localStorage.getItem('kmr.round.blackjack')));
check('Blackjack hand settled', bj.phase === 'done', `result ${bj.hands.map(h => h.result).join(',')}`);
check('Focus returns to Deal Again', (await focused()).includes('Deal'), await focused());
await key('Escape', 1, 500);

// Mines: bet, reveal centre tile, then cash out via D-pad if it was a gem.
await key('ArrowUp', 1, 150); // Blackjack tile → tab above (My Games)
await key('ArrowLeft', 3, 150);
await key('ArrowRight', 1, 150); // Originals tab
await key('Enter', 1, 300);
await key('ArrowDown', 1, 200); // tile under Originals: Snakes
await key('ArrowDown', 1, 150); // Penalty
await key('ArrowRight', 3, 150); // Plinko, then off the edge onto page 2: Mines
await page.waitForTimeout(300);
check('Navigate to Mines tile', (await focused()) === 'Play Mines', await focused());
await key('Enter', 1, 800);
await key('Enter', 1, 400); // Bet
check('Bet moves focus into the grid', (await focused()).startsWith('Tile'), await focused());
await key('Enter', 1, 400); // reveal centre
const m1 = await page.evaluate(() => JSON.parse(localStorage.getItem('kmr.round.mines')));
if (m1.phase === 'playing') {
  await key('ArrowLeft', 3, 150);
  await key('ArrowDown', 6, 120);
  check('D-pad reaches Cashout', (await focused()).includes('Cashout'), await focused());
  await key('Enter', 1, 400);
  const m2 = await page.evaluate(() => JSON.parse(localStorage.getItem('kmr.round.mines')));
  check('Cashout settles', m2.phase === 'over' && m2.cashed, '');
} else check('Hit a mine first pick (valid outcome)', m1.phase === 'over');

// Wallet modal: open, Back closes, focus returns to Wallet button.
await page.focus('.wallet-btn');
await key('Enter', 1, 400);
check('Wallet opens with focus inside', await page.evaluate(() => !!document.activeElement?.closest('[data-focus-scope="modal"]')));
await key('ArrowDown', 6, 100);
check('Focus trapped in wallet', await page.evaluate(() => !!document.activeElement?.closest('[data-focus-scope="modal"]')));
await key('Escape', 1, 400);
check('Back closes wallet', !(await page.$('.modal')));
check('Focus back on Wallet button', (await focused()) === 'Open wallet', await focused());

// History never grows past the host's 5-entry cap.
check('History length within cap', (await page.evaluate(() => history.length)) <= 5, `length ${await page.evaluate(() => history.length)}`);
check('No console errors', errors.length === 0, errors.join(' | '));

console.log(results.join('\n'));
await browser.close();
