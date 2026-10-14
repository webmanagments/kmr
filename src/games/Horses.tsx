import {useEffect, useRef, useState} from 'react';
import {useFlash, useSettler} from '../lib/hooks';
import {fmtMult, money, rand, reducedMotion, weightedIndex} from '../lib/util';
import {fate} from '../lib/luck';
import {useWallet, wallet} from '../lib/wallet';
import {AutoRow, AutoSheet, useAutoBet} from '../ui/auto';
import {BetAmount, Field, PlayButton} from '../ui/controls';
import {GameLayout, WinPopup, type WinInfo} from '../ui/game';
import './games.css';
import './Horses.css';

const HORSES = [
  {name: 'Thunder', color: '#ff4d6d'},
  {name: 'Neon Comet', color: '#3dd6ff'},
  {name: 'Gold Rush', color: '#ffc531'},
  {name: 'Midnight', color: '#9d5cff'},
  {name: 'Lucky Star', color: '#00e701'},
  {name: 'Blue Blaze', color: '#3d8bff'},
];
const EDGE = 0.97; // 97% return on every horse
const RACE_MS = 4600;

/** Fresh field: random form → win probabilities → fixed odds. */
function newField() {
  const form = HORSES.map(() => 0.5 + rand() * 2.2);
  const total = form.reduce((s, f) => s + f, 0);
  const p = form.map(f => f / total);
  return {p, odds: p.map(x => Math.floor((EDGE / x) * 100) / 100)};
}

/** Finishing order sampled with the same probabilities (Plackett–Luce). */
function finishOrder(p: number[]): number[] {
  const left = p.map((_, i) => i);
  const order: number[] = [];
  while (left.length) {
    const k = weightedIndex(left.map(i => p[i]));
    order.push(left[k]);
    left.splice(k, 1);
  }
  return order;
}

function Horse({color, n}: {color: string; n: number}) {
  return (
    <svg viewBox="0 0 64 40" className="horse-svg" aria-hidden="true">
      <g className="horse-legs" stroke="#5c3a1e" strokeWidth="3.4" strokeLinecap="round">
        <path className="leg a" d="M20 24l-6 12" />
        <path className="leg b" d="M26 24l4 12" />
        <path className="leg a" d="M42 24l-4 12" />
        <path className="leg b" d="M47 23l7 11" />
      </g>
      <ellipse cx="34" cy="20" rx="17" ry="8.5" fill="#8b5a2b" />
      <path d="M47 16c3-6 7-10 12-10l3 4-5 3-4 8z" fill="#8b5a2b" />
      <path d="M58 6l2-4 2 4z" fill="#5c3a1e" />
      <path d="M17 17c-6-2-10 2-13 7 4-1 8-2 12-1z" fill="#3b2412" />
      <rect x="27" y="11" width="15" height="10" rx="2" fill={color} />
      <text x="34.5" y="19.5" textAnchor="middle" fontSize="8.5" fontWeight="900" fill="#0b1822" fontFamily="system-ui,Arial">
        {n}
      </text>
      <circle cx="36" cy="5" r="4" fill={color} />
      <path d="M33 9l3 4" stroke={color} strokeWidth="3" />
    </svg>
  );
}

export default function Horses() {
  const {betAmount} = useWallet();
  const [field, setField] = useState(newField);
  const [pick, setPick] = useState(0);
  const [race, setRace] = useState<{order: number[]; start: number} | null>(null);
  const [pos, setPos] = useState<number[]>(HORSES.map(() => 0));
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [win, flashWin] = useFlash<WinInfo>(2200);
  const settle = useSettler();
  const raf = useRef(0);
  const last = useRef(0);
  const wobble = useRef(HORSES.map(() => ({ph: rand() * 6, f: 2 + rand() * 2})));

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const run = () => {
    if (busy || race !== null) return;
    const stake = betAmount;
    if (!wallet.debit(stake)) return;
    const order = fate(() => finishOrder(field.p), o => (o[0] === pick ? 1 : 0));
    const won = order[0] === pick;
    const mult = field.odds[pick];
    const payout = won ? money(stake * mult) : 0;
    const dur = reducedMotion() ? 600 : RACE_MS;
    // Each horse's finish time follows its finishing place.
    const finishAt = HORSES.map((_, i) => dur * (0.86 + order.indexOf(i) * 0.03));
    wobble.current = HORSES.map(() => ({ph: rand() * 6, f: 1.5 + rand() * 2.5}));
    const start = performance.now();
    setRace({order, start});
    setDone(false);
    setBusy(true);
    const tick = (now: number) => {
      const t = now - start;
      if (now - last.current >= 33) {
        last.current = now;
        setPos(
          HORSES.map((_, i) => {
            const T = finishAt[i];
            const u = Math.min(1, t / T);
            const w = wobble.current[i];
            const noise = Math.sin(u * Math.PI * w.f + w.ph) * 0.045 * Math.sin(u * Math.PI);
            return Math.min(1, Math.max(0, u + noise));
          }),
        );
      }
      if (t < dur) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    settle(() => {
      cancelAnimationFrame(raf.current);
      setPos(HORSES.map(() => 1));
      setDone(true);
      setBusy(false);
      wallet.settle('horses', stake, payout);
      if (won) flashWin({mult, payout});
      settle(() => {
        setField(newField());
        setRace(null);
        setPos(HORSES.map(() => 0));
        setDone(false);
      }, 2600);
    }, dur + 120);
  };

  const place = (i: number) => (race && done ? race.order.indexOf(i) + 1 : null);
  const ready = !busy && race === null;
  const auto = useAutoBet({game: 'horses', idle: ready, trigger: run});

  return (
    <GameLayout
      title="Horse Racing"
      sidebar={
        <>
          <BetAmount locked={busy || auto.running} />
          <Field label="Pick a winner" aside="Odds">
            <div className="horse-list" role="radiogroup" aria-label="Horses">
              {HORSES.map((h, i) => (
                <button
                  key={h.name}
                  type="button"
                  role="radio"
                  aria-checked={pick === i}
                  className={`horse-opt${pick === i ? ' is-on' : ''}`}
                  onClick={() => setPick(i)}
                  disabled={busy}
                >
                  <span className="horse-num" style={{background: h.color}}>
                    {i + 1}
                  </span>
                  <span className="horse-name">{h.name}</span>
                  <b>{fmtMult(field.odds[i])}</b>
                </button>
              ))}
            </div>
          </Field>
          <AutoRow auto={auto}>
            <PlayButton onClick={run} disabled={!ready} sub={`Win ${fmtMult(field.odds[pick])}`}>
              {busy ? 'Racing…' : done ? 'Next race…' : 'Bet'}
            </PlayButton>
          </AutoRow>
          <AutoSheet auto={auto} note={`Backs ${HORSES[pick].name} (your current pick) in every race at that race's odds.`} />
        </>
      }
      stage={
        <div className="horses">
          <div className="track">
            <div className="track-finish" />
            {HORSES.map((h, i) => {
              const pl = place(i);
              return (
                <div key={h.name} className={`lane${pick === i ? ' is-pick' : ''}`}>
                  <span className="lane-n">{i + 1}</span>
                  <div className="lane-run">
                    <div className={`horse${busy ? ' is-running' : ''}`} style={{left: `calc(${pos[i] * 100}% - ${pos[i] * 70}px)`}}>
                      <Horse color={h.color} n={i + 1} />
                    </div>
                  </div>
                  {pl !== null && <span className={`lane-place p${pl}`}>{pl === 1 ? '1st' : pl === 2 ? '2nd' : pl === 3 ? '3rd' : `${pl}th`}</span>}
                </div>
              );
            })}
          </div>
          <div className="horse-status">
            {done && race ? (
              <span>
                <b style={{color: HORSES[race.order[0]].color}}>{HORSES[race.order[0]].name}</b> wins!
                {race.order[0] === pick ? ' Your pick came in.' : ` You backed ${HORSES[pick].name}.`}
              </span>
            ) : busy ? (
              'And they’re off!'
            ) : (
              `Odds pay ${(EDGE * 100).toFixed(0)}% on every horse · new odds each race`
            )}
          </div>
          <WinPopup win={win} />
        </div>
      }
    />
  );
}
