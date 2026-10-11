import type {CardT} from '../ui/game';
import {randInt} from './util';

/** Draw from an infinite (continuously shuffled) shoe. */
export const drawCard = (): CardT => ({rank: randInt(13) + 1, suit: randInt(4)});

/** Blackjack / baccarat point value of one card. */
export const bjValue = (c: CardT) => (c.rank >= 10 ? 10 : c.rank);

export function handTotal(cards: CardT[]): {total: number; soft: boolean} {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += bjValue(c);
    if (c.rank === 1) aces++;
  }
  if (aces && total + 10 <= 21) return {total: total + 10, soft: true};
  return {total, soft: false};
}

export const isBlackjack = (cards: CardT[]) => cards.length === 2 && handTotal(cards).total === 21;

export const baccaratValue = (c: CardT) => (c.rank >= 10 ? 0 : c.rank);
export const baccaratTotal = (cards: CardT[]) => cards.reduce((s, c) => s + baccaratValue(c), 0) % 10;
