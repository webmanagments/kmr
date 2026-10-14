// Admin commands. The player named "kmr" can change any player's balance and luck (their own
// included). A command for someone else is written to grants/<name> in the database, signed with
// kmr's private device key (only the glasses that own "kmr" can write there); each player's app
// picks up its commands within seconds, applies them and clears them.
import {profile} from './profile';
import {fetchBoard, request, TIMESTAMP, leaderboardEnabled} from './leaderboard';
import {events, onEventsLoaded, pollEvents, tourneyEnds, type Tourney, type Winner} from './events';
import {luck, luckInfo} from './luck';
import {loadJSON, saveJSON, fmtCoins} from './util';
import {toast, wallet} from './wallet';
import {sfx} from './sfx';

export const ADMIN = 'kmr';

export const isAdmin = (p = profile.get()) => !!p.name && p.name.toLowerCase() === ADMIN && p.claimed;

export type Command =
  | {type: 'add' | 'remove' | 'set'; amount: number}
  | {type: 'luck'; level: number; mins: number}
  | {type: 'reset'}
  | {type: 'bonus'}
  | {type: 'prize'; amount: number; place: number};

interface Grant extends Record<string, unknown> {
  type: Command['type'];
  amount?: number;
  level?: number;
  mins?: number;
  place?: number;
  by?: string;
  t: number;
}

export function describe(c: Command): string {
  switch (c.type) {
    case 'add':
      return `+${fmtCoins(c.amount)} coins`;
    case 'remove':
      return `−${fmtCoins(c.amount)} coins`;
    case 'set':
      return `balance set to ${fmtCoins(c.amount)}`;
    case 'luck':
      return c.level === 0 ? 'luck cleared' : `${luckInfo(c.level).name} for ${fmtMins(c.mins)}`;
    case 'reset':
      return 'a balance reset';
    case 'bonus':
      return 'a daily bonus';
    case 'prize':
      return `${ordinal(c.place)} place prize, ${fmtCoins(c.amount)}`;
  }
}

export const ordinal = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

export const fmtMins = (m: number) => (m >= 1440 ? `${Math.round(m / 1440)} day${m >= 2880 ? 's' : ''}` : m >= 60 ? `${Math.round(m / 60)}h` : `${m} min`);

/** Apply a command to this device. Returns the message shown to the player. */
export function apply(c: Command, by: string): string {
  const from = by.toLowerCase() === (profile.get().name ?? '').toLowerCase() ? '' : `${by}: `;
  switch (c.type) {
    case 'add':
      wallet.adminSet(wallet.get().balance + c.amount);
      sfx('cash');
      return `👑 ${from}+${fmtCoins(c.amount)} coins`;
    case 'remove':
      wallet.adminSet(wallet.get().balance - c.amount);
      return `👑 ${from}−${fmtCoins(c.amount)} coins`;
    case 'set':
      wallet.adminSet(c.amount);
      return `👑 ${from}balance set to ${fmtCoins(c.amount)}`;
    case 'luck':
      if (c.level === 0) {
        luck.clear();
        return `👑 ${from}luck back to normal`;
      }
      luck.set(c.level, c.mins, by);
      sfx(c.level > 0 ? 'bigwin' : 'lose');
      return `${c.level > 0 ? '🍀' : '💀'} ${from}${luckInfo(c.level).name} for ${fmtMins(c.mins)}`;
    case 'reset':
      profile.adminResetReady();
      return `👑 ${from}your balance reset is ready again`;
    case 'bonus':
      wallet.adminBonusReady();
      return `👑 ${from}your daily bonus is ready again`;
    case 'prize':
      wallet.adminSet(wallet.get().balance + c.amount);
      sfx('bigwin');
      return `🏆 You placed ${ordinal(c.place)} in the tournament! +${fmtCoins(c.amount)}`;
  }
}

export type SendResult = 'ok' | 'denied' | 'offline' | 'unknown';

/** Send a command to a player (applied right away when it's yourself). */
export async function send(target: string, c: Command): Promise<SendResult> {
  const p = profile.get();
  if (!isAdmin(p)) return 'denied';
  const key = target.toLowerCase();
  if (key === p.name!.toLowerCase()) {
    toast(apply(c, p.name!), 'win');
    return 'ok';
  }
  if (!leaderboardEnabled()) return 'offline';
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const grant: Record<string, unknown> = {...c, by: p.name, t: TIMESTAMP};
  try {
    const r = await request('.json', {
      method: 'PATCH',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        [`stamp/${ADMIN}`]: {k: p.secret, t: TIMESTAMP},
        [`grants/${key}/${id}`]: grant,
      }),
    });
    if (r.ok) return 'ok';
    return r.status === 401 || r.status === 403 ? 'denied' : 'offline';
  } catch {
    return 'offline';
  }
}

/** Commands waiting for a player who hasn't opened the app since they were sent. */
export async function pending(target: string): Promise<Grant[] | null> {
  if (!leaderboardEnabled()) return null;
  try {
    const r = await request(`grants/${target.toLowerCase()}.json`);
    if (!r.ok) return null;
    const data = (await r.json()) as Record<string, Grant> | null;
    return Object.values(data ?? {}).sort((a, b) => a.t - b.t);
  } catch {
    return null;
  }
}

// ---- Receiving -----------------------------------------------------------------
const APPLIED = 'kmr.grants.applied';
let polling = false;

async function poll() {
  const p = profile.get();
  if (polling || !p.name || !p.claimed || !leaderboardEnabled() || document.hidden) return;
  polling = true;
  try {
    const key = p.name.toLowerCase();
    const r = await request(`grants/${key}.json`);
    if (!r.ok) return;
    const data = (await r.json()) as Record<string, Grant> | null;
    if (!data) return;
    const done = new Set(loadJSON<string[]>(APPLIED, []));
    const ids = Object.keys(data).sort((a, b) => data[a].t - data[b].t);
    for (const id of ids) {
      if (done.has(id)) continue;
      const g = data[id];
      const c = {type: g.type, amount: Number(g.amount ?? 0), level: Number(g.level ?? 0), mins: Number(g.mins ?? 0), place: Number(g.place ?? 1)} as Command;
      toast(apply(c, String(g.by ?? ADMIN)), c.type === 'remove' || (c.type === 'luck' && c.level < 0) ? 'error' : 'win');
      done.add(id);
    }
    saveJSON(APPLIED, [...done].slice(-200));
    // Clear them from the database (signed with this device's key).
    const body: Record<string, unknown> = {[`stamp/${key}`]: {k: p.secret, t: TIMESTAMP}};
    for (const id of ids) body[`grants/${key}/${id}`] = null;
    await request('.json', {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
  } catch {
    /* offline: try again later */
  } finally {
    polling = false;
  }
}

// ---- Casino-wide events (admin only) --------------------------------------------
async function writeEvent(name: 'happy' | 'announce' | 'tourney', value: Record<string, unknown> | null): Promise<SendResult> {
  const p = profile.get();
  if (!isAdmin(p)) return 'denied';
  if (!leaderboardEnabled()) return 'offline';
  try {
    const r = await request('.json', {
      method: 'PATCH',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({[`stamp/${ADMIN}`]: {k: p.secret, t: TIMESTAMP}, [`events/${name}`]: value}),
    });
    if (r.ok) {
      void pollEvents();
      return 'ok';
    }
    return r.status === 401 || r.status === 403 ? 'denied' : 'offline';
  } catch {
    return 'offline';
  }
}

export const startHappyHour = (level: number, mins: number) => writeEvent('happy', {level, mins, start: TIMESTAMP, by: profile.get().name});
export const endHappyHour = () => writeEvent('happy', null);
export const announce = (msg: string) => writeEvent('announce', {msg: msg.slice(0, 120), t: TIMESTAMP, by: profile.get().name});

const newTourney = (days: number, prizes: number[], repeat: boolean, last?: Winner[]) => ({
  id: Date.now().toString(36),
  start: TIMESTAMP,
  days,
  prizes,
  status: 'live',
  repeat,
  ...(last && last.length ? {last} : {}),
});
export const startTourney = (days: number, prizes: number[], repeat: boolean) => writeEvent('tourney', newTourney(days, prizes, repeat, events.get().tourney?.last));

let paying = false;
/** Rank the tournament, send the prizes, then close it (or start the next one if it repeats). */
export async function payTourney(): Promise<SendResult | 'none'> {
  const t = events.get().tourney;
  if (!t || t.status !== 'live' || paying || !isAdmin()) return 'none';
  paying = true;
  try {
    const board = await fetchBoard();
    if (!board) return 'offline';
    const ranked = board
      .filter(e => e.tid === t.id && typeof e.tp === 'number' && e.tp > 0) // you have to be up to place
      .sort((a, b) => (b.tp ?? 0) - (a.tp ?? 0))
      .slice(0, t.prizes.length);
    const winners: Winner[] = [];
    for (let i = 0; i < ranked.length; i++) {
      const prize = t.prizes[i] ?? 0;
      if (prize <= 0) continue;
      const res = await send(ranked[i].name, {type: 'prize', amount: prize, place: i + 1});
      if (res !== 'ok') return res;
      winners.push({name: ranked[i].name, tp: ranked[i].tp ?? 0, prize});
    }
    const closed = {...t, status: 'paid', last: winners} as Tourney;
    return writeEvent('tourney', t.repeat ? newTourney(t.days, t.prizes, true, winners) : (closed as unknown as Record<string, unknown>));
  } finally {
    paying = false;
  }
}

/** Every device checks for commands and events; the admin's also pays out a tournament that has ended. */
export function startGrants() {
  if (!leaderboardEnabled()) return;
  const tick = () => {
    void poll();
    void pollEvents();
  };
  setTimeout(tick, 3500);
  setInterval(tick, 15_000);
  document.addEventListener('visibilitychange', () => !document.hidden && tick());
  onEventsLoaded(() => {
    const t = events.get().tourney;
    if (isAdmin() && t && t.status === 'live' && Date.now() >= tourneyEnds(t)) void payTourney();
  });
}
