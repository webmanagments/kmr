import {useEffect, useRef, useState} from 'react';
import {useFlash} from '../lib/hooks';
import {fmtCoins, fmtMult, money, rand, randInt, reducedMotion, weightedIndex} from '../lib/util';
import {useWallet, wallet} from '../lib/wallet';
import {AutoRow, AutoSheet, useAutoBet} from '../ui/auto';
import {BetAmount, PlayButton, Segmented} from '../ui/controls';
import {GameLayout, HistoryStrip, WinPopup, type WinInfo} from '../ui/game';
import './games.css';
import './SkyRun.css';

// ---- Math ---------------------------------------------------------------------
// A flight meets 2–7 events. "+k" adds k to the multiplier, "×k" multiplies it,
// rockets halve it. The multiplier starts at 1×. Landing on the carrier pays it;
// the landing chance is set so the game returns 97% (exact by linearity).
type EvType = 'rocket' | 'add' | 'mul';
const EVENTS: {type: EvType; v: number; w: number}[] = [
  {type: 'rocket', v: 0, w: 60},
  {type: 'add', v: 1, w: 24},
  {type: 'add', v: 2, w: 7},
  {type: 'add', v: 5, w: 2},
  {type: 'add', v: 10, w: 0.6},
  {type: 'mul', v: 2, w: 4},
  {type: 'mul', v: 3, w: 1.5},
  {type: 'mul', v: 4, w: 0.5},
  {type: 'mul', v: 5, w: 0.25},
];
const L_MIN = 2;
const L_MAX = 7;
const CAP = 250;
const RTP = 0.97;
const W = EVENTS.map(e => e.w);
const P_LAND = (() => {
  const tot = W.reduce((a, b) => a + b, 0);
  let a = 0;
  let b = 0;
  for (const e of EVENTS) {
    const p = e.w / tot;
    a += p * (e.type === 'rocket' ? 0.5 : e.type === 'mul' ? e.v : 1);
    b += e.type === 'add' ? p * e.v : 0;
  }
  let em = 0;
  for (let L = L_MIN; L <= L_MAX; L++) em += Math.pow(a, L) + (b * (Math.pow(a, L) - 1)) / (a - 1);
  em /= L_MAX - L_MIN + 1;
  return RTP / em;
})();

interface Ev {
  type: EvType;
  v: number;
  at: number; // distance units
}
interface Plan {
  events: Ev[];
  landed: boolean;
  end: number; // distance where the flight ends
  mult: number;
}

const SPACING = 95;
const START = 150;

function makePlan(): Plan {
  const L = L_MIN + randInt(L_MAX - L_MIN + 1);
  let m = 1;
  const events: Ev[] = [];
  for (let i = 0; i < L; i++) {
    const e = EVENTS[weightedIndex(W)];
    events.push({type: e.type, v: e.v, at: START + i * SPACING + (rand() - 0.5) * 30});
    if (e.type === 'rocket') m /= 2;
    else if (e.type === 'add') m += e.v;
    else m *= e.v;
    m = Math.min(CAP, m);
  }
  return {events, landed: rand() < P_LAND, end: START + L * SPACING + 120, mult: m};
}

const SPEEDS = [0.6, 1, 1.7, 2.8];
const SPEED_LABELS = ['Slow', 'Norm', 'Fast', 'Turbo'];
const BASE_SPEED = 125; // distance units per second at "Norm"

// ---- Drawing ------------------------------------------------------------------
function drawPlane(ctx: CanvasRenderingContext2D, x: number, y: number, tilt: number, t: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  // exhaust flame
  const f = 8 + Math.sin(t * 40) * 3;
  ctx.fillStyle = '#ffc531';
  ctx.beginPath();
  ctx.moveTo(-26, -3);
  ctx.lineTo(-26 - f, 0);
  ctx.lineTo(-26, 3);
  ctx.fill();
  // tail fin
  ctx.fillStyle = '#e6f2ff';
  ctx.beginPath();
  ctx.moveTo(-24, -4);
  ctx.lineTo(-30, -20);
  ctx.lineTo(-18, -20);
  ctx.lineTo(-10, -4);
  ctx.fill();
  ctx.fillStyle = '#00b801';
  ctx.font = 'italic 900 9px system-ui, Arial';
  ctx.fillText('K', -25, -10);
  // body
  ctx.fillStyle = '#00e701';
  ctx.beginPath();
  ctx.ellipse(0, 0, 28, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-22, -1, 40, 3);
  // nose
  ctx.fillStyle = '#e6f2ff';
  ctx.beginPath();
  ctx.ellipse(25, 0, 6, 6, 0, -Math.PI / 2, Math.PI / 2);
  ctx.fill();
  // cockpit
  ctx.fillStyle = '#9fe6ff';
  ctx.beginPath();
  ctx.ellipse(8, -6, 9, 6, 0, Math.PI, 0);
  ctx.fill();
  // wing
  ctx.fillStyle = '#00a800';
  ctx.beginPath();
  ctx.moveTo(-6, 2);
  ctx.lineTo(10, 2);
  ctx.lineTo(-2, 16);
  ctx.lineTo(-14, 16);
  ctx.fill();
  ctx.restore();
}

function drawCarrier(ctx: CanvasRenderingContext2D, x: number, seaY: number) {
  ctx.save();
  ctx.translate(x, seaY);
  ctx.fillStyle = '#3a4c5c';
  ctx.beginPath();
  ctx.moveTo(-90, -14);
  ctx.lineTo(110, -14);
  ctx.lineTo(96, 10);
  ctx.lineTo(-80, 10);
  ctx.fill();
  ctx.fillStyle = '#56707f';
  ctx.fillRect(-100, -20, 220, 7); // flight deck
  ctx.fillStyle = '#ffc531';
  for (let i = -90; i < 110; i += 22) ctx.fillRect(i, -17, 11, 2);
  ctx.fillStyle = '#56707f';
  ctx.fillRect(60, -40, 22, 20); // island
  ctx.fillStyle = '#9fe6ff';
  ctx.fillRect(64, -36, 14, 5);
  ctx.fillStyle = '#e6f2ff';
  ctx.font = '900 10px system-ui, Arial';
  ctx.fillText('KMR', -40, 3);
  ctx.restore();
}

interface Floater {
  text: string;
  color: string;
  x: number;
  y: number;
  born: number;
}

export default function SkyRun() {
  const {betAmount} = useWallet();
  const [speed, setSpeed] = useState(1);
  const [phase, setPhase] = useState<'idle' | 'flying' | 'landed' | 'splash'>('idle');
  const [hud, setHud] = useState({alt: 0, dist: 0, mult: 1, stake: 0});
  const [hist, setHist] = useState<{key: number; label: string; win: boolean}[]>([]);
  const [win, flashWin] = useFlash<WinInfo>(2200);
  const canvas = useRef<HTMLCanvasElement>(null);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const raf = useRef(0);
  const flight = useRef<{
    plan: Plan;
    stake: number;
    d: number;
    last: number;
    m: number;
    hit: number;
    alt: number;
    altTarget: number;
    floaters: Floater[];
    settled: boolean;
    done: boolean;
    t: number;
    doneAt: number;
    lastHud: number;
    lastDraw: number;
  } | null>(null);
  const geo = useRef({w: 360, h: 380});

  const settle = () => {
    const f = flight.current;
    if (!f || f.settled) return;
    f.settled = true;
    const payout = f.plan.landed ? money(f.stake * f.plan.mult) : 0;
    wallet.settle('skyrun', f.stake, payout);
    setHist(h => [{key: performance.now(), label: f.plan.landed ? fmtMult(f.plan.mult) : 'Splash', win: f.plan.landed && f.plan.mult >= 1}, ...h].slice(0, 8));
    if (f.plan.landed && payout >= f.stake) flashWin({mult: f.plan.mult, payout});
  };

  const draw = (now: number) => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const {w, h} = geo.current;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const f = flight.current;
    const d = f ? f.d : 0;
    const seaY = h - 46;
    // sky
    const g = ctx.createLinearGradient(0, 0, 0, seaY);
    g.addColorStop(0, '#06111f');
    g.addColorStop(1, '#0f2b4d');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // stars (static)
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    for (let i = 0; i < 26; i++) ctx.fillRect((i * 97) % w, (i * 53) % (seaY - 80), 1.5, 1.5);
    // clouds with parallax
    ctx.fillStyle = 'rgba(160,190,220,.16)';
    for (let i = 0; i < 6; i++) {
      const cx = ((i * 140 - d * 0.6) % (w + 160) + w + 160) % (w + 160) - 80;
      const cy = 70 + ((i * 61) % 170);
      ctx.beginPath();
      ctx.ellipse(cx, cy, 46, 14, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 26, cy - 8, 30, 12, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // sea
    ctx.fillStyle = '#0a2442';
    ctx.fillRect(0, seaY, w, h - seaY);
    ctx.strokeStyle = 'rgba(120,180,255,.25)';
    ctx.lineWidth = 2;
    for (let row = 0; row < 3; row++) {
      ctx.beginPath();
      for (let x = 0; x <= w; x += 8) {
        const yy = seaY + 10 + row * 12 + Math.sin(x / 18 + d / 20 + row) * 2;
        x === 0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    const planeX = w * 0.3;
    const sx = (at: number) => planeX + (at - d) * 1.15;
    if (f) {
      // carrier: start pad behind and landing carrier ahead
      drawCarrier(ctx, sx(-10), seaY);
      drawCarrier(ctx, sx(f.plan.end), seaY);
      // events ahead
      for (let i = f.hit; i < f.plan.events.length; i++) {
        const e = f.plan.events[i];
        const x = sx(e.at);
        if (x > w + 40) break;
        const yAhead = 110 + ((i * 47) % 90);
        if (e.type === 'rocket') {
          // rocket streaks in from the right as it approaches
          ctx.save();
          ctx.translate(x, yAhead);
          ctx.fillStyle = '#ff4d6d';
          ctx.beginPath();
          ctx.moveTo(-14, 0);
          ctx.lineTo(6, -5);
          ctx.lineTo(12, 0);
          ctx.lineTo(6, 5);
          ctx.fill();
          ctx.fillStyle = '#ffc531';
          ctx.fillRect(12, -2, 10 + Math.sin(now / 30) * 3, 4);
          ctx.restore();
        } else {
          const color = e.type === 'mul' ? '#ffc531' : '#00e701';
          ctx.fillStyle = e.type === 'mul' ? 'rgba(255,197,49,.18)' : 'rgba(0,231,1,.16)';
          ctx.beginPath();
          ctx.arc(x, yAhead, 20 + Math.sin(now / 200 + i) * 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = color;
          ctx.font = '900 17px system-ui, Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(e.type === 'mul' ? `×${e.v}` : `+${e.v}`, x, yAhead + 1);
        }
      }
      // plane
      const t = now / 1000;
      const deck = seaY - 30;
      const splashed = f.done && !f.plan.landed;
      const py = f.done && f.plan.landed ? deck : f.alt;
      const tilt = Math.max(-0.4, Math.min(0.6, (f.altTarget - f.alt) * 0.012));
      if (!splashed) drawPlane(ctx, planeX, py, f.done ? 0 : tilt, t);
      if (splashed) {
        ctx.fillStyle = 'rgba(200,230,255,.8)';
        for (let i = 0; i < 7; i++) {
          ctx.beginPath();
          ctx.arc(planeX - 18 + i * 6, seaY - 4 - Math.abs(Math.sin(i * 1.7)) * 16, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // round balance above the plane
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.font = '800 12px system-ui, Arial';
      ctx.fillStyle = splashed ? '#ff4d6d' : '#ffffff';
      ctx.fillText(fmtCoins(f.stake * f.m), planeX, Math.min(py, deck) - 18);
      // floaters
      for (const fl of f.floaters) {
        const age = (now - fl.born) / 900;
        if (age > 1) continue;
        ctx.globalAlpha = 1 - age;
        ctx.fillStyle = fl.color;
        ctx.font = '900 16px system-ui, Arial';
        ctx.fillText(fl.text, fl.x, fl.y - age * 30);
        ctx.globalAlpha = 1;
      }
    } else {
      drawCarrier(ctx, planeX + 20, seaY);
      drawPlane(ctx, planeX + 20, seaY - 30, 0, now / 1000);
    }
  };

  const loop = (now: number) => {
    const f = flight.current;
    if (!f) return;
    const dt = Math.min(0.1, (now - f.last) / 1000);
    f.last = now;
    f.t += dt;
    const {h} = geo.current;
    const seaY = h - 46;
    if (!f.done) {
      f.d += BASE_SPEED * SPEEDS[speedRef.current] * (reducedMotion() ? 3 : 1) * dt;
      // take-off climb, then cruise around the target altitude
      while (f.hit < f.plan.events.length && f.d >= f.plan.events[f.hit].at) {
        const e = f.plan.events[f.hit];
        f.hit++;
        if (e.type === 'rocket') {
          f.m /= 2;
          f.altTarget = Math.min(seaY - 70, f.altTarget + 34);
          f.floaters.push({text: '÷2', color: '#ff4d6d', x: geo.current.w * 0.3, y: f.alt - 26, born: now});
        } else {
          f.m = e.type === 'add' ? f.m + e.v : f.m * e.v;
          f.altTarget = Math.max(70, f.altTarget - 26);
          f.floaters.push({text: e.type === 'mul' ? `×${e.v}` : `+${e.v}`, color: e.type === 'mul' ? '#ffc531' : '#00e701', x: geo.current.w * 0.3, y: f.alt - 26, born: now});
        }
        f.m = Math.min(CAP, f.m);
      }
      // final approach: glide down to the deck, or fall short into the sea
      const approach = f.plan.end - 140;
      if (f.d > approach) {
        const k = Math.min(1, (f.d - approach) / 140);
        const deck = seaY - 30;
        f.altTarget = f.plan.landed ? f.altTarget + (deck - f.altTarget) * k : f.altTarget + (seaY + 20 - f.altTarget) * k;
      }
      f.alt += (f.altTarget - f.alt) * Math.min(1, dt * 3);
      const finished = f.plan.landed ? f.d >= f.plan.end : f.alt >= seaY - 2 || f.d >= f.plan.end - 30;
      if (finished) {
        f.done = true;
        f.doneAt = now;
        f.m = f.plan.landed ? f.plan.mult : f.m;
        settle();
        setPhase(f.plan.landed ? 'landed' : 'splash');
        setHud({alt: f.plan.landed ? 30 : 0, dist: Math.round(f.d / 2), mult: f.m, stake: f.stake});
      }
    }
    // The panel refreshes at 30 Hz; the HUD numbers only need ~8 Hz.
    if (now - f.lastHud > 120 && !f.done) {
      f.lastHud = now;
      setHud({alt: Math.max(0, Math.round((seaY - f.alt) * 0.9)), dist: Math.round(f.d / 2), mult: f.m, stake: f.stake});
    }
    if (now - f.lastDraw >= 32) {
      f.lastDraw = now;
      draw(now);
    }
    // Keep animating briefly after touchdown/splash so floaters and the splash play out.
    if (!f.done || now - f.doneAt < 1000) raf.current = requestAnimationFrame(loop);
    else draw(now);
  };

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const box = c.parentElement!.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    geo.current = {w: box.width, h: box.height};
    c.width = Math.round(box.width * dpr);
    c.height = Math.round(box.height * dpr);
    c.style.width = `${box.width}px`;
    c.style.height = `${box.height}px`;
    draw(performance.now());
    return () => {
      cancelAnimationFrame(raf.current);
      settle(); // leaving mid-flight still pays out the pre-decided result
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flying = phase === 'flying';

  const fly = () => {
    if (flying) return;
    const stake = wallet.get().betAmount;
    if (!wallet.debit(stake)) return;
    const {h} = geo.current;
    const seaY = h - 46;
    flight.current = {
      plan: makePlan(),
      stake,
      d: 0,
      last: performance.now(),
      m: 1,
      hit: 0,
      alt: seaY - 30,
      altTarget: seaY * 0.48,
      floaters: [],
      settled: false,
      done: false,
      t: 0,
      doneAt: 0,
      lastHud: 0,
      lastDraw: 0,
    };
    setPhase('flying');
    raf.current = requestAnimationFrame(loop);
  };

  const auto = useAutoBet({game: 'skyrun', idle: !flying, trigger: fly});

  return (
    <GameLayout
      title="Sky Run"
      sidebar={
        <>
          <BetAmount locked={flying || auto.running} />
          <Segmented
            label="Speed"
            value={speed}
            onChange={setSpeed}
            options={SPEED_LABELS.map((l, i) => ({value: i, label: l}))}
          />
          <div className="sky-rules">
            <span>
              <b className="tone-green">+n</b> and <b className="tone-gold">×n</b> raise your multiplier, <b className="tone-red">rockets</b> halve it. Land on the carrier to collect.
            </span>
          </div>
          <AutoRow auto={auto}>
            <PlayButton onClick={fly} disabled={flying} sub={`Win up to ${CAP}×`}>
              {flying ? 'Flying…' : 'Fly'}
            </PlayButton>
          </AutoRow>
          <AutoSheet auto={auto} />
        </>
      }
      stage={
        <div className="sky">
          <HistoryStrip items={hist} />
          <div className="sky-hud">
            <div>
              <span>Altitude</span>
              <b>{hud.alt}m</b>
            </div>
            <div>
              <span>Distance</span>
              <b>{hud.dist}m</b>
            </div>
            <div>
              <span>Multiplier</span>
              <b className={phase === 'splash' ? 'tone-red' : 'tone-gold'}>{fmtMult(hud.mult)}</b>
            </div>
          </div>
          <div className="sky-view">
            <canvas ref={canvas} role="img" aria-label="Plane flight" />
            {phase === 'splash' && <div className="sky-banner is-lose">Splash! Missed the carrier</div>}
            {phase === 'landed' && <div className="sky-banner">Landed · {fmtMult(hud.mult)}</div>}
            {phase === 'idle' && <div className="sky-banner is-idle">Pinch Fly to take off</div>}
          </div>
          <WinPopup win={win} />
        </div>
      }
    />
  );
}
