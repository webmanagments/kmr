import {useState} from 'react';
import {useFlash, useSettler} from '../lib/hooks';
import {HOUSE, money, rand} from '../lib/util';
import {useWallet, wallet} from '../lib/wallet';
import {BetAmount, ListStepper, PlayButton, ProfitOnWin, Segmented} from '../ui/controls';
import {GameLayout, HistoryStrip, WinPopup, type WinInfo} from '../ui/game';
import './games.css';

const MULTS = [1.0102, 1.1, 1.25, 1.5, 1.75, 1.98, 2.5, 3, 4, 5, 7.5, 10, 15, 20, 33, 49.5] as const;

interface Roll {
  key: number;
  value: number;
  win: boolean;
}

export default function Dice() {
  const {betAmount} = useWallet();
  const [mult, setMult] = useState<number>(1.98);
  const [mode, setMode] = useState<'over' | 'under'>('over');
  const [rolls, setRolls] = useState<Roll[]>([]);
  const [busy, setBusy] = useState(false);
  const [win, flashWin] = useFlash<WinInfo>();
  const settle = useSettler();

  const chance = (HOUSE * 100) / mult; // win chance in %
  const target = mode === 'over' ? money(100 - chance) : money(chance);
  const last = rolls[0];

  const bet = () => {
    if (busy) return;
    const stake = betAmount;
    if (!wallet.debit(stake)) return;
    const value = Math.floor(rand() * 10001) / 100;
    const won = mode === 'over' ? value > target : value < target;
    const payout = won ? money(stake * mult) : 0;
    setBusy(true);
    setRolls(r => [{key: Date.now(), value, win: won}, ...r].slice(0, 8));
    settle(() => {
      wallet.settle('dice', stake, payout);
      if (won) flashWin({mult, payout});
      setBusy(false);
    }, 380);
  };

  const pos = last ? last.value : 50;

  return (
    <GameLayout
      title="Dice"
      sidebar={
        <>
          <BetAmount locked={busy} />
          <ListStepper
            label="Multiplier"
            values={MULTS}
            value={mult}
            onChange={setMult}
            render={v => `${v.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}×`}
            disabled={busy}
          />
          <Segmented
            label="Roll"
            value={mode}
            onChange={setMode}
            disabled={busy}
            options={[
              {value: 'over', label: 'Over'},
              {value: 'under', label: 'Under'},
            ]}
          />
          <ProfitOnWin mult={mult} />
          <PlayButton onClick={bet} disabled={busy}>
            Bet
          </PlayButton>
        </>
      }
      stage={
        <div className="dice">
          <HistoryStrip items={rolls.map(r => ({key: r.key, label: r.value.toFixed(2), win: r.win}))} />
          <div className={`dice-result${last ? (last.win ? ' is-win' : ' is-lose') : ''}`} aria-live="polite">
            {last ? last.value.toFixed(2) : '—'}
          </div>
          <div className="dice-track-wrap">
            <div className="dice-scale">
              {[0, 25, 50, 75, 100].map(n => (
                <span key={n} style={{left: `${n}%`}}>
                  {n}
                </span>
              ))}
            </div>
            <div className="dice-track">
              <div
                className="dice-fill"
                style={
                  mode === 'over'
                    ? {background: `linear-gradient(90deg, var(--red) ${target}%, var(--green) ${target}%)`}
                    : {background: `linear-gradient(90deg, var(--green) ${target}%, var(--red) ${target}%)`}
                }
              />
              <div className="dice-handle" style={{left: `${target}%`}} aria-hidden="true">
                <i />
                <i />
                <i />
              </div>
              {last && (
                <div key={last.key} className={`dice-marker${last.win ? ' is-win' : ''}`} style={{left: `${pos}%`}}>
                  <span>{last.value.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>
          <div className="info-row">
            <div className="info-box">
              <span>Multiplier</span>
              <b>{mult.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}×</b>
            </div>
            <div className="info-box">
              <span>Roll {mode === 'over' ? 'Over' : 'Under'}</span>
              <b>{target.toFixed(2)}</b>
            </div>
            <div className="info-box">
              <span>Win Chance</span>
              <b>{chance.toFixed(2)}%</b>
            </div>
          </div>
          <WinPopup win={win} />
        </div>
      }
    />
  );
}
