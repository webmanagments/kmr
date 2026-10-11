// Dev-only sanity check of payout tables. Run: node src/scripts/rtp-check.mjs
import {readFileSync} from 'node:fs';

const src = readFileSync(new URL('../src/games/plinkoTables.ts', import.meta.url), 'utf8');
const table = eval('(' + src.slice(src.indexOf('{', src.indexOf('PLINKO')), src.lastIndexOf('}') + 1) + ')');

function choose(n, k) {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

for (const [rows, risks] of Object.entries(table)) {
  const n = Number(rows);
  const out = [];
  for (const [risk, mults] of Object.entries(risks)) {
    if (mults.length !== n + 1) throw new Error(`plinko ${n} ${risk} has ${mults.length} slots`);
    let rtp = 0;
    for (let k = 0; k <= n; k++) rtp += (choose(n, k) / 2 ** n) * mults[k];
    out.push(`${risk} ${(rtp * 100).toFixed(2)}%`);
  }
  console.log(`plinko ${rows}: ${out.join('  ')}`);
}
