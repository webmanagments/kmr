// Shared helpers: secure randomness, money math, formatting.

const buf = new Uint32Array(1);

/** Uniform float in [0, 1) from the platform CSPRNG. */
export function rand(): number {
  crypto.getRandomValues(buf);
  return buf[0] / 4294967296;
}

/** Uniform integer in [0, n). */
export function randInt(n: number): number {
  return Math.floor(rand() * n);
}

export function pick<T>(items: readonly T[]): T {
  return items[randInt(items.length)];
}

/** Fisher–Yates shuffle (returns a new array). */
export function shuffle<T>(items: readonly T[]): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Weighted pick; weights need not sum to 1. Returns the index. */
export function weightedIndex(weights: readonly number[]): number {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rand() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return weights.length - 1;
}

/** Round to cents. */
export function money(x: number): number {
  return Math.round(x * 100) / 100;
}

const coinFmt = new Intl.NumberFormat('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
const compactFmt = new Intl.NumberFormat('en-US', {notation: 'compact', maximumFractionDigits: 1});

export function fmtCoins(x: number): string {
  if (Math.abs(x) >= 1e7) return compactFmt.format(x);
  return coinFmt.format(x);
}

export function fmtMult(x: number): string {
  if (x >= 1e6) return `${compactFmt.format(x)}×`;
  if (x >= 1000) return `${Math.floor(x).toLocaleString('en-US')}×`;
  return `${x.toFixed(2)}×`;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** n choose k as a float. */
export function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

export const HOUSE = 0.99; // 99% return to player on Originals, like Stake.

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function reducedMotion(): boolean {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function saveJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: keep running in memory */
  }
}
