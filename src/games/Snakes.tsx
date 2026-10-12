import {useEffect, useRef, useState} from 'react';
import {useFlash, usePersistent, useSettler} from '../lib/hooks';
import {sfx} from '../lib/sfx';
import {focusDefault} from '../lib/spatial';
import {fmtCoins, fmtMult, money, randInt, reducedMotion} from '../lib/util';
import {wallet} from '../lib/wallet';
import {AutoRow, AutoSheet, useAutoBet} from '../ui/auto';
import {BetAmount, ListStepper, PlayButton, Readout, Segmented} from '../ui/controls';
import {GameLayout, WinPopup, type WinInfo} from '../ui/game';
import {Coin} from '../ui/icons';
import './games.css';
import './Snakes.css';

// A 12-tile loop. Roll two dice, move clockwise, and your multiplier is multiplied by
// the tile you land on. Land on a snake and the round is lost. Each board's tile values
// were solved so that every roll, from any tile, returns between ~95.5% and 99%.
type Diff = 'easy' | 'medium' | 'hard' | 'expert';
export const SNAKE_BOARDS: Record<Diff, number[]> = {
  easy: [1.02, 1.14, 0, 1.02, 1.7, 1.02, 1.02, 1.02, 0, 1.36, 1.36, 1.14],
  medium: [1.23, 1.43, 1.02, 0, 1.02, 1.23, 1.23, 1.02, 1.74, 0, 0, 1.74],
  hard: [1.23, 1.64, 0, 1.03, 0, 3.29, 0, 1.03, 0, 2.47, 0, 1.03],
  expert: [1.09, 0, 0, 1.37, 3.28, 0, 1.64, 0, 0, 0, 4.38, 0],
};
const N = 12;
const CAP = 10_000;
// Board position → grid cell (row, col), clockwise from the top-left corner.
const CELL: [number, number][] = [
  [0, 0], [0, 1], [0, 2], [0, 3], [1, 3], [2, 3], [3, 3], [3, 2], [3, 1], [3, 0], [2, 0], [1, 0],
];
const P_SUM = (s: number) => (6 - Math.abs(s - 7)) / 36;

interface Round {
  phase: 'idle' | 'playing' | 'over';
  diff: Diff;
  stake: number;
  pos: number;
  mult: number;
  rolls: number;
  dice: [number, number];
  cashed: boolean;
}

interface Anim {
  key: number;
  stage: 'roll' | 'move' | 'land';
  pos: number;
  mult: number; // multiplier shown during the animation
  faces: [number, number];
}

const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 26], [72, 26], [28, 50], [72, 50], [28, 74], [72, 74]],
};

function Die({face, rolling}: {face: number; rolling: boolean}) {
  return (
    <svg viewBox="0 0 100 100" width="50" height="50" className={`snk-die${rolling ? ' is-rolling' : ''}`} aria-label={`Die showing ${face}`} role="img">
      <rect x="4" y="6" width="92" height="92" rx="20" fill="#b9c4cf" />
      <rect x="4" y="2" width="92" height="90" rx="20" fill="#ffffff" />
      {PIPS[face].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y - 3} r="9" fill="#0b1822" />
      ))}
    </svg>
  );
}

function SnakeIcon() {
  return (
    <svg viewBox="0 0 64 64" width="44" height="44" aria-hidden="true" className="snk-snake">
      <path d="M14 50c-8-6-2-16 8-14s16 4 18-4-10-10-6-18 16-4 16 4" fill="none" stroke="#1fa64a" strokeWidth="9" strokeLinecap="round" />
      <path d="M14 50c-8-6-2-16 8-14s16 4 18-4-10-10-6-18 16-4 16 4" fill="none" stroke="#6bf08e" strokeWidth="3" strokeLinecap="round" strokeDasharray="2 7" />
      <ellipse cx="51" cy="19" rx="8" ry="6.5" fill="#1fa64a" />
      <circle cx="53" cy="16.5" r="2" fill="#fff6c8" />
      <circle cx="53.5" cy="16.5" r="1" fill="#0b1822" />
      <path d="M58 21l5 1-4 2 4 2-5 0" fill="none" stroke="#ff3b55" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function Snakes() {
  const [round, setRound, latest] = usePersistent<Round>('snakes', {phase: 'idle', diff: 'medium', stake: 0, pos: 0, mult: 1, rolls: 0, dice: [3, 4], cashed: false});
  const [anim, setAnim] = useState<Anim | null>(null);
  const [autoRolls, setAutoRolls] = useState(2);
  const [win, flashWin] = useFlash<WinInfo>();
  const settle = useSettler();
  const playing = round.phase === 'playing';
  const board = SNAKE_BOARDS[round.diff];
  const busy = !!anim && anim.stage !== 'land';
  const live = playing || busy;

  // What the screen shows lags the stored result while dice roll and the token moves.
  const shownPos = anim ? anim.pos : round.pos;
  const shownMult = anim && anim.stage !== 'land' ? anim.mult : round.phase === 'over' && !round.cashed ? 0 : round.mult;
  const shownDice = anim ? anim.faces : round.dice;
  const lost = round.phase === 'over' && !round.cashed && !busy;

  const prevPhase = useRef(round.phase);
  useEffect(() => {
    if (prevPhase.current === round.phase) return;
    prevPhase.current = round.phase;
    requestAnimationFrame(() => focusDefault());
  }, [round.phase]);

  const start = () => {
    if (playing || busy) return;
    const stake = wallet.get().betAmount;
    if (!wallet.debit(stake)) return;
    setAnim(null);
    setRound({phase: 'playing', diff: round.diff, stake, pos: 0, mult: 1, rolls: 0, dice: round.dice, cashed: false});
  };

  const cashout = (r: Round = latest()) => {
    if (r.phase !== 'playing' || r.rolls === 0) return;
    const payout = money(r.stake * r.mult);
    wallet.settle('snakes', r.stake, payout);
    sfx('cash');
    flashWin({mult: r.mult, payout});
    setRound({...r, phase: 'over', cashed: true});
  };

  const roll = () => {
    const r = latest();
    if (r.phase !== 'playing' || busy) return;
    const d1 = randInt(6) + 1;
    const d2 = randInt(6) + 1;
    const steps = d1 + d2;
    const to = (r.pos + steps) % N;
    const v = SNAKE_BOARDS[r.diff][to];
    const next: Round =
      v === 0
        ? {...r, pos: to, rolls: r.rolls + 1, dice: [d1, d2], phase: 'over'}
        : {...r, pos: to, rolls: r.rolls + 1, dice: [d1, d2], mult: Math.min(CAP, Math.round(r.mult * v * 10000) / 10000)};
    if (v === 0) wallet.settle('snakes', r.stake, 0); // settled now; the snake appears after the move
    setRound(next);

    // Animate: dice tumble, then the token walks tile by tile.
    const key = Date.now();
    const fast = reducedMotion();
    const ROLL = fast ? 80 : 620;
    const STEP = fast ? 20 : 120;
    sfx('dice');
    setAnim({key, stage: 'roll', pos: r.pos, mult: r.mult, faces: [randInt(6) + 1, randInt(6) + 1]});
    if (!fast)
      for (let i = 1; i <= 5; i++) settle(() => setAnim(a => (a && a.key === key && a.stage === 'roll' ? {...a, faces: [randInt(6) + 1, randInt(6) + 1]} : a)), i * 100);
    settle(() => setAnim(a => (a && a.key === key ? {...a, stage: 'move', faces: [d1, d2]} : a)), ROLL);
    for (let i = 1; i <= steps; i++)
      settle(() => {
        sfx('tick');
        setAnim(a => (a && a.key === key ? {...a, pos: (r.pos + i) % N} : a));
      }, ROLL + i * STEP);
    settle(() => {
      sfx(v === 0 ? 'snake' : v >= 2 ? 'multi' : 'pickup');
      setAnim(a => (a && a.key === key ? {...a, stage: 'land', mult: next.mult} : a));
    }, ROLL + steps * STEP + 60);
  };

  const auto = useAutoBet({game: 'snakes', idle: !playing && !busy, trigger: start});
  // Auto: roll until the chosen number of rolls, then cash out.
  useEffect(() => {
    if (!auto.running || !playing || busy) return;
    const t = setTimeout(() => (round.rolls >= autoRolls ? cashout() : roll()), auto.stepDelay + 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto.running, playing, busy, round.rolls]);

  // Odds of the next roll from where the token stands.
  let safe = 0;
  let best = 0;
  for (let s = 2; s <= 12; s++) {
    const v = board[(shownPos + s) % N];
    if (v > 0) safe += P_SUM(s);
    best = Math.max(best, v);
  }
  const landed = anim?.stage === 'land' || (!anim && round.rolls > 0);
  const landTile = landed ? round.pos : -1;

  return (
    <GameLayout
      title="Snakes"
      sidebar={
        <>
          <BetAmount locked={live || auto.running} />
          <Segmented
            label="Difficulty"
            value={round.diff}
            onChange={d => setRound({phase: 'idle', diff: d, stake: 0, pos: 0, mult: 1, rolls: 0, dice: round.dice, cashed: false})}
            disabled={live || auto.running}
            options={[
              {value: 'easy', label: 'Easy'},
              {value: 'medium', label: 'Med', aria: 'Medium'},
              {value: 'hard', label: 'Hard'},
              {value: 'expert', label: 'Exp', aria: 'Expert'},
            ]}
          />
          <Readout
            label={`Total Profit (${fmtMult(live ? shownMult : 1)})`}
            tone={live && shownMult > 1 ? 'green' : undefined}
            value={
              <>
                <Coin size={14} />
                {fmtCoins(live ? round.stake * shownMult - round.stake : 0)}
              </>
            }
          />
          <AutoRow auto={auto}>
            {live ? (
              <PlayButton onClick={roll} disabled={busy || !playing} sub={`Safe roll ${Math.round(safe * 100)}%`}>
                Roll
              </PlayButton>
            ) : (
              <PlayButton onClick={start} sub={`${board.filter(v => v === 0).length} snakes on the board`}>
                Bet
              </PlayButton>
            )}
          </AutoRow>
          {live && !auto.running && (
            <button type="button" className="ghost-btn snk-cash" onClick={() => cashout()} disabled={round.rolls === 0 || busy}>
              Cashout {round.rolls && !busy ? fmtCoins(round.stake * round.mult) : ''}
            </button>
          )}
          <AutoSheet auto={auto} note="Rolls, then cashes out after the chosen number of safe rolls.">
            <ListStepper label="Cash out after" values={[1, 2, 3, 4, 5, 6, 8, 10]} value={autoRolls} onChange={setAutoRolls} render={v => `${v} roll${v > 1 ? 's' : ''}`} />
          </AutoSheet>
        </>
      }
      stage={
        <div className="snk">
          <div className={`snk-board${lost ? ' is-lost' : ''}`}>
            {board.map((v, i) => {
              const [r, c] = CELL[i];
              const here = shownPos === i;
              const hit = landTile === i && !busy;
              return (
                <div
                  key={i}
                  className={`snk-tile${v === 0 ? ' is-snake' : v >= 3 ? ' is-hot' : v >= 1.5 ? ' is-warm' : ''}${here ? ' is-here' : ''}${hit ? (v === 0 ? ' is-bit' : ' is-hit') : ''}`}
                  style={{gridRow: r + 1, gridColumn: c + 1}}
                >
                  {i === 0 && <small className="snk-start">Start</small>}
                  {v === 0 ? <SnakeIcon /> : <b>{fmtMult(v)}</b>}
                </div>
              );
            })}
            <div className="snk-center">
              <div className="snk-dice">
                <Die face={shownDice[0]} rolling={anim?.stage === 'roll'} />
                <Die face={shownDice[1]} rolling={anim?.stage === 'roll'} />
              </div>
              <div className={`snk-mult${lost ? ' tone-red' : shownMult > 1 ? ' tone-green' : ''}`} key={`${anim?.stage}-${round.rolls}`}>
                {lost ? 'Bitten!' : fmtMult(live || round.cashed ? shownMult : 1)}
              </div>
              <small>{live ? `Roll ${round.rolls + (busy ? 0 : 1)} · safe ${Math.round(safe * 100)}%` : round.cashed ? 'Cashed out' : 'Roll the dice, dodge the snakes'}</small>
            </div>
            <div
              className={`snk-token${anim?.stage === 'move' ? ' is-walking' : ''}${lost ? ' is-eaten' : ''}`}
              style={{gridRow: CELL[shownPos][0] + 1, gridColumn: CELL[shownPos][1] + 1}}
              key={anim?.stage === 'move' ? `w${shownPos}` : 'still'}
              aria-hidden="true"
            >
              <i />
            </div>
          </div>
          <div className={`snk-status${lost ? ' is-lose' : round.cashed ? ' is-win' : ''}`}>
            {round.phase === 'idle' && 'Every safe tile multiplies your win. Cash out before a snake bites.'}
            {live && (busy ? 'Rolling…' : round.rolls ? `${Math.round(safe * 100)}% safe next roll · best tile in reach ${fmtMult(best)}` : 'Press Roll to throw the dice')}
            {round.phase === 'over' && !busy && (round.cashed ? `Cashed out at ${fmtMult(round.mult)}` : `A snake on tile ${round.pos + 1} — round lost`)}
          </div>
          <WinPopup win={win} />
        </div>
      }
    />
  );
}
