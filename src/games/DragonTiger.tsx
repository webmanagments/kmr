import {useState} from 'react';
import {drawCard} from '../lib/cards';
import {useFlash, useSettler} from '../lib/hooks';
import {fmtCoins, money, reducedMotion} from '../lib/util';
import {toast, useWallet, wallet} from '../lib/wallet';
import {AutoRow, AutoSheet, useAutoBet} from '../ui/auto';
import {BetAmount, PlayButton} from '../ui/controls';
import {GameLayout, PlayingCard, WinPopup, type CardT, type WinInfo} from '../ui/game';
import {Coin, Undo} from '../ui/icons';
import './games.css';
import './Baccarat.css';
import './DragonTiger.css';

type Spot = 'dragon' | 'tie' | 'tiger';
const LABEL: Record<Spot, string> = {dragon: 'Dragon', tie: 'Tie', tiger: 'Tiger'};
const ODDS: Record<Spot, string> = {dragon: '1 : 1', tie: '8 : 1', tiger: '1 : 1'};

export default function DragonTiger() {
  const {betAmount, balance} = useWallet();
  const [bets, setBets] = useState<{spot: Spot; amt: number}[]>([]);
  const [cards, setCards] = useState<{d: CardT; t: CardT; winner: Spot} | null>(null);
  const [shown, setShown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [trail, setTrail] = useState<Spot[]>([]);
  const [win, flashWin] = useFlash<WinInfo>(2000);
  const settle = useSettler();

  const total = money(bets.reduce((s, b) => s + b.amt, 0));
  const on = (s: Spot) => money(bets.filter(b => b.spot === s).reduce((t, b) => t + b.amt, 0));

  const place = (spot: Spot) => {
    if (busy) return;
    if (total + betAmount > balance + 1e-9) {
      toast('Not enough coins for another chip', 'error');
      return;
    }
    if (done) {
      setDone(false);
      setCards(null);
      setShown(0);
    }
    setBets(b => [...b, {spot, amt: betAmount}]);
  };

  const deal = () => {
    if (busy || !bets.length) return;
    if (!wallet.debit(total)) return;
    const d = drawCard();
    const t = drawCard();
    const winner: Spot = d.rank > t.rank ? 'dragon' : t.rank > d.rank ? 'tiger' : 'tie';
    const payout = money(
      bets.reduce((s, b) => {
        if (winner === 'tie') return s + (b.spot === 'tie' ? b.amt * 9 : b.amt * 0.5);
        return s + (b.spot === winner ? b.amt * 2 : 0);
      }, 0),
    );
    const stake = total;
    setCards({d, t, winner});
    setShown(0);
    setBusy(true);
    setDone(false);
    const step = reducedMotion() ? 60 : 550;
    settle(() => setShown(1), step);
    settle(() => setShown(2), step * 2);
    settle(() => {
      setDone(true);
      setBusy(false);
      setTrail(tr => [winner, ...tr].slice(0, 12));
      wallet.settle('dragontiger', stake, payout);
      if (payout > stake) flashWin({mult: payout / stake, payout});
    }, step * 2 + 300);
  };

  const auto = useAutoBet({game: 'dragontiger', idle: !busy, trigger: deal, delay: 700});

  return (
    <GameLayout
      title="Dragon Tiger"
      sidebar={
        <>
          <BetAmount locked={busy || auto.running} label="Chip Value" />
          <div className="rl-total">
            <span>Total bet</span>
            <b>
              <Coin size={13} /> {fmtCoins(total)}
            </b>
          </div>
          <div className="btn-row">
            <button type="button" className="ghost-btn" disabled={busy || !bets.length} onClick={() => setBets(b => b.slice(0, -1))}>
              <Undo size={14} /> Undo
            </button>
            <button type="button" className="ghost-btn" disabled={busy || !bets.length} onClick={() => setBets([])}>
              Clear
            </button>
          </div>
          <div className="bac-rules">Highest card wins. Ace is low. On a tie, Dragon and Tiger bets return half.</div>
          <AutoRow auto={auto}>
            <PlayButton onClick={deal} disabled={busy || !bets.length} autoFocus={false} sub={bets.length ? undefined : 'Place chips first'}>
              {busy ? 'Dealing…' : 'Deal'}
            </PlayButton>
          </AutoRow>
          <AutoSheet auto={auto} note={bets.length ? `Repeats your ${fmtCoins(total)} of chips every hand.` : 'Place your chips first.'} />
        </>
      }
      stage={
        <div className="bac">
          <div className="dt-table">
            {(['dragon', 'tiger'] as const).map((side, i) => {
              const card = cards ? (side === 'dragon' ? cards.d : cards.t) : null;
              const isWin = done && cards?.winner === side;
              return (
                <div key={side} className={`dt-side is-${side}${isWin ? ' is-win' : ''}`}>
                  <span className="dt-name">{LABEL[side]}</span>
                  <PlayingCard card={card} hidden={!card || shown <= i} size="lg" key={`${side}-${shown > i}`} />
                </div>
              );
            })}
            <div className="dt-vs">VS</div>
          </div>
          <div className="dt-trail">
            {trail.map((s, i) => (
              <span key={i} className={`dt-pip is-${s}`}>
                {s[0].toUpperCase()}
              </span>
            ))}
          </div>
          <div className="bac-spots dt-spots">
            {(['dragon', 'tie', 'tiger'] as Spot[]).map(s => (
              <button
                key={s}
                type="button"
                className={`bac-spot dt-spot is-${s}${done && cards?.winner === s ? ' is-hit' : ''}`}
                onClick={() => place(s)}
                disabled={busy}
                data-autofocus={s === 'dragon' ? '' : undefined}
              >
                <span className="bac-spot-name">{LABEL[s]}</span>
                <span className="bac-spot-odds">{ODDS[s]}</span>
                {on(s) > 0 && <span className="bac-spot-amt">{fmtCoins(on(s))}</span>}
              </button>
            ))}
          </div>
          <WinPopup win={win} />
        </div>
      }
    />
  );
}
