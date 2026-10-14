import {useMemo, useState} from 'react';
import {useFlash, useSettler} from '../lib/hooks';
import {HOUSE, fmtMult, money, reducedMotion, weightedIndex} from '../lib/util';
import {fate} from '../lib/luck';
import {useWallet, wallet} from '../lib/wallet';
import {AutoRow, AutoSheet, useAutoBet} from '../ui/auto';
import {BetAmount, PlayButton, Segmented} from '../ui/controls';
import {GameLayout, HistoryStrip, WinPopup, type WinInfo} from '../ui/game';
import './games.css';
import './Tarot.css';

type Diff = 'easy' | 'medium' | 'hard' | 'expert';

// Payout = left × middle × right. Side (Minor Arcana) odds are fixed per difficulty;
// middle (Major Arcana) odds are solved so every difficulty returns 99%.
const DEFS: Record<Diff, {side: [number, number][]; major: number[]}> = {
  easy: {side: [[0, 6], [0.5, 24], [0.8, 26], [1, 24], [1.5, 15], [2, 5]], major: [1, 1.5, 2, 3, 5]},
  medium: {side: [[0, 14], [0.3, 30], [0.6, 20], [1, 18], [2, 12], [4, 6]], major: [1, 2, 3, 5, 10, 20]},
  hard: {side: [[0, 22], [0.2, 30], [0.5, 20], [1, 15], [3, 9], [7, 4]], major: [1, 2, 5, 10, 24]},
  expert: {side: [[0, 30], [0.1, 28], [0.4, 18], [1, 13], [5, 8], [10, 3]], major: [1, 2, 5, 10, 25, 50]},
};

function solveMajor(d: Diff): number[] {
  const {side, major} = DEFS[d];
  const st = side.reduce((a, [, w]) => a + w, 0);
  const es = side.reduce((a, [v, w]) => a + v * w, 0) / st;
  const need = HOUSE / (es * es);
  const em = (p: number) => {
    const w = major.map(v => 1 / Math.pow(v, p));
    const t = w.reduce((a, b) => a + b, 0);
    return w.reduce((a, x, i) => a + x * major[i], 0) / t;
  };
  let lo = 0;
  let hi = 12;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (em(mid) > need) lo = mid;
    else hi = mid;
  }
  const w = major.map(v => 1 / Math.pow(v, (lo + hi) / 2));
  const t = w.reduce((a, b) => a + b, 0);
  return w.map(x => x / t);
}

const MAJOR_P: Record<Diff, number[]> = {easy: solveMajor('easy'), medium: solveMajor('medium'), hard: solveMajor('hard'), expert: solveMajor('expert')};

const MAJOR_NAMES = ['The Fool', 'The Magician', 'The Star', 'The Sun', 'The World', 'Wheel of Fortune'];
const SUITS = ['Swords', 'Cups', 'Wands', 'Coins', 'Stars', 'Crowns'];

function Symbol({kind, i}: {kind: 'minor' | 'major'; i: number}) {
  const gold = '#ffc531';
  if (kind === 'major') {
    const shapes = [
      <circle key="0" cx="30" cy="30" r="12" fill="none" stroke={gold} strokeWidth="3" />,
      <path key="1" d="M18 42l12-26 12 26M22 34h16" fill="none" stroke={gold} strokeWidth="3" strokeLinejoin="round" />,
      <path key="2" d="M30 12l5 12 13 1-10 8 4 13-12-8-12 8 4-13-10-8 13-1z" fill={gold} />,
      <g key="3">
        <circle cx="30" cy="30" r="9" fill={gold} />
        {Array.from({length: 8}, (_, k) => {
          const a = (k / 8) * Math.PI * 2;
          return <path key={k} d={`M${30 + Math.cos(a) * 13} ${30 + Math.sin(a) * 13}L${30 + Math.cos(a) * 19} ${30 + Math.sin(a) * 19}`} stroke={gold} strokeWidth="3" strokeLinecap="round" />;
        })}
      </g>,
      <g key="4" fill="none" stroke={gold} strokeWidth="2.5">
        <circle cx="30" cy="30" r="16" />
        <ellipse cx="30" cy="30" rx="16" ry="6" />
        <ellipse cx="30" cy="30" rx="6" ry="16" />
      </g>,
      <g key="5" fill="none" stroke={gold} strokeWidth="2.5">
        <circle cx="30" cy="30" r="16" />
        <circle cx="30" cy="30" r="4" fill={gold} />
        {Array.from({length: 8}, (_, k) => {
          const a = (k / 8) * Math.PI * 2;
          return <path key={k} d={`M${30 + Math.cos(a) * 4} ${30 + Math.sin(a) * 4}L${30 + Math.cos(a) * 16} ${30 + Math.sin(a) * 16}`} />;
        })}
      </g>,
    ];
    return (
      <svg viewBox="0 0 60 60" width="54" height="54" aria-hidden="true">
        {shapes[i % shapes.length]}
      </svg>
    );
  }
  const c = '#c9d7e3';
  const shapes = [
    <path key="0" d="M18 42L42 18M42 42L18 18" stroke={c} strokeWidth="3.5" strokeLinecap="round" />,
    <path key="1" d="M20 18h20l-3 14a7 7 0 0 1-14 0zM30 39v6M24 46h12" fill="none" stroke={c} strokeWidth="3" strokeLinejoin="round" />,
    <path key="2" d="M22 46L38 14M34 14h6v6" fill="none" stroke={c} strokeWidth="3.5" strokeLinecap="round" />,
    <g key="3">
      <circle cx="30" cy="30" r="13" fill="none" stroke={c} strokeWidth="3" />
      <path d="M30 22l2.4 5 5.6.6-4.2 3.8 1.2 5.6-5-3-5 3 1.2-5.6-4.2-3.8 5.6-.6z" fill={c} />
    </g>,
    <path key="4" d="M30 14l4 10 11 1-8 7 3 11-10-6-10 6 3-11-8-7 11-1z" fill="#ffd34d" />,
    <path key="5" d="M16 40l4-18 8 8 2-12 2 12 8-8 4 18z" fill="#ffd34d" />,
  ];
  return (
    <svg viewBox="0 0 60 60" width="50" height="50" aria-hidden="true">
      {shapes[i % shapes.length]}
    </svg>
  );
}

interface Draw {
  l: number;
  m: number;
  r: number;
  li: number;
  mi: number;
  ri: number;
}

function Card({kind, value, idx, shown, flipKey, result}: {kind: 'minor' | 'major'; value?: number; idx?: number; shown: boolean; flipKey: string; result?: 'zero' | 'good' | 'low'}) {
  return (
    <div className={`tarot-card is-${kind}${shown ? ' is-shown' : ''}${result ? ` is-${result}` : ''}`}>
      <div className="tarot-inner" key={flipKey}>
        <div className="tarot-back" aria-hidden="true">
          <svg viewBox="0 0 60 60" width="46" height="46">
            <path d="M38 14a16 16 0 1 0 0 32 13 13 0 1 1 0-32z" fill="#ffc531" />
            <circle cx="20" cy="18" r="2" fill="#ffc531" />
            <circle cx="46" cy="44" r="1.6" fill="#ffc531" />
          </svg>
        </div>
        <div className="tarot-face">
          {shown && value !== undefined && idx !== undefined && (
            <>
              <span className="tarot-name">{kind === 'major' ? MAJOR_NAMES[idx % MAJOR_NAMES.length] : `${SUITS[idx % SUITS.length]}`}</span>
              <Symbol kind={kind} i={idx} />
              <b className="tarot-mult">{fmtMult(value)}</b>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Tarot() {
  const {betAmount} = useWallet();
  const [diff, setDiff] = useState<Diff>('medium');
  const [draw, setDraw] = useState<Draw | null>(null);
  const [shown, setShown] = useState(3);
  const [busy, setBusy] = useState(false);
  const [n, setN] = useState(0);
  const [hist, setHist] = useState<{key: number; label: string; win: boolean}[]>([]);
  const [win, flashWin] = useFlash<WinInfo>(2000);
  const settle = useSettler();

  const def = DEFS[diff];
  const majorP = MAJOR_P[diff];
  const sideTotal = def.side.reduce((a, [, w]) => a + w, 0);
  const maxWin = useMemo(() => Math.pow(Math.max(...def.side.map(s => s[0])), 2) * Math.max(...def.major), [def]);

  const play = () => {
    if (busy) return;
    const stake = wallet.get().betAmount;
    if (!wallet.debit(stake)) return;
    const [li, ri, mi] = fate(
      () => [weightedIndex(def.side.map(s => s[1])), weightedIndex(def.side.map(s => s[1])), weightedIndex(majorP)],
      ([a, b, c]) => def.side[a][0] * def.side[b][0] * def.major[c],
    );
    const d: Draw = {l: def.side[li][0], r: def.side[ri][0], m: def.major[mi], li, ri, mi};
    const mult = Math.round(d.l * d.m * d.r * 100) / 100;
    const payout = money(stake * mult);
    const step = reducedMotion() ? 80 : 520;
    setDraw(d);
    setShown(0);
    setBusy(true);
    setN(x => x + 1);
    // Reveal: left, right, then the Major Arcana in the middle.
    settle(() => setShown(1), step);
    settle(() => setShown(2), step * 2);
    settle(() => setShown(3), step * 3);
    settle(() => {
      setBusy(false);
      setHist(h => [{key: Date.now(), label: fmtMult(mult), win: mult >= 1}, ...h].slice(0, 8));
      wallet.settle('tarot', stake, payout);
      if (mult >= 1) flashWin({mult, payout});
    }, step * 3 + 250);
  };

  const auto = useAutoBet({game: 'tarot', idle: !busy, trigger: play});
  const total = draw ? Math.round(draw.l * draw.m * draw.r * 100) / 100 : null;
  const tone = (v: number) => (v === 0 ? 'zero' : v >= 1 ? 'good' : 'low') as 'zero' | 'good' | 'low';

  return (
    <GameLayout
      title="Tarot"
      sidebar={
        <>
          <BetAmount locked={busy || auto.running} />
          <Segmented
            label="Difficulty"
            value={diff}
            onChange={d => {
              setDiff(d);
              setDraw(null);
            }}
            disabled={busy || auto.running}
            options={[
              {value: 'easy', label: 'Easy'},
              {value: 'medium', label: 'Med', aria: 'Medium'},
              {value: 'hard', label: 'Hard'},
              {value: 'expert', label: 'Exp', aria: 'Expert'},
            ]}
          />
          <div className="tarot-max">
            <span>Max win</span>
            <b>{fmtMult(maxWin)}</b>
          </div>
          <AutoRow auto={auto}>
            <PlayButton onClick={play} disabled={busy}>
              {busy ? 'Reading…' : 'Draw'}
            </PlayButton>
          </AutoRow>
          <AutoSheet auto={auto} />
        </>
      }
      stage={
        <div className="tarot">
          <HistoryStrip items={hist} />
          <div className="tarot-row">
            <Card kind="minor" value={draw?.l} idx={draw?.li} shown={!!draw && shown >= 1} flipKey={`l${n}`} result={draw && shown >= 3 ? tone(draw.l) : undefined} />
            <Card kind="major" value={draw?.m} idx={draw?.mi} shown={!!draw && shown >= 3} flipKey={`m${n}`} result={draw && shown >= 3 ? 'good' : undefined} />
            <Card kind="minor" value={draw?.r} idx={draw?.ri} shown={!!draw && shown >= 2} flipKey={`r${n}`} result={draw && shown >= 3 ? tone(draw.r) : undefined} />
          </div>
          <div className={`tarot-sum${total !== null && shown >= 3 ? (total >= 1 ? ' tone-green' : ' tone-red') : ''}`}>
            {draw ? (
              <>
                {shown >= 1 ? fmtMult(draw.l) : '?'} <i>×</i> {shown >= 3 ? fmtMult(draw.m) : '?'} <i>×</i> {shown >= 2 ? fmtMult(draw.r) : '?'} <i>=</i>{' '}
                <b>{shown >= 3 && total !== null ? fmtMult(total) : '…'}</b>
              </>
            ) : (
              'Left × Major × Right'
            )}
          </div>
          <div className="tarot-odds">
            <div className="tarot-odds-row">
              <span className="tarot-odds-k">Minor</span>
              {def.side.map(([v, w]) => (
                <span key={v} className={`tarot-chip${v === 0 ? ' is-zero' : v >= 1 ? ' is-good' : ''}`}>
                  <b>{fmtMult(v)}</b>
                  <small>{((w / sideTotal) * 100).toFixed(0)}%</small>
                </span>
              ))}
            </div>
            <div className="tarot-odds-row">
              <span className="tarot-odds-k is-major">Major</span>
              {def.major.map((v, i) => (
                <span key={v} className="tarot-chip is-major">
                  <b>{fmtMult(v)}</b>
                  <small>{majorP[i] * 100 >= 1 ? (majorP[i] * 100).toFixed(0) : (majorP[i] * 100).toFixed(2)}%</small>
                </span>
              ))}
            </div>
          </div>
          <WinPopup win={win} />
        </div>
      }
    />
  );
}
