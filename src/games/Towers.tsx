import {useEffect, useRef, useState} from 'react';
import {useFlash, usePersistent} from '../lib/hooks';
import {focusDefault, focusEl} from '../lib/spatial';
import {HOUSE, fmtCoins, fmtMult, money, randInt, shuffle} from '../lib/util';
import {jinx, rescue} from '../lib/luck';
import {useWallet, wallet} from '../lib/wallet';
import {AutoRow, AutoSheet, useAutoBet} from '../ui/auto';
import {BetAmount, ListStepper, PlayButton, Readout, Segmented} from '../ui/controls';
import {GameLayout, WinPopup, type WinInfo} from '../ui/game';
import {Coin, Shuffle} from '../ui/icons';
import './games.css';
import './Towers.css';

type Diff = 'easy' | 'medium' | 'hard' | 'expert' | 'master';
const DIFFS: Record<Diff, {tiles: number; safe: number; label: string}> = {
  easy: {tiles: 4, safe: 3, label: 'Easy'},
  medium: {tiles: 3, safe: 2, label: 'Med'},
  hard: {tiles: 2, safe: 1, label: 'Hard'},
  expert: {tiles: 3, safe: 1, label: 'Exp'},
  master: {tiles: 4, safe: 1, label: 'Mstr'},
};
const LEVELS = 9;

interface Round {
  phase: 'idle' | 'playing' | 'over';
  diff: Diff;
  stake: number;
  safe: number[][]; // safe columns per row
  picks: number[]; // chosen column per cleared row
  hit: [number, number] | null;
}

const fresh = (diff: Diff): Round => ({phase: 'idle', diff, stake: 0, safe: [], picks: [], hit: null});

function towerMult(diff: Diff, level: number): number {
  if (level === 0) return 1;
  const {tiles, safe} = DIFFS[diff];
  return Math.floor((HOUSE / Math.pow(safe / tiles, level)) * 100) / 100;
}

function Egg({bad = false}: {bad?: boolean}) {
  return bad ? (
    <svg viewBox="0 0 40 40" width="30" height="30" aria-hidden="true">
      <path d="M8 26c0-9 6-16 12-16s12 7 12 16c-3-2-5 2-8 0s-5 2-8 0-5 2-8 0z" fill="#ff4d6d" />
      <circle cx="16" cy="20" r="2.4" fill="#fff" />
      <circle cx="24" cy="20" r="2.4" fill="#fff" />
      <path d="M12 12l-4-5M28 12l4-5" stroke="#ff4d6d" strokeWidth="3" strokeLinecap="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 40 40" width="28" height="28" aria-hidden="true">
      <ellipse cx="20" cy="22" rx="11" ry="14" fill="#ffc531" />
      <ellipse cx="16" cy="16" rx="3.5" ry="5" fill="#fff" opacity=".65" />
      <path d="M11 24l4-3 4 3 4-3 4 3 3-2" stroke="#c98a00" strokeWidth="2" fill="none" />
    </svg>
  );
}

export default function Towers() {
  const {betAmount} = useWallet();
  const [round, setRound] = usePersistent<Round>('towers', fresh('easy'));
  const [win, flashWin] = useFlash<WinInfo>();
  const [autoFloors, setAutoFloors] = useState(3);
  const gridRef = useRef<HTMLDivElement>(null);
  const cfg = DIFFS[round.diff];
  const level = round.picks.length;
  const playing = round.phase === 'playing';
  const mult = towerMult(round.diff, level);

  const focusRow = (row: number) =>
    requestAnimationFrame(() => focusEl(gridRef.current?.querySelector<HTMLElement>(`button[data-row="${row}"]:not(:disabled)`) ?? null));

  const prevPhase = useRef(round.phase);
  useEffect(() => {
    if (prevPhase.current === round.phase) return;
    prevPhase.current = round.phase;
    if (round.phase === 'playing' && !auto.running) focusRow(round.picks.length);
    else requestAnimationFrame(() => focusDefault());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round.phase]);

  const start = () => {
    const stake = betAmount;
    if (!wallet.debit(stake)) return;
    const safe = Array.from({length: LEVELS}, () => shuffle(Array.from({length: cfg.tiles}, (_, i) => i)).slice(0, cfg.safe));
    setRound({phase: 'playing', diff: round.diff, stake, safe, picks: [], hit: null});
  };

  const cashout = (r: Round = round) => {
    if (r.phase !== 'playing' || r.picks.length === 0) return;
    const m = towerMult(r.diff, r.picks.length);
    const payout = money(r.stake * m);
    wallet.settle('towers', r.stake, payout);
    flashWin({mult: m, payout});
    setRound({...r, phase: 'over'});
  };

  const choose = (col: number) => {
    if (!playing) return;
    const row = round.picks.length;
    // Luck swaps which tiles on this floor are safe before the pick is revealed.
    let safe = round.safe;
    const rowSafe = safe[row];
    if (!rowSafe.includes(col) && rescue()) safe = safe.map((r, k) => (k === row ? [...r.slice(1), col] : r));
    else if (rowSafe.includes(col) && jinx()) {
      const bad = Array.from({length: cfg.tiles}, (_, k) => k).filter(k => !rowSafe.includes(k));
      if (bad.length) safe = safe.map((r, k) => (k === row ? r.map(c => (c === col ? bad[randInt(bad.length)] : c)) : r));
    }
    if (!safe[row].includes(col)) {
      wallet.settle('towers', round.stake, 0);
      setRound({...round, safe, phase: 'over', hit: [row, col]});
      return;
    }
    const next = {...round, safe, picks: [...round.picks, col]};
    if (next.picks.length === LEVELS) cashout(next);
    else {
      setRound(next);
      if (!auto.running) focusRow(next.picks.length);
    }
  };

  const over = round.phase === 'over';
  const auto = useAutoBet({game: 'towers', idle: !playing, trigger: start});
  // Auto: climb random tiles to the chosen floor, then cash out.
  useEffect(() => {
    if (!auto.running || !playing) return;
    const t = setTimeout(() => (level >= autoFloors ? cashout() : choose(randInt(cfg.tiles))), auto.stepDelay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto.running, playing, level]);

  return (
    <GameLayout
      title="Towers"
      sidebar={
        <>
          <BetAmount locked={playing || auto.running} />
          <Segmented
            label="Difficulty"
            value={round.diff}
            onChange={d => setRound(fresh(d))}
            disabled={playing || auto.running}
            options={(Object.keys(DIFFS) as Diff[]).map(d => ({value: d, label: DIFFS[d].label, aria: d}))}
          />
          {playing ? (
            <>
              <Readout
                label={`Total Profit (${fmtMult(mult)})`}
                tone={level ? 'green' : undefined}
                value={
                  <>
                    <Coin size={14} />
                    {fmtCoins(round.stake * mult - round.stake)}
                  </>
                }
              />
              {auto.running ? (
                <AutoRow auto={auto}>{null}</AutoRow>
              ) : (
                <>
                  <button type="button" className="ghost-btn" onClick={() => choose(randInt(cfg.tiles))}>
                    <Shuffle size={15} />
                    Random pick
                  </button>
                  <PlayButton onClick={() => cashout()} disabled={level === 0} sub={level ? fmtCoins(round.stake * mult) : 'Clear a row first'}>
                    Cashout
                  </PlayButton>
                </>
              )}
            </>
          ) : (
            <>
              <Readout label="Top Floor Pays" tone="gold" value={fmtMult(towerMult(round.diff, LEVELS))} />
              <AutoRow auto={auto}>
                <PlayButton onClick={start}>Bet</PlayButton>
              </AutoRow>
            </>
          )}
          <AutoSheet auto={auto}>
            <ListStepper
              label="Cash out at floor"
              values={Array.from({length: LEVELS}, (_, i) => i + 1)}
              value={autoFloors}
              onChange={setAutoFloors}
              render={v => `${v} · ${fmtMult(towerMult(round.diff, v))}`}
            />
          </AutoSheet>
        </>
      }
      stage={
        <div className="towers">
          <div className="towers-grid" ref={gridRef}>
            {Array.from({length: LEVELS}, (_, k) => {
              const row = LEVELS - 1 - k;
              const isActive = playing && row === level;
              const cleared = row < level;
              const reveal = over && round.safe.length > 0;
              return (
                <div key={row} className={`towers-row${isActive ? ' is-active' : ''}${cleared ? ' is-cleared' : ''}`} style={{gridTemplateColumns: `repeat(${cfg.tiles}, 1fr)`}}>
                  {Array.from({length: cfg.tiles}, (_, col) => {
                    const safe = round.safe[row]?.includes(col);
                    const picked = round.picks[row] === col;
                    const hit = round.hit?.[0] === row && round.hit?.[1] === col;
                    const show = picked || hit || reveal;
                    return (
                      <button
                        key={col}
                        type="button"
                        data-row={row}
                        className={`tower-tile${picked ? ' is-picked' : ''}${hit ? ' is-hit' : ''}${show && !picked && !hit ? ' is-ghost' : ''}`}
                        disabled={!isActive}
                        onClick={() => choose(col)}
                        aria-label={isActive ? `Floor ${row + 1}, tile ${col + 1}, pays ${fmtMult(towerMult(round.diff, row + 1))}` : `Floor ${row + 1} tile ${col + 1}`}
                      >
                        {show ? <Egg bad={!safe} /> : <span className="tower-mult">{fmtMult(towerMult(round.diff, row + 1))}</span>}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <WinPopup win={win} />
        </div>
      }
    />
  );
}
