import {useEffect, useRef, useState} from 'react';
import {useFlash, useSettler} from '../lib/hooks';
import {HOUSE, fmtMult, money, rand} from '../lib/util';
import {useWallet, wallet} from '../lib/wallet';
import {AutoRow, AutoSheet, useAutoBet} from '../ui/auto';
import {BetAmount, ListStepper, PlayButton, ProfitOnWin, Readout} from '../ui/controls';
import {GameLayout, HistoryStrip, WinPopup, type WinInfo} from '../ui/game';
import './games.css';
import './Limbo.css';

const TARGETS = [1.01, 1.1, 1.25, 1.5, 2, 3, 5, 10, 25, 50, 100, 250, 1000, 10000, 100000, 1000000] as const;
const ANIM = 600;

export default function Limbo() {
  const {betAmount} = useWallet();
  const [target, setTarget] = useState<number>(2);
  const [shown, setShown] = useState(1);
  const [result, setResult] = useState<{value: number; win: boolean} | null>(null);
  const [hist, setHist] = useState<{key: number; label: string; win: boolean}[]>([]);
  const [busy, setBusy] = useState(false);
  const [win, flashWin] = useFlash<WinInfo>();
  const settle = useSettler();
  const raf = useRef(0);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const bet = () => {
    if (busy) return;
    const stake = betAmount;
    if (!wallet.debit(stake)) return;
    const r = rand();
    const value = Math.min(1_000_000, Math.max(1, Math.floor((HOUSE / (1 - r)) * 100) / 100));
    const won = value >= target;
    const payout = won ? money(stake * target) : 0;
    setBusy(true);
    setResult(null);
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ANIM);
      const e = 1 - Math.pow(1 - t, 3);
      // Animate on a log scale so huge results still count up smoothly.
      setShown(Math.exp(Math.log(value) * e));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    settle(() => {
      cancelAnimationFrame(raf.current);
      setShown(value);
      setResult({value, win: won});
      setHist(h => [{key: Date.now(), label: fmtMult(value), win: won}, ...h].slice(0, 8));
      wallet.settle('limbo', stake, payout);
      if (won) flashWin({mult: target, payout});
      setBusy(false);
    }, ANIM + 20);
  };

  const chance = (HOUSE / target) * 100;
  const auto = useAutoBet({game: 'limbo', idle: !busy, trigger: bet});

  return (
    <GameLayout
      title="Limbo"
      sidebar={
        <>
          <BetAmount locked={busy || auto.running} />
          <ListStepper label="Target Multiplier" values={TARGETS} value={target} onChange={setTarget} render={v => fmtMult(v)} disabled={busy} />
          <Readout label="Win Chance" value={`${chance < 0.01 ? chance.toPrecision(2) : chance.toFixed(2)}%`} />
          <ProfitOnWin mult={target} />
          <AutoRow auto={auto}>
            <PlayButton onClick={bet} disabled={busy}>
              Bet
            </PlayButton>
          </AutoRow>
          <AutoSheet auto={auto} />
        </>
      }
      stage={
        <div className="limbo">
          <HistoryStrip items={hist} />
          <div className="limbo-center">
            <div className={`big-mult limbo-num${result ? (result.win ? ' tone-green' : ' tone-red') : ''}`} aria-live="polite">
              {fmtMult(shown)}
            </div>
            <div className="limbo-target">
              <span>Target</span>
              <b>{fmtMult(target)}</b>
            </div>
          </div>
          <div className="limbo-rays" aria-hidden="true" />
          <WinPopup win={win} />
        </div>
      }
    />
  );
}
