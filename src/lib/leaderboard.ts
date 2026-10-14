// Global leaderboard over the Firebase Realtime Database REST API (no SDK needed).
//
// Data layout (see firebase-rules.json):
//   owners/<name>  private key of the device that owns the name (write-once, unreadable)
//   stamp/<name>   {k: key, t: server time}, rewritten with every update as proof of ownership
//   board/<name>   public stats shown on the leaderboard
import {LEADERBOARD_URL} from '../config';
import {profile} from './profile';
import {wallet} from './wallet';

export interface BoardBet {
  g: string; // game id
  b: number; // bet
  m: number; // multiplier
  p: number; // payout
  t: number; // time
}

export interface BoardEntry {
  name: string;
  profit: number;
  balance: number;
  wagered: number;
  bets: number;
  wins: number;
  bestWin: number;
  bestMult: number;
  resets: number;
  joined: number;
  updated: number;
  recent?: BoardBet[];
}

function dbUrl(): string {
  let override = '';
  try {
    override = localStorage.getItem('kmr.dbOverride') ?? '';
  } catch {
    /* ignore */
  }
  return (override || LEADERBOARD_URL).replace(/\/+$/, '');
}

export const leaderboardEnabled = () => dbUrl() !== '';

export const TIMESTAMP = {'.sv': 'timestamp'};

function entry(): Omit<BoardEntry, 'updated'> & {updated: typeof TIMESTAMP} {
  const w = wallet.get();
  const p = profile.get();
  return {
    name: p.name ?? '',
    profit: w.profit,
    balance: w.balance,
    wagered: w.wagered,
    bets: w.bets,
    wins: w.wins,
    bestWin: w.bestWin,
    bestMult: Math.round(w.bestMult * 100) / 100,
    resets: p.resets,
    joined: p.joined || Date.now(),
    updated: TIMESTAMP,
    recent: w.recent.slice(0, 10).map(r => ({g: r.game.slice(0, 16), b: r.bet, m: Math.round(r.mult * 100) / 100, p: r.payout, t: r.at})),
  };
}

export async function request(path: string, init?: RequestInit, timeout = 8000): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    return await fetch(`${dbUrl()}/${path}`, {...init, signal: ctl.signal});
  } finally {
    clearTimeout(timer);
  }
}

export type NameStatus = 'free' | 'taken' | 'offline';

/** Is this name free on the leaderboard? */
export async function checkName(name: string): Promise<NameStatus> {
  if (!leaderboardEnabled()) return 'free';
  try {
    const r = await request(`board/${name.toLowerCase()}/name.json`);
    if (!r.ok) return 'offline';
    return (await r.json()) === null ? 'free' : 'taken';
  } catch {
    return 'offline';
  }
}

export type ClaimResult = 'ok' | 'taken' | 'offline';

/** Claim a name for this device (atomic: fails if anyone already owns it). */
export async function claimName(name: string): Promise<ClaimResult> {
  if (!leaderboardEnabled()) return 'offline';
  const key = name.toLowerCase();
  const secret = profile.get().secret;
  // Already on the board? Then it's either ours (a claim whose reply got lost) or taken.
  const status = await checkName(name);
  if (status === 'offline') return 'offline';
  if (status === 'taken') return (await pushNow(false, name)) ? 'ok' : 'taken';
  try {
    const r = await request('.json', {
      method: 'PATCH',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        [`owners/${key}`]: secret,
        [`stamp/${key}`]: {k: secret, t: TIMESTAMP},
        [`board/${key}`]: {...entry(), name},
      }),
    });
    if (r.ok) return 'ok';
    // Someone claimed it a moment before us.
    if (r.status === 401 || r.status === 403) return 'taken';
    return 'offline';
  } catch {
    return 'offline';
  }
}

/** Send this player's latest stats. Returns true if the board accepted them. */
async function pushNow(keepalive = false, asName?: string): Promise<boolean> {
  const p = profile.get();
  const name = asName ?? p.name;
  if (!name || !leaderboardEnabled()) return false;
  const key = name.toLowerCase();
  try {
    const r = await request('.json', {
      method: 'PATCH',
      headers: {'Content-Type': 'application/json'},
      keepalive,
      body: JSON.stringify({
        [`stamp/${key}`]: {k: p.secret, t: TIMESTAMP},
        [`board/${key}`]: {...entry(), name},
      }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export async function fetchBoard(): Promise<BoardEntry[] | null> {
  if (!leaderboardEnabled()) return null;
  try {
    const r = await request('board.json', undefined, 10000);
    if (!r.ok) return null;
    const data = (await r.json()) as Record<string, BoardEntry> | null;
    return Object.values(data ?? {}).filter(e => e && typeof e.name === 'string' && typeof e.profit === 'number');
  } catch {
    return null;
  }
}

// ---- Background sync ----------------------------------------------------------
// Stats go up a few seconds after they change (batched), and once more when the app closes.
let timer: ReturnType<typeof setTimeout> | null = null;
let dirty = false;
let lastPush = 0;
let claiming = false;
const MIN_GAP = 6000;

async function sync() {
  timer = null;
  const p = profile.get();
  if (!p.name || !leaderboardEnabled()) return;
  if (!p.claimed) {
    // A name chosen while offline: claim it now (or ask for a new one if it's gone).
    if (claiming) return;
    claiming = true;
    const res = await claimName(p.name);
    claiming = false;
    if (res === 'ok') profile.markClaimed();
    else if (res === 'taken') profile.nameTaken();
    else schedule(30000);
    return;
  }
  dirty = false;
  lastPush = Date.now();
  if (!(await pushNow())) {
    dirty = true;
    schedule(30000);
  }
}

function schedule(delay?: number) {
  if (timer) return;
  const wait = delay ?? Math.max(1500, MIN_GAP - (Date.now() - lastPush));
  timer = setTimeout(() => void sync(), wait);
}

export function startSync() {
  if (!leaderboardEnabled()) return;
  wallet.subscribe(() => {
    dirty = true;
    schedule();
  });
  profile.subscribe(() => {
    const p = profile.get();
    if (p.name) schedule();
  });
  const flush = () => {
    if (!dirty || !profile.get().claimed) return;
    dirty = false;
    void pushNow(true);
  };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => document.hidden && flush());
  // Make sure an unclaimed name gets claimed soon after launch.
  if (profile.get().name && !profile.get().claimed) schedule(2500);
}
