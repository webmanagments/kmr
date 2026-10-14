// Luck: a timed effect the admin can put on any player (or on themselves).
//
// Games roll their outcomes through `fate()`. With good luck, some rounds are rolled again (twice
// more when Godlike) and the result that pays the player most is kept; with bad luck, the one that
// pays least. Step games (Mines, Towers, Chicken…) use `rescue()` and `jinx()` at the moment a
// tile or step is revealed. With no luck active, every game is exactly as fair as before.
import {useSyncExternalStore} from 'react';
import {loadJSON, rand, saveJSON} from './util';

const KEY = 'kmr.luck.v1';

export interface LuckLevel {
  level: number;
  name: string;
  p: number; // how often a round is re-rolled in the player's favour (or against them)
  short: string;
}

export const LUCK_LEVELS: LuckLevel[] = [
  {level: -2, name: 'Cursed', p: 0.6, short: 'Cursed'},
  {level: -1, name: 'Unlucky', p: 0.3, short: 'Unlucky'},
  {level: 0, name: 'Normal', p: 0, short: 'Normal'},
  {level: 1, name: 'Lucky', p: 0.3, short: 'Lucky'},
  {level: 2, name: 'Very lucky', p: 0.6, short: 'Very lucky'},
  {level: 3, name: 'Godlike', p: 0.9, short: 'Godlike'},
];

export const luckInfo = (level: number): LuckLevel => LUCK_LEVELS.find(l => l.level === level) ?? LUCK_LEVELS[2];

export interface LuckState {
  level: number;
  until: number; // epoch ms
  by: string;
}

let state: LuckState = loadJSON<LuckState>(KEY, {level: 0, until: 0, by: ''});
const listeners = new Set<() => void>();
function set(next: LuckState) {
  state = next;
  saveJSON(KEY, state);
  listeners.forEach(l => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

// Re-render the badge when the effect runs out.
let expiry: ReturnType<typeof setTimeout> | null = null;
function scheduleExpiry() {
  if (expiry) clearTimeout(expiry);
  expiry = null;
  const left = state.until - Date.now();
  if (state.level && left > 0) expiry = setTimeout(() => set({...state, level: 0}), Math.min(left + 50, 2 ** 31 - 1));
}
scheduleExpiry();

export const luck = {
  get: () => state,
  subscribe,
  /** The level in force right now (0 once it has run out). */
  level(): number {
    return state.level && Date.now() < state.until ? state.level : 0;
  },
  set(level: number, mins: number, by: string) {
    set(level && mins > 0 ? {level, until: Date.now() + mins * 60_000, by} : {level: 0, until: 0, by});
    scheduleExpiry();
  },
  clear() {
    set({level: 0, until: 0, by: ''});
    scheduleExpiry();
  },
};

export function useLuck(): LuckState & {active: number} {
  const s = useSyncExternalStore(subscribe, () => state, () => state);
  return {...s, active: s.level && Date.now() < s.until ? s.level : 0};
}

/**
 * Roll an outcome with luck applied. `value` scores an outcome for the player (higher = better
 * for them, e.g. the payout multiplier). Without luck this is just `gen()`.
 */
export function fate<T>(gen: () => T, value: (t: T) => number): T {
  const L = luck.level();
  const first = gen();
  if (!L || rand() >= luckInfo(L).p) return first;
  let best = first;
  let bestV = value(first);
  const extra = L >= 3 ? 2 : 1;
  for (let i = 0; i < extra; i++) {
    const next = gen();
    const v = value(next);
    if (L > 0 ? v > bestV : v < bestV) {
      best = next;
      bestV = v;
    }
  }
  return best;
}

/** Good luck: should this losing step be saved? */
export function rescue(): boolean {
  const L = luck.level();
  return L > 0 && rand() < luckInfo(L).p * 0.8;
}

/** Bad luck: should this winning step be lost? */
export function jinx(): boolean {
  const L = luck.level();
  return L < 0 && rand() < luckInfo(L).p * 0.5;
}
