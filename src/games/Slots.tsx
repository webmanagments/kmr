import {useState, type ReactNode} from 'react';
import {useFlash, useSettler} from '../lib/hooks';
import {money, reducedMotion, weightedIndex} from '../lib/util';
import {fate} from '../lib/luck';
import {useWallet, wallet} from '../lib/wallet';
import {AutoRow, AutoSheet, useAutoBet} from '../ui/auto';
import {BetAmount, PlayButton, Readout} from '../ui/controls';
import {GameLayout, WinPopup, type WinInfo} from '../ui/game';
import './games.css';
import './Slots.css';

// 8 symbols, independent cells. 5 paylines; total bet split evenly per line.
// Three-of-a-kind pays below (× line bet); two cherries from the left pay 0.5×. RTP ≈ 96.6%.
const WEIGHTS = [30, 25, 20, 15, 9, 6, 4, 2];
const PAYS = [15, 24, 30, 45, 75, 150, 300, 750];
const NAMES = ['Cherry', 'Lemon', 'Orange', 'Grapes', 'Bell', 'Bar', 'Seven', 'Diamond'];
const LINES: [number, number][][] = [
  [[0, 1], [1, 1], [2, 1]], // middle
  [[0, 0], [1, 0], [2, 0]], // top
  [[0, 2], [1, 2], [2, 2]], // bottom
  [[0, 0], [1, 1], [2, 2]], // diagonal down
  [[0, 2], [1, 1], [2, 0]], // diagonal up
];
const LINE_COLORS = ['#ffc531', '#00e701', '#3dd6ff', '#ff6fd8', '#9d5cff'];
const STRIP = 22;
const STOPS = [900, 1250, 1600];

const SYMBOLS: ReactNode[] = [
  <g key="c">
    <path d="M30 14c6 2 10 8 10 16M30 14c-6 6-10 12-12 20" stroke="#2f9e44" strokeWidth="3" fill="none" />
    <path d="M30 14c6-4 12-4 16 0-6 3-11 3-16 0z" fill="#40c057" />
    <circle cx="18" cy="38" r="9" fill="#e03131" />
    <circle cx="40" cy="36" r="9" fill="#f03e3e" />
    <circle cx="15" cy="35" r="2.5" fill="#fff" opacity=".7" />
    <circle cx="37" cy="33" r="2.5" fill="#fff" opacity=".7" />
  </g>,
  <g key="l">
    <ellipse cx="30" cy="30" rx="19" ry="14" fill="#ffd43b" />
    <path d="M10 30l-4-2M50 30l4-2" stroke="#fab005" strokeWidth="4" strokeLinecap="round" />
    <ellipse cx="24" cy="25" rx="6" ry="3" fill="#fff" opacity=".55" />
  </g>,
  <g key="o">
    <circle cx="30" cy="32" r="17" fill="#fd7e14" />
    <path d="M30 15c2-4 6-5 9-4-2 3-5 4-9 4z" fill="#40c057" />
    <circle cx="24" cy="26" r="4" fill="#fff" opacity=".45" />
  </g>,
  <g key="g">
    {[
      [22, 22],
      [34, 22],
      [28, 31],
      [16, 31],
      [40, 31],
      [22, 40],
      [34, 40],
      [28, 48],
    ].map(([x, y], i) => (
      <circle key={i} cx={x} cy={y} r="6.5" fill="#9c36b5" stroke="#cc5de8" strokeWidth="1.5" />
    ))}
    <path d="M28 16v-6" stroke="#2f9e44" strokeWidth="3" strokeLinecap="round" />
  </g>,
  <g key="b">
    <path d="M30 10c-11 0-14 10-14 18 0 6-4 10-6 12h40c-2-2-6-6-6-12 0-8-3-18-14-18z" fill="#fcc419" />
    <circle cx="30" cy="45" r="5" fill="#e67700" />
    <path d="M22 18c2-3 5-4 8-4" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".6" />
  </g>,
  <g key="bar">
    <rect x="6" y="18" width="48" height="24" rx="5" fill="#212529" stroke="#adb5bd" strokeWidth="2.5" />
    <text x="30" y="36" textAnchor="middle" fontSize="15" fontWeight="900" fill="#fff" fontFamily="system-ui,Arial">
      BAR
    </text>
  </g>,
  <g key="7">
    <text x="30" y="48" textAnchor="middle" fontSize="46" fontWeight="900" fontStyle="italic" fill="#f03e3e" stroke="#fff" strokeWidth="2" fontFamily="system-ui,Arial">
      7
    </text>
  </g>,
  <g key="d">
    <path d="M18 14h24l10 12-22 26L8 26z" fill="#3bc9db" />
    <path d="M18 14l6 12h12l6-12zM8 26h44L30 52z" fill="#1098ad" />
    <path d="M18 14l6 12H8z" fill="#fff" opacity=".6" />
  </g>,
];

function Sym({s}: {s: number}) {
  return (
    <svg viewBox="0 0 60 60" className="slot-sym" aria-label={NAMES[s]} role="img">
      {SYMBOLS[s]}
    </svg>
  );
}

const roll = () => weightedIndex(WEIGHTS);

export default function Slots() {
  const {betAmount} = useWallet();
  const [grid, setGrid] = useState<number[][]>(() => [0, 1, 2].map(() => [roll(), roll(), roll()]));
  const [strips, setStrips] = useState<number[][] | null>(null);
  const [spinKey, setSpinKey] = useState(0);
  const [stopped, setStopped] = useState(3);
  const [wins, setWins] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [lastWin, setLastWin] = useState(0);
  const [win, flashWin] = useFlash<WinInfo>(2200);
  const settle = useSettler();

  const spin = () => {
    if (busy) return;
    const stake = betAmount;
    if (!wallet.debit(stake)) return;
    const lineBet = stake / LINES.length;
    const score = (g: number[][]) => {
      let pay = 0;
      const hitLines: number[] = [];
      LINES.forEach((line, li) => {
        const [a, b, c] = line.map(([col, row]) => g[col][row]);
        if (a === b && b === c) {
          pay += PAYS[a] * lineBet;
          hitLines.push(li);
        } else if (a === 0 && b === 0) {
          pay += 0.5 * lineBet;
          hitLines.push(li);
        }
      });
      return {pay, hitLines};
    };
    const next = fate(
      () => [0, 1, 2].map(() => [roll(), roll(), roll()]), // next[col][row]
      g => score(g).pay,
    );
    const {pay, hitLines} = score(next);
    const payout = money(pay);
    // Each strip: final 3 symbols on top, random filler below; animates downward to rest at 0.
    setStrips(next.map(col => [...col, ...Array.from({length: STRIP}, roll)]));
    setSpinKey(k => k + 1);
    setStopped(0);
    setWins([]);
    setBusy(true);
    const fast = reducedMotion();
    STOPS.forEach((ms, i) => settle(() => setStopped(s => Math.max(s, i + 1)), fast ? 100 + i * 60 : ms));
    settle(() => {
      setGrid(next);
      setWins(hitLines);
      setLastWin(payout);
      setBusy(false);
      wallet.settle('slots', stake, payout);
      if (payout > 0) flashWin({mult: payout / stake, payout});
    }, (fast ? 300 : STOPS[2]) + 120);
  };

  const auto = useAutoBet({game: 'slots', idle: !busy, trigger: spin, delay: 300});

  const winCells = new Set<string>();
  wins.forEach(li => {
    const cells = LINES[li];
    const [a, b, c] = cells.map(([x, y]) => grid[x][y]);
    const n = a === b && b === c ? 3 : 2;
    cells.slice(0, n).forEach(([x, y]) => winCells.add(`${x}-${y}`));
  });

  return (
    <GameLayout
      title="Lucky 7s"
      sidebar={
        <>
          <BetAmount locked={busy || auto.running} label="Total Bet" />
          <Readout label="5 Lines · Per Line" value={(betAmount / LINES.length).toFixed(2)} />
          <Readout label="Last Win" tone={lastWin > 0 ? 'green' : undefined} value={lastWin.toFixed(2)} />
          <AutoRow auto={auto}>
            <PlayButton onClick={spin} disabled={busy}>
              {busy ? 'Spinning…' : 'Spin'}
            </PlayButton>
          </AutoRow>
          <AutoSheet auto={auto} />
        </>
      }
      stage={
        <div className="slots">
          <div className="slot-frame">
            <div className="slot-window">
              {[0, 1, 2].map(col => {
                const spinning = Boolean(busy && stopped <= col && strips);
                const items = busy && strips ? (spinning ? strips[col] : strips[col].slice(0, 3)) : grid[col];
                return (
                  <div key={col} className="slot-reel">
                    <div
                      key={`${spinKey}-${col}-${spinning ? 's' : 'r'}`}
                      className={`slot-strip${spinning ? ' is-spinning' : ''}`}
                      style={spinning ? ({'--dur': `${reducedMotion() ? 100 + col * 60 : STOPS[col]}ms`, '--len': items.length - 3} as React.CSSProperties) : undefined}
                    >
                      {items.map((s, i) => (
                        <div key={i} className={`slot-cell${!busy && winCells.has(`${col}-${i}`) ? ' is-win' : ''}`}>
                          <Sym s={s} />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              {!busy && wins.length > 0 && (
                <svg className="slot-lines" viewBox="0 0 300 240" preserveAspectRatio="none" aria-hidden="true">
                  {wins.map(li => (
                    <polyline
                      key={li}
                      points={LINES[li].map(([c, r]) => `${50 + c * 100},${40 + r * 80}`).join(' ')}
                      fill="none"
                      stroke={LINE_COLORS[li]}
                      strokeWidth="5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity=".9"
                    />
                  ))}
                </svg>
              )}
            </div>
          </div>
          <div className="slot-pays">
            {PAYS.map((p, s) => (
              <div key={s} className="slot-pay">
                <Sym s={s} />
                <span>×3</span>
                <b>{p}</b>
              </div>
            )).reverse()}
          </div>
          <div className="stage-note">Pays × line bet · 2 cherries from the left pay 0.5×</div>
          <WinPopup win={win} />
        </div>
      }
    />
  );
}
