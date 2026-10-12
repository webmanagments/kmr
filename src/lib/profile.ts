// This pair of glasses' player profile: name, leaderboard key, favourites, settings.
// Each device keeps its own profile in local storage.
import {useSyncExternalStore} from 'react';
import {loadJSON, saveJSON} from './util';

const KEY = 'kmr.profile.v1';
export const RESET_COOLDOWN = 24 * 60 * 60 * 1000;
export const NAME_RE = /^[A-Za-z0-9_]{3,12}$/;

export interface Profile {
  /** Display name, or null until the player picks one. */
  name: string | null;
  /** Private key proving this device owns its name on the leaderboard. Never shown. */
  secret: string;
  /** The leaderboard has confirmed the name belongs to this device. */
  claimed: boolean;
  /** Set when a name we tried to claim turned out to be taken. */
  lostName: string | null;
  joined: number;
  resets: number;
  lastReset: number;
  favorites: string[];
  recentGames: string[];
  sound: boolean;
}

function newSecret(): string {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
}

const initial: Profile = {
  name: null,
  secret: '',
  claimed: false,
  lostName: null,
  joined: 0,
  resets: 0,
  lastReset: 0,
  favorites: [],
  recentGames: [],
  sound: true,
};

let state: Profile = {...initial, ...loadJSON<Partial<Profile>>(KEY, {})};
if (!state.secret) state = {...state, secret: newSecret()};
saveJSON(KEY, state);

const listeners = new Set<() => void>();
function set(next: Profile) {
  state = next;
  saveJSON(KEY, state);
  listeners.forEach(l => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export const profile = {
  get: () => state,
  subscribe,

  setName(name: string, claimed: boolean) {
    set({...state, name, claimed, lostName: null, joined: state.joined || Date.now()});
  },
  markClaimed() {
    if (!state.claimed) set({...state, claimed: true});
  },
  /** Someone else owns this name on the leaderboard: ask the player for a new one. */
  nameTaken() {
    set({...state, lostName: state.name, name: null, claimed: false});
  },

  resetReadyIn(): number {
    return Math.max(0, state.lastReset + RESET_COOLDOWN - Date.now());
  },
  noteReset() {
    set({...state, resets: state.resets + 1, lastReset: Date.now()});
  },

  isFavorite: (id: string) => state.favorites.includes(id),
  toggleFavorite(id: string): boolean {
    const on = !state.favorites.includes(id);
    set({...state, favorites: on ? [...state.favorites, id] : state.favorites.filter(f => f !== id)});
    return on;
  },
  notePlayed(id: string) {
    if (state.recentGames[0] === id) return;
    set({...state, recentGames: [id, ...state.recentGames.filter(g => g !== id)].slice(0, 8)});
  },
  setSound(on: boolean) {
    set({...state, sound: on});
  },
};

export function useProfile(): Profile {
  return useSyncExternalStore(subscribe, () => state, () => state);
}
