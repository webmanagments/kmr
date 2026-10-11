import {useState} from 'react';
import {useFlash, useSettler} from '../lib/hooks';
import {fmtMult, money, randInt} from '../lib/util';
import {useWallet, wallet} from '../lib/wallet';
import {BetAmount, PlayButton} from '../ui/controls';
import {GameLayout, HistoryStrip, WinPopup, type WinInfo} from '../ui/game';
import './games.css';
import './Diamonds.css';

const COLORS = [
  ['#00e701', '#00a800', '#8dff8f'],
  ['#9d5cff', '#6a2fd1', '#d3b8ff'],
  ['#ffc531', '#d99a00', '#fff0a8'],
  ['#ff4d6d', '#c4163a', '#ffb3c0'],
  ['#3dd6ff', '#0f9bc4', '#c4f3ff'],
  ['#ff6fd8', '#c0279b', '#ffd0f3'],
  ['#4d8dff', '#1d4fd1', '#c9dcff'],
];

// 7 colours, 5 gems → exact pattern probabilities out of 16,807. RTP ≈ 99.3%.
const PAYS = [
  {id: '5', name: 'Five of a kind', mult: 50, shape: [0, 0, 0, 0, 0]},
  {id: '4', name: 'Four of a kind', mult: 5, shape: [0, 0, 0, 0, 1]},
  {id: 'fh', name: 'Full house', mult: 4, shape: [0, 0, 0, 1, 1]},
  {id: '3', name: 'Three of a kind', mult: 3, shape: [0, 0, 0, 1, 2]},
  {id: '2p', name: 'Two pair', mult: 2, shape: [0, 0, 1, 1, 2]},
  {id: '1p', name: 'One pair', mult: 0.12, shape: [0, 0, 1, 2, 3]},
  {id: '0', name: 'No match', mult: 0, shape: [0, 1, 2, 3, 4]},
];

function classify(gems: number[]): string {
  const counts = new Map<number, number>();
  gems.forEach(g => counts.set(g, (counts.get(g) ?? 0) + 1));
  const c = [...counts.values()].sort((a, b) => b - a).join('');
  return ({'5': '5', '41': '4', '32': 'fh', '311': '3', '221': '2p', '2111': '1p'} as Record<string, string>)[c] ?? '0';
}

function Gem({c, size = 54}: {c: number; size?: number}) {
  const [a, b, h] = COLORS[c];
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      <path d="M12 6h24l9 12-21 25L3 18z" fill={a} />
      <path d="M12 6l6 12h12l6-12zM3 18h42L24 43z" fill={b} />
      <path d="M18 18h12L24 43z" fill={a} />
      <path d="M12 6l6 12H3z" fill={h} />
    </svg>
  );
}

export default function Diamonds() {
  const {betAmount} = useWallet();
  const [gems, setGems] = useState<number[] | null>(null);
  const [hit, setHit] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [roll, setRoll] = useState(0);
  const [hist, setHist] = useState<{key: number; label: string; win: boolean}[]>([]);
  const [win, flashWin] = useFlash<WinInfo>();
  const settle = useSettler();

  const bet = () => {
    if (busy) return;
    const stake = betAmount;
    if (!wallet.debit(stake)) return;
    const g = Array.from({length: 5}, () => randInt(7));
    const id = classify(g);
    const mult = PAYS.find(p => p.id === id)!.mult;
    const payout = money(stake * mult);
    setBusy(true);
    setHit(null);
    setGems(g);
    setRoll(r => r + 1);
    settle(() => {
      setHit(id);
      setHist(h => [{key: Date.now(), label: fmtMult(mult), win: mult >= 1}, ...h].slice(0, 8));
      wallet.settle('diamonds', stake, payout);
      if (mult > 0) flashWin({mult, payout});
      setBusy(false);
    }, 5 * 110 + 200);
  };

  // Which gems belong to the winning pattern (any colour appearing 2+ times).
  const counts = new Map<number, number>();
  gems?.forEach(g => counts.set(g, (counts.get(g) ?? 0) + 1));

  return (
    <GameLayout
      title="Diamonds"
      sidebar={
        <>
          <BetAmount locked={busy} />
          <div className="dia-note">Match colours across five gems. Bigger sets pay more.</div>
          <PlayButton onClick={bet} disabled={busy}>
            Bet
          </PlayButton>
        </>
      }
      stage={
        <div className="dia">
          <HistoryStrip items={hist} />
          <div className="dia-row">
            {Array.from({length: 5}, (_, i) => {
              const g = gems?.[i];
              const matched = hit && g !== undefined && (counts.get(g) ?? 0) >= 2 && hit !== '0';
              return (
                <div key={`${roll}-${i}`} className={`dia-slot${matched ? ' is-match' : ''}${hit && !matched ? ' is-dim' : ''}`} style={{animationDelay: `${i * 110}ms`}}>
                  {g !== undefined ? (
                    <div className="dia-gem" style={{animationDelay: `${i * 110}ms`}}>
                      <Gem c={g} />
                    </div>
                  ) : (
                    <div className="dia-empty" />
                  )}
                </div>
              );
            })}
          </div>
          <div className="dia-pays">
            {PAYS.map(p => (
              <div key={p.id} className={`dia-pay${hit === p.id ? ' is-hit' : ''}`}>
                <span className="dia-shape">
                  {p.shape.map((s, i) => (
                    <i key={i} style={{background: COLORS[s][0]}} />
                  ))}
                </span>
                <span className="dia-name">{p.name}</span>
                <b>{fmtMult(p.mult)}</b>
              </div>
            ))}
          </div>
          <WinPopup win={win} />
        </div>
      }
    />
  );
}
