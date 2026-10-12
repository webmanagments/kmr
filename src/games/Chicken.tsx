import {useEffect, useRef, useState} from 'react';
import {useFlash, usePersistent, useSettler} from '../lib/hooks';
import {sfx} from '../lib/sfx';
import {focusDefault} from '../lib/spatial';
import {HOUSE, fmtCoins, fmtMult, money, rand} from '../lib/util';
import {wallet} from '../lib/wallet';
import {AutoRow, AutoSheet, useAutoBet} from '../ui/auto';
import {BetAmount, ListStepper, PlayButton, Readout, Segmented} from '../ui/controls';
import {GameLayout, WinPopup, type WinInfo} from '../ui/game';
import {Coin} from '../ui/icons';
import './games.css';
import './Chicken.css';

type Diff = 'easy' | 'medium' | 'hard' | 'expert';
// Chance a lane has traffic that hits you. Multiplier after k lanes = 99% / survive^k.
const RISK: Record<Diff, number> = {easy: 1 / 25, medium: 3 / 25, hard: 5 / 25, expert: 10 / 25};
const LANES = 20;
const HOP_MS = 360;
const LANE_W = 78;

export const chickenMult = (d: Diff, k: number) => (k === 0 ? 1 : Math.floor((HOUSE / Math.pow(1 - RISK[d], k)) * 100) / 100);

interface Round {
  phase: 'idle' | 'playing' | 'over';
  diff: Diff;
  stake: number;
  hops: number;
  hitLane: number; // lane (1-based) where traffic hits; 0 = never
  cashed: boolean;
}

// ---- Art ----------------------------------------------------------------------
function ChickenSprite({state}: {state: 'idle' | 'hop' | 'dead' | 'win'}) {
  if (state === 'dead')
    return (
      <svg viewBox="0 0 60 60" width="58" height="58" aria-hidden="true" className="chk-sprite is-dead">
        <ellipse cx="30" cy="38" rx="24" ry="9" fill="#f3f6f9" />
        <ellipse cx="30" cy="38" rx="24" ry="9" fill="none" stroke="#c9d4de" strokeWidth="1.5" />
        <path d="M8 36l-6-3M10 41l-7 2M52 36l6-3M50 41l7 2" stroke="#ff9f1c" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M38 30c2-5 7-5 8-1 2-4 6-2 5 2" fill="#ff4d6d" />
        <path d="M33 36l4 4M37 36l-4 4M41 36l4 4M45 36l-4 4" stroke="#0b1822" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M49 39l7 1-7 2z" fill="#ff9f1c" />
      </svg>
    );
  return (
    <svg viewBox="0 0 60 60" width="58" height="58" aria-hidden="true" className={`chk-sprite is-${state}`}>
      <ellipse className="chk-shadow" cx="28" cy="55" rx="15" ry="3.5" fill="rgba(0,0,0,.35)" />
      <g className="chk-body">
        {/* legs */}
        <path d="M23 44l-2 9M33 44l2 9" stroke="#ff9f1c" strokeWidth="3" strokeLinecap="round" />
        <path d="M18 53h6M32 53h6" stroke="#ff9f1c" strokeWidth="2.5" strokeLinecap="round" />
        {/* tail */}
        <path d="M11 30c-6-4-7-12-2-14 0 5 4 7 7 8z" fill="#e3e9ef" />
        {/* body */}
        <ellipse cx="27" cy="34" rx="16" ry="13" fill="#ffffff" />
        <path d="M14 38c4 6 18 8 26 2" stroke="#d7dfe7" strokeWidth="2" fill="none" />
        {/* wing */}
        <path className="chk-wing" d="M18 31c5-3 13-2 14 4-3 5-11 6-15 2z" fill="#eef2f6" stroke="#c9d4de" strokeWidth="1.2" />
        {/* head */}
        <circle cx="38" cy="19" r="9.5" fill="#ffffff" />
        <path d="M33 11c1-5 5-5 6-1 1-4 6-3 5 1 2-2 5 0 3 3" fill="#ff3b55" />
        <path d="M46 19l8 2.5-8 2.5z" fill="#ffb020" />
        <path d="M44 25c2 2 2 5-1 6-2-1-2-4 1-6z" fill="#ff3b55" />
        <g className="chk-eye">
          <circle cx="41" cy="17.5" r="2.4" fill="#0b1822" />
          <circle cx="41.8" cy="16.7" r=".8" fill="#fff" />
        </g>
        <circle cx="37" cy="22" r="2" fill="#ffb3c1" opacity=".7" />
      </g>
    </svg>
  );
}

const CARS = [
  {body: '#ff4d6d', roof: '#d6334f', kind: 'sedan'},
  {body: '#ffc531', roof: '#e0a400', kind: 'taxi'},
  {body: '#3d8bff', roof: '#2a6ad1', kind: 'sedan'},
  {body: '#e9eef3', roof: '#c5cfd8', kind: 'truck'},
  {body: '#9d5cff', roof: '#7b3fe0', kind: 'sport'},
  {body: '#2fd18a', roof: '#1fa56b', kind: 'sedan'},
] as const;

function Car({i}: {i: number}) {
  const c = CARS[i % CARS.length];
  const truck = c.kind === 'truck';
  const h = truck ? 92 : 66;
  return (
    <svg viewBox={`0 0 44 ${h + 40}`} width="44" height={h + 40} aria-hidden="true" className="chk-carsvg">
      {/* headlight beams (the car drives down the screen) */}
      <path d={`M8 ${h - 4}L-6 ${h + 40}H18z`} fill="url(#beam)" opacity=".55" />
      <path d={`M36 ${h - 4}L26 ${h + 40}H50z`} fill="url(#beam)" opacity=".55" />
      <defs>
        <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff6c8" />
          <stop offset="1" stopColor="#fff6c8" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="5" y="4" width="34" height={h - 6} rx="9" fill="rgba(0,0,0,.35)" transform="translate(2 3)" />
      {truck ? (
        <>
          <rect x="5" y="2" width="34" height="58" rx="4" fill={c.body} />
          <path d="M9 8h26M9 18h26M9 28h26M9 38h26M9 48h26" stroke="#c5cfd8" strokeWidth="1.5" />
          <rect x="6" y="62" width="32" height="26" rx="7" fill="#ff9f1c" />
          <rect x="10" y="74" width="24" height="9" rx="2.5" fill="#0b1822" opacity=".8" />
        </>
      ) : (
        <>
          <rect x="5" y="2" width="34" height={h - 4} rx="10" fill={c.body} />
          {c.kind === 'sport' && <path d={`M19 2v${h - 4}M25 2v${h - 4}`} stroke="#fff" strokeWidth="2.2" opacity=".8" />}
          <rect x="9" y="12" width="26" height="9" rx="3" fill="#0b1822" opacity=".75" />
          <rect x="8" y="22" width="28" height="22" rx="4" fill={c.roof} />
          <rect x="9" y={h - 22} width="26" height="11" rx="3" fill="#0b1822" opacity=".8" />
          {c.kind === 'taxi' && <rect x="15" y="28" width="14" height="7" rx="2" fill="#fff" />}
          <rect x="2" y={h - 26} width="4" height="5" rx="1.5" fill={c.roof} />
          <rect x="38" y={h - 26} width="4" height="5" rx="1.5" fill={c.roof} />
        </>
      )}
      <rect x="7" y={h - 7} width="9" height="4" rx="1.5" fill="#fff6c8" />
      <rect x="28" y={h - 7} width="9" height="4" rx="1.5" fill="#fff6c8" />
      <rect className="chk-brake" x="7" y="2" width="9" height="3" rx="1.5" fill="#ff3b55" />
      <rect className="chk-brake" x="28" y="2" width="9" height="3" rx="1.5" fill="#ff3b55" />
    </svg>
  );
}

function Manhole({label, state}: {label: string | null; state: 'next' | 'crossed' | 'ahead' | 'here'}) {
  return (
    <div className={`chk-cover is-${state}`}>
      <svg viewBox="0 0 64 64" width="62" height="62" aria-hidden="true">
        <circle cx="32" cy="32" r="30" fill="#2b3640" />
        <circle cx="32" cy="32" r="27" className="chk-cover-fill" />
        <circle cx="32" cy="32" r="21" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="2" />
        <path d="M14 26h36M12 32h40M14 38h36M26 14v36M32 12v40M38 14v36" stroke="rgba(0,0,0,.18)" strokeWidth="1.2" />
      </svg>
      {label && <span>{label}</span>}
    </div>
  );
}

function Barrier() {
  return (
    <svg className="chk-barrier" viewBox="0 0 70 26" width="70" height="26" aria-hidden="true">
      <rect x="3" y="6" width="5" height="20" rx="1.5" fill="#c5cfd8" />
      <rect x="62" y="6" width="5" height="20" rx="1.5" fill="#c5cfd8" />
      <rect x="0" y="3" width="70" height="10" rx="3" fill="#ffc531" />
      <path d="M8 3l-8 10M22 3l-8 10M36 3l-8 10M50 3l-8 10M64 3l-8 10" stroke="#0b1822" strokeWidth="5" />
      <circle cx="5" cy="3" r="3" fill="#ff3b55" className="chk-blink" />
      <circle cx="65" cy="3" r="3" fill="#ff3b55" className="chk-blink" />
    </svg>
  );
}

function Feathers() {
  return (
    <div className="chk-feathers" aria-hidden="true">
      {Array.from({length: 12}, (_, i) => (
        <i key={i} style={{'--a': `${i * 30 + (i % 3) * 7}deg`, '--d': `${40 + (i % 4) * 14}px`, '--r': `${(i % 2 ? 1 : -1) * (120 + i * 20)}deg`} as React.CSSProperties} />
      ))}
    </div>
  );
}

export default function Chicken() {
  const [round, setRound] = usePersistent<Round>('chicken', {phase: 'idle', diff: 'medium', stake: 0, hops: 0, hitLane: 0, cashed: false});
  const [hopping, setHopping] = useState(false);
  const [brakeLane, setBrakeLane] = useState(0);
  const [pop, setPop] = useState<{key: number; text: string} | null>(null);
  const [autoHops, setAutoHops] = useState(4);
  const [win, flashWin] = useFlash<WinInfo>();
  const settle = useSettler();
  const playing = round.phase === 'playing';
  const mult = chickenMult(round.diff, round.hops);
  const dead = round.phase === 'over' && !round.cashed;

  const prevPhase = useRef(round.phase);
  useEffect(() => {
    if (prevPhase.current === round.phase) return;
    prevPhase.current = round.phase;
    requestAnimationFrame(() => focusDefault());
  }, [round.phase]);

  const start = () => {
    if (playing) return;
    const stake = wallet.get().betAmount;
    if (!wallet.debit(stake)) return;
    // Decide now which lane (if any) gets you, so leaving mid-round can't change it.
    let hitLane = 0;
    for (let i = 1; i <= LANES; i++)
      if (rand() < RISK[round.diff]) {
        hitLane = i;
        break;
      }
    setBrakeLane(0);
    setPop(null);
    setRound({phase: 'playing', diff: round.diff, stake, hops: 0, hitLane, cashed: false});
  };

  const cashout = (r: Round = round) => {
    if (r.phase !== 'playing' || r.hops === 0) return;
    const m = chickenMult(r.diff, r.hops);
    const payout = money(r.stake * m);
    wallet.settle('chicken', r.stake, payout);
    sfx('cash');
    flashWin({mult: m, payout});
    setRound({...r, phase: 'over', cashed: true});
  };

  const hop = () => {
    if (!playing || hopping) return;
    const next = round.hops + 1;
    setHopping(true);
    sfx('hop');
    if (round.hitLane === next) {
      // Settle immediately (so leaving can't dodge it), then show the hit.
      wallet.settle('chicken', round.stake, 0);
      setRound({...round, hops: next, phase: 'over'});
      settle(() => sfx('hit'), HOP_MS + 60);
      settle(() => setHopping(false), HOP_MS + 380);
      return;
    }
    const r = {...round, hops: next};
    setRound(r);
    setBrakeLane(next);
    settle(() => {
      sfx('horn');
      setPop({key: Date.now(), text: fmtMult(chickenMult(r.diff, next))});
    }, HOP_MS - 80);
    settle(() => {
      setHopping(false);
      if (next === LANES) cashout(r);
    }, HOP_MS);
  };

  const auto = useAutoBet({game: 'chicken', idle: !playing && !hopping, trigger: start});

  // Auto: hop until the chosen lane, then cash out.
  useEffect(() => {
    if (!auto.running || !playing || hopping) return;
    const t = setTimeout(() => (round.hops >= autoHops ? cashout() : hop()), auto.stepDelay + 80);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto.running, playing, hopping, round.hops]);

  // Camera: keep the chicken ~1.5 lanes from the left edge.
  const camX = Math.max(0, round.hops - 1) * LANE_W;
  const heroState = dead && !hopping ? 'dead' : hopping ? 'hop' : round.cashed ? 'win' : 'idle';

  return (
    <GameLayout
      title="Chicken"
      sidebar={
        <>
          <BetAmount locked={playing || auto.running} />
          <Segmented
            label="Difficulty"
            value={round.diff}
            onChange={d => setRound({phase: 'idle', diff: d, stake: 0, hops: 0, hitLane: 0, cashed: false})}
            disabled={playing || auto.running}
            options={[
              {value: 'easy', label: 'Easy'},
              {value: 'medium', label: 'Med', aria: 'Medium'},
              {value: 'hard', label: 'Hard'},
              {value: 'expert', label: 'Exp', aria: 'Expert'},
            ]}
          />
          <Readout
            label={`Total Profit (${fmtMult(playing ? mult : 1)})`}
            tone={playing && round.hops ? 'green' : undefined}
            value={
              <>
                <Coin size={14} />
                {fmtCoins(playing ? round.stake * mult - round.stake : 0)}
              </>
            }
          />
          <AutoRow auto={auto}>
            {playing ? (
              <PlayButton onClick={hop} disabled={hopping} sub={`Next ${fmtMult(chickenMult(round.diff, round.hops + 1))}`}>
                Go
              </PlayButton>
            ) : (
              <PlayButton onClick={start} sub={`Top ${fmtMult(chickenMult(round.diff, LANES))}`}>
                Bet
              </PlayButton>
            )}
          </AutoRow>
          {playing && !auto.running && (
            <button type="button" className="ghost-btn chk-cash" onClick={() => cashout()} disabled={round.hops === 0 || hopping}>
              Cashout {round.hops ? fmtCoins(round.stake * mult) : ''}
            </button>
          )}
          <AutoSheet auto={auto}>
            <ListStepper label="Cash out after" values={Array.from({length: LANES}, (_, i) => i + 1)} value={autoHops} onChange={setAutoHops} render={v => `${v} lane${v > 1 ? 's' : ''} · ${fmtMult(chickenMult(round.diff, v))}`} />
          </AutoSheet>
        </>
      }
      stage={
        <div className="chk">
          <div className={`chk-road${dead && !hopping ? ' is-shake' : ''}`}>
            <div className="chk-world" style={{transform: `translateX(${-camX}px)`}}>
              <div className="chk-curb">
                <i className="chk-bush" style={{top: '12%'}} />
                <i className="chk-bush" style={{top: '74%'}} />
              </div>
              {Array.from({length: LANES}, (_, i) => {
                const lane = i + 1;
                const crossed = lane <= round.hops && !(dead && lane === round.hops);
                const isHit = dead && lane === round.hops;
                const ahead = lane > round.hops;
                // Only animate traffic near the camera.
                const near = lane >= round.hops - 1 && lane <= round.hops + 5;
                const state = lane === round.hops && !dead ? 'here' : crossed ? 'crossed' : lane === round.hops + 1 && playing ? 'next' : 'ahead';
                return (
                  <div key={lane} className={`chk-lane is-${state}${isHit ? ' is-hit' : ''}`}>
                    <Manhole label={lane === round.hops && !dead ? null : fmtMult(chickenMult(round.diff, lane))} state={isHit ? 'ahead' : state} />
                    {crossed && <Barrier />}
                    {crossed && brakeLane === lane && near && (
                      <div className="chk-car is-braked">
                        <Car i={i} />
                      </div>
                    )}
                    {ahead && near && (
                      <div className="chk-car is-moving" style={{animationDuration: `${1.3 + ((i * 7) % 5) * 0.28}s`, animationDelay: `${-((i * 0.53) % 2)}s`}}>
                        <Car i={i} />
                      </div>
                    )}
                    {isHit && (
                      <div className="chk-car is-hit">
                        <Car i={i} />
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="chk-goal">
                <svg viewBox="0 0 60 120" width="56" height="112" aria-hidden="true">
                  <path d="M10 112V10" stroke="#e9eef3" strokeWidth="4" strokeLinecap="round" />
                  <path className="chk-flag" d="M12 12h36l-8 10 8 10H12z" fill="#00e701" />
                  <ellipse cx="34" cy="96" rx="13" ry="16" fill="url(#egg)" />
                  <defs>
                    <radialGradient id="egg" cx=".35" cy=".3" r=".8">
                      <stop offset="0" stopColor="#fff6c8" />
                      <stop offset=".5" stopColor="#ffc531" />
                      <stop offset="1" stopColor="#c27c00" />
                    </radialGradient>
                  </defs>
                </svg>
                <span>{fmtMult(chickenMult(round.diff, LANES))}</span>
              </div>
              <div className={`chk-hero is-${heroState}`} style={{transform: `translateX(${round.hops * LANE_W}px)`}}>
                <ChickenSprite state={heroState} />
                {dead && !hopping && <Feathers />}
                {pop && !dead && (
                  <span className="chk-pop" key={pop.key}>
                    {pop.text}
                  </span>
                )}
              </div>
            </div>
            <div className="chk-hud">
              <span>
                Lane <b>{round.hops}</b>/{LANES}
              </span>
              <span className={dead && !hopping ? 'tone-red' : (playing || round.cashed) && round.hops ? 'tone-green' : ''}>
                {dead && !hopping ? 'Hit · 0.00×' : fmtMult(round.phase === 'idle' ? 1 : dead ? chickenMult(round.diff, round.hops - 1) : mult)}
              </span>
            </div>
          </div>
          <div className={`chk-status${dead ? ' is-lose' : round.cashed ? ' is-win' : ''}`}>
            {round.phase === 'idle' && 'Cross the road lane by lane. Cash out before traffic gets you.'}
            {playing && (round.hops ? `Safe! Next lane pays ${fmtMult(chickenMult(round.diff, round.hops + 1))}` : 'Press Go to hop into the first lane')}
            {round.phase === 'over' && (round.cashed ? `Cashed out at ${fmtMult(mult)}` : hopping ? 'Hopping…' : `Splat! Hit in lane ${round.hops}`)}
          </div>
          <WinPopup win={win} />
        </div>
      }
    />
  );
}
