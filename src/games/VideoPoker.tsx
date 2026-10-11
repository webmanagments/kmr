import {useEffect, useRef} from 'react';
import {useFlash, usePersistent} from '../lib/hooks';
import {focusDefault, focusEl} from '../lib/spatial';
import {fmtMult, money, shuffle} from '../lib/util';
import {useWallet, wallet} from '../lib/wallet';
import {BetAmount, PlayButton} from '../ui/controls';
import {GameLayout, PlayingCard, RANKS, SUITS, WinPopup, type CardT, type WinInfo} from '../ui/game';
import './games.css';
import './VideoPoker.css';

// Jacks or Better, full-pay 9/6 table (return per 1 coin, stake included).
const TABLE = [
  {id: 'rf', name: 'Royal Flush', pay: 800},
  {id: 'sf', name: 'Straight Flush', pay: 50},
  {id: '4k', name: 'Four of a Kind', pay: 25},
  {id: 'fh', name: 'Full House', pay: 9},
  {id: 'fl', name: 'Flush', pay: 6},
  {id: 'st', name: 'Straight', pay: 4},
  {id: '3k', name: 'Three of a Kind', pay: 3},
  {id: '2p', name: 'Two Pair', pay: 2},
  {id: 'jb', name: 'Jacks or Better', pay: 1},
] as const;

type HandId = (typeof TABLE)[number]['id'] | 'none';

export function evaluate(cards: CardT[]): HandId {
  const ranks = cards.map(c => c.rank).sort((a, b) => a - b);
  const counts = new Map<number, number>();
  ranks.forEach(r => counts.set(r, (counts.get(r) ?? 0) + 1));
  const groups = [...counts.values()].sort((a, b) => b - a);
  const flush = cards.every(c => c.suit === cards[0].suit);
  const uniq = counts.size === 5;
  const wheel = uniq && ranks.join() === '1,2,3,4,5';
  const broadway = uniq && ranks.join() === '1,10,11,12,13';
  const straight = uniq && (ranks[4] - ranks[0] === 4 || broadway || wheel);
  if (straight && flush) return broadway ? 'rf' : 'sf';
  if (groups[0] === 4) return '4k';
  if (groups[0] === 3 && groups[1] === 2) return 'fh';
  if (flush) return 'fl';
  if (straight) return 'st';
  if (groups[0] === 3) return '3k';
  if (groups[0] === 2 && groups[1] === 2) return '2p';
  if (groups[0] === 2) {
    const pair = [...counts.entries()].find(([, n]) => n === 2)![0];
    if (pair === 1 || pair >= 11) return 'jb';
  }
  return 'none';
}

interface Round {
  phase: 'idle' | 'dealt' | 'done';
  stake: number;
  deck: CardT[];
  hand: CardT[];
  held: boolean[];
  result: HandId | null;
}

const newDeck = () => shuffle(Array.from({length: 52}, (_, i) => ({rank: (i % 13) + 1, suit: Math.floor(i / 13)})));

export default function VideoPoker() {
  const {betAmount} = useWallet();
  const [round, setRound] = usePersistent<Round>('videopoker', {phase: 'idle', stake: 0, deck: [], hand: [], held: [], result: null});
  const [win, flashWin] = useFlash<WinInfo>(2000);
  const cardsRef = useRef<HTMLDivElement>(null);

  const prevPhase = useRef(round.phase);
  useEffect(() => {
    if (prevPhase.current === round.phase) return;
    prevPhase.current = round.phase;
    requestAnimationFrame(() => (round.phase === 'dealt' ? focusEl(cardsRef.current?.querySelector<HTMLElement>('button') ?? null) : focusDefault()));
  }, [round.phase]);

  const deal = () => {
    const stake = betAmount;
    if (!wallet.debit(stake)) return;
    const deck = newDeck();
    const hand = deck.splice(0, 5);
    setRound({phase: 'dealt', stake, deck, hand, held: [false, false, false, false, false], result: null});
  };

  const draw = () => {
    if (round.phase !== 'dealt') return;
    const deck = [...round.deck];
    const hand = round.hand.map((c, i) => (round.held[i] ? c : deck.shift()!));
    const result = evaluate(hand);
    const pay = TABLE.find(t => t.id === result)?.pay ?? 0;
    const payout = money(round.stake * pay);
    wallet.settle('videopoker', round.stake, payout);
    if (pay > 1) flashWin({mult: pay, payout});
    setRound({...round, phase: 'done', deck, hand, result});
  };

  const toggle = (i: number) => {
    if (round.phase !== 'dealt') return;
    setRound({...round, held: round.held.map((h, j) => (j === i ? !h : h))});
  };

  const live = round.phase === 'dealt' ? evaluate(round.hand) : round.result;

  return (
    <GameLayout
      title="Video Poker"
      sidebar={
        <>
          <BetAmount locked={round.phase === 'dealt'} />
          <div className="vp-help">
            {round.phase === 'dealt' ? 'Select cards to HOLD, then Draw to replace the rest.' : 'Jacks or Better. Pair of Jacks or higher returns your bet.'}
          </div>
          {round.phase === 'dealt' ? (
            <PlayButton onClick={draw} tone="blue" autoFocus={false}>
              Draw
            </PlayButton>
          ) : (
            <PlayButton onClick={deal}>{round.phase === 'done' ? 'Deal Again' : 'Deal'}</PlayButton>
          )}
        </>
      }
      stage={
        <div className="vp">
          <div className="vp-table">
            {TABLE.map(t => (
              <div key={t.id} className={`vp-row${live === t.id ? (round.phase === 'done' ? ' is-win' : ' is-live') : ''}`}>
                <span>{t.name}</span>
                <b>{fmtMult(t.pay)}</b>
              </div>
            ))}
          </div>
          <div className="vp-cards" ref={cardsRef}>
            {Array.from({length: 5}, (_, i) => {
              const c = round.hand[i];
              const held = round.held[i];
              return (
                <button
                  key={`${round.phase === 'done' ? 'd' : 'h'}-${i}-${c ? c.rank + '' + c.suit : 'x'}`}
                  type="button"
                  className={`vp-card${held ? ' is-held' : ''}`}
                  onClick={() => toggle(i)}
                  disabled={round.phase !== 'dealt'}
                  aria-pressed={held}
                  aria-label={c ? `${RANKS[c.rank]}${SUITS[c.suit]}${held ? ', held' : ''}` : 'Empty'}
                >
                  <span className="vp-held">{held ? 'HELD' : ''}</span>
                  <PlayingCard card={c} hidden={!c} state={held ? 'held' : undefined} />
                </button>
              );
            })}
          </div>
          <div className={`vp-result${round.phase === 'done' ? (round.result !== 'none' ? ' tone-green' : ' tone-red') : ''}`}>
            {round.phase === 'done'
              ? round.result === 'none'
                ? 'No win — deal again'
                : TABLE.find(t => t.id === round.result)?.name
              : round.phase === 'dealt' && live !== 'none'
                ? `You have: ${TABLE.find(t => t.id === live)?.name}`
                : ' '}
          </div>
          <WinPopup win={win} />
        </div>
      }
    />
  );
}
