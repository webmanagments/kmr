import {useEffect, useRef, useState} from 'react';
import {useFlash, useSettler} from '../lib/hooks';
import {fmtCoins, money, randInt, reducedMotion} from '../lib/util';
import {toast, useWallet, wallet} from '../lib/wallet';
import {AutoRow, AutoSheet, useAutoBet} from '../ui/auto';
import {BetAmount, PlayButton} from '../ui/controls';
import {GameLayout, WinPopup, type WinInfo} from '../ui/game';
import {Coin, Undo} from '../ui/icons';
import './games.css';
import './Roulette.css';

const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const color = (n: number) => (n === 0 ? 'green' : RED.has(n) ? 'red' : 'black');
const SPIN_MS = 1700;

type Key = string;

/** Total return (stake included) for a bet key if `n` hits, else 0. */
function payoutFor(key: Key, n: number): number {
  const [kind, arg] = key.split(':');
  const v = Number(arg);
  switch (kind) {
    case 'n':
      return n === v ? 36 : 0;
    case 'dozen':
      return n > 0 && Math.ceil(n / 12) === v ? 3 : 0;
    case 'col':
      return n > 0 && ((n - 1) % 3) + 1 === v ? 3 : 0;
    case 'red':
      return n > 0 && RED.has(n) ? 2 : 0;
    case 'black':
      return n > 0 && !RED.has(n) ? 2 : 0;
    case 'odd':
      return n > 0 && n % 2 === 1 ? 2 : 0;
    case 'even':
      return n > 0 && n % 2 === 0 ? 2 : 0;
    case 'low':
      return n >= 1 && n <= 18 ? 2 : 0;
    case 'high':
      return n >= 19 ? 2 : 0;
  }
  return 0;
}

export default function Roulette() {
  const {betAmount, balance} = useWallet();
  const [bets, setBets] = useState<{key: Key; amt: number}[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<number | null>(null);
  const [rolling, setRolling] = useState<number | null>(null);
  const [hist, setHist] = useState<number[]>([]);
  const [win, flashWin] = useFlash<WinInfo>(2000);
  const settle = useSettler();
  const roller = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (roller.current) clearInterval(roller.current);
  }, []);

  const totals = new Map<Key, number>();
  bets.forEach(b => totals.set(b.key, money((totals.get(b.key) ?? 0) + b.amt)));
  const totalBet = money(bets.reduce((s, b) => s + b.amt, 0));

  const place = (key: Key) => {
    if (busy) return;
    if (totalBet + betAmount > balance + 1e-9) {
      toast('Not enough coins for another chip', 'error');
      return;
    }
    setResult(null);
    setBets(b => [...b, {key, amt: betAmount}]);
  };

  const spin = () => {
    if (busy || !bets.length) return;
    if (!wallet.debit(totalBet)) return;
    const n = randInt(37);
    const payout = money(bets.reduce((s, b) => s + b.amt * payoutFor(b.key, n), 0));
    setBusy(true);
    setResult(null);
    roller.current = setInterval(() => setRolling(randInt(37)), 70);
    const stake = totalBet;
    settle(() => {
      if (roller.current) clearInterval(roller.current);
      setRolling(null);
      setResult(n);
      setHist(h => [n, ...h].slice(0, 7));
      wallet.settle('roulette', stake, payout);
      if (payout > 0) flashWin({mult: payout / stake, payout});
      setBusy(false);
    }, reducedMotion() ? 300 : SPIN_MS);
  };

  const cell = (key: Key, label: React.ReactNode, cls: string, style?: React.CSSProperties, aria?: string) => {
    const amt = totals.get(key);
    const hit = result !== null && payoutFor(key, result) > 0;
    return (
      <button
        key={key}
        type="button"
        className={`rl-cell ${cls}${hit ? ' is-hit' : ''}`}
        style={style}
        onClick={() => place(key)}
        disabled={busy}
        data-autofocus={key === 'red' ? '' : undefined}
        aria-label={`${aria ?? key}${amt ? `, ${fmtCoins(amt)} placed` : ''}`}
      >
        <span className="rl-cell-label">{label}</span>
        {amt ? <span className="rl-chip">{amt >= 1000 ? `${Math.round(amt / 100) / 10}k` : amt >= 100 ? Math.round(amt) : amt}</span> : null}
      </button>
    );
  };

  const shown = rolling ?? result;
  const auto = useAutoBet({game: 'roulette', idle: !busy, trigger: spin});

  return (
    <GameLayout
      title="Roulette"
      sidebar={
        <>
          <BetAmount locked={busy || auto.running} label="Chip Value" />
          <div className={`rl-result is-${shown === null ? 'none' : color(shown)}${rolling !== null ? ' is-rolling' : ''}`} aria-live="polite">
            {shown === null ? '?' : shown}
          </div>
          <div className="rl-hist">
            {hist.map((n, i) => (
              <span key={i} className={`rl-dot is-${color(n)}`}>
                {n}
              </span>
            ))}
          </div>
          <div className="rl-total">
            <span>Total bet</span>
            <b>
              <Coin size={13} /> {fmtCoins(totalBet)}
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
          <AutoRow auto={auto}>
            <PlayButton onClick={spin} disabled={busy || !bets.length} autoFocus={false} sub={bets.length ? undefined : 'Place chips on the board'}>
              {busy ? 'Spinning…' : 'Spin'}
            </PlayButton>
          </AutoRow>
          <AutoSheet auto={auto} note={bets.length ? `Repeats your ${fmtCoins(totalBet)} of chips every spin.` : 'Place your chips on the board first.'} />
        </>
      }
      stage={
        <div className="rl">
          <div className="rl-board">
            {cell('n:0', '0', 'is-green rl-zero', {gridColumn: '2 / 5', gridRow: 1}, 'Zero')}
            {[1, 2, 3].map(d =>
              cell(`dozen:${d}`, `${['1st', '2nd', '3rd'][d - 1]} 12`, 'rl-side rl-vert', {gridColumn: 1, gridRow: `${2 + (d - 1) * 4} / span 4`}, `${d} dozen`),
            )}
            {Array.from({length: 36}, (_, i) => {
              const n = i + 1;
              const row = Math.ceil(n / 3);
              const col = ((n - 1) % 3) + 2;
              return (
                <span key={n} style={{display: 'contents'}}>
                  {cell(`n:${n}`, n, `is-${color(n)}`, {gridColumn: col, gridRow: row + 1}, `Number ${n}`)}
                </span>
              );
            })}
            {[
              ['low', '1–18'],
              ['even', 'Even'],
              ['red', ''],
              ['black', ''],
              ['odd', 'Odd'],
              ['high', '19–36'],
            ].map(([k, label], i) =>
              cell(
                k,
                k === 'red' || k === 'black' ? <i className={`rl-diamond is-${k}`} /> : label,
                'rl-side rl-vert',
                {gridColumn: 5, gridRow: `${2 + i * 2} / span 2`},
                k,
              ),
            )}
            {[1, 2, 3].map(c => cell(`col:${c}`, '2:1', 'rl-side', {gridColumn: c + 1, gridRow: 14}, `Column ${c}`))}
          </div>
          <WinPopup win={win} />
        </div>
      }
    />
  );
}
