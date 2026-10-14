import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import BuyMeCoffeeButton from './BuyMeCoffee.jsx';
import './styles.css';

// ===== Model =====
// The dome is an isolated metal sphere, so its capacitance is C = 4πε₀R and
// its p.d. to earth is V = Q / C.
// The belt carries charge up at a rate (current) proportional to its speed.
// Charge leaks away slowly through the air, and much faster by corona
// discharge once the p.d. nears its limit, so the p.d. levels off.
// A spark jumps to the earthed sphere when p.d. ÷ gap reaches E_SPARK.
const W = 720, H = 780;                 // canvas units
const PPM = 600;                        // pixels per metre
const FLOOR_Y = 570;                    // top of the table
const TABLE_W = 432;                    // the table runs from the left edge to here
const GROUND_Y = 744;                   // the floor
const STOOL = { x: 470, w: 132, h: 44 };  // the insulating stool, standing on the floor
const STOOL_DY = STOOL.h;               // without the stool the person stands this much lower
const SHOCK_V = 3e3;                    // you feel a static shock above a few kV
const R_FLOOR = 1.5e10;                 // through the person's shoes to the floor: RC ≈ 1.5 s
const SHOCK_LIFE = 0.7;                 // s
// a door on the right, with a knob the person can reach for
const DOOR_X = 668;
const KNOB = { x: 650, y: 424, r: 13 };
const KNOB_GRIP = { x: 631, y: 426 };   // where their hand closes on it
const KNOB_REACH = 0.25, KNOB_HOLD = 1.0;   // s to reach out, s holding on (then the same to let go)
const K = 8.99e9;                       // 1 / 4πε₀
const R_DOME = 0.12;                    // dome radius, m
const C_DOME = R_DOME / K;              // 13.3 pF
const C_PERSON = 100e-12;               // a person on an insulating stool, roughly 100 pF
const R_SPH = 0.03;                     // earthed sphere radius, m
const DOME = { x: 300, y: 236, r: R_DOME * PPM };
const SPH_R = R_SPH * PPM;
const SPH_Y = DOME.y;
const SPH_X0 = 80;                      // where the earthed sphere starts
const SPH_XMIN = 40, SPH_XMAX = DOME.x - DOME.r - SPH_R;   // SPH_XMAX: touching the dome
const BELT_K = 0.4e-6;                  // charging current per m/s of belt speed (A)
const BELT_MAX = 10;                    // m/s
const R_LEAK = 2e12;                    // leakage through the air and the column (Ω)
const CORONA = { I: 4e-6, V: 300e3 };   // corona from the dome: I × (V / V₀)^10
const CORONA_P = { I: 4e-6, V: 180e3 }; // corona from the person's hair and fingertips (sharper points)
const E_SPARK = 3e6;                    // breakdown field of air, V/m (30 kV per cm)
const Q_UNIT = 0.1e-6;                  // each + drawn is 0.1 µC
const V_SCALE = 300e3;                  // the p.d. meter goes up to 300 kV
const SPARK_LIFE = 0.22;                // s
const BELT_VIS = 26;                    // px/s of belt movement on screen per m/s (slowed down so you can see it)

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = t => t * t * (3 - 2 * t);
const wrap = a => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
const fmtKV = V => { const kv = V / 1e3; return (kv >= 100 ? Math.round(kv) : kv.toFixed(1)) + ' kV'; };
const fmtUC = (Q, d = 2) => (Q * 1e6).toFixed(d) + ' µC';
const fmtCm = g => (g * 100).toFixed(1) + ' cm';

// ===== Person with long hair =====
const HEAD = { x: 534, y: 212, rx: 33, ry: 42 };
const NECK_Y = 282;                     // where the neck meets the shoulders
const SHOULDER = { x: 498, y: 304 };    // the arm that reaches to the dome (on the stool)
const UPPER_ARM = 74, FOREARM = 114;
const DOWN_ELBOW = { x: 486, y: 382 };  // the same arm hanging at their side
const DOWN_HAND = { x: 482, y: 458 };
const WAIST_Y = 452, FOOT_Y = STOOL.h ? GROUND_Y - STOOL.h : GROUND_Y;   // on the stool
const HAND_ANG = 0.42;                  // where the hand rests on the dome (rad below horizontal)
const HAND = { x: DOME.x + (DOME.r + 3) * Math.cos(HAND_ANG), y: DOME.y + (DOME.r + 3) * Math.sin(HAND_ANG) };
const HAIR_N = 60, HAIR_SEG = 12;
const HAIR_COLS = ['#5b3a22', '#6e4528', '#7d5230', '#4e311d', '#86593a'];

// Each strand: its resting shape (lying over the head and hanging down past
// the face) and its charged shape (standing straight out from the scalp),
// both stored as the angles of its segments. A charged strand turns from one
// towards the other.
function makeHair() {
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const strands = [];
  for (let i = 0; i < HAIR_N; i++) {
    const phi = -Math.PI - 0.16 + ((i + 0.5) / HAIR_N) * (Math.PI + 0.32) + (rnd() - 0.5) * 0.03;
    const L = 140 + rnd() * 45, o = rnd() * 4;
    const x0 = HEAD.x + HEAD.rx * Math.cos(phi), y0 = HEAD.y + HEAD.ry * Math.sin(phi);
    const rest = restAngles(phi, L, o);
    // charged: along the outward normal of the scalp, drooping a little at the ends
    const nAng = Math.atan2(Math.sin(phi) / HEAD.ry, Math.cos(phi) / HEAD.rx);
    const ch = rest.map((_, k) => nAng + wrap(Math.PI / 2 - nAng) * 0.16 * Math.pow(k / HAIR_SEG, 1.6));
    strands.push({
      phi, L, x0, y0, rest, ch, f: 0, fv: 0, ph: rnd() * 6.28, tip: null,
      a: 6e3 + rnd() * 24e3,           // p.d. at which this strand starts to lift
      s: 30e3 + rnd() * 45e3,          // and the extra p.d. for it to stand right up
      col: HAIR_COLS[Math.floor(rnd() * HAIR_COLS.length)], w: 1.7 + rnd() * 1,
    });
  }
  // draw the strands that hang at the sides first, the ones over the top last
  strands.sort((p, q) => Math.abs(Math.cos(q.phi)) - Math.abs(Math.cos(p.phi)));
  return strands;
}
function restAngles(phi, L, o) {
  const rx = HEAD.rx + 2 + o, ry = HEAD.ry + 2 + o, left = phi < -Math.PI / 2, end = left ? -Math.PI : 0;
  const pts = [[HEAD.x + HEAD.rx * Math.cos(phi), HEAD.y + HEAD.ry * Math.sin(phi)]];
  let th = phi;
  while (left ? th > end : th < end) {
    th = left ? Math.max(end, th - 0.04) : Math.min(end, th + 0.04);
    pts.push([HEAD.x + rx * Math.cos(th), HEAD.y + ry * Math.sin(th)]);
  }
  let [x, y] = pts[pts.length - 1];
  const drift = (left ? -1 : 1) * (0.12 + o * 0.03);
  for (let i = 0; i < 160; i++) { x += drift * 3; y += 3; pts.push([x, y]); }
  // resample into equal segments
  const seg = L / HAIR_SEG, out = [pts[0]];
  let acc = 0, need = seg;
  for (let i = 1; i < pts.length && out.length <= HAIR_SEG; i++) {
    let [ax, ay] = pts[i - 1]; const [bx, by] = pts[i];
    let d = Math.hypot(bx - ax, by - ay);
    while (acc + d >= need && out.length <= HAIR_SEG) {
      const t = (need - acc) / d; ax += (bx - ax) * t; ay += (by - ay) * t;
      out.push([ax, ay]); d = Math.hypot(bx - ax, by - ay); acc = need; need += seg;
    }
    acc += d;
  }
  const ang = [];
  for (let k = 0; k < HAIR_SEG; k++) ang.push(Math.atan2(out[k + 1][1] - out[k][1], out[k + 1][0] - out[k][0]));
  return ang;
}
function strandPoints(s, t) {
  const seg = s.L / HAIR_SEG, pts = [[s.x0, s.y0]];
  let x = s.x0, y = s.y0;
  const sway = Math.max(0, s.f) * (1 - clamp(s.f, 0, 1) * 0.6);
  for (let k = 0; k < HAIR_SEG; k++) {
    const a = s.rest[k] + s.f * wrap(s.ch[k] - s.rest[k]) + Math.sin(t * 2.3 + s.ph + k * 0.45) * 0.07 * sway * (k / HAIR_SEG);
    x += Math.cos(a) * seg; y += Math.sin(a) * seg; pts.push([x, y]);
  }
  return pts;
}
// each strand follows its target on a springy, slightly bouncy response
function stepHair(hair, V, dt) {
  const w = 9, z = 0.3, n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
  for (const s of hair) {
    const tgt = smooth(clamp((V - s.a) / s.s, 0, 1));
    for (let i = 0; i < n; i++) {
      s.fv += (w * w * (tgt - s.f) - 2 * z * w * s.fv) * h;
      s.f = clamp(s.f + s.fv * h, -0.15, 1.08);
    }
  }
}

// ===== Simulation (plain JS) =====
class Sim {
  constructor() {
    this.v = 4; this.sphere = true; this.person = false; this.touch = true; this.stool = true; this.knobMetal = true;
    this.hair = makeHair(); this.reset();
  }
  reset() {
    this.V = 0;                          // p.d. of the dome (and the person, while they touch it), V
    this.Vp = 0;                         // p.d. of the person
    this.touch = true;
    this.sx = SPH_X0;                    // centre of the earthed sphere, px
    this.dragged = false;                // the hint shows until the sphere is first moved
    this.sparks = []; this.lastSpark = null; this.nSparks = 0;
    this.shock = null; this.lastShock = null; this.flowPos = 0;
    this.knobT = null;                   // time since they reached for the doorknob
    this.flash = 0; this.surprise = 0; this.beltPos = 0; this.clock = 0;
    for (const s of this.hair) { s.f = 0; s.fv = 0; }
  }
  // without the stool the person stands on the floor, so they are earthed
  // how far the other arm has reached towards the doorknob (0 to 1), and whether it's holding it
  get knobReach() {
    const t = this.knobT; if (t === null) return 0;
    if (t < KNOB_REACH) return smooth(t / KNOB_REACH);
    if (t < KNOB_REACH + KNOB_HOLD) return 1;
    return 1 - smooth(clamp((t - KNOB_REACH - KNOB_HOLD) / KNOB_REACH, 0, 1));
  }
  get knobContact() { return this.knobT !== null && this.knobT >= KNOB_REACH && this.knobT < KNOB_REACH + KNOB_HOLD; }
  // where charge leaves the person for earth: the metal doorknob if they're holding it, or the floor
  get sink() { return this.knobContact && this.knobMetal ? 'knob' : 'feet'; }
  touchKnob() { if (this.person && this.knobT === null) this.knobT = 0; }
  // holding a metal doorknob earths the person directly (a low-resistance path)
  get grounded() { return this.person && this.knobContact && this.knobMetal; }
  // with the hand on the dome, the person and the dome are one conductor
  get joined() { return this.person && this.touch; }
  // the p.d. of the person
  get Vnode() { return this.joined ? this.V : this.Vp; }
  // current flowing through the person to earth: the belt current when they're held
  // at 0 V by the doorknob, or V / R through their shoes when they stand on the floor
  get Iperson() {
    if (!this.person) return 0;
    if (this.grounded) return this.touch ? BELT_K * this.v : 0;
    return this.stool ? 0 : this.Vnode / R_FLOOR;
  }
  // charge Q at p.d. V suddenly flows through the person to earth
  zap(V, Q, from, to = this.sink) {
    if (V < SHOCK_V) return;
    this.shock = { t: 0, Q, V, from, to, seed: Math.floor(Math.random() * 1e9) };
    this.lastShock = { Q, V };
    this.surprise = 1.2;
    this.flash = Math.min(1, 0.2 + Q * 1.5e5);
  }
  get C() { return C_DOME + (this.joined ? C_PERSON : 0); }
  get Q() { return C_DOME * this.V; }
  get Qp() { return this.person ? C_PERSON * this.Vp : 0; }
  gap() { return Math.max(0, (DOME.x - DOME.r - (this.sx + SPH_R)) / PPM); }
  touching() { return this.sphere && this.sx >= SPH_XMAX - 0.5; }
  // charge induced on the earthed sphere (negative), using its image in the dome
  Qind() { return this.sphere ? -(R_SPH / K) * this.V * (DOME.r / (DOME.x - this.sx)) : 0; }
  // the person steps up and touches the charged dome: the charge shares out
  setPerson(on) {
    if (on === this.person) return;
    this.person = on;   // stepping away, they take their own charge with them
    this.Vp = 0; this.shock = null;
    if (!on) return;
    this.touch = true;
    this.V = (C_DOME * this.V) / (C_DOME + C_PERSON); this.Vp = this.V;
  }
  // hand on: the dome and the person share their charge and end up at one p.d.
  // hand off: the person keeps their charge (unless it leaks away through the floor)
  setTouch(on) {
    if (!this.person || on === this.touch) return;
    this.touch = on;
    if (on) { this.V = (C_DOME * this.V + C_PERSON * this.Vp) / (C_DOME + C_PERSON); this.Vp = this.V; }
  }
  // stepping off the stool onto the floor: from then on, charge leaks through
  // their shoes into the floor (resistance R_FLOOR), over a few seconds
  setStool(on) { this.stool = on; }
  update(dt) {
    this.clock += dt;
    this.beltPos += this.v * BELT_VIS * dt;
    if (this.knobT !== null && (this.knobT += dt) > 2 * KNOB_REACH + KNOB_HOLD) this.knobT = null;
    const steps = Math.max(1, Math.ceil(dt / 0.001)), h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const I = BELT_K * this.v;
      let leak = this.V / R_LEAK + CORONA.I * Math.pow(this.V / CORONA.V, 10);
      if (this.joined) leak += CORONA_P.I * Math.pow(this.V / CORONA_P.V, 10) + (this.stool ? 0 : this.V / R_FLOOR);
      this.V = Math.max(0, this.V + ((I - leak) / this.C) * h);
      if (this.sphere) {
        if (this.touching()) this.V = 0;                       // touching: the dome is earthed
        else if (this.V >= E_SPARK * this.gap()) this.spark();
      }
      if (this.grounded) {
        // earthed through the person: any charge on them (and the dome, if they touch it) rushes to earth
        if (this.touch && this.V >= SHOCK_V) this.zap(this.V, C_DOME * this.V + C_PERSON * this.Vp, 'hand');
        else if (this.Vp >= SHOCK_V) this.zap(this.Vp, C_PERSON * this.Vp, 'body');
        this.Vp = 0; if (this.touch) this.V = 0;
      }
      else if (this.joined) this.Vp = this.V;
      else if (this.person) {
        // on their own, the person's charge leaks away: slowly into the air, or through their shoes to the floor
        const lp = this.Vp / R_LEAK + CORONA_P.I * Math.pow(this.Vp / CORONA_P.V, 10) + (this.stool ? 0 : this.Vp / R_FLOOR);
        this.Vp = Math.max(0, this.Vp - (lp / C_PERSON) * h);
      }
    }
    for (const s of this.sparks) s.t += dt;
    this.sparks = this.sparks.filter(s => s.t < SPARK_LIFE);
    this.flash = Math.max(0, this.flash - dt * 5);
    this.surprise = Math.max(0, this.surprise - dt);
    if (this.shock && (this.shock.t += dt) > SHOCK_LIFE) this.shock = null;
    this.flowPos += (this.Iperson / BELT_K) * BELT_VIS * dt;   // the + signs move faster when more current flows
    stepHair(this.hair, this.person ? this.Vp : 0, dt);
  }
  spark() {
    const g = this.gap(), Q = this.C * this.V;
    this.lastSpark = { gap: g, V: this.V, Q };
    this.nSparks++;
    this.V *= 0.03;                       // the spark carries almost all the charge to earth
    if (this.joined) this.Vp = this.V;
    if (this.sparks.length < 3) this.sparks.push({ t: 0, seed: Math.floor(Math.random() * 1e9) });
    this.flash = Math.min(1, 0.25 + Q * 1.5e5);
    if (this.joined) this.surprise = 0.9;
  }
  snapshot() {
    return {
      V: this.V, Vp: this.Vp, Q: this.Q, Qp: this.Qp, v: this.v, sphere: this.sphere, person: this.person, touch: this.touch,
      stool: this.stool, Iperson: this.Iperson, lastShock: this.lastShock, knobMetal: this.knobMetal, knobBusy: this.knobT !== null,
      gap: this.gap(), touching: this.touching(), lastSpark: this.lastSpark, nSparks: this.nSparks,
    };
  }
}

// ===== Canvas drawing =====
const FONT = '"Atkinson Hyperlegible", "Segoe UI", system-ui, sans-serif';
const COL = {
  wall0: '#e3ebee', wall1: '#cfdbe0', metal: '#8f99a3', metalDk: '#5c6670', ink: '#1b262e',
  skin: '#8fb3dc', skinDk: '#55789f', shirt: '#3f9b5a', shirtDk: '#2a6b3d',
  pos: '#d23b30', neg: '#1b62c4', belt: '#5a463c', beltDk: '#3a2c25',
};
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
function haloText(ctx, txt, x, y, col) {
  ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.lineWidth = 3.5; ctx.strokeText(txt, x, y);
  ctx.fillStyle = col; ctx.fillText(txt, x, y);
}
// a + or − sign with a thin white edge so it reads on any background
function sign(ctx, x, y, positive, size = 4) {
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - size, y); ctx.lineTo(x + size, y);
  if (positive) { ctx.moveTo(x, y - size); ctx.lineTo(x, y + size); }
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 4.4; ctx.stroke();
  ctx.strokeStyle = positive ? COL.pos : COL.neg; ctx.lineWidth = 2.2; ctx.stroke();
}

// A wooden table top: the top surface seen slightly from above, then the front edge
const TOP_H = 40;                       // top surface plus front edge, px
let benchImg = null;
function makeBench(scale) {
  const c = document.createElement('canvas'), bh = TOP_H, TW = TABLE_W;
  c.width = Math.round(TW * scale); c.height = Math.round(bh * scale);
  const b = c.getContext('2d'); b.scale(scale, scale);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const top = 16;
  let g = b.createLinearGradient(0, 0, 0, top);
  g.addColorStop(0, '#c0915c'); g.addColorStop(1, '#a8794a');
  b.fillStyle = g; b.fillRect(0, 0, TW, top);
  g = b.createLinearGradient(0, top, 0, bh);
  g.addColorStop(0, '#8a5a32'); g.addColorStop(1, '#68421f');
  b.fillStyle = g; b.fillRect(0, top, TW, bh - top);
  for (let k = 0; k < 34; k++) {
    const y0 = rnd() * top, amp = 0.3 + rnd() * 0.8, f = 0.004 + rnd() * 0.01, ph = rnd() * 6;
    b.strokeStyle = rnd() < 0.5 ? `rgba(110,70,35,${0.12 + rnd() * 0.18})` : `rgba(225,185,135,${0.1 + rnd() * 0.15})`;
    b.lineWidth = 0.5 + rnd() * 0.9; b.beginPath();
    const xs = rnd() * TW * 0.6, xe = xs + 150 + rnd() * 350;
    for (let x = xs; x <= xe; x += 6) { const y = y0 + Math.sin(x * f + ph) * amp; x === xs ? b.moveTo(x, y) : b.lineTo(x, y); }
    b.stroke();
  }
  for (let k = 0; k < 22; k++) {
    const y0 = top + 2 + rnd() * (bh - top - 4), amp = 0.4 + rnd() * 1.2, f = 0.003 + rnd() * 0.012, ph = rnd() * 6;
    b.strokeStyle = rnd() < 0.6 ? `rgba(60,35,15,${0.15 + rnd() * 0.2})` : `rgba(190,140,90,${0.08 + rnd() * 0.12})`;
    b.lineWidth = 0.6 + rnd(); b.beginPath();
    for (let x = 0; x <= TW; x += 6) { const y = y0 + Math.sin(x * f + ph) * amp; x === 0 ? b.moveTo(x, y) : b.lineTo(x, y); }
    b.stroke();
  }
  b.fillStyle = 'rgba(255,230,190,0.35)'; b.fillRect(0, top - 1, TW, 1.5);
  b.fillStyle = 'rgba(255,240,215,0.30)'; b.fillRect(0, 0, TW, 1.5);
  b.fillStyle = 'rgba(40,22,8,0.5)'; b.fillRect(TW - 1.5, 0, 1.5, bh);
  c.scale = scale;
  return c;
}
// the lab floor, then the table: legs, a rail, and the top
function drawFloor(ctx) {
  const g = ctx.createLinearGradient(0, GROUND_Y, 0, H);
  g.addColorStop(0, '#a9b6bd'); g.addColorStop(1, '#8e9ca4');
  ctx.fillStyle = g; ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
  ctx.fillStyle = '#7d8b93'; ctx.fillRect(0, GROUND_Y - 8, W, 8);           // skirting board
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(0, GROUND_Y, W, 1.5);
}
function drawBench(ctx) {
  const legTop = FLOOR_Y + TOP_H - 2;
  for (const x of [22, TABLE_W - 44]) {
    const g = ctx.createLinearGradient(x, 0, x + 20, 0);
    g.addColorStop(0, '#7a4e2b'); g.addColorStop(1, '#5a381c');
    ctx.fillStyle = g; ctx.fillRect(x, legTop, 20, GROUND_Y + 4 - legTop);
  }
  ctx.fillStyle = '#6d4523'; ctx.fillRect(22, GROUND_Y - 60, TABLE_W - 44, 12);    // rail between the legs
  ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(0, legTop, TABLE_W, 6);           // shadow under the top
  const scale = ctx.getTransform().a;
  if (!benchImg || benchImg.scale !== scale) benchImg = makeBench(scale);
  ctx.drawImage(benchImg, 0, FLOOR_Y, TABLE_W, TOP_H);
}

// earth symbol: a short lead and three shrinking lines, standing on the bench
// earth symbol: (x, y) is the top of its lead, where the earth wire joins;
// the three shrinking bars stand on the table below
function drawEarth(ctx, x, y) {
  ctx.strokeStyle = COL.ink; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x, y + 7);
  for (const [w, dy] of [[11, 7], [7, 11], [3, 15]]) { ctx.moveTo(x - w, y + dy); ctx.lineTo(x + w, y + dy); }
  ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fillStyle = COL.ink; ctx.fill();
}
const EARTH_Y = FLOOR_Y - 16;           // height where the earth wires join their symbols
// green and yellow earth lead
function earthLead(ctx, pathFn) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = '#1f6b3c'; ctx.lineWidth = 4.5; ctx.setLineDash([]); pathFn(); ctx.stroke();
  ctx.strokeStyle = '#3aa35a'; ctx.lineWidth = 3; pathFn(); ctx.stroke();
  ctx.strokeStyle = '#f2cf3a'; ctx.lineWidth = 3; ctx.setLineDash([6, 6]); pathFn(); ctx.stroke();
  ctx.setLineDash([]);
}

const BASE = { x: 240, y: 500, w: 120, h: FLOOR_Y - 500 };
const COLUMN = { x: DOME.x - 21, w: 42, top: DOME.y + 30 };
const BELT_UP = DOME.x - 10, BELT_DOWN = DOME.x + 10;

function drawGenerator(ctx, sim, o) {
  // earth lead from the base's terminal (the lower comb is earthed)
  const tx = BASE.x + BASE.w - 10, ty = FLOOR_Y - 16;
  const ex = BASE.x + BASE.w + 50;
  earthLead(ctx, () => { ctx.beginPath(); ctx.moveTo(tx, ty); ctx.bezierCurveTo(tx + 18, ty + 14, ex - 22, EARTH_Y + 12, ex, EARTH_Y); });
  drawEarth(ctx, ex, EARTH_Y);

  // clear acrylic column, with the belt running inside it
  ctx.fillStyle = 'rgba(205,226,238,0.55)'; ctx.fillRect(COLUMN.x, COLUMN.top, COLUMN.w, BASE.y - COLUMN.top);
  for (const [x, up] of [[BELT_UP, true], [BELT_DOWN, false]]) {
    ctx.fillStyle = COL.belt; ctx.fillRect(x - 5, COLUMN.top, 10, BASE.y - COLUMN.top);
    // ribs on the belt, moving up on the left and down on the right
    ctx.strokeStyle = COL.beltDk; ctx.lineWidth = 1.2;
    const off = ((up ? -1 : 1) * sim.beltPos) % 14;
    ctx.beginPath();
    for (let y = COLUMN.top - 14 + ((off + 14) % 14); y < BASE.y; y += 14) { if (y > COLUMN.top) { ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y); } }
    ctx.stroke();
  }
  if (o.charges) {
    // the belt carries + charge up from the lower comb to the dome
    const sp = 22, off = sim.beltPos % sp;
    for (let y = BASE.y - 6 - off; y > COLUMN.top; y -= sp) sign(ctx, BELT_UP, y, true, 3.4);
  }
  ctx.strokeStyle = 'rgba(120,150,170,0.75)'; ctx.lineWidth = 1.2;
  ctx.strokeRect(COLUMN.x, COLUMN.top, COLUMN.w, BASE.y - COLUMN.top);
  ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(COLUMN.x + 4, COLUMN.top, 4, BASE.y - COLUMN.top);

  // the base, with the motor inside
  rr(ctx, BASE.x, BASE.y, BASE.w, BASE.h, 8); ctx.fillStyle = '#3a444e'; ctx.fill();
  ctx.strokeStyle = '#1f262c'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(BASE.x + 4, BASE.y + 2, BASE.w - 8, 2);
  rr(ctx, COLUMN.x - 6, BASE.y - 6, COLUMN.w + 12, 8, 3); ctx.fillStyle = '#c9d1d7'; ctx.fill();
  ctx.font = `800 9px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = '#c9d1d7';
  ctx.fillText('VAN DE GRAAFF', BASE.x + BASE.w / 2, BASE.y + 24);
  // power lamp and a vent grille
  ctx.beginPath(); ctx.arc(BASE.x + 16, BASE.y + 44, 3.5, 0, Math.PI * 2); ctx.fillStyle = sim.v > 0 ? '#3ccf63' : '#9aa3ab'; ctx.fill();
  ctx.fillStyle = '#2b333a';
  for (let k = 0; k < 6; k++) rr(ctx, BASE.x + 34 + k * 11, BASE.y + 36, 6, 18, 2), ctx.fill();
  // earth terminal
  ctx.beginPath(); ctx.arc(tx, ty, 4.5, 0, Math.PI * 2); ctx.fillStyle = '#c9a43a'; ctx.fill(); ctx.strokeStyle = '#6d5a1f'; ctx.lineWidth = 1; ctx.stroke();

  // a faint violet glow once corona discharge sets in near the top p.d.
  const glow = clamp((sim.V - 200e3) / 90e3, 0, 1) * (o.reduced ? 0.6 : 0.75 + 0.25 * Math.sin(o.now * 23));
  if (glow > 0.01) {
    const g = ctx.createRadialGradient(DOME.x, DOME.y, DOME.r, DOME.x, DOME.y, DOME.r + 18);
    g.addColorStop(0, `rgba(170,140,255,${0.45 * glow})`); g.addColorStop(1, 'rgba(170,140,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(DOME.x, DOME.y, DOME.r + 18, 0, Math.PI * 2); ctx.fill();
  }
  // the dome: polished metal
  const g = ctx.createRadialGradient(DOME.x - DOME.r * 0.38, DOME.y - DOME.r * 0.42, DOME.r * 0.08, DOME.x, DOME.y, DOME.r);
  g.addColorStop(0, '#fbfdfe'); g.addColorStop(0.35, '#c9d1d7'); g.addColorStop(0.8, '#8f99a3'); g.addColorStop(1, '#6b7580');
  ctx.beginPath(); ctx.arc(DOME.x, DOME.y, DOME.r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = COL.metalDk; ctx.lineWidth = 1.5; ctx.stroke();
  // collar where the column goes in
  ctx.beginPath(); ctx.ellipse(DOME.x, DOME.y + DOME.r - 6, COLUMN.w / 2 + 6, 5, 0, 0, Math.PI * 2); ctx.fillStyle = '#6b7580'; ctx.fill();
}

// + signs spread over the outside of the dome; more on the side facing the sphere
function drawDomeCharges(ctx, sim) {
  const n = Math.min(60, Math.round(sim.Q / Q_UNIT));
  if (!n) return;
  const skip = 0.35;                           // the bottom, where the column goes in, has none
  const a0 = Math.PI / 2 + skip, a1 = Math.PI / 2 + 2 * Math.PI - skip;
  const pull = sim.sphere ? clamp((1.1 * DOME.r) / (DOME.x - sim.sx), 0, 0.85) : 0;
  const dens = a => 1 + pull * Math.cos(a - Math.PI);
  const bins = 240, cdf = [0];
  for (let i = 0; i < bins; i++) cdf.push(cdf[i] + dens(a0 + ((i + 0.5) / bins) * (a1 - a0)));
  const tot = cdf[bins];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const target = ((k + 0.5) / n) * tot;
    while (cdf[j + 1] < target) j++;
    const a = a0 + ((j + (target - cdf[j]) / (cdf[j + 1] - cdf[j])) / bins) * (a1 - a0);
    sign(ctx, DOME.x + (DOME.r - 8) * Math.cos(a), DOME.y + (DOME.r - 8) * Math.sin(a), true);
  }
}

// The person is drawn on the stool; off it they stand STOOL_DY lower. A shock
// makes them jolt from side to side for a moment.
function personOffset(sim) {
  const sh = sim.shock ? Math.sin(sim.shock.t * 95) * 4 * (1 - sim.shock.t / SHOCK_LIFE) : 0;
  return [sh, sim.stool ? 0 : STOOL_DY];
}
function drawStool(ctx, sim) {
  const x = STOOL.x, top = GROUND_Y - STOOL.h;
  ctx.font = `700 13px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = COL.ink;
  if (!sim.stool) { ctx.fillText('on the earthed floor', x + STOOL.w / 2, GROUND_Y + 24); return; }
  // a plastic stool: seat and three legs
  ctx.fillStyle = '#d9b43c';
  for (const lx of [x + 10, x + STOOL.w / 2 - 6, x + STOOL.w - 22]) ctx.fillRect(lx, top + 8, 12, STOOL.h - 6);
  rr(ctx, x, top, STOOL.w, 12, 5); ctx.fillStyle = '#f0cf55'; ctx.fill(); ctx.strokeStyle = '#a8862a'; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x + 6, top + 2, STOOL.w - 12, 2);
  ctx.fillStyle = COL.ink; ctx.fillText('insulating stool', x + STOOL.w / 2, GROUND_Y + 24);
}
function drawPersonBody(ctx, sim, o) {
  const u = HEAD.rx / 46;                      // face features scale with the head
  const [ox, oy] = personOffset(sim);
  ctx.save(); ctx.translate(ox, oy);
  // legs in trousers, and shoes
  ctx.fillStyle = '#34495e'; ctx.strokeStyle = '#22303d'; ctx.lineWidth = 1.2;
  rr(ctx, 493, WAIST_Y - 6, 38, FOOT_Y - 8 - (WAIST_Y - 6), 8); ctx.fill(); ctx.stroke();
  rr(ctx, 537, WAIST_Y - 6, 38, FOOT_Y - 8 - (WAIST_Y - 6), 8); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#2b2f33';
  ctx.beginPath(); ctx.ellipse(506, FOOT_Y - 6, 24, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(562, FOOT_Y - 6, 24, 7, 0, 0, Math.PI * 2); ctx.fill();
  // torso in a shirt, down to a belt at the waist
  ctx.fillStyle = COL.shirt; ctx.strokeStyle = COL.shirtDk; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(490, WAIST_Y + 4); ctx.lineTo(488, 326); ctx.quadraticCurveTo(489, 293, 512, 289);
  ctx.lineTo(HEAD.x - 13, NECK_Y); ctx.lineTo(HEAD.x + 13, NECK_Y); ctx.lineTo(556, 289);
  ctx.quadraticCurveTo(579, 293, 580, 326); ctx.lineTo(578, WAIST_Y + 4); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#3b2f2a'; ctx.fillRect(489, WAIST_Y - 2, 90, 8);
  // neck and collar
  ctx.fillStyle = COL.skin; ctx.strokeStyle = COL.skinDk; ctx.lineWidth = 1.2;
  rr(ctx, HEAD.x - 11, HEAD.y + HEAD.ry - 12, 22, NECK_Y - (HEAD.y + HEAD.ry - 12) + 4, 6); ctx.fill(); ctx.stroke();
  ctx.fillStyle = COL.shirtDk; ctx.beginPath(); ctx.moveTo(HEAD.x - 16, NECK_Y); ctx.lineTo(HEAD.x, NECK_Y + 18); ctx.lineTo(HEAD.x + 16, NECK_Y); ctx.closePath(); ctx.fill();
  ctx.fillStyle = COL.skin; ctx.beginPath(); ctx.moveTo(HEAD.x - 11, NECK_Y); ctx.lineTo(HEAD.x, NECK_Y + 13); ctx.lineTo(HEAD.x + 11, NECK_Y); ctx.closePath(); ctx.fill();
  // head
  ctx.beginPath(); ctx.ellipse(HEAD.x, HEAD.y, HEAD.rx, HEAD.ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = COL.skin; ctx.fill(); ctx.strokeStyle = COL.skinDk; ctx.lineWidth = 1.4; ctx.stroke();
  // face: eyebrows rise with the hair, and a spark or shock makes them jump
  const fm = sim.hair.reduce((a, s) => a + clamp(s.f, 0, 1), 0) / sim.hair.length;
  const sur = sim.surprise > 0 ? 1 : 0;
  for (const dx of [-17 * u, 17 * u]) {
    ctx.fillStyle = COL.ink; ctx.beginPath(); ctx.ellipse(HEAD.x + dx, HEAD.y + 4 * u, 3.6 * u, (sur ? 5 : 4.2) * u, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = COL.ink; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.beginPath();
    const by = HEAD.y + (-10 - 5 * fm - 4 * sur) * u;
    ctx.moveTo(HEAD.x + dx - 8 * u, by + 2 * u); ctx.quadraticCurveTo(HEAD.x + dx, by - 3 * u, HEAD.x + dx + 8 * u, by + 2 * u); ctx.stroke();
  }
  ctx.strokeStyle = COL.skinDk; ctx.lineWidth = 1.5; ctx.beginPath();
  ctx.moveTo(HEAD.x, HEAD.y + 8 * u); ctx.quadraticCurveTo(HEAD.x - 5 * u, HEAD.y + 20 * u, HEAD.x + 1, HEAD.y + 22 * u); ctx.stroke();
  ctx.strokeStyle = COL.ink; ctx.lineWidth = 2;
  if (sur) { ctx.beginPath(); ctx.ellipse(HEAD.x, HEAD.y + 34 * u, 5 * u, 6.5 * u, 0, 0, Math.PI * 2); ctx.fillStyle = '#3a2c35'; ctx.fill(); }
  else { ctx.beginPath(); ctx.moveTo(HEAD.x - 12 * u, HEAD.y + 31 * u); ctx.quadraticCurveTo(HEAD.x, HEAD.y + (39 + 3 * fm) * u, HEAD.x + 12 * u, HEAD.y + 31 * u); ctx.stroke(); }
  // hair: a cap over the scalp, then the strands
  ctx.fillStyle = HAIR_COLS[1]; ctx.beginPath();
  ctx.ellipse(HEAD.x, HEAD.y, HEAD.rx + 2, HEAD.ry + 2, 0, Math.PI + 0.12, -0.12);
  ctx.quadraticCurveTo(HEAD.x + HEAD.rx * 0.55, HEAD.y - HEAD.ry * 0.55, HEAD.x + 3, HEAD.y - HEAD.ry * 0.5);
  ctx.quadraticCurveTo(HEAD.x - HEAD.rx * 0.55, HEAD.y - HEAD.ry * 0.5, HEAD.x - HEAD.rx - 2, HEAD.y - 6);
  ctx.closePath(); ctx.fill();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const s of sim.hair) {
    const p = strandPoints(s, o.now);
    ctx.strokeStyle = s.col; ctx.lineWidth = s.w; ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]);
    for (let k = 1; k < p.length - 1; k++) ctx.quadraticCurveTo(p[k][0], p[k][1], (p[k][0] + p[k + 1][0]) / 2, (p[k][1] + p[k + 1][1]) / 2);
    ctx.lineTo(p[p.length - 1][0], p[p.length - 1][1]); ctx.stroke();
    s.pts = p.map(([x, y]) => [x + ox, y + oy]);   // kept in scene coordinates, for the charges
  }
  ctx.restore();
}
// the arm nearest the dome: reaching out with the hand on it, or hanging at their side.
// The elbow comes from the shoulder and hand positions (two-bone IK, elbow down).
function armPath(sim) {
  const [ox, oy] = personOffset(sim);
  const S = { x: SHOULDER.x + ox, y: SHOULDER.y + oy };
  if (!sim.touch) return [S, { x: DOWN_ELBOW.x + ox, y: DOWN_ELBOW.y + oy }, { x: DOWN_HAND.x + ox, y: DOWN_HAND.y + oy }];
  const T = { x: HAND.x + 14, y: HAND.y + 4 };
  const d = Math.min(Math.hypot(T.x - S.x, T.y - S.y), UPPER_ARM + FOREARM - 1);
  const a = Math.atan2(T.y - S.y, T.x - S.x);
  const b = Math.acos(clamp((UPPER_ARM ** 2 + d * d - FOREARM ** 2) / (2 * UPPER_ARM * d), -1, 1));
  const e1 = { x: S.x + UPPER_ARM * Math.cos(a + b), y: S.y + UPPER_ARM * Math.sin(a + b) };
  const e2 = { x: S.x + UPPER_ARM * Math.cos(a - b), y: S.y + UPPER_ARM * Math.sin(a - b) };
  return [S, e1.y > e2.y ? e1 : e2, T];
}
function nearArm(sim, px, py) {
  if (!sim.person) return false;
  const p = armPath(sim);
  for (let i = 0; i < 2; i++) {
    const a = p[i], b = p[i + 1], dx = b.x - a.x, dy = b.y - a.y;
    const t = clamp(((px - a.x) * dx + (py - a.y) * dy) / (dx * dx + dy * dy), 0, 1);
    if (Math.hypot(px - a.x - t * dx, py - a.y - t * dy) < 20) return true;
  }
  return sim.touch && Math.hypot(px - HAND.x, py - HAND.y) < 26;
}
// the arm reaching to the dome, drawn over the dome so the hand rests on it
function drawPersonArm(ctx, sim) {
  const [sh, el, wr] = armPath(sim);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // forearm (skin), then the sleeve over the upper arm
  ctx.strokeStyle = COL.skinDk; ctx.lineWidth = 17; ctx.beginPath(); ctx.moveTo(el.x, el.y); ctx.lineTo(wr.x, wr.y); ctx.stroke();
  ctx.strokeStyle = COL.skin; ctx.lineWidth = 14.5; ctx.stroke();
  ctx.strokeStyle = COL.shirtDk; ctx.lineWidth = 26; ctx.beginPath(); ctx.moveTo(sh.x, sh.y); ctx.lineTo(el.x + 1, el.y - 4); ctx.stroke();
  ctx.strokeStyle = COL.shirt; ctx.lineWidth = 23; ctx.stroke();
  if (!sim.touch) return;
  // hand flat on the dome, fingers curling round it
  ctx.save(); ctx.translate(HAND.x, HAND.y); ctx.rotate(HAND_ANG);
  ctx.fillStyle = COL.skin; ctx.strokeStyle = COL.skinDk; ctx.lineWidth = 1.2;
  for (const [dy, len] of [[-11, 13], [-4, 16], [3, 16], [10, 13]]) { rr(ctx, -len + 4, dy - 2.4, len + 6, 5, 2.5); ctx.fill(); ctx.stroke(); }
  rr(ctx, 2, -13, 18, 26, 7); ctx.fill(); ctx.stroke();
  ctx.restore();
}
// the person's charge: spread along the whole length of every strand of hair
// (each strand is charged, so the strands repel), and over the shoulders and arm
function drawPersonCharges(ctx, sim) {
  const n = Math.round(sim.Qp / Q_UNIT), shown = Math.min(n, 110);
  if (!shown) return false;
  const [ox, oy] = personOffset(sim);
  const hair = [];
  for (const s of sim.hair) if (s.pts) for (let k = 2; k < s.pts.length; k++) hair.push(s.pts[k]);
  const body = [];
  for (let k = 0; k < 4; k++) body.push([514 + k * 14 + ox, 291 + oy]);
  const [sh, el, wr] = armPath(sim);
  for (let k = 0; k < 3; k++) body.push([sh.x - 12 + (el.x - sh.x) * (k / 2), sh.y + (el.y - sh.y) * (k / 2)]);
  for (let k = 1; k < 4; k++) body.push([el.x - 8 + (wr.x - el.x) * (k / 3), el.y + (wr.y - el.y) * (k / 3)]);
  const nb = Math.min(body.length, Math.round(shown * 0.12)), nh = Math.min(hair.length, shown - nb);
  // strand by strand, at a different point along each one, so the + signs cover every strand from root to tip
  for (let k = 0; k < nh; k++) { const p = hair[Math.floor(((k + 0.5) * hair.length) / nh)]; sign(ctx, p[0], p[1], true, 3.2); }
  for (let k = 0; k < nb; k++) { const p = body[Math.floor(((k + 0.5) * body.length) / nb)]; sign(ctx, p[0], p[1], true, 3.2); }
  return nh + nb < n;
}
// The other arm: hanging at their side, or reaching out to the doorknob.
// Same two-bone IK as the dome arm, with the elbow kept low.
function otherArmPath(sim) {
  const [ox, oy] = personOffset(sim);
  const S = { x: 572 + ox, y: 306 + oy }, rest = { x: 588 + ox, y: 456 + oy }, r = sim.knobReach;
  const T = { x: rest.x + (KNOB_GRIP.x - rest.x) * r, y: rest.y + (KNOB_GRIP.y - rest.y) * r };
  const L1 = 74, L2 = 78;
  const d = Math.min(Math.hypot(T.x - S.x, T.y - S.y), L1 + L2 - 0.5);
  const a = Math.atan2(T.y - S.y, T.x - S.x);
  const b = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  const e1 = { x: S.x + L1 * Math.cos(a + b), y: S.y + L1 * Math.sin(a + b) };
  const e2 = { x: S.x + L1 * Math.cos(a - b), y: S.y + L1 * Math.sin(a - b) };
  const E = e1.y > e2.y ? e1 : e2;
  return [S, E, { x: E.x + L2 * Math.cos(Math.atan2(T.y - E.y, T.x - E.x)), y: E.y + L2 * Math.sin(Math.atan2(T.y - E.y, T.x - E.x)) }];
}
function drawOtherArm(ctx, sim) {
  const [sh, el, hd] = otherArmPath(sim);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = COL.skinDk; ctx.lineWidth = 17; ctx.beginPath(); ctx.moveTo(el.x, el.y); ctx.lineTo(hd.x, hd.y); ctx.stroke();
  ctx.strokeStyle = COL.skin; ctx.lineWidth = 14.5; ctx.stroke();
  ctx.beginPath(); ctx.arc(hd.x, hd.y, 9.5, 0, Math.PI * 2); ctx.fillStyle = COL.skin; ctx.fill(); ctx.strokeStyle = COL.skinDk; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.strokeStyle = COL.shirtDk; ctx.lineWidth = 26; ctx.beginPath(); ctx.moveTo(sh.x, sh.y); ctx.lineTo(el.x, el.y); ctx.stroke();
  ctx.strokeStyle = COL.shirt; ctx.lineWidth = 23; ctx.stroke();
}
// A door at the right-hand edge, with a metal or wooden knob
function drawDoor(ctx, sim) {
  ctx.fillStyle = '#9aa7ae'; ctx.fillRect(DOOR_X - 8, 40, 8, GROUND_Y - 40);              // frame
  const g = ctx.createLinearGradient(DOOR_X, 0, W, 0);
  g.addColorStop(0, '#dfe5e8'); g.addColorStop(1, '#c9d2d7');
  ctx.fillStyle = g; ctx.fillRect(DOOR_X, 48, W - DOOR_X, GROUND_Y - 48);
  ctx.strokeStyle = 'rgba(80,95,105,0.35)'; ctx.lineWidth = 1.5;
  ctx.strokeRect(DOOR_X + 14, 90, W - DOOR_X, 240); ctx.strokeRect(DOOR_X + 14, 520, W - DOOR_X, 190);
  const metal = sim.knobMetal, rx = DOOR_X + 12;
  // rosette on the door, the neck, then the knob itself
  const fill = (x0, y0, r) => {
    if (metal) {
      const m = ctx.createRadialGradient(x0 - r * 0.4, y0 - r * 0.45, r * 0.05, x0, y0, r);
      m.addColorStop(0, '#ffffff'); m.addColorStop(0.3, '#dfe4e8'); m.addColorStop(0.75, '#8f99a3'); m.addColorStop(1, '#5c6670');
      return m;
    }
    const w = ctx.createRadialGradient(x0 - r * 0.35, y0 - r * 0.4, r * 0.1, x0, y0, r);
    w.addColorStop(0, '#c99560'); w.addColorStop(0.7, '#9a6435'); w.addColorStop(1, '#6e4220');
    return w;
  };
  ctx.beginPath(); ctx.arc(rx, KNOB.y, 10, 0, Math.PI * 2); ctx.fillStyle = fill(rx, KNOB.y, 10); ctx.fill();
  ctx.fillStyle = metal ? '#9aa3ab' : '#8a5a32'; ctx.fillRect(KNOB.x, KNOB.y - 4, rx - KNOB.x, 8);
  ctx.beginPath(); ctx.arc(KNOB.x, KNOB.y, KNOB.r, 0, Math.PI * 2); ctx.fillStyle = fill(KNOB.x, KNOB.y, KNOB.r); ctx.fill();
  ctx.strokeStyle = metal ? '#4f5860' : '#5a3418'; ctx.lineWidth = 1.2; ctx.stroke();
  if (!metal) {
    // wood grain: wavy streaks across the knob, clipped to it
    ctx.save(); ctx.beginPath(); ctx.arc(KNOB.x, KNOB.y, KNOB.r - 0.6, 0, Math.PI * 2); ctx.clip();
    ctx.lineWidth = 0.9;
    for (let k = -5; k <= 5; k++) {
      ctx.strokeStyle = k % 2 ? 'rgba(70,38,14,0.55)' : 'rgba(225,180,120,0.4)';
      ctx.beginPath();
      for (let x = KNOB.x - KNOB.r; x <= KNOB.x + KNOB.r; x += 1.5) {
        const y = KNOB.y + k * 2.6 + Math.sin(x * 0.45 + k) * 1.1 + (x - KNOB.x) * 0.25;
        x === KNOB.x - KNOB.r ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(70,38,14,0.5)'; ctx.beginPath(); ctx.ellipse(KNOB.x + 3, KNOB.y + 2, 3, 1.6, 0.3, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,240,220,0.35)'; ctx.beginPath(); ctx.ellipse(KNOB.x - 4, KNOB.y - 5, 4, 2.2, -0.5, 0, Math.PI * 2); ctx.fill();
  }
  // a metal knob is earthed through the door's metal fittings and the building
  ctx.font = `700 12px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = '#56656f';
  ctx.fillText(metal ? 'metal' : 'wood', DOOR_X + 24, KNOB.y + 30);
}
// The route charge takes through the person to earth. In: at the dome hand
// (charge from the dome), or from all over them (their own charge).
// Out: down through a foot to the floor, or through the other hand to the doorknob.
function currentPath(sim, from, to) {
  const [ox, oy] = personOffset(sim);
  const start = from === 'body'
    ? [[HEAD.x + ox, HEAD.y - HEAD.ry + oy], [HEAD.x + ox, NECK_Y + oy]]
    : (() => { const [sh, el, wr] = armPath(sim); return [[wr.x - 10, wr.y - 4], [el.x, el.y], [sh.x, sh.y]]; })();
  if (to === 'knob') {
    const [sh, el, hd] = otherArmPath(sim);
    return [...start, [534 + ox, 318 + oy], [sh.x, sh.y], [el.x, el.y], [hd.x, hd.y], [KNOB.x, KNOB.y]];
  }
  return [...start, [522 + ox, 330 + oy], [514 + ox, WAIST_Y + oy], [512 + ox, FOOT_Y - 8 + oy], [512 + ox, GROUND_Y + 8]];
}
function along(path, f) {
  const seg = []; let tot = 0;
  for (let i = 1; i < path.length; i++) { const l = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]); seg.push(l); tot += l; }
  let d = clamp(f, 0, 1) * tot;
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i] || i === seg.length - 1) { const t = seg[i] ? d / seg[i] : 0; return [path[i][0] + (path[i + 1][0] - path[i][0]) * t, path[i][1] + (path[i + 1][1] - path[i][1]) * t]; }
    d -= seg[i];
  }
  return path[path.length - 1];
}
// a small crackle of sparks where the charge jumps
function zapAt(ctx, x, y, seed, life) {
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  ctx.save(); ctx.lineCap = 'round'; ctx.shadowColor = 'rgba(150,140,255,0.95)'; ctx.shadowBlur = 14;
  for (let k = 0; k < 6; k++) {
    const a = rnd() * Math.PI * 2, r = 10 + rnd() * 12;
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a + 0.4) * r * 0.5, y + Math.sin(a + 0.4) * r * 0.5); ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    ctx.strokeStyle = `rgba(200,205,255,${0.9 * life})`; ctx.lineWidth = 3.5; ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${life})`; ctx.lineWidth = 1.5; ctx.stroke();
  }
  ctx.restore();
}
function drawCurrent(ctx, sim, o) {
  // a steady flow of charge through them to earth (faster when the current is bigger)
  if (sim.Iperson > 0.02e-6 && o.charges) {
    const path = currentPath(sim, sim.touch ? 'hand' : 'body', sim.sink), sp = 30;
    let L = 0; for (let i = 1; i < path.length; i++) L += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    for (let d = sim.flowPos % sp; d < L; d += sp) sign(ctx, ...along(path, d / L), true, 3.2);
  }
  const sh = sim.shock; if (!sh) return;
  // the shock: a burst of charge rushing through them to the floor
  const life = 1 - sh.t / SHOCK_LIFE, path = currentPath(sim, sh.from, sh.to);
  if (o.charges) {
    const n = clamp(Math.round(sh.Q / Q_UNIT), 4, 40);
    for (let k = 0; k < n; k++) { const f = sh.t * 2.6 - (k / n) * 0.8; if (f > 0 && f < 1) sign(ctx, ...along(path, f), true, 3.4); }
  }
  let seed = (sh.seed + Math.floor(sh.t / 0.05) * 7919) % 2147483646 + 1;
  if (sh.t < 0.3) {
    if (sh.from === 'hand') zapAt(ctx, HAND.x - 2, HAND.y, seed, life);
    if (sh.to === 'knob') zapAt(ctx, KNOB.x - KNOB.r + 2, KNOB.y, seed + 13, life);
    else zapAt(ctx, path[path.length - 1][0], GROUND_Y - 2, seed + 13, life);
  }
}

function drawSphere(ctx, sim, o) {
  const x = sim.sx, y = SPH_Y;
  // earth lead from the stand along the bench to the earth symbol
  // the lead lies along the table, then rises to the top of the earth symbol
  const ex = 20, sx0 = x - 16, sy0 = FLOOR_Y - 6;
  earthLead(ctx, () => {
    ctx.beginPath(); ctx.moveTo(sx0, sy0);
    if (sx0 - ex > 64) { ctx.bezierCurveTo(sx0 - 14, sy0, sx0 - 18, FLOOR_Y - 3, sx0 - 30, FLOOR_Y - 3); ctx.lineTo(ex + 30, FLOOR_Y - 3); ctx.bezierCurveTo(ex + 14, FLOOR_Y - 3, ex + 14, EARTH_Y, ex, EARTH_Y); }
    else ctx.bezierCurveTo(sx0 - 12, FLOOR_Y - 2, ex + 14, EARTH_Y, ex, EARTH_Y);
  });
  drawEarth(ctx, ex, EARTH_Y);
  // metal rod and heavy foot
  ctx.fillStyle = COL.metal; ctx.fillRect(x - 3, y + SPH_R - 2, 6, FLOOR_Y - 10 - (y + SPH_R - 2));
  ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(x - 2, y + SPH_R, 1.5, FLOOR_Y - 12 - (y + SPH_R));
  rr(ctx, x - 18, FLOOR_Y - 11, 36, 11, 4); ctx.fillStyle = '#4a5560'; ctx.fill(); ctx.strokeStyle = '#2b333a'; ctx.lineWidth = 1; ctx.stroke();
  // the sphere
  const g = ctx.createRadialGradient(x - SPH_R * 0.4, y - SPH_R * 0.45, 1, x, y, SPH_R);
  g.addColorStop(0, '#fbfdfe'); g.addColorStop(0.4, '#c3cbd2'); g.addColorStop(1, '#69737d');
  ctx.beginPath(); ctx.arc(x, y, SPH_R, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = COL.metalDk; ctx.lineWidth = 1.3; ctx.stroke();
  if (o.charges && !sim.touching()) {
    // negative charge drawn up from earth onto the side facing the dome
    const n = Math.min(12, Math.round(-sim.Qind() / Q_UNIT));
    for (let k = 0; k < n; k++) {
      const a = n === 1 ? 0 : -0.9 + (1.8 * k) / (n - 1);
      sign(ctx, x + (SPH_R - 6) * Math.cos(a), y + (SPH_R - 6) * Math.sin(a), false, 3.2);
    }
  }
}
// gap between the sphere and the dome, as a dimension line above them
function drawGap(ctx, sim) {
  const x0 = sim.sx + SPH_R, x1 = DOME.x - DOME.r, y = SPH_Y - 44;
  ctx.font = `700 15px ${FONT}`; ctx.textAlign = 'center';
  if (sim.touching()) { haloText(ctx, 'touching', x1 - 10, y, COL.ink); return; }
  ctx.strokeStyle = COL.ink; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]); ctx.beginPath();
  ctx.moveTo(x0, SPH_Y - SPH_R - 4); ctx.lineTo(x0, y - 6); ctx.moveTo(x1, SPH_Y - 6); ctx.lineTo(x1, y - 6); ctx.stroke(); ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y);
  for (const [x, d] of [[x0, 1], [x1, -1]]) { ctx.moveTo(x + d * 6, y - 4); ctx.lineTo(x, y); ctx.lineTo(x + d * 6, y + 4); }
  ctx.stroke();
  haloText(ctx, fmtCm(sim.gap()), Math.max(46, (x0 + x1) / 2), y - 9, COL.ink);
}
// a jagged, flickering spark from the dome to the sphere
function drawSparks(ctx, sim) {
  for (const s of sim.sparks) {
    const life = 1 - s.t / SPARK_LIFE;
    let seed = (s.seed + Math.floor(s.t / 0.045) * 7919) % 2147483646 + 1;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const xa = DOME.x - DOME.r, xb = sim.sx + SPH_R, len = xa - xb;
    const nPts = Math.max(3, Math.round(len / 7)), amp = Math.min(20, 4 + len * 0.24);
    const pts = [[xa, SPH_Y]];
    for (let k = 1; k < nPts; k++) pts.push([xa - (len * k) / nPts, SPH_Y + (rnd() - 0.5) * 2 * amp * Math.sin((Math.PI * k) / nPts)]);
    pts.push([xb, SPH_Y]);
    const branches = [];
    for (let b = 0; b < 2 && len > 30; b++) {
      const k = 1 + Math.floor(rnd() * (nPts - 1)), [bx, by] = pts[k], br = [[bx, by]];
      let cx = bx, cy = by;
      for (let j = 0; j < 3; j++) { cx -= 4 + rnd() * 6; cy += (rnd() - 0.5) * 16; br.push([cx, cy]); }
      branches.push(br);
    }
    const line = p => { ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); for (const q of p) ctx.lineTo(q[0], q[1]); };
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(150,140,255,0.95)'; ctx.shadowBlur = 22;
    for (const [w, c] of [[13, `rgba(150,130,255,${0.35 * life})`], [5.5, `rgba(200,205,255,${0.9 * life})`], [2.6, `rgba(255,255,255,${life})`]]) {
      ctx.strokeStyle = c; ctx.lineWidth = w; line(pts); ctx.stroke();
      ctx.lineWidth = w * 0.5; for (const br of branches) { line(br); ctx.stroke(); }
    }
    ctx.restore();
  }
}
// An open right hand, palm towards us, with the forearm coming in from the lower right
function drawOpenHand(ctx, x, y) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(-Math.PI / 4);
  ctx.fillStyle = COL.skin; ctx.strokeStyle = COL.skinDk; ctx.lineWidth = 1.2; ctx.lineJoin = 'round';
  rr(ctx, -8, 18, 16, 60, 7); ctx.fill(); ctx.stroke();
  for (const [dx, len, w] of [[-8, 16, 4.6], [-3, 21, 5.2], [3, 23, 5.4], [8.5, 20, 5.2]]) { rr(ctx, dx - w / 2, -len, w, len + 4, w / 2); ctx.fill(); ctx.stroke(); }
  rr(ctx, -11.5, -4, 23, 26, 8); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(10, 16); ctx.quadraticCurveTo(19, 12, 20, 3); ctx.quadraticCurveTo(19, -2, 15, 1); ctx.quadraticCurveTo(13, 6, 9, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(60,90,130,0.45)'; ctx.beginPath(); ctx.moveTo(-8, 6); ctx.quadraticCurveTo(0, 9, 8, 4); ctx.moveTo(-6, 13); ctx.quadraticCurveTo(1, 15, 7, 12); ctx.stroke();
  ctx.restore();
}

function draw(ctx, sim, k, o) {
  ctx.setTransform(k, 0, 0, k, 0, 0);
  const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  g.addColorStop(0, COL.wall0); g.addColorStop(1, COL.wall1);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  drawFloor(ctx);

  drawDoor(ctx, sim);
  if (sim.person) {
    drawStool(ctx, sim); drawPersonBody(ctx, sim, o); drawOtherArm(ctx, sim);
    if (sim.knobContact && !sim.knobMetal && sim.Vp >= SHOCK_V) {
      ctx.font = `700 13px ${FONT}`; ctx.textAlign = 'right';
      haloText(ctx, 'no shock:', DOOR_X - 6, KNOB.y + 52, COL.ink); haloText(ctx, 'wood insulates', DOOR_X - 6, KNOB.y + 68, COL.ink);
    }
  }
  drawBench(ctx);
  drawGenerator(ctx, sim, o);
  if (o.charges) drawDomeCharges(ctx, sim);
  let capped = false;
  if (sim.person) {
    drawPersonArm(ctx, sim);
    if (o.charges) capped = drawPersonCharges(ctx, sim);
    drawCurrent(ctx, sim, o);
    if (!sim.armHinted) {
      ctx.font = `700 13px ${FONT}`; ctx.textAlign = 'right';
      const [l1, l2] = sim.touch ? ['click the hand', 'to take it off'] : ['click the arm to', 'touch the dome'];
      haloText(ctx, l1, 474, 512, '#56656f'); haloText(ctx, l2, 474, 528, '#56656f');
    }
  }
  if (sim.sphere) {
    drawSphere(ctx, sim, o);
    if (o.gap) drawGap(ctx, sim);
    drawSparks(ctx, sim);
    if (!sim.dragged) {
      // pulsing hint, like the pulleys "drag the rope" hand
      ctx.font = `700 17px ${FONT}`; ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(90,104,114,0.85)'; ctx.fillText('Drag the sphere', 20, SPH_Y - 96); ctx.fillText('towards the dome', 20, SPH_Y - 76);
    }
  }
  if (o.charges) {
    ctx.font = `700 13px ${FONT}`; ctx.textAlign = 'left';
    sign(ctx, 22, 24, true); haloText(ctx, '= 0.1 µC', 32, 29, COL.ink);
    sign(ctx, 22, 46, false); haloText(ctx, '= −0.1 µC', 32, 51, COL.ink);
    if (capped) { ctx.font = `400 12px ${FONT}`; haloText(ctx, 'not all of the person’s charge is shown', 16, 72, '#56656f'); }
  }
  if (sim.flash > 0.01) { ctx.fillStyle = `rgba(235,235,255,${sim.flash * 0.28})`; ctx.fillRect(0, 0, W, H); }
}

// ===== React UI =====
const LOGO = `${import.meta.env.BASE_URL}favicon.svg`;

function SphereIcon() {
  const ink = 'currentColor';
  return (
    <svg className="icon" viewBox="0 0 44 50" width="58" height="66" aria-hidden="true">
      <circle cx="30" cy="12" r="9" fill="#c3cbd2" stroke={ink} strokeWidth="1.4" />
      <path d="M21 12 l-3 -3 l2 6 l-4 -3 l1 5" fill="none" stroke="#6a4fd6" strokeWidth="1.6" strokeLinejoin="round" />
      <line x1="30" y1="21" x2="30" y2="40" stroke={ink} strokeWidth="2.2" />
      <rect x="22" y="40" width="16" height="4" rx="1.5" fill={ink} />
      <path d="M22 42 C14 42 14 46 8 46" fill="none" stroke="#3aa35a" strokeWidth="2" />
      <g stroke={ink} strokeWidth="1.5" strokeLinecap="round"><line x1="6" y1="40" x2="6" y2="44" /><line x1="1" y1="44" x2="11" y2="44" /><line x1="3" y1="46.5" x2="9" y2="46.5" /><line x1="5" y1="49" x2="7" y2="49" /></g>
    </svg>
  );
}
function PersonIcon() {
  const hair = '#6e4528';
  const strands = Array.from({ length: 11 }, (_, i) => -Math.PI + 0.15 + (i / 10) * (Math.PI - 0.3));
  return (
    <svg className="icon" viewBox="0 0 44 50" width="58" height="66" aria-hidden="true">
      {strands.map((a, i) => <line key={i} x1={22 + 8 * Math.cos(a)} y1={22 + 10 * Math.sin(a)} x2={22 + 19 * Math.cos(a)} y2={22 + 21 * Math.sin(a)} stroke={hair} strokeWidth="1.6" strokeLinecap="round" />)}
      <ellipse cx="22" cy="22" rx="8" ry="10" fill={COL.skin} stroke={COL.skinDk} strokeWidth="1.2" />
      <path d="M8 50 C8 38 14 34 22 34 C30 34 36 38 36 50 Z" fill={COL.shirt} />
      <circle cx="19" cy="22" r="1.2" fill="#1b262e" /><circle cx="25" cy="22" r="1.2" fill="#1b262e" />
    </svg>
  );
}

// Full screen: the real thing when the browser allows it; otherwise (for example
// inside an embedded frame that blocks it) the page fills the window instead.
function FullscreenButton() {
  const [isFull, setIsFull] = useState(false);
  const [pseudo, setPseudo] = useState(false);
  useEffect(() => {
    const on = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle('pseudo-fs', pseudo);
    if (!pseudo) return;
    const onKey = e => { if (e.key === 'Escape') setPseudo(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pseudo]);
  const full = isFull || pseudo;
  const toggle = async () => {
    if (pseudo) { setPseudo(false); return; }
    const d = document, el = d.documentElement;
    try {
      if (d.fullscreenElement || d.webkitFullscreenElement) await (d.exitFullscreen || d.webkitExitFullscreen).call(d);
      else if (d.fullscreenEnabled && el.requestFullscreen) await el.requestFullscreen();
      else if (d.webkitFullscreenEnabled && el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      else setPseudo(true);
    } catch { setPseudo(true); }
  };
  return (
    <button type="button" className="btn iconbtn" onClick={e => { toggle(); e.currentTarget.blur(); }}
      aria-label={full ? 'Exit full screen' : 'Enter full screen'} title={full ? 'Exit full screen' : 'Full screen'}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d={full ? 'M9 4v5H4 M15 4v5h5 M9 20v-5H4 M15 20v-5h5' : 'M9 4H4v5 M15 4h5v5 M9 20H4v-5 M15 20h5v-5'} />
      </svg>
    </button>
  );
}
function Switch({ id, checked, onChange, children }) {
  return (
    <label className="swgroup" htmlFor={id}>
      <span className="insw"><input id={id} type="checkbox" checked={checked} onChange={onChange} /><span className="track" aria-hidden="true" /></span>
      <span>{children}</span>
    </label>
  );
}

function App() {
  const cvRef = useRef(null), simRef = useRef(null);
  if (!simRef.current) simRef.current = new Sim();
  if (typeof window !== 'undefined') window.__vdg = simRef.current;   // handy for checking the model from the console
  const [ui, setUi] = useState(() => simRef.current.snapshot());
  const [speed, setSpeed] = useState(4);
  const [sphere, setSphere] = useState(true);
  const [person, setPerson] = useState(false);
  const [charges, setCharges] = useState(true);
  const [gap, setGap] = useState(true);
  const [readOpen, setReadOpen] = useState(true);
  // Size the scene so the whole page fits the window height with no scrolling
  // (on wide screens; on narrow ones the panels stack and the page scrolls)
  const appRef = useRef(null);
  useLayoutEffect(() => {
    const fit = () => {
      const app = appRef.current; if (!app) return;
      if (window.innerWidth <= 960) { app.style.removeProperty('--stage-w'); app.style.removeProperty('--stage-h'); return; }
      const layout = app.querySelector('.layout');
      const other = app.getBoundingClientRect().height - layout.getBoundingClientRect().height;
      const stageH = window.innerHeight - other - 2;
      const w = Math.max(340, Math.floor(stageH * W / H));
      app.style.setProperty('--stage-w', w + 'px');
      app.style.setProperty('--stage-h', Math.round(w * H / W + 2) + 'px');
    };
    fit(); const r = requestAnimationFrame(fit);
    window.addEventListener('resize', fit);
    document.addEventListener('fullscreenchange', fit);
    return () => { cancelAnimationFrame(r); window.removeEventListener('resize', fit); document.removeEventListener('fullscreenchange', fit); };
  }, []);
  const optsRef = useRef({});
  optsRef.current = { charges, gap };
  const refresh = () => setUi(simRef.current.snapshot());

  useEffect(() => {
    const sim = simRef.current, cv = cvRef.current, ctx = cv.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)');
    let raf, last = performance.now(), sized = 0;
    const loop = now => {
      const w = cv.clientWidth || W;
      if (sized !== w) { cv.width = Math.round(w * dpr); cv.height = Math.round((w * H / W) * dpr); sized = w; }
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
      sim.update(dt);
      draw(ctx, sim, cv.width / W, { ...optsRef.current, reduced: rm.matches, now: now / 1000 });
      setUi(sim.snapshot());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const onSpeed = v => { simRef.current.v = v; setSpeed(v); refresh(); };
  const onSphere = () => { const s = simRef.current; s.sphere = !s.sphere; setSphere(s.sphere); refresh(); };
  const onPerson = () => { const s = simRef.current; s.setPerson(!s.person); setPerson(s.person); refresh(); };
  const onTouch = () => { const s = simRef.current; s.setTouch(!s.touch); s.armHinted = true; refresh(); };
  const onStool = () => { const s = simRef.current; s.setStool(!s.stool); refresh(); };
  const onKnob = () => { simRef.current.touchKnob(); refresh(); };
  const setKnobMetal = m => { simRef.current.knobMetal = m; refresh(); };
  const reset = () => { simRef.current.reset(); refresh(); };

  // drag the earthed sphere along the bench
  const drag = useRef(null);
  const toCanvas = e => {
    const r = cvRef.current.getBoundingClientRect();
    return [((e.clientX - r.left) * W) / r.width, ((e.clientY - r.top) * H) / r.height];
  };
  const overSphere = (px, py) => {
    const s = simRef.current;
    return s.sphere && (Math.hypot(px - s.sx, py - SPH_Y) < SPH_R + 14 || (Math.abs(px - s.sx) < 22 && py > SPH_Y && py < FLOOR_Y + 4));
  };
  const onDown = e => {
    const [px, py] = toCanvas(e);
    if (nearArm(simRef.current, px, py)) { onTouch(); e.preventDefault(); return; }
    if (!overSphere(px, py)) return;
    drag.current = { off: px - simRef.current.sx };
    simRef.current.dragged = true;
    cvRef.current.setPointerCapture(e.pointerId); cvRef.current.style.cursor = 'grabbing';
    e.preventDefault();
  };
  const onMove = e => {
    const [px, py] = toCanvas(e);
    if (drag.current) { simRef.current.sx = clamp(px - drag.current.off, SPH_XMIN, SPH_XMAX); return; }
    cvRef.current.style.cursor = overSphere(px, py) ? 'grab' : nearArm(simRef.current, px, py) ? 'pointer' : 'default';
  };
  const onUp = () => { drag.current = null; cvRef.current.style.cursor = 'default'; };
  // keyboard: arrow keys move the sphere when the scene has focus
  const onKey = e => {
    const s = simRef.current; if (!s.sphere) return;
    const step = e.shiftKey ? 30 : 6;
    if (e.key === 'ArrowRight') s.sx = clamp(s.sx + step, SPH_XMIN, SPH_XMAX);
    else if (e.key === 'ArrowLeft') s.sx = clamp(s.sx - step, SPH_XMIN, SPH_XMAX);
    else return;
    s.dragged = true; e.preventDefault();
  };

  const s = ui;
  const fill = (speed / BELT_MAX) * 100 + '%';
  const sparkGapNow = s.V / E_SPARK;   // the biggest gap a spark could jump right now
  return (
    <div className="app" ref={appRef}>
      <header className="top">
        <FullscreenButton />
        <a className="favicon-link" href="https://alexmoorephysics.com/" target="_blank" rel="noopener noreferrer" aria-label="Visit alexmoorephysics.com">
          <img src={LOGO} alt="" className="favicon-img" />
        </a>
        <div className="title-block">
          <h1>Van de Graaff Generator</h1>
          <p className="lede">Charge up the dome with a moving belt. Watch the potential difference rise, then make it spark.</p>
        </div>
      </header>

      <main className="layout">
        <section className="stagecol">
          <div className="stage">
            <canvas ref={cvRef} tabIndex={0} style={{ aspectRatio: `${W} / ${H}` }}
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onKeyDown={onKey}
              role="img" aria-label={`Van de Graaff generator. Dome p.d. ${fmtKV(s.V)}, charge ${fmtUC(s.Q)}.${s.sphere ? ` Earthed sphere ${s.touching ? 'touching the dome' : fmtCm(s.gap) + ' from the dome'}; use the arrow keys to move it.` : ''}`} />
            <button className="btn ghost stagebtn" onClick={reset}>Reset</button>
          </div>
        </section>

        <section className="side">
          <div className="fig controls">
            <div className="ctl">
              <label className="ctl-label" htmlFor="belt">Belt speed</label>
              <div className="speed">
                <input id="belt" className="range" type="range" min="0" max={BELT_MAX} step="0.5" value={speed}
                  style={{ '--fill': fill }} aria-valuetext={`${speed.toFixed(1)} metres per second`} onChange={e => onSpeed(parseFloat(e.target.value))} />
              </div>
              <span className="ctl-note">{speed === 0 ? 'The belt is stopped' : `The belt carries ${(BELT_K * speed * 1e6).toFixed(1)} µC up to the dome each second`}</span>
            </div>
            <div className="ctl">
              <span className="ctl-label">Add</span>
              <div className="loads" role="group" aria-label="Add to the scene">
                <button className={'loadpick' + (sphere ? ' on' : '')} aria-pressed={sphere} onClick={onSphere}><SphereIcon /><span>Earthed sphere</span></button>
                <button className={'loadpick' + (person ? ' on' : '')} aria-pressed={person} onClick={onPerson}><PersonIcon /><span>Person</span></button>
              </div>
            </div>

            <div className="ctl">
              <span className="ctl-label">Doorknob</span>
              <div className="knobrow">
                <div className="segs" role="group" aria-label="Doorknob material">
                  <button className={'seg' + (s.knobMetal ? ' on' : '')} aria-pressed={s.knobMetal} onClick={() => setKnobMetal(true)}>Metal</button>
                  <button className={'seg' + (!s.knobMetal ? ' on' : '')} aria-pressed={!s.knobMetal} onClick={() => setKnobMetal(false)}>Wood</button>
                </div>
                <button className="btn primary" onClick={onKnob} disabled={!person || s.knobBusy}>Touch doorknob</button>
              </div>
              <span className="ctl-note">{!person ? 'Add the person first' : s.knobMetal ? 'Metal conducts: their charge flows away to earth' : 'Wood insulates: no charge can flow'}</span>
            </div>

            <div className="actions">
              <p className="hint">
                {sphere ? 'Drag the earthed sphere towards the dome. A spark jumps when the p.d. is big enough for the gap.' : 'Add the earthed sphere to make sparks.'}
                {person && (s.stool
                  ? (s.touch ? ' The person’s hand is on the dome, so they charge up too.' : ' The person’s hand is off the dome. The stool insulates them, so they keep their charge.')
                  : ' With no stool, charge leaks through their shoes into the floor over a few seconds.')}
              </p>
            </div>

            <div className="ctl-row">
              {person && <Switch id="touch" checked={s.touch} onChange={onTouch}>Hand on dome</Switch>}
              {person && <Switch id="stool" checked={s.stool} onChange={onStool}>Insulating stool</Switch>}
              <Switch id="charges" checked={charges} onChange={() => setCharges(c => !c)}>Show charges</Switch>
              <Switch id="gap" checked={gap} onChange={() => setGap(g => !g)}>Show gap</Switch>
            </div>
          </div>

          <div className={'fig readtbl' + (readOpen ? '' : ' min')}>
            <div className="fighead">
              <h2>Readings</h2>
              <button className="minbtn" aria-expanded={readOpen} aria-label={(readOpen ? 'Minimise' : 'Show') + ' readings'}
                title={readOpen ? 'Minimise' : 'Show'} onClick={() => setReadOpen(o => !o)}>
                <svg viewBox="0 0 12 12" aria-hidden="true">
                  <path d={readOpen ? 'M2 6 H10' : 'M6 2 V10 M2 6 H10'} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            {readOpen && <div className="readbody">
              <table className="read">
                <tbody>
                  <tr className="big"><th scope="row">P.d. of dome</th><td className="pos">{fmtKV(s.V)}</td></tr>
                </tbody>
              </table>
              <div className="meter" aria-hidden="true"><span style={{ width: `${clamp(s.V / V_SCALE, 0, 1) * 100}%` }} /></div>
              <div className="meter-scale" aria-hidden="true"><span>0</span><span>100</span><span>200</span><span>300 kV</span></div>
              <table className="read">
                <tbody>
                  <tr><th scope="row">Charge on dome</th><td>{fmtUC(s.Q)}</td></tr>
                  {s.person && !s.touch && <tr><th scope="row">P.d. of person</th><td className="pos">{fmtKV(s.Vp)}</td></tr>}
                  {s.person && <tr><th scope="row">Charge on person</th><td>{fmtUC(s.Qp, 1)}</td></tr>}
                  {s.person && (!s.stool || s.Iperson > 0) && <tr><th scope="row">Current through person</th><td>{(s.Iperson * 1e6).toFixed(1)} µA</td></tr>}
                  {s.lastShock && <tr><th scope="row">Last shock</th><td>{fmtUC(s.lastShock.Q, 1)} <small>at</small> {fmtKV(s.lastShock.V)}</td></tr>}
                  {s.sphere && <tr><th scope="row">Gap</th><td>{s.touching ? 'touching' : fmtCm(s.gap)} <small>sparks at {fmtKV(E_SPARK * s.gap)}</small></td></tr>}
                  <tr><th scope="row">Last spark</th><td>{s.lastSpark ? <>{fmtCm(s.lastSpark.gap)} <small>at</small> {fmtKV(s.lastSpark.V)}</> : '—'}</td></tr>
                </tbody>
              </table>
              <p className="note">Q = CV. The dome’s capacitance is {(C_DOME * 1e12).toFixed(1)} pF{s.person && s.touch ? `; the person adds about ${Math.round(C_PERSON * 1e12)} pF` : ''}. Air breaks down at about 30 kV per cm, so right now a spark could jump {fmtCm(sparkGapNow)}.</p>
            </div>}
          </div>
        </section>
      </main>

      <div className="bottom-block">
        <div className="more-block">
          <a className="more-sims" href="https://alexmoorephysics.com/" target="_blank" rel="noopener noreferrer">
            <img src={LOGO} alt="" className="more-sims-icon" />
            <span>See other simulations</span>
          </a>
          <p className="more-sims-note">Click the icon above to explore other interactive physics simulations like this one, or the button on the right to support the project.</p>
        </div>
        <div className="coffee-row"><BuyMeCoffeeButton /></div>
      </div>
    </div>
  );
}

export default App;
