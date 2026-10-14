// Casino-wide events set by the admin and seen by every player:
//   happy    happy hour: everyone gets a luck level for a while
//   announce a message that pops up on everyone's glasses
//   tourney  a tournament ranked by profit made since it started, with prizes
// They live under events/ in the database (only the "kmr" device can write them) and every
// app checks them every few seconds.
import {useSyncExternalStore} from 'react';
import {leaderboardEnabled, request} from './db';
import {loadJSON, money, saveJSON} from './util';
import {wallet} from './wallet';

export interface HappyHour {
  level: number;
  mins: number;
  start: number;
  by: string;
}
export interface Announcement {
  msg: string;
  t: number;
  by: string;
}
export interface Winner {
  name: string;
  tp: number;
  prize: number;
}
export interface Tourney {
  id: string;
  start: number;
  days: number;
  prizes: number[]; // 1st, 2nd, 3rd
  status: 'live' | 'paid';
  repeat: boolean;
  last?: Winner[]; // winners of the previous tournament
}
export interface EventsState {
  happy: HappyHour | null;
  announce: Announcement | null;
  tourney: Tourney | null;
}

const KEY = 'kmr.events.v1';
const SEEN = 'kmr.events.seen';
const MINE = 'kmr.tourney.me';

let state: EventsState = loadJSON<EventsState>(KEY, {happy: null, announce: null, tourney: null});
const listeners = new Set<() => void>();
function set(next: EventsState) {
  state = next;
  saveJSON(KEY, state);
  listeners.forEach(l => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export const events = {get: () => state, subscribe};
export function useEvents(): EventsState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

// ---- Happy hour --------------------------------------------------------------
export const happyEnds = (h = state.happy) => (h ? h.start + h.mins * 60_000 : 0);
/** The luck level everyone has right now from a happy hour (0 when none is running). */
export function happyLevel(): number {
  const h = state.happy;
  return h && Date.now() < happyEnds(h) ? h.level : 0;
}

// ---- Tournament --------------------------------------------------------------
export const tourneyEnds = (t = state.tourney) => (t ? t.start + t.days * 86_400_000 : 0);
export const tourneyLive = (t = state.tourney) => !!t && t.status === 'live' && Date.now() < tourneyEnds(t);

interface Mine {
  id: string;
  base: number; // lifetime profit when this player joined the tournament
  tp: number; // profit made in the tournament (frozen once it ends)
}

function mine(): Mine | null {
  const t = state.tourney;
  if (!t || t.status !== 'live') return null;
  let m = loadJSON<Mine | null>(MINE, null);
  if (!m || m.id !== t.id) {
    m = {id: t.id, base: wallet.get().profit, tp: 0};
    saveJSON(MINE, m);
  }
  return m;
}

// Count every bet settled while the tournament runs.
wallet.subscribe(() => {
  const t = state.tourney;
  if (!tourneyLive(t)) return;
  const m = mine();
  if (!m) return;
  const tp = money(wallet.get().profit - m.base);
  if (tp !== m.tp) saveJSON(MINE, {...m, tp});
});

/** This player's tournament standing, posted with their leaderboard stats. */
export function myTourney(): {tid: string; tp: number} | Record<string, never> {
  const m = mine();
  return m ? {tid: m.id, tp: m.tp} : {};
}

// ---- Polling -----------------------------------------------------------------
export type Banner = {kind: 'announce' | 'happy' | 'tourney'; title: string; msg: string};
const bannerListeners = new Set<(b: Banner) => void>();
export function onBanner(fn: (b: Banner) => void) {
  bannerListeners.add(fn);
  return () => {
    bannerListeners.delete(fn);
  };
}
const emit = (b: Banner) => bannerListeners.forEach(fn => fn(b));

const afterPoll = new Set<() => void>();
/** Run something after each successful check (the admin device uses it to pay out tournaments). */
export function onEventsLoaded(fn: () => void) {
  afterPoll.add(fn);
  return () => {
    afterPoll.delete(fn);
  };
}

const fmtLuck = (l: number) => ['Cursed', 'Unlucky', 'Normal', 'Lucky', 'Very lucky', 'Godlike'][l + 2] ?? 'Lucky';
const fmtK = (n: number) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}K` : String(n));

export async function pollEvents(): Promise<void> {
  if (!leaderboardEnabled()) return;
  try {
    const r = await request('events.json');
    if (!r.ok) return;
    const data = ((await r.json()) ?? {}) as Partial<EventsState>;
    const next: EventsState = {happy: data.happy ?? null, announce: data.announce ?? null, tourney: data.tourney ?? null};
    if (next.tourney && !Array.isArray(next.tourney.prizes)) next.tourney.prizes = Object.values(next.tourney.prizes ?? {}) as number[];
    if (next.tourney?.last && !Array.isArray(next.tourney.last)) next.tourney.last = Object.values(next.tourney.last) as Winner[];
    set(next);
    // Pop-ups for anything new since this device last looked.
    const seen = loadJSON<{a: number; h: number; t: string}>(SEEN, {a: 0, h: 0, t: ''});
    const now = Date.now();
    if (next.announce && next.announce.t > seen.a) {
      if (now - next.announce.t < 6 * 3_600_000) emit({kind: 'announce', title: `📣 ${next.announce.by}`, msg: next.announce.msg});
      seen.a = next.announce.t;
    }
    if (next.happy && next.happy.start > seen.h) {
      if (now < happyEnds(next.happy)) emit({kind: 'happy', title: '🍀 Happy hour!', msg: `Everyone is ${fmtLuck(next.happy.level)} for ${next.happy.mins} minutes. Go play!`});
      seen.h = next.happy.start;
    }
    if (next.tourney && next.tourney.id !== seen.t) {
      if (tourneyLive(next.tourney))
        emit({kind: 'tourney', title: '🏆 Tournament live', msg: `Most profit in ${next.tourney.days} day${next.tourney.days > 1 ? 's' : ''} wins ${fmtK(next.tourney.prizes[0] ?? 0)}. Check the leaderboard.`});
      seen.t = next.tourney.id;
    }
    saveJSON(SEEN, seen);
    afterPoll.forEach(fn => fn());
  } catch {
    /* offline: try again on the next check */
  }
}
