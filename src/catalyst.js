import * as THREE from 'three';

const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _d = new THREE.Vector3();

// The four things the rift can rewrite you into. The weights are the roll table;
// the tier decides which flourish your knuckles come with, not whether you can
// fight — every one of them is survivable, only the odds of getting one differ.
export const RARITIES = [
  {
    key: 'kinetic', tier: 'COMMON', chance: 0.65, hex: '#a8a29a', rgb: [0.68, 0.66, 0.63],
    name: 'KINETIC SHOCKWAVE',
    line: 'Every strike throws a concussion ring. Shields let go of themselves.',
  },
  {
    key: 'quantum', tier: 'RARE', chance: 0.25, hex: '#35e6ff', rgb: [0.21, 0.9, 1],
    name: 'QUANTUM SHIFT',
    line: 'Half a metre of space, borrowed. You come up behind whoever stopped looking.',
  },
  {
    key: 'gravity', tier: 'EPIC', chance: 0.09, hex: '#8b5cf6', rgb: [0.55, 0.36, 0.96],
    name: 'GRAVITATIONAL ANCHOR',
    line: 'What you hit stops belonging to the floor. Keep hitting it on the way up.',
  },
  {
    key: 'matter', tier: 'MYTHIC', chance: 0.01, hex: '#ffb62e', rgb: [1, 0.71, 0.18],
    name: 'MATTER DISINTEGRATION',
    line: 'Plasma on the knuckles. One clean strike and the armour is not debris, it is weather.',
  },
];

const TEST_POWERS = {
  1: { key: 'inferno', tier: 'EPIC', hex: '#ff342e', rgb: [1, 0.08, 0.04], name: 'BLOODFIRE NOVA', line: 'Crimson fireburst.' },
  2: { key: 'stasis', tier: 'RARE', hex: '#a855f7', rgb: [0.66, 0.33, 0.97], name: 'RIFT STASIS', line: 'Lock nearby threats in a rift.' },
  3: { key: 'bloodwell', tier: 'RARE', hex: '#ff4f6d', rgb: [1, 0.18, 0.32], name: 'BLOODWELL SURGE', line: 'Restore resolve and release a crimson shockwave.' },
  4: { key: 'kinetic', tier: 'COMMON', hex: '#a8a29a', rgb: [0.68, 0.66, 0.63], name: 'KINETIC SHOCKWAVE', line: 'A powerful concussion blast.' },
  5: { key: 'matter', tier: 'MYTHIC', hex: '#ffb62e', rgb: [1, 0.71, 0.18], name: 'MATTER DISINTEGRATION', line: 'Plasma fists.' },
};

const MINOR = ['kinetic', 'quantum'];

/** floored = the finale roll: the table is real, but the first pull is not allowed
 *  to land on a tier you cannot win a room with */
export function rollRarity({ floored = false, rand = Math.random } = {}) {
  for (;;) {
    const r = rand();
    let acc = 0;
    for (const d of RARITIES) {
      acc += d.chance;
      if (r >= acc) continue;
      if (floored && MINOR.includes(d.key)) break;   // reroll, quietly
      return d;
    }
  }
}

/** what the director hands back when a strike needs the guard's own collapse code */
const CATALYST_STRIKE = { kind: 'right', power: 2.4, heavy: true, uppercut: false, catalyst: true };

export class Catalyst {
  constructor(game) {
    this.g = game;
    this.def = null;
    this.unlocked = false;
    this.charge = 0;          // 0..1; one full meter buys exactly one movement
    this.combo = 0;           // the base strike builds momentum, momentum builds power
    this.comboT = 0;
    this.plasma = 0;          // seconds of matter-disintegration uptime left
    this.shoves = [];         // {g, vx, vz, t} — displacement the guard did not ask for
    this.locks = [];          // {g, t, dur, lift} — zero gravity, temporarily
    this._alt = 'left';
    this._wasReady = false;
  }

  // Number keys select a test power; Z is the only activation key.
  selectTestPower(slot) {
    const def = TEST_POWERS[slot];
    if (!def) return false;
    this.selectedTestPower = slot;
    this.g.hud.anomalyLabel(def);
    return true;
  }

  activateSelectedTestPower() {
    if (!this.selectedTestPower) return false;
    return this.activateTestPower(this.selectedTestPower);
  }

  // Temporary test powers: never persist test selections into a normal run.
  activateTestPower(slot) {
    const def = TEST_POWERS[slot];
    if (!def) return false;
    if (!this.testMode) this.preTestSnapshot = this.def ? { key: this.def.key, charge: this.charge } : null;
    this.testMode = true;
    this.def = def;
    this.unlocked = true;
    this.charge = 1;
    this._wasReady = true;
    this.g.hud.anomalyLabel(def);
    this.g.hud.anomaly(1, true);
    if (slot === 1) {
      this.g.player.headWorld(_p).setY(1.1);
      this.g.addTrauma(1.7);
      this.g.flashV = 0.9;
      this.g.env.burst(_p, 52, def.rgb, 2.3, 8.5, 0.55, 0.055);
      this.g.audio.shockwave(1);
      this._concuss(_p, 5.0, { force: 3.2, shatter: true, damage: 0.9 });
    } else if (slot === 2) {
      const p = this.g.player.root.position;
      for (const enemy of this.g.fighters) {
        if (enemy.ko || enemy.officer || enemy.mode === 'offscreen' || !enemy.root.visible) continue;
        if (enemy.distanceTo(p) <= 7) this._anchor(enemy, 2.2, 0.8);
      }
      this.g.env.burst(this.g.player.headWorld(_p).setY(1.1), 30, def.rgb, 1.2, 4.5, 0.8, 0.045);
    } else if (slot === 3) {
      this.g.player.resolve = Math.min(3, (this.g.player.resolve || 0) + 1);
      this.g.player.headWorld(_p).setY(1.1);
      this.g.env.burst(_p, 38, def.rgb, 1.5, 5.5, 0.75, 0.05);
      this._concuss(_p, 3.8, { force: 2.0, damage: 0.35 });
    } else if (slot === 4) {
      this.g.player.headWorld(_p).setY(1.1);
      this.g.addTrauma(1.8);
      this.g.flashV = 0.85;
      this.g.env.burst(_p, 56, def.rgb, 2.4, 8.8, 0.5, 0.055);
      this.g.audio.shockwave(1);
      this._concuss(_p, 5.2, { force: 3.5, shatter: true, damage: 1.0 });
    } else if (slot === 5) {
      this._plasma();
    }
    return true;
  }

  // ---------- persistence ----------
  snapshot() {
    if (this.testMode) return this.preTestSnapshot;
    return this.def ? { key: this.def.key, charge: this.charge } : null;
  }

  /** a rolled ability is once per life: a refresh must not hand you a re-roll */
  apply(state) {
    if (!state) return;
    const def = RARITIES.find((d) => d.key === state.key);
    if (!def) return;
    this.def = def;
    this.unlocked = true;
    this.charge = THREE.MathUtils.clamp(state.charge ?? 1, 0, 1);
    this._wasReady = this.charge >= 1;
    this.g.hud.anomalyLabel(def);
  }

  unlock(def) {
    this.def = def;
    this.unlocked = true;
    this.charge = 1;   // the surge that rewrote you also leaves the meter full
    this._wasReady = true;
    this.g.hud.anomalyLabel(def);
    this.g.hud.anomaly(this.charge, true);
    this.g.audio.catalystTake(def.tier);
    // a rolled ability is the one thing a refresh is never allowed to take back
    this.g.onProgress?.();
  }

  reset() {
    this.testMode = false; this.preTestSnapshot = null;
    this.unlocked = false;
    this.def = null;
    this.charge = 0; this.combo = 0; this.comboT = 0; this.plasma = 0;
    this.shoves.length = 0; this.locks.length = 0;
    this._wasReady = false;
    this.g.hud.anomalyLabel(null);
    for (const s of ['L', 'R']) this.g.player.arms[s].fist.material.emissive.setRGB(0, 0, 0);
    this.g.onProgress?.();
  }

  // ---------- queries ----------
  get audio() { return this.g.audio; }
  get ready() { return this.unlocked && this.charge >= 1; }
  get pierces() { return this.unlocked && this.plasma > 0; }

  /** a full meter of plasma fists ends anything wearing armour in one strike */
  powerFor() {
    if (!this.unlocked) return 1;
    if (this.plasma > 0) return 9;
    if (this.def.key === 'gravity') return 1.15;
    return 1;
  }

  /** three unbroken strikes will walk a riot shield off its owner */
  breaksGuard() { return this.unlocked && this.combo >= 3; }

  /** <b>1</b>: alternate hands so one key still reads as a combination */
  nextStrike() {
    this._alt = this._alt === 'left' ? 'right' : 'left';
    return this._alt;
  }

  nearest(maxDist = 6.5) {
    const p = this.g.player.root.position;
    let best = null, bd = maxDist;
    for (const g of this.g.fighters) {
      if (g.ko || g.officer || g.mode === 'offscreen' || !g.root.visible) continue;
      const d = Math.hypot(g.root.position.x - p.x, g.root.position.z - p.z);
      if (d < bd) { bd = d; best = g; }
    }
    return best;
  }

  /** hazards ask rather than check: the mythic fist deletes them, everything else
   *  has to dodge them */
  disintegrates() { return this.pierces; }

  // ---------- the fist, after it lands ----------
  onLand(guard, point) {
    if (!this.unlocked) return;
    this.combo++;
    this.comboT = 1.5;
    this.g.player.momentum = Math.min(6, this.combo);
    this.charge = Math.min(1, this.charge + 0.15 + Math.min(this.combo, 5) * 0.012);
    if (guard && !guard.ko && point) this._passive(guard, point);
  }

  /** being hit is the other way the meter fills: you spend it on the way back up */
  onTaken() {
    if (!this.unlocked) return;
    this.combo = 0; this.comboT = 0; this.g.player.momentum = 0;
    this.charge = Math.min(1, this.charge + 0.08);
  }

  /** a combination has a rhythm, and a swing at empty air is a rest */
  onWhiff() {
    if (!this.unlocked) return;
    this.combo = 0; this.comboT = 0; this.g.player.momentum = 0;
  }

  /** a shield eats the damage but not the beat count: three of your best
   *  combinations walk it off whoever is holding it */
  onBlock() {
    if (!this.unlocked) return;
    this.combo++;
    this.comboT = 1.5;
    this.g.player.momentum = Math.min(6, this.combo);
    this.charge = Math.min(1, this.charge + 0.05);
  }

  _passive(guard, point) {
    const { audio } = this;
    switch (this.def.key) {
      case 'kinetic':
        audio.shockwave(0.3);
        this._concuss(point, 2.6, { force: 1.6, shatter: true, damage: 0.4, skip: guard });
        break;
      case 'quantum':
        // two strikes deep you are already somewhere else — one step, off the line
        if (this.combo >= 2 && !this.g.player.falling) {
          guard.point('chest', _p);
          this._blink(this._perp(_p), 0.9);
        }
        break;
      case 'gravity':
        this._anchor(guard, 0.62, 0.5);
        break;
      case 'matter':
        this._scorch(point);
        break;
    }
  }

  /** unit left/right of the player→point line, biased by which way you are leaning */
  _perp(point) {
    const p = this.g.player.root.position;
    _d.set(point.x - p.x, 0, point.z - p.z);
    if (_d.lengthSq() < 1e-5) _d.set(0, 0, -1);
    _d.normalize();
    const s = this.g.player.dodgeSide || 1;
    return { x: -_d.z * s, z: _d.x * s };
  }

  _shove(g, vx, vz) {
    this.shoves.push({ g, vx, vz, t: 0.3 });
  }

  _concuss(center, radius, { force = 2, shatter = false, damage = 0, skip = null } = {}) {
    for (const g of this.g.fighters) {
      if (g === skip || g.ko || g.officer || g.mode === 'offscreen' || !g.root.visible) continue;
      g.point('chest', _q);
      const dist = _q.distanceTo(center);
      if (dist > radius) continue;
      _d.set(g.root.position.x - center.x, 0, g.root.position.z - center.z);
      if (_d.lengthSq() < 1e-5) _d.set(Math.random() - 0.5, 0, -1);
      _d.normalize();
      const k = force * (1 - (dist / radius) * 0.45);
      this._shove(g, _d.x * k, _d.z * k);
      if (shatter && g.shield) this.breakShield(g);
      if (!g.scout) g.setMode('stagger');
      if (damage) this._strike(g, damage);
    }
  }

  /** shatter it rather than knock it down: a dropped shield picks itself back up */
  breakShield(g) {
    if (!g.shield) return;
    g.point('shield', _q);
    this.g.env.burst(_q, 24, [0.56, 0.53, 0.47], 1.4, 4.6, 0.85, 0.05);
    g.shield.parent?.remove(g.shield);
    g.shield = null;
    g.shieldUp = false;
    this.g.audio.clang();
    this.g.addTrauma(0.5);
  }

  /** route the damage through the director so the guard collapses the authored way */
  _strike(g, amount, part = 'chest') {
    const res = g.damage(amount);
    this.g.director.onHit(g, CATALYST_STRIKE, part, res);
    return res;
  }

  _blink(dir, dist, maxTravel = 3.4) {
    const p = this.g.player.root.position;
    _q.copy(p);
    p.x += dir.x * dist;
    p.z += dir.z * dist;
    this.g.env.clamp?.(p);
    // a blink that would land you in the shaft costs you the blink, not the run
    if (p.distanceTo(_q) > maxTravel) p.copy(_q);
    this.g.env.burst(_q, 22, this.def.rgb, 0.5, 2.4, 1.2, 0.04);
    this.g.audio.shiftBlink();
    this.g.addTrauma(0.45);
    this.g.flashV = Math.max(this.g.flashV, 0.42);
  }

  _anchor(g, dur, lift) {
    if (g.ko || this.locks.some((l) => l.g === g)) return;
    this.locks.push({ g, t: 0, dur, lift, base: g.groundY ?? 0 });
  }

  _scorch(point) {
    this.g.env.burst(point, 10, this.def.rgb, 0.7, 2.6, 0.9, 0.035);
  }

  // ---------- <b>2</b>: the whole meter, spent on one movement ----------
  fire() {
    if (!this.ready) {
      if (this.unlocked) this.g.audio.deny();
      return false;
    }
    const target = this.nearest(7);
    switch (this.def.key) {
      case 'kinetic': this._blast(); break;
      case 'matter': this._plasma(); break;
      // the two aimed movements are a waste of a meter with nobody in front of you
      case 'quantum': if (!target) { this.g.audio.deny(); return false; } this._shiftBehind(target); break;
      case 'gravity': if (!target) { this.g.audio.deny(); return false; } this._zeroG(target); break;
    }
    this.charge = 0;
    this.combo = 0;
    this.comboT = 0;
    this.g.player.momentum = 0;
    this._wasReady = false;
    return true;
  }

  _blast() {
    const { audio, g } = this;
    g.player.headWorld(_p).setY(1.1);
    g.addHitstop(0.18); g.addTrauma(2.2); g.flashV = 0.95;
    g.env.burst(_p, 64, this.def.rgb, 2.6, 9.5, 0.5, 0.055);
    audio.shockwave(1);
    g.input.rumble(1, 280);
    this._concuss(_p, 5.4, { force: 3.6, shatter: true, damage: 1.15 });
  }

  _plasma() {
    const { audio, g } = this;
    this.plasma = 6.5;
    g.addHitstop(0.1); g.addTrauma(1.3); g.flashV = 0.8;
    g.player.headWorld(_p).setY(1.15);
    g.env.burst(_p, 40, this.def.rgb, 1.2, 4.2, 1, 0.05);
    audio.disintegrate();
    for (const e of g.fighters) {
      if (!e.shield || e.ko || e.mode === 'offscreen' || !e.root.visible) continue;
      if (e.distanceTo(g.player.root.position) < 7) this.breakShield(e);
    }
  }

  /** the brief's blind spot: past their shoulder, into the back they cannot raise */
  _shiftBehind(target) {
    const { audio, g } = this;
    const p = g.player.root.position;
    const f = this._facing(target);
    _d.set(target.root.position.x - f.x * 1.15, 0, target.root.position.z - f.z * 1.15);
    this._blink({ x: _d.x - p.x, z: _d.z - p.z }, 1);
    // _blink may refuse the distance or clamp it against the edge of the floor;
    // the eyes have to end up on the back of the head wherever it let you stop
    target.point('chest', _p);
    g.player.yaw = Math.atan2(p.x - _p.x, p.z - _p.z);
    if (!target.ko) target.setMode('stagger');
    g.addHitstop(0.2); g.addTrauma(1.6); g.flashV = 0.85;
    audio.crack();
    this._strike(target, 2.7, 'chest');
    this._scorch(_p);
  }

  _zeroG(target) {
    const { audio, g } = this;
    this._anchor(target, 3, 1.2);
    target.setMode('stagger');
    target.point('chest', _p);
    g.env.burst(_p, 30, this.def.rgb, 1.1, 1.6, 2.2, 0.04);
    g.addHitstop(0.14); g.addTrauma(1.1); g.flashV = 0.7;
    audio.zeroLock();
    g.input.rumble(0.8, 420);
  }

  /** a Group's own forward is local -Z; yaw is the only rotation they ever use */
  _facing(g) {
    const y = g.root.rotation.y;
    return { x: -Math.sin(y), z: -Math.cos(y) };
  }

  // ---------- frame ----------
  update(dt) {
    if (!this.unlocked) return;
    const g = this.g;

    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) { this.combo = 0; g.player.momentum = 0; }
    }
    if (this.plasma > 0) this.plasma = Math.max(0, this.plasma - dt);

    for (let i = this.shoves.length - 1; i >= 0; i--) {
      const s = this.shoves[i];
      s.t -= dt;
      s.g.root.position.x += s.vx * dt;
      s.g.root.position.z += s.vz * dt;
      const damp = Math.max(0, 1 - dt * 5.5);
      s.vx *= damp; s.vz *= damp;
      if (s.t <= 0 || s.g.ko) this.shoves.splice(i, 1);
    }

    for (let i = this.locks.length - 1; i >= 0; i--) {
      const l = this.locks[i];
      l.t += dt;
      if (l.g.ko) { this.locks.splice(i, 1); continue; }
      const k = THREE.MathUtils.smoothstep(l.t, 0, 0.3)
        * (1 - THREE.MathUtils.smoothstep(l.t, l.dur - 0.4, l.dur));
      l.g.root.position.y = l.base + l.lift * k;
      l.g.root.rotation.z = Math.sin(l.t * 2.2) * 0.09 * k;
      // they will try to stand up on their own at the end of the stagger; that is
      // the one thing the anchor is not allowed to permit
      if (l.t < l.dur && l.g.mode !== 'stagger') l.g.setMode('stagger');
      if (l.t >= l.dur) {
        l.g.root.position.y = l.base;
        l.g.root.rotation.z = 0;
        g.env.burst(l.g.root.position.clone().setY(0.4), 10, [0.5, 0.45, 0.4], 1.2, 2.4, 0.2, 0.05);
        this.locks.splice(i, 1);
      }
    }

    this._glow(dt);
    const ready = this.ready;
    // one ping for one full meter, whichever way it filled
    if (ready && !this._wasReady) this.g.audio.chargeReady();
    this._wasReady = ready;
    g.hud.anomaly(this.charge, ready);
  }

  _glow(dt) {
    const on = this.plasma > 0
      ? 1.6 + Math.sin(this.g.time * 22) * 0.5
      : (this.ready ? 0.55 : 0.06 + this.charge * 0.3);
    // set the authored hex, not the raw components: as a linear working-space
    // triple the rarity colour washes out to grey the moment it hits the fist
    for (const s of ['L', 'R']) {
      const m = this.g.player.arms[s].fist.material;
      m.emissive.set(this.def.hex);
      m.emissiveIntensity = THREE.MathUtils.damp(m.emissiveIntensity, on, 8, dt);
    }
  }
}
