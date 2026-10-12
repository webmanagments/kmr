import {useEffect, useState} from 'react';
import {useFlash, usePersistent, useSettler} from '../lib/hooks';
import {HOUSE, fmtCoins, fmtMult, money, rand, reducedMotion} from '../lib/util';
import {useWallet, wallet} from '../lib/wallet';
import {AutoRow, AutoSheet, useAutoBet} from '../ui/auto';
import {BetAmount, ListStepper, PlayButton, Readout, Segmented} from '../ui/controls';
import {GameLayout, WinPopup, type WinInfo} from '../ui/game';
import {Coin} from '../ui/icons';
import './games.css';
import './Coinflip.css';

type Side = 'H' | 'T';
const STEP = Math.round(HOUSE * 2 * 100) / 100; // 1.98× per correct call

interface Round {
  phase: 'idle' | 'playing' | 'over';
  stake: number;
  mult: number;
  flips: {side: Side; ok: boolean}[];
}

function Face({side}: {side: Side}) {
  return side === 'H' ? (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="48" fill="#e39b00" />
      <circle cx="50" cy="50" r="41" fill="#ffd34d" />
      <circle cx="50" cy="50" r="41" fill="none" stroke="#f5b000" strokeWidth="3" strokeDasharray="2 5" />
      <path d="M39 30v40M39 50l20-20M45 45l15 25" stroke="#9a5a00" strokeWidth="8" strokeLinecap="round" fill="none" />
    </svg>
  ) : (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="48" fill="#5d7a92" />
      <circle cx="50" cy="50" r="41" fill="#c9d7e3" />
      <circle cx="50" cy="50" r="41" fill="none" stroke="#9fb5c7" strokeWidth="3" strokeDasharray="2 5" />
      <path d="M50 24l7.6 15.4 17 2.5-12.3 12 2.9 16.9L50 62.8l-15.2 8 2.9-16.9-12.3-12 17-2.5z" fill="#3a5568" />
    </svg>
  );
}

export default function Coinflip() {
  const {betAmount} = useWallet();
  const [side, setSide] = useState<Side>('H');
  const [round, setRound] = usePersistent<Round>('coinflip', {phase: 'idle', stake: 0, mult: 1, flips: []});
  const [spin, setSpin] = useState<{to: Side; n: number} | null>(null);
  const [face, setFace] = useState<Side>('H');
  const [busy, setBusy] = useState(false);
  const [autoWins, setAutoWins] = useState(1);
  const [win, flashWin] = useFlash<WinInfo>();
  const settle = useSettler();
  const playing = round.phase === 'playing';

  const flip = () => {
    if (busy) return;
    let r = round;
    if (!playing) {
      const stake = betAmount;
      if (!wallet.debit(stake)) return;
      r = {phase: 'playing', stake, mult: 1, flips: []};
    }
    const result: Side = rand() < 0.5 ? 'H' : 'T';
    const ok = result === side;
    setBusy(true);
    setSpin({to: result, n: (spin?.n ?? 0) + 1});
    const base = r;
    settle(() => {
      setFace(result);
      setBusy(false);
      const flips = [...base.flips, {side: result, ok}];
      if (!ok) {
        wallet.settle('coinflip', base.stake, 0);
        setRound({...base, phase: 'over', flips});
      } else {
        setRound({...base, mult: money(base.mult * STEP), flips});
      }
    }, reducedMotion() ? 200 : 900);
    setRound(base);
  };

  const cashout = () => {
    if (!playing || busy || round.mult <= 1) return;
    const payout = money(round.stake * round.mult);
    wallet.settle('coinflip', round.stake, payout);
    flashWin({mult: round.mult, payout});
    setRound({...round, phase: 'over'});
  };

  const streak = playing ? round.flips.length : 0;
  const live = playing && streak > 0; // a streak is in progress (not the opening flip)

  const auto = useAutoBet({game: 'coinflip', idle: !playing && !busy, trigger: flip});
  // Auto: keep calling until the chosen streak, then cash out.
  useEffect(() => {
    if (!auto.running || !playing || busy || streak === 0) return;
    const t = setTimeout(() => (streak >= autoWins ? cashout() : flip()), auto.stepDelay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto.running, playing, busy, streak]);

  return (
    <GameLayout
      title="Coinflip"
      sidebar={
        <>
          <BetAmount locked={playing || busy || auto.running} />
          <Segmented
            label="Call it"
            value={side}
            onChange={setSide}
            disabled={busy}
            options={[
              {value: 'H', label: 'Heads'},
              {value: 'T', label: 'Tails'},
            ]}
          />
          <Readout
            label={`Total Profit (${fmtMult(playing ? round.mult : 1)})`}
            tone={playing && round.mult > 1 ? 'green' : undefined}
            value={
              <>
                <Coin size={14} />
                {fmtCoins(playing ? round.stake * round.mult - round.stake : 0)}
              </>
            }
          />
          <AutoRow auto={auto}>
            <PlayButton onClick={flip} disabled={busy} sub={live ? `Next ${fmtMult(round.mult * STEP)}` : `Pays ${fmtMult(STEP)}`}>
              {busy ? 'Flipping…' : live ? 'Flip Again' : 'Bet & Flip'}
            </PlayButton>
          </AutoRow>
          <AutoSheet auto={auto}>
            <ListStepper
              label="Cash out after"
              values={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
              value={autoWins}
              onChange={setAutoWins}
              render={v => `${v} win${v > 1 ? 's' : ''} · ${fmtMult(Math.pow(STEP, v))}`}
            />
          </AutoSheet>
          {live && !auto.running && (
            <button type="button" className="ghost-btn flip-cash" onClick={cashout} disabled={busy || round.mult <= 1}>
              Cashout {fmtCoins(round.stake * round.mult)}
            </button>
          )}
        </>
      }
      stage={
        <div className="flip">
          <div className="flip-stage">
            <div className="flip-streak">
              <span className="big-mult">{fmtMult(playing ? round.mult : round.phase === 'over' && round.flips.at(-1)?.ok ? round.mult : 1)}</span>
              <small>{busy ? 'Flipping…' : playing ? `Streak ${streak} — keep going or cash out` : round.phase === 'over' ? (round.flips.at(-1)?.ok ? 'Cashed out' : 'Wrong call') : 'Call heads or tails'}</small>
            </div>
            <div className="flip-coin-wrap">
              <div key={spin?.n ?? 0} className={`flip-coin${busy ? ` is-spinning to-${spin?.to}` : ''}`} data-face={busy ? spin?.to : face}>
                <div className="flip-face front">
                  <Face side="H" />
                </div>
                <div className="flip-face back">
                  <Face side="T" />
                </div>
              </div>
              <div className="flip-shadow" />
            </div>
          </div>
          <div className="flip-trail" aria-label="Flip history">
            {Array.from({length: 10}, (_, i) => {
              const item = round.flips.slice(-10)[i];
              return (
                <span key={i} className={`flip-dot${item ? (item.ok ? ' is-ok' : ' is-bad') : ''}`}>
                  {item ? item.side : ''}
                </span>
              );
            })}
          </div>
          <WinPopup win={win} />
        </div>
      }
    />
  );
}
