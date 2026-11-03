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
  3: { key: 'pink-aegis', tier: 'RARE', hex: '#ff65d5', rgb: [1, 0.32, 0.82], name: 'PINK AEGIS', line: 'Surround yourself with a protective pink force field.' },
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
    this.powerVfx = [];
    this.enemyZaps = [];
    this.floorDebris = [];
    this.forceFields = [];
    this.forceWalls = [];
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
    this._spawnPowerAnimation(slot, def);
    if (slot === 1) {
      this.g.player.headWorld(_p).setY(1.1);
      const target = this.nearest(12);
      this.g.addTrauma(1.7);
      this.g.flashV = 0.9;
      this.g.env.burst(_p, 52, def.rgb, 2.3, 8.5, 0.55, 0.055);
      this.g.audio.shockwave(1);
      // The nova still has an outward shockwave, but its main attack is a
      // visible crimson bolt that launches from the player and strikes a target.
      this._concuss(_p, 5.0, { force: 3.2, shatter: true, damage: 0.35, skip: target });
      if (target && !target.ko) {
        target.point('chest', _q);
        this._spawnBloodfireZap(_p, _q);
        _d.set(target.root.position.x - this.g.player.root.position.x, 0,
          target.root.position.z - this.g.player.root.position.z);
        if (_d.lengthSq() < 1e-5) _d.set(0, 0, -1);
        _d.normalize();
        this._shove(target, _d.x * 4.2, _d.z * 4.2);
        target.setMode('stagger');
        this._strike(target, 1.25, 'chest');
        this.g.env.burst(_q, 30, def.rgb, 1.4, 5.8, 0.45, 0.045);
      }
    } else if (slot === 2) {
      const p = this.g.player.root.position;
      for (const enemy of this.g.fighters) {
        if (enemy.ko || enemy.officer || enemy.mode === 'offscreen' || !enemy.root.visible) continue;
        if (enemy.distanceTo(p) <= 7) this._anchor(enemy, 2.2, 0.8);
      }
      this.g.env.burst(this.g.player.headWorld(_p).setY(1.1), 30, def.rgb, 1.2, 4.5, 0.8, 0.045);
    } else if (slot === 3) {
      this._spawnForceWall();
    } else if (slot === 4) {
      this.g.player.headWorld(_p).setY(1.1);
      this.g.addTrauma(1.8);
      this.g.flashV = 0.85;
      this.g.env.burst(_p, 56, def.rgb, 2.4, 8.8, 0.5, 0.055);
      this.g.audio.shockwave(1);
      this._concuss(_p, 5.2, { force: 3.5, shatter: true, damage: 1.0 });
    } else if (slot === 5) {
      this._spawnFloorBreak();
      this._plasma();
      this._concuss(_p, 5.2, { force: 3.4, shatter: true, damage: 1.15 });
    }
    return true;
  }

  // First-person power flourishes. Keeping these just in front of the camera
  // makes every activation readable even when the player cannot see their body.
  _spawnPowerAnimation(slot, def) {
    const camera = this.g.camera;
    const group = new THREE.Group();
    group.position.set(0, -0.02, -1.65);
    camera.add(group);

    const makeRing = (radius, tube, z = 0, opacity = 0.9) => {
      const material = new THREE.MeshBasicMaterial({
        color: def.hex, transparent: true, opacity,
        blending: THREE.AdditiveBlending, depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 10, 64), material);
      mesh.position.z = z;
      mesh.renderOrder = 20;
      group.add(mesh);
      return mesh;
    };
    const rings = [];
    const coreMat = new THREE.MeshBasicMaterial({
      color: def.hex, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 2), coreMat);
    core.renderOrder = 21;
    group.add(core);

    if (slot === 1) { // Bloodfire Nova: hot core, ignition ring, outward blast
      rings.push(makeRing(0.2, 0.045, 0.02), makeRing(0.42, 0.025, -0.03, 0.7));
      core.scale.set(1, 1.35, 0.7);
    } else if (slot === 2) { // Rift Stasis: rotating interlocked containment hoops
      for (let i = 0; i < 3; i++) {
        const ring = makeRing(0.32 + i * 0.07, 0.018, (i - 1) * 0.025, 0.8);
        ring.rotation.z = i * Math.PI / 3;
        ring.rotation.x = (i - 1) * 0.55;
        rings.push(ring);
      }
      core.scale.setScalar(0.55);
    } else if (slot === 3) { // Pink Aegis: a protective pink energy pulse
      rings.push(makeRing(0.2, 0.035), makeRing(0.34, 0.02, -0.02, 0.65));
      core.scale.set(0.85, 1.5, 0.65);
    } else if (slot === 4) { // Kinetic Shockwave: three rapid concentric impact waves
      rings.push(makeRing(0.12, 0.04), makeRing(0.25, 0.03), makeRing(0.39, 0.018));
      core.scale.setScalar(0.45);
    } else { // Matter Disintegration: plasma core inside two orbiting rings
      rings.push(makeRing(0.24, 0.035), makeRing(0.34, 0.018, 0, 0.65));
      rings[1].rotation.set(0.75, 0.4, 0.55);
      core.scale.setScalar(1.25);
    }

    const coreBaseScale = core.scale.clone();
    this.powerVfx.push({
      group, rings, core, coreBaseScale, t: 0,
      dur: slot === 5 ? 1.25 : slot === 2 ? 1.05 : 0.9,
      slot,
    });
    while (this.powerVfx.length > 6) {
      const old = this.powerVfx.shift();
      old.group.parent?.remove(old.group);
      old.group.traverse((o) => {
        o.geometry?.dispose();
        if (o.material) o.material.dispose();
      });
    }
  }

  _spawnBloodfireZap(from, to) {
    const scene = this.g.scene;
    const group = new THREE.Group();
    const start = from.clone().add(new THREE.Vector3(0, 0.08, 0));
    const end = to.clone().add(new THREE.Vector3(0, 0.08, 0));
    const delta = end.clone().sub(start);
    const distance = delta.length();
    const direction = delta.clone().normalize();
    const side = new THREE.Vector3(-direction.z, 0, direction.x);
    // A smooth, liquid-like crimson lance: deliberately a flowing line,
    // not a jagged lightning bolt or a copy of another character's effect.
    const control = start.clone().lerp(end, 0.5)
      .addScaledVector(side, 0.08)
      .add(new THREE.Vector3(0, 0.12, 0));
    const curve = new THREE.QuadraticBezierCurve3(start, control, end);
    const outer = new THREE.Mesh(
      new THREE.TubeGeometry(curve, Math.max(12, Math.ceil(distance * 8)), 0.075, 8, false),
      new THREE.MeshBasicMaterial({
        color: 0xff3038,
        transparent: true,
        opacity: 0.34,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const core = new THREE.Mesh(
      new THREE.TubeGeometry(curve, Math.max(12, Math.ceil(distance * 8)), 0.032, 7, false),
      new THREE.MeshBasicMaterial({
        color: 0xb80020,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    outer.renderOrder = 29;
    core.renderOrder = 30;
    group.add(outer, core);

    // A small bright tip makes the stream read as travelling into its target.
    const tip = new THREE.Mesh(
      new THREE.SphereGeometry(0.065, 10, 8),
      new THREE.MeshBasicMaterial({
        color: 0xff6a55,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    tip.position.copy(end);
    tip.renderOrder = 31;
    group.add(tip);

    scene.add(group);
    this.enemyZaps.push({ group, t: 0, dur: 0.3 });
  }

  _updateBloodfireZaps(dt) {
    for (let i = this.enemyZaps.length - 1; i >= 0; i--) {
      const zap = this.enemyZaps[i];
      zap.t += dt;
      const fade = Math.max(0, 1 - zap.t / zap.dur);
      zap.group.children.forEach((part, index) => {
        part.material.opacity = fade * (index === 0 ? 0.34 : index === 1 ? 1 : 0.95);
      });
      const pulse = 0.92 + Math.sin(zap.t * 48) * 0.08;
      zap.group.children[0].scale.setScalar(pulse);
      zap.group.children[1].scale.setScalar(0.96 + pulse * 0.04);
      if (zap.t >= zap.dur) {
        this.g.scene.remove(zap.group);
        zap.group.traverse((obj) => {
          obj.geometry?.dispose();
          if (obj.material) obj.material.dispose();
        });
        this.enemyZaps.splice(i, 1);
      }
    }
  }

  _spawnForceField() {
    const root = this.g.player.root;
    const field = new THREE.Group();
    field.position.set(0, 0.95, 0);

    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(0.92, 32, 24),
      new THREE.MeshBasicMaterial({
        color: 0xff65d5,
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    shell.scale.set(1, 1.22, 1);
    shell.renderOrder = 18;
    field.add(shell);

    const outline = new THREE.Mesh(
      new THREE.SphereGeometry(0.925, 20, 14),
      new THREE.MeshBasicMaterial({
        color: 0xffa3e8,
        wireframe: true,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    outline.scale.copy(shell.scale);
    outline.renderOrder = 19;
    field.add(outline);

    const rings = [];
    for (let i = 0; i < 2; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.9 + i * 0.035, 0.018, 8, 64),
        new THREE.MeshBasicMaterial({
          color: i === 0 ? 0xff65d5 : 0xffb5ec,
          transparent: true,
          opacity: 0.8,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      ring.rotation.set(i * 0.9, 0, i * 0.55);
      ring.scale.set(1, 1.22, 1);
      ring.renderOrder = 20;
      field.add(ring);
      rings.push(ring);
    }

    root.add(field);
    this.forceFields.push({ root, field, shell, outline, rings, t: 0, dur: 4.5 });
    this.g.player.headWorld(_p).setY(1.1);
    this.g.env.burst(_p, 28, [1, 0.32, 0.82], 1.1, 3.8, 0.85, 0.04);
    this.g.addTrauma(0.25);
  }

  _spawnForceWall() {
    const player = this.g.player;
    const forward = player.forwardWorld(new THREE.Vector3());
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    const center = player.root.position.clone().addScaledVector(forward, 2.15);
    center.y = 1.25;
    const group = new THREE.Group();
    group.position.copy(center);
    group.rotation.y = Math.atan2(-forward.x, -forward.z);

    const wallMat = new THREE.MeshBasicMaterial({
      color: 0xff65d5, transparent: true, opacity: 0,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(5.8, 2.5), wallMat);
    panel.renderOrder = 22;
    group.add(panel);
    const edgeMat = new THREE.MeshBasicMaterial({
      color: 0xffb5ec, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(5.85, 2.55, 0.08)), edgeMat);
    frame.renderOrder = 23;
    group.add(frame);
    const bars = [];
    for (let i = 0; i < 5; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.025, 2.3, 0.035), edgeMat.clone());
      bar.position.x = -2.3 + i * 1.15;
      group.add(bar);
      bars.push(bar);
    }
    this.g.scene.add(group);
    this.forceWalls.push({ group, center, forward, right, panel, frame, bars, t: 0, dur: 4.2, hitFlash: 0 });
    this.g.env.burst(center.clone(), 34, [1, 0.32, 0.82], 1.3, 4.2, 0.75, 0.04);
    this.g.addTrauma(0.2);
  }

  _updateForceWalls(dt) {
    for (let i = this.forceWalls.length - 1; i >= 0; i--) {
      const wall = this.forceWalls[i];
      wall.t += dt;
      const fadeIn = Math.min(1, wall.t / 0.28);
      const fadeOut = Math.min(1, Math.max(0, (wall.dur - wall.t) / 0.55));
      const alpha = fadeIn * fadeOut;
      const flash = wall.hitFlash || 0;
      wall.panel.material.opacity = (0.16 + flash * 0.22) * alpha;
      wall.frame.material.opacity = (0.9 + flash * 0.1) * alpha;
      for (const bar of wall.bars) bar.material.opacity = (0.42 + flash * 0.5) * alpha;
      wall.hitFlash = Math.max(0, flash - dt * 3.2);

      // Enemies that reach the panel are stopped at its face and stagger.
      for (const enemy of this.g.fighters) {
        if (enemy.ko || enemy.mode === 'offscreen' || !enemy.root.visible) continue;
        const dx = enemy.root.position.x - wall.center.x;
        const dz = enemy.root.position.z - wall.center.z;
        const depth = dx * wall.forward.x + dz * wall.forward.z;
        const lateral = dx * wall.right.x + dz * wall.right.z;
        if (Math.abs(lateral) > 2.95 || Math.abs(depth) > 0.72) continue;
        enemy.root.position.x += wall.forward.x * (depth >= 0 ? 0.16 : -0.16);
        enemy.root.position.z += wall.forward.z * (depth >= 0 ? 0.16 : -0.16);
        wall.hitFlash = 1;
        if (!enemy.scout && enemy.mode !== 'stagger') enemy.setMode('stagger');
      }
      if (wall.t >= wall.dur) {
        this.g.scene.remove(wall.group);
        wall.group.traverse((o) => {
          o.geometry?.dispose();
          if (o.material) o.material.dispose();
        });
        this.forceWalls.splice(i, 1);
      }
    }
  }

  /** Pink Aegis absorbs incoming hits for as long as its field remains active. */
  absorbDamage(amount) {
    const fx = this.forceFields.find((field) => field.t < field.dur);
    if (!fx) return false;
    fx.hitFlash = 1;
    this.g.addTrauma(0.12);
    this.g.audio?.shockwave(0.28);

    // The shield does more than absorb a hit: it sends a short outward pulse
    // that physically shoves nearby attackers away from the player.
    const playerPos = this.g.player.root.position;
    for (const enemy of this.g.fighters) {
      if (enemy.ko || enemy.mode === 'offscreen' || !enemy.root.visible) continue;
      const dx = enemy.root.position.x - playerPos.x;
      const dz = enemy.root.position.z - playerPos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 3.6) continue;
      const invDist = dist > 0.001 ? 1 / dist : 1;
      const strength = 6.2 * (1 - dist / 4.2);
      this._shove(enemy, dx * invDist * strength, dz * invDist * strength);
      if (!enemy.scout) enemy.setMode('stagger');
    }
    return true;
  }

  _updateForceFields(dt) {
    for (let i = this.forceFields.length - 1; i >= 0; i--) {
      const fx = this.forceFields[i];
      fx.t += dt;
      const fade = Math.min(1, Math.max(0, (fx.dur - fx.t) / 0.65));
      fx.hitFlash = Math.max(0, (fx.hitFlash || 0) - dt * 3.5);
      const pulse = 0.94 + Math.sin(fx.t * 7.5) * 0.06;
      fx.shell.scale.set(1 * pulse, 1.22 * pulse, 1 * pulse);
      fx.shell.material.opacity = (0.2 + (fx.hitFlash || 0) * 0.48) * fade;
      fx.outline.material.opacity = (0.72 + (fx.hitFlash || 0) * 0.25) * fade;
      fx.outline.rotation.y += dt * 0.22;
      fx.rings[0].rotation.y += dt * 0.8;
      fx.rings[1].rotation.x += dt * 0.65;
      for (const ring of fx.rings) ring.material.opacity = 0.8 * fade;
      if (fx.t >= fx.dur) {
        fx.root.remove(fx.field);
        fx.field.traverse((o) => {
          o.geometry?.dispose();
          if (o.material) o.material.dispose();
        });
        this.forceFields.splice(i, 1);
      }
    }
  }

  _spawnFloorBreak() {
    const scene = this.g.scene;
    const origin = this.g.player.root.position;
    this.g.env.breakFloor?.(origin, 1.15);
    const debris = [];
    const palette = [0x77736c, 0x625f59, 0x938b7d, 0x4d4b48];
    const count = 26;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.22;
      const speed = 1.8 + Math.random() * 3.8;
      const size = 0.09 + Math.random() * 0.17;
      const material = new THREE.MeshStandardMaterial({
        color: palette[i % palette.length],
        roughness: 0.96,
        metalness: 0.02,
        flatShading: true,
      });
      const shard = new THREE.Mesh(new THREE.TetrahedronGeometry(size, 0), material);
      shard.position.set(
        origin.x + Math.cos(angle) * (0.25 + Math.random() * 0.55),
        0.06 + Math.random() * 0.08,
        origin.z + Math.sin(angle) * (0.25 + Math.random() * 0.55),
      );
      shard.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      shard.castShadow = true;
      shard.receiveShadow = true;
      scene.add(shard);
      debris.push({
        mesh: shard,
        vx: Math.cos(angle) * speed,
        vz: Math.sin(angle) * speed,
        vy: 2.8 + Math.random() * 4.4,
        spinX: (Math.random() - 0.5) * 13,
        spinY: (Math.random() - 0.5) * 13,
        spinZ: (Math.random() - 0.5) * 13,
        age: 0,
        life: 1.35 + Math.random() * 0.75,
      });
    }
    this.floorDebris.push(...debris);
    this.g.addTrauma(1.25);
    this.g.flashV = Math.max(this.g.flashV, 0.72);
    this.g.input.rumble(0.85, 360);
    this.g.audio.shockwave(0.9);
  }

  _updateFloorDebris(dt) {
    for (let i = this.floorDebris.length - 1; i >= 0; i--) {
      const piece = this.floorDebris[i];
      const mesh = piece.mesh;
      piece.age += dt;
      piece.vy -= 10.5 * dt;
      mesh.position.x += piece.vx * dt;
      mesh.position.y += piece.vy * dt;
      mesh.position.z += piece.vz * dt;
      mesh.rotation.x += piece.spinX * dt;
      mesh.rotation.y += piece.spinY * dt;
      mesh.rotation.z += piece.spinZ * dt;

      // Let the chunks bounce once, then settle and fade out.
      if (mesh.position.y < 0.045) {
        mesh.position.y = 0.045;
        if (piece.vy < -0.8) {
          piece.vy *= -0.28;
          piece.vx *= 0.58;
          piece.vz *= 0.58;
        } else {
          piece.vy = 0;
          piece.vx *= 0.86;
          piece.vz *= 0.86;
        }
      }
      if (piece.age > piece.life - 0.35) {
        mesh.material.transparent = true;
        mesh.material.opacity = Math.max(0, (piece.life - piece.age) / 0.35);
      }
      if (piece.age >= piece.life) {
        this.g.scene.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
        this.floorDebris.splice(i, 1);
      }
    }
  }

  _updatePowerAnimations(dt) {
    this._updateBloodfireZaps(dt);
    this._updateFloorDebris(dt);
    this._updateForceFields(dt);
    this._updateForceWalls(dt);
    for (let i = this.powerVfx.length - 1; i >= 0; i--) {
      const fx = this.powerVfx[i];
      fx.t += dt;
      const p = Math.min(1, fx.t / fx.dur);
      const easeOut = 1 - Math.pow(1 - p, 3);
      const fade = Math.max(0, 1 - p);

      if (fx.slot === 2 || fx.slot === 5) {
        fx.group.rotation.z += dt * (fx.slot === 2 ? 2.4 : -1.8);
        fx.group.rotation.y += dt * (fx.slot === 2 ? 1.6 : 2.7);
      } else {
        fx.group.rotation.z += dt * (fx.slot === 1 ? -0.7 : 0.5);
      }

      for (let j = 0; j < fx.rings.length; j++) {
        const ring = fx.rings[j];
        let spread;
        if (fx.slot === 2) spread = 1 + Math.sin(p * Math.PI * 2) * 0.08;
        else if (fx.slot === 3) spread = 0.45 + easeOut * (1.8 + j * 0.35);
        else if (fx.slot === 4) spread = 0.55 + easeOut * (3.1 + j * 0.55);
        else spread = 0.45 + easeOut * (2.2 + j * 0.45);
        ring.scale.setScalar(spread);
        ring.material.opacity = fade * (j === 0 ? 0.95 : 0.65);
      }

      const pulse = 0.72 + Math.sin(p * Math.PI * (fx.slot === 2 ? 7 : 5)) * 0.28;
      const coreGrow = fx.slot === 4 ? 0.35 + easeOut * 0.4 : 0.75 + pulse * 0.65;
      fx.core.scale.copy(fx.coreBaseScale).multiplyScalar(coreGrow);
      fx.core.material.opacity = fade * pulse;
      fx.core.rotation.x += dt * 2.2;
      fx.core.rotation.y += dt * 3.4;

      if (p >= 1) {
        fx.group.parent?.remove(fx.group);
        fx.group.traverse((o) => {
          o.geometry?.dispose();
          if (o.material) o.material.dispose();
        });
        this.powerVfx.splice(i, 1);
      }
    }
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
    for (const wall of this.forceWalls) {
      this.g.scene.remove(wall.group);
      wall.group.traverse((o) => { o.geometry?.dispose(); if (o.material) o.material.dispose(); });
    }
    this.forceWalls.length = 0;
    for (const fx of this.forceFields) {
      fx.root.remove(fx.field);
      fx.field.traverse((o) => { o.geometry?.dispose(); if (o.material) o.material.dispose(); });
    }
    this.forceFields.length = 0;
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
    this._updatePowerAnimations(dt);
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
