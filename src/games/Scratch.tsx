import {useEffect, useRef, useState} from 'react';
import {useFlash, usePersistent, useSettler} from '../lib/hooks';
import {sfx} from '../lib/sfx';
import {focusDefault, focusEl} from '../lib/spatial';
import {fmtCoins, fmtMult, money, shuffle, weightedIndex} from '../lib/util';
import {useWallet, wallet} from '../lib/wallet';
import {AutoRow, AutoSheet, useAutoBet} from '../ui/auto';
import {BetAmount, PlayButton, Readout} from '../ui/controls';
import {GameLayout, WinPopup, type WinInfo} from '../ui/game';
import {Coin} from '../ui/icons';
import './games.css';
import './Scratch.css';

// Match three symbols anywhere on the card to win that symbol's prize.
// Odds are fixed per card (97% return, about 1 card in 4 wins something).
type Sym = 'crown' | 'diamond' | 'clover' | 'bell' | 'lemon' | 'cherry';
export const SCRATCH_PRIZES: {id: Sym; mult: number; p: number}[] = [
  {id: 'crown', mult: 250, p: 0.0004},
  {id: 'diamond', mult: 50, p: 0.004},
  {id: 'clover', mult: 10, p: 0.017},
  {id: 'bell', mult: 5, p: 0.05},
  {id: 'lemon', mult: 2, p: 0.08},
  {id: 'cherry', mult: 1, p: 0.09},
];
const SYMS = SCRATCH_PRIZES.map(p => p.id);
const P_LOSE = 1 - SCRATCH_PRIZES.reduce((s, p) => s + p.p, 0);

function makeCard(): {cells: Sym[]; win: Sym | null} {
  const i = weightedIndex([...SCRATCH_PRIZES.map(p => p.p), P_LOSE]);
  const win = i < SCRATCH_PRIZES.length ? SCRATCH_PRIZES[i].id : null;
  // Every other symbol appears at most twice, so only the winner can make three.
  const pool = shuffle(SYMS.filter(s => s !== win).flatMap(s => [s, s]));
  const cells = win ? [win, win, win, ...pool.slice(0, 6)] : pool.slice(0, 9);
  return {cells: shuffle(cells), win};
}

interface Round {
  phase: 'idle' | 'playing' | 'over';
  stake: number;
  cells: Sym[];
  revealed: boolean[];
  win: Sym | null;
}

const EMPTY: Round = {phase: 'idle', stake: 0, cells: [], revealed: [], win: null};

export function SymbolIcon({s, size = 50}: {s: Sym; size?: number}) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" className={`sym sym-${s}`}>
      {s === 'cherry' && (
        <>
          <path d="M22 40C24 26 30 16 44 10M42 40C40 28 40 18 44 10" fill="none" stroke="#2f9e44" strokeWidth="3.5" strokeLinecap="round" />
          <path d="M44 10c6-2 12 0 14 4-6 2-11 1-14-4z" fill="#3fbf5a" />
          <circle cx="21" cy="45" r="11" fill="#e8173d" />
          <circle cx="43" cy="45" r="11" fill="#ff2d55" />
          <circle cx="17" cy="41" r="3" fill="#fff" opacity=".6" />
          <circle cx="39" cy="41" r="3" fill="#fff" opacity=".6" />
        </>
      )}
      {s === 'lemon' && (
        <>
          <ellipse cx="32" cy="34" rx="22" ry="16" fill="#ffd43b" transform="rotate(-20 32 34)" />
          <ellipse cx="32" cy="34" rx="22" ry="16" fill="none" stroke="#f0a500" strokeWidth="2" transform="rotate(-20 32 34)" />
          <path d="M50 22l6-6" stroke="#2f9e44" strokeWidth="3.5" strokeLinecap="round" />
          <ellipse cx="24" cy="28" rx="6" ry="3" fill="#fff" opacity=".55" transform="rotate(-20 24 28)" />
        </>
      )}
      {s === 'bell' && (
        <>
          <path d="M32 8c-11 0-16 10-16 20v10l-6 8h44l-6-8V28c0-10-5-20-16-20z" fill="#ffc531" />
          <path d="M32 8c-11 0-16 10-16 20v10l-6 8h44" fill="none" stroke="#c27c00" strokeWidth="2" />
          <circle cx="32" cy="52" r="6" fill="#c27c00" />
          <path d="M23 20c2-5 5-7 8-7" stroke="#fff6c8" strokeWidth="3" strokeLinecap="round" fill="none" />
        </>
      )}
      {s === 'clover' && (
        <>
          <path d="M32 34c4 10 6 16 4 24" stroke="#1f8a3a" strokeWidth="3.5" strokeLinecap="round" fill="none" />
          {[0, 90, 180, 270].map(a => (
            <g key={a} transform={`rotate(${a} 32 30)`}>
              <path d="M32 30c-10-4-14-14-8-18 4-3 8 0 8 4 0-4 4-7 8-4 6 4 2 14-8 18z" fill="#2fd15a" stroke="#1f8a3a" strokeWidth="1.5" />
            </g>
          ))}
          <circle cx="32" cy="30" r="3" fill="#1f8a3a" />
        </>
      )}
      {s === 'diamond' && (
        <>
          <path d="M16 22l8-10h16l8 10-16 30z" fill="#4dabf7" />
          <path d="M16 22h32L32 52z" fill="#228be6" />
          <path d="M24 12l-2 10 10 30 10-30-2-10" fill="none" stroke="#d0ebff" strokeWidth="1.5" />
          <path d="M22 22h20" stroke="#d0ebff" strokeWidth="1.5" />
          <path d="M26 15l-3 5" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
        </>
      )}
      {s === 'crown' && (
        <>
          <path d="M10 46l-2-26 13 10 11-18 11 18 13-10-2 26z" fill="#ffc531" />
          <path d="M10 46l-2-26 13 10 11-18 11 18 13-10-2 26z" fill="none" stroke="#c27c00" strokeWidth="2" strokeLinejoin="round" />
          <rect x="10" y="46" width="44" height="7" rx="2" fill="#e0a400" />
          <circle cx="32" cy="38" r="4" fill="#e8173d" />
          <circle cx="20" cy="40" r="3" fill="#228be6" />
          <circle cx="44" cy="40" r="3" fill="#228be6" />
          <circle cx="8" cy="20" r="3" fill="#ffc531" />
          <circle cx="32" cy="12" r="3" fill="#ffc531" />
          <circle cx="56" cy="20" r="3" fill="#ffc531" />
        </>
      )}
    </svg>
  );
}

const NAMES: Record<Sym, string> = {crown: 'Crown', diamond: 'Diamond', clover: 'Clover', bell: 'Bell', lemon: 'Lemon', cherry: 'Cherries'};

export default function Scratch() {
  const {betAmount} = useWallet();
  const [round, setRound, latest] = usePersistent<Round>('scratch', EMPTY);
  const [win, flashWin] = useFlash<WinInfo>(2200);
  const [revealing, setRevealing] = useState(false);
  const settle = useSettler();
  const gridRef = useRef<HTMLDivElement>(null);
  const playing = round.phase === 'playing';

  const prevPhase = useRef(round.phase);
  useEffect(() => {
    if (prevPhase.current === round.phase) return;
    prevPhase.current = round.phase;
    requestAnimationFrame(() => (round.phase === 'playing' && !auto.running ? focusEl(gridRef.current?.querySelector<HTMLElement>('button') ?? null) : focusDefault()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round.phase]);

  const finish = (r: Round) => {
    const prize = SCRATCH_PRIZES.find(p => p.id === r.win);
    const payout = prize ? money(r.stake * prize.mult) : 0;
    wallet.settle('scratch', r.stake, payout);
    if (prize && prize.mult > 1) flashWin({mult: prize.mult, payout});
    setRound({...r, phase: 'over'});
  };

  const buy = () => {
    if (playing || revealing) return;
    const stake = wallet.get().betAmount;
    if (!wallet.debit(stake)) return;
    const {cells, win} = makeCard();
    sfx('flip');
    setRound({phase: 'playing', stake, cells, revealed: cells.map(() => false), win});
  };

  const reveal = (i: number) => {
    const r = latest();
    if (r.phase !== 'playing' || r.revealed[i]) return;
    sfx('scratch');
    const revealed = r.revealed.map((v, j) => v || j === i);
    const next = {...r, revealed};
    setRound(next);
    // Matching a pair or the winning third gets its own chime.
    const sym = r.cells[i];
    const seen = r.cells.filter((c, j) => revealed[j] && c === sym).length;
    if (seen === 3) settle(() => sfx('multi'), 240);
    else if (seen === 2) settle(() => sfx('pickup'), 240);
    if (revealed.every(Boolean)) settle(() => finish(latest()), 420);
  };

  const revealAll = () => {
    const r = latest();
    if (r.phase !== 'playing' || revealing) return;
    setRevealing(true);
    const order = r.revealed.map((v, i) => (v ? -1 : i)).filter(i => i >= 0);
    order.forEach((i, k) => settle(() => reveal(i), k * 130));
    settle(() => setRevealing(false), order.length * 130 + 450);
  };

  const auto = useAutoBet({game: 'scratch', idle: !playing && !revealing, trigger: buy, delay: 700});
  useEffect(() => {
    if (!auto.running || !playing || revealing) return;
    const t = setTimeout(revealAll, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto.running, playing, revealing]);

  const done = round.phase === 'over';
  const counts = new Map<Sym, number>();
  round.cells.forEach((c, i) => round.revealed[i] && counts.set(c, (counts.get(c) ?? 0) + 1));
  const prize = SCRATCH_PRIZES.find(p => p.id === round.win);
  const left = round.revealed.filter(v => !v).length;

  return (
    <GameLayout
      title="Scratch Cards"
      sidebar={
        <>
          <BetAmount locked={playing || auto.running} />
          <Readout label="Top prize" tone="gold" value={<>250× · {fmtCoins(betAmount * 250)}</>} />
          <div className="scr-odds">
            <span>Match 3 of the same symbol anywhere on the card.</span>
            <span>About 1 card in 4 wins.</span>
          </div>
          <AutoRow auto={auto}>
            {playing ? (
              <PlayButton onClick={revealAll} disabled={revealing} tone="blue" sub={`${left} spot${left === 1 ? '' : 's'} left`}>
                Reveal all
              </PlayButton>
            ) : (
              <PlayButton onClick={buy} sub={`Card costs ${fmtCoins(betAmount)}`}>
                {done ? 'New card' : 'Buy card'}
              </PlayButton>
            )}
          </AutoRow>
          <AutoSheet auto={auto} note="Buys a card and scratches every spot." />
        </>
      }
      stage={
        <div className="scr">
          <div className={`scr-card${round.phase === 'idle' ? ' is-idle' : ''}${done ? (prize ? ' is-win' : ' is-lose') : ''}`} key={round.phase === 'idle' ? 'idle' : round.cells.join()}>
            <div className="scr-head">
              <span className="scr-title">Lucky Scratch</span>
              <span className="scr-sub">Match 3 to win</span>
            </div>
            <div className="scr-grid" ref={gridRef}>
              {Array.from({length: 9}, (_, i) => {
                const sym = round.cells[i];
                const open = round.phase !== 'idle' && round.revealed[i];
                const match = open && sym && (counts.get(sym) ?? 0) >= 2;
                const winning = done && sym === round.win;
                return (
                  <button
                    key={i}
                    type="button"
                    className={`scr-cell${open ? ' is-open' : ''}${match ? ' is-match' : ''}${winning ? ' is-winning' : ''}`}
                    onClick={() => reveal(i)}
                    aria-disabled={!playing || open}
                    disabled={round.phase === 'idle'}
                    aria-label={open && sym ? NAMES[sym] : `Scratch spot ${i + 1}`}
                  >
                    {sym && <SymbolIcon s={sym} />}
                    <span className="scr-foil" aria-hidden="true">
                      {Array.from({length: 5}, (_, k) => (
                        <i key={k} style={{animationDelay: `${k * 45}ms`}} />
                      ))}
                      <b>?</b>
                    </span>
                    {open && (
                      <span className="scr-flakes" aria-hidden="true">
                        {Array.from({length: 6}, (_, k) => (
                          <i key={k} style={{'--a': `${k * 60 + ((i * 17) % 30)}deg`} as React.CSSProperties} />
                        ))}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="scr-table">
              {SCRATCH_PRIZES.map(p => (
                <div key={p.id} className={`scr-prize${done && round.win === p.id ? ' is-on' : ''}`}>
                  <SymbolIcon s={p.id} size={22} />
                  <b>{fmtMult(p.mult)}</b>
                </div>
              ))}
            </div>
          </div>
          <div className={`scr-status${done ? (prize && prize.mult > 1 ? ' is-win' : prize ? '' : ' is-lose') : ''}`}>
            {round.phase === 'idle' && 'Buy a card, then pinch each spot to scratch it.'}
            {playing && `${9 - left} of 9 scratched${[...counts.values()].some(n => n >= 2) ? ' — you have a pair!' : ''}`}
            {done && (prize ? `Three ${NAMES[prize.id].toLowerCase()}! ${prize.mult > 1 ? `You win ${fmtMult(prize.mult)}` : 'Your money back'}` : 'No match this time')}
            {done && prize && (
              <span className="scr-pay">
                <Coin size={13} />
                {fmtCoins(round.stake * prize.mult)}
              </span>
            )}
          </div>
          <WinPopup win={win} />
        </div>
      }
    />
  );
}
