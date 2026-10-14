import {useEffect, useRef, useState} from 'react';
import {useFlash} from '../lib/hooks';
import {fmtMult, money, rand} from '../lib/util';
import {fate} from '../lib/luck';
import {useWallet, wallet} from '../lib/wallet';
import {AutoRow, AutoSheet, useAutoBet} from '../ui/auto';
import {BetAmount, ListStepper, PlayButton, Segmented} from '../ui/controls';
import {GameLayout, HistoryStrip, WinPopup, type WinInfo} from '../ui/game';
import {PLINKO, type Risk} from './plinkoTables';
import './games.css';
import './Plinko.css';

const ROWS = [8, 9, 10, 11, 12, 13, 14, 15, 16] as const;
const STEP_MS = 95;
const MAX_BALLS = 12;

interface Ball {
  id: number;
  path: number[]; // 0 = left, 1 = right, per row
  start: number;
  stake: number;
  mult: number;
  bin: number;
  done: boolean;
}

function binColor(i: number, n: number): string {
  // Stake-style: centre amber → edge red.
  const d = Math.abs(i - n / 2) / (n / 2);
  const r = 255;
  const g = Math.round(192 - d * 192);
  const b = Math.round(d * 63);
  return `rgb(${r},${g},${b})`;
}

export default function Plinko() {
  const {betAmount} = useWallet();
  const [rows, setRows] = useState<number>(12);
  const [risk, setRisk] = useState<Risk>('medium');
  const [hits, setHits] = useState<{key: number; bin: number}[]>([]);
  const [hist, setHist] = useState<{key: number; label: string; win: boolean}[]>([]);
  const [active, setActive] = useState(0);
  const [win, flashWin] = useFlash<WinInfo>(1400);
  const canvas = useRef<HTMLCanvasElement>(null);
  const balls = useRef<Ball[]>([]);
  const raf = useRef(0);
  const lastPaint = useRef(0);
  const geo = useRef({rows, w: 360, h: 420});
  geo.current.rows = rows;
  const mults = PLINKO[rows][risk];

  const land = (b: Ball) => {
    if (b.done) return;
    b.done = true;
    const payout = money(b.stake * b.mult);
    wallet.settle('plinko', b.stake, payout);
    if (b.mult >= 2) flashWin({mult: b.mult, payout});
    const key = b.id;
    setHits(h => [...h, {key, bin: b.bin}]);
    setTimeout(() => setHits(h => h.filter(x => x.key !== key)), 380);
    setHist(h => [{key, label: fmtMult(b.mult), win: b.mult >= 1}, ...h].slice(0, 8));
  };

  const draw = (now: number) => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const {w, h} = geo.current;
    const n = balls.current.length ? balls.current[0].path.length : geo.current.rows;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const R = geo.current.rows;
    const sx = (w - 8) / (R + 1); // last row of pegs spans the bins below
    const top = 18;
    const sy = (h - top - 6) / R;
    const pegR = Math.max(2.4, 4.6 - R * 0.14);
    ctx.fillStyle = '#ffffff';
    for (let r = 0; r < R; r++) {
      const count = r + 3;
      const x0 = w / 2 - ((count - 1) * sx) / 2;
      for (let i = 0; i < count; i++) {
        ctx.beginPath();
        ctx.arc(x0 + i * sx, top + r * sy, pegR, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    void n;
    const ballR = Math.max(4.5, sx * 0.26);
    for (const b of balls.current) {
      if (b.path.length !== R) continue;
      const t = (now - b.start) / STEP_MS;
      const step = Math.min(R, Math.floor(t));
      const frac = Math.min(1, t - step);
      let rights = 0;
      for (let i = 0; i < step; i++) rights += b.path[i];
      const xAt = (lvl: number, rgt: number) => w / 2 + (rgt - lvl / 2) * sx;
      let x: number;
      let y: number;
      if (step >= R) {
        x = xAt(R, rights);
        y = top + R * sy - sy * 0.35;
      } else {
        const nx = xAt(step + 1, rights + b.path[step]);
        const cx = xAt(step, rights);
        const e = frac;
        x = cx + (nx - cx) * e;
        // Little hop off each peg.
        y = top + (step - 1) * sy + sy * e - Math.sin(e * Math.PI) * sy * 0.35 + sy * 0.55;
      }
      ctx.beginPath();
      ctx.fillStyle = '#ff2f6d';
      ctx.arc(x, y, ballR, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.fillStyle = 'rgba(255,255,255,.7)';
      ctx.arc(x - ballR * 0.3, y - ballR * 0.3, ballR * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const loop = (now: number) => {
    let alive = false;
    for (const b of balls.current) {
      const t = (now - b.start) / STEP_MS;
      if (t >= b.path.length + 0.4) land(b);
      else alive = true;
    }
    balls.current = balls.current.filter(b => !b.done);
    if (now - lastPaint.current >= 30 || !alive) {
      lastPaint.current = now;
      draw(now);
      setActive(balls.current.length);
    }
    if (alive) raf.current = requestAnimationFrame(loop);
  };

  // Size the canvas to its box once, and redraw pegs when rows change.
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const box = c.parentElement!.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    geo.current.w = box.width;
    geo.current.h = box.height;
    c.width = Math.round(box.width * dpr);
    c.height = Math.round(box.height * dpr);
    c.style.width = `${box.width}px`;
    c.style.height = `${box.height}px`;
    draw(performance.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  // Balls still falling when the screen closes are paid out immediately.
  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current);
      for (const b of balls.current) land(b);
      balls.current = [];
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const drop = () => {
    if (balls.current.length >= MAX_BALLS) return;
    const stake = betAmount;
    if (!wallet.debit(stake)) return;
    const path = fate(
      () => Array.from({length: rows}, () => (rand() < 0.5 ? 0 : 1)),
      pth => mults[pth.reduce<number>((s, v) => s + v, 0)],
    );
    const bin = path.reduce<number>((s, v) => s + v, 0);
    const b: Ball = {id: performance.now() + Math.random(), path, start: performance.now(), stake, mult: mults[bin], bin, done: false};
    const wasIdle = balls.current.length === 0;
    balls.current.push(b);
    setActive(balls.current.length);
    if (wasIdle) raf.current = requestAnimationFrame(loop);
  };

  const busy = active > 0;
  const auto = useAutoBet({game: 'plinko', idle: !busy, trigger: drop, delay: 200});

  return (
    <GameLayout
      title="Plinko"
      sidebar={
        <>
          <BetAmount locked={auto.running} />
          <Segmented
            label="Risk"
            value={risk}
            onChange={setRisk}
            disabled={busy || auto.running}
            options={[
              {value: 'low', label: 'Low'},
              {value: 'medium', label: 'Med', aria: 'Medium'},
              {value: 'high', label: 'High'},
            ]}
          />
          <ListStepper label="Rows" values={ROWS} value={rows} onChange={setRows} disabled={busy || auto.running} />
          <div className="plinko-max">
            <span>Top prize</span>
            <b>{fmtMult(mults[0])}</b>
          </div>
          <AutoRow auto={auto}>
            <PlayButton onClick={drop} disabled={active >= MAX_BALLS} sub={busy ? `${active} in play` : undefined}>
              Drop Ball
            </PlayButton>
          </AutoRow>
          <AutoSheet auto={auto} />
        </>
      }
      stage={
        <div className="plinko">
          <HistoryStrip items={hist} />
          <div className="plinko-board">
            <canvas ref={canvas} aria-label={`Plinko board with ${rows} rows`} role="img" />
          </div>
          <div className="plinko-bins" style={{gridTemplateColumns: `repeat(${mults.length}, minmax(0, 1fr))`}}>
            {mults.map((m, i) => (
              <span
                key={`${rows}-${risk}-${i}`}
                className={`plinko-bin${hits.some(h => h.bin === i) ? ' is-hit' : ''}`}
                style={{background: binColor(i, mults.length - 1)}}
              >
                {m >= 100 ? Math.round(m) : m}
                {m < 100 && '×'}
              </span>
            ))}
          </div>
          <WinPopup win={win} />
        </div>
      }
    />
  );
}
