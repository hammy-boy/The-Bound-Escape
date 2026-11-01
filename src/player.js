import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
V.lerpVectors = (a, b, t) => new THREE.Vector3().lerpVectors(a, b, t);
const UP = V(0, 1, 0);

// Punch table. `reach` is deliberately pathetic — this is a bound fight.
// maxDist/cone are the hit volume: a short ray from the eyes, nothing more.
export const PUNCHES = {
  left:     { wind: 0.075, act: 0.075, rec: 0.17, power: 0.85, reach: 0.88, height: 1.22, wide: 0.34, maxDist: 1.15, cone: 46 },
  right:    { wind: 0.135, act: 0.08,  rec: 0.24, power: 1.45, reach: 1.00, height: 1.28, wide: 0.05, maxDist: 1.30, cone: 30 },
  headbutt: { wind: 0.11,  act: 0.06,  rec: 0.30, power: 1.15, reach: 0.60, height: 1.42, wide: 0.0,  maxDist: 0.95, cone: 30 },
  chair:    { wind: 0.16,  act: 0.10,  rec: 0.36, power: 1.90, reach: 0.80, height: 0.55, wide: 0.25, maxDist: 1.45, cone: 55 },
};

function limbMesh(mat, r) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.86, 1, 7), mat);
  m.castShadow = true;
  return m;
}
function placeLimb(mesh, a, b) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length() || 0.001;
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.scale.set(1, len, 1);
  mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
}

export class Player {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    camera.rotation.order = 'YXZ';

    this.state = 'bound';          // bound -> loose -> wristsFree -> free
    this.lean = new THREE.Vector2(0, 0);   // x = right, y = forward
    this.leanV = new THREE.Vector2(0, 0);
    this.yaw = 0; this.pitch = -0.12;
    this.recover = 0;              // post-miss stagger
    this.invuln = 0;               // grace after a landed hit
    this.desperation = 0;
    this.resolve = 3;
    this.momentum = 0;            // landed strikes in a row; the catalyst counts them
    this.standing = 0;             // 0 seated .. 1 upright
    this.braced = false;
    this.boltPop = false;
    this.punch = null;
    this.hitDone = true;
    this.busy = 0;                 // can't act (grabbed, prying, etc.)
    this.shakeSelf = 0;
    this.falling = false;
    this.jumping = false;
    this.jumpVy = 0;          // the deck stopped being under you
    this.vy = 0;
    this.speed = 0;
    this.roll = 0;
    this.onStep = null;
    this.onTaken = null;

    // --- armature -----------------------------------------------------
    this.root = new THREE.Group();              // chair + anchored body, world
    scene.add(this.root);
    this.chair = new THREE.Group();
    this.root.add(this.chair);
    this.body = new THREE.Group();              // pivots at the hips
    this.body.position.y = 0.52;
    this.root.add(this.body);
    this.head = new THREE.Group();
    this.head.position.set(0, 1.0, 0);
    this.body.add(this.head);
    this.head.add(camera);
    // the eye goes at the FRONT of the head box, not inside it: parked at the
    // centre, your own neck sits 13cm ahead of the lens and fills the frame.
    this.eye = V(0, 0.06, -0.1);
    camera.position.copy(this.eye);

    const matSkin = new THREE.MeshStandardMaterial({ color: 0xa97a5c, roughness: 0.78 });
    const matShirt = new THREE.MeshStandardMaterial({ color: 0x4d4238, roughness: 0.95 });
    const matPants = new THREE.MeshStandardMaterial({ color: 0x2c2b30, roughness: 0.95 });
    const matSteel = new THREE.MeshStandardMaterial({ color: 0x77726a, roughness: 0.6, metalness: 0.25 });
    const matRope = new THREE.MeshStandardMaterial({ color: 0xd9d2c2, roughness: 1 });
    const matTie = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.8 });

    // fabrication chair
    const C = this.chair;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.09, 0.52), matSteel);
    seat.position.set(0, 0.46, 0.02); seat.castShadow = true; C.add(seat);
    const backr = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.72, 0.07), matSteel);
    backr.position.set(0, 0.85, 0.29); backr.rotation.x = 0.16; backr.castShadow = true; C.add(backr);
    for (const sx of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.46), matSteel);
      arm.position.set(sx * 0.3, 0.68, 0.05); arm.castShadow = true; C.add(arm);
      for (const sz of [-0.16, 0.16]) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.46, 0.06), matSteel);
        p.position.set(sx * 0.3, 0.46 - 0.23 + 0.01, sz); p.castShadow = true; C.add(p);
      }
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.44, 0.07), matSteel);
      leg.position.set(sx * 0.26, 0.22, -0.2); leg.rotation.x = 0.1; C.add(leg);
      const leg2 = leg.clone(); leg2.position.z = 0.24; leg2.rotation.x = -0.1; C.add(leg2);
    }
    C.add(new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.04, 0.66), matSteel).translateY(0.02));
    this.boltGroup = new THREE.Group();
    for (const [x, z] of [[-0.28, -0.22], [0.28, -0.22], [-0.28, 0.24], [0.28, 0.24]]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 8), matTie);
      b.position.set(x, 0.045, z);
      this.boltGroup.add(b);
    }
    C.add(this.boltGroup);

    // torso + shoulders (seen when you look down at yourself)
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.62, 0.26), matShirt);
    torso.position.set(0, 0.3, 0.03); torso.castShadow = true; this.body.add(torso);
    this.torso = torso;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8), matSkin);
    neck.position.y = 0.92; this.body.add(neck);
    const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.23, 0.2), matSkin);
    headMesh.position.set(0, 1.06, -0.01); headMesh.castShadow = true; this.body.add(headMesh);
    this.headMesh = headMesh;
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.21), new THREE.MeshStandardMaterial({ color: 0x241c17, roughness: 1 }));
    hair.position.set(0, 1.17, -0.005); this.body.add(hair);

    // legs, lashed at the ankle to the chair legs
    this.legs = [];
    for (const sx of [-1, 1]) {
      const thigh = limbMesh(matPants, 0.085); this.root.add(thigh);
      const shin = limbMesh(matPants, 0.07); this.root.add(shin);
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.1, 0.26), new THREE.MeshStandardMaterial({ color: 0x1d1a17, roughness: 0.9 }));
      boot.castShadow = true; this.root.add(boot);
      this.legs.push({ thigh, shin, boot, sx });
    }
    this.ankleRope = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.018, 6, 12), matRope);
    this.ankleRope.rotation.set(Math.PI / 2, 0, 0);
    this.ankleRope.position.set(0, 0.17, -0.16);
    this.root.add(this.ankleRope);

    // arms: bound behind the back
    this.arms = {};
    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? -1 : 1;
      this.arms[side] = {
        shoulder: V(sx * 0.2, 0.52, 0.02),
        rest: V(sx * 0.16, 0.2, 0.34),
        upper: limbMesh(matShirt, 0.055),
        fore: limbMesh(matSkin, 0.046),
        fist: new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.1, 0.15), matSkin.clone()),
        side: sx,
      };
      this.body.add(this.arms[side].upper, this.arms[side].fore, this.arms[side].fist);
      this.arms[side].fist.castShadow = true;
    }
    this.tie = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.014, 6, 14), matTie);
    this.tie.rotation.y = Math.PI / 2;
    this.body.add(this.tie);
    this.tieStrain = 0;   // 0..1 while levering the nightstick
    this._lastFist = { L: this.arms.L.rest.clone(), R: this.arms.R.rest.clone() };

    // ---- what you walk out of the ring wearing ----
    // Your brother's bag, strap pulled tight across the chest so it does not
    // swing while you fight, and the fob from inside it clipped to the belt.
    const matLeather = new THREE.MeshStandardMaterial({ color: 0x5b3a21, roughness: 0.88 });
    const matLeatherDark = new THREE.MeshStandardMaterial({ color: 0x3a2515, roughness: 0.92 });
    const matBrassS = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.34, metalness: 0.82 });

    this.satchelWorn = new THREE.Group();
    this.satchelWorn.visible = false;
    this.body.add(this.satchelWorn);
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.062, 1, 0.014), matLeatherDark);
    placeLimb(strap, V(-0.18, 0.58, -0.145), V(0.16, 0.08, -0.15));
    this.satchelWorn.add(strap);
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.23, 0.27), matLeather);
    bag.position.set(0.26, 0.02, 0.0);
    bag.rotation.z = -0.06;
    bag.castShadow = true;
    this.satchelWorn.add(bag);
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.108, 0.03, 0.28), matLeatherDark);
    flap.position.set(0, 0.12, 0.0);
    bag.add(flap);
    bag.add(new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.035, 0.05), matBrassS).translateY(0.03).translateZ(-0.13));
    bag.add(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.1, 0.05), matLeatherDark).translateX(-0.055).translateY(-0.02).translateZ(-0.13));
    this.bagMesh = bag;

    this.fob = new THREE.Group();
    this.fob.visible = false;
    this.fob.position.set(-0.21, 0.1, -0.1);
    this.body.add(this.fob);
    this.fob.add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.11, 0.045),
      new THREE.MeshStandardMaterial({ color: 0x23272c, roughness: 0.5, metalness: 0.55 })));
    this.fob.add(new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.007, 5, 10), matBrassS)
      .translateY(0.07).rotateX(Math.PI / 2));
    const matFobCore = new THREE.MeshStandardMaterial({
      color: 0x07171d, emissive: 0x35e6ff, emissiveIntensity: 2, roughness: 0.25,
    });
    this.fobCore = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.05, 0.012), matFobCore);
    this.fobCore.position.set(0, -0.01, -0.026);
    this.fob.add(this.fobCore);
    // the beam is the readout: it points at whatever the fob is tracking, and
    // it is counter-rotated against the torso so it never lies about "down"
    this.fobBeam = new THREE.Mesh(
      new THREE.ConeGeometry(0.13, 1.0, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x35e6ff, transparent: true, opacity: 0.16, fog: false,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    this.fobBeam.position.y = -0.5;
    this.fob.add(this.fobBeam);
    this.fobLight = new THREE.PointLight(0x35e6ff, 0, 3.4, 2);
    this.fobLight.position.set(0, -0.06, -0.06);
    this.fob.add(this.fobLight);
    this.fobRate = 0;   // 0 = nothing, 1 = frantic: driven by the director
  }

  // ---------- state helpers ----------
  get seated() { return this.state !== 'free'; }
  get load() { return Math.max(0, -this.lean.y); }   // leaning *back* = charging

  addImpulse(x, y) { this.leanV.x += x; this.leanV.y += y; }

  startPunch(kind) {
    if (this.punch || this.recover > 0 || this.busy > 0) return false;
    if (kind === 'chair' && this.state === 'bound') return false;
    const base = PUNCHES[kind];
    const uppercut = kind === 'right' && this.load > 0.3;
    const heavy = this.desperation >= 1;
    let power = base.power;
    if (uppercut) power *= 2.1;
    if (heavy) { power *= 2.3; this.desperation = 0; }
    // momentum is the weapon: a punch thrown *with* the rock carries the torso
    power *= 0.72 + Math.abs(this.lean.x) * 0.5 + Math.max(0, this.lean.y) * 0.7;
    // the combination counter — three strikes in a row are worth more than the
    // sum of three punches, which is the whole argument for pressing 1 twice
    power *= 1 + Math.min(6, this.momentum || 0) * 0.045;
    this.punch = {
      kind, t: 0, dur: base.wind + base.act + base.rec,
      wind: base.wind, act: base.act, rec: base.rec,
      reach: base.reach, height: uppercut ? 1.02 : base.height,
      wide: base.wide, power, heavy, uppercut,
      maxDist: base.maxDist * (heavy ? 1.12 : 1),
      cone: THREE.MathUtils.degToRad(base.cone + (uppercut ? 16 : 0)),
      side: kind === 'left' ? 'L' : 'R',
      target: null,
    };
    this.hitDone = false;
    return true;
  }

  // ---------- per-frame ----------
  update(dt, input, world, opts = {}) {
    const { canLook = true, canLean = true, moveSpeed = 0 } = opts;

    // look — pure first person: mouse travel turns the head, nothing else does
    if (canLook) {
      const d = input.lookDelta(new THREE.Vector2());
      const sens = (input.locked ? input.sensitivity : input.freeSensitivity)
        * (this.state === 'free' ? 1 : 0.8);
      this.yaw -= d.x * sens;
      this.pitch -= d.y * sens;
      // looking down at your own chest is never the shot the player wants
      const lo = this.state === 'free' ? -0.62 : -1.15, hi = this.state === 'free' ? 0.9 : 0.42;
      this.pitch = THREE.MathUtils.clamp(this.pitch, lo, hi);
    }

    // lean spring
    const ax = input.axis(new THREE.Vector2());
    this.braced = input.down('ShiftLeft') || input.down('ShiftRight');
    if (canLean && this.state !== 'free') {
      const accel = this.recover > 0 ? 4.2 : 12.5;
      this.leanV.x += ax.x * accel * dt;
      this.leanV.y += ax.y * accel * dt;
    } else if (this.state === 'free') {
      this.lean.multiplyScalar(Math.max(0, 1 - dt * 7));
      this.leanV.multiplyScalar(Math.max(0, 1 - dt * 9));
    }
    const stiff = 26, damp = this.braced ? 14 : 6.4;
    this.leanV.x -= this.lean.x * stiff * dt;
    this.leanV.y -= this.lean.y * stiff * dt;
    this.leanV.multiplyScalar(Math.max(0, 1 - damp * dt));
    this.lean.addScaledVector(this.leanV, dt);
    if (this.lean.length() > 1) { this.lean.setLength(1); this.leanV.multiplyScalar(0.35); }
    if (this.recover > 0) this.recover -= dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.busy > 0) this.busy -= dt;
    if (this.shakeSelf > 0) this.shakeSelf = Math.max(0, this.shakeSelf - dt);

    // desperation: builds while something is in your space. A full meter holds —
    // it is the one thing you get to trade for, and it should still be there
    // when you decide to spend it.
    if (opts.threat != null) {
      const prox = THREE.MathUtils.clamp(1 - opts.threat / 2.2, 0, 1);
      this.desperation = this.desperation >= 1 ? 1
        : THREE.MathUtils.clamp(this.desperation + (prox * 0.42 - 0.16) * dt, 0, 1);
    }

    // body pose from lean — hips stay put, everything above them rocks.
    // lean.y is positive FORWARD, and a forward tip is a negative X rotation.
    const standLerp = THREE.MathUtils.damp(this.standing, this.state === 'free' ? 1 : 0, 6, dt);
    this.standing = standLerp;

    this.body.rotation.x = THREE.MathUtils.lerp(-this.lean.y * 0.52 - 0.1 * (1 - standLerp), -this.lean.y * 0.3, standLerp);
    this.body.rotation.z = -this.lean.x * 0.46 * (1 - standLerp * 0.7);
    // the torso leads the look by this fraction; the camera adds the rest on top,
    // so `yaw` is not the direction you see — aimYaw() converts between them
    this.followK = THREE.MathUtils.lerp(0.5, 0.25, standLerp * 0.9);
    this.body.rotation.y = this.yaw * this.followK;
    this.body.position.y = 0.52 + standLerp * 0.12;
    this.head.rotation.x = -this.body.rotation.x * 0.45 + Math.sin(performance.now() / 1000 * 1.6) * 0.006;
    this.head.rotation.z = -this.body.rotation.z * 0.35;

    // the chair itself: bolted until the bolts pop, then a weapon
    if (this.state === 'loose') {
      this.root.rotation.x = THREE.MathUtils.clamp(this.lean.y, -1, 1) * -0.13;
      this.root.position.z = -Math.max(0, this.lean.y) * 0.16;
      this.root.position.x = this.lean.x * 0.1;
      this.chair.rotation.z = -this.lean.x * 0.05;
    } else if (this.state !== 'free') {
      this.root.rotation.x = THREE.MathUtils.damp(this.root.rotation.x, 0, 8, dt);
      this.root.position.x = THREE.MathUtils.damp(this.root.position.x, 0, 8, dt);
      this.root.position.z = THREE.MathUtils.damp(this.root.position.z, 0, 8, dt);
    }
    if (this.state === 'free') {
      this.chair.visible = false;
      this.ankleRope.visible = false;
      this.tie.visible = false;
      this.legs.forEach((l) => { l.thigh.visible = l.shin.visible = l.boot.visible = true; });
      this.root.rotation.x = 0;
      // walk at last. `clamp` is whatever the current environment calls solid
      // ground: the walls of a cell, or a catwalk with a hole in it.
      const walk = input.axis(new THREE.Vector2());
      const dir = this._dir || (this._dir = new THREE.Vector3());
      // steer by the eyes, not by the yaw number: the torso follows the look, so
      // the camera's world forward is the only direction that is where you aim
      const f = this.forwardWorld(new THREE.Vector3());
      dir.set(f.x * walk.y - f.z * walk.x, 0, f.z * walk.y + f.x * walk.x);
      const mag = Math.min(1, dir.length());
      if (mag > 0.001) dir.normalize();
      const want = this.falling ? 0 : moveSpeed * mag;
      this.speed = THREE.MathUtils.damp(this.speed ?? 0, want, want > 0 ? 3.8 : 10, dt);
      const vx = dir.x * this.speed, vz = dir.z * this.speed;
      this.root.position.x += vx * dt;
      this.root.position.z += vz * dt;
      if (this.falling) {
        this.vy = (this.vy ?? 0) - 26 * dt;
        this.root.position.y += this.vy * dt;
      } else {
        if (opts.allowJump && input.pressed('Space') && !this.jumping) {
          this.jumping = true;
          this.jumpVy = 7.2;
        }
        if (this.jumping) {
          this.jumpVy -= 19 * dt;
          this.root.position.y += this.jumpVy * dt;
          if (this.root.position.y <= 0) {
            this.root.position.y = 0;
            this.jumpVy = 0;
            this.jumping = false;
          }
        } else {
          if (opts.clamp) opts.clamp(this.root.position);
          this.root.position.y = THREE.MathUtils.damp(this.root.position.y, 0, 12, dt);
        }
      }
      const moving = Math.hypot(vx, vz);
      this.walkPhase = (this.walkPhase || 0) + dt * (2.6 + moving * 1.35);
      const amp = Math.min(1, moving / 4);
      this.head.position.y = 1.0 + Math.sin(this.walkPhase * 2) * 0.028 * amp;
      this.roll = Math.sin(this.walkPhase) * 0.014 * amp;
      if (moving > 0.6) {
        const phase = Math.sin(this.walkPhase) < 0;
        if (phase !== this._stepPhase) { this._stepPhase = phase; this.onStep?.(amp); }
      }
      this.speedNow = moving;
    }

    // legs rig — seated the knees are up and the feet are pinned back;
    // standing, everything drops down under the hips. All in root-local space.
    const hipY = 0.5, kneeZ = -0.3, footY = 0.09;
    const lift = this.standing;
    const stride = this.state === 'free' ? Math.sin(this.walkPhase || 0) * 0.22 * lift : 0;
    for (const [i, l] of this.legs.entries()) {
      const sw = i % 2 ? stride : -stride;
      const H = V(l.sx * 0.13, hipY + lift * 0.42, 0.04);
      const K = V(l.sx * 0.13, 0.44 + lift * 0.06, kneeZ * (1 - lift * 0.86) + sw);
      const A = V(l.sx * 0.12, footY + 0.06 - lift * 0.06, (kneeZ - 0.02) * (1 - lift * 0.82) + sw * 1.5);
      placeLimb(l.thigh, H, K);
      placeLimb(l.shin, K, A);
      l.boot.position.copy(A).add(V(0, -0.04, -0.07));
    }

    // punch animation drives the fist, the rock, and the camera whip
    if (this.punch) {
      const p = this.punch;
      p.t += dt;
      const ph = p.t < p.wind ? p.t / p.wind : p.t < p.wind + p.act ? 1 : 1 - (p.t - p.wind - p.act) / p.rec;
      p.phase = p.t < p.wind ? 'wind' : p.t < p.wind + p.act ? 'act' : 'rec';
      p.progress = Math.max(0, ph);
      if (p.kind === 'headbutt') {
        this.body.rotation.x -= (p.phase === 'act' ? 0.5 : 0.3 * p.progress);
        this.headMesh.position.z = -0.01 - 0.16 * p.progress;
      }
      if (p.uppercut) this.body.rotation.x += -0.18 * p.progress;
      if (p.kind === 'chair') this.root.rotation.x = -0.3 * p.progress;
      if (p.t >= p.dur) {
        if (!p.hitDone) this._whiff(p);
        this.punch = null;
      }
      const live = (p.phase === 'act' || (p.phase === 'wind' && p.progress > 0.8)) && !p.hitDone;
      this.pendingActive = live ? p : null;
    } else {
      this.pendingActive = null;
      this.headMesh.position.z = THREE.MathUtils.damp(this.headMesh.position.z, -0.01, 10, dt);
    }

    this._poseArms(dt);
    this._poseGear(dt);

    // camera transform from head + shake
    const cam = this.camera;
    const sh = this.shakeSelf;
    cam.position.set(
      this.eye.x + (Math.random() - 0.5) * sh * 0.08,
      this.eye.y + (Math.random() - 0.5) * sh * 0.08,
      this.eye.z
    );
    cam.rotation.set(
      this.pitch + (Math.random() - 0.5) * sh * 0.05,
      this.yaw + (Math.random() - 0.5) * sh * 0.05,
      -this.lean.x * 0.22 + (this.roll || 0) + (Math.random() - 0.5) * sh * 0.05
    );
  }

  /** the satchel and the fob: both hang off the torso, so both have to be told
   *  where down actually is when the body leans */
  _poseGear(dt) {
    if (this.satchelWorn.visible) {
      const amp = Math.min(1, (this.speedNow || 0) / 4);
      this.bagMesh.rotation.z = -0.06 + Math.sin((this.walkPhase || 0) * 2) * 0.05 * amp;
      this.bagMesh.rotation.x = Math.sin((this.walkPhase || 0) * 2 + 1.1) * 0.05 * amp;
    }
    if (!this.fob.visible) return;
    // counter-rotate against the torso so the beam is world-down, not chest-down
    this.fob.rotation.x = -this.body.rotation.x;
    this.fob.rotation.z = -this.body.rotation.z;
    const r = this.fobRate;
    this._fobPhase = (this._fobPhase || 0) + dt * (1.15 + r * 6.2) * Math.PI * 2;
    const k = Math.pow(0.5 + 0.5 * Math.sin(this._fobPhase), 8) * r;
    this.fobCore.material.emissiveIntensity = 0.55 + k * 6.5;
    this.fobLight.intensity = k * 3.1;
    this.fobBeam.material.opacity = 0.04 * r + k * 0.3;
    this.fobBeam.scale.set(1 + k * 0.3, 1 + k * 0.12, 1 + k * 0.3);
    // the pulse is frantic enough to shake the bag it came out of
    this.fob.position.x = -0.21 + Math.sin(this._fobPhase * 2) * 0.004 * r;
  }

  fobWorld(out = new THREE.Vector3()) { return this.fob.getWorldPosition(out); }

  _whiff(p) {
    // a missed swing throws your whole weight into the bindings
    const dir = p.kind === 'left' ? -1 : p.kind === 'chair' ? 0 : 1;
    this.addImpulse(p.wide * 2.4 * dir, 0.85);
    this.recover = p.kind === 'chair' ? 0.42 : 0.3;
    this.onWhiff?.(p);
  }

  _poseArms(dt) {
    const p = this.punch;
    for (const side of ['L', 'R']) {
      const a = this.arms[side];
      let target = a.rest.clone();

      if (p && p.side === side) {
        const k = THREE.MathUtils.smoothstep(p.progress, 0, 1);
        const anchor = V(0, 1.0, 0);            // sternum, in body space
        const yawX = -Math.sin(this.yaw), yawZ = -Math.cos(this.yaw);
        const aim = V(
          yawX * p.reach * 0.92 + a.side * p.wide,
          p.height - this.body.position.y,
          yawZ * p.reach
        );
        target = V.lerpVectors(anchor, aim, k);
        if (p.uppercut) target.y = THREE.MathUtils.lerp(0.02, 0.66, k);
      } else if (this.state === 'free') {
        target = V(a.side * 0.26, 0.24, -0.05);
      } else if (this.tieStrain > 0) {
        target = V(a.side * 0.1, 0.42, -0.1 - Math.sin(performance.now() / 70) * 0.02);
      } else if (!p) {
        // idle struggle: hands grind against the ties
        const w = Math.sin(performance.now() / 420 + a.side) * 0.012;
        target = a.rest.clone().add(V(w, w * 0.4, 0));
      }

      const shoulder = a.shoulder;
      const elbow = V.lerpVectors(shoulder, target, 0.5).add(V(a.side * 0.08, -0.05, 0.11));
      placeLimb(a.upper, shoulder, elbow);
      placeLimb(a.fore, elbow, target);
      a.fist.position.copy(target);
      a.fist.lookAt(elbow);
      this._lastFist = this._lastFist || {};
      this._lastFist[side] = target;
    }
    const mid = V.lerpVectors(this._lastFist.L, this._lastFist.R, 0.5);
    this.tie.position.copy(mid);
    this.tie.scale.setScalar(1 + this.tieStrain * 0.35);
    this.tie.material.color.setRGB(
      0.1 + this.tieStrain * 0.85, 0.1 + this.tieStrain * 0.85, 0.12 + this.tieStrain * 0.8);
  }

  // Bury the striking fist in whatever you actually connected with, so the
  // hitstop frame shows contact instead of a hand somewhere near the target.
  plantFist(worldPoint) {
    const p = this.punch;
    if (!p) return;
    const a = this.arms[p.side];
    const target = this.body.worldToLocal(worldPoint.clone());
    const shoulder = a.shoulder;
    target.sub(shoulder).multiplyScalar(0.82).add(shoulder);
    const elbow = V.lerpVectors(shoulder, target, 0.5).add(V(a.side * 0.08, -0.05, 0.11));
    placeLimb(a.upper, shoulder, elbow);
    placeLimb(a.fore, elbow, target);
    a.fist.position.copy(target);
    a.fist.lookAt(elbow);
    this._lastFist[p.side] = target;
  }

  /** point the eyes along a world yaw: the torso leads the look, so raw yaw overshoots */
  aimYaw(viewYaw) { this.yaw = viewYaw / (1 + (this.followK ?? 0.275)); }

  headWorld(out = new THREE.Vector3()) {    return this.body.localToWorld(out.copy(V(0, 1.06, -0.08)));
  }

  eyeWorld(out = new THREE.Vector3()) { return this.camera.getWorldPosition(out); }

  /** unit forward vector of the view, flattened to the floor */
  forwardWorld(out = new THREE.Vector3()) {
    this.camera.getWorldDirection(out);
    out.y = 0;
    if (out.lengthSq() < 1e-6) out.set(0, 0, -1);
    return out.normalize();
  }

  /** `grace` is what the last hit buys you. Three pairs of knuckles can land in
   *  the same tenth of a second, and that is a queue, not a fight. Pass 0 for the
   *  kinds of damage that are not coming from somebody's fist. */
  damage(amount, grace = 0.9) {
    if (grace > 0 && this.invuln > 0) return false;
    this.invuln = grace;
    this.resolve = Math.max(0, this.resolve - amount);
    this.addImpulse((Math.random() - 0.5) * 1.6, -0.9);
    this.shakeSelf = 1;
    this.desperation = THREE.MathUtils.clamp(this.desperation + 0.34, 0, 1);
    this.onTaken?.(amount);
    return true;
  }

  get dodgeSide() { return this.lean.x < 0 ? -1 : 1; }
  get dodging() { return Math.abs(this.lean.x) > 0.58 && this.state !== 'free'; }
}
