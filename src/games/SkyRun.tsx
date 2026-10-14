import {useEffect, useRef, useState} from 'react';
import {useFlash} from '../lib/hooks';
import {sfx} from '../lib/sfx';
import {fmtCoins, fmtMult, money, rand, randInt, reducedMotion, weightedIndex} from '../lib/util';
import {fate} from '../lib/luck';
import {wallet} from '../lib/wallet';
import {AutoRow, AutoSheet, useAutoBet} from '../ui/auto';
import {BetAmount, PlayButton, Segmented} from '../ui/controls';
import {GameLayout, HistoryStrip, WinPopup, type WinInfo} from '../ui/game';
import {Coin} from '../ui/icons';
import './games.css';
import './SkyRun.css';

// ---- Math ---------------------------------------------------------------------
// Like Aviamasters: the round balance starts at your bet (1×). "+k" adds k, "×k"
// multiplies, rockets halve it. Land on the carrier to collect; miss and it's lost.
// The landing chance is set so the game returns 97% (exact by linearity).
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

// ---- Flight plan --------------------------------------------------------------
// Everything the wearer sees is planned up front from the result, so the picture can
// never disagree with the payout: a winning flight touches down on the deck, a losing
// one hits the water well clear of the ship.
const STEP = 2; // path resolution (world units)
const DECK_H = 30; // carrier deck height above the sea (px)
const PLANE_ON_DECK = DECK_H + 12; // plane centre above the sea when its wheels are on deck
const SHIP_LEN = 230;
const START_SHIP = -170; // start carrier: [-170, 60]
const TAKEOFF = 70;
const FIRST = 230;
const SPACING = 118;

interface Ev {
  type: EvType;
  v: number;
  at: number;
  alt: number; // plane altitude at contact
  m: number; // round multiplier after this event
}
interface Plan {
  events: Ev[];
  landed: boolean;
  mult: number;
  path: Float32Array; // altitude per STEP from d = 0 to touchdown
  touch: number; // distance of touchdown (deck or water)
  ship: number; // landing carrier stern
  stop: number; // where the plane comes to rest (wins)
  kind: 'land' | 'short' | 'long';
}

export function makePlan(top: number): Plan {
  const L = L_MIN + randInt(L_MAX - L_MIN + 1);
  let m = 1;
  const raw: {type: EvType; v: number; at: number}[] = [];
  for (let i = 0; i < L; i++) {
    const e = EVENTS[weightedIndex(W)];
    raw.push({type: e.type, v: e.v, at: FIRST + i * SPACING + (rand() - 0.5) * 34});
  }
  const landed = rand() < P_LAND;

  const minAlt = 96;
  const pts: number[] = [];
  const events: Ev[] = [];
  let alt = PLANE_ON_DECK;
  let target = PLANE_ON_DECK;
  let ei = 0;
  const descentStart = raw[raw.length - 1].at + 80;
  for (let d = 0; d < descentStart; d += STEP) {
    if (d < TAKEOFF) alt = PLANE_ON_DECK;
    else {
      if (target === PLANE_ON_DECK) target = Math.min(top, 96 + (top - 96) * 0.55);
      while (ei < raw.length && d >= raw[ei].at) {
        const e = raw[ei++];
        if (e.type === 'rocket') m /= 2;
        else if (e.type === 'add') m += e.v;
        else m *= e.v;
        m = Math.min(CAP, m);
        events.push({...e, alt, m});
        const lift = e.type === 'rocket' ? -62 : e.type === 'mul' ? 34 + e.v * 6 : 20 + Math.min(e.v, 10) * 2.4;
        target = Math.max(minAlt, Math.min(top, target + lift));
      }
      target = Math.max(minAlt, target - 0.1 * STEP); // the plane slowly sinks between pickups
      alt += (target - alt) * 0.055;
    }
    pts.push(alt);
  }
  // Final approach: a smooth flare onto the deck, or a dive into the sea.
  const a0 = alt;
  const aT = landed ? PLANE_ON_DECK : -6;
  const len = Math.max(170, (a0 - aT) / 0.85);
  const n = Math.ceil(len / STEP);
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    const f = landed ? (1 + Math.cos(Math.PI * u)) / 2 : 1 - Math.pow(u, 1.45);
    pts.push(aT + (a0 - aT) * f);
  }
  const touch = descentStart + n * STEP;
  const path = Float32Array.from(pts);

  let kind: Plan['kind'] = landed ? 'land' : 'short';
  let ship = landed ? touch - 46 : touch + 120 + rand() * 70;
  if (!landed && rand() < 0.45) {
    // Overshoot: the ship passes far below while the plane is still high, then it ditches.
    for (let d = touch - SHIP_LEN / 2 - 110; d > descentStart; d -= STEP) {
      if (path[Math.round(d / STEP)] >= 150) {
        kind = 'long';
        ship = d - SHIP_LEN / 2;
        break;
      }
    }
  }
  return {events, landed, mult: m, path, touch, ship, stop: touch + 80, kind};
}

const altAt = (p: Plan, d: number) => {
  const i = Math.max(0, Math.min(p.path.length - 1, d / STEP));
  const lo = Math.floor(i);
  const hi = Math.min(p.path.length - 1, lo + 1);
  return p.path[lo] + (p.path[hi] - p.path[lo]) * (i - lo);
};

const SPEEDS = [0.55, 1, 1.7, 2.8];
const SPEED_LABELS = ['Slow', 'Norm', 'Fast', 'Turbo'];
const BASE_SPEED = 130; // world units per second at "Norm"
const evLabel = (e: {type: EvType; v: number}) => (e.type === 'rocket' ? '÷2' : e.type === 'mul' ? `×${e.v}` : `+${e.v}`);
const evColor = (e: {type: EvType}) => (e.type === 'rocket' ? '#ff4d6d' : e.type === 'mul' ? '#ffc531' : '#3dff6e');

// ---- Drawing ------------------------------------------------------------------
interface Particle {
  x: number; // world x
  y: number; // screen y
  vx: number; // world units/s
  vy: number; // px/s
  g: number; // gravity px/s² (-1 marks a flat water ring)
  life: number;
  max: number;
  r: number;
  grow: number;
  color: string;
  kind: 'dot' | 'ring' | 'conf' | 'smoke';
  rot: number;
}

interface Scene {
  w: number;
  h: number;
  dpr: number;
  seaY: number;
  sky: CanvasGradient | null;
  sea: CanvasGradient | null;
  clouds: HTMLCanvasElement[];
}

function cloudSprite(seed: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 240;
  c.height = 110;
  const g = c.getContext('2d')!;
  let s = seed;
  const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const blobs = Array.from({length: 7}, (_, i) => ({x: 40 + i * 26 + r() * 14, y: 66 - Math.sin((i / 6) * Math.PI) * 22 - r() * 8, rad: 24 + r() * 16}));
  g.fillStyle = 'rgba(176, 214, 240, 0.95)';
  for (const b of blobs) {
    g.beginPath();
    g.arc(b.x, b.y + 6, b.rad, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#ffffff';
  for (const b of blobs) {
    g.beginPath();
    g.arc(b.x - 2, b.y, b.rad - 2, 0, Math.PI * 2);
    g.fill();
  }
  g.globalCompositeOperation = 'destination-out';
  g.fillRect(0, 92, 240, 20);
  return c;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawPlane(ctx: CanvasRenderingContext2D, x: number, y: number, tilt: number, t: number, gear: boolean, hurt: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  // far wing
  ctx.fillStyle = '#9b1830';
  ctx.beginPath();
  ctx.moveTo(-2, -2);
  ctx.lineTo(14, -2);
  ctx.lineTo(4, -15);
  ctx.lineTo(-8, -15);
  ctx.closePath();
  ctx.fill();
  // tail
  ctx.fillStyle = '#d62845';
  ctx.beginPath();
  ctx.moveTo(-24, -3);
  ctx.lineTo(-33, -21);
  ctx.quadraticCurveTo(-27, -23, -21, -20);
  ctx.lineTo(-13, -4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-31, -17, 9, 3);
  // tailplane
  ctx.fillStyle = '#b81f39';
  ctx.beginPath();
  ctx.ellipse(-26, 0, 9, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  // fuselage
  const body = ctx.createLinearGradient(0, -10, 0, 10);
  body.addColorStop(0, hurt > 0 ? '#ff9aa9' : '#ff5a6e');
  body.addColorStop(0.55, '#e0283f');
  body.addColorStop(1, '#a3162b');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(26, -7);
  ctx.quadraticCurveTo(30, 0, 26, 8);
  ctx.lineTo(-10, 7);
  ctx.quadraticCurveTo(-24, 5, -30, 1);
  ctx.quadraticCurveTo(-24, -6, -10, -8);
  ctx.closePath();
  ctx.fill();
  // stripe
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(24, 1);
  ctx.lineTo(-26, 2);
  ctx.lineTo(-24, 4);
  ctx.lineTo(24, 4);
  ctx.closePath();
  ctx.fill();
  // canopy
  const glass = ctx.createLinearGradient(0, -16, 0, -6);
  glass.addColorStop(0, '#e9fbff');
  glass.addColorStop(1, '#4fb8e6');
  ctx.fillStyle = glass;
  ctx.beginPath();
  ctx.ellipse(4, -8, 10, 7, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.8)';
  ctx.fillRect(0, -13, 4, 2);
  // engine cowl + spinner
  ctx.fillStyle = '#2c3640';
  ctx.beginPath();
  ctx.ellipse(26, 0.5, 4, 8.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffc531';
  ctx.beginPath();
  ctx.moveTo(29, -4);
  ctx.quadraticCurveTo(37, 0.5, 29, 5);
  ctx.closePath();
  ctx.fill();
  // propeller blur
  const s = Math.abs(Math.cos(t * 55));
  ctx.fillStyle = 'rgba(230,240,255,.45)';
  ctx.beginPath();
  ctx.ellipse(31, 0.5, 2.2, 3 + 15 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(230,240,255,.18)';
  ctx.beginPath();
  ctx.ellipse(31, 0.5, 2.5, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  // near wing with roundel
  ctx.fillStyle = '#c81f38';
  ctx.beginPath();
  ctx.moveTo(-6, 3);
  ctx.lineTo(14, 3);
  ctx.lineTo(2, 19);
  ctx.lineTo(-14, 19);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(-1, 11, 4.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#00c901';
  ctx.beginPath();
  ctx.arc(-1, 11, 2.6, 0, Math.PI * 2);
  ctx.fill();
  // landing gear
  if (gear) {
    ctx.strokeStyle = '#2c3640';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(8, 7);
    ctx.lineTo(10, 12);
    ctx.moveTo(-12, 6);
    ctx.lineTo(-13, 11);
    ctx.stroke();
    ctx.fillStyle = '#1b2228';
    for (const wx of [10, -13]) {
      ctx.beginPath();
      ctx.arc(wx, 12.5, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawShip(ctx: CanvasRenderingContext2D, x: number, seaY: number, t: number, lights: boolean) {
  // x is the stern; the ship runs SHIP_LEN to the right.
  const L = SHIP_LEN;
  const deck = seaY - DECK_H;
  if (x > ctx.canvas.width || x + L + 40 < 0) return;
  ctx.save();
  // wake
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  for (let i = 0; i < 6; i++) {
    const wx = x - 8 - i * 16 - ((t * 30) % 16);
    ctx.beginPath();
    ctx.ellipse(wx, seaY + 3, 9 - i, 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // hull
  const hull = ctx.createLinearGradient(0, deck, 0, seaY + 6);
  hull.addColorStop(0, '#6f8290');
  hull.addColorStop(1, '#3a4a56');
  ctx.fillStyle = hull;
  ctx.beginPath();
  ctx.moveTo(x - 6, deck + 3);
  ctx.lineTo(x + L + 22, deck + 3);
  ctx.lineTo(x + L - 6, seaY + 6);
  ctx.lineTo(x + 10, seaY + 6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#c0283b';
  ctx.fillRect(x + 10, seaY + 1, L - 16, 5);
  // flight deck
  ctx.fillStyle = '#4a5864';
  ctx.beginPath();
  ctx.moveTo(x - 10, deck - 3);
  ctx.lineTo(x + L + 18, deck - 3);
  ctx.lineTo(x + L + 24, deck + 3);
  ctx.lineTo(x - 6, deck + 3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  for (let i = 18; i < L - 6; i += 22) ctx.fillRect(x + i, deck - 1, 11, 1.6);
  ctx.fillStyle = '#ffc531';
  ctx.fillRect(x - 6, deck + 1.5, L + 26, 1.2);
  // landing zone + arrestor wires near the stern
  ctx.strokeStyle = 'rgba(255,255,255,.7)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 6, deck - 3, 70, 5);
  ctx.fillStyle = '#1b2228';
  for (const wx of [22, 34, 46]) ctx.fillRect(x + wx, deck - 3.5, 1.4, 6);
  // island
  const ix = x + L - 64;
  ctx.fillStyle = '#5f7380';
  ctx.fillRect(ix, deck - 38, 30, 36);
  ctx.fillStyle = '#7d93a1';
  ctx.fillRect(ix + 4, deck - 48, 18, 11);
  ctx.fillStyle = '#9fe6ff';
  ctx.fillRect(ix + 3, deck - 32, 24, 5);
  ctx.fillRect(ix + 6, deck - 45, 12, 3);
  ctx.strokeStyle = '#3a4a56';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(ix + 13, deck - 48);
  ctx.lineTo(ix + 13, deck - 64);
  ctx.stroke();
  const rad = Math.sin(t * 3) * 7;
  ctx.beginPath();
  ctx.moveTo(ix + 13 - rad, deck - 61);
  ctx.lineTo(ix + 13 + rad, deck - 61);
  ctx.stroke();
  // flag
  ctx.fillStyle = '#00e701';
  ctx.beginPath();
  ctx.moveTo(ix + 14, deck - 64);
  ctx.quadraticCurveTo(ix + 20, deck - 62 + Math.sin(t * 8) * 1.5, ix + 25, deck - 63);
  ctx.lineTo(ix + 25, deck - 57);
  ctx.quadraticCurveTo(ix + 20, deck - 56 + Math.sin(t * 8 + 1) * 1.5, ix + 14, deck - 58);
  ctx.closePath();
  ctx.fill();
  // hull lettering
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.font = '900 11px system-ui, Arial';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('KMR 01', x + 30, deck + 12);
  // approach lights
  if (lights) {
    for (let i = 0; i < 6; i++) {
      const on = Math.floor(t * 8) % 6 === i;
      ctx.fillStyle = on ? '#3dff6e' : 'rgba(61,255,110,.35)';
      ctx.beginPath();
      ctx.arc(x + 8 + i * 12, deck - 4, on ? 2.6 : 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawRocket(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  ctx.save();
  ctx.translate(x, y);
  // flame (rocket flies left, exhaust on the right)
  const f = 12 + Math.sin(t * 50) * 4;
  const fl = ctx.createLinearGradient(14, 0, 14 + f, 0);
  fl.addColorStop(0, '#fff3b0');
  fl.addColorStop(0.4, '#ffb020');
  fl.addColorStop(1, 'rgba(255,80,0,0)');
  ctx.fillStyle = fl;
  ctx.beginPath();
  ctx.moveTo(14, -4);
  ctx.lineTo(14 + f, 0);
  ctx.lineTo(14, 4);
  ctx.closePath();
  ctx.fill();
  // body
  ctx.fillStyle = '#e9eef2';
  ctx.beginPath();
  ctx.moveTo(-16, 0);
  ctx.quadraticCurveTo(-10, -5, -2, -5);
  ctx.lineTo(14, -5);
  ctx.lineTo(14, 5);
  ctx.lineTo(-2, 5);
  ctx.quadraticCurveTo(-10, 5, -16, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ff3b55';
  ctx.beginPath();
  ctx.moveTo(-16, 0);
  ctx.quadraticCurveTo(-11, -5, -6, -5);
  ctx.lineTo(-6, 5);
  ctx.quadraticCurveTo(-11, 5, -16, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#c4122d';
  ctx.beginPath();
  ctx.moveTo(8, -5);
  ctx.lineTo(15, -11);
  ctx.lineTo(15, -5);
  ctx.moveTo(8, 5);
  ctx.lineTo(15, 11);
  ctx.lineTo(15, 5);
  ctx.fill();
  ctx.restore();
}

function drawPickup(ctx: CanvasRenderingContext2D, x: number, y: number, e: Ev, t: number) {
  const mul = e.type === 'mul';
  const big = mul || e.v >= 5;
  const r = (mul ? 21 : 18) + (big ? 2 : 0) + Math.sin(t * 4 + e.at) * 1.5;
  ctx.save();
  const glow = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 1.9);
  glow.addColorStop(0, mul ? 'rgba(255,197,49,.55)' : 'rgba(61,255,110,.45)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.9, 0, Math.PI * 2);
  ctx.fill();
  const fill = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, 2, x, y, r);
  fill.addColorStop(0, mul ? '#fff1b8' : '#d9ffe2');
  fill.addColorStop(0.45, mul ? '#ffc531' : '#2fe35a');
  fill.addColorStop(1, mul ? '#d98a00' : '#0a9a2c');
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.85)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = mul ? '#4a2b00' : '#03270d';
  ctx.font = `900 ${mul || e.v >= 10 ? 15 : 16}px system-ui, Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(evLabel(e), x, y + 1);
  // orbiting sparkle
  const a = t * 3 + e.at;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x + Math.cos(a) * (r + 6), y + Math.sin(a) * (r + 6), 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---- Component ----------------------------------------------------------------
type Phase = 'idle' | 'flying' | 'landed' | 'splash';

interface Flight {
  plan: Plan;
  stake: number;
  d: number; // plane distance
  cam: number;
  hit: number;
  m: number;
  stage: 'air' | 'roll' | 'sink';
  stageT: number;
  rocketsSeen: Set<number>;
  shake: number;
  hurt: number;
  pulse: number;
  pulseColor: string;
  settled: boolean;
  finished: boolean;
  sinkX: number;
  sinkY: number;
}

export default function SkyRun() {
  const [speed, setSpeed] = useState(1);
  const [phase, setPhase] = useState<Phase>('idle');
  const [hud, setHud] = useState({alt: 0, dist: 0, mult: 1, stake: 0});
  const [hist, setHist] = useState<{key: number; label: string; win: boolean}[]>([]);
  const [win, flashWin] = useFlash<WinInfo>(2400);
  const [tier, setTier] = useState<{label: string; amount: number; key: number} | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const flight = useRef<Flight | null>(null);
  const parts = useRef<Particle[]>([]);
  const floaters = useRef<{text: string; color: string; x: number; y: number; born: number}[]>([]);
  const scene = useRef<Scene>({w: 380, h: 460, dpr: 1, seaY: 396, sky: null, sea: null, clouds: []});
  const raf = useRef(0);
  const last = useRef(0);
  const lastDraw = useRef(0);
  const lastHud = useRef(0);
  const phaseRef = useRef<Phase>('idle');
  phaseRef.current = phase;

  const settle = () => {
    const f = flight.current;
    if (!f || f.settled) return;
    f.settled = true;
    const payout = f.plan.landed ? money(f.stake * f.plan.mult) : 0;
    wallet.settle('skyrun', f.stake, payout);
    setHist(h => [{key: performance.now(), label: f.plan.landed ? fmtMult(f.plan.mult) : 'Splash', win: f.plan.landed && f.plan.mult >= 1}, ...h].slice(0, 8));
  };

  const burst = (x: number, y: number, n: number, colors: string[], speedPx: number, kind: Particle['kind'] = 'dot', g = 0) => {
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const v = speedPx * (0.35 + rand() * 0.65);
      parts.current.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - (g > 0 ? speedPx * 0.6 : 0),
        g,
        life: 0,
        max: 0.5 + rand() * 0.6,
        r: kind === 'conf' ? 3 + rand() * 2 : 2 + rand() * 3,
        grow: kind === 'smoke' ? 14 : 0,
        color: colors[i % colors.length],
        kind,
        rot: rand() * 6,
      });
    }
  };

  const draw = (now: number) => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx || !scene.current.sky) return;
    const S = scene.current;
    const {w, h, seaY} = S;
    const t = now / 1000;
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    const f = flight.current;
    const cam = f ? f.cam : 0;
    const planeX = Math.round(w * 0.3);
    const sx = (wx: number) => planeX + (wx - cam);

    // Sky, sun, far islands, clouds
    ctx.fillStyle = S.sky!;
    ctx.fillRect(0, 0, w, seaY);
    const sunX = w - 70;
    const sun = ctx.createRadialGradient(sunX, 64, 4, sunX, 64, 90);
    sun.addColorStop(0, 'rgba(255,250,220,1)');
    sun.addColorStop(0.18, 'rgba(255,240,180,.9)');
    sun.addColorStop(0.45, 'rgba(255,230,160,.18)');
    sun.addColorStop(1, 'rgba(255,230,160,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(sunX - 90, 0, 180, 160);
    ctx.fillStyle = 'rgba(46, 140, 150, .55)';
    for (let i = 0; i < 3; i++) {
      const span = w + 420;
      const ix = ((((i * 260 - cam * 0.12) % span) + span) % span) - 140;
      ctx.beginPath();
      ctx.moveTo(ix, seaY);
      ctx.quadraticCurveTo(ix + 40, seaY - 26 - i * 6, ix + 90, seaY - 14);
      ctx.quadraticCurveTo(ix + 120, seaY - 22, ix + 150, seaY);
      ctx.closePath();
      ctx.fill();
    }
    const cloudLayer = (factor: number, count: number, scale: number, alpha: number, yBase: number, ySpread: number) => {
      ctx.globalAlpha = alpha;
      const span = w + 300;
      for (let i = 0; i < count; i++) {
        const cx = ((((i * (span / count) + i * 37 - cam * factor) % span) + span) % span) - 200;
        const cy = yBase + ((i * 53) % ySpread);
        const spr = S.clouds[i % S.clouds.length];
        ctx.drawImage(spr, cx, cy, spr.width * scale * 0.5, spr.height * scale * 0.5);
      }
      ctx.globalAlpha = 1;
    };
    cloudLayer(0.2, 4, 0.55, 0.7, 30, 120);
    cloudLayer(0.55, 3, 1, 0.92, 70, 170);

    // Sea
    ctx.fillStyle = S.sea!;
    ctx.fillRect(0, seaY, w, h - seaY);
    ctx.fillStyle = 'rgba(255,255,255,.6)';
    ctx.fillRect(0, seaY, w, 1.5);
    for (let row = 0; row < 5; row++) {
      const yy = seaY + 10 + row * row * 4 + row * 6;
      const sp = 40 + row * 18;
      const off = (((cam * (0.7 + row * 0.12) + t * (8 + row * 3)) % sp) + sp) % sp;
      ctx.fillStyle = `rgba(200,235,255,${0.32 - row * 0.04})`;
      for (let x = -off; x < w + sp; x += sp) {
        ctx.beginPath();
        ctx.ellipse(x + ((row * 17) % sp), yy, 7 + row * 2.5, 1.2 + row * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Ships
    drawShip(ctx, sx(START_SHIP), seaY, t, false);
    if (f) drawShip(ctx, sx(f.plan.ship), seaY, t, f.stage === 'air' && f.d > f.plan.touch - 600);

    // Pickups and rockets
    if (f) {
      for (let i = f.hit; i < f.plan.events.length; i++) {
        const e = f.plan.events[i];
        const y = seaY - e.alt;
        if (e.type === 'rocket') {
          const rx = planeX + (e.at - f.d) * 2.4;
          if (rx < w + 40) {
            drawRocket(ctx, rx, y, t);
            if (!f.rocketsSeen.has(i)) {
              f.rocketsSeen.add(i);
              sfx('rocket');
            }
            if (rand() < 0.7)
              parts.current.push({x: cam + (rx - planeX) + 20, y: y + (rand() - 0.5) * 3, vx: 0, vy: -6, g: 0, life: 0, max: 0.6, r: 3, grow: 10, color: 'rgba(235,240,245,.7)', kind: 'smoke', rot: 0});
          } else if (rx < w + 260) {
            // Incoming warning at the edge
            const blink = Math.floor(t * 6) % 2 === 0;
            ctx.fillStyle = blink ? '#ff4d6d' : 'rgba(255,77,109,.5)';
            ctx.beginPath();
            ctx.moveTo(w - 6, y);
            ctx.lineTo(w - 22, y - 10);
            ctx.lineTo(w - 22, y + 10);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = '900 11px system-ui, Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('!', w - 17, y + 1);
          }
        } else {
          const px = sx(e.at);
          if (px > w + 40) continue;
          drawPickup(ctx, px, y, e, t);
        }
      }
    }

    // Particles (world-anchored)
    for (const p of parts.current) {
      const k = p.life / p.max;
      const px = sx(p.x);
      ctx.globalAlpha = Math.max(0, 1 - k);
      if (p.kind === 'ring') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3 * (1 - k) + 0.5;
        const rr = p.r + k * 46;
        ctx.beginPath();
        ctx.ellipse(px, p.y, rr, p.g === -1 ? rr * 0.25 : rr, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.kind === 'conf') {
        ctx.save();
        ctx.translate(px, p.y);
        ctx.rotate(p.rot + p.life * 8);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
        ctx.restore();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(px, p.y, p.r + p.grow * k, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // Plane
    const shake = f && f.shake > 0 && !reducedMotion() ? (rand() - 0.5) * f.shake * 10 : 0;
    if (!f) {
      drawPlane(ctx, sx(0), seaY - PLANE_ON_DECK, 0, t * 0.15, true, 0);
    } else if (f.stage === 'sink') {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w, seaY + 3);
      ctx.clip();
      drawPlane(ctx, sx(f.sinkX), f.sinkY, 0.6, t, false, 0);
      ctx.restore();
    } else {
      const alt = f.stage === 'roll' ? PLANE_ON_DECK : altAt(f.plan, f.d);
      const ahead = f.stage === 'roll' ? PLANE_ON_DECK : altAt(f.plan, f.d + 14);
      const tilt = Math.max(-0.45, Math.min(0.5, -(ahead - alt) / 14));
      const py = seaY - alt + shake;
      const propT = f.stage === 'roll' ? t * Math.max(0.05, 1 - f.stageT) : t;
      drawPlane(ctx, planeX + shake * 0.5, py, f.stage === 'roll' ? 0 : tilt, propT, alt < 90 || f.stage === 'roll', f.hurt);
      // Round balance above the plane
      const label = fmtCoins(f.stake * f.m);
      ctx.font = '900 12.5px system-ui, Arial';
      const tw = ctx.measureText(label).width + 30;
      const bx = planeX - tw / 2;
      const by = py - 46;
      const pk = Math.max(0, f.pulse);
      ctx.save();
      ctx.translate(planeX, by + 11);
      ctx.scale(1 + pk * 0.18, 1 + pk * 0.18);
      ctx.translate(-planeX, -(by + 11));
      ctx.fillStyle = pk > 0 ? f.pulseColor : 'rgba(5,13,19,.82)';
      roundRect(ctx, bx, by, tw, 22, 11);
      ctx.fill();
      ctx.fillStyle = '#ffd34d';
      ctx.beginPath();
      ctx.arc(bx + 12, by + 11, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#9a5a00';
      ctx.font = '900 8px system-ui, Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('K', bx + 12, by + 11.5);
      ctx.font = '900 12.5px system-ui, Arial';
      ctx.fillStyle = pk > 0.3 ? '#05140a' : '#fff';
      ctx.textAlign = 'left';
      ctx.fillText(label, bx + 22, by + 11.5);
      ctx.restore();
    }

    // Floating event labels
    for (const fl of floaters.current) {
      const age = (now - fl.born) / 1000;
      if (age > 1) continue;
      ctx.globalAlpha = 1 - age;
      ctx.fillStyle = fl.color;
      ctx.font = `900 ${20 + age * 8}px system-ui, Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(0,0,0,.5)';
      ctx.lineWidth = 3;
      ctx.strokeText(fl.text, fl.x, fl.y - age * 40);
      ctx.fillText(fl.text, fl.x, fl.y - age * 40);
      ctx.globalAlpha = 1;
    }
  };

  const step = (now: number) => {
    const dt = Math.min(0.05, (now - last.current) / 1000 || 0);
    last.current = now;
    const f = flight.current;
    const S = scene.current;
    const planeX = Math.round(S.w * 0.3);
    if (f) {
      const v = BASE_SPEED * SPEEDS[speedRef.current] * (reducedMotion() ? 2.5 : 1);
      f.shake = Math.max(0, f.shake - dt * 2.5);
      f.hurt = Math.max(0, f.hurt - dt * 2);
      f.pulse = Math.max(0, f.pulse - dt * 3);
      if (f.stage === 'air') {
        const ramp = f.d < TAKEOFF ? 0.45 + (f.d / TAKEOFF) * 0.55 : 1;
        if (f.d < TAKEOFF && f.d + v * ramp * dt >= TAKEOFF) sfx('whoosh');
        f.d = Math.min(f.plan.touch, f.d + v * ramp * dt);
        f.cam = f.d;
        while (f.hit < f.plan.events.length && f.d >= f.plan.events[f.hit].at) {
          const e = f.plan.events[f.hit++];
          f.m = e.m;
          const y = S.seaY - e.alt;
          floaters.current.push({text: evLabel(e), color: evColor(e), x: planeX, y: y - 28, born: now});
          if (e.type === 'rocket') {
            f.shake = 1;
            f.hurt = 1;
            f.pulse = 1;
            f.pulseColor = '#ff4d6d';
            burst(e.at, y, 18, ['#fff3b0', '#ffb020', '#ff5a1f', '#ff3b55'], 160, 'dot');
            burst(e.at, y, 8, ['rgba(80,80,90,.6)', 'rgba(140,140,150,.5)'], 50, 'smoke');
            parts.current.push({x: e.at, y, vx: 0, vy: 0, g: 0, life: 0, max: 0.45, r: 6, grow: 0, color: '#ffd34d', kind: 'ring', rot: 0});
            sfx('boom');
          } else {
            f.pulse = 1;
            f.pulseColor = e.type === 'mul' ? '#ffc531' : '#3dff6e';
            burst(e.at, y, 14, e.type === 'mul' ? ['#ffe27a', '#ffc531', '#fff'] : ['#7dff9b', '#3dff6e', '#fff'], 130, 'dot');
            parts.current.push({x: e.at, y, vx: 0, vy: 0, g: 0, life: 0, max: 0.4, r: 14, grow: 0, color: e.type === 'mul' ? '#ffe27a' : '#9dffb3', kind: 'ring', rot: 0});
            sfx(e.type === 'mul' ? 'multi' : 'pickup');
          }
        }
        // Engine trail
        if (f.d > TAKEOFF && rand() < 0.5) {
          const y = S.seaY - altAt(f.plan, f.d);
          parts.current.push({x: f.d - 30, y: y + 1, vx: -10, vy: 0, g: 0, life: 0, max: 0.7, r: 1.6, grow: 4, color: 'rgba(255,255,255,.55)', kind: 'smoke', rot: 0});
        }
        if (f.d >= f.plan.touch) {
          f.m = f.plan.landed ? f.plan.mult : f.m;
          if (f.plan.landed) {
            f.stage = 'roll';
            f.stageT = 0;
            sfx('land');
            burst(f.d - 10, S.seaY - DECK_H, 10, ['rgba(220,225,230,.8)'], 60, 'smoke');
          } else {
            f.stage = 'sink';
            f.stageT = 0;
            f.sinkX = f.d;
            f.sinkY = S.seaY + 4;
            sfx('splash');
            burst(f.d, S.seaY, 34, ['#ffffff', '#cdeeff', '#8fd3ff'], 210, 'dot', 380);
            parts.current.push({x: f.d, y: S.seaY + 2, vx: 0, vy: 0, g: -1, life: 0, max: 0.9, r: 10, grow: 0, color: 'rgba(255,255,255,.9)', kind: 'ring', rot: 0});
            settle();
          }
        }
      } else if (f.stage === 'roll') {
        f.stageT += dt / 1.3;
        const u = Math.min(1, f.stageT);
        f.d = f.plan.touch + (f.plan.stop - f.plan.touch) * (1 - (1 - u) * (1 - u));
        f.cam = f.d;
        if (u >= 1 && !f.finished) {
          f.finished = true;
          settle();
          const payout = money(f.stake * f.plan.mult);
          const big = f.plan.mult >= 80 ? 'Super Mega Win' : f.plan.mult >= 40 ? 'Mega Win' : f.plan.mult >= 20 ? 'Big Win' : null;
          if (big) setTier({label: big, amount: payout, key: now});
          else if (payout >= f.stake) flashWin({mult: f.plan.mult, payout});
          if (f.plan.mult >= 1) burst(f.d, S.seaY - 80, 40, ['#00e701', '#ffc531', '#ff4d6d', '#38bdf8', '#fff'], 190, 'conf', 160);
          setPhase('landed');
          setHud({alt: 0, dist: Math.round(f.d / 2), mult: f.plan.mult, stake: f.stake});
        }
      } else {
        f.stageT += dt;
        f.sinkX += dt * 40 * Math.max(0, 1 - f.stageT);
        f.sinkY += dt * 26;
        if (rand() < 0.4) parts.current.push({x: f.sinkX + (rand() - 0.5) * 20, y: S.seaY - 2, vx: 0, vy: -30, g: 0, life: 0, max: 0.5, r: 1.5 + rand() * 2, grow: 0, color: 'rgba(255,255,255,.8)', kind: 'dot', rot: 0});
        if (f.stageT > 1.1 && !f.finished) {
          f.finished = true;
          setPhase('splash');
          setHud({alt: 0, dist: Math.round(f.d / 2), mult: 0, stake: f.stake});
        }
      }
      if (f.stage === 'air' && now - lastHud.current > 120) {
        lastHud.current = now;
        setHud({alt: Math.max(0, Math.round(altAt(f.plan, f.d) * 3)), dist: Math.round(f.d / 2), mult: f.m, stake: f.stake});
      }
    }
    // Particles
    const ps = parts.current;
    for (const p of ps) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.g > 0) p.vy += p.g * dt;
    }
    parts.current = ps.filter(p => p.life < p.max);
    floaters.current = floaters.current.filter(fl => now - fl.born < 1000);

    // Draw at ~30 fps while busy, ~12 fps when idle.
    const busy = !!f && (!f.finished || parts.current.length > 0);
    if (now - lastDraw.current >= (busy ? 32 : 80)) {
      lastDraw.current = now;
      draw(now);
    }
    raf.current = requestAnimationFrame(step);
  };

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const box = c.parentElement!.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(box.width * dpr);
    c.height = Math.round(box.height * dpr);
    c.style.width = `${box.width}px`;
    c.style.height = `${box.height}px`;
    const ctx = c.getContext('2d')!;
    const seaY = Math.round(box.height - 62);
    const sky = ctx.createLinearGradient(0, 0, 0, seaY);
    sky.addColorStop(0, '#2b8fe6');
    sky.addColorStop(0.6, '#6cc4f5');
    sky.addColorStop(1, '#c6ecff');
    const sea = ctx.createLinearGradient(0, seaY, 0, box.height);
    sea.addColorStop(0, '#2391d6');
    sea.addColorStop(1, '#0b4a85');
    scene.current = {w: box.width, h: box.height, dpr, seaY, sky, sea, clouds: [cloudSprite(7), cloudSprite(31), cloudSprite(83)]};
    last.current = performance.now();
    raf.current = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf.current);
      settle(); // leaving mid-flight still pays out the pre-decided result
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flying = phase === 'flying';

  const fly = () => {
    if (phaseRef.current === 'flying') return;
    const stake = wallet.get().betAmount;
    if (!wallet.debit(stake)) return;
    const S = scene.current;
    parts.current = [];
    floaters.current = [];
    setTier(null);
    flight.current = {
      plan: fate(() => makePlan(S.seaY - 70), p => (p.landed ? p.mult : 0)),
      stake,
      d: 0,
      cam: 0,
      hit: 0,
      m: 1,
      stage: 'air',
      stageT: 0,
      rocketsSeen: new Set(),
      shake: 0,
      hurt: 0,
      pulse: 0,
      pulseColor: '#3dff6e',
      settled: false,
      finished: false,
      sinkX: 0,
      sinkY: 0,
    };
    phaseRef.current = 'flying';
    setHud({alt: 0, dist: 0, mult: 1, stake});
    setPhase('flying');
  };

  const auto = useAutoBet({game: 'skyrun', idle: !flying, trigger: fly, delay: 700});

  return (
    <GameLayout
      title="Sky Run"
      sidebar={
        <>
          <BetAmount locked={flying || auto.running} />
          <Segmented label="Speed" value={speed} onChange={setSpeed} options={SPEED_LABELS.map((l, i) => ({value: i, label: l}))} />
          <div className="sky-rules">
            <div>
              <i className="sky-chip is-add">+1</i>
              <i className="sky-chip is-mul">×2</i>
              <span>raise your win</span>
            </div>
            <div>
              <i className="sky-chip is-rocket">½</i>
              <span>rockets halve it</span>
            </div>
            <div className="sky-rule-land">Land on the carrier to collect. Miss and it's lost.</div>
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
          <div className="sky-view">
            <canvas ref={canvas} role="img" aria-label="Plane flight over the sea" />
            <div className="sky-hud">
              <div className="sky-hud-cell">
                <span>Altitude</span>
                <b>{hud.alt}m</b>
              </div>
              <div className="sky-hud-cell">
                <span>Distance</span>
                <b>{hud.dist}m</b>
              </div>
            </div>
            <div className={`sky-mult${phase === 'splash' ? ' is-lose' : phase === 'landed' ? ' is-win' : ''}`}>
              <span>{phase === 'splash' ? 'Lost' : phase === 'landed' ? 'Landed' : 'Multiplier'}</span>
              <b>{phase === 'splash' ? '0.00×' : fmtMult(hud.mult)}</b>
              {phase !== 'idle' && (
                <small>
                  <Coin size={11} />
                  {fmtCoins(phase === 'splash' ? 0 : hud.stake * hud.mult)}
                </small>
              )}
            </div>
            {phase === 'splash' && <div className="sky-banner is-lose">Splash! Missed the carrier</div>}
            {phase === 'idle' && <div className="sky-banner is-idle">Press Fly to take off</div>}
            {tier && (
              <div className="sky-tier" key={tier.key}>
                <span className="sky-tier-label">{tier.label}</span>
                <span className="sky-tier-amt">
                  <Coin size={20} />
                  {fmtCoins(tier.amount)}
                </span>
              </div>
            )}
          </div>
          <WinPopup win={win} />
        </div>
      }
    />
  );
}
