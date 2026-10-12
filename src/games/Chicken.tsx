import {useEffect, useRef, useState} from 'react';
import {useFlash, usePersistent, useSettler} from '../lib/hooks';
import {focusDefault} from '../lib/spatial';
import {HOUSE, fmtCoins, fmtMult, money, rand} from '../lib/util';
import {useWallet, wallet} from '../lib/wallet';
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
const HOP_MS = 300;

export const chickenMult = (d: Diff, k: number) => (k === 0 ? 1 : Math.floor((HOUSE / Math.pow(1 - RISK[d], k)) * 100) / 100);

interface Round {
  phase: 'idle' | 'playing' | 'over';
  diff: Diff;
  stake: number;
  hops: number;
  hitLane: number; // lane (1-based) where traffic hits; 0 = never
  cashed: boolean;
}

const CAR_COLORS = ['#ff4d6d', '#3d8bff', '#ffc531', '#9d5cff', '#3dd6ff', '#ff8a3d'];

function ChickenSprite({dead}: {dead?: boolean}) {
  return (
    <svg viewBox="0 0 48 48" width="46" height="46" aria-hidden="true" className={dead ? 'chk-dead' : ''}>
      <ellipse cx="24" cy="44" rx="12" ry="3" fill="rgba(0,0,0,.35)" />
      <path d="M19 38l-2 6M29 38l2 6" stroke="#ff9f1c" strokeWidth="2.5" strokeLinecap="round" />
      <ellipse cx="24" cy="28" rx="13" ry="12" fill="#fff" />
      <path d="M13 26c-5-2-6 4-2 6" fill="#e8eef5" />
      <circle cx="30" cy="16" r="8" fill="#fff" />
      <path d="M27 8c1-4 4-4 5-1 1-3 4-2 4 1" fill="#ff4d6d" />
      <path d="M37 16l6 2-6 2z" fill="#ff9f1c" />
      <circle cx="32" cy="15" r="1.8" fill="#0b1822" />
      <path d="M31 21c2 2 3 4 1 5" fill="#ff4d6d" />
    </svg>
  );
}

function Car({color}: {color: string}) {
  return (
    <svg viewBox="0 0 40 64" width="40" height="64" aria-hidden="true">
      <rect x="3" y="2" width="34" height="60" rx="9" fill={color} />
      <rect x="8" y="12" width="24" height="12" rx="3" fill="#0b1822" opacity=".75" />
      <rect x="8" y="40" width="24" height="10" rx="3" fill="#0b1822" opacity=".6" />
      <rect x="6" y="57" width="8" height="4" rx="1.5" fill="#ffd34d" />
      <rect x="26" y="57" width="8" height="4" rx="1.5" fill="#ffd34d" />
    </svg>
  );
}

export default function Chicken() {
  const {betAmount} = useWallet();
  const [round, setRound] = usePersistent<Round>('chicken', {phase: 'idle', diff: 'medium', stake: 0, hops: 0, hitLane: 0, cashed: false});
  const [hopping, setHopping] = useState(false);
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
    setRound({phase: 'playing', diff: round.diff, stake, hops: 0, hitLane, cashed: false});
  };

  const cashout = (r: Round = round) => {
    if (r.phase !== 'playing' || r.hops === 0) return;
    const m = chickenMult(r.diff, r.hops);
    const payout = money(r.stake * m);
    wallet.settle('chicken', r.stake, payout);
    flashWin({mult: m, payout});
    setRound({...r, phase: 'over', cashed: true});
  };

  const hop = () => {
    if (!playing || hopping) return;
    const next = round.hops + 1;
    setHopping(true);
    if (round.hitLane === next) {
      // Settle immediately (so leaving can't dodge it), then show the hit.
      wallet.settle('chicken', round.stake, 0);
      setRound({...round, hops: next, phase: 'over'});
      settle(() => setHopping(false), HOP_MS + 350);
      return;
    }
    const r = {...round, hops: next};
    setRound(r);
    settle(() => {
      setHopping(false);
      if (next === LANES) cashout(r);
    }, HOP_MS);
  };

  const auto = useAutoBet({game: 'chicken', idle: !playing && !hopping, trigger: start});

  // Auto: hop until the chosen lane, then cash out.
  useEffect(() => {
    if (!auto.running || !playing || hopping) return;
    const t = setTimeout(() => (round.hops >= autoHops ? cashout() : hop()), auto.stepDelay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto.running, playing, hopping, round.hops]);

  // Camera: keep the chicken ~1.5 lanes from the left edge.
  const LANE_W = 78;
  const camX = Math.max(0, round.hops - 1) * LANE_W;

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
          <div className="chk-road">
            <div className="chk-world" style={{transform: `translateX(${-camX}px)`}}>
              <div className="chk-curb" />
              {Array.from({length: LANES}, (_, i) => {
                const lane = i + 1;
                const crossed = lane <= round.hops && !(dead && lane === round.hops);
                const isHit = dead && lane === round.hops;
                const busy = !crossed && !isHit;
                return (
                  <div key={lane} className={`chk-lane${crossed ? ' is-crossed' : ''}${lane === round.hops + 1 && playing ? ' is-next' : ''}`}>
                    <div className="chk-cover">
                      {/* The chicken stands on its current lane's cover, so hide that label. */}
                      {lane !== round.hops && <span>{fmtMult(chickenMult(round.diff, lane))}</span>}
                    </div>
                    {crossed && <div className="chk-barrier" />}
                    {busy && i % 2 === 0 && (
                      <div className="chk-car is-moving" style={{animationDuration: `${1.6 + (i % 5) * 0.35}s`, animationDelay: `${-(i * 0.47) % 2}s`}}>
                        <Car color={CAR_COLORS[i % CAR_COLORS.length]} />
                      </div>
                    )}
                    {isHit && (
                      <div className="chk-car is-hit">
                        <Car color={CAR_COLORS[i % CAR_COLORS.length]} />
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="chk-goal">
                <span>FINISH</span>
              </div>
              <div className={`chk-hero${hopping ? ' is-hopping' : ''}`} style={{transform: `translateX(${round.hops * LANE_W}px)`}}>
                <ChickenSprite dead={isDeadVisible(dead, hopping)} />
              </div>
            </div>
          </div>
          <div className="chk-status">
            {round.phase === 'idle' && 'Cross the road lane by lane. Cash out before traffic gets you.'}
            {playing && (round.hops ? `${round.hops} lane${round.hops > 1 ? 's' : ''} crossed · next pays ${fmtMult(chickenMult(round.diff, round.hops + 1))}` : 'Pinch Go to hop into the first lane')}
            {round.phase === 'over' && (round.cashed ? `Cashed out at ${fmtMult(mult)}` : `Hit in lane ${round.hops}!`)}
          </div>
          <WinPopup win={win} />
        </div>
      }
    />
  );
}

function isDeadVisible(dead: boolean, hopping: boolean) {
  return dead && !hopping;
}
