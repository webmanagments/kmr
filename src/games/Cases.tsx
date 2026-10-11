import {useMemo, useState} from 'react';
import {useFlash, useSettler} from '../lib/hooks';
import {HOUSE, fmtMult, money, rand, reducedMotion, weightedIndex} from '../lib/util';
import {useWallet, wallet} from '../lib/wallet';
import {BetAmount, PlayButton, Segmented} from '../ui/controls';
import {GameLayout, HistoryStrip, WinPopup, type WinInfo} from '../ui/game';
import './games.css';
import './Cases.css';

type CaseId = 'starter' | 'pro' | 'legend';

const DEFS: Record<CaseId, {name: string; mults: number[]; color: string}> = {
  starter: {name: 'Starter', mults: [0.4, 0.6, 0.8, 1, 1.2, 1.5, 2, 3, 5, 10], color: '#1fa2ff'},
  pro: {name: 'Pro', mults: [0.1, 0.3, 0.5, 0.8, 1.2, 2, 4, 8, 15, 30, 100], color: '#a855f7'},
  legend: {name: 'Legend', mults: [0, 0.1, 0.25, 0.5, 1, 3, 10, 50, 250, 1000], color: '#ffc531'},
};

/** Weights ∝ 1/(m+0.2)^p, with p solved by bisection so expected value = 99%. */
function weightsFor(mults: number[]): number[] {
  const ev = (p: number) => {
    const w = mults.map(m => 1 / Math.pow(m + 0.2, p));
    const t = w.reduce((s, x) => s + x, 0);
    return w.reduce((s, x, i) => s + x * mults[i], 0) / t;
  };
  let lo = 0;
  let hi = 8;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (ev(mid) > HOUSE) lo = mid;
    else hi = mid;
  }
  const p = (lo + hi) / 2;
  return mults.map(m => 1 / Math.pow(m + 0.2, p));
}

function rarity(m: number): {color: string; label: string} {
  if (m >= 100) return {color: '#ffc531', label: 'Mythic'};
  if (m >= 25) return {color: '#ff4d6d', label: 'Legendary'};
  if (m >= 5) return {color: '#ff6fd8', label: 'Epic'};
  if (m >= 2) return {color: '#9d5cff', label: 'Rare'};
  if (m >= 1) return {color: '#3d8bff', label: 'Uncommon'};
  return {color: '#6d8297', label: 'Common'};
}

const ITEM_W = 74;
const GAP = 6;
const STRIP = 44;
const WIN_AT = 38;
const SPIN_MS = 4200;

function Item({m}: {m: number}) {
  const r = rarity(m);
  return (
    <div className="case-item" style={{'--rc': r.color} as React.CSSProperties}>
      <svg viewBox="0 0 48 48" width="36" height="36" aria-hidden="true">
        <path d="M12 6h24l9 12-21 25L3 18z" fill={r.color} />
        <path d="M12 6l6 12h12l6-12zM3 18h42L24 43z" fill="#000" opacity=".22" />
        <path d="M12 6l6 12H3z" fill="#fff" opacity=".55" />
      </svg>
      <b>{m >= 100 ? `${m}×` : fmtMult(m)}</b>
    </div>
  );
}

export default function Cases() {
  const {betAmount} = useWallet();
  const [cid, setCid] = useState<CaseId>('pro');
  const [strip, setStrip] = useState<number[]>([]);
  const [offset, setOffset] = useState(0);
  const [spinKey, setSpinKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [won, setWon] = useState<number | null>(null);
  const [hist, setHist] = useState<{key: number; label: string; win: boolean}[]>([]);
  const [win, flashWin] = useFlash<WinInfo>(2200);
  const settle = useSettler();

  const def = DEFS[cid];
  const weights = useMemo(() => weightsFor(def.mults), [def]);
  const total = weights.reduce((s, w) => s + w, 0);

  const open = () => {
    if (busy) return;
    const stake = betAmount;
    if (!wallet.debit(stake)) return;
    const idx = weightedIndex(weights);
    const mult = def.mults[idx];
    const payout = money(stake * mult);
    const items = Array.from({length: STRIP}, (_, i) => (i === WIN_AT ? mult : def.mults[weightedIndex(weights)]));
    const jitter = (rand() - 0.5) * (ITEM_W - 16);
    const target = WIN_AT * (ITEM_W + GAP) + ITEM_W / 2 + jitter;
    setStrip(items);
    setOffset(0);
    setSpinKey(k => k + 1);
    setWon(null);
    setBusy(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setOffset(target)));
    settle(() => {
      setWon(mult);
      setHist(h => [{key: Date.now(), label: fmtMult(mult), win: mult >= 1}, ...h].slice(0, 8));
      wallet.settle('cases', stake, payout);
      if (mult > 0) flashWin({mult, payout});
      setBusy(false);
    }, (reducedMotion() ? 500 : SPIN_MS) + 80);
  };

  const preview = strip.length ? strip : def.mults.concat(def.mults).slice(0, 12);

  return (
    <GameLayout
      title="Cases"
      sidebar={
        <>
          <BetAmount locked={busy} label="Case Price" />
          <Segmented
            label="Case"
            value={cid}
            onChange={v => {
              setCid(v);
              setStrip([]);
              setOffset(0);
              setWon(null);
            }}
            disabled={busy}
            options={(Object.keys(DEFS) as CaseId[]).map(id => ({value: id, label: DEFS[id].name}))}
          />
          <div className="case-best">
            <span>Best drop</span>
            <b>{fmtMult(Math.max(...def.mults))}</b>
          </div>
          <PlayButton onClick={open} disabled={busy}>
            {busy ? 'Opening…' : 'Open Case'}
          </PlayButton>
        </>
      }
      stage={
        <div className="cases">
          <HistoryStrip items={hist} />
          <div className="case-banner" style={{'--cc': def.color} as React.CSSProperties}>
            <svg viewBox="0 0 80 60" width="66" height="50" aria-hidden="true">
              <rect x="6" y="20" width="68" height="36" rx="5" fill={def.color} />
              <rect x="2" y="12" width="76" height="12" rx="4" fill={def.color} />
              <rect x="2" y="12" width="76" height="12" rx="4" fill="#fff" opacity=".25" />
              <rect x="33" y="16" width="14" height="18" rx="3" fill="#fff" />
            </svg>
            <div>
              <b>{def.name} Case</b>
              <span>{def.mults.length} possible drops</span>
            </div>
          </div>
          <div className="case-reel">
            <div
              key={spinKey}
              className="case-strip"
              style={{
                transform: `translateX(${-offset}px)`,
                transition: offset ? `transform ${reducedMotion() ? 500 : SPIN_MS}ms cubic-bezier(0.08, 0.6, 0.1, 1)` : 'none',
                paddingLeft: '50%',
              }}
            >
              {preview.map((m, i) => (
                <div key={i} className={won !== null && i === WIN_AT ? 'case-win' : ''}>
                  <Item m={m} />
                </div>
              ))}
            </div>
            <div className="case-marker" aria-hidden="true" />
          </div>
          <div className="case-odds">
            {def.mults
              .map((m, i) => ({m, p: weights[i] / total}))
              .reverse()
              .map(({m, p}) => (
                <div key={m} className="case-odd" style={{borderColor: rarity(m).color}}>
                  <b>{fmtMult(m)}</b>
                  <span>{p * 100 < 0.1 ? (p * 100).toFixed(3) : (p * 100).toFixed(1)}%</span>
                </div>
              ))}
          </div>
          <WinPopup win={win} />
        </div>
      }
    />
  );
}
