import {useState} from 'react';
import {useFlash, useSettler} from '../lib/hooks';
import {HOUSE, fmtMult, money, rand, reducedMotion} from '../lib/util';
import {useWallet, wallet} from '../lib/wallet';
import {BetAmount, ListStepper, PlayButton, ProfitOnWin, Readout} from '../ui/controls';
import {GameLayout, HistoryStrip, WinPopup, type WinInfo} from '../ui/game';
import './games.css';
import './Slide.css';

const TARGETS = [1.1, 1.25, 1.5, 2, 3, 5, 10, 20, 50, 100, 1000] as const;
const W = 70;
const GAP = 6;
const COUNT = 46;
const WIN_AT = 40;
const SPIN_MS = 3600;

const sample = () => Math.min(1_000_000, Math.max(1, Math.floor((HOUSE / (1 - rand())) * 100) / 100));

function tint(m: number): string {
  if (m >= 10) return '#ffc531';
  if (m >= 3) return '#9d5cff';
  if (m >= 2) return '#00e701';
  if (m >= 1.5) return '#3d8bff';
  return '#6d8297';
}

export default function Slide() {
  const {betAmount} = useWallet();
  const [target, setTarget] = useState<number>(2);
  const [cards, setCards] = useState<number[]>(() => Array.from({length: 12}, sample));
  const [offset, setOffset] = useState(0);
  const [k, setK] = useState(0);
  const [busy, setBusy] = useState(false);
  const [landed, setLanded] = useState<number | null>(null);
  const [hist, setHist] = useState<{key: number; label: string; win: boolean}[]>([]);
  const [win, flashWin] = useFlash<WinInfo>();
  const settle = useSettler();

  const bet = () => {
    if (busy) return;
    const stake = betAmount;
    if (!wallet.debit(stake)) return;
    const value = sample();
    const ok = value >= target;
    const payout = ok ? money(stake * target) : 0;
    const strip = Array.from({length: COUNT}, (_, i) => (i === WIN_AT ? value : sample()));
    setCards(strip);
    setOffset(0);
    setK(x => x + 1);
    setLanded(null);
    setBusy(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setOffset(WIN_AT * (W + GAP) + W / 2 + (rand() - 0.5) * (W - 14))));
    settle(() => {
      setLanded(value);
      setHist(h => [{key: Date.now(), label: fmtMult(value), win: ok}, ...h].slice(0, 8));
      wallet.settle('slide', stake, payout);
      if (ok) flashWin({mult: target, payout});
      setBusy(false);
    }, (reducedMotion() ? 450 : SPIN_MS) + 80);
  };

  return (
    <GameLayout
      title="Slide"
      sidebar={
        <>
          <BetAmount locked={busy} />
          <ListStepper label="Target" values={TARGETS} value={target} onChange={setTarget} render={v => fmtMult(v)} disabled={busy} tone="green" />
          <Readout label="Win Chance" value={`${((HOUSE / target) * 100).toFixed(2)}%`} />
          <ProfitOnWin mult={target} />
          <PlayButton onClick={bet} disabled={busy}>
            {busy ? 'Sliding…' : 'Bet'}
          </PlayButton>
        </>
      }
      stage={
        <div className="slide">
          <HistoryStrip items={hist} />
          <div className="slide-center">
            <div className={`big-mult${landed !== null ? (landed >= target ? ' tone-green' : ' tone-red') : ''}`}>{landed !== null ? fmtMult(landed) : '?'}</div>
            <div className="slide-target">
              Win at <b>{fmtMult(target)}</b> or higher
            </div>
          </div>
          <div className="slide-reel">
            <div
              key={k}
              className="slide-strip"
              style={{
                transform: `translateX(${-offset}px)`,
                transition: offset ? `transform ${reducedMotion() ? 450 : SPIN_MS}ms cubic-bezier(0.1, 0.65, 0.12, 1)` : 'none',
              }}
            >
              {cards.map((m, i) => (
                <div
                  key={i}
                  className={`slide-card${landed !== null && i === WIN_AT ? (landed >= target ? ' is-win' : ' is-lose') : ''}${m >= target ? ' is-over' : ''}`}
                  style={{'--tc': tint(m)} as React.CSSProperties}
                >
                  {m >= 1000 ? `${Math.floor(m / 1000)}k×` : fmtMult(m)}
                </div>
              ))}
            </div>
            <div className="slide-marker" aria-hidden="true" />
          </div>
          <WinPopup win={win} />
        </div>
      }
    />
  );
}
