import {useEffect, useRef, useState} from 'react';
import {useFlash, usePersistent, useSettler} from '../lib/hooks';
import {sfx} from '../lib/sfx';
import {focusDefault, focusEl} from '../lib/spatial';
import {HOUSE, fmtCoins, fmtMult, money, randInt, reducedMotion} from '../lib/util';
import {fate} from '../lib/luck';
import {wallet} from '../lib/wallet';
import {AutoRow, AutoSheet, useAutoBet} from '../ui/auto';
import {BetAmount, ListStepper, PlayButton, Readout, Segmented} from '../ui/controls';
import {GameLayout, WinPopup, type WinInfo} from '../ui/game';
import {Coin} from '../ui/icons';
import './games.css';
import './Penalty.css';

// Six target zones (2 rows × 3 columns). The keeper covers:
//   Rookie: 1 random zone      → you score 5/6 of the time
//   Pro:    a whole column     → 2/3
//   Legend: a whole row        → 1/2
// Every keeper choice is equally likely, so your odds don't depend on where you aim.
type Keeper = 'rookie' | 'pro' | 'legend';
const SCORE: Record<Keeper, number> = {rookie: 5 / 6, pro: 2 / 3, legend: 1 / 2};
const KICKS = 10;
const SHOT_MS = 900;

export const penaltyMult = (k: Keeper, goals: number) => (goals === 0 ? 1 : Math.floor((HOUSE / Math.pow(SCORE[k], goals)) * 100) / 100);

function coverFor(k: Keeper): {zones: number[]; pose: string} {
  if (k === 'rookie') {
    const z = randInt(6);
    return {zones: [z], pose: `z${z}`};
  }
  if (k === 'pro') {
    const c = randInt(3);
    return {zones: [c, c + 3], pose: `col${c}`};
  }
  const r = randInt(2);
  return {zones: [r * 3, r * 3 + 1, r * 3 + 2], pose: `row${r}`};
}

const zonesOf = (pose: string): number[] => {
  if (pose.startsWith('z')) return [Number(pose.slice(1))];
  if (pose.startsWith('col')) {
    const c = Number(pose.slice(3));
    return [c, c + 3];
  }
  if (pose.startsWith('row')) {
    const r = Number(pose.slice(3));
    return [r * 3, r * 3 + 1, r * 3 + 2];
  }
  return [];
};

interface Shot {
  zone: number;
  goal: boolean;
  pose: string;
}

interface Round {
  phase: 'idle' | 'playing' | 'over';
  keeper: Keeper;
  stake: number;
  goals: number;
  shots: Shot[];
  cashed: boolean;
}

const ZONE_NAMES = ['Top left', 'Top centre', 'Top right', 'Bottom left', 'Bottom centre', 'Bottom right'];
// Ball flight targets relative to the penalty spot (px).
const TX = [-108, 0, 108];
const TY = [-246, -161];

function KeeperSprite() {
  return (
    <svg viewBox="-60 -70 120 140" width="120" height="140" aria-hidden="true" className="kp-svg">
      {/* legs */}
      <g className="kp-legs">
        <path d="M-9 22l-12 34" stroke="#10161c" strokeWidth="11" strokeLinecap="round" />
        <path d="M9 22l12 34" stroke="#10161c" strokeWidth="11" strokeLinecap="round" />
        <path d="M-22 52l-3 10M22 52l3 10" stroke="#ffc531" strokeWidth="9" strokeLinecap="round" />
        <ellipse cx="-27" cy="64" rx="8" ry="4" fill="#0b1822" />
        <ellipse cx="27" cy="64" rx="8" ry="4" fill="#0b1822" />
      </g>
      {/* arms reaching up (dives) */}
      <g className="kp-arms-up">
        <path d="M-14 -18l-16 -34" stroke="#ffc531" strokeWidth="9" strokeLinecap="round" />
        <path d="M14 -18l16 -34" stroke="#ffc531" strokeWidth="9" strokeLinecap="round" />
        <circle cx="-31" cy="-56" r="9" fill="#ffffff" stroke="#00b801" strokeWidth="3" />
        <circle cx="31" cy="-56" r="9" fill="#ffffff" stroke="#00b801" strokeWidth="3" />
      </g>
      {/* arms out (ready / spread) */}
      <g className="kp-arms-out">
        <path d="M-14 -14l-28 -10" stroke="#ffc531" strokeWidth="9" strokeLinecap="round" />
        <path d="M14 -14l28 -10" stroke="#ffc531" strokeWidth="9" strokeLinecap="round" />
        <circle cx="-46" cy="-26" r="9" fill="#ffffff" stroke="#00b801" strokeWidth="3" />
        <circle cx="46" cy="-26" r="9" fill="#ffffff" stroke="#00b801" strokeWidth="3" />
      </g>
      {/* super-long reach (Legend covers a whole row) */}
      <g className="kp-arms-wide">
        <path d="M-14 -14L-112 -20" stroke="#ffc531" strokeWidth="9" strokeLinecap="round" />
        <path d="M14 -14L112 -20" stroke="#ffc531" strokeWidth="9" strokeLinecap="round" />
        <circle cx="-116" cy="-20" r="11" fill="#ffffff" stroke="#00b801" strokeWidth="3" />
        <circle cx="116" cy="-20" r="11" fill="#ffffff" stroke="#00b801" strokeWidth="3" />
      </g>
      {/* torso */}
      <path d="M-17 -24h34l-3 46h-28z" fill="#ffc531" />
      <path d="M-17 -24h34l-1 8h-32z" fill="#0b1822" opacity=".25" />
      <text x="0" y="6" textAnchor="middle" fontSize="17" fontWeight="900" fill="#2a1a00" fontFamily="system-ui,Arial">
        1
      </text>
      <path d="M-14 18h28l2 10h-32z" fill="#10161c" />
      {/* head */}
      <circle cx="0" cy="-36" r="11" fill="#d9a77c" />
      <path d="M-11 -39c0-12 22-12 22 0-6-4-16-4-22 0z" fill="#3b2412" />
    </svg>
  );
}

function Striker() {
  return (
    <svg viewBox="0 0 70 110" width="70" height="110" aria-hidden="true">
      <ellipse cx="35" cy="106" rx="22" ry="4" fill="rgba(0,0,0,.35)" />
      <g className="st-leg-back">
        <path d="M29 70l-6 32" stroke="#e9eef3" strokeWidth="9" strokeLinecap="round" />
      </g>
      <g className="st-leg-kick">
        <path d="M41 70l6 32" stroke="#e9eef3" strokeWidth="9" strokeLinecap="round" />
      </g>
      <path d="M22 66h26l2 10H20z" fill="#0b1822" />
      <path d="M18 30c0-6 34-6 34 0l2 38H16z" fill="#00c901" />
      <path d="M18 30l-8 26M52 30l8 26" stroke="#00c901" strokeWidth="8" strokeLinecap="round" />
      <path d="M10 56l-2 4M60 56l2 4" stroke="#d9a77c" strokeWidth="7" strokeLinecap="round" />
      <text x="35" y="56" textAnchor="middle" fontSize="19" fontWeight="900" fill="#03140a" fontFamily="system-ui,Arial">
        10
      </text>
      <text x="35" y="38" textAnchor="middle" fontSize="7" fontWeight="900" fill="#03140a" fontFamily="system-ui,Arial">
        KMR
      </text>
      <circle cx="35" cy="18" r="11" fill="#3b2412" />
      <path d="M26 22c2 6 16 6 18 0" fill="#d9a77c" />
    </svg>
  );
}

function BallSvg() {
  return (
    <svg viewBox="0 0 40 40" width="30" height="30" aria-hidden="true">
      <defs>
        <radialGradient id="pen-ball" cx=".35" cy=".3" r=".75">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#c9d4de" />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="18" fill="url(#pen-ball)" />
      <path d="M20 10l7 5-3 8h-8l-3-8z" fill="#0b1822" />
      <path d="M7 18l6 2M33 18l-6 2M14 32l3-6M26 32l-3-6M20 2v8" stroke="#0b1822" strokeWidth="2.4" />
    </svg>
  );
}

export default function Penalty() {
  const [round, setRound] = usePersistent<Round>('penalty', {phase: 'idle', keeper: 'pro', stake: 0, goals: 0, shots: [], cashed: false});
  const [shooting, setShooting] = useState<Shot | null>(null);
  const [kickKey, setKickKey] = useState(0);
  const [autoGoals, setAutoGoals] = useState(2);
  const [win, flashWin] = useFlash<WinInfo>();
  const settle = useSettler();
  const goalRef = useRef<HTMLDivElement>(null);
  const playing = round.phase === 'playing';
  // While the ball is in the air the result is already settled, but the screen keeps it hidden.
  const live = playing || !!shooting;
  const shownGoals = shooting?.goal ? round.goals - 1 : round.goals;
  const shownShots = shooting ? round.shots.length - 1 : round.shots.length;
  const mult = penaltyMult(round.keeper, round.goals);
  const shownMult = penaltyMult(round.keeper, shownGoals);
  const last = shooting ?? round.shots[round.shots.length - 1] ?? null;

  const prevPhase = useRef(round.phase);
  useEffect(() => {
    if (prevPhase.current === round.phase) return;
    prevPhase.current = round.phase;
    requestAnimationFrame(() => (round.phase === 'playing' && !auto.running ? focusEl(goalRef.current?.querySelector<HTMLElement>('button[data-z="1"]') ?? null) : focusDefault()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round.phase]);

  const start = () => {
    if (playing) return;
    const stake = wallet.get().betAmount;
    if (!wallet.debit(stake)) return;
    setRound({phase: 'playing', keeper: round.keeper, stake, goals: 0, shots: [], cashed: false});
  };

  const cashout = (r: Round = round) => {
    if (r.phase !== 'playing' || r.goals === 0) return;
    const m = penaltyMult(r.keeper, r.goals);
    const payout = money(r.stake * m);
    wallet.settle('penalty', r.stake, payout);
    sfx('cash');
    flashWin({mult: m, payout});
    setRound({...r, phase: 'over', cashed: true});
  };

  const shoot = (zone: number) => {
    if (!playing || shooting) return;
    const {zones, pose} = fate(() => coverFor(round.keeper), c => (c.zones.includes(zone) ? 0 : 1));
    const shot: Shot = {zone, goal: !zones.includes(zone), pose};
    setShooting(shot);
    setKickKey(k => k + 1);
    const shots = [...round.shots, shot];
    const fast = reducedMotion();
    settle(() => sfx('kick'), fast ? 0 : 260);
    settle(() => sfx(shot.goal ? 'goal' : 'save'), fast ? 60 : 620);
    if (!shot.goal) {
      wallet.settle('penalty', round.stake, 0); // saved: settled now, animation follows
      setRound({...round, shots, phase: 'over'});
    } else {
      const r = {...round, shots, goals: round.goals + 1};
      setRound(r);
      if (r.goals === KICKS) settle(() => cashout(r), SHOT_MS);
    }
    settle(() => setShooting(null), fast ? 150 : SHOT_MS + 250);
  };

  const auto = useAutoBet({game: 'penalty', idle: !playing && !shooting, trigger: start});

  // Auto: shoot at random corners until the chosen number of goals, then cash out.
  useEffect(() => {
    if (!auto.running || !playing || shooting) return;
    const t = setTimeout(() => (round.goals >= autoGoals ? cashout() : shoot(randInt(6))), auto.stepDelay + 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto.running, playing, shooting, round.goals]);

  const showResult = !!last && round.phase !== 'idle';
  const pose = showResult ? last.pose : 'idle';
  const verdict = shooting ? null : showResult ? (last.goal ? 'GOAL!' : 'SAVED!') : null;
  const covered = showResult && !shooting ? zonesOf(last.pose) : [];
  const ballStyle = last
    ? ({
        '--tx': `${TX[last.zone % 3]}px`,
        '--ty': `${TY[Math.floor(last.zone / 3)]}px`,
        '--mx': `${TX[last.zone % 3] * 0.45}px`,
        '--my': `${TY[Math.floor(last.zone / 3)] * 0.62 - 46}px`,
        '--dx': `${last.zone % 3 === 0 ? -70 : last.zone % 3 === 2 ? 70 : 40}px`,
      } as React.CSSProperties)
    : undefined;

  return (
    <GameLayout
      title="Penalty Shootout"
      sidebar={
        <>
          <BetAmount locked={live || auto.running} />
          <Segmented
            label="Keeper"
            value={round.keeper}
            onChange={k => setRound({phase: 'idle', keeper: k, stake: 0, goals: 0, shots: [], cashed: false})}
            disabled={playing || auto.running}
            options={[
              {value: 'rookie', label: 'Rookie'},
              {value: 'pro', label: 'Pro'},
              {value: 'legend', label: 'Legend'},
            ]}
          />
          <Readout
            label={`Total Profit (${fmtMult(live ? shownMult : 1)})`}
            tone={live && shownGoals ? 'green' : undefined}
            value={
              <>
                <Coin size={14} />
                {fmtCoins(live ? round.stake * shownMult - round.stake : 0)}
              </>
            }
          />
          <AutoRow auto={auto}>
            {live ? (
              <PlayButton onClick={() => cashout()} disabled={round.goals === 0 || !!shooting} tone="gold" autoFocus={false} sub={shownGoals ? fmtCoins(round.stake * shownMult) : 'Score a goal first'}>
                Cashout
              </PlayButton>
            ) : (
              <PlayButton onClick={start} sub={`${Math.round(SCORE[round.keeper] * 100)}% · ${fmtMult(penaltyMult(round.keeper, 1))} per goal`}>
                Bet
              </PlayButton>
            )}
          </AutoRow>
          <AutoSheet auto={auto} note="Aims at random corners. Uses your current bet and keeper.">
            <ListStepper
              label="Cash out after"
              values={Array.from({length: KICKS}, (_, i) => i + 1)}
              value={autoGoals}
              onChange={setAutoGoals}
              render={v => `${v} goal${v > 1 ? 's' : ''} · ${fmtMult(penaltyMult(round.keeper, v))}`}
            />
          </AutoSheet>
        </>
      }
      stage={
        <div className="pen">
          <div className={`pen-pitch keeper-${round.keeper}${verdict === 'GOAL!' ? ' is-cheer' : ''}`}>
            <div className="pen-crowd" aria-hidden="true">
              {Array.from({length: 14}, (_, i) => (
                <i key={i} style={{left: `${(i * 37) % 100}%`, top: `${8 + ((i * 23) % 44)}px`, animationDelay: `${(i * 0.61) % 3}s`}} />
              ))}
            </div>
            <div className="pen-lights" aria-hidden="true" />
            <div className="pen-boards" aria-hidden="true">
              <span>KMR CASINO ★ PLAY MONEY ONLY ★ KMR ORIGINALS ★ KMR CASINO ★ PLAY MONEY ONLY ★ KMR ORIGINALS ★</span>
            </div>
            <svg className="pen-lines" viewBox="0 0 388 200" preserveAspectRatio="none" aria-hidden="true">
              <path d="M40 8h308l40 192M0 200L40 8" fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="2.5" />
              <path d="M112 8h164l14 70H98z" fill="none" stroke="rgba(255,255,255,.45)" strokeWidth="2.2" />
              <path d="M150 196a50 18 0 0 1 88 0" fill="none" stroke="rgba(255,255,255,.4)" strokeWidth="2" />
            </svg>

            <div className={`pen-goal${verdict === 'GOAL!' ? ' is-ripple' : ''}`} ref={goalRef}>
              <div className="pen-net" />
              <div className="pen-post is-left" />
              <div className="pen-post is-right" />
              <div className="pen-bar" />
              <div className="pen-reach" aria-hidden="true">
                {Array.from({length: 6}, (_, z) => (
                  <i key={z} className={covered.includes(z) ? 'is-on' : ''} />
                ))}
              </div>
              <div className={`pen-keeper pose-${pose}${shooting ? ' is-diving' : ''}`}>
                <KeeperSprite />
              </div>
              <div className="pen-zones">
                {Array.from({length: 6}, (_, z) => (
                  <button
                    key={z}
                    type="button"
                    data-z={z}
                    className={`pen-zone${showResult && last.zone === z && !shooting ? (last.goal ? ' is-goal' : ' is-saved') : ''}`}
                    onClick={() => shoot(z)}
                    disabled={!playing || !!shooting}
                    aria-label={`Shoot ${ZONE_NAMES[z]}`}
                  >
                    <span className="pen-target">
                      <i />
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="pen-spot" />
            {last && showResult && (
              <div key={`b${kickKey}-${round.shots.length}`} className={`pen-ball is-flying${last.goal ? ' is-goal' : ' is-saved'}${shooting ? '' : ' is-done'}`} style={ballStyle}>
                <span className="pen-ball-spin">
                  <BallSvg />
                </span>
              </div>
            )}
            {(!shooting && round.phase !== 'over') || round.phase === 'idle' ? (
              <div className="pen-ball is-rest">
                <BallSvg />
              </div>
            ) : null}
            <div className="pen-shadow" key={`s${kickKey}`} data-flying={!!shooting} style={ballStyle} />
            <div className={`pen-striker${shooting ? ' is-kicking' : ''}`} key={`k${kickKey}`}>
              <Striker />
            </div>

            {verdict && (
              <div className={`pen-verdict${verdict === 'GOAL!' ? '' : ' is-saved'}`} key={`v${round.shots.length}`}>
                {verdict}
              </div>
            )}
            {verdict === 'GOAL!' && (
              <div className="pen-confetti" aria-hidden="true" key={`c${round.shots.length}`}>
                {Array.from({length: 18}, (_, i) => (
                  <i key={i} style={{left: `${8 + ((i * 53) % 84)}%`, animationDelay: `${(i % 6) * 0.05}s`, background: ['#00e701', '#ffc531', '#ff4d6d', '#38bdf8', '#fff'][i % 5]}} />
                ))}
              </div>
            )}
            <div className="pen-hud">
              <span>
                Kick <b>{Math.min(shownShots + (live ? 1 : 0), KICKS) || 1}</b>/{KICKS}
              </span>
              <span className={round.phase === 'over' && !round.cashed && !shooting ? 'tone-red' : shownGoals ? 'tone-green' : ''}>
                {round.phase === 'over' && !round.cashed && !shooting ? 'Saved · 0.00×' : fmtMult(round.phase === 'idle' ? 1 : shownMult)}
              </span>
            </div>
          </div>
          <div className="pen-track" aria-label="Kicks">
            {Array.from({length: KICKS}, (_, i) => {
              const s = round.phase !== 'idle' && i < shownShots ? round.shots[i] : undefined;
              return (
                <div key={i} className={`pen-kick${s ? (s.goal ? ' is-goal' : ' is-saved') : ''}${live && i === shownShots ? ' is-next' : ''}`}>
                  {s ? <b>{s.goal ? '✓' : '✕'}</b> : null}
                  <small>{fmtMult(penaltyMult(round.keeper, i + 1))}</small>
                </div>
              );
            })}
          </div>
          <div className="pen-status">
            {round.phase === 'idle' && 'Pick a keeper, bet, then aim for a corner.'}
            {playing && !shooting && (round.goals ? `${round.goals} goal${round.goals > 1 ? 's' : ''} — shoot again or cash out` : 'Pick a target in the goal and pinch to shoot')}
            {shooting && 'Shooting…'}
            {round.phase === 'over' && !shooting && (round.cashed ? `Cashed out at ${fmtMult(mult)}` : 'Saved! The red zones were covered')}
          </div>
          <WinPopup win={win} />
        </div>
      }
    />
  );
}
