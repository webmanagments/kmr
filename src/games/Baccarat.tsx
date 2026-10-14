import {useState} from 'react';
import {baccaratTotal, baccaratValue, drawCard} from '../lib/cards';
import {fate} from '../lib/luck';
import {useFlash, useSettler} from '../lib/hooks';
import {fmtCoins, money, reducedMotion} from '../lib/util';
import {toast, useWallet, wallet} from '../lib/wallet';
import {AutoRow, AutoSheet, useAutoBet} from '../ui/auto';
import {BetAmount, PlayButton} from '../ui/controls';
import {GameLayout, PlayingCard, WinPopup, type CardT, type WinInfo} from '../ui/game';
import {Coin, Undo} from '../ui/icons';
import './games.css';
import './Baccarat.css';

type Spot = 'player' | 'tie' | 'banker';
const PAYS: Record<Spot, number> = {player: 2, tie: 9, banker: 1.95};
const LABEL: Record<Spot, string> = {player: 'Player', tie: 'Tie', banker: 'Banker'};
const ODDS: Record<Spot, string> = {player: '1 : 1', tie: '8 : 1', banker: '0.95 : 1'};

/** Deal a full coup with standard third-card rules. Returns deal order. */
function coup() {
  const p = [drawCard(), drawCard()];
  const b = [drawCard(), drawCard()];
  const order: ('p' | 'b')[] = ['p', 'b', 'p', 'b'];
  const pt = baccaratTotal(p);
  const bt = baccaratTotal(b);
  if (pt < 8 && bt < 8) {
    let p3: CardT | null = null;
    if (pt <= 5) {
      p3 = drawCard();
      p.push(p3);
      order.push('p');
    }
    const bNow = baccaratTotal(b);
    let bankerDraws: boolean;
    if (!p3) bankerDraws = bNow <= 5;
    else {
      const v = baccaratValue(p3);
      bankerDraws =
        bNow <= 2 ||
        (bNow === 3 && v !== 8) ||
        (bNow === 4 && v >= 2 && v <= 7) ||
        (bNow === 5 && v >= 4 && v <= 7) ||
        (bNow === 6 && v >= 6 && v <= 7);
    }
    if (bankerDraws) {
      b.push(drawCard());
      order.push('b');
    }
  }
  const P = baccaratTotal(p);
  const B = baccaratTotal(b);
  const winner: Spot = P > B ? 'player' : B > P ? 'banker' : 'tie';
  return {p, b, order, winner};
}

export default function Baccarat() {
  const {betAmount, balance} = useWallet();
  const [bets, setBets] = useState<{spot: Spot; amt: number}[]>([]);
  const [hand, setHand] = useState<{p: CardT[]; b: CardT[]; order: ('p' | 'b')[]; winner: Spot} | null>(null);
  const [shown, setShown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
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
      setHand(null);
      setShown(0);
    }
    setBets(b => [...b, {spot, amt: betAmount}]);
  };

  const deal = () => {
    if (busy || !bets.length) return;
    if (!wallet.debit(total)) return;
    const payFor = (winner: Spot) =>
      bets.reduce((s, b) => {
        if (winner === 'tie' && b.spot !== 'tie') return s + b.amt; // player/banker push on a tie
        return s + (b.spot === winner ? b.amt * PAYS[b.spot] : 0);
      }, 0);
    const h = fate(coup, c => payFor(c.winner));
    const payout = money(payFor(h.winner));
    const stake = total;
    setHand(h);
    setShown(0);
    setBusy(true);
    setDone(false);
    const step = reducedMotion() ? 60 : 420;
    for (let i = 1; i <= h.order.length; i++) settle(() => setShown(s => Math.max(s, i)), i * step);
    settle(() => {
      setDone(true);
      setBusy(false);
      wallet.settle('baccarat', stake, payout);
      if (payout > stake) flashWin({mult: payout / stake, payout});
    }, h.order.length * step + 300);
  };

  const auto = useAutoBet({game: 'baccarat', idle: !busy, trigger: deal, delay: 700});

  // Map deal order to how many cards of each side are visible.
  const visible = (side: 'p' | 'b') => (hand ? hand.order.slice(0, shown).filter(x => x === side).length : 0);
  const pCards = hand ? hand.p.slice(0, visible('p')) : [];
  const bCards = hand ? hand.b.slice(0, visible('b')) : [];

  return (
    <GameLayout
      title="Baccarat"
      sidebar={
        <>
          <BetAmount locked={busy || auto.running} label="Chip Value" />
          <div className="rl-total bac-total">
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
          <div className="bac-rules">Player pays 1:1 · Banker 0.95:1 · Tie 8:1 (Player & Banker push on a tie)</div>
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
          <div className="bac-table">
            {(['p', 'b'] as const).map(side => {
              const cards = side === 'p' ? pCards : bCards;
              const spot: Spot = side === 'p' ? 'player' : 'banker';
              const isWin = done && hand?.winner === spot;
              return (
                <div key={side} className={`bac-side is-${spot}${isWin ? ' is-win' : ''}`}>
                  <div className="bac-head">
                    <span>{LABEL[spot]}</span>
                    <b>{cards.length ? baccaratTotal(cards) : '–'}</b>
                  </div>
                  <div className="bac-cards">
                    {cards.map((c, i) => (
                      <PlayingCard key={i} card={c} size="sm" className={i === 2 ? 'bac-third' : ''} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className={`bac-verdict${done ? ` is-${hand?.winner}` : ''}`}>{done && hand ? (hand.winner === 'tie' ? 'Tie game' : `${LABEL[hand.winner]} wins`) : busy ? 'Dealing…' : 'Place your bets'}</div>
          <div className="bac-spots">
            {(['player', 'tie', 'banker'] as Spot[]).map(s => (
              <button
                key={s}
                type="button"
                className={`bac-spot is-${s}${done && hand?.winner === s ? ' is-hit' : ''}`}
                onClick={() => place(s)}
                disabled={busy}
                data-autofocus={s === 'player' ? '' : undefined}
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
