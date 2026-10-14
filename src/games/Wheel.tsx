import {useMemo, useRef, useState} from 'react';
import {useFlash, useSettler} from '../lib/hooks';
import {fmtMult, money, rand, randInt, reducedMotion} from '../lib/util';
import {fate} from '../lib/luck';
import {useWallet, wallet} from '../lib/wallet';
import {AutoRow, AutoSheet, useAutoBet} from '../ui/auto';
import {BetAmount, ListStepper, PlayButton, Segmented} from '../ui/controls';
import {GameLayout, HistoryStrip, WinPopup, type WinInfo} from '../ui/game';
import './games.css';
import './Wheel.css';

type Risk = 'low' | 'medium' | 'high';
const SEGMENTS = [10, 20, 30, 40, 50] as const;
const SPIN_MS = 3200;

const PATTERN: Record<'low' | 'medium', number[]> = {
  low: [1.5, 1.2, 1.2, 1.2, 0, 1.2, 1.2, 1.2, 1.2, 0],
  medium: [0, 1.9, 0, 1.5, 0, 2, 0, 1.5, 0, 3],
};

export function wheelLayout(risk: Risk, n: number): number[] {
  if (risk === 'high') return Array.from({length: n}, (_, i) => (i === 0 ? Math.round(0.99 * n * 100) / 100 : 0));
  return Array.from({length: n}, (_, i) => PATTERN[risk][i % 10]);
}

function colorFor(m: number, risk: Risk): string {
  if (m === 0) return '#2b4556';
  if (risk === 'high') return '#ff4d6d';
  if (m === 1.2) return '#d8e6ee';
  if (m === 1.5) return '#00e701';
  if (m === 1.9) return '#d8e6ee';
  if (m === 2) return '#ffc531';
  if (m === 3) return '#9d5cff';
  return '#1475e1';
}

export default function Wheel() {
  const {betAmount} = useWallet();
  const [risk, setRisk] = useState<Risk>('medium');
  const [n, setN] = useState<number>(30);
  const [rot, setRot] = useState(0);
  const [landed, setLanded] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [hist, setHist] = useState<{key: number; label: string; win: boolean}[]>([]);
  const [win, flashWin] = useFlash<WinInfo>();
  const settle = useSettler();
  const rotRef = useRef(0);

  const layout = useMemo(() => wheelLayout(risk, n), [risk, n]);
  const legend = useMemo(() => {
    const counts = new Map<number, number>();
    layout.forEach(m => counts.set(m, (counts.get(m) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => a[0] - b[0]);
  }, [layout]);

  const seg = 360 / n;
  const R = 130;
  const C = 150;

  const spin = () => {
    if (busy) return;
    const stake = betAmount;
    if (!wallet.debit(stake)) return;
    const s = fate(() => randInt(n), i => layout[i]);
    const mult = layout[s];
    const payout = money(stake * mult);
    const jitter = (rand() - 0.5) * seg * 0.7;
    const base = Math.ceil(rotRef.current / 360) * 360 + 360 * 5;
    const target = base - (s + 0.5) * seg + jitter;
    rotRef.current = target;
    setRot(target);
    setLanded(null);
    setBusy(true);
    const ms = reducedMotion() ? 400 : SPIN_MS;
    settle(() => {
      setLanded(s);
      setHist(h => [{key: Date.now(), label: fmtMult(mult), win: mult >= 1}, ...h].slice(0, 8));
      wallet.settle('wheel', stake, payout);
      if (mult > 0) flashWin({mult, payout});
      setBusy(false);
    }, ms + 60);
  };

  const auto = useAutoBet({game: 'wheel', idle: !busy, trigger: spin});

  const arc = (i: number) => {
    const a0 = ((i * seg - 90) * Math.PI) / 180;
    const a1 = (((i + 1) * seg - 90) * Math.PI) / 180;
    const p = (a: number, r: number) => `${(C + Math.cos(a) * r).toFixed(2)} ${(C + Math.sin(a) * r).toFixed(2)}`;
    return `M${p(a0, R)} A${R} ${R} 0 0 1 ${p(a1, R)} L${p(a1, R - 46)} A${R - 46} ${R - 46} 0 0 0 ${p(a0, R - 46)}Z`;
  };

  return (
    <GameLayout
      title="Wheel"
      sidebar={
        <>
          <BetAmount locked={busy || auto.running} />
          <Segmented
            label="Risk"
            value={risk}
            onChange={v => {
              setRisk(v);
              setLanded(null);
            }}
            disabled={busy}
            options={[
              {value: 'low', label: 'Low'},
              {value: 'medium', label: 'Med', aria: 'Medium'},
              {value: 'high', label: 'High'},
            ]}
          />
          <ListStepper
            label="Segments"
            values={SEGMENTS}
            value={n}
            onChange={v => {
              setN(v);
              setLanded(null);
            }}
            disabled={busy}
          />
          <AutoRow auto={auto}>
            <PlayButton onClick={spin} disabled={busy}>
              {busy ? 'Spinning…' : 'Spin'}
            </PlayButton>
          </AutoRow>
          <AutoSheet auto={auto} />
        </>
      }
      stage={
        <div className="wheel">
          <HistoryStrip items={hist} />
          <div className="wheel-box">
            <svg viewBox="0 0 300 300" className="wheel-svg" aria-hidden="true">
              <circle cx={C} cy={C} r={R + 10} fill="#0b1822" />
              <circle cx={C} cy={C} r={R + 10} fill="none" stroke="#2b4556" strokeWidth="4" />
              <g
                style={{
                  transform: `rotate(${rot}deg)`,
                  transformOrigin: `${C}px ${C}px`,
                  transition: busy ? `transform ${reducedMotion() ? 400 : SPIN_MS}ms cubic-bezier(0.15, 0.7, 0.12, 1)` : 'none',
                }}
              >
                {layout.map((m, i) => (
                  <path key={i} d={arc(i)} fill={colorFor(m, risk)} stroke="#0b1822" strokeWidth={n > 30 ? 1 : 2} opacity={landed === null || landed === i ? 1 : 0.45} />
                ))}
              </g>
              <circle cx={C} cy={C} r={R - 50} fill="#13242f" />
              <circle cx={C} cy={C} r={R - 50} fill="none" stroke="#2b4556" strokeWidth="3" />
              <path d={`M${C - 12} 6 h24 l-12 22z`} fill="#fff" stroke="#0b1822" strokeWidth="2" />
            </svg>
            <div className={`wheel-center${landed !== null ? (layout[landed] > 0 ? ' tone-green' : ' tone-red') : ''}`}>
              {landed !== null ? fmtMult(layout[landed]) : busy ? '' : 'Spin!'}
            </div>
          </div>
          <div className="wheel-legend">
            {legend.map(([m, c]) => (
              <div key={m} className="wheel-chip" style={{borderBottomColor: colorFor(m, risk)}}>
                <b>{fmtMult(m)}</b>
                <span>{((c / n) * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
          <WinPopup win={win} />
        </div>
      }
    />
  );
}
