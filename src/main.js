import * as THREE from 'three';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { Hud } from './hud.js';
import { buildWorld } from './world.js';
import { buildSilo } from './silo.js';
import { buildCore } from './core.js';
import { buildLift } from './lift.js';
import { buildVents } from './vents.js';
import { Player } from './player.js';
import { Guard } from './enemy.js';
import { Drone } from './drone.js';
import { CloakScout } from './cloak.js';
import { Director } from './director.js';
import { Catalyst } from './catalyst.js';
import * as Save from './save.js';
import { Nav } from './nav.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050403);
const camera = new THREE.PerspectiveCamera(80, 1, 0.02, 80);
// the bulb is above and behind the guards, so the face you have to hit is the
// one thing in the room with no light on it. A view-locked directional fill
// lifts whatever you are looking at; a point light here would torch your own
// chest, which sits 30cm from the lamp.
const faceFill = new THREE.DirectionalLight(0xffd2a6, 0.85);
faceFill.position.set(0.35, 0.5, -0.6);
faceFill.target.position.set(0, 0, -3);
camera.add(faceFill, faceFill.target);
// the ring's only other light source is a red warning lamp sixty metres away, so
// whatever you turn your head toward has to lift itself out of the dark. It sits
// *behind* the front of your own chest, so the world in front of you lights up
// and your own body stays a silhouette.
const deckLamp = new THREE.PointLight(0xffc48f, 0, 46, 1.2);
deckLamp.position.set(0, 0.18, 0.5);
camera.add(deckLamp);

const input = new Input(canvas);
const audio = new AudioEngine();
const hud = new Hud();
const world = buildWorld(scene);
const cellFog = scene.fog;
const silo = buildSilo(scene);
const core = buildCore(scene);
const player = new Player(scene, camera);
const guard1 = new Guard(scene, { tall: 1.05, canvas: 0x6d5940 });
const guard2 = new Guard(scene, { tall: 0.99, canvas: 0x3a4148, baton: true, lighter: true });
const enforcer1 = new Guard(scene, { enforcer: true, tall: 1.07, canvas: 0x232a33 });
const enforcer2 = new Guard(scene, { enforcer: true, tall: 1.0, canvas: 0x2d3038 });
// Section Three: exo-boot reconnaissance, and the man who was already running
const scout1 = new Guard(scene, { scout: true, tall: 1.04, canvas: 0x1e262c });
const scout2 = new Guard(scene, { scout: true, tall: 0.97, canvas: 0x232b2a });
const scout3 = new Guard(scene, { scout: true, tall: 1.09, canvas: 0x1b2229 });
const officer = new Guard(scene, { officer: true, tall: 0.95, canvas: 0x2f2c26 });
// Section Four: what the containment units were actually for. Plate eats a
// third of anything that lands, so a fist alone is a slow argument here.
const trooper1 = new Guard(scene, { trooper: true, tall: 1.13, armor: 0.38, walkRate: 0.74, canvas: 0x2c332c });
const trooper2 = new Guard(scene, { trooper: true, tall: 1.06, armor: 0.38, walkRate: 0.78, canvas: 0x31352c });
const trooper3 = new Guard(scene, { trooper: true, tall: 1.18, armor: 0.42, walkRate: 0.7, canvas: 0x272d2a });

const game = {
  scene, camera, renderer, world, silo, core, player, guards: [guard1, guard2],
  enforcers: [enforcer1, enforcer2],
  scouts: [scout1, scout2, scout3],
  troopers: [trooper1, trooper2, trooper3],
  officer,
  fighters: [guard1, guard2, enforcer1, enforcer2, scout1, scout2, scout3, trooper1, trooper2, trooper3, officer],
  input, audio, hud,
  env: world, envName: 'cell',
  time: 0, started: false, over: false, paused: false,
  hitstop: 0, trauma: 0, flashV: 0, dmgPulse: 0,
  stats: { hits: 0, misses: 0, uppercuts: 0, taken: 0, hurled: 0 },
  addHitstop(s) { this.hitstop = Math.max(this.hitstop, s); },
  addTrauma(v) { this.trauma = Math.min(1.5, this.trauma + v); },

  /** no two rooms ever share a frame: one fog, one floor, one sky */
  setEnv(name) {
    if (this.envName === name) return;
    this.envName = name;
    this.env = name === 'cell' ? this.world : name === 'core' ? this.core : this.silo;
    this.world.setVisible(name === 'cell');
    this.silo.setVisible(name === 'silo');
    this.core.setVisible(name === 'core');
    this.scene.fog = name === 'cell' ? cellFog : this.env.fog;
    this.scene.background.set({ cell: 0x050403, silo: 0x070605, core: 0x06080a }[name]);
    this.camera.far = { cell: 80, silo: 320, core: 120 }[name];
    this.camera.updateProjectionMatrix();
    deckLamp.intensity = name === 'cell' ? 0 : name === 'core' ? 78 : 110;
    faceFill.intensity = name === 'cell' ? 0.85 : 0.5;
    // the corner legend has to describe the body you are actually in
    this.setControls(name === 'cell' ? 'cell' : name === 'core' ? 'core' : 'ring');
    audio.setEnv(name);
  },

  setControls(key) {
    CONTROLS = CONTROLS_LEGEND[key] || CONTROLS_LEGEND.cell;
    hud.hint(CONTROLS);
  },

  /**
   * Put the stage back the way a room's cold open expects to find it: every actor
   * parked off-deck, the props rebuilt, the player standing where the section wants
   * them standing. The director is replaced rather than unwound — a run is a hundred
   * small flags, and a new one is the only honest way to clear them.
   */
  resetStage(section, phase, resolve) {
    this.over = false;
    this.hitstop = 0; this.trauma = 0; this.flashV = 0; this.dmgPulse = 0;
    const cat = this.catalyst;
    cat.shoves.length = 0; cat.locks.length = 0;
    cat.combo = 0; cat.comboT = 0; cat.plasma = 0;

    const bound = section === 1;
    const silo = this.silo;
    const core = this.core;
    this.setEnv(section >= 4 ? 'core' : bound ? 'cell' : 'silo');
    this.world.resetCell();
    for (const d of silo.doors) { d.closing = false; d.sealed = false; d.shut = 0; }
    Object.assign(silo.elevator.userData, { shut: 0, closing: false });
    silo.hatchWant = 0; silo.hatchOpen = 0;
    silo.steam = 0; silo.alarm = 0; silo.surge = 0;
    silo.platformOnly = section >= 3;
    silo.satchel.visible = true;
    silo.showGlint(false);
    // the hall resets the way a room that is still running resets: the pods seal
    // back up and the tear closes, unless the pull you already carry says
    // otherwise — then the hall keeps wearing your ability's colour
    for (const p of core.pods) { p.want = 0; p.open = 0; p.burst = 0; }
    core.rift = 0; core.riftWant = 0.14; core.surge = 0; core.alarm = 0; core.lashOn = 0;
    core.gateWant = 0; core.gateOpen = 0;
    if (cat.def) core.setRiftColor(cat.def.rgb);

    for (const f of this.fighters) {
      f.ko = false; f.koT = 0; f.stagger = 0; f.landed = false; f.flinch = 0;
      f.overextended = false; f.vulnerable = false; f.holdOff = false;
      f.t = 0; f.exo = 0; f.dropV = 0; f.walk = 0; f.groundY = 0;
      f.shieldUp = !!f.shield;
      f.mode = 'offscreen';            // direct: setMode would fire entry flourishes
      f.root.visible = false;
      f.root.position.set(0, 0, 0);
      f.root.rotation.set(0, 0, 0);
      if (f.v) f.v.set(0, 0, 0);
    }

    const p = this.player;
    p.state = bound ? 'bound' : 'free';
    p.standing = bound ? 0 : 1;
    p.resolve = Math.max(1, Math.min(3, resolve));
    p.desperation = 0; p.momentum = 0; p.recover = 0; p.busy = 0; p.invuln = 0;
    p.shakeSelf = 0; p.punch = null; p.pendingActive = null; p.hitDone = true;
    p.falling = false; p.vy = 0; p.speed = 0; p.speedNow = 0; p.roll = 0;
    p.lean.set(0, 0); p.leanV.set(0, 0); p.pitch = -0.06; p.tieStrain = 0;
    p.boltPop = false;
    p.chair.visible = bound; p.tie.visible = bound; p.ankleRope.visible = bound;
    p.root.position.set(0, 0, 0); p.root.rotation.set(0, 0, 0);
    // the bag and the fob are picked up on the way onto the platform, so a resume
    // after that beat wears them and one before it leaves them on the console
    const worn = section >= 3 && phase !== 'crossing';
    p.satchelWorn.visible = worn;
    p.fob.visible = worn;
    p.fobRate = worn ? 1 : 0;
    if (section === 3) {
      this.audio.startTurbine();       // idempotent: the bed already runs under S3
      this.setControls('turbine');
      if (worn) silo.satchel.visible = false;
      silo.platformWorld(p.root.position).setY(0);
    } else if (section >= 4) {
      this.audio.startTurbine();       // the intake is still turning overhead
      if (worn) silo.satchel.visible = false;
      core.floorWorld(p.root.position);
      // the collar is what sends you down: it stops existing in the middle of
      // this room, so a resume after that beat is a bare wrist
      const before = phase === 'chute' || phase === 'rift';
      p.fob.visible = before;
      p.fobRate = before ? 1 : 0;
      if (!before) this.audio.setTurbine(0.3, 2);
      // look up the hall at the pods, not at the wall you fell out of
      p.aimYaw(Math.PI - 0.34);
    } else if (!bound) {
      // back onto the ring at the arc the director hands each beat over on. The
      // wall and the bridge are both faced *back* down the ring — that is where
      // the line of shields is coming from, and spawning you inside it is not a
      // resume, it is an ambush
      const th = phase === 'wall' ? 1.18 : phase === 'bridge' ? 1.55 : 0.09;
      silo.deckAt(th, 23.5, p.root.position);
      p.aimYaw(phase === 'breach' ? -(Math.PI / 2 + th) : Math.PI / 2 - th);
    }
    this.hud.darkness(0); this.hud.blur(0);
    this.hud.prompt(null); this.hud.clearCaption();
  },
};

// a Section Select jump needs a director with no memory of the last run, so every
// reader below goes through this binding rather than a captured value
let director = new Director(game);
game.director = director;
const catalyst = new Catalyst(game);
game.catalyst = catalyst;
window.__game = game;      // playtest hook

/** the record a refresh has to hand back: the room, the health, the rolled pull */
function writeSave() {
  if (!game.started || game.over || director.phase === 'boot') return;
  const prev = Save.load();
  const reached = new Set((prev && prev.reached) || []);
  const m = Save.bySection(director.section);
  if (m) reached.add(m.id);
  Save.persist({
    section: director.section,
    phase: director.phase,
    resolve: player.resolve,
    catalyst: catalyst.snapshot(),
    reached: [...reached],
    seconds: game.time,
  });
}
game.onProgress = writeSave;

/**
 * Continue / Section Select. A fresh director, the stage rebuilt around the room's
 * own opening state, then that room's cold open — the same entry path a first play
 * through takes, which is why it cannot land you in a half-fought beat.
 */
function enterRoom(section, phase, resolve, keepAbility = true) {
  director = new Director(game);
  game.director = director;
  game.resetStage(section, phase, resolve);
  const s = Save.load();
  if (keepAbility) { if (s && s.catalyst) catalyst.apply(s.catalyst); }
  else if (catalyst.unlocked) {
    // a room before the rift is a gamble, and there is no gamble if the pull you
    // already have rides along with you — so going back early spends it
    catalyst.reset();
  }
  director.section = section;
  director.goto(phase);
  director._lastSafe.copy(player.root.position);
  writeSave();
}

const CONTROLS_LEGEND = {
  cell: '<kbd>WASD</kbd> rock · <kbd>LMB/RMB</kbd> punch · <kbd>F</kbd> headbutt · <kbd>E</kbd> chair · <kbd>Z</kbd> release restraints · <kbd>SHIFT</kbd> brace · <kbd>MOUSE</kbd> look · <kbd>ESC</kbd> menu · <kbd>H</kbd> hide',
  ring: '<kbd>WASD</kbd> run · <kbd>SHIFT</kbd> brace · <kbd>LMB/RMB</kbd> strike · <kbd>E</kbd> interact · <kbd>MOUSE</kbd> look · <kbd>ESC</kbd> menu · <kbd>H</kbd> hide',
  turbine: '<kbd>WASD</kbd> run · <kbd>LMB/RMB</kbd> strike only when they miss · <kbd>F</kbd> headbutt · <kbd>SPACE</kbd> jump · <kbd>MOUSE</kbd> look · <kbd>ESC</kbd> menu · <kbd>H</kbd> hide',
  core: '<kbd>WASD</kbd> run · <kbd>1</kbd> base strike · <kbd>Z</kbd> anomaly power · <kbd>LMB/RMB</kbd> punch · <kbd>F</kbd> headbutt · <kbd>SHIFT</kbd> brace · <kbd>MOUSE</kbd> look · <kbd>ESC</kbd> menu',
};
let CONTROLS = CONTROLS_LEGEND.cell;

for (const g of game.fighters) g.onEvent = (n, p, guard) => director.onGuardEvent(n, p, guard);
player.onWhiff = () => { game.stats.misses++; audio.whoosh(0.45); catalyst.onWhiff(); };
player.onTaken = () => catalyst.onTaken();
player.onStep = (amp) => { if (game.envName !== 'cell') audio.metalStep(0.45 + amp * 0.5); };

// ---------------- combat resolution ----------------
const _tgt = new THREE.Vector3(), _eye = new THREE.Vector3(), _fwd = new THREE.Vector3();
const _to = new THREE.Vector3(), _hit = new THREE.Vector3();

// Short-range melee: a ray out of the eyes plus a cone. At bound range the
// target is often closer than the punch itself, so a point test falls apart.
function resolveHits() {
  const p = player.pendingActive;
  if (!p || p.hitDone) return;

  player.eyeWorld(_eye);
  camera.getWorldDirection(_fwd);
  const minDot = Math.cos(p.cone);

  // the brass feed pipe is a target like any other, but only once the ring has
  // pointed it out — otherwise it is a 7cm pipe in a red-lit shaft
  if (director.pipeArmed) {
    game.silo.pipeWorld(_tgt);
    _to.subVectors(_tgt, _eye);
    const dist = _to.length();
    if (dist < p.maxDist + 0.55 && _to.normalize().dot(_fwd) > Math.cos(0.5)) {
      p.hitDone = true;
      director.onPipeHit(p, _tgt);
      return;
    }
  }

  let best = null, bestPart = null, bestScore = Infinity;
  for (const g of game.fighters) {
    // the facility officer is not a combatant and never gets to be a target
    if (g.ko || g.officer || g.mode === 'offscreen' || !g.root.visible) continue;
    for (const part of ['head', 'chest', 'knee']) {
      if (p.kind === 'chair' ? part !== 'knee' : part === 'knee') continue;
      g.point(part, _tgt);
      _to.subVectors(_tgt, _eye);
      const dist = _to.length();
      if (dist > p.maxDist || dist < 0.02) continue;
      const dot = _to.normalize().dot(_fwd);
      if (dot < minDot) continue;
      const score = (1 - dot) * 2.2 + dist * 0.15 + (part === 'head' ? -0.4 : 0);
      if (score < bestScore) { bestScore = score; best = g; bestPart = part; _hit.copy(_tgt); }
    }
  }
  if (!best) return;

  p.hitDone = true;

  // a raised riot shield eats the strike, gives back none of it, and costs you
  // the one thing you never have enough of out here: a beat. Unless you have
  // plasma on the knuckles, or three unbroken strikes to take it off its owner.
  if (best.blocksHit(bestPart)) {
    if (catalyst.pierces || catalyst.breaksGuard()) {
      catalyst.breakShield(best);
      game.addTrauma(0.7);
      game.flashV = Math.max(game.flashV, 0.5);
    } else {
      game.stats.misses++;
      player.plantFist(_hit);
      audio.clang();
      game.addHitstop(0.05);
      game.addTrauma(0.3);
      player.recover = Math.max(player.recover, 0.16);
      player.addImpulse((Math.random() - 0.5) * 0.4, -0.45);
      player.desperation = Math.min(1, player.desperation + 0.16);
      input.rumble(0.35, 90);
      director.onShieldHit(best, bestPart);
      catalyst.onBlock();
      return;
    }
  }

  // a scout still on its feet is simply not where the fist arrives: you lose the
  // beat, he keeps his, and the only way to touch him is to let him overrun you
  if (best.evadesHit()) {
    game.stats.misses++;
    player.plantFist(_hit);
    audio.slip();
    game.addTrauma(0.22);
    player.recover = Math.max(player.recover, 0.28);
    player.shakeSelf = Math.max(player.shakeSelf, 0.28);
    player.addImpulse((Math.random() - 0.5) * 0.5, -0.3);
    input.rumble(0.2, 70);
    director.onEvade(best);
    return;
  }

  game.stats.hits++;
  player.plantFist(_hit);
  const vulnerable = best.overextended || best.mode === 'grab' || best.mode === 'lean';
  const power = p.power * (vulnerable ? 1.75 : 1) * catalyst.powerFor();
  if (p.uppercut) game.stats.uppercuts++;

  // ---- feel: this is the whole argument of the game ----
  game.addHitstop(Math.min(0.18, 0.05 + power * 0.03));
  game.addTrauma(0.45 + power * 0.34);
  game.flashV = Math.min(1, 0.28 + power * 0.3);
  player.shakeSelf = 0.6 + power * 0.35;
  if (bestPart === 'head' || p.heavy) audio.crack(); else audio.hit(power);
  input.rumble(0.6 + power * 0.25, 160);
  game.env.burst(_hit, p.heavy ? 26 : 14, bestPart === 'head' ? [0.62, 0.05, 0.04] : [0.35, 0.3, 0.24],
    0.9, 1.6 + power, 1.15, 0.045);

  // kinetic recoil — landing a blow moves *you* too
  const away = best.root.position.clone().sub(player.root.position).setY(0).normalize();
  const pull = p.kind === 'left' ? 0.5 : 0.9;
  player.addImpulse(away.x * power * 0.35 * pull, -0.35 * power * (p.uppercut ? -0.6 : 1));

  const res = best.damage(power);
  director.onHit(best, p, bestPart, res);
  catalyst.onLand(best, _hit, bestPart);
}

// ---------------- actions ----------------
function handleActions() {
  const i = input;
  // Z spends the player's actual unlocked anomaly power in Section Four.
  // Earlier in the opening, Z remains reserved for releasing the restraints.
  if (director.section >= 4 && i.pressed('KeyZ')) catalyst.fire();
  if (i.pressed('MB_LEFT')) player.startPunch('left');
  if (i.pressed('MB_RIGHT')) player.startPunch('right');
  if (i.pressed('KeyF')) player.startPunch('headbutt');
  if (i.pressed('KeyE') && player.state === 'loose') {
    const near = game.fighters.some((g) => !g.ko && g.root.visible && g.distanceTo(player.root.position) < 1.6);
    if (near) player.startPunch('chair');
  }
}

  // ---------------- loop ----------------
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, true);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  try { tick(now); } catch (err) {
    if (!game._errored) { game._errored = true; console.error('[frame]', err); }
  }
}

function tick(now) {
  // rAF timestamps can land a hair before performance.now(); a negative dt here
  // would run every integrator and every decay backwards.
  const rdt = THREE.MathUtils.clamp((now - last) / 1000, 0, 0.05);
  last = Math.max(last, now);
  game.time += rdt;

  input.update();
  // the arrow only belongs to the menu and the cards; in the fight it is out of
  // the way, whether or not the browser agreed to capture the pointer
  document.body.classList.toggle('playing', game.started && !game.over && !game.paused);
  if (input.padEdges.has('Escape') && !nav.shown) {
    if (game.paused) closeMenu(); else openMenu();
  }
  if (game.paused) {
    // frozen room, live panel: render the still frame and keep the input buffer
    // clean so resuming does not spend a whole second of accumulated looking
    renderer.render(scene, camera);
    input.endFrame();
    return;
  }

  let dt = rdt;
  if (game.hitstop > 0) { game.hitstop -= rdt; dt = 0; }   // frame freeze on contact

  // the beat you are standing in is the save's whole job: catch it the moment the
  // director moves, so a refresh at any point lands within one beat of that point
  if (director.phase !== lastPhase) { lastPhase = director.phase; writeSave(); }

  if (dt > 0 && !game.over) {
    director.update(dt);
    handleActions();
    player.update(dt, input, game.env, { ...director.opts, allowJump: !['awaken', 'freedom', 'leap'].includes(director.phase) });
    // on the floor and out cold: nobody moves, nothing lands, and you cannot
    // swing at whatever was standing over you a moment ago
    if (!director.blacked) {
      for (const g of game.fighters) g.update(dt, player, { forceSide: director.forceSide, march: director.march });
      resolveHits();
      // after the guards have moved: an anchor or a shove is a correction to
      // wherever they thought they were going this frame
      catalyst.update(dt);
    }
    director.postUpdate(dt);
  } else if (dt > 0) {
    player.update(dt, input, game.env, { canLook: true, canLean: false });
  }

  // trauma shake rides on top of the head transform
  if (game.trauma > 0) {
    const amp = game.trauma * game.trauma;
    camera.position.x += (Math.random() - 0.5) * amp * 0.11;
    camera.position.y += (Math.random() - 0.5) * amp * 0.11;
    camera.rotation.z += (Math.random() - 0.5) * amp * 0.09;
    camera.rotation.x += (Math.random() - 0.5) * amp * 0.05;
    camera.rotation.y += (Math.random() - 0.5) * amp * 0.04;
    game.trauma = Math.max(0, game.trauma - rdt * 2.1);
  }

  game.flashV = Math.max(0, game.flashV - rdt * 3.6);
  game.dmgPulse = Math.max(0, game.dmgPulse - rdt * 1.3);
  hud.brace(player.braced);
  hud.flash(game.flashV);
  hud.dmg(Math.min(0.95, (3 - player.resolve) * 0.16 + game.dmgPulse));
  hud.meter('load', player.state === 'free' ? 0 : player.load / 0.75, player.load > 0.42);
  hud.meter('desp', player.desperation);
  hud.resolve(player.resolve);

  // only the room on screen is worth simulating
  const step = dt > 0 ? dt : rdt * 0.12;
  game.env.update(step, game.time);
  renderer.render(scene, camera);
  // a hitstop frame is frozen world, live hands: dropping the key edges here
  // would swallow every strike and every ability pressed on impact, so the
  // buffer survives the freeze and is spent on the next moving frame
  if (dt > 0) input.endFrame();
}

// ---------------- start / pause menu ----------------
const cover = document.getElementById('cover');
const beginBtn = document.getElementById('begin');
const menuEl = document.getElementById('menu');
const volEl = document.getElementById('vol');
const sensEl = document.getElementById('sens');
const volOut = document.getElementById('vol-out');
const sensOut = document.getElementById('sens-out');
document.getElementById('menu-keys').innerHTML = CONTROLS;

let escSeen = 0;   // the Escape that dropped the capture never reaches keydown
let lastPhase = 'boot';
let pending = null;   // where CONTINUE / SECTION SELECT asked to be dropped

const nav = new Nav({
  save: () => Save.load(),
  audio: () => audio.ready && audio.ui(),
  canPlay: (phase) => typeof game.director['ph_' + phase] === 'function',
  onContinue: continueRun,
  onJump: jumpToMilestone,
  onClose: () => nav.hide(),
  onNew: () => { Save.clearRun(); location.reload(); },
});

/** CONTINUE CURRENT: the room you stopped in, your health, your rolled pull */
function continueRun(s) {
  pending = { sec: s.section, phase: Save.resumePhase(s.section, s.phase), resolve: s.resolve, keep: true };
  startGame();
}

/** SECTION SELECT: back to an earlier room, at full health, for a different pull */
function jumpToMilestone(m) {
  const target = { sec: m.sec, phase: m.phase, resolve: 3, keep: m.sec >= Save.ROLL_SEC };
  if (!game.started) { pending = target; startGame(); return; }
  nav.hide();
  closeMenu();
  enterRoom(target.sec, target.phase, target.resolve, target.keep);
}

function startGame() {
  if (game.started) return;
  nav.hide();
  audio.boot();
  audio.resume();
  audio.startAmbient();
  audio.ui();
  cover.classList.add('hidden');
  setTimeout(() => cover.remove(), 900);
  game.started = true;
  game.stats.t0 = performance.now();
  if (pending) enterRoom(pending.sec, pending.phase, pending.resolve, pending.keep);
  else director.begin();
  input.grab();
}

function syncMenu() {
  document.getElementById('menu-keys').innerHTML = CONTROLS;
  volEl.value = Math.round((audio.ready ? audio.master.gain.value : 0.9) * 100);
  sensEl.value = Math.round(input.lookScale * 100);
  volOut.textContent = String(volEl.value);
  sensOut.textContent = `${(sensEl.value / 100).toFixed(1)}×`;
}

function openMenu() {
  if (!game.started || game.over || game.paused) return;
  game.paused = true;
  input.release();          // a slider needs a cursor that can leave the canvas
  syncMenu();
  writeSave();              // leaving for a minute is a place to come back to
  menuEl.classList.remove('hidden');
  audio.duckAmbient(0.22, 0.3);
  audio.ui();
}

function closeMenu() {
  if (!game.paused) return;
  menuEl.classList.add('hidden');
  game.paused = false;
  audio.duckAmbient(1, 0.9);
  input.grab();             // straight back to first person
}

beginBtn.addEventListener('click', startGame);
cover.addEventListener('click', startGame);   // the whole title screen is the button
document.getElementById('replay').addEventListener('click', () => { Save.clearRun(); location.reload(); });
document.getElementById('resume').addEventListener('click', () => { audio.ui(); closeMenu(); });
document.getElementById('restart').addEventListener('click', () => { Save.clearRun(); location.reload(); });
document.getElementById('nav-open').addEventListener('click', () => { audio.ui(); nav.show('menu'); });

volEl.addEventListener('input', () => {
  if (audio.ready) audio.master.gain.value = volEl.value / 100;
  volOut.textContent = String(volEl.value);
});
sensEl.addEventListener('input', () => {
  input.setLookScale(sensEl.value / 100);
  sensOut.textContent = `${(sensEl.value / 100).toFixed(1)}×`;
});

// the audio context suspends when the tab loses focus; the first click wakes it
addEventListener('mousedown', () => audio.ready && audio.resume());
canvas.addEventListener('mousedown', () => {
  if (game.started && !game.over && !game.paused) input.grab();
});
document.addEventListener('pointerlockchange', () => {
  // while captured the browser eats the Escape keydown that ends it, so losing
  // the capture IS the pause key — and the same press must not toggle twice
  if (!input.locked && game.started && !game.over && !game.paused) {
    escSeen = performance.now();
    openMenu();
  }
});

addEventListener('keydown', (e) => {
  if (e.code === 'Enter' && nav.shown && !game.started) {
    e.preventDefault();
    const s = Save.load();
    if (s) continueRun(s);
    return;
  }
  if (!game.started && (e.code === 'Enter' || e.code === 'Space') && !nav.shown) { e.preventDefault(); startGame(); }
  if (e.code === 'Escape') {
    if (nav.shown) {                       // the panel owns the key while it is up
      if (nav.origin === 'menu') nav.hide();
      return;
    }
    if (performance.now() - escSeen < 350) return;
    e.preventDefault();
    if (game.paused) closeMenu(); else openMenu();
  }
  if (e.code === 'KeyM') { audio.ready && (audio.master.gain.value = audio.master.gain.value > 0.1 ? 0 : 0.9); }
  if (e.code === 'KeyH') hud.hint(hud.hintText ? '' : CONTROLS);
});

// closing the tab is not a knockout: the run stays where it was standing
addEventListener('pagehide', writeSave);
document.addEventListener('visibilitychange', () => { if (document.hidden) writeSave(); });

hud.hint(CONTROLS);

// a load that finds a run standing opens the hub instead of the title screen; a
// first-ever load has nothing to continue and goes straight to the cover
if (Save.load()) nav.show('boot');

requestAnimationFrame(frame);
