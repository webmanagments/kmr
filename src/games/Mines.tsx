import {useEffect, useRef} from 'react';
import {useFlash, usePersistent} from '../lib/hooks';
import {focusDefault, focusEl} from '../lib/spatial';
import {HOUSE, choose, fmtCoins, fmtMult, money, randInt, shuffle} from '../lib/util';
import {useWallet, wallet} from '../lib/wallet';
import {BetAmount, ListStepper, PlayButton, Readout} from '../ui/controls';
import {GameLayout, WinPopup, type WinInfo} from '../ui/game';
import {BombIcon, Coin, GemIcon, Shuffle} from '../ui/icons';
import './games.css';
import './Mines.css';

const COUNTS = Array.from({length: 24}, (_, i) => i + 1);

interface Round {
  phase: 'idle' | 'playing' | 'over';
  stake: number;
  mines: number;
  bombs: number[];
  revealed: number[];
  hit: number | null;
  cashed: boolean;
}

const fresh = (mines: number): Round => ({phase: 'idle', stake: 0, mines, bombs: [], revealed: [], hit: null, cashed: false});

export function minesMult(mines: number, picks: number): number {
  if (picks === 0) return 1;
  return (HOUSE * choose(25, picks)) / choose(25 - mines, picks);
}

export default function Mines() {
  const {betAmount} = useWallet();
  const [round, setRound] = usePersistent<Round>('mines', fresh(3));
  const [win, flashWin] = useFlash<WinInfo>();
  const gridRef = useRef<HTMLDivElement>(null);
  const prevPhase = useRef(round.phase);

  const playing = round.phase === 'playing';
  const picks = round.revealed.length;
  const mult = minesMult(round.mines, picks);
  const nextMult = minesMult(round.mines, picks + 1);
  const gemsLeft = 25 - round.mines - picks;

  useEffect(() => {
    if (prevPhase.current === round.phase) return;
    prevPhase.current = round.phase;
    requestAnimationFrame(() => {
      if (round.phase === 'playing') focusEl(gridRef.current?.querySelector<HTMLElement>('button[data-i="12"]') ?? null);
      else focusDefault();
    });
  }, [round.phase]);

  const start = () => {
    const stake = betAmount;
    if (!wallet.debit(stake)) return;
    const bombs = shuffle(Array.from({length: 25}, (_, i) => i)).slice(0, round.mines);
    setRound({phase: 'playing', stake, mines: round.mines, bombs, revealed: [], hit: null, cashed: false});
  };

  const cashout = (r: Round = round) => {
    if (r.phase !== 'playing' || r.revealed.length === 0) return;
    const m = minesMult(r.mines, r.revealed.length);
    const payout = money(r.stake * m);
    wallet.settle('mines', r.stake, payout);
    flashWin({mult: m, payout});
    setRound({...r, phase: 'over', cashed: true});
  };

  const reveal = (i: number) => {
    if (!playing || round.revealed.includes(i)) return;
    if (round.bombs.includes(i)) {
      wallet.settle('mines', round.stake, 0);
      setRound({...round, phase: 'over', hit: i, revealed: [...round.revealed]});
      return;
    }
    const next = {...round, revealed: [...round.revealed, i]};
    if (next.revealed.length === 25 - round.mines) {
      cashout(next);
      return;
    }
    setRound(next);
  };

  const randomPick = () => {
    if (!playing) return;
    const hidden = Array.from({length: 25}, (_, i) => i).filter(i => !round.revealed.includes(i));
    const i = hidden[randInt(hidden.length)];
    reveal(i);
    requestAnimationFrame(() => focusEl(gridRef.current?.querySelector<HTMLElement>(`button[data-i="${i}"]`) ?? null));
  };

  const over = round.phase === 'over';

  return (
    <GameLayout
      title="Mines"
      sidebar={
        <>
          <BetAmount locked={playing} />
          <ListStepper
            label="Mines"
            values={COUNTS}
            value={round.mines}
            onChange={m => setRound(fresh(m))}
            disabled={playing}
            aside={`${25 - round.mines} gems`}
            tone="red"
          />
          {playing ? (
            <>
              <Readout
                label={`Total Profit (${fmtMult(mult)})`}
                tone={picks ? 'green' : undefined}
                value={
                  <>
                    <Coin size={14} />
                    {fmtCoins(round.stake * mult - round.stake)}
                  </>
                }
              />
              <button type="button" className="ghost-btn" onClick={randomPick}>
                <Shuffle size={15} />
                Pick random tile
              </button>
              <PlayButton onClick={() => cashout()} disabled={picks === 0} sub={picks ? `${fmtCoins(round.stake * mult)}` : 'Reveal a gem first'}>
                Cashout
              </PlayButton>
            </>
          ) : (
            <>
              <Readout label="First Gem Pays" value={fmtMult(minesMult(round.mines, 1))} />
              <PlayButton onClick={start}>Bet</PlayButton>
            </>
          )}
        </>
      }
      stage={
        <div className="mines">
          <div className="mines-bar">
            <span className="mines-chip">
              <GemIcon size={16} /> {playing ? gemsLeft : 25 - round.mines} left
            </span>
            <span className="mines-chip">
              <BombIcon size={16} /> {round.mines}
            </span>
            <span className="mines-chip is-next">Next {fmtMult(playing ? nextMult : minesMult(round.mines, 1))}</span>
          </div>
          <div className="mines-grid" ref={gridRef}>
            {Array.from({length: 25}, (_, i) => {
              const isBomb = round.bombs.includes(i);
              const isOpen = round.revealed.includes(i) || round.hit === i;
              const show = isOpen || (over && round.bombs.length > 0);
              const cls = show ? (isBomb ? 'is-bomb' : 'is-gem') : '';
              return (
                <button
                  key={i}
                  type="button"
                  data-i={i}
                  className={`mine-tile ${cls}${show && !isOpen ? ' is-ghost' : ''}${round.hit === i ? ' is-hit' : ''}`}
                  disabled={!playing || isOpen}
                  onClick={() => reveal(i)}
                  aria-label={show ? (isBomb ? 'Mine' : 'Gem') : `Tile ${i + 1}`}
                >
                  {show && (isBomb ? <BombIcon size={38} /> : <GemIcon size={38} />)}
                </button>
              );
            })}
          </div>
          <WinPopup win={win} />
        </div>
      }
    />
  );
}
