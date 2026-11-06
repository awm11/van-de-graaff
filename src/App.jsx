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
const W = 800, H = 780;                 // canvas units
const PPM = 600;                        // pixels per metre
const FLOOR_Y = 570;                    // top of the table
const TABLE_W = 432;                    // the table runs from the left edge to here
const GROUND_Y = 744;                   // the floor
const STOOL = { x: 510, w: 132, h: 44 };  // the insulating stool, standing on the floor
const STOOL_DY = STOOL.h;               // without the stool the person stands this much lower
const SHOCK_V = 3e3;                    // you feel a static shock above a few kV
const R_FLOOR = 1.5e10;                 // through the person's shoes to the floor: RC ≈ 1.5 s
const SHOCK_LIFE = 0.7;                 // s
const BURST_LIFE = 0.75;                // s for a rush of electrons to pass along its route
const SPARK_BURST_LIFE = 0.25;          // s: in a spark the electrons all along the route move at once, then fade
// Steady flows are drawn so that the number of electrons passing a point each second goes as the current:
// as the current falls, the electrons thin out (as I^0.75) and slow down (as I^0.25), fading to nothing.
const I_REF = 0.4e-6;                   // at this current the stream is at full density, moving at FLOW_PX px/s
const FLOW_PX = 26;
const flowLevel = I => Math.pow(Math.abs(I) / I_REF, 0.75);   // fraction of electrons shown (1 at I_REF)
const flowSpeed = I => FLOW_PX * Math.pow(Math.abs(I) / I_REF, 0.25);
// below this current the stream stops altogether (by then the hair has as good as stopped moving)
const FLOW_MIN = flowLevel(5.5e-9);
// a door on the right, with a knob the person can reach for
const DOOR_X = 748;
const DOOR_TOP = 100;                   // top of the door itself (the frame sits 8 px above)
const KNOB = { x: 730, y: 446, r: 13 };
const KNOB_GRIP = { x: 711, y: 448 };   // where their hand closes on it
const KNOB_REACH = 0.25, KNOB_HOLD = 1.0;   // s to reach out, s holding on (then the same to let go)
const K = 8.99e9;                       // 1 / 4πε₀
const R_DOME = 0.12;                    // dome radius, m
const C_DOME = R_DOME / K;              // 13.3 pF
const C_PERSON = 100e-12;               // a person on an insulating stool, roughly 100 pF
// The electrons shown charging the person (through the hand, and leaving the hair) are measured against
// the belt's current: full when the person first touches the dome (when most of the belt's charge goes
// into them), thinning out to none once their share falls to CHARGE_FLOW_STOP of it. At the default belt
// speed that's about 35 s, by when they're at about 80% of their final p.d. and their hair has finished rising.
const CHARGE_FLOW_FULL = C_PERSON / (C_PERSON + C_DOME);   // ≈ 0.88
const CHARGE_FLOW_STOP = 0.4;
const R_SPH = 0.03;                     // earthed sphere radius, m
const DOME = { x: 300, y: 296, r: R_DOME * PPM };
const SPH_R = R_SPH * PPM;
const SPH_Y = DOME.y;
const SPH_X0 = 80;                      // where the earthed sphere starts
const SPH_XMIN = 64, SPH_XMAX = DOME.x - DOME.r - SPH_R;   // SPH_XMAX: touching the dome
const BELT_MIN_SHOWN = 0.55;            // fraction of the belt's electrons still shown when the dome has levelled off
const BELT_K = 0.12e-6;                 // charging current per m/s of belt speed (A)
const BELT_MAX = 10;                    // m/s
const R_LEAK = 8e11;                    // leakage through the air and the column (Ω): with the dome alone, RC ≈ 11 s,
                                        // so the p.d. levels off gradually, like a capacitor charging
const CORONA_N = 4;                     // corona current grows as (V / V₀)^n: a soft knee rather than a sudden limit
const CORONA = { I: 4e-6, V: 490e3 };   // corona from the dome: I × (V / V₀)^n
const CORONA_GLOW_I = 0.4e-6;            // corona current at which the glow round the dome is brightest
const CORONA_P = { I: 4e-6, V: 280e3 }; // corona from the person's hair and fingertips (sharper points)
const E_SPARK = 3e6;                    // breakdown field of air, V/m (30 kV per cm)
const Q_UNIT = 0.1e-6;                  // each + drawn is 0.1 µC
const V_SCALE = 350e3;                  // the p.d. meter goes up to 350 kV
const SPARK_LIFE = 0.22;                // s
const BELT_VIS = 26;                    // px/s of belt movement on screen per m/s (slowed down so you can see it)

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = t => t * t * (3 - 2 * t);
const wrap = a => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
const fmtKV = V => { const kv = V / 1e3; return (kv >= 100 ? Math.round(kv) : kv.toFixed(1)) + ' kV'; };
const fmtUC = (Q, d = 2) => (Q * 1e6).toFixed(d) + ' µC';
const fmtCm = g => (g * 100).toFixed(1) + ' cm';

// ===== Person with long hair =====
const HEAD = { x: 534, y: 212, rx: 36, ry: 45 };
const NECK_Y = 276;                     // where the neck meets the shoulders
const SHOULDER = { x: 494, y: 302 };    // the arm that reaches to the dome (on the stool)
const UPPER_ARM = 86, FOREARM = 92;      // both arms, shoulder to elbow and elbow to wrist
const DOWN_ELBOW = { x: 476, y: 386 };  // the same arm hanging at their side
const DOWN_HAND = { x: 474, y: 478 };
const WAIST_Y = 452, FOOT_Y = STOOL.h ? GROUND_Y - STOOL.h : GROUND_Y;   // on the stool
const HAND_ANG = -0.12;                 // where the hand rests on the dome (rad below horizontal; negative is above)
const HAND = { x: DOME.x + (DOME.r + 3) * Math.cos(HAND_ANG), y: DOME.y + (DOME.r + 3) * Math.sin(HAND_ANG) };
const HAIR_N = 48, HAIR_SEG = 12;
const HAIR_COL = '#6e4528';             // the hair's colour (and the under-layer's)
const HAIR_TONES = ['#6e4528', '#664025', '#764a2b', '#6a4327', '#7c4f2f'];   // close shades of it, one per strand
const HAIR_PART = -Math.PI / 2 - 0.38;  // the parting, a little off-centre: strands either side of it fall away to that side
const HAIR_VOL = 3;                     // how far the hair stands off the scalp at the crown when lying flat (px)
// distance of resting hair from the scalp: most at the crown, little at the sides
const hairLift = th => HAIR_VOL * Math.pow(Math.max(0, -Math.sin(th)), 2);
const HAIR_FRONT = 18;                  // extra strands growing from the front of the scalp, not its outline
// the hairline across the forehead: highest in the middle, coming down to the temples
const hairlineY = x => { const d = (x - HEAD.x) / HEAD.rx; return HEAD.y - 4 - (HEAD.ry * 0.52 - 4) * (1 - d * d); };

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
    strands.push({
      phi, L, x0, y0, rest, f: 0, fv: 0, ph: rnd() * 6.28, tip: null,
      a: 6e3 + rnd() * 24e3,           // p.d. at which this strand starts to lift
      s: 30e3 + rnd() * 45e3,          // and the extra p.d. for it to stand right up
      col: HAIR_TONES[Math.floor(rnd() * HAIR_TONES.length)], w: 1.7 + rnd() * 1,
    });
  }
  // strands growing from the front of the scalp (a fraction d of the way out from the head's centre,
  // above the hairline): they sweep sideways over the head into the fall of hair, and stand out
  // from where they grow when charged. Their own random sequence, so the strands above keep their shapes.
  seed = 97;
  for (let i = 0; i < HAIR_FRONT; i++) {
    const phi = -Math.PI + 0.75 + ((i + 0.5) / HAIR_FRONT) * (Math.PI - 1.5) + (rnd() - 0.5) * 0.08;
    let d = 0.62 + rnd() * 0.3;
    while (HEAD.y + d * HEAD.ry * Math.sin(phi) > hairlineY(HEAD.x + d * HEAD.rx * Math.cos(phi)) - 3) d += 0.03;
    const L = 125 + rnd() * 45, o = rnd() * 3;
    const x0 = HEAD.x + d * HEAD.rx * Math.cos(phi), y0 = HEAD.y + d * HEAD.ry * Math.sin(phi);
    const rest = restAngles(phi, L, o, d);
    strands.push({
      phi, L, x0, y0, rest, f: 0, fv: 0, ph: rnd() * 6.28, tip: null, front: true,
      a: 6e3 + rnd() * 24e3, s: 30e3 + rnd() * 45e3, col: HAIR_TONES[Math.floor(rnd() * HAIR_TONES.length)], w: 1.6 + rnd() * 0.9,
    });
  }
  // Charged: each strand stands straight out, drooping a little at the end. Their directions are spaced
  // evenly around the head, in the order of where they grow (each within a degree or two of the scalp's
  // outward normal there), so no two end up lying almost on top of each other.
  const normal = phi => { const n = Math.atan2(Math.sin(phi) / HEAD.ry, Math.cos(phi) / HEAD.rx); return n > 1 ? n - 2 * Math.PI : n; };
  const byDir = strands.slice().sort((p, q) => normal(p.phi) - normal(q.phi));
  const n0 = normal(byDir[0].phi), n1 = normal(byDir[byDir.length - 1].phi);
  byDir.forEach((st, i) => {
    const nAng = n0 + ((n1 - n0) * i) / (byDir.length - 1);
    st.ch = st.rest.map((_, k) => nAng + wrap(Math.PI / 2 - nAng) * 0.16 * Math.pow(k / HAIR_SEG, 1.6));
    st.turn = turnAngles(st.rest, st.ch, st.phi < HAIR_PART);
  });
  // draw the strands that hang at the sides first, the ones over the top last, then those from the front
  strands.sort((p, q) => (p.front ? 1 : 0) - (q.front ? 1 : 0) || Math.abs(Math.cos(q.phi)) - Math.abs(Math.cos(p.phi)));
  return strands;
}
// How far each segment of a strand turns from its resting angle to its charged one. A strand that falls
// to the right turns via the right and over the top, one that falls to the left via the left, so none
// sweeps across the face on the way (the shortest turn would, for strands combed over from the far
// side of the parting). A little leeway the other way allows for small corrections.
function turnAngles(rest, ch, left) {
  return rest.map((r, k) => {
    let d = wrap(ch[k] - r);
    if (left && d < -0.6) d += 2 * Math.PI;
    if (!left && d > 0.6) d -= 2 * Math.PI;
    return d;
  });
}
function restAngles(phi, L, o, d = 1) {
  // falls away from the parting to one side, over the head (standing a little off the scalp at the
  // crown) and down. It rises smoothly from its root rather than kinking up off the scalp.
  const left = phi < HAIR_PART, end = left ? -Math.PI : 0, dir = left ? -1 : 1;
  const off = th => 2 + o + hairLift(th) * (0.75 + o * 0.08);
  const pts = [[HEAD.x + d * HEAD.rx * Math.cos(phi), HEAD.y + d * HEAD.ry * Math.sin(phi)]];
  let th = phi;
  if (d < 1) {
    // a strand from the front of the scalp is combed sideways: across the head, sloping gently
    // down, until it reaches the hair at the side, then it falls with the rest
    let [x, y] = pts[0];
    for (let i = 0; i < 80; i++) {
      x += dir * 3; y = Math.min(y + 0.5 + i * 0.03, hairlineY(x) - 3); pts.push([x, y]);   // never down over the forehead
      th = Math.atan2((y - HEAD.y) / HEAD.ry, (x - HEAD.x) / HEAD.rx);
      if (left && th > 0) th -= 2 * Math.PI;   // keep the left side's angles near -π, not +π
      const r = off(th);
      if (((x - HEAD.x) / (HEAD.rx + r)) ** 2 + ((y - HEAD.y) / (HEAD.ry + r)) ** 2 >= 1) break;
    }
  }
  const th0 = th;
  while (left ? th > end : th < end) {
    th = left ? Math.max(end, th - 0.04) : Math.min(end, th + 0.04);
    const r = off(th) * (d < 1 ? 1 : smooth(Math.min(1, Math.abs(th - th0) / 0.3)));
    pts.push([HEAD.x + (HEAD.rx + r) * Math.cos(th), HEAD.y + (HEAD.ry + r) * Math.sin(th)]);
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
    const a = s.rest[k] + s.f * s.turn[k] + Math.sin(t * 2.3 + s.ph + k * 0.45) * 0.07 * sway * (k / HAIR_SEG);
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
    this.shock = null; this.lastShock = null;
    this.knobT = null;                   // time since they reached for the doorknob
    this.flash = 0; this.surprise = 0; this.beltPos = 0; this.clock = 0;
    // Electron flows. Each steady flow has a current (A, smoothed for display) and a phase that
    // moves the − signs along its route. The sign of each current gives the electrons' direction:
    //   hand:  + means electrons go from the person into the dome
    //   floor: + means electrons come up from the floor into the person
    //   knob:  + means electrons come from the doorknob into the person
    //   ind:   + means electrons come up the earth lead into the earthed sphere
    //   hair:  + means electrons leave the person's own charge (hair and body) as their p.d. rises;
    //          charge that only passes through them (floor or doorknob to the dome) doesn't count
    this.flows = { hand: { I: 0, ph: 0 }, floor: { I: 0, ph: 0 }, knob: { I: 0, ph: 0 }, ind: { I: 0, ph: 0 }, hair: { I: 0, ph: 0 } };
    this.bursts = [];                    // sudden rushes of electrons: sparks, shocks, touching a charged dome
    this.Iperson = 0;                    // current through the person to earth, for the readings
    this.chargeFrac = 1;                 // how much of the belt's current is still building up the dome's charge (0 to 1, smoothed)
    for (const s of this.hair) { s.f = 0; s.fv = 0; }
  }
  // how far the other arm has reached towards the doorknob (0 to 1), and whether it's holding it
  get knobReach() {
    const t = this.knobT; if (t === null) return 0;
    if (t < KNOB_REACH) return smooth(t / KNOB_REACH);
    if (t < KNOB_REACH + KNOB_HOLD) return 1;
    return 1 - smooth(clamp((t - KNOB_REACH - KNOB_HOLD) / KNOB_REACH, 0, 1));
  }
  get knobContact() { return this.knobT !== null && this.knobT >= KNOB_REACH && this.knobT < KNOB_REACH + KNOB_HOLD; }
  touchKnob() { if (this.person && this.knobT === null) this.knobT = 0; }
  // holding a metal doorknob earths the person directly (a low-resistance path)
  get grounded() { return this.person && this.knobContact && this.knobMetal; }
  // with the hand on the dome, the person and the dome are one conductor
  get joined() { return this.person && this.touch; }
  // the p.d. of the person
  get Vnode() { return this.joined ? this.V : this.Vp; }
  // a sudden rush of electrons along a route (see drawFlows); n − signs, more for more charge
  burst(route, Q) {
    if (this.bursts.length > 6) this.bursts.shift();
    this.bursts.push({ t: 0, route, n: clamp(Math.round(Math.abs(Q) / Q_UNIT), 4, 40) });
  }
  // The person is held at 0 V by the metal doorknob: electrons rush from the knob into
  // them (and on into the dome, if their hand is on it), cancelling their positive charge
  zap(V, Q, from) {
    if (V < SHOCK_V) return;
    this.shock = { t: 0, Q, V, from, to: 'knob', seed: Math.floor(Math.random() * 1e9) };
    this.lastShock = { Q, V };
    this.surprise = 1.2;
    this.flash = Math.min(1, 0.2 + Q * 1.5e5);
    this.burst({ kind: 'knob', toDome: from === 'hand' }, Q);
  }
  // The person and the dome join and end up at one p.d. Electrons flow from whichever is at
  // the lower p.d. into the other one. A big enough difference gives a little zap at the hand.
  share(Vdome, Vperson) {
    const Vnew = (C_DOME * Vdome + C_PERSON * Vperson) / (C_DOME + C_PERSON);
    const dQ = C_PERSON * (Vnew - Vperson);          // positive: the person's charge goes up, so electrons leave them
    if (Math.abs(dQ) > 0.02e-6) this.burst({ kind: 'share', out: dQ > 0 }, dQ);
    if (Math.abs(Vdome - Vperson) >= SHOCK_V) { this.surprise = 0.6; this.handZap = { t: 0, seed: Math.floor(Math.random() * 1e9) }; }
    this.V = Vnew; this.Vp = Vnew;
  }
  get C() { return C_DOME + (this.joined ? C_PERSON : 0); }
  get Q() { return C_DOME * this.V; }
  get Qp() { return this.person ? C_PERSON * this.Vp : 0; }
  gap() { return Math.max(0, (DOME.x - DOME.r - (this.sx + SPH_R)) / PPM); }
  touching() { return this.sphere && this.sx >= SPH_XMAX - 0.5; }
  // charge induced on the earthed sphere (negative): electrons drawn up from earth, using its image in the dome
  Qind() { return this.sphere ? -(R_SPH / K) * this.V * (DOME.r / (DOME.x - this.sx)) : 0; }
  // the person steps up and puts their hand on the charged dome: the charge shares out
  setPerson(on) {
    if (on === this.person) return;
    this.person = on;   // stepping away, they take their own charge with them
    this.Vp = 0; this.shock = null;
    if (!on) return;
    this.touch = true;
    this.share(this.V, 0);
  }
  // hand on: the dome and the person share their charge and end up at one p.d.
  // hand off: the person keeps their charge (unless it leaks away through the floor)
  setTouch(on) {
    if (!this.person || on === this.touch) return;
    this.touch = on;
    if (on) this.share(this.V, this.Vp);
  }
  // stepping off the stool onto the floor: from then on, charge leaks through
  // their shoes into the floor (resistance R_FLOOR), over a few seconds
  setStool(on) { this.stool = on; }
  update(dt) {
    this.clock += dt;
    this.beltPos += this.v * BELT_VIS * dt;
    if (this.knobT !== null && (this.knobT += dt) > 2 * KNOB_REACH + KNOB_HOLD) this.knobT = null;
    // keep account of the charge that moves this frame, so the electron flows can be drawn
    const Vp0 = this.Vp, Qind0 = this.Qind(), wasJoined = this.joined;
    let qFloor = 0, qKnob = 0, qTouch = 0, qNet = 0;
    this.qEvP = 0; this.sparked = false;
    const steps = Math.max(1, Math.ceil(dt / 0.001)), h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const I = BELT_K * this.v;
      if (this.person && !this.stool) qFloor += (this.Vnode / R_FLOOR) * h;
      let leak = this.V / R_LEAK + CORONA.I * Math.pow(this.V / CORONA.V, CORONA_N);
      if (this.joined) leak += CORONA_P.I * Math.pow(this.V / CORONA_P.V, CORONA_N) + (this.stool ? 0 : this.V / R_FLOOR);
      this.V = Math.max(0, this.V + ((I - leak) / this.C) * h);
      qNet += (I - leak) * h;
      if (this.sphere) {
        if (this.touching()) { qTouch += this.C * this.V; this.V = 0; }   // touching: the dome is earthed through the sphere
        else if (this.V >= E_SPARK * this.gap()) this.spark();
      }
      if (this.grounded) {
        // earthed through the doorknob: any charge on them (and the dome, if they touch it) is cancelled at once
        const q = (this.touch ? C_DOME * this.V : 0) + C_PERSON * this.Vp;
        if (this.touch && this.V >= SHOCK_V) { this.qEvP -= C_PERSON * this.Vp; this.zap(this.V, q, 'hand'); }
        else if (this.Vp >= SHOCK_V) { this.qEvP -= C_PERSON * this.Vp; this.zap(this.Vp, q, 'body'); }
        else qKnob += q;                                     // a small, steady trickle
        this.Vp = 0; if (this.touch) this.V = 0;
      }
      else if (this.joined) this.Vp = this.V;
      else if (this.person) {
        // on their own, the person's charge leaks away: slowly into the air, or through their shoes to the floor
        const lp = this.Vp / R_LEAK + CORONA_P.I * Math.pow(this.Vp / CORONA_P.V, CORONA_N) + (this.stool ? 0 : this.Vp / R_FLOOR);
        this.Vp = Math.max(0, this.Vp - (lp / C_PERSON) * h);
      }
    }
    // steady currents this frame (conventional current, in A)
    if (dt > 0) {
      // through the hand, dome → person: whatever the person gained, plus whatever passed on through them to earth
      const Ihand = wasJoined && this.joined ? ((C_PERSON * (this.Vp - Vp0) - this.qEvP) + qFloor + qKnob) / dt : 0;
      const Ifloor = qFloor / dt, Iknob = qKnob / dt;
      const Ihair = wasJoined && this.joined ? (C_PERSON * (this.Vp - Vp0) - this.qEvP) / dt : 0;
      // electrons come up the earth lead as the sphere's induced charge grows (and go back down as it shrinks);
      // while the sphere touches the dome, a steady stream runs up through it into the dome
      const Iind = this.sparked ? 0 : (qTouch > 0 ? qTouch / dt : -(this.Qind() - Qind0) / dt);
      const k = 1 - Math.exp(-dt / 0.15);
      // the fraction of the belt's charge that is still adding to the dome (the rest leaks away)
      const Ib = BELT_K * this.v, frac = Ib > 0 ? clamp(qNet / (Ib * dt), 0, 1) : 0;
      this.chargeFrac += (frac - this.chargeFrac) * (1 - Math.exp(-dt / 0.4));
      for (const [key, I] of [['hand', Ihand], ['floor', Ifloor], ['knob', Iknob], ['ind', Iind], ['hair', Ihair]]) {
        const f = this.flows[key];
        f.I += (I - f.I) * k;
        f.ph += Math.min(900, flowSpeed(f.I)) * dt;
      }
      // once the hand lets go of the knob, nothing more can flow through it
      if (!this.knobContact) this.flows.knob.I = 0;
      this.Iperson = this.person ? Math.max(0, this.flows.floor.I + this.flows.knob.I) : 0;
    }
    for (const b of this.bursts) b.t += dt;
    this.bursts = this.bursts.filter(b => b.t < (b.route.kind === 'spark' ? SPARK_BURST_LIFE : BURST_LIFE));
    if (this.handZap && (this.handZap.t += dt) > 0.3) this.handZap = null;
    for (const s of this.sparks) s.t += dt;
    this.sparks = this.sparks.filter(s => s.t < SPARK_LIFE);
    this.flash = Math.max(0, this.flash - dt * 5);
    this.surprise = Math.max(0, this.surprise - dt);
    if (this.shock && (this.shock.t += dt) > SHOCK_LIFE) this.shock = null;
    stepHair(this.hair, this.person ? this.Vp : 0, dt);
  }
  // A spark: electrons rush up from earth through the sphere, jump the gap into the dome
  // (and on into the person, if their hand is on it), cancelling nearly all its positive charge
  spark() {
    const g = this.gap(), Q = this.C * this.V;
    this.lastSpark = { gap: g, V: this.V, Q }; this.lastSparkT = this.clock;
    this.nSparks++;
    const V0 = this.V;
    this.V *= 0.03;
    if (this.joined) { this.qEvP += C_PERSON * (this.V - V0); this.Vp = this.V; }
    this.sparked = true;
    if (this.sparks.length < 3) this.sparks.push({ t: 0, seed: Math.floor(Math.random() * 1e9) });
    this.burst({ kind: 'spark', toPerson: this.joined }, Q);
    this.flash = Math.min(1, 0.25 + Q * 1.5e5);
    if (this.joined) this.surprise = 0.9;
  }
  snapshot() {
    return {
      V: this.V, Vp: this.Vp, Q: this.Q, Qp: this.Qp, v: this.v, sphere: this.sphere, person: this.person, touch: this.touch,
      stool: this.stool, Iperson: this.Iperson, lastShock: this.lastShock, knobMetal: this.knobMetal, knobBusy: this.knobT !== null,
      gap: this.gap(), touching: this.touching(), lastSpark: this.lastSpark, nSparks: this.nSparks,
      sparkAge: this.lastSparkT == null ? Infinity : this.clock - this.lastSparkT,
      chargeFrac: this.chargeFrac, knobContact: this.knobContact, joined: this.joined,
    };
  }
}

// ===== Canvas drawing =====
const FONT = '"Atkinson Hyperlegible", "Segoe UI", system-ui, sans-serif';
const COL = {
  wall0: '#f5efe0', wall1: '#e7dcc4', metal: '#8f99a3', metalDk: '#5c6670', ink: '#1b262e',
  skin: '#8fb3dc', skinDk: '#55789f', shirt: '#3f9b5a', shirtDk: '#2a6b3d',
  pos: '#d23b30', neg: '#1b62c4', belt: '#5a463c', beltDk: '#3a2c25',
};
// Hovering over something clickable (sim.hover names it) gives it an amber glow
const HOVER_COL = 'rgba(255,176,32,0.95)';
function hoverGlow(ctx, on) { if (on) { ctx.shadowColor = HOVER_COL; ctx.shadowBlur = 20; } }
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
function haloText(ctx, txt, x, y, col) {
  ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.lineWidth = 3.5; ctx.strokeText(txt, x, y);
  ctx.fillStyle = col; ctx.fillText(txt, x, y);
}
// a textbook electron symbol: a small circle with a − inside
function electronDot(ctx, x, y, r = 5.2) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#eef3fb'; ctx.fill();
  ctx.strokeStyle = COL.neg; ctx.lineWidth = 1.3; ctx.stroke();
  ctx.strokeStyle = COL.neg; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - r * 0.5, y); ctx.lineTo(x + r * 0.5, y); ctx.stroke();
}
// a + sign, with a thin white edge so it reads on any background; every electron
// (negative charge) is drawn as the circled electron symbol instead
function sign(ctx, x, y, positive, size = 4) {
  if (!positive) { electronDot(ctx, x, y, size * 1.3); return; }
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - size, y); ctx.lineTo(x + size, y);
  ctx.moveTo(x, y - size); ctx.lineTo(x, y + size);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 4.4; ctx.stroke();
  ctx.strokeStyle = COL.pos; ctx.lineWidth = 2.2; ctx.stroke();
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
  // white skirting board (matching the door frame), with a fine edge along its top so it stands off the cream wall
  ctx.fillStyle = '#fbf8f1'; ctx.fillRect(0, GROUND_Y - 8, W, 8);
  ctx.fillStyle = 'rgba(120,100,70,0.35)'; ctx.fillRect(0, GROUND_Y - 8, W, 1);
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
// Earth symbol standing on the table: three bars, a stem, and a brass terminal on top (at y)
// where the lead connects. Drawn after the lead, so the terminal covers the lead's end.
function drawEarth(ctx, x, y) {
  const top = FLOOR_Y - 15;
  ctx.strokeStyle = COL.ink; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x, top);
  for (const [w, dy] of [[12, 0], [8, 5], [4, 10]]) { ctx.moveTo(x - w, top + dy); ctx.lineTo(x + w, top + dy); }
  ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fillStyle = '#c9a43a'; ctx.fill();
  ctx.strokeStyle = '#6d5a1f'; ctx.lineWidth = 1; ctx.stroke();
}
const EARTH_Y = FLOOR_Y - 30;           // height of the terminal on top of each earth symbol, where the lead joins it
const EARTH_X = 22;                     // the earthed sphere's earth symbol, at the left end of the table
// green and yellow earth lead
function earthLead(ctx, pathFn) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = '#1f6b3c'; ctx.lineWidth = 4.5; ctx.setLineDash([]); pathFn(); ctx.stroke();
  ctx.strokeStyle = '#3aa35a'; ctx.lineWidth = 3; pathFn(); ctx.stroke();
  ctx.strokeStyle = '#f2cf3a'; ctx.lineWidth = 3; ctx.setLineDash([6, 6]); pathFn(); ctx.stroke();
  ctx.setLineDash([]);
}

const BASE = { x: 240, y: 482, w: 120, h: FLOOR_Y - 482 };   // a little taller than before, to carry the belt-speed slider
// the belt-speed slider sits on the front of the base (an HTML range input laid over the canvas)
const SLIDER = { x: BASE.x + 28, y: BASE.y + 30, w: BASE.w - 40 };
const COLUMN = { x: DOME.x - 21, w: 42, top: DOME.y + 30 };
const BELT_UP = DOME.x - 10, BELT_DOWN = DOME.x + 10;

function drawGenerator(ctx, sim, o) {
  // earth lead from the base's terminal (the lower comb is earthed)
  const tx = BASE.x + BASE.w - 10, ty = FLOOR_Y - 16;
  const ex = Math.min(BASE.x + BASE.w + 50, TABLE_W - 16);
  // the lead droops towards the table, then comes in level to the terminal
  earthLead(ctx, () => { ctx.beginPath(); ctx.moveTo(tx, ty); ctx.bezierCurveTo(tx + 14, ty + 20, ex - 26, EARTH_Y, ex - 3, EARTH_Y); });
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
    // the number shown on the belt goes with how fast the dome is charging up: as leakage catches up
    // with the belt near the top p.d., fewer and fewer are shown (each keeps its identity as it moves)
    // ...but while the belt is running there are always a few on it, so you can see it moving
    const sp = 22, off = sim.beltPos % sp, base = Math.floor(sim.beltPos / sp), lev = sim.v > 0 ? Math.max(sim.chargeFrac, BELT_MIN_SHOWN) : sim.chargeFrac;
    const shown = j => { const h = (j - base) * 0.6180339887; return clamp((lev - (h - Math.floor(h))) * 12, 0, 1); };
    let j = 0;
    if (o.posFlow) {
      // conventional-current picture: + charge carried up the belt to the dome
      for (let y = BASE.y - 6 - off; y > COLUMN.top; y -= sp, j++) {
        const a = shown(j); if (a <= 0) continue;
        ctx.save(); ctx.globalAlpha = a; sign(ctx, BELT_UP, y, true, 3.4); ctx.restore();
      }
    } else {
      // electrons are stripped from the dome's comb onto the belt (leaving the dome positive),
      // then ride the insulating belt down to the lower comb, which is earthed
      for (let y = COLUMN.top + off; y < BASE.y - 6; y += sp, j++) {
        const a = shown(j); if (a <= 0) continue;
        ctx.save(); ctx.globalAlpha = a; electronDot(ctx, BELT_DOWN, y, 5.2); ctx.restore();
      }
    }
  }
  ctx.strokeStyle = 'rgba(120,150,170,0.75)'; ctx.lineWidth = 1.2;
  ctx.strokeRect(COLUMN.x, COLUMN.top, COLUMN.w, BASE.y - COLUMN.top);
  ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(COLUMN.x + 4, COLUMN.top, 4, BASE.y - COLUMN.top);

  // the base, with the motor inside
  rr(ctx, BASE.x, BASE.y, BASE.w, BASE.h, 8); ctx.fillStyle = '#3a444e'; ctx.fill();
  ctx.strokeStyle = '#1f262c'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(BASE.x + 4, BASE.y + 2, BASE.w - 8, 2);
  rr(ctx, COLUMN.x - 6, BASE.y - 6, COLUMN.w + 12, 8, 3); ctx.fillStyle = '#c9d1d7'; ctx.fill();
  // power lamp, a recessed slot for the speed slider, and its label and reading
  ctx.beginPath(); ctx.arc(BASE.x + 14, SLIDER.y, 3.5, 0, Math.PI * 2); ctx.fillStyle = sim.v > 0 ? '#3ccf63' : '#9aa3ab'; ctx.fill();
  rr(ctx, SLIDER.x - 6, SLIDER.y - 11, SLIDER.w + 12, 22, 11); ctx.fillStyle = '#2b333a'; ctx.fill();
  ctx.font = `700 9px ${FONT}`; ctx.fillStyle = '#aeb8c0';
  ctx.textAlign = 'center'; ctx.fillText('BELT SPEED', SLIDER.x + SLIDER.w / 2, BASE.y + 56);
  // a row of vent slots along the bottom, clear of the earth terminal
  ctx.fillStyle = '#2b333a';
  for (let k = 0; k < 8; k++) { rr(ctx, BASE.x + 14 + k * 10, BASE.y + 67, 5, 13, 2); ctx.fill(); }
  // earth terminal
  ctx.beginPath(); ctx.arc(tx, ty, 4.5, 0, Math.PI * 2); ctx.fillStyle = '#c9a43a'; ctx.fill(); ctx.strokeStyle = '#6d5a1f'; ctx.lineWidth = 1; ctx.stroke();

  // a faint violet glow from corona discharge, as bright as the corona current is strong: about half
  // brightness at the default belt speed's top p.d., full at top speed, barely any at the slowest
  const Ic = CORONA.I * Math.pow(sim.V / CORONA.V, CORONA_N);
  const glow = Math.pow(clamp(Ic / CORONA_GLOW_I, 0, 1), 0.7) * (o.reduced ? 0.6 : 0.75 + 0.25 * Math.sin(o.now * 23));
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
const PERSON_DX = 40;                   // the person's drawing is shifted this far right of the coordinates below
function personOffset(sim) {
  const sh = sim.shock ? Math.sin(sim.shock.t * 95) * 4 * (1 - sim.shock.t / SHOCK_LIFE) : 0;
  return [PERSON_DX + sh, sim.stool ? 0 : STOOL_DY];
}
// with the stool taken away, a button standing on the floor beside the person puts it back
const ADD_STOOL = { x: STOOL.x + STOOL.w + 8, y: GROUND_Y - 30, w: 82, h: 26 };
function drawAddStool(ctx, sim) {
  const b = ADD_STOOL, hov = sim.hover === 'addstool';
  ctx.save(); hoverGlow(ctx, hov);
  rr(ctx, b.x, b.y, b.w, b.h, 8); ctx.fillStyle = hov ? '#f7d867' : '#f0cf55'; ctx.fill();
  ctx.restore();
  ctx.strokeStyle = '#a8862a'; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.font = `700 13px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#3a2c0a';
  ctx.fillText('Add stool', b.x + b.w / 2, b.y + b.h / 2 + 0.5); ctx.textBaseline = 'alphabetic';
}
function drawStool(ctx, sim) {
  const x = STOOL.x, top = GROUND_Y - STOOL.h;
  ctx.font = `700 13px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = COL.ink;
  if (!sim.stool) { ctx.fillText('on the earthed floor', x + STOOL.w / 2, GROUND_Y + 24); drawAddStool(ctx, sim); return; }
  // a plastic stool: seat and three legs
  // the two outer legs are further back, in shadow under the seat; the middle one is
  // at the front, so it is lighter and reaches slightly lower
  // they splay outwards by 10°, pivoting where they meet the seat (and are just long enough to reach the floor)
  const splay = (10 * Math.PI) / 180, legL = (STOOL.h - 6) / Math.cos(splay);
  ctx.save(); hoverGlow(ctx, sim.hover === 'stool');
  ctx.fillStyle = '#a8862a';
  for (const [lx, dir] of [[x + 10, 1], [x + STOOL.w - 22, -1]]) {
    ctx.save(); ctx.translate(lx + 6, top + 8); ctx.rotate(dir * splay);
    rr(ctx, -6, 0, 12, legL, 4); ctx.fill(); ctx.restore();   // rounded feet
  }
  ctx.fillStyle = '#d9b43c'; rr(ctx, x + STOOL.w / 2 - 6, top + 8, 12, STOOL.h - 3, 4); ctx.fill();
  rr(ctx, x, top, STOOL.w, 12, 5); ctx.fillStyle = '#f0cf55'; ctx.fill(); ctx.strokeStyle = '#a8862a'; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x + 6, top + 2, STOOL.w - 12, 2);
  ctx.fillStyle = COL.ink; ctx.fillText('insulating stool', x + STOOL.w / 2, GROUND_Y + 24);
}
// Hair below the tops of the shoulders falls behind the body: is this point of hair (scene coordinates) hidden?
const SHOULDER_TOP = 292;
function hairBehindBody(sim, x, y) {
  const [ox, oy] = personOffset(sim);
  return y > SHOULDER_TOP + oy && x > 482 + ox && x < 586 + ox;
}
function drawHairStrands(ctx, sim, pts) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  sim.hair.forEach((s, i) => {
    const p = pts[i];
    ctx.strokeStyle = s.col; ctx.lineWidth = s.w; ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]);
    for (let k = 1; k < p.length - 1; k++) ctx.quadraticCurveTo(p[k][0], p[k][1], (p[k][0] + p[k + 1][0]) / 2, (p[k][1] + p[k + 1][1]) / 2);
    ctx.lineTo(p[p.length - 1][0], p[p.length - 1][1]); ctx.stroke();
  });
}
function drawPersonBody(ctx, sim, o) {
  const u = HEAD.rx / 46;                      // face features scale with the head
  const [ox, oy] = personOffset(sim);
  ctx.save(); ctx.translate(ox, oy);
  // trousers: straight legs, joined at the hips
  const AY = FOOT_Y - 8, CY = WAIST_Y + 44;   // ankles, crotch
  ctx.fillStyle = '#55524f'; ctx.strokeStyle = '#363431'; ctx.lineWidth = 1.2; ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(486, WAIST_Y - 4); ctx.lineTo(582, WAIST_Y - 4); ctx.lineTo(581, AY); ctx.lineTo(539, AY);
  ctx.lineTo(538, CY); ctx.quadraticCurveTo(534, CY - 6, 530, CY); ctx.lineTo(529, AY); ctx.lineTo(487, AY);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#2b2f33';
  ctx.beginPath(); ctx.ellipse(506, FOOT_Y - 6, 24, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(562, FOOT_Y - 6, 24, 7, 0, 0, Math.PI * 2); ctx.fill();
  // the hair, all of it, behind the body: what hangs below the shoulders stays back there
  const hairPts = sim.hair.map(s => strandPoints(s, o.now));
  sim.hair.forEach((s, i) => { s.pts = hairPts[i].map(([x, y]) => [x + ox, y + oy]); });   // kept in scene coordinates, for the charges
  drawHairStrands(ctx, sim, hairPts);
  // torso in a shirt, down to a belt at the waist
  ctx.fillStyle = COL.shirt; ctx.strokeStyle = COL.shirtDk; ctx.lineWidth = 1.5;
  ctx.beginPath();
  // a simple block: straight sides, rounded shoulder corners
  ctx.moveTo(486, WAIST_Y + 4); ctx.lineTo(484, 306); ctx.quadraticCurveTo(484, 291, 499, 290);
  ctx.lineTo(HEAD.x - 11, NECK_Y); ctx.lineTo(HEAD.x + 11, NECK_Y); ctx.lineTo(569, 290);
  ctx.quadraticCurveTo(584, 291, 584, 306); ctx.lineTo(582, WAIST_Y + 4);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#3b2f2a'; ctx.fillRect(485, WAIST_Y - 2, 98, 8);
  // neck and collar
  ctx.fillStyle = COL.skin; ctx.strokeStyle = COL.skinDk; ctx.lineWidth = 1.2;
  rr(ctx, HEAD.x - 10, HEAD.y + HEAD.ry - 12, 20, NECK_Y - (HEAD.y + HEAD.ry - 12) + 4, 6); ctx.fill(); ctx.stroke();
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
  // hair: a darker under-layer that fills in under the strands (its volume shrinks to just the
  // roots as the hair stands up), with an uneven fringe and a parting, then the strands on top
  let fAvg = 0; for (const s of sim.hair) fAvg += clamp(s.f, 0, 1); fAvg /= sim.hair.length || 1;
  const vol = 1 - 0.85 * fAvg;
  ctx.fillStyle = HAIR_COL; ctx.beginPath();
  for (let th = -Math.PI - 0.1; th <= 0.1; th += 0.05) {
    const r = 2 + hairLift(th) * vol;
    ctx.lineTo(HEAD.x + (HEAD.rx + r) * Math.cos(th), HEAD.y + (HEAD.ry + r) * Math.sin(th));
  }
  // the hairline, right temple to left: higher over the forehead, in soft scallops, with a notch at the parting
  const hl = hairlineY;
  // uneven tufts (widths as fractions of the head's width, and how far each dips), the parting falling between two
  const tufts = [[0.13, 3], [0.2, 6], [0.12, 2.5], [0.17, 5], [0.14, 3.5], [0.24, 6.5]];
  const px = HEAD.x + HEAD.rx * Math.cos(HAIR_PART);
  ctx.lineTo(HEAD.x + HEAD.rx + 1, HEAD.y - 2);
  let xa = HEAD.x + HEAD.rx;
  for (const [w, dip] of tufts) {
    const xb = xa - 2 * HEAD.rx * w, xm = (xa + xb) / 2;
    ctx.quadraticCurveTo(xm, hl(xm) + dip - (Math.abs(xm - px) < 6 ? 5 : 0), xb, hl(xb));
    xa = xb;
  }
  ctx.lineTo(HEAD.x - HEAD.rx - 1, HEAD.y - 2);
  ctx.closePath(); ctx.fill();
  // and again over the head and face, but only down to the tops of the shoulders
  ctx.save(); ctx.beginPath(); ctx.rect(-1e4, -1e4, 2e4, 1e4 + SHOULDER_TOP); ctx.clip();
  drawHairStrands(ctx, sim, hairPts);
  ctx.restore();
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
  const [sh, el, wr] = armPath(sim), glow = sim.hover === 'arm';
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // forearm (skin), glowing when hovered, then the sleeve over the upper arm (never glows)
  ctx.save(); hoverGlow(ctx, glow);
  ctx.strokeStyle = COL.skinDk; ctx.lineWidth = 17; ctx.beginPath(); ctx.moveTo(el.x, el.y); ctx.lineTo(wr.x, wr.y); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = COL.skin; ctx.lineWidth = 14.5; ctx.stroke();
  ctx.strokeStyle = COL.shirtDk; ctx.lineWidth = 26; ctx.beginPath(); ctx.moveTo(sh.x, sh.y); ctx.lineTo(el.x + 1, el.y - 4); ctx.stroke();
  ctx.strokeStyle = COL.shirt; ctx.lineWidth = 23; ctx.stroke();
  // the hand, glowing with the forearm
  ctx.save(); hoverGlow(ctx, glow);
  drawHand(ctx, wr, Math.atan2(wr.y - el.y, wr.x - el.x), sim.touch ? 1 : -1);   // thumb uppermost on the dome
  ctx.restore();
}
// the person's charge: spread along the whole length of every strand of hair
// (each strand is charged, so the strands repel), and over the shoulders and arm
// 0–3 shoulders, 4–6 upper arm, 7–9 forearm, then torso (even) and legs (odd) from 10 to 21
const BODY_FILL = [0, 10, 11, 8, 3, 13, 12, 5, 1, 15, 14, 9, 2, 17, 16, 6, 19, 18, 4, 21, 20, 7];
function drawPersonCharges(ctx, sim) {
  const n = Math.round(sim.Qp / Q_UNIT), shown = Math.min(n, 110);
  if (!shown) return false;
  const [ox, oy] = personOffset(sim);
  const hair = [];
  for (const s of sim.hair) if (s.pts) for (let k = 2; k < s.pts.length; k++) if (!hairBehindBody(sim, ...s.pts[k])) hair.push(s.pts[k]);
  const body = [];
  for (let k = 0; k < 4; k++) body.push([514 + k * 14 + ox, 291 + oy]);
  const [sh, el, wr] = armPath(sim);
  for (let k = 0; k < 3; k++) body.push([sh.x - 12 + (el.x - sh.x) * (k / 2), sh.y + (el.y - sh.y) * (k / 2)]);
  for (let k = 1; k < 4; k++) body.push([el.x - 8 + (wr.x - el.x) * (k / 3), el.y + (wr.y - el.y) * (k / 3)]);
  // a few sprinkled through the torso and down both legs (interleaved, so even a handful spreads out)
  const torso = [[506, 336], [552, 352], [528, 398], [568, 418], [500, 432], [540, 444]];
  const legs = [[506, 520], [560, 548], [512, 600], [556, 628], [508, 668], [562, 690]];
  for (let k = 0; k < 6; k++) body.push([torso[k][0] + ox, torso[k][1] + oy], [legs[k][0] + ox, legs[k][1] + oy]);
  const nb = Math.min(body.length, Math.round(shown * 0.2)), nh = Math.min(hair.length, shown - nb);
  // strand by strand, at a different point along each one, so the + signs cover every strand from root to tip
  for (let k = 0; k < nh; k++) { const p = hair[Math.floor(((k + 0.5) * hair.length) / nh)]; sign(ctx, p[0], p[1], true, 3.2); }
  // the body's signs fill in, in a fixed order spread over shoulders, arm, torso and legs, so more charge
  // adds new signs and the ones already there stay put (they go in reverse order as the person discharges)
  for (let k = 0; k < nb; k++) { const p = body[BODY_FILL[k]]; sign(ctx, p[0], p[1], true, 3.2); }
  return nh + nb < n;
}
// Scattered points across the torso where electrons fade in and out as they pass
// through the person, rather than all funnelling through one spot. Each point
// twinkles on its own slow cycle; how many show, and how brightly, depends on
// how much current is actually flowing through the person right now.
const BODY_SCATTER = [[512, 300], [536, 294], [558, 306], [506, 328], [534, 332], [560, 324], [518, 358], [546, 360]];
const BODY_PHASE = BODY_SCATTER.map((_, i) => (i * 2.399963) % (Math.PI * 2));
// How much of a steady flow of electrons is shown (0 to 1). The person charging up is measured
// against the belt (see CHARGE_FLOW_STOP); everything else against a fixed current, down to FLOW_MIN.
function streamLevel(sim, fl) {
  const f = sim.flows;
  if ((fl === f.hand && sim.stool) || fl === f.hair) {
    const Ib = BELT_K * sim.v, rel = Ib > 0 ? Math.abs(fl.I) / Ib : 0;
    return Math.pow(clamp((rel - CHARGE_FLOW_STOP) / (CHARGE_FLOW_FULL - CHARGE_FLOW_STOP), 0, 1), 0.75);
  }
  const lev = Math.min(1, flowLevel(fl.I));
  return lev < FLOW_MIN ? 0 : lev;
}
function drawBodyElectrons(ctx, sim, o) {
  if (!sim.person) return;
  // as busy as the busiest flow through the body, measured the same way as the streams
  const f = sim.flows, level = Math.max(streamLevel(sim, f.hand), streamLevel(sim, f.floor), streamLevel(sim, f.knob));
  if (level <= 0) return;
  const [ox, oy] = personOffset(sim);
  for (let i = 0; i < BODY_SCATTER.length; i++) {
    const twinkle = 0.5 + 0.5 * Math.sin(o.now * 1.6 + BODY_PHASE[i]);
    const show = twinkle * level;
    if (show < 0.18) continue;
    const [x, y] = BODY_SCATTER[i];
    ctx.save(); ctx.globalAlpha = Math.min(1, show);
    sign(ctx, x + ox, y + oy, !!o.posFlow, 3.4);
    ctx.restore();
  }
}
// The other arm: hanging at their side, or reaching out to the doorknob.
// Same two-bone IK as the dome arm, with the elbow kept low.
function otherArmPath(sim) {
  const [ox, oy] = personOffset(sim);
  const S = { x: 574 + ox, y: 302 + oy }, rest = { x: 594 + ox, y: 478 + oy }, r = sim.knobReach;
  const T = { x: rest.x + (KNOB_GRIP.x - rest.x) * r, y: rest.y + (KNOB_GRIP.y - rest.y) * r };
  const L1 = UPPER_ARM, L2 = FOREARM;
  const d = Math.min(Math.hypot(T.x - S.x, T.y - S.y), L1 + L2 - 0.5);
  const a = Math.atan2(T.y - S.y, T.x - S.x);
  const b = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  const e1 = { x: S.x + L1 * Math.cos(a + b), y: S.y + L1 * Math.sin(a + b) };
  const e2 = { x: S.x + L1 * Math.cos(a - b), y: S.y + L1 * Math.sin(a - b) };
  const Eik = e1.y > e2.y ? e1 : e2;
  // hanging relaxed (mirroring the other arm), easing into the reaching pose as they reach
  const restEl = { x: 592 + ox, y: 386 + oy }, m = smooth(clamp(r, 0, 1));
  const E = { x: restEl.x + (Eik.x - restEl.x) * m, y: restEl.y + (Eik.y - restEl.y) * m };
  return [S, E, { x: E.x + L2 * Math.cos(Math.atan2(T.y - E.y, T.x - E.x)), y: E.y + L2 * Math.sin(Math.atan2(T.y - E.y, T.x - E.x)) }];
}
// A simple mitten-shaped hand on the end of the forearm (p), pointing along it (ang).
// side (+1 or -1) puts the thumb on the side towards the body.
function drawHand(ctx, p, ang, side) {
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(ang);
  ctx.fillStyle = COL.skin; ctx.strokeStyle = COL.skinDk; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.ellipse(6, 8.5 * side, 7.5, 4, 0.7 * side, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  rr(ctx, -2, -9, 23, 18, 8.5); ctx.fill(); ctx.stroke();
  ctx.restore();
}
// is (px, py) on the forearm or hand nearest the door?
function nearKnobHand(sim, px, py) {
  if (!sim.person) return false;
  const [, el, hd] = otherArmPath(sim), a = Math.atan2(hd.y - el.y, hd.x - el.x);
  const tip = { x: hd.x + 18 * Math.cos(a), y: hd.y + 18 * Math.sin(a) }, dx = tip.x - el.x, dy = tip.y - el.y;
  const t = clamp(((px - el.x) * dx + (py - el.y) * dy) / (dx * dx + dy * dy), 0, 1);
  return Math.hypot(px - el.x - t * dx, py - el.y - t * dy) < 16;
}
function drawOtherArm(ctx, sim) {
  const [sh, el, hd] = otherArmPath(sim);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const glow = sim.hover === 'knobhand';   // hovering the hand: it glows, like the other clickable things
  ctx.save(); hoverGlow(ctx, glow);
  ctx.strokeStyle = COL.skinDk; ctx.lineWidth = 17; ctx.beginPath(); ctx.moveTo(el.x, el.y); ctx.lineTo(hd.x, hd.y); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = COL.skin; ctx.lineWidth = 14.5; ctx.stroke();
  ctx.save(); hoverGlow(ctx, glow); drawHand(ctx, hd, Math.atan2(hd.y - el.y, hd.x - el.x), 1); ctx.restore();
  ctx.strokeStyle = COL.shirtDk; ctx.lineWidth = 26; ctx.beginPath(); ctx.moveTo(sh.x, sh.y); ctx.lineTo(el.x, el.y); ctx.stroke();
  ctx.strokeStyle = COL.shirt; ctx.lineWidth = 23; ctx.stroke();
}
// A door at the right-hand edge, with a metal or wooden knob
function drawDoor(ctx, sim) {
  // off-white frame (left side and top), outlined so it stands off the cream wall
  ctx.fillStyle = '#fbf8f1'; ctx.strokeStyle = 'rgba(120,100,70,0.4)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(W + 1, DOOR_TOP - 8); ctx.lineTo(DOOR_X - 8, DOOR_TOP - 8); ctx.lineTo(DOOR_X - 8, GROUND_Y);
  ctx.lineTo(DOOR_X, GROUND_Y); ctx.lineTo(DOOR_X, DOOR_TOP); ctx.lineTo(W + 1, DOOR_TOP); ctx.closePath(); ctx.fill(); ctx.stroke();
  // a heritage-blue painted door
  const g = ctx.createLinearGradient(DOOR_X, 0, W, 0);
  g.addColorStop(0, '#4f6f8e'); g.addColorStop(1, '#3f5c79');
  ctx.fillStyle = g; ctx.fillRect(DOOR_X, DOOR_TOP, W - DOOR_X, GROUND_Y - DOOR_TOP);
  ctx.strokeStyle = 'rgba(15,30,50,0.45)'; ctx.lineWidth = 1.5;
  ctx.strokeRect(DOOR_X + 14, 139, W - DOOR_X, 222); ctx.strokeRect(DOOR_X + 14, 537, W - DOOR_X, 176);
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
  ctx.save(); hoverGlow(ctx, sim.hover === 'knob');
  ctx.beginPath(); ctx.arc(KNOB.x, KNOB.y, KNOB.r, 0, Math.PI * 2); ctx.fillStyle = fill(KNOB.x, KNOB.y, KNOB.r); ctx.fill();
  if (sim.hover === 'knob') { ctx.shadowBlur = 28; ctx.fill(); }   // a stronger glow: the knob is small
  ctx.restore();
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
  ctx.font = `700 12px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = '#e4ebf2';
  ctx.fillText(metal ? 'metal' : 'wood', DOOR_X + 24, KNOB.y + 30);
}
// ===== Electron routes =====
// Only electrons move through the metal and through the person; the positive charge stays put.
// Each route is a list of points in the direction the electrons travel.
const rev = p => p.slice().reverse();
function bodyCentre(sim) { const [ox, oy] = personOffset(sim); return [522 + ox, 372 + oy]; }
// the top of the chest, between the shoulders: where the paths through the two arms meet, so charge
// passing from one hand to the other goes straight across
function chest(sim) { const [ox, oy] = personOffset(sim); return [534 + ox, 318 + oy]; }
// from inside the dome, out through the hand and down the arm into the person's body
function routeDomeToBody(sim) {
  const [sh, el, wr] = armPath(sim);
  return [[DOME.x + (DOME.r - 22) * Math.cos(HAND_ANG), DOME.y + (DOME.r - 22) * Math.sin(HAND_ANG)], [HAND.x, HAND.y],
    [wr.x, wr.y], [el.x, el.y], [sh.x, sh.y], chest(sim)];
}
// from the tip of a strand of hair down to its root on the scalp
// (a few strands carry these, so electrons can be seen leaving or arriving in the hair too)
function routeHairToBody(sim, s) { return s.pts.slice().reverse(); }
const hairFlowStrands = sim => sim.hair.filter(s => s.pts).sort((a, b) => a.phi - b.phi).filter((_, i, a) => i % Math.ceil(a.length / 6) === 4);
// up from the floor through one leg (0: left, 1: right) and into the body
function routeFloorToBody(sim, leg = 0) {
  const [ox, oy] = personOffset(sim), x = (leg ? 560 : 508) + ox;
  return [[x, GROUND_Y + 8], [x, FOOT_Y - 8 + oy], [x, WAIST_Y + 20 + oy], [(leg ? 548 : 520) + ox, WAIST_Y + oy], bodyCentre(sim)];
}
// from the doorknob into the other hand, up the arm and into the body
function routeKnobToBody(sim) {
  const [sh, el, hd] = otherArmPath(sim);
  return [[KNOB.x, KNOB.y], [hd.x, hd.y], [el.x, el.y], [sh.x, sh.y], chest(sim)];
}
// up from the earth symbol, along the lead, up the rod into the earthed sphere
function routeEarthToSphere(sim) {
  const x = sim.sx, ex = EARTH_X, sx0 = x - 16, sy0 = FLOOR_Y - 6;
  // up from the bars of the earth symbol, through its terminal and along the lead
  const lead = sx0 - ex > 64 ? [[ex, FLOOR_Y - 15], [ex, EARTH_Y], [ex + 20, EARTH_Y + 8], [ex + 30, FLOOR_Y - 3], [sx0 - 30, FLOOR_Y - 3], [sx0, sy0]] : [[ex, FLOOR_Y - 15], [ex, EARTH_Y], [sx0, sy0]];
  return [...lead, [x, FLOOR_Y - 12], [x, SPH_Y + 4]];
}
// across the gap from the sphere into the dome
const routeSphereToDome = sim => [[sim.sx + SPH_R, SPH_Y], [DOME.x - DOME.r, SPH_Y], [DOME.x - DOME.r * 0.45, SPH_Y + 6]];
function burstRoute(sim, r) {
  if (r.kind === 'spark') return [...routeEarthToSphere(sim), ...routeSphereToDome(sim), ...(r.toPerson ? routeDomeToBody(sim) : [])];
  if (r.kind === 'knob') return [...routeKnobToBody(sim), ...(r.toDome ? rev(routeDomeToBody(sim)) : [])];
  return r.out ? rev(routeDomeToBody(sim)) : routeDomeToBody(sim);   // 'share'
}
function pathLen(path) {
  let L = 0; for (let i = 1; i < path.length; i++) L += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
  return L;
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
// Steady flows: − signs spaced along a route, moving faster when more current flows.
// Bursts: a rush of − signs that runs the length of its route once.
// With "show movement of positive charge" on, the same flows are drawn the other way
// round as + signs instead: the conventional-current picture.
function drawFlows(ctx, sim, o) {
  const pos = !!o.posFlow, dir = p => (pos ? rev(p) : p);
  if (o.charges) {
    const f = sim.flows, steady = [];
    if (sim.joined) {
      steady.push([f.hand, () => f.hand.I > 0 ? rev(routeDomeToBody(sim)) : routeDomeToBody(sim)]);
      // the hair is part of the person too: electrons leave it (or arrive in it) as well as the body
      // leaving: each electron sets off from its own point along the strand (not all from the tip);
      // arriving: each one stops at its own point along the strand
      hairFlowStrands(sim).forEach((s, i) => steady.push([f.hair, () => f.hair.I > 0 ? routeHairToBody(sim, s) : rev(routeHairToBody(sim, s)), i * 9, f.hair.I > 0 ? 'spawn' : 'sink']));
    }
    // charge to or from the floor goes through both legs
    if (sim.person) for (const leg of [0, 1]) steady.push([f.floor, () => f.floor.I > 0 ? routeFloorToBody(sim, leg) : rev(routeFloorToBody(sim, leg)), leg * 14]);
    if (sim.person && sim.knobContact) steady.push([f.knob, () => routeKnobToBody(sim)]);
    if (sim.sphere) steady.push([f.ind, () => {
      const p = routeEarthToSphere(sim);
      if (sim.touching()) return [...p, ...routeSphereToDome(sim)];
      return f.ind.I > 0 ? p : rev(p);
    }]);
    const frac = x => x - Math.floor(x);
    for (const [fl, route, off = 0, mode0] of steady) {
      const lev = streamLevel(sim, fl);
      if (lev <= 0) continue;
      // drawn as + signs going the other way, an electron appearing partway becomes a + sign vanishing partway
      const mode = mode0 && pos ? (mode0 === 'spawn' ? 'sink' : 'spawn') : mode0;
      const path = dir(route()), L = pathLen(path), sp = 28, ph = fl.ph + off, base = Math.floor(ph / sp);
      for (let j = 0, d = ph % sp; d < L; j++, d += sp) {
        // each electron keeps its identity as it moves along; a fraction lev of them are shown, evenly spread
        const id = j - base, t = d / L;
        let a = clamp((lev - frac(id * 0.6180339887)) * 12, 0, 1);
        if (mode === 'spawn') { const t0 = 0.85 * frac(id * 0.7548777 + 0.13); a *= clamp((t - t0) / 0.06, 0, 1); }
        else if (mode === 'sink') { const t1 = 1 - 0.85 * frac(id * 0.7548777 + 0.13); a *= clamp((t1 - t) / 0.06, 0, 1); }
        if (a <= 0) continue;
        const q = along(path, t);
        if (mode0 && hairBehindBody(sim, ...q)) continue;   // on hair hanging behind the body
        ctx.save(); ctx.globalAlpha = a; sign(ctx, ...q, pos, 3.4); ctx.restore();
      }
    }
    // Discharging to the floor (not touching the dome): a few electrons come up from the scalp into
    // the hair and each one vanishes partway along a strand, where it cancels a positive charge there.
    // (Shown the other way round as + signs leaving the hair, with positive flow on.)
    if (sim.person && !sim.joined && f.floor.I > 0) {
      const lev = Math.min(1, flowLevel(f.floor.I));
      if (lev >= FLOW_MIN) {
        const sp = 46, frac = x => x - Math.floor(x);
        hairFlowStrands(sim).forEach((s, si) => {
          const L = pathLen(s.pts), ph = f.floor.ph + si * 17, base = Math.floor(ph / sp);
          for (let j = 0, d = ph % sp; d < L; j++, d += sp) {
            const id = j - base;
            if (frac(id * 0.6180339887 + si * 0.37) >= lev * 0.8) continue;   // not too many
            const tEnd = 0.3 + 0.6 * frac(id * 0.7548777 + si * 0.31);      // where this one cancels a + charge
            const t = d / L; if (t >= tEnd) continue;
            const u = pos ? tEnd - t : t;                                    // + signs leave from that point, towards the scalp
            const a = pos ? Math.min(1, t / 0.08) : Math.min(1, (tEnd - t) / 0.08);
            const q = along(s.pts, u); if (hairBehindBody(sim, ...q)) continue;
            ctx.save(); ctx.globalAlpha = a; sign(ctx, ...q, pos, 3.2); ctx.restore();
          }
        });
      }
    }
    for (const b of sim.bursts) {
      const path = dir(burstRoute(sim, b.route));
      if (b.route.kind === 'spark') {
        // a spark: the electrons all along the route, from earth through the sphere, across the gap
        // and into the dome, surge forward together at the instant of the spark, then fade
        const f = b.t / SPARK_BURST_LIFE, shift = 0.35 * (1 - (1 - f) * (1 - f));
        const m = Math.max(b.n, Math.round(pathLen(path) / 22));
        ctx.save(); ctx.globalAlpha = 1 - f * f;
        for (let k = 0; k < m; k++) sign(ctx, ...along(path, ((k + 0.5) / m + shift) % 1), pos, 3.6);   // more keep coming up from earth
        ctx.restore();
        continue;
      }
      for (let k = 0; k < b.n; k++) {
        const t = (b.t / BURST_LIFE) * 1.5 - (k / b.n) * 0.5;
        if (t > 0 && t < 1) sign(ctx, ...along(path, t), pos, 3.6);
      }
      // touching the charged dome: electrons rush out of the hair too (or into it)
      if (b.route.kind === 'share' && sim.person) {
        const m = Math.max(2, Math.round(b.n / 4));
        for (const s of hairFlowStrands(sim)) {
          const hp = dir(b.route.out ? routeHairToBody(sim, s) : rev(routeHairToBody(sim, s)));
          for (let k = 0; k < m; k++) {
            const t = (b.t / BURST_LIFE) * 1.5 - (k / m) * 0.5;
            if (t > 0 && t < 1) { const q = along(hp, t); if (!hairBehindBody(sim, ...q)) sign(ctx, ...q, pos, 3.4); }
          }
        }
      }
    }
  }
  if (sim.handZap) zapAt(ctx, HAND.x - 2, HAND.y, (sim.handZap.seed + Math.floor(sim.handZap.t / 0.05) * 7919) % 2147483646 + 1, 1 - sim.handZap.t / 0.3);
  const sh = sim.shock; if (!sh) return;
  // the shock at the doorknob: a crackle where the electrons jump into their hand
  const life = 1 - sh.t / SHOCK_LIFE, seed = (sh.seed + Math.floor(sh.t / 0.05) * 7919) % 2147483646 + 1;
  if (sh.t < 0.3) {
    zapAt(ctx, KNOB.x - KNOB.r + 2, KNOB.y, seed + 13, life);
    if (sh.from === 'hand') zapAt(ctx, HAND.x - 2, HAND.y, seed, life);
  }
}

function drawSphere(ctx, sim, o) {
  const x = sim.sx, y = SPH_Y;
  // earth lead from the stand along the bench to the earth symbol
  // the lead lies along the table, then rises to the top of the earth symbol
  const ex = EARTH_X, sx0 = x - 16, sy0 = FLOOR_Y - 6;
  earthLead(ctx, () => {
    ctx.beginPath(); ctx.moveTo(sx0, sy0);
    if (sx0 - ex > 64) { ctx.bezierCurveTo(sx0 - 14, sy0, sx0 - 18, FLOOR_Y - 3, sx0 - 30, FLOOR_Y - 3); ctx.lineTo(ex + 34, FLOOR_Y - 3); ctx.bezierCurveTo(ex + 18, FLOOR_Y - 3, ex + 22, EARTH_Y, ex + 3, EARTH_Y); }
    else ctx.bezierCurveTo(sx0 - 12, FLOOR_Y - 2, ex + 22, EARTH_Y, ex + 3, EARTH_Y);
  });
  drawEarth(ctx, ex, EARTH_Y);
  // metal rod and heavy foot
  ctx.fillStyle = COL.metal; ctx.fillRect(x - 3, y + SPH_R - 2, 6, FLOOR_Y - 10 - (y + SPH_R - 2));
  ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(x - 2, y + SPH_R, 1.5, FLOOR_Y - 12 - (y + SPH_R));
  rr(ctx, x - 18, FLOOR_Y - 11, 36, 11, 4); ctx.fillStyle = '#4a5560'; ctx.fill(); ctx.strokeStyle = '#2b333a'; ctx.lineWidth = 1; ctx.stroke();
  // the sphere
  const g = ctx.createRadialGradient(x - SPH_R * 0.4, y - SPH_R * 0.45, 1, x, y, SPH_R);
  g.addColorStop(0, '#fbfdfe'); g.addColorStop(0.4, '#c3cbd2'); g.addColorStop(1, '#69737d');
  ctx.save(); hoverGlow(ctx, sim.hover === 'sphere');
  ctx.beginPath(); ctx.arc(x, y, SPH_R, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
  ctx.restore();
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
      // branches start from the middle of the channel, well clear of the sphere
      const k = Math.max(1, Math.round(nPts * (0.35 + rnd() * 0.5))), [bx, by] = pts[k], br = [[bx, by]];
      let cx = bx, cy = by;
      for (let j = 0; j < 3; j++) { cx -= 4 + rnd() * 6; cy += (rnd() - 0.5) * 16; br.push([cx, cy]); }
      branches.push(br);
    }
    const line = p => { ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); for (const q of p) ctx.lineTo(q[0], q[1]); };
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // nothing is drawn over the sphere: the spark leaves it from the right-hand edge
    ctx.beginPath(); ctx.rect(xb - SPH_R * 0.15, 0, W, H); ctx.clip();
    ctx.shadowColor = 'rgba(150,140,255,0.95)'; ctx.shadowBlur = 22;
    for (const [w, c] of [[13, `rgba(150,130,255,${0.35 * life})`], [5.5, `rgba(200,205,255,${0.9 * life})`], [2.6, `rgba(255,255,255,${life})`]]) {
      ctx.strokeStyle = c; ctx.lineWidth = w; line(pts); ctx.stroke();
      ctx.lineWidth = w * 0.5; for (const br of branches) { line(br); ctx.stroke(); }
    }
    ctx.restore();
  }
}

// A small label saying what clicking the hovered object will do
function drawHoverLabel(ctx, sim) {
  const h = sim.hover; if (!h || !sim.person) return;
  ctx.save();
  ctx.font = `700 13px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const pill = (txt, place) => {
    const w = ctx.measureText(txt).width + 16, hgt = 24, [left, y] = place(w);
    rr(ctx, left, y - hgt / 2, w, hgt, 7); ctx.fillStyle = 'rgba(27,38,46,0.9)'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(txt, left + 8, y + 0.5);
  };
  // each label sits in clear wall space beside its object
  if (h === 'knob' || h === 'knobhand') pill('Touch doorknob', w => [W - 6 - w, KNOB.y - 34]);                       // above the knob, by the door
  else if (h === 'stool') pill('Remove stool', w => [Math.min(STOOL.x + STOOL.w + 8, DOOR_X - 12 - w), GROUND_Y - STOOL.h / 2]);   // between the stool and the door
  else if (h === 'arm') {
    const [, el, wr] = armPath(sim);
    if (sim.touch) pill('Take hand off dome', w => [Math.max(DOME.x + DOME.r + 8, (DOME.x + DOME.r + el.x) / 2 - w / 2), Math.max(el.y, wr.y) + 36]);   // below the arm, clear of the dome
    else pill('Touch dome', w => [wr.x - 26 - w, wr.y + 8]);                                       // to the left of the hanging hand
  }
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
    if (o.charges) drawBodyElectrons(ctx, sim, o);
  }
  if (sim.sphere) {
    drawSphere(ctx, sim, o);
    if (o.gap) drawGap(ctx, sim);
    drawSparks(ctx, sim);
    if (!sim.dragged) {
      // above the sphere, clear of the gap measurement, until it's first moved
      const x = Math.max(sim.sx, 74);
      ctx.font = `700 15px ${FONT}`; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(90,104,114,0.9)'; ctx.fillText('Drag the sphere', x, SPH_Y - 112); ctx.fillText('towards the dome', x, SPH_Y - 94);
    }
  }
  drawFlows(ctx, sim, o);
  if (o.charges) {
    ctx.font = `700 13px ${FONT}`; ctx.textAlign = 'left';
    if (o.posFlow) {
      sign(ctx, 22, 24, true); haloText(ctx, '0.1 µC of positive charge, shown moving', 34, 29, COL.ink);
      sign(ctx, 22, 46, false); haloText(ctx, '0.1 µC of electrons', 34, 51, COL.ink);
    } else {
      sign(ctx, 22, 24, true); haloText(ctx, '0.1 µC of positive charge', 34, 29, COL.ink);
      sign(ctx, 22, 46, false); haloText(ctx, '0.1 µC of electrons', 34, 51, COL.ink);
    }
    if (capped) { ctx.font = `400 12px ${FONT}`; haloText(ctx, 'not all of the person’s charge is shown', 16, 72, '#56656f'); }
  }
  drawHoverLabel(ctx, sim);
  if (sim.flash > 0.01) { ctx.fillStyle = `rgba(235,235,255,${sim.flash * 0.28})`; ctx.fillRect(0, 0, W, H); }
}

// ===== React UI =====
const LOGO = `${import.meta.env.BASE_URL}favicon.svg`;

function SphereIcon() {
  // as in the scene: an earth symbol (with its brass terminal) on the left, its green-and-yellow lead
  // running to the foot of a shaded metal sphere, which sparks to the right
  const ink = 'currentColor';
  return (
    <svg className="icon" viewBox="0 0 44 50" width="58" height="66" aria-hidden="true">
      <defs>
        <radialGradient id="ic-sph" cx="0.35" cy="0.32" r="0.75">
          <stop offset="0" stopColor="#ffffff" /><stop offset="0.45" stopColor="#c9d1d7" /><stop offset="1" stopColor="#7d8892" />
        </radialGradient>
      </defs>
      <path d="M34.6 12.4 L38.6 10.4 L37.7 13.4 L42.6 11.4" fill="none" stroke="#b5a3ff" strokeWidth="3.4" strokeLinejoin="round" strokeLinecap="round" opacity="0.55" />
      <path d="M34.6 12.4 L38.6 10.4 L37.7 13.4 L42.6 11.4" fill="none" stroke="#6a4fd6" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
      <rect x="23.6" y="20" width="2.8" height="21" rx="1" fill="#8f99a3" stroke={ink} strokeWidth="0.8" />
      <circle cx="25" cy="12.5" r="9" fill="url(#ic-sph)" stroke={ink} strokeWidth="1.2" />
      <path d="M18 42.5 C13 42.5 13 37 10 37 L7.5 37" fill="none" stroke="#1f6b3c" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M18 42.5 C13 42.5 13 37 10 37 L7.5 37" fill="none" stroke="#f2cf3a" strokeWidth="1.4" strokeDasharray="2 2" />
      <rect x="17" y="40.5" width="16" height="4.5" rx="2" fill="#3a444e" stroke={ink} strokeWidth="0.8" />
      <g stroke={ink} strokeWidth="1.4" strokeLinecap="round">
        <line x1="7" y1="37" x2="7" y2="42" /><line x1="2.5" y1="42" x2="11.5" y2="42" /><line x1="4" y1="44.6" x2="10" y2="44.6" /><line x1="5.6" y1="47.2" x2="8.4" y2="47.2" />
      </g>
      <circle cx="7" cy="37" r="1.9" fill="#c9a43a" stroke="#6d5a1f" strokeWidth="0.6" />
    </svg>
  );
}
function PersonIcon() {
  // head and shoulders, hair standing on end from the top of the head (curving gently, the sides drooping)
  const hair = ['#6e4528', '#664025', '#764a2b'];
  const n = 13, strands = Array.from({ length: n }, (_, i) => {
    const a = -Math.PI + 0.25 + (i / (n - 1)) * (Math.PI - 0.5), L = i % 2 ? 9 : 11.5;
    const x0 = 22 + 7.6 * Math.cos(a), y0 = 19 + 9.2 * Math.sin(a);
    const x1 = x0 + L * Math.cos(a), y1 = y0 + L * Math.sin(a) + 2.2 * Math.abs(Math.cos(a));
    const mx = x0 + 0.55 * L * Math.cos(a), my = y0 + 0.55 * L * Math.sin(a);
    return { d: `M${x0.toFixed(2)} ${y0.toFixed(2)} Q${mx.toFixed(2)} ${my.toFixed(2)} ${x1.toFixed(2)} ${y1.toFixed(2)}`, c: hair[i % 3] };
  });
  return (
    <svg className="icon" viewBox="0 0 44 50" width="58" height="66" aria-hidden="true">
      {strands.map((s, i) => <path key={i} d={s.d} fill="none" stroke={s.c} strokeWidth="1.5" strokeLinecap="round" />)}
      <path d="M8 50 C8 40 13 35 22 35 C31 35 36 40 36 50 Z" fill={COL.shirt} stroke={COL.shirtDk} strokeWidth="0.9" />
      <rect x="19" y="27" width="6" height="9" rx="2" fill={COL.skin} stroke={COL.skinDk} strokeWidth="0.8" />
      <path d="M18 35 L22 40 L26 35 Z" fill={COL.shirtDk} />
      <path d="M19.4 35 L22 38.4 L24.6 35 Z" fill={COL.skin} />
      <ellipse cx="22" cy="21" rx="8" ry="9.6" fill={COL.skin} stroke={COL.skinDk} strokeWidth="1" />
      <path d="M14.1 19.4 C13.6 7.8 30.4 7.8 29.9 19.4 C28.6 16.8 26.4 15.6 24.2 16.4 C22.6 15.2 20.4 15.2 19 16.6 C17.2 15.8 15.2 16.8 14.1 19.4 Z" fill={hair[0]} />
      <circle cx="19" cy="21" r="1.1" fill="#1b262e" /><circle cx="25" cy="21" r="1.1" fill="#1b262e" />
      <path d="M17.6 18.4 Q19 17.4 20.4 18.2 M23.6 18.2 Q25 17.4 26.4 18.4" fill="none" stroke="#1b262e" strokeWidth="0.7" strokeLinecap="round" />
      <ellipse cx="22" cy="25.6" rx="1.4" ry="1.7" fill="#3a2c35" />
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
// What the scene shows, for screen readers (the canvas's label)
function sceneDescription(s) {
  const parts = ['Van de Graaff generator.'];
  parts.push(s.v === 0 ? 'The belt is stopped.' : `Belt speed ${s.v.toFixed(1)} metres per second.`);
  parts.push(`Dome p.d. ${fmtKV(s.V)}, charge ${fmtUC(s.Q)}.`);
  if (s.sphere) {
    parts.push(`Earthed sphere ${s.touching ? 'touching the dome' : fmtCm(s.gap) + ' from the dome'}; use the left and right arrow keys to move it.`);
    if (s.sparkAge < 1) parts.push('A spark has just jumped.');
  }
  if (s.person) {
    const Vp = s.touch ? s.V : s.Vp;
    const hair = Vp < 8e3 ? 'lying flat' : Vp < 60e3 ? 'starting to lift' : 'standing on end';
    parts.push(`A person is standing ${s.stool ? 'on an insulating stool' : 'on the earthed floor'}, with their hand ${s.touch ? 'on' : 'off'} the dome. Their p.d. is ${fmtKV(Vp)} and their hair is ${hair}.`);
    parts.push(`The doorknob is ${s.knobMetal ? 'metal' : 'wooden'}${s.knobContact ? ' and they are touching it' : ''}.`);
    parts.push('Press Tab to reach the buttons to touch the doorknob and to ' + (s.stool ? 'remove' : 'add') + ' the stool.');
  }
  return parts.join(' ');
}
// "What is happening": the explanations that apply to what is in the scene, with the one that
// describes what is going on right now highlighted
function explanations(s, sphere, person) {
  const items = [
    { id: 'belt', text: 'The belt carries electrons down, away from the dome, so the dome is left with a positive charge. As the charge builds up, its p.d. rises.' },
  ];
  if (s.v === 0) items.push({ id: 'stopped', text: 'The belt is stopped, so no more charge reaches the dome. It keeps what it has, apart from a slow leak into the air.' });
  if (sphere) {
    items.push({ id: 'gap', text: 'Drag the earthed sphere towards the dome. Air breaks down at about 30 kV per cm, so a spark jumps when the p.d. is big enough for the gap.' });
    items.push({ id: 'spark', text: 'In a spark, electrons rush up from earth, across the gap and into the dome, cancelling most of its positive charge. Then it builds up again.' });
  }
  if (person) {
    items.push({ id: 'touch', text: 'With their hand on the dome, electrons flow out of the person into the dome, so they become positive too. Every hair has the same charge, so the hairs repel each other and stand on end.' });
    if (s.stool) items.push({ id: 'kept', text: 'The stool is an insulator, so their charge can’t flow away to earth. They stay charged even with their hand off the dome, and their hair stays up. Over time, though, charge slowly leaks away into the air, so their hair gradually falls.' });
    else items.push({ id: 'floor', text: 'With no stool, electrons flow up from the earthed floor through their shoes and cancel their positive charge, so their hair falls.' });
    items.push(s.knobMetal
      ? { id: 'knob', text: 'Touching the metal doorknob earths them: electrons flow in from earth and cancel their charge almost at once, with a small shock. Click the doorknob or their hand to try it.' }
      : { id: 'knob', text: 'The wooden doorknob is an insulator, so touching it lets no charge flow and nothing happens. Click the doorknob or their hand to try it.' });
  }
  // which one is happening now, most striking first
  const levelled = s.chargeFrac < 0.3;
  let on = 'belt';
  if (sphere && s.sparkAge < 1.2) on = 'spark';
  else if (person && s.knobContact) on = 'knob';
  else if (person && !s.stool && (s.touch || s.Vp > 1e3)) on = 'floor';
  else if (person && s.touch && !levelled) on = 'touch';
  else if (person && s.stool && s.Vp > 1e3) on = 'kept';   // charged on the stool: hand off, or on but levelled off
  else if (s.v === 0) on = 'stopped';
  else if (levelled && sphere) on = 'gap';
  return items.map(it => ({ ...it, on: it.id === on }));
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
  const [posFlow, setPosFlow] = useState(false);
  const [readOpen, setReadOpen] = useState(true);
  const [happenOpen, setHappenOpen] = useState(false);
  const [drawn, setDrawn] = useState(false);   // the scene has drawn its first frame (the slider waits for it)   // "What is happening" starts minimised
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
  optsRef.current = { charges, gap, posFlow };
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
      setUi(sim.snapshot()); setDrawn(true);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const onSpeed = v => { simRef.current.v = v; setSpeed(v); refresh(); };
  const onSphere = () => { const s = simRef.current; s.sphere = !s.sphere; setSphere(s.sphere); refresh(); };
  const onPerson = () => { const s = simRef.current; s.setPerson(!s.person); setPerson(s.person); refresh(); };
  const onTouch = () => { const s = simRef.current; s.setTouch(!s.touch); refresh(); };
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
  // the doorknob (and its rosette): clicking it makes the person reach out and touch it
  const overKnob = (px, py) => simRef.current.person && Math.hypot(px - KNOB.x - 6, py - KNOB.y) < KNOB.r + 14;
  // the stool: clicking it takes it away (the switch puts it back)
  const overAddStool = (px, py) => { const s = simRef.current, b = ADD_STOOL; return s.person && !s.stool && px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h; };
  const overStool = (px, py) => { const s = simRef.current; return s.person && s.stool && px >= STOOL.x - 4 && px <= STOOL.x + STOOL.w + 4 && py >= GROUND_Y - STOOL.h - 2 && py <= GROUND_Y + 2; };
  // what the pointer is over, if it can be clicked or dragged
  const hoverAt = (px, py) => {
    const s = simRef.current;
    if (overKnob(px, py)) return s.knobT === null ? 'knob' : null;
    if (nearKnobHand(s, px, py)) return s.knobT === null ? 'knobhand' : null;
    if (overStool(px, py)) return 'stool';
    if (overAddStool(px, py)) return 'addstool';
    if (nearArm(s, px, py)) return 'arm';
    if (overSphere(px, py)) return 'sphere';
    return null;
  };
  const onDown = e => {
    const [px, py] = toCanvas(e);
    if (overKnob(px, py) || nearKnobHand(simRef.current, px, py)) { if (simRef.current.knobT === null) onKnob(); simRef.current.hover = null; e.preventDefault(); return; }
    if (overStool(px, py) || overAddStool(px, py)) { onStool(); simRef.current.hover = null; e.preventDefault(); return; }
    if (nearArm(simRef.current, px, py)) { onTouch(); e.preventDefault(); return; }
    if (!overSphere(px, py)) return;
    drag.current = { off: px - simRef.current.sx };
    simRef.current.dragged = true;
    simRef.current.hover = null;   // no glow while it's being dragged
    cvRef.current.setPointerCapture(e.pointerId); cvRef.current.style.cursor = 'grabbing';
    e.preventDefault();
  };
  const onMove = e => {
    const [px, py] = toCanvas(e);
    if (drag.current) { simRef.current.sx = clamp(px - drag.current.off, SPH_XMIN, SPH_XMAX); return; }
    const h = e.pointerType === 'touch' ? null : hoverAt(px, py);
    simRef.current.hover = h;
    cvRef.current.style.cursor = h === 'sphere' ? 'grab' : h ? 'pointer' : 'default';
  };
  const onUp = () => { drag.current = null; cvRef.current.style.cursor = 'default'; };
  const onLeave = () => { if (!drag.current) simRef.current.hover = null; };
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
  // scale under each p.d. meter: each label at the start of its 100 kV stretch
  const meterScale = [0, 100, 200, 300].map(kv => <span key={kv} style={{ flex: (Math.min(kv + 100, V_SCALE / 1e3) - kv) / 50 }}>{kv}{kv === 300 ? ' kV' : ''}</span>);
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
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={onLeave} onKeyDown={onKey}
              role="img" aria-label={sceneDescription(s)} />
            {/* Keyboard and screen-reader access to the things you click in the scene. Each button is hidden
                until it has focus (tabbing past the scene), then shows in the scene's top-right corner. */}
            {person && <div className="kbd-actions">
              <button className="btn" aria-disabled={s.knobBusy || undefined}
                onClick={onKnob}>Touch doorknob</button>
              <button className="btn" onClick={onStool}>{s.stool ? 'Remove stool' : 'Add stool'}</button>
            </div>}
            <input className={'belt-range' + (drawn ? '' : ' waiting')} type="range" min="0" max={BELT_MAX} step="0.5" value={speed} aria-label="Belt speed"
              aria-valuetext={`${speed.toFixed(1)} metres per second`} onChange={e => onSpeed(parseFloat(e.target.value))}
              style={{ '--fill': fill, left: `${(SLIDER.x / W) * 100}%`, top: `${(SLIDER.y / H) * 100}%`, width: `${(SLIDER.w / W) * 100}%` }} />
            <button className="btn ghost stagebtn" onClick={reset}>Reset</button>
          </div>
        </section>

        <section className="side">
          <div className="fig controls">
            <div className="ctl">
              <span className="ctl-label">Show</span>
              <div className="loads" role="group" aria-label="Show in the scene">
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
              </div>
            </div>


            <div className="ctl-row">
              {person && <Switch id="touch" checked={s.touch} onChange={onTouch}>Hand on dome</Switch>}
              <Switch id="charges" checked={charges} onChange={() => setCharges(c => !c)}>Show charges</Switch>
              <Switch id="gap" checked={gap} onChange={() => setGap(g => !g)}>Show gap</Switch>
              {charges && <Switch id="posflow" checked={posFlow} onChange={() => setPosFlow(v => !v)}>Show movement of positive charge</Switch>}
            </div>
          </div>

          {(() => {
            const items = explanations(s, sphere, person);
            return (
              <div className={'fig happen' + (happenOpen ? '' : ' min')}>
                <div className="fighead" onClick={happenOpen ? undefined : () => setHappenOpen(true)}>
                  <h2>What is happening</h2>
                  <button className="minbtn" aria-expanded={happenOpen} aria-label={(happenOpen ? 'Minimise' : 'Show') + ' explanations'}
                    title={happenOpen ? 'Minimise' : 'Show'} onClick={e => { e.stopPropagation(); setHappenOpen(o => !o); }}>
                    <svg viewBox="0 0 12 12" aria-hidden="true">
                      <path d={happenOpen ? 'M2 6 H10' : 'M6 2 V10 M2 6 H10'} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                    {!happenOpen && <span>Show</span>}
                  </button>
                </div>
                {happenOpen && <ul>{items.map(it => <li key={it.id} className={it.on ? 'on' : ''} aria-current={it.on ? 'true' : undefined}>{it.text}</li>)}</ul>}
              </div>
            );
          })()}

          <div className={'fig readtbl' + (readOpen ? '' : ' min')}>
            <div className="fighead" onClick={readOpen ? undefined : () => setReadOpen(true)}>
              <h2>Readings</h2>
              <button className="minbtn" aria-expanded={readOpen} aria-label={(readOpen ? 'Minimise' : 'Show') + ' readings'}
                title={readOpen ? 'Minimise' : 'Show'} onClick={e => { e.stopPropagation(); setReadOpen(o => !o); }}>
                <svg viewBox="0 0 12 12" aria-hidden="true">
                  <path d={readOpen ? 'M2 6 H10' : 'M6 2 V10 M2 6 H10'} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                {!readOpen && <span>Show</span>}
              </button>
            </div>
            {readOpen && <div className="readbody">
              <table className="read">
                <tbody>
                  <tr className="big"><th scope="row">P.d. of dome</th><td className="pos">{fmtKV(s.V)}</td></tr>
                </tbody>
              </table>
              <div className="meter" aria-hidden="true"><span style={{ width: `${clamp(s.V / V_SCALE, 0, 1) * 100}%` }} /></div>
              <div className="meter-scale" aria-hidden="true">{meterScale}</div>
              {s.person && <>
                <table className="read">
                  <tbody>
                    <tr className="big"><th scope="row">P.d. of person</th><td className="pos person">{fmtKV(s.touch ? s.V : s.Vp)}</td></tr>
                  </tbody>
                </table>
                <div className="meter person" aria-hidden="true"><span style={{ width: `${clamp((s.touch ? s.V : s.Vp) / V_SCALE, 0, 1) * 100}%` }} /></div>
                <div className="meter-scale" aria-hidden="true">{meterScale}</div>
              </>}
              <table className="read">
                <tbody>
                  <tr><th scope="row">Belt carries</th><td>{speed === 0 ? 'stopped' : <>{(BELT_K * speed * 1e6).toFixed(1)} <small>µC each second</small></>}</td></tr>
                  <tr><th scope="row">Charge on dome</th><td>{fmtUC(s.Q)}</td></tr>
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
        </div>
        <div className="bottom-note">
          <p className="more-sims-note">Click the icon on the left to explore other physics simulations like this one, or the button on the right to support the project.</p>
          <p className="more-sims-note">Questions or ideas? Email <a href="mailto:hello@alexmoorephysics.com">hello@alexmoorephysics.com</a></p>
        </div>
        <div className="coffee-row"><BuyMeCoffeeButton /></div>
      </div>
    </div>
  );
}

export default App;
