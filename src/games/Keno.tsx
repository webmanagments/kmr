import {useEffect, useRef, useState} from 'react';
import {useFlash, useSettler} from '../lib/hooks';
import {HOUSE, choose, fmtMult, money, shuffle} from '../lib/util';
import {useWallet, wallet} from '../lib/wallet';
import {BetAmount, PlayButton, Segmented} from '../ui/controls';
import {GameLayout, WinPopup, type WinInfo} from '../ui/game';
import {GemIcon, Shuffle, Undo} from '../ui/icons';
import './games.css';
import './Keno.css';

type Risk = 'low' | 'medium' | 'high';
const N = 40;
const DRAWN = 10;
const MAX_PICKS = 10;
const REVEAL_MS = 90;

const SHAPE: Record<Risk, {min: number; growth: number}> = {
  low: {min: 0.3, growth: 1.7},
  medium: {min: 0.45, growth: 2.4},
  high: {min: 0.6, growth: 3.2},
};

const pHits = (n: number, h: number) => (choose(n, h) * choose(N - n, DRAWN - h)) / choose(N, DRAWN);

/** Build a 99% RTP payout table for `n` picks. */
function buildTable(n: number, risk: Risk): number[] {
  const {min, growth} = SHAPE[risk];
  const minHit = Math.max(1, Math.ceil(n * min));
  const w = Array.from({length: n + 1}, (_, h) => (h >= minHit ? Math.pow(growth, h - minHit) : 0));
  const ev = w.reduce((s, wh, h) => s + wh * pHits(n, h), 0);
  return w.map(wh => (wh ? Math.floor(((wh * HOUSE) / ev) * 100) / 100 : 0));
}

const TABLES: Record<Risk, number[][]> = {low: [], medium: [], high: []};
for (const r of ['low', 'medium', 'high'] as Risk[]) for (let n = 0; n <= MAX_PICKS; n++) TABLES[r][n] = n ? buildTable(n, r) : [];

export default function Keno() {
  const {betAmount} = useWallet();
  const [risk, setRisk] = useState<Risk>('medium');
  const [picks, setPicks] = useState<number[]>([]);
  const [drawn, setDrawn] = useState<number[]>([]);
  const [shown, setShown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [win, flashWin] = useFlash<WinInfo>();
  const settle = useSettler();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  const table = TABLES[risk][picks.length] ?? [];
  const visible = drawn.slice(0, shown);
  const hits = picks.filter(p => visible.includes(p)).length;

  const toggle = (n: number) => {
    if (busy) return;
    setDrawn([]);
    setShown(0);
    setPicks(p => (p.includes(n) ? p.filter(x => x !== n) : p.length >= MAX_PICKS ? p : [...p, n]));
  };

  const autoPick = () => {
    if (busy) return;
    setDrawn([]);
    setShown(0);
    setPicks(shuffle(Array.from({length: N}, (_, i) => i + 1)).slice(0, MAX_PICKS));
  };

  const bet = () => {
    if (busy || !picks.length) return;
    const stake = betAmount;
    if (!wallet.debit(stake)) return;
    const result = shuffle(Array.from({length: N}, (_, i) => i + 1)).slice(0, DRAWN);
    const h = picks.filter(p => result.includes(p)).length;
    const mult = table[h] ?? 0;
    const payout = money(stake * mult);
    setBusy(true);
    setDrawn(result);
    setShown(0);
    let i = 0;
    timer.current = setInterval(() => {
      i += 1;
      setShown(i);
      if (i >= DRAWN && timer.current) clearInterval(timer.current);
    }, REVEAL_MS);
    settle(() => {
      if (timer.current) clearInterval(timer.current);
      setShown(DRAWN);
      wallet.settle('keno', stake, payout);
      if (mult > 0) flashWin({mult, payout});
      setBusy(false);
    }, REVEAL_MS * DRAWN + 120);
  };

  return (
    <GameLayout
      title="Keno"
      sidebar={
        <>
          <BetAmount locked={busy} />
          <Segmented
            label="Risk"
            value={risk}
            onChange={setRisk}
            disabled={busy}
            options={[
              {value: 'low', label: 'Low'},
              {value: 'medium', label: 'Med', aria: 'Medium'},
              {value: 'high', label: 'High'},
            ]}
          />
          <div className="btn-row">
            <button type="button" className="ghost-btn" onClick={autoPick} disabled={busy} data-autofocus={picks.length ? undefined : ''}>
              <Shuffle size={14} /> Auto
            </button>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => {
                setPicks([]);
                setDrawn([]);
                setShown(0);
              }}
              disabled={busy || !picks.length}
            >
              <Undo size={14} /> Clear
            </button>
          </div>
          <div className="keno-count">
            <span>Picked</span>
            <b>
              {picks.length}/{MAX_PICKS}
            </b>
          </div>
          <PlayButton onClick={bet} disabled={busy || !picks.length} sub={picks.length ? `Top prize ${fmtMult(table[table.length - 1] ?? 0)}` : 'Pick 1–10 numbers'}>
            Bet
          </PlayButton>
        </>
      }
      stage={
        <div className="keno">
          <div className="keno-grid">
            {Array.from({length: N}, (_, i) => {
              const n = i + 1;
              const picked = picks.includes(n);
              const isDrawn = visible.includes(n);
              const cls = picked && isDrawn ? 'is-hit' : picked ? 'is-picked' : isDrawn ? 'is-drawn' : '';
              return (
                <button key={n} type="button" className={`keno-tile ${cls}`} onClick={() => toggle(n)} disabled={busy} aria-pressed={picked} aria-label={`Number ${n}${picked ? ', picked' : ''}`}>
                  {picked && isDrawn ? <GemIcon size={26} /> : n}
                </button>
              );
            })}
          </div>
          <div className="keno-pays" style={{gridTemplateColumns: `repeat(${Math.max(1, table.length)}, minmax(0, 1fr))`}}>
            {table.length === 0 && <span className="keno-hint">Select up to 10 numbers to see payouts</span>}
            {table.map((m, h) => (
              <div key={h} className={`keno-pay${drawn.length && shown >= DRAWN && hits === h ? ' is-on' : ''}`}>
                <b>{m ? (m >= 100 ? Math.round(m) : m.toFixed(m < 10 ? 2 : 1)) + '×' : '0×'}</b>
                <span>{h}</span>
              </div>
            ))}
          </div>
          <WinPopup win={win} />
        </div>
      }
    />
  );
}
