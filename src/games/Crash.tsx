import {useEffect, useRef, useState} from 'react';
import {useFlash} from '../lib/hooks';
import {HOUSE, fmtCoins, fmtMult, money, rand} from '../lib/util';
import {useWallet, wallet} from '../lib/wallet';
import {BetAmount, ListStepper, PlayButton, ProfitOnWin} from '../ui/controls';
import {GameLayout, HistoryStrip, WinPopup, type WinInfo} from '../ui/game';
import './games.css';
import './Crash.css';

const AUTO = [0, 1.1, 1.25, 1.5, 2, 3, 5, 10, 25, 50, 100] as const;
const K = 0.16; // growth rate: 2× at ~4.3s, 10× at ~14s
const FRAME = 33; // the panel runs at 30 Hz

type Phase = 'idle' | 'flying' | 'crashed';

interface Live {
  phase: Phase;
  start: number;
  crashAt: number;
  stake: number;
  cashedAt: number | null;
  auto: number;
  settled: boolean;
}

const multAt = (ms: number) => Math.exp((K * ms) / 1000);

export default function Crash() {
  const {betAmount} = useWallet();
  const [auto, setAuto] = useState<number>(2);
  const [view, setView] = useState({phase: 'idle' as Phase, elapsed: 0, cashedAt: null as number | null, crashAt: 0});
  const [hist, setHist] = useState<{key: number; label: string; win: boolean}[]>([]);
  const [win, flashWin] = useFlash<WinInfo>(2200);
  const live = useRef<Live>({phase: 'idle', start: 0, crashAt: 1, stake: 0, cashedAt: null, auto: 0, settled: true});
  const raf = useRef(0);
  const lastPaint = useRef(0);

  const finish = (l: Live, crashed: boolean) => {
    // Settle the bet exactly once.
    if (l.settled) return;
    l.settled = true;
    const payout = l.cashedAt ? money(l.stake * l.cashedAt) : 0;
    wallet.settle('crash', l.stake, payout);
    if (l.cashedAt && !crashed) flashWin({mult: l.cashedAt, payout});
  };

  const cashout = (at: number) => {
    const l = live.current;
    if (l.phase !== 'flying' || l.cashedAt) return;
    l.cashedAt = Math.floor(at * 100) / 100;
    finish(l, false);
  };

  const loop = (now: number) => {
    const l = live.current;
    if (l.phase !== 'flying') return;
    const elapsed = now - l.start;
    const m = multAt(elapsed);
    if (!l.cashedAt && l.auto > 0 && m >= l.auto && l.auto <= l.crashAt) cashout(l.auto);
    if (m >= l.crashAt) {
      l.phase = 'crashed';
      finish(l, true);
      setView({phase: 'crashed', elapsed: Math.log(l.crashAt) / K * 1000, cashedAt: l.cashedAt, crashAt: l.crashAt});
      setHist(h => [{key: now, label: fmtMult(l.crashAt), win: l.crashAt >= 2}, ...h].slice(0, 8));
      return;
    }
    if (now - lastPaint.current >= FRAME) {
      lastPaint.current = now;
      setView({phase: 'flying', elapsed, cashedAt: l.cashedAt, crashAt: l.crashAt});
    }
    raf.current = requestAnimationFrame(loop);
  };

  // Leaving mid-flight settles using the auto cashout target (or as a loss).
  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current);
      const l = live.current;
      if (l.phase === 'flying' && !l.settled) {
        if (!l.cashedAt && l.auto > 0 && l.auto <= l.crashAt) l.cashedAt = l.auto;
        l.phase = 'crashed';
        finish(l, true);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Pause-safe: if the page hides mid-flight, resolve the round deterministically.
  useEffect(() => {
    const onVis = () => {
      const l = live.current;
      if (document.hidden && l.phase === 'flying') {
        cancelAnimationFrame(raf.current);
        if (!l.cashedAt && l.auto > 0 && l.auto <= l.crashAt) l.cashedAt = l.auto;
        l.phase = 'crashed';
        finish(l, true);
        setView({phase: 'crashed', elapsed: (Math.log(l.crashAt) / K) * 1000, cashedAt: l.cashedAt, crashAt: l.crashAt});
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bet = () => {
    if (live.current.phase === 'flying') return;
    const stake = betAmount;
    if (!wallet.debit(stake)) return;
    const r = rand();
    const crashAt = Math.max(1, Math.floor((HOUSE / (1 - r)) * 100) / 100);
    live.current = {phase: 'flying', start: performance.now(), crashAt, stake, cashedAt: null, auto, settled: false};
    lastPaint.current = 0;
    setView({phase: 'flying', elapsed: 0, cashedAt: null, crashAt});
    raf.current = requestAnimationFrame(loop);
  };

  const flying = view.phase === 'flying';
  const m = view.phase === 'crashed' ? view.crashAt : multAt(view.elapsed);
  const canCash = flying && !view.cashedAt;

  // Graph geometry.
  const W = 340;
  const H = 300;
  const tMax = Math.max(8000, view.elapsed * 1.15);
  const mMax = Math.max(2, m * 1.2);
  const px = (t: number) => 34 + (t / tMax) * (W - 44);
  const py = (mm: number) => H - 26 - ((mm - 1) / (mMax - 1)) * (H - 44);
  const steps = 40;
  let path = `M${px(0)} ${py(1)}`;
  for (let i = 1; i <= steps; i++) {
    const t = (view.elapsed * i) / steps;
    path += ` L${px(t).toFixed(1)} ${py(multAt(t)).toFixed(1)}`;
  }
  const endX = px(view.elapsed);
  const endY = py(Math.min(m, mMax));
  const yTicks = [1, 1 + (mMax - 1) / 3, 1 + ((mMax - 1) * 2) / 3, mMax];

  return (
    <GameLayout
      title="Crash"
      sidebar={
        <>
          <BetAmount locked={flying} />
          <ListStepper
            label="Auto Cashout"
            values={AUTO}
            value={auto}
            onChange={setAuto}
            render={v => (v ? fmtMult(v) : 'Off')}
            disabled={flying}
            tone="green"
          />
          <ProfitOnWin mult={auto || 1} label={auto ? 'Profit at Auto' : 'Profit on Win'} />
          {flying ? (
            <PlayButton onClick={() => cashout(multAt(performance.now() - live.current.start))} disabled={!canCash} tone="gold" sub={canCash ? fmtCoins(live.current.stake * m) : `Cashed at ${fmtMult(view.cashedAt ?? 1)}`}>
              {canCash ? 'Cash Out' : 'Cashed Out'}
            </PlayButton>
          ) : (
            <PlayButton onClick={bet}>Bet</PlayButton>
          )}
        </>
      }
      stage={
        <div className={`crash is-${view.phase}`}>
          <HistoryStrip items={hist} />
          <div className="crash-graph">
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id="crashFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor={view.phase === 'crashed' ? '#ff4d6d' : '#ffc531'} stopOpacity=".45" />
                  <stop offset="1" stopColor={view.phase === 'crashed' ? '#ff4d6d' : '#ffc531'} stopOpacity="0" />
                </linearGradient>
              </defs>
              {yTicks.map((v, i) => (
                <g key={i}>
                  <line x1="34" x2={W - 6} y1={py(v)} y2={py(v)} stroke="#2a4354" strokeDasharray="3 5" />
                  <text x="28" y={py(v) + 4} textAnchor="end" fontSize="10" fontWeight="700" fill="#6d8297">
                    {v.toFixed(1)}×
                  </text>
                </g>
              ))}
              {view.elapsed > 0 && (
                <>
                  <path d={`${path} L${endX} ${py(1)} L${px(0)} ${py(1)}Z`} fill="url(#crashFill)" />
                  <path d={path} fill="none" stroke={view.phase === 'crashed' ? '#ff4d6d' : '#ffc531'} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx={endX} cy={endY} r="7" fill="#fff" />
                  <circle cx={endX} cy={endY} r="12" fill={view.phase === 'crashed' ? '#ff4d6d' : '#ffc531'} opacity=".3" />
                </>
              )}
            </svg>
            <div className="crash-readout">
              <div className={`big-mult crash-mult${view.phase === 'crashed' ? ' tone-red' : view.cashedAt ? ' tone-green' : ''}`}>{fmtMult(m)}</div>
              <div className="crash-status">
                {view.phase === 'idle' && 'Place a bet to launch'}
                {view.phase === 'flying' && (view.cashedAt ? `Cashed out at ${fmtMult(view.cashedAt)}` : 'Pinch to cash out')}
                {view.phase === 'crashed' && (view.cashedAt ? `Crashed — you cashed at ${fmtMult(view.cashedAt)}` : 'Crashed')}
              </div>
            </div>
          </div>
          <WinPopup win={win} />
        </div>
      }
    />
  );
}
