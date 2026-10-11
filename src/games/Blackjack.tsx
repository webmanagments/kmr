import {useEffect, useRef, useState} from 'react';
import {drawCard, handTotal, isBlackjack} from '../lib/cards';
import {useFlash, usePersistent, useSettler} from '../lib/hooks';
import {focusDefault, focusEl} from '../lib/spatial';
import {money} from '../lib/util';
import {useWallet, wallet} from '../lib/wallet';
import {BetAmount, PlayButton} from '../ui/controls';
import {GameLayout, PlayingCard, WinPopup, type CardT, type WinInfo} from '../ui/game';
import './games.css';
import './Blackjack.css';

type Result = 'win' | 'lose' | 'push' | 'blackjack';

interface Hand {
  cards: CardT[];
  stake: number;
  done: boolean;
  doubled: boolean;
  result?: Result;
}

interface Round {
  phase: 'idle' | 'player' | 'dealer' | 'done';
  hands: Hand[];
  active: number;
  dealer: CardT[];
  shown: number; // dealer cards visible
}

const EMPTY: Round = {phase: 'idle', hands: [], active: 0, dealer: [], shown: 0};

function TotalBadge({cards, hidden = false, result, allowBJ = true}: {cards: CardT[]; hidden?: boolean; result?: Result; allowBJ?: boolean}) {
  if (!cards.length) return null;
  const {total, soft} = handTotal(hidden ? cards.slice(0, 1) : cards);
  const label = !hidden && allowBJ && isBlackjack(cards) ? 'BJ' : soft && total < 21 ? `${total - 10}/${total}` : String(total);
  return <span className={`bj-total${result ? ` is-${result === 'blackjack' ? 'win' : result}` : total > 21 ? ' is-lose' : ''}`}>{label}</span>;
}

export default function Blackjack() {
  const {betAmount, balance} = useWallet();
  const [round, setRound] = usePersistent<Round>('blackjack', EMPTY);
  const [win, flashWin] = useFlash<WinInfo>(2000);
  const [revealing, setRevealing] = useState(false);
  const settle = useSettler();
  const hitRef = useRef<HTMLButtonElement>(null);

  const prevPhase = useRef(round.phase);
  useEffect(() => {
    if (prevPhase.current === round.phase) return;
    prevPhase.current = round.phase;
    requestAnimationFrame(() => (round.phase === 'player' ? focusEl(hitRef.current) : round.phase !== 'dealer' && focusDefault()));
  }, [round.phase]);

  const finish = (r: Round) => {
    // Dealer draws to 17 (stands on all 17s), then every hand is settled.
    const natural = r.hands.length === 1 && isBlackjack(r.hands[0].cards);
    const live = !natural && r.hands.some(h => handTotal(h.cards).total <= 21);
    const dealer = [...r.dealer];
    if (live) while (handTotal(dealer).total < 17) dealer.push(drawCard());
    const d = handTotal(dealer).total;
    const dealerBJ = isBlackjack(dealer);
    let totalPay = 0;
    let totalStake = 0;
    const hands = r.hands.map(h => {
      const p = handTotal(h.cards).total;
      const natural = isBlackjack(h.cards) && r.hands.length === 1;
      let result: Result;
      if (p > 21) result = 'lose';
      else if (natural && !dealerBJ) result = 'blackjack';
      else if (dealerBJ && !natural) result = 'lose';
      else if (d > 21 || p > d) result = 'win';
      else if (p === d) result = 'push';
      else result = 'lose';
      const pay = result === 'blackjack' ? h.stake * 2.5 : result === 'win' ? h.stake * 2 : result === 'push' ? h.stake : 0;
      totalPay += pay;
      totalStake += h.stake;
      return {...h, done: true, result};
    });
    const next: Round = {...r, phase: 'dealer', dealer, hands: r.hands, shown: 1};
    setRound(next);
    setRevealing(true);
    // Reveal dealer cards one at a time, then pay.
    for (let i = 2; i <= dealer.length; i++) {
      settle(() => setRound(cur => ({...cur, shown: Math.max(cur.shown, i)})), (i - 1) * 420);
    }
    settle(() => {
      const payout = money(totalPay);
      wallet.settle('blackjack', totalStake, payout);
      if (payout > totalStake) flashWin({mult: payout / totalStake, payout});
      setRound({...next, phase: 'done', hands, shown: dealer.length});
      setRevealing(false);
    }, (dealer.length - 1) * 420 + 260);
  };

  const advance = (r: Round) => {
    // Move to the next unfinished hand, or let the dealer play.
    const idx = r.hands.findIndex(h => !h.done);
    if (idx === -1) finish(r);
    else setRound({...r, active: idx});
  };

  const deal = () => {
    const stake = betAmount;
    if (!wallet.debit(stake)) return;
    const player = [drawCard(), drawCard()];
    const dealer = [drawCard(), drawCard()];
    const r: Round = {phase: 'player', hands: [{cards: player, stake, done: false, doubled: false}], active: 0, dealer, shown: 1};
    if (isBlackjack(player) || isBlackjack(dealer)) {
      r.hands[0].done = true;
      finish(r);
      return;
    }
    setRound(r);
  };

  const update = (fn: (h: Hand) => Hand) => {
    const hands = round.hands.map((h, i) => (i === round.active ? fn(h) : h));
    advance({...round, hands});
  };

  const hit = () =>
    update(h => {
      const cards = [...h.cards, drawCard()];
      const t = handTotal(cards).total;
      return {...h, cards, done: t >= 21};
    });

  const stand = () => update(h => ({...h, done: true}));

  const hand = round.hands[round.active];
  const canDouble = round.phase === 'player' && hand?.cards.length === 2 && balance >= hand.stake;
  const canSplit =
    round.phase === 'player' && round.hands.length === 1 && hand?.cards.length === 2 && hand.cards[0].rank === hand.cards[1].rank && balance >= hand.stake;

  const double = () => {
    if (!canDouble || !wallet.debit(hand.stake)) return;
    update(h => ({...h, cards: [...h.cards, drawCard()], stake: h.stake * 2, doubled: true, done: true}));
  };

  const split = () => {
    if (!canSplit || !wallet.debit(hand.stake)) return;
    const [a, b] = hand.cards;
    const aces = a.rank === 1;
    const hands: Hand[] = [
      {cards: [a, drawCard()], stake: hand.stake, done: aces, doubled: false},
      {cards: [b, drawCard()], stake: hand.stake, done: aces, doubled: false},
    ];
    advance({...round, hands, active: 0});
  };

  const playing = round.phase === 'player';
  const dealerHidden = round.phase === 'player' || (round.phase === 'dealer' && round.shown < 2);

  return (
    <GameLayout
      title="Blackjack"
      sidebar={
        <>
          <BetAmount locked={round.phase === 'player' || round.phase === 'dealer'} />
          <div className="bj-actions">
            <button ref={hitRef} type="button" className="bj-btn" onClick={hit} disabled={!playing}>
              Hit
            </button>
            <button type="button" className="bj-btn" onClick={stand} disabled={!playing}>
              Stand
            </button>
            <button type="button" className="bj-btn" onClick={split} disabled={!canSplit}>
              Split
            </button>
            <button type="button" className="bj-btn" onClick={double} disabled={!canDouble}>
              Double
            </button>
          </div>
          <PlayButton onClick={deal} disabled={playing || revealing || round.phase === 'dealer'} autoFocus={!playing}>
            {round.phase === 'done' ? 'Deal Again' : 'Deal'}
          </PlayButton>
        </>
      }
      stage={
        <div className="bj">
          <div className="bj-zone">
            <div className="bj-label">
              Dealer <TotalBadge cards={round.dealer.slice(0, Math.max(round.shown, dealerHidden ? 2 : round.shown))} hidden={dealerHidden} />
            </div>
            <div className="bj-cards">
              {round.dealer.map((c, i) => {
                if (i >= Math.max(round.shown, 2) && round.phase !== 'player') return null;
                return <PlayingCard key={i} card={c} hidden={i === 1 && dealerHidden} style={{marginLeft: i ? -26 : 0}} />;
              })}
              {round.phase === 'idle' && <div className="bj-ghost" />}
            </div>
          </div>
          <div className="bj-rules">
            <span>BLACKJACK PAYS 3 TO 2</span>
            <small>Dealer stands on 17 · Insurance not offered</small>
          </div>
          <div className="bj-zone">
            <div className="bj-hands">
              {round.hands.length === 0 && <div className="bj-ghost" />}
              {round.hands.map((h, hi) => (
                <div key={hi} className={`bj-hand${playing && hi === round.active && round.hands.length > 1 ? ' is-active' : ''}`}>
                  <div className="bj-cards">
                    {h.cards.map((c, i) => (
                      <PlayingCard
                        key={i}
                        card={c}
                        style={{marginLeft: i ? -26 : 0}}
                        state={h.result ? (h.result === 'blackjack' ? 'win' : h.result) : undefined}
                      />
                    ))}
                  </div>
                  <div className="bj-label">
                    {round.hands.length > 1 ? `Hand ${hi + 1}` : 'You'} <TotalBadge cards={h.cards} result={h.result} allowBJ={round.hands.length === 1} />
                    {h.doubled && <span className="bj-chip">2×</span>}
                    {h.result && <span className={`bj-res is-${h.result}`}>{h.result === 'blackjack' ? 'Blackjack!' : h.result}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <WinPopup win={win} />
        </div>
      }
    />
  );
}
