import {useEffect, useRef, useState} from 'react';
import {useFlash, usePersistent, useSettler} from '../lib/hooks';
import {focusDefault, focusEl} from '../lib/spatial';
import {HOUSE, fmtCoins, fmtMult, money, randInt, reducedMotion} from '../lib/util';
import {useWallet, wallet} from '../lib/wallet';
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
const SHOT_MS = 750;

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

function KeeperSprite() {
  return (
    <svg viewBox="0 0 80 110" width="80" height="110" aria-hidden="true">
      <path d="M22 44l-14-24M58 44l14-24" stroke="#ffc531" strokeWidth="9" strokeLinecap="round" />
      <circle cx="8" cy="18" r="7" fill="#ffffff" />
      <circle cx="72" cy="18" r="7" fill="#ffffff" />
      <rect x="22" y="36" width="36" height="38" rx="10" fill="#ffc531" />
      <text x="40" y="62" textAnchor="middle" fontSize="15" fontWeight="900" fill="#2a1a00" fontFamily="system-ui,Arial">
        1
      </text>
      <circle cx="40" cy="24" r="12" fill="#d9a77c" />
      <path d="M28 20c2-9 22-9 24 0" fill="#3b2412" />
      <path d="M30 74l-6 30M50 74l6 30" stroke="#0b1822" strokeWidth="10" strokeLinecap="round" />
    </svg>
  );
}

export default function Penalty() {
  const {betAmount} = useWallet();
  const [round, setRound] = usePersistent<Round>('penalty', {phase: 'idle', keeper: 'pro', stake: 0, goals: 0, shots: [], cashed: false});
  const [shooting, setShooting] = useState<Shot | null>(null);
  const [autoGoals, setAutoGoals] = useState(2);
  const [win, flashWin] = useFlash<WinInfo>();
  const settle = useSettler();
  const goalRef = useRef<HTMLDivElement>(null);
  const playing = round.phase === 'playing';
  const mult = penaltyMult(round.keeper, round.goals);
  const last = shooting ?? round.shots[round.shots.length - 1] ?? null;

  const prevPhase = useRef(round.phase);
  useEffect(() => {
    if (prevPhase.current === round.phase) return;
    prevPhase.current = round.phase;
    requestAnimationFrame(() => (round.phase === 'playing' ? focusEl(goalRef.current?.querySelector<HTMLElement>('button[data-z="1"]') ?? null) : focusDefault()));
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
    flashWin({mult: m, payout});
    setRound({...r, phase: 'over', cashed: true});
  };

  const shoot = (zone: number) => {
    if (!playing || shooting) return;
    const {zones, pose} = coverFor(round.keeper);
    const shot: Shot = {zone, goal: !zones.includes(zone), pose};
    setShooting(shot);
    const shots = [...round.shots, shot];
    if (!shot.goal) {
      wallet.settle('penalty', round.stake, 0); // saved: settled now, animation follows
      setRound({...round, shots, phase: 'over'});
    } else {
      const r = {...round, shots, goals: round.goals + 1};
      setRound(r);
      if (r.goals === KICKS) settle(() => cashout(r), SHOT_MS);
    }
    settle(() => setShooting(null), reducedMotion() ? 150 : SHOT_MS + 250);
  };

  const auto = useAutoBet({game: 'penalty', idle: !playing && !shooting, trigger: start});

  // Auto: shoot at random corners until the chosen number of goals, then cash out.
  useEffect(() => {
    if (!auto.running || !playing || shooting) return;
    const t = setTimeout(() => (round.goals >= autoGoals ? cashout() : shoot(randInt(6))), auto.stepDelay + 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto.running, playing, shooting, round.goals]);

  const pose = last && (shooting || round.phase !== 'idle') ? last.pose : 'idle';
  const verdict = shooting ? null : last && round.phase !== 'idle' ? (last.goal ? 'GOAL!' : 'SAVED!') : null;

  return (
    <GameLayout
      title="Penalty Shootout"
      sidebar={
        <>
          <BetAmount locked={playing || auto.running} />
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
            label={`Total Profit (${fmtMult(playing ? mult : 1)})`}
            tone={playing && round.goals ? 'green' : undefined}
            value={
              <>
                <Coin size={14} />
                {fmtCoins(playing ? round.stake * mult - round.stake : 0)}
              </>
            }
          />
          <AutoRow auto={auto}>
            {playing ? (
              <PlayButton onClick={() => cashout()} disabled={round.goals === 0 || !!shooting} tone="gold" autoFocus={false} sub={round.goals ? fmtCoins(round.stake * mult) : 'Score a goal first'}>
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
          <div className="pen-pitch">
            <div className="pen-goal" ref={goalRef}>
              <div className="pen-net" />
              <div className={`pen-keeper pose-${pose}${shooting ? ' is-diving' : ''}`}>
                <KeeperSprite />
              </div>
              <div className="pen-zones">
                {Array.from({length: 6}, (_, z) => (
                  <button
                    key={z}
                    type="button"
                    data-z={z}
                    className={`pen-zone${last && last.zone === z && round.phase !== 'idle' ? (last.goal ? ' is-goal' : ' is-saved') : ''}`}
                    onClick={() => shoot(z)}
                    disabled={!playing || !!shooting}
                    aria-label={`Shoot ${ZONE_NAMES[z]}`}
                  >
                    <span className="pen-target" />
                  </button>
                ))}
              </div>
              {last && (shooting || round.phase !== 'idle') && (
                <div
                  key={round.shots.length}
                  className="pen-ball"
                  style={{'--to': `translate(${(last.zone % 3) * 108 - 108}px, ${last.zone < 3 ? -205 : -108}px) scale(${last.zone < 3 ? 0.75 : 0.8})`} as React.CSSProperties}
                  aria-hidden="true"
                >
                  <BallSvg />
                </div>
              )}
              {!shooting && round.phase !== 'over' && (
                <div className="pen-ball is-rest" aria-hidden="true">
                  <BallSvg />
                </div>
              )}
              {verdict && <div className={`pen-verdict${verdict === 'GOAL!' ? '' : ' is-saved'}`}>{verdict}</div>}
            </div>
            <div className="pen-spot" />
          </div>
          <div className="pen-track" aria-label="Kicks">
            {Array.from({length: KICKS}, (_, i) => {
              const s = round.phase !== 'idle' ? round.shots[i] : undefined;
              return (
                <div key={i} className={`pen-kick${s ? (s.goal ? ' is-goal' : ' is-saved') : ''}${playing && i === round.shots.length ? ' is-next' : ''}`}>
                  <small>{fmtMult(penaltyMult(round.keeper, i + 1))}</small>
                </div>
              );
            })}
          </div>
          <div className="pen-status">
            {round.phase === 'idle' && 'Pick your keeper, bet, then aim at a corner.'}
            {playing && !shooting && (round.goals ? `${round.goals} goal${round.goals > 1 ? 's' : ''} — shoot again or cash out` : 'Aim at a target in the goal and pinch to shoot')}
            {shooting && 'Shooting…'}
            {round.phase === 'over' && !shooting && (round.cashed ? `Cashed out at ${fmtMult(mult)}` : 'Saved! Round over')}
          </div>
          <WinPopup win={win} />
        </div>
      }
    />
  );
}

function BallSvg() {
  return (
    <svg viewBox="0 0 40 40" width="34" height="34">
      <circle cx="20" cy="20" r="18" fill="#fff" />
      <path d="M20 9l7 5-3 8h-8l-3-8z" fill="#0b1822" />
      <path d="M6 18l5 2M34 18l-5 2M14 33l3-6M26 33l-3-6" stroke="#0b1822" strokeWidth="2.5" />
    </svg>
  );
}
