import type {CSSProperties, ReactNode} from 'react';
import {fmtCoins, fmtMult} from '../lib/util';
import {Coin} from './icons';

export function GameLayout({
  title,
  sidebar,
  stage,
  stageClass = '',
}: {
  title: string;
  sidebar: ReactNode;
  stage: ReactNode;
  stageClass?: string;
}) {
  return (
    <div className="game">
      <aside className="side" aria-label={`${title} controls`}>
        {sidebar}
      </aside>
      <section className={`stage ${stageClass}`} aria-label={title}>
        {stage}
      </section>
    </div>
  );
}

export interface WinInfo {
  mult: number;
  payout: number;
}

/** Stake-style centered win card. */
export function WinPopup({win}: {win: WinInfo | null}) {
  // Partial returns (e.g. 0.5×) are losses — never celebrate them.
  if (!win || win.mult < 1) return null;
  return (
    <div className="win-pop" role="status" aria-live="polite">
      <div className="win-mult">{fmtMult(win.mult)}</div>
      <div className="win-rule" />
      <div className="win-pay">
        <Coin size={16} />
        <span>{fmtCoins(win.payout)}</span>
      </div>
    </div>
  );
}

export const SUITS = ['♠', '♥', '♦', '♣'] as const;
export const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;

export interface CardT {
  rank: number; // 1..13 (Ace = 1)
  suit: number; // 0..3
}

export function PlayingCard({
  card,
  hidden = false,
  size = 'md',
  state,
  style,
  className = '',
}: {
  card?: CardT | null;
  hidden?: boolean;
  size?: 'sm' | 'md' | 'lg';
  state?: 'win' | 'lose' | 'push' | 'held';
  style?: CSSProperties;
  className?: string;
}) {
  if (!card || hidden) {
    return (
      <div className={`pcard is-back size-${size} ${className}`} style={style} aria-label="Face-down card">
        <div className="pcard-back" />
      </div>
    );
  }
  const red = card.suit === 1 || card.suit === 2;
  const label = `${RANKS[card.rank]} of ${['spades', 'hearts', 'diamonds', 'clubs'][card.suit]}`;
  return (
    <div
      className={`pcard size-${size}${red ? ' is-red' : ''}${state ? ` is-${state}` : ''} ${className}`}
      style={style}
      aria-label={label}
      role="img"
    >
      <span className="pcard-rank">{RANKS[card.rank]}</span>
      <span className="pcard-suit">{SUITS[card.suit]}</span>
    </div>
  );
}

/** Row of past results, newest first, Stake style. */
export function HistoryStrip({items}: {items: {key: number | string; label: string; win: boolean}[]}) {
  return (
    <div className="hist" aria-label="Recent results">
      {items.slice(0, 6).map(i => (
        <span key={i.key} className={`hist-pill${i.win ? ' is-win' : ''}`}>
          {i.label}
        </span>
      ))}
    </div>
  );
}
