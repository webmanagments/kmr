import {useEffect, useRef, useState} from 'react';
import {useFlash, usePersistent} from '../lib/hooks';
import {focusDefault, focusEl} from '../lib/spatial';
import {HOUSE, fmtCoins, fmtMult, money, randInt} from '../lib/util';
import {fate} from '../lib/luck';
import {useWallet, wallet} from '../lib/wallet';
import {AutoRow, AutoSheet, useAutoBet} from '../ui/auto';
import {BetAmount, ListStepper, PlayButton, Readout} from '../ui/controls';
import {GameLayout, PlayingCard, RANKS, WinPopup, type CardT, type WinInfo} from '../ui/game';
import {Coin} from '../ui/icons';
import './games.css';
import './HiLo.css';

interface Step {
  card: CardT;
  guess: 'start' | 'hi' | 'lo' | 'skip';
  ok: boolean;
}

interface Round {
  phase: 'idle' | 'playing' | 'over';
  stake: number;
  mult: number;
  steps: Step[];
}

const draw = (): CardT => ({rank: randInt(13) + 1, suit: randInt(4)});

interface Option {
  label: string;
  p: number;
  test: (next: number, cur: number) => boolean;
}

function options(rank: number): {hi: Option; lo: Option} {
  if (rank === 1)
    return {
      hi: {label: 'Higher', p: 12 / 13, test: (n, c) => n > c},
      lo: {label: 'Same', p: 1 / 13, test: (n, c) => n === c},
    };
  if (rank === 13)
    return {
      hi: {label: 'Same', p: 1 / 13, test: (n, c) => n === c},
      lo: {label: 'Lower', p: 12 / 13, test: (n, c) => n < c},
    };
  return {
    hi: {label: 'Higher or Same', p: (14 - rank) / 13, test: (n, c) => n >= c},
    lo: {label: 'Lower or Same', p: rank / 13, test: (n, c) => n <= c},
  };
}

const factor = (p: number) => Math.floor((HOUSE / p) * 100) / 100;

export default function HiLo() {
  const {betAmount} = useWallet();
  const [round, setRound] = usePersistent<Round>('hilo', {phase: 'idle', stake: 0, mult: 1, steps: [{card: draw(), guess: 'start', ok: true}]});
  const [win, flashWin] = useFlash<WinInfo>();
  const [autoWins, setAutoWins] = useState(2);
  const hiRef = useRef<HTMLButtonElement>(null);
  const playing = round.phase === 'playing';
  const current = round.steps[round.steps.length - 1].card;
  const opt = options(current.rank);

  const prevPhase = useRef(round.phase);
  useEffect(() => {
    if (prevPhase.current === round.phase) return;
    prevPhase.current = round.phase;
    requestAnimationFrame(() => (round.phase === 'playing' && !auto.running ? focusEl(hiRef.current) : focusDefault()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round.phase]);

  const start = () => {
    const stake = betAmount;
    if (!wallet.debit(stake)) return;
    setRound({phase: 'playing', stake, mult: 1, steps: [{card: round.phase === 'idle' ? current : draw(), guess: 'start', ok: true}]});
  };

  const guess = (which: 'hi' | 'lo') => {
    if (!playing) return;
    const o = which === 'hi' ? opt.hi : opt.lo;
    const next = fate(draw, c => (o.test(c.rank, current.rank) ? 1 : 0));
    const ok = o.test(next.rank, current.rank);
    const steps = [...round.steps, {card: next, guess: which, ok}];
    if (!ok) {
      wallet.settle('hilo', round.stake, 0);
      setRound({...round, phase: 'over', steps});
      return;
    }
    setRound({...round, mult: money(round.mult * factor(o.p)), steps});
  };

  const skip = () => {
    if (!playing) return;
    setRound({...round, steps: [...round.steps, {card: draw(), guess: 'skip', ok: true}]});
  };

  const cashout = () => {
    if (!playing || round.mult <= 1) return;
    const payout = money(round.stake * round.mult);
    wallet.settle('hilo', round.stake, payout);
    flashWin({mult: round.mult, payout});
    setRound({...round, phase: 'over'});
  };

  const lastStep = round.steps[round.steps.length - 1];
  const lost = round.phase === 'over' && !lastStep.ok;
  const wins = round.steps.filter(s => (s.guess === 'hi' || s.guess === 'lo') && s.ok).length;

  const auto = useAutoBet({game: 'hilo', idle: !playing, trigger: start});
  // Auto: always take the more likely side, cash out after the chosen number of wins.
  useEffect(() => {
    if (!auto.running || !playing) return;
    const t = setTimeout(() => (wins >= autoWins ? cashout() : guess(opt.hi.p >= opt.lo.p ? 'hi' : 'lo')), auto.stepDelay + 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto.running, playing, round.steps.length]);

  return (
    <GameLayout
      title="HiLo"
      sidebar={
        <>
          <BetAmount locked={playing || auto.running} />
          <Readout
            label={`Total Profit (${fmtMult(round.mult)})`}
            tone={playing && round.mult > 1 ? 'green' : undefined}
            value={
              <>
                <Coin size={14} />
                {fmtCoins(playing ? round.stake * round.mult - round.stake : 0)}
              </>
            }
          />
          <div className="hilo-odds">
            <div>
              <span>▲ {opt.hi.label}</span>
              <b>{(opt.hi.p * 100).toFixed(1)}%</b>
            </div>
            <div>
              <span>▼ {opt.lo.label}</span>
              <b>{(opt.lo.p * 100).toFixed(1)}%</b>
            </div>
          </div>
          {playing ? (
            auto.running ? (
              <AutoRow auto={auto}>{null}</AutoRow>
            ) : (
              <PlayButton onClick={cashout} disabled={round.mult <= 1} autoFocus={false} sub={round.mult > 1 ? fmtCoins(round.stake * round.mult) : 'Win a guess first'}>
                Cashout
              </PlayButton>
            )
          ) : (
            <AutoRow auto={auto}>
              <PlayButton onClick={start}>Bet</PlayButton>
            </AutoRow>
          )}
          <AutoSheet auto={auto} note="Always takes the more likely side. Uses your current bet.">
            <ListStepper label="Cash out after" values={[1, 2, 3, 4, 5, 6, 8, 10]} value={autoWins} onChange={setAutoWins} render={v => `${v} correct guess${v > 1 ? 'es' : ''}`} />
          </AutoSheet>
        </>
      }
      stage={
        <div className="hilo">
          <div className="hilo-table">
            <div className="hilo-edge">
              <span>▼ ACE</span>
              <small>is lowest</small>
            </div>
            <PlayingCard key={round.steps.length} card={current} size="lg" state={lost ? 'lose' : undefined} className="hilo-card" />
            <div className="hilo-edge">
              <span>KING ▲</span>
              <small>is highest</small>
            </div>
          </div>
          <div className="hilo-actions">
            <button type="button" className="hilo-btn is-lo" disabled={!playing} onClick={() => guess('lo')}>
              <span className="hilo-arrow">▼</span>
              <span className="hilo-name">{opt.lo.label}</span>
              <span className="hilo-pay">{fmtMult(factor(opt.lo.p))}</span>
            </button>
            <button type="button" className="hilo-btn is-skip" disabled={!playing} onClick={skip} aria-label="Skip card">
              <span className="hilo-name">Skip</span>
            </button>
            <button ref={hiRef} type="button" className="hilo-btn is-hi" disabled={!playing} onClick={() => guess('hi')}>
              <span className="hilo-arrow">▲</span>
              <span className="hilo-name">{opt.hi.label}</span>
              <span className="hilo-pay">{fmtMult(factor(opt.hi.p))}</span>
            </button>
          </div>
          <div className="hilo-trail" aria-label="Card history">
            {round.steps.slice(-6).map((s, i) => (
              <div key={round.steps.length - 6 + i} className="hilo-step">
                <PlayingCard card={s.card} size="sm" state={s.guess === 'start' || s.guess === 'skip' ? undefined : s.ok ? 'win' : 'lose'} />
                <span className={`hilo-tag${s.ok ? '' : ' is-bad'}`}>
                  {s.guess === 'start' ? 'Start' : s.guess === 'skip' ? 'Skip' : s.guess === 'hi' ? '▲' : '▼'}
                </span>
              </div>
            ))}
          </div>
          <span className="sr-only">Current card {RANKS[current.rank]}</span>
          <WinPopup win={win} />
        </div>
      }
    />
  );
}
