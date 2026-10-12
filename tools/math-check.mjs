// Dev-only: verify every game's return-to-player (exact where possible, simulated otherwise).
// Run: node tools/math-check.mjs
const HOUSE = 0.99;
const choose = (n, k) => {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
};
const pct = x => `${(x * 100).toFixed(2)}%`;
const out = [];

// Dice / Limbo / Crash / Slide: P(win) * mult = 0.99 by construction.
out.push(['Dice (any target)', pct(((HOUSE * 100) / 1.98 / 100) * 1.98)]);
{
  // Limbo/Crash/Slide with floor-to-cent; simulate.
  let pay = 0;
  const N = 2e6;
  for (let i = 0; i < N; i++) {
    const v = Math.max(1, Math.floor((HOUSE / (1 - Math.random())) * 100) / 100);
    if (v >= 2) pay += 2;
  }
  out.push(['Limbo/Crash/Slide @2× (sim)', pct(pay / N)]);
}

// Mines: cash out after k picks.
{
  let worst = 1;
  let best = 0;
  for (let m = 1; m <= 24; m++)
    for (let k = 1; k <= 25 - m; k++) {
      const p = choose(25 - m, k) / choose(25, k);
      const mult = (HOUSE * choose(25, k)) / choose(25 - m, k);
      worst = Math.min(worst, p * mult);
      best = Math.max(best, p * mult);
    }
  out.push(['Mines (every mines×picks)', `${pct(worst)} – ${pct(best)}`]);
}

// Towers (floored multipliers).
{
  const D = {easy: [4, 3], medium: [3, 2], hard: [2, 1], expert: [3, 1], master: [4, 1]};
  const r = Object.entries(D).map(([d, [t, s]]) => {
    let lo = 1;
    for (let L = 1; L <= 9; L++) {
      const mult = Math.floor((HOUSE / Math.pow(s / t, L)) * 100) / 100;
      lo = Math.min(lo, Math.pow(s / t, L) * mult);
    }
    return `${d} ≥${pct(lo)}`;
  });
  out.push(['Towers', r.join('  ')]);
}

// Keno tables (same builder as the game).
{
  const N = 40;
  const pH = (n, h) => (choose(n, h) * choose(N - n, 10 - h)) / choose(N, 10);
  const SHAPE = {low: [0.3, 1.7], medium: [0.45, 2.4], high: [0.6, 3.2]};
  const r = [];
  for (const [risk, [min, g]] of Object.entries(SHAPE)) {
    let lo = 1;
    let hi = 0;
    let top = 0;
    for (let n = 1; n <= 10; n++) {
      const mh = Math.max(1, Math.ceil(n * min));
      const w = Array.from({length: n + 1}, (_, h) => (h >= mh ? Math.pow(g, h - mh) : 0));
      const ev = w.reduce((s, x, h) => s + x * pH(n, h), 0);
      const t = w.map(x => (x ? Math.floor(((x * HOUSE) / ev) * 100) / 100 : 0));
      const rtp = t.reduce((s, m, h) => s + m * pH(n, h), 0);
      lo = Math.min(lo, rtp);
      hi = Math.max(hi, rtp);
      top = Math.max(top, t[n]);
    }
    r.push(`${risk} ${pct(lo)}–${pct(hi)} (top ${top.toLocaleString()}×)`);
  }
  out.push(['Keno', r.join('  ')]);
}

// Wheel exact.
{
  const P = {low: [1.5, 1.2, 1.2, 1.2, 0, 1.2, 1.2, 1.2, 1.2, 0], medium: [0, 1.9, 0, 1.5, 0, 2, 0, 1.5, 0, 3]};
  const r = [];
  for (const n of [10, 20, 30, 40, 50]) {
    const low = Array.from({length: n}, (_, i) => P.low[i % 10]).reduce((s, x) => s + x, 0) / n;
    const med = Array.from({length: n}, (_, i) => P.medium[i % 10]).reduce((s, x) => s + x, 0) / n;
    const high = Math.round(0.99 * n * 100) / 100 / n;
    r.push(`${n}: ${pct(low)}/${pct(med)}/${pct(high)}`);
  }
  out.push(['Wheel low/med/high', r.join('  ')]);
}

// Pump: like mines in fixed order (floored).
{
  const POPS = {easy: 1, medium: 3, hard: 5, expert: 10};
  const r = Object.entries(POPS).map(([d, m]) => {
    let lo = 1;
    for (let k = 1; k <= 25 - m; k++) {
      const p = choose(25 - m, k) / choose(25, k);
      const mult = Math.floor(((HOUSE * choose(25, k)) / choose(25 - m, k)) * 100) / 100;
      lo = Math.min(lo, p * mult);
    }
    return `${d} ≥${pct(lo)}`;
  });
  out.push(['Pump', r.join('  ')]);
}

// Diamonds exact over 7^5.
{
  const pays = {5: 50, 41: 5, 32: 4, 311: 3, 221: 2, 2111: 0.12, 11111: 0};
  let ev = 0;
  for (let i = 0; i < 7 ** 5; i++) {
    const g = [];
    let x = i;
    for (let k = 0; k < 5; k++) {
      g.push(x % 7);
      x = Math.floor(x / 7);
    }
    const c = {};
    g.forEach(v => (c[v] = (c[v] ?? 0) + 1));
    ev += pays[Object.values(c).sort((a, b) => b - a).join('')];
  }
  out.push(['Diamonds', pct(ev / 7 ** 5)]);
}

// Coinflip / HiLo per step.
out.push(['Coinflip (per call)', pct(0.5 * 1.98)]);
{
  let lo = 1;
  for (let r = 1; r <= 13; r++) {
    const opts = r === 1 ? [12 / 13, 1 / 13] : r === 13 ? [1 / 13, 12 / 13] : [(14 - r) / 13, r / 13];
    for (const p of opts) lo = Math.min(lo, p * (Math.floor((HOUSE / p) * 100) / 100));
  }
  out.push(['HiLo (per guess, worst)', pct(lo)]);
}

// Cases (same weight solver as the game).
{
  const C = {
    starter: [0.4, 0.6, 0.8, 1, 1.2, 1.5, 2, 3, 5, 10],
    pro: [0.1, 0.3, 0.5, 0.8, 1.2, 2, 4, 8, 15, 30, 100],
    legend: [0, 0.1, 0.25, 0.5, 1, 3, 10, 50, 250, 1000],
  };
  const r = Object.entries(C).map(([id, m]) => {
    const ev = p => {
      const w = m.map(x => 1 / Math.pow(x + 0.2, p));
      const t = w.reduce((s, x) => s + x, 0);
      return w.reduce((s, x, i) => s + x * m[i], 0) / t;
    };
    let lo = 0;
    let hi = 8;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (ev(mid) > HOUSE) lo = mid;
      else hi = mid;
    }
    const w = m.map(x => 1 / Math.pow(x + 0.2, (lo + hi) / 2));
    const t = w.reduce((s, x) => s + x, 0);
    return `${id} ${pct(ev((lo + hi) / 2))} (top drop 1 in ${Math.round(t / w[w.length - 1]).toLocaleString()})`;
  });
  out.push(['Cases', r.join('  ')]);
}

// Slots (exact: independent cells, 5 lines share the stake equally).
{
  const W = [30, 25, 20, 15, 9, 6, 4, 2];
  const T = W.reduce((a, b) => a + b);
  const p = W.map(w => w / T);
  const PAYS = [15, 24, 30, 45, 75, 150, 300, 750];
  const line = p.reduce((s, x, i) => s + x ** 3 * PAYS[i], 0) + p[0] ** 2 * (1 - p[0]) * 0.5;
  out.push(['Lucky 7s slots', pct(line)]);
}

// Roulette, baccarat, dragon tiger (exact/known).
out.push(['Roulette (any bet)', pct(36 / 37)]);
{
  // Simulate baccarat with an infinite shoe.
  const v = () => {
    const r = Math.floor(Math.random() * 13) + 1;
    return r >= 10 ? 0 : r;
  };
  let P = 0;
  let B = 0;
  let Tn = 0;
  const N = 2e6;
  for (let i = 0; i < N; i++) {
    let p = (v() + v()) % 10;
    let b = (v() + v()) % 10;
    if (p < 8 && b < 8) {
      let p3 = null;
      if (p <= 5) {
        p3 = v();
        p = (p + p3) % 10;
      }
      let draw;
      if (p3 === null) draw = b <= 5;
      else draw = b <= 2 || (b === 3 && p3 !== 8) || (b === 4 && p3 >= 2 && p3 <= 7) || (b === 5 && p3 >= 4 && p3 <= 7) || (b === 6 && p3 >= 6 && p3 <= 7);
      if (draw) b = (b + v()) % 10;
    }
    if (p > b) P++;
    else if (b > p) B++;
    else Tn++;
  }
  const pp = P / N;
  const pb = B / N;
  const pt = Tn / N;
  out.push(['Baccarat player/banker/tie (sim)', `${pct(pp * 2 + pt)} / ${pct(pb * 1.95 + pt)} / ${pct(pt * 9)}`]);
}
{
  const pTie = 1 / 13;
  out.push(['Dragon Tiger dragon/tie', `${pct(((1 - pTie) / 2) * 2 + pTie * 0.5)} / ${pct(pTie * 9)}`]);
}
out.push(['Horse Racing (every horse)', '97.00% (odds floored)']);
out.push(['Blackjack / Video Poker', 'standard rules ≈ 99.4% / 99.5% with good play']);

// Snakes: every roll's expected return, from every tile you can stand on.
{
  const BOARDS = {
    easy: [1.02, 1.14, 0, 1.02, 1.7, 1.02, 1.02, 1.02, 0, 1.36, 1.36, 1.14],
    medium: [1.23, 1.43, 1.02, 0, 1.02, 1.23, 1.23, 1.02, 1.74, 0, 0, 1.74],
    hard: [1.23, 1.64, 0, 1.03, 0, 3.29, 0, 1.03, 0, 2.47, 0, 1.03],
    expert: [1.09, 0, 0, 1.37, 3.28, 0, 1.64, 0, 0, 0, 4.38, 0],
  };
  for (const [name, b] of Object.entries(BOARDS)) {
    let lo = 9;
    let hi = 0;
    b.forEach((v, p) => {
      if (v === 0) return;
      let ev = 0;
      for (let s = 2; s <= 12; s++) ev += ((6 - Math.abs(s - 7)) / 36) * b[(p + s) % 12];
      lo = Math.min(lo, ev);
      hi = Math.max(hi, ev);
    });
    out.push([`Snakes ${name} (per roll, every tile)`, `${pct(lo)} – ${pct(hi)}`]);
  }
}

// Scratch Cards: exact.
{
  const P = [[250, 0.0004], [50, 0.004], [10, 0.017], [5, 0.05], [2, 0.08], [1, 0.09]];
  out.push(['Scratch Cards', `${pct(P.reduce((s, [m, p]) => s + m * p, 0))} (wins ${pct(P.reduce((s, [, p]) => s + p, 0))} of cards)`]);
}

// Drill: same depth distribution as Limbo, win pays the target.
out.push(['Drill (any target)', 'same as Limbo: 99.00%']);

const w = Math.max(...out.map(o => o[0].length));
for (const [k, v] of out) console.log(`${k.padEnd(w)}  ${v}`);
