import {useEffect, useRef, useState} from 'react';
import {useFlash, useSettler} from '../lib/hooks';
import {sfx} from '../lib/sfx';
import {HOUSE, fmtMult, money, rand, reducedMotion} from '../lib/util';
import {wallet} from '../lib/wallet';
import {AutoRow, AutoSheet, useAutoBet} from '../ui/auto';
import {BetAmount, ListStepper, PlayButton, ProfitOnWin, Readout, Segmented} from '../ui/controls';
import {GameLayout, HistoryStrip, WinPopup, type WinInfo} from '../ui/game';
import './games.css';
import './Drill.css';

// Three rigs drill at once. Each one stops at a random depth with the same odds as
// Limbo: it reaches a multiplier x with probability 99% / x. Pick your rig and a target;
// if your rig drills past the target you win target × bet.
const TARGETS = [1.2, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10, 15, 25, 50, 100, 250, 1000] as const;
const RIGS = [
  {name: 'Red', color: '#ff4d6d'},
  {name: 'Gold', color: '#ffc531'},
  {name: 'Blue', color: '#38bdf8'},
] as const;
const LAYERS = [
  {at: 1, name: 'Soil', cls: 'soil'},
  {at: 1.6, name: 'Clay', cls: 'clay'},
  {at: 3, name: 'Rock', cls: 'rock'},
  {at: 8, name: 'Crystal', cls: 'crystal'},
  {at: 40, name: 'Magma', cls: 'magma'},
  {at: 300, name: 'Gold core', cls: 'core'},
];

const depthRoll = () => Math.min(1_000_000, Math.max(1, Math.floor((HOUSE / (1 - rand())) * 100) / 100));

interface Run {
  key: number;
  stake: number;
  target: number;
  mine: number;
  results: number[];
  t0: number;
}

export default function Drill() {
  const [target, setTarget] = useState(2);
  const [mine, setMine] = useState(1);
  const [run, setRun] = useState<Run | null>(null);
  const [depths, setDepths] = useState([1, 1, 1]);
  const [done, setDone] = useState(true);
  const [outcome, setOutcome] = useState<'win' | 'lose' | null>(null);
  const [hist, setHist] = useState<{key: number; label: string; win: boolean}[]>([]);
  const [win, flashWin] = useFlash<WinInfo>();
  const settle = useSettler();
  const raf = useRef(0);
  const stopped = useRef([false, false, false]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  // Visible depth range: a little past the target so the drama happens on screen.
  const scaleMax = Math.max(6, (run?.target ?? target) * 2.4);
  const yOf = (m: number) => Math.min(1, Math.log(Math.max(1, m)) / Math.log(scaleMax));

  const drill = () => {
    if (!done) return;
    const stake = wallet.get().betAmount;
    if (!wallet.debit(stake)) return;
    const results = [depthRoll(), depthRoll(), depthRoll()];
    const r: Run = {key: Date.now(), stake, target, mine, results, t0: performance.now()};
    const myDepth = results[mine];
    const won = myDepth >= target;
    const payout = won ? money(stake * target) : 0;
    setRun(r);
    setDone(false);
    setOutcome(null);
    stopped.current = [false, false, false];
    sfx('dig');

    // Depth grows exponentially: the visible range takes ~2.2 s at full speed.
    const span = reducedMotion() ? 0.35 : 2.2;
    const max = Math.max(6, target * 2.4);
    const k = Math.log(max) / span;
    const timeTo = (m: number) => Math.log(Math.max(1, m)) / k;
    const myTime = won ? timeTo(target) : timeTo(Math.min(myDepth, max));
    const endTime = Math.max(...results.map(v => timeTo(Math.min(v, max)))) + 0.15;

    // Result lands the moment your rig passes the target (or stops short of it).
    settle(() => {
      wallet.settle('drill', stake, payout);
      setOutcome(won ? 'win' : 'lose');
      setHist(h => [{key: r.key, label: fmtMult(myDepth), win: won}, ...h].slice(0, 8));
      if (won) flashWin({mult: target, payout});
    }, myTime * 1000 + 30);
    settle(() => setDone(true), endTime * 1000);

    let lastDig = 0;
    const tick = (now: number) => {
      const t = (now - r.t0) / 1000;
      const m = Math.exp(k * t);
      const next = results.map(v => Math.min(v, m));
      results.forEach((v, i) => {
        if (!stopped.current[i] && m >= v && v < max) {
          stopped.current[i] = true;
          sfx(i === mine ? 'hit' : 'tick');
        }
      });
      if (now - lastDig > 160 && m < max) {
        lastDig = now;
        sfx('dig');
      }
      setDepths(next);
      if (t < endTime) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };

  const auto = useAutoBet({game: 'drill', idle: done, trigger: drill, delay: 600});
  const t = run?.target ?? target;
  const myNow = depths[run?.mine ?? mine];
  const passed = !!run && myNow >= t;

  return (
    <GameLayout
      title="Drill"
      sidebar={
        <>
          <BetAmount locked={!done || auto.running} />
          <ListStepper label="Target" values={TARGETS} value={target} onChange={setTarget} render={v => fmtMult(v)} disabled={!done || auto.running} />
          <Segmented
            label="Your rig"
            value={mine}
            onChange={setMine}
            disabled={!done || auto.running}
            options={RIGS.map((r, i) => ({value: i, label: r.name}))}
          />
          <Readout label="Win chance" value={`${((HOUSE / target) * 100).toFixed(2)}%`} />
          <ProfitOnWin mult={target} />
          <AutoRow auto={auto}>
            <PlayButton onClick={drill} disabled={!done} sub={`Pays ${fmtMult(target)}`}>
              {done ? 'Drill' : 'Drilling…'}
            </PlayButton>
          </AutoRow>
          <AutoSheet auto={auto} />
        </>
      }
      stage={
        <div className="drl">
          <HistoryStrip items={hist} />
          <div className={`drl-field${outcome ? ` is-${outcome}` : ''}`}>
            <div className="drl-sky">
              {RIGS.map((rig, i) => (
                <div key={i} className={`drl-rig${(run?.mine ?? mine) === i ? ' is-mine' : ''}${!done && depths[i] < (run?.results[i] ?? 0) ? ' is-on' : ''}`}>
                  <svg viewBox="0 0 60 56" width="54" height="50" aria-hidden="true">
                    <path d="M14 54L28 4h4l14 50" fill="none" stroke={rig.color} strokeWidth="4" strokeLinejoin="round" />
                    <path d="M19 38h22M23 24h14M26 12h8" stroke={rig.color} strokeWidth="3" />
                    <rect x="6" y="50" width="48" height="6" rx="2" fill="#3a4a56" />
                    <circle cx="30" cy="4" r="3.5" fill="#fff6c8" className="drl-beacon" />
                  </svg>
                  {(run?.mine ?? mine) === i && <span className="drl-you">You</span>}
                </div>
              ))}
            </div>
            <div className="drl-ground">
              {LAYERS.map((l, i) => {
                const top = yOf(l.at) * 100;
                const next = LAYERS[i + 1] ? yOf(LAYERS[i + 1].at) * 100 : 100;
                if (top >= 100) return null;
                return (
                  <div key={l.cls} className={`drl-layer is-${l.cls}`} style={{top: `${top}%`, height: `${next - top}%`}}>
                    {next - top > 8 && <span>{l.name}</span>}
                  </div>
                );
              })}
              <div className={`drl-target${passed ? ' is-passed' : ''}`} style={{top: `${yOf(t) * 100}%`}}>
                <span>Target {fmtMult(t)}</span>
              </div>
              {RIGS.map((rig, i) => {
                const d = depths[i];
                // Rigs that drill past the visible range park at the bottom edge with their final depth.
                const y = Math.min(yOf(d), 0.86) * 100;
                const final = done && run;
                const moving = !done && !!run && d < run.results[i] && d < scaleMax;
                const isMine = (run?.mine ?? mine) === i;
                const ok = d >= t;
                return (
                  <div key={i} className={`drl-shaft${isMine ? ' is-mine' : ''}`} style={{left: `${16.6 + i * 33.3}%`}}>
                    <div className="drl-hole" style={{height: `${y}%`}} />
                    <div className={`drl-bit${moving ? ' is-spinning' : ''}${run && !moving ? ' is-stopped' : ''}`} style={{top: `${y}%`, color: rig.color}}>
                      <svg viewBox="0 0 30 40" width="26" height="34" aria-hidden="true">
                        <rect x="9" y="0" width="12" height="10" rx="2" fill="currentColor" />
                        <path d="M4 10h22L15 40z" fill="#c5cfd8" />
                        <path className="drl-thread" d="M5 14l20 3M7 20l16 3M9 26l12 3M11 32l8 2" stroke="#6f8290" strokeWidth="2.2" />
                      </svg>
                      {moving && <i className="drl-dust" />}
                      {run && (
                        <b className={final || !moving ? (ok ? 'is-ok' : 'is-short') : ''}>
                          {fmtMult(d >= scaleMax && moving ? d : run && !moving ? run.results[i] : d)}
                        </b>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className={`drl-status${outcome ? ` is-${outcome}` : ''}`}>
            {!run && 'Pick a rig and a target. Your rig must drill past the target line.'}
            {run && !outcome && 'Drilling…'}
            {run && outcome === 'win' && `${RIGS[run.mine].name} rig struck ${fmtMult(run.results[run.mine])} — you win ${fmtMult(run.target)}!`}
            {run && outcome === 'lose' && `${RIGS[run.mine].name} rig stopped at ${fmtMult(run.results[run.mine])} — short of ${fmtMult(run.target)}`}
          </div>
          <WinPopup win={win} />
        </div>
      }
    />
  );
}
