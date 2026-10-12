import {lazy, type ComponentType, type LazyExoticComponent} from 'react';

export type Category = 'originals' | 'table' | 'more';

export interface GameDef {
  id: string;
  name: string;
  cat: Category;
  from: string;
  to: string;
  tag?: 'HOT' | 'NEW';
  load: () => Promise<{default: ComponentType}>;
}

export const GAMES: GameDef[] = [
  {id: 'skyrun', name: 'Sky Run', cat: 'originals', from: '#38bdf8', to: '#1e3a8a', tag: 'NEW', load: () => import('./SkyRun')},
  {id: 'chicken', name: 'Chicken', cat: 'originals', from: '#facc15', to: '#c2410c', tag: 'NEW', load: () => import('./Chicken')},
  {id: 'tarot', name: 'Tarot', cat: 'originals', from: '#a855f7', to: '#3b0764', tag: 'NEW', load: () => import('./Tarot')},
  {id: 'penalty', name: 'Penalty Shootout', cat: 'originals', from: '#4ade80', to: '#14532d', tag: 'NEW', load: () => import('./Penalty')},
  {id: 'crash', name: 'Crash', cat: 'originals', from: '#ff7a18', to: '#d4145a', tag: 'HOT', load: () => import('./Crash')},
  {id: 'plinko', name: 'Plinko', cat: 'originals', from: '#ff4fd8', to: '#7b2ff7', tag: 'HOT', load: () => import('./Plinko')},
  {id: 'mines', name: 'Mines', cat: 'originals', from: '#1fa2ff', to: '#1a4fc4', tag: 'HOT', load: () => import('./Mines')},
  {id: 'dice', name: 'Dice', cat: 'originals', from: '#00d2a8', to: '#0b6f8f', load: () => import('./Dice')},
  {id: 'limbo', name: 'Limbo', cat: 'originals', from: '#9b5cff', to: '#4b1fa8', load: () => import('./Limbo')},
  {id: 'towers', name: 'Towers', cat: 'originals', from: '#ff9f1c', to: '#c2410c', load: () => import('./Towers')},
  {id: 'hilo', name: 'HiLo', cat: 'originals', from: '#ff5f6d', to: '#a4133c', load: () => import('./HiLo')},
  {id: 'keno', name: 'Keno', cat: 'originals', from: '#22c55e', to: '#0f766e', load: () => import('./Keno')},
  {id: 'wheel', name: 'Wheel', cat: 'originals', from: '#ffc23f', to: '#e8590c', load: () => import('./Wheel')},
  {id: 'pump', name: 'Pump', cat: 'originals', from: '#ff6fb5', to: '#a21caf', load: () => import('./Pump')},
  {id: 'diamonds', name: 'Diamonds', cat: 'originals', from: '#3dd6ff', to: '#2563eb', load: () => import('./Diamonds')},
  {id: 'coinflip', name: 'Coinflip', cat: 'originals', from: '#ffce3d', to: '#b87900', load: () => import('./Coinflip')},
  {id: 'cases', name: 'Cases', cat: 'originals', from: '#a855f7', to: '#5b21b6', load: () => import('./Cases')},
  {id: 'slide', name: 'Slide', cat: 'originals', from: '#34d399', to: '#047857', load: () => import('./Slide')},
  {id: 'blackjack', name: 'Blackjack', cat: 'table', from: '#0ea5e9', to: '#1e3a8a', tag: 'HOT', load: () => import('./Blackjack')},
  {id: 'roulette', name: 'Roulette', cat: 'table', from: '#ef4444', to: '#7f1d1d', load: () => import('./Roulette')},
  {id: 'baccarat', name: 'Baccarat', cat: 'table', from: '#14b8a6', to: '#134e4a', load: () => import('./Baccarat')},
  {id: 'videopoker', name: 'Video Poker', cat: 'table', from: '#6366f1', to: '#312e81', load: () => import('./VideoPoker')},
  {id: 'dragontiger', name: 'Dragon Tiger', cat: 'table', from: '#f97316', to: '#1d4ed8', tag: 'NEW', load: () => import('./DragonTiger')},
  {id: 'slots', name: 'Lucky 7s', cat: 'more', from: '#f43f5e', to: '#7e22ce', load: () => import('./Slots')},
  {id: 'horses', name: 'Horse Racing', cat: 'more', from: '#84cc16', to: '#365314', load: () => import('./Horses')},
];

export const CATEGORIES: {id: Category; name: string}[] = [
  {id: 'originals', name: 'KMR Originals'},
  {id: 'table', name: 'Table Games'},
  {id: 'more', name: 'Slots & Racing'},
];

const lazyCache = new Map<string, LazyExoticComponent<ComponentType>>();

export function gameComponent(id: string): LazyExoticComponent<ComponentType> | null {
  const def = GAMES.find(g => g.id === id);
  if (!def) return null;
  let c = lazyCache.get(id);
  if (!c) {
    c = lazy(def.load);
    lazyCache.set(id, c);
  }
  return c;
}

export function gameName(id: string): string {
  return GAMES.find(g => g.id === id)?.name ?? id;
}
