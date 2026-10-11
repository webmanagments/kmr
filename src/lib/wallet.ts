// Play-money wallet. A tiny external store so games can settle bets even after
// their screen unmounts (for example when the wearer presses Back mid-animation).
import {useSyncExternalStore} from 'react';
import {loadJSON, money, saveJSON} from './util';

export const START_BALANCE = 10_000;
export const DAILY_BONUS = 2_500;
const DAY_MS = 24 * 60 * 60 * 1000;
const KEY = 'kmr.wallet.v2';

export interface BetRecord {
  id: number;
  game: string;
  bet: number;
  mult: number;
  payout: number;
  at: number;
}

export interface WalletState {
  balance: number;
  betAmount: number;
  wagered: number;
  profit: number;
  bets: number;
  wins: number;
  bestMult: number;
  bestWin: number;
  lastBonus: number;
  recent: BetRecord[];
}

const initial: WalletState = {
  balance: START_BALANCE,
  betAmount: 10,
  wagered: 0,
  profit: 0,
  bets: 0,
  wins: 0,
  bestMult: 0,
  bestWin: 0,
  lastBonus: 0,
  recent: [],
};

let state: WalletState = {...initial, ...loadJSON<Partial<WalletState>>(KEY, {})};
const listeners = new Set<() => void>();
let nextId = Date.now();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function set(next: WalletState) {
  state = next;
  listeners.forEach(l => l());
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveJSON(KEY, state);
  }, 250);
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

type Toaster = (msg: string, tone?: 'info' | 'error' | 'win') => void;
let toaster: Toaster = () => {};
export function setToaster(t: Toaster) {
  toaster = t;
}
export function toast(msg: string, tone: 'info' | 'error' | 'win' = 'info') {
  toaster(msg, tone);
}

export const wallet = {
  get: () => state,

  /** Take a stake. Returns false (and tells the wearer) if the balance is short. */
  debit(amount: number): boolean {
    amount = money(amount);
    if (amount <= 0) return false;
    if (amount > state.balance + 1e-9) {
      toast('Not enough coins — open Wallet to top up', 'error');
      return false;
    }
    set({...state, balance: money(state.balance - amount)});
    return true;
  },

  credit(amount: number) {
    amount = money(amount);
    if (amount <= 0) return;
    set({...state, balance: money(state.balance + amount)});
  },

  /**
   * Record a finished bet. `payout` is the total returned (0 on a loss); credit it
   * separately or pass credit=true to do both at once.
   */
  settle(game: string, bet: number, payout: number, credit = true) {
    payout = money(payout);
    const mult = bet > 0 ? payout / bet : 0;
    const rec: BetRecord = {id: nextId++, game, bet: money(bet), mult, payout, at: Date.now()};
    const won = payout > bet;
    set({
      ...state,
      balance: credit ? money(state.balance + payout) : state.balance,
      wagered: money(state.wagered + bet),
      profit: money(state.profit + payout - bet),
      bets: state.bets + 1,
      wins: state.wins + (won ? 1 : 0),
      bestMult: Math.max(state.bestMult, mult),
      bestWin: Math.max(state.bestWin, payout - bet),
      recent: [rec, ...state.recent].slice(0, 25),
    });
  },

  setBet(amount: number) {
    set({...state, betAmount: money(Math.max(0.1, Math.min(100_000, amount)))});
  },

  bonusReadyIn(): number {
    return Math.max(0, state.lastBonus + DAY_MS - Date.now());
  },

  claimBonus(): boolean {
    if (wallet.bonusReadyIn() > 0) return false;
    set({...state, balance: money(state.balance + DAILY_BONUS), lastBonus: Date.now()});
    return true;
  },

  reset() {
    set({...initial, betAmount: state.betAmount, lastBonus: state.lastBonus});
  },
};

export function useWallet(): WalletState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}
