import {useEffect, useRef, useState} from 'react';
import {useFlash, usePersistent} from '../lib/hooks';
import {focusDefault} from '../lib/spatial';
import {HOUSE, choose, fmtCoins, fmtMult, money, shuffle} from '../lib/util';
import {fate} from '../lib/luck';
import {useWallet, wallet} from '../lib/wallet';
import {AutoRow, AutoSheet, useAutoBet} from '../ui/auto';
import {BetAmount, ListStepper, PlayButton, Readout, Segmented} from '../ui/controls';
import {GameLayout, WinPopup, type WinInfo} from '../ui/game';
import {Coin} from '../ui/icons';
import './games.css';
import './Pump.css';

type Diff = 'easy' | 'medium' | 'hard' | 'expert';
const POPS: Record<Diff, number> = {easy: 1, medium: 3, hard: 5, expert: 10};
const STEPS = 25;

interface Round {
  phase: 'idle' | 'playing' | 'over';
  diff: Diff;
  stake: number;
  popAt: number; // pump number that pops (1-based)
  pumps: number;
  popped: boolean;
}

const pumpMult = (diff: Diff, k: number) => (k === 0 ? 1 : Math.floor(((HOUSE * choose(STEPS, k)) / choose(STEPS - POPS[diff], k)) * 100) / 100);

export default function Pump() {
  const {betAmount} = useWallet();
  const [round, setRound] = usePersistent<Round>('pump', {phase: 'idle', diff: 'medium', stake: 0, popAt: 0, pumps: 0, popped: false});
  const [win, flashWin] = useFlash<WinInfo>();
  const [puff, setPuff] = useState(0);
  const [autoPumps, setAutoPumps] = useState(3);
  const playing = round.phase === 'playing';
  const maxPumps = STEPS - POPS[round.diff];
  const mult = pumpMult(round.diff, round.pumps);

  const prevPhase = useRef(round.phase);
  useEffect(() => {
    if (prevPhase.current === round.phase) return;
    prevPhase.current = round.phase;
    requestAnimationFrame(() => focusDefault());
  }, [round.phase]);

  const start = () => {
    const stake = betAmount;
    if (!wallet.debit(stake)) return;
    // Luck: a later pop is better for the player.
    const popAt = fate(
      () => Math.min(...shuffle(Array.from({length: STEPS}, (_, i) => i)).slice(0, POPS[round.diff])) + 1,
      v => v,
    );
    setRound({phase: 'playing', diff: round.diff, stake, popAt, pumps: 0, popped: false});
  };

  const cashout = (r: Round = round) => {
    if (r.phase !== 'playing' || r.pumps === 0) return;
    const m = pumpMult(r.diff, r.pumps);
    const payout = money(r.stake * m);
    wallet.settle('pump', r.stake, payout);
    flashWin({mult: m, payout});
    setRound({...r, phase: 'over'});
  };

  const pump = () => {
    if (!playing) return;
    const k = round.pumps + 1;
    setPuff(p => p + 1);
    if (k === round.popAt) {
      wallet.settle('pump', round.stake, 0);
      setRound({...round, pumps: k, phase: 'over', popped: true});
      return;
    }
    const next = {...round, pumps: k};
    if (k >= maxPumps) cashout(next);
    else setRound(next);
  };

  const auto = useAutoBet({game: 'pump', idle: !playing, trigger: start});
  // Auto: pump to the chosen count, then cash out.
  useEffect(() => {
    if (!auto.running || !playing) return;
    const t = setTimeout(() => (round.pumps >= Math.min(autoPumps, maxPumps) ? cashout() : pump()), auto.stepDelay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto.running, playing, round.pumps]);

  const size = 1 + Math.min(round.pumps, 24) * 0.035;
  const ladder = Array.from({length: 5}, (_, i) => round.pumps + i + 1).filter(k => k <= maxPumps);

  return (
    <GameLayout
      title="Pump"
      sidebar={
        <>
          <BetAmount locked={playing || auto.running} />
          <Segmented
            label="Difficulty"
            value={round.diff}
            onChange={d => setRound({phase: 'idle', diff: d, stake: 0, popAt: 0, pumps: 0, popped: false})}
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
            tone={playing && round.pumps ? 'green' : undefined}
            value={
              <>
                <Coin size={14} />
                {fmtCoins(playing ? round.stake * mult - round.stake : 0)}
              </>
            }
          />
          {playing ? (
            auto.running ? (
              <AutoRow auto={auto}>{null}</AutoRow>
            ) : (
              <>
                <PlayButton onClick={pump} sub={`Next ${fmtMult(pumpMult(round.diff, round.pumps + 1))}`}>
                  Pump
                </PlayButton>
                <button type="button" className="ghost-btn pump-cash" onClick={() => cashout()} disabled={round.pumps === 0}>
                  Cashout {round.pumps ? fmtCoins(round.stake * mult) : ''}
                </button>
              </>
            )
          ) : (
            <AutoRow auto={auto}>
              <PlayButton onClick={start}>Bet</PlayButton>
            </AutoRow>
          )}
          <AutoSheet auto={auto}>
            <ListStepper
              label="Cash out after"
              values={Array.from({length: maxPumps}, (_, i) => i + 1)}
              value={Math.min(autoPumps, maxPumps)}
              onChange={setAutoPumps}
              render={v => `${v} pump${v > 1 ? 's' : ''} · ${fmtMult(pumpMult(round.diff, v))}`}
            />
          </AutoSheet>
        </>
      }
      stage={
        <div className="pump">
          <div className="pump-stage">
            <div className="pump-mult">
              <span className={`big-mult${round.popped ? ' tone-red' : round.phase === 'over' ? ' tone-green' : ''}`}>{fmtMult(round.phase === 'idle' ? 1 : mult)}</span>
              <small>
                {round.popped ? 'POP! Balloon burst' : playing ? `${round.pumps} pump${round.pumps === 1 ? '' : 's'}` : round.phase === 'over' ? 'Cashed out' : 'Pump without popping'}
              </small>
            </div>
            {round.popped ? (
              <svg key="pop" viewBox="0 0 200 200" className="pump-burst" aria-hidden="true">
                {Array.from({length: 12}, (_, i) => {
                  const a = (i / 12) * Math.PI * 2;
                  return <path key={i} d={`M${100 + Math.cos(a) * 30} ${100 + Math.sin(a) * 30} L${100 + Math.cos(a) * 80} ${100 + Math.sin(a) * 80}`} stroke={i % 2 ? '#ff4d6d' : '#ffc531'} strokeWidth="8" strokeLinecap="round" />;
                })}
                <circle cx="100" cy="100" r="22" fill="#ff4d6d" />
              </svg>
            ) : (
              <svg key={`b${puff}`} viewBox="0 0 200 240" className="pump-balloon" style={{transform: `scale(${size})`}} aria-hidden="true">
                <defs>
                  <radialGradient id="pumpG" cx="0.35" cy="0.3" r="0.8">
                    <stop offset="0" stopColor="#ffb3dc" />
                    <stop offset="0.45" stopColor="#ff4fb5" />
                    <stop offset="1" stopColor="#a21caf" />
                  </radialGradient>
                </defs>
                <path d="M100 182c-4 14 8 22 0 40" stroke="#fff" strokeOpacity=".6" strokeWidth="2.5" fill="none" />
                <ellipse cx="100" cy="100" rx="66" ry="80" fill="url(#pumpG)" />
                <ellipse cx="76" cy="66" rx="14" ry="22" fill="#fff" opacity=".45" transform="rotate(-20 76 66)" />
                <path d="M92 178h16l-8 10z" fill="#a21caf" />
              </svg>
            )}
          </div>
          <div className="pump-ladder">
            {ladder.map((k, i) => (
              <div key={k} className={`pump-rung${i === 0 && playing ? ' is-next' : ''}`}>
                <span>#{k}</span>
                <b>{fmtMult(pumpMult(round.diff, k))}</b>
              </div>
            ))}
          </div>
          <WinPopup win={win} />
        </div>
      }
    />
  );
}
