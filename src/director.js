import * as THREE from 'three';
import { rollRarity } from './catalyst.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));

export class Director {
  constructor(game) {
    this.g = game;
    this.phase = 'boot';
    this.section = 1;
    this.t = 0;
    this.time = 0;
    this.queue = [];
    this.opts = { canLook: false, canLean: false, threat: null, moveSpeed: 0 };
    this.forceSide = null;
    this.strain = 0;
    this.grabTimer = 0;
    this.march = 0;
    this.pipeArmed = false;
    this._blackT = 0;
    this.silo = game.silo;
    this.core = game.core;
    this.enforcers = game.enforcers;
    this.troopers = game.troopers;
    this._lastSafe = new THREE.Vector3();
    // the player asks the current floor what counts as solid
    this.opts.clamp = (pos) => this.g.env.clamp(pos);
  }

  // ---------- helpers ----------
  after(sec, fn) { this.queue.push({ at: this.t + sec, fn }); }
  say(who, text, hold = 4.5) { this.g.hud.caption(who, text, { hold }); }
  think(text, hold = 5) { this.g.hud.caption('', text, { think: true, hold }); }
  prompt(html) { this.g.hud.prompt(html); }

  /** the loudspeaker voice: a chime, a gated squawk, and a line of copy */
  announce(text, hold = 5, who = 'OUTER RING · INTERCOM') {
    this.audio.chime();
    this.audio.pa(hold * 0.78);
    this.say(who, text, hold);
  }

  goto(phase) {
    this.phase = phase;
    this.t = 0;
    this.queue.length = 0;
    const fn = this['ph_' + phase];
    if (!fn) return;
    fn.call(this, 0);            // t === 0 means "on enter"
  }

  get player() { return this.g.player; }
  /** the world stands still while you are on the floor */
  get blacked() { return this._blackT > 0; }
  get world() { return this.g.world; }
  /** whichever environment is currently on screen: cell walls or catwalk */
  get env() { return this.g.env; }
  get audio() { return this.g.audio; }
  get hud() { return this.g.hud; }
  get input() { return this.g.input; }
  get guards() { return this.g.guards; }
  /** the enforcers march on one clock, so their boots land together */
  get ringTh() { return this.silo.ring(this.player.root.position).th; }

  // ---------- phases ----------
  begin() { this.goto('awaken'); }

  ph_awaken(dt) {
    if (dt === 0) {
      this.player.yaw = 0.24; this.player.pitch = -0.06;
      this.opts.canLook = false; this.opts.canLean = false;
      this.opts.moveSpeed = 0;
      this.hud.darkness(1);
      const lines = [
        [1.2, 'The taste of copper comes back first.'],
        [5.4, 'Concrete. Cold, stained with old oil. Amber light cutting through the fog.'],
        [9.2, 'A plastic cup. A cigarette butt, still smoking.'],
        [12.6, 'You try to lift your hand to your face. You can’t.'],
        [16.4, 'Zip-ties behind your back. Ankles lashed to a fabrication chair. The chair bolted down.'],
        [20.6, 'They’re gone. Shattered glass, shouting, your sister’s hand slipping out of yours.'],
      ];
      for (const [at, txt] of lines) this.after(at, () => this.think(txt, 5.4));
      // the mouse comes back before the room does — a dead cursor in the dark
      // reads as a broken game, not as a man who cannot see
      this.after(3.4, () => { this.opts.canLook = true; });
      this.after(13.6, () => this.prompt('<b>LMB</b> / <b>RMB</b> — THERE IS NO FREE HAND. YOU SWING THE CHAIR.'));
      this.after(15.4, () => { this.opts.canLean = true; this.prompt('<b>W A S D</b> — YOU CANNOT WALK. YOU CAN ROCK.'); });
      this.after(23.0, () => this.prompt(null));
      this.after(24.4, () => { this.audio.screech(1.5); this.goto('approach'); });
      return;
    }
    this.hud.darkness(clamp01(1 - (this.t - 0.6) / 4.6));
    this.hud.blur(16 * clamp01(1 - (this.t - 1.2) / 7.5));
    const rate = Math.max(0.62, 1.35 - this.t * 0.012);
    this.beatTimer = (this.beatTimer ?? 0) + dt;
    if (this.beatTimer > rate) {
      this.beatTimer = 0;
      this.audio.heartbeat(this.t < 10 ? 1.25 : 0.85);
      if (Math.random() < 0.5) this.audio.breath(1.1);
    }
    if (this.input.pressed('Enter')) this.t = 23.0;   // skip the slow part
  }

  ph_approach(dt) {
    const [bruiser, second] = this.guards;
    if (dt === 0) {
      this.opts.canLook = true; this.opts.canLean = true;
      this.grabTimer = 0;
      this.hud.blur(0);
      this.audio.screech(1.4);
      this.world.doorPivot.rotation.y = -0.58;
      bruiser.root.visible = true;
      bruiser.baton.visible = false;
      bruiser.ko = false; bruiser.stagger = 0; bruiser.landed = false;
      bruiser.root.position.set(-0.15, 0, -5.4);
      bruiser.root.rotation.set(0, 0, 0);
      bruiser.setMode('enter');
      bruiser.goTo(0.02, -1.12);
      second.root.visible = true;
      second.baton.visible = false;
      second.root.position.set(1.4, 0, -4.5);
      second.setMode('stalk');
      this.prompt(null);
      this.say('THE BRUISER', 'Look at that.', 3.4);
      this.after(2.6, () => this.say('THE BRUISER', 'The prodigal child is finally awake.', 4.2));
      this.after(7.8, () => { if (!bruiser.ko) bruiser.setMode('lean'); });
      this.after(8.8, () => this.say('THE BRUISER', 'Your brothers and sisters are already halfway across the district boundary.', 4.8));
      this.after(13.8, () => this.say('THE BRUISER', 'You’re going to tell me exactly who told you to follow them.', 4.6));
      this.after(18.2, () => this.say('THE BRUISER', 'Or I start snapping fingers.', 4));
      this.after(20.4, () => this.grabWindow());
      return;
    }
    this.opts.threat = bruiser.ko ? null : bruiser.distanceTo(this.player.root.position);
    if (this.grabTimer > 0) {
      this.grabTimer -= dt;
      if (this.grabTimer <= 0) this.snapped();
    }
  }

  grabWindow() {
    const bruiser = this.guards[0];
    if (bruiser.ko || this.phase !== 'approach') return;
    bruiser.setMode('grab');
    this.grabTimer = 3.6;
    this.prompt('<b>S</b> — LOAD YOUR WEIGHT BACK  ·  <b>RMB</b> — DRIVE UP THROUGH HIS GUARD');
    this.think('He reaches for your jaw. He is careless. Twelve inches, and one fist.', 4.4);
  }

  snapped() {
    const bruiser = this.guards[0];
    if (bruiser.ko) return;
    this.prompt(null);
    this.audio.snap();
    this.g.addHitstop(0.09);
    this.g.addTrauma(1.15);
    this.g.dmgPulse = 1;
    this.g.stats.taken++;
    this.player.damage(1);
    this.world.burst(this.player.headWorld(new THREE.Vector3()), 12, [0.6, 0.05, 0.04], 0.7, 1.6, 0.6);
    this.say('THE BRUISER', 'That’s one.', 3);
    this.think('A white ring of pain. He leans back in again.', 3.4);
    bruiser.setMode('lean');
    if (this.player.resolve <= 0) { this.blackout('approach'); return; }
    this.after(2.8, () => this.grabWindow());
  }

  ph_strike(dt) {
    const [bruiser, second] = this.guards;
    if (dt === 0) {
      this.prompt(null);
      this.grabTimer = 0;
      this.think('The impact is deafening. His head snaps back and his legs go limp.', 3.8);
      this.after(3.6, () => this.say('THE SECOND GUARD', '…', 1.2));
      this.after(4.6, () => { second.setMode('shock'); });
      this.after(5.6, () => this.say('THE SECOND GUARD', 'You psycho.', 3));
      this.after(7.6, () => this.say('THE SECOND GUARD', 'I’m going to break both your legs for that.', 3.8));
      this.after(10.2, () => this.goto('escalate'));
      return;
    }
    this.opts.threat = second.root.visible ? second.distanceTo(this.player.root.position) : null;
  }

  ph_escalate(dt) {
    const second = this.guards[1];
    if (dt === 0) {
      this.freePrompt = false;
      second.hasBaton = true;
      second.baton.visible = true;
      second.overextended = false;
      second.stagger = 0;
      second.ko = false;
      second.landed = false;
      second.root.position.set(1.1, 0, -4.2);
      second.root.rotation.set(0, 0, 0);
      second.setMode('rush');
      second.goTo(-0.34, -1.12);
      this.prompt('<b>A</b> / <b>D</b> — YOU CAN’T STEP ASIDE. SLAM YOUR WEIGHT INTO THE LEAN.');
      this.think('He comes in with the nightstick high.', 3.6);
      this.audio.creak(1.4);
      return;
    }
    this.opts.threat = second.ko ? null : second.distanceTo(this.player.root.position);
    if (second.ko && this.phase === 'escalate') {
      if (!this.freePrompt) {
        this.freePrompt = true;
        this.prompt('<b>Z</b> — USE THE WOOD. HOLD Z TO BREAK THE ZIP-TIES.');
        this.think('His nightstick is lying inches from your pinned feet. You can use the broken wood to free yourself.', 4.2);
        this.after(1.6, () => this.say('THE SECOND GUARD', 'Nnngh — get off me —', 3));
      }
      // Start as soon as Z is held, so the same continuous hold also strains the ties.
      // Requiring a separate key press here made the opening feel like Z was ignored.
      if (this.input.down('KeyZ')) { this.audio.creak(0.8); this.goto('freedom'); }
    }
    if (this.player.resolve <= 0) this.blackout('escalate');
  }

  ph_freedom(dt) {
    const { player, audio } = this;
    if (dt === 0) {
      this.prompt('<b>Z</b> — TWIST THE WOOD. HOLD IT.');
      this.think('The plastic strains. It turns white under the pressure.', 4.4);
      this.strain = 0;
      player.tieStrain = 0;
      return;
    }

    if (player.state === 'wristsFree') {
      if (this.input.pressed('KeyZ')) {
        player.state = 'free';
        player.busy = 0.8;
        audio.snap(); audio.creak(0.6);
        this.g.addTrauma(0.5);
        this.opts.moveSpeed = 1.5;
        this.prompt('<b>W A S D</b> — WALK. THE DISTRICT IS OUT THERE.');
        this.say('', 'You rip the bindings from your ankles. You stand up on shaking legs.', 5);
        player.pitch = -0.15;
        this.after(3.6, () => this.think('Two men groaning on the concrete. You tower over them.', 4.6));
      }
      return;
    }

    if (player.state === 'free') {
      const d = Math.hypot(player.root.position.x - 0, player.root.position.z + 6.2);
      if (d < 2.0 && !this._doorPrompt) {
        this._doorPrompt = true;
        this.prompt('<b>E</b> — PUSH THE IRON DOOR OPEN');
      }
      if (d < 2.0 && this.input.pressed('KeyE')) this._end();
      return;
    }

    const hold = this.input.down('KeyZ');
    const tap = this.input.pressed('KeyZ');
    if (hold || tap) {
      this.strain += hold ? dt * 0.85 : 0.17;
      player.tieStrain = clamp01(0.25 + this.strain / 2.2);
      if (!this._strainSfx || this.time - this._strainSfx > 0.36) { this._strainSfx = this.time; audio.strain(); }
      if (this.strain > 0.6) player.addImpulse((Math.random() - 0.5) * 0.35, 0.25);
    } else {
      player.tieStrain = Math.max(0, player.tieStrain - dt * 0.5);
    }
    if (this.strain >= 2.2) {
      audio.snap(); audio.creak(0.5);
      this.g.addHitstop(0.06);
      this.g.addTrauma(0.75);
      player.tie.visible = false;
      player.tieStrain = 0;
      player.state = 'wristsFree';
      player.addImpulse(0, -0.8);
      this.world.burst(player.body.localToWorld(new THREE.Vector3(0, 0.25, 0.3)), 12, [0.85, 0.85, 0.9], 0.8, 1.8);
      this.prompt('<b>Z</b> — STAND UP');
      this.say('', 'The plastic snaps. Your hands are free.', 4.2);
    }
  }

  // ============ SECTION TWO · THE OUTER RING =============================
  //
  // The cell was a fight you could only win by being strapped to a chair. Out
  // here you can walk, and it is worse: the enforcers carry riot shields, so
  // your fists stop being an answer and the floor stops being a promise.

  ph_breach(dt) {
    const silo = this.silo;
    if (dt === 0) {
      this.section = 2;
      this.g.setEnv('silo');
      this.hud.darkness(1);
      this.hud.blur(14);
      silo.setAlarm(0);
      silo.openSteam(0);
      silo.steam = 0;
      const p = this.player;
      p.falling = false; p.vy = 0; p.pitch = -0.04; p.lean.set(0, 0); p.leanV.set(0, 0);
      const th = 0.09;
      silo.deckAt(th, 23.5, p.root.position);
      p.aimYaw(-(Math.PI / 2 + th));
      this._lastSafe.copy(p.root.position);
      this.opts.canLook = true; this.opts.canLean = true;
      this.opts.threat = null; this.opts.moveSpeed = 0;
      const lines = [
        [0.6, 'Air moving sideways. A shaft this deep keeps its own weather.'],
        [4.4, 'A grating ring. Four metres to the wall, sixty to the bottom, and no bottom.'],
        [8.6, 'The far half of the catwalk fell years ago. It is still falling.'],
        [13.0, 'Your brothers and sisters went out through the middle. Someone sealed the ring behind them.'],
        [17.4, 'Two of them did not make it to the other side of the door.'],
      ];
      for (const [at, txt] of lines) this.after(at, () => this.think(txt, 5.6));
      this.after(6.2, () => { this.hud.blur(0); this.opts.moveSpeed = 3.2; });
      this.after(7.4, () => this.prompt('<b>W A S D</b> — YOU CAN WALK NOW. RUN CLOCKWISE, AWAY FROM THE SEALED DOOR.'));
      this.after(12.0, () => this.prompt('<b>SHIFT</b> — BRACE · <b>SPACE</b> — nothing left to strain'));
      this.after(15.0, () => this.prompt(null));
      this.after(16.0, () => { this.audio.screech(1.1); this.goto('sprint'); });
      return;
    }
    this.hud.darkness(clamp01(1 - (this.t - 0.6) / 4.2));
    this._deckCheck(dt);
  }

  ph_sprint(dt) {
    const silo = this.silo;
    if (dt === 0) {
      this.opts.moveSpeed = 3.9;
      silo.setAlarm(0.4);
      this.prompt('<b>W</b> — THE RING RUNS CLOCKWISE · KEEP GOING');
      this.after(1.2, () => this.announce('Ring four. Blast doors cycling. Clear the deck.', 4.6));
      this.after(6.4, () => { this.audio.siren(2); this.think('The sirens are not for you. They are for whatever the doors are keeping in.', 4.6); });
      this.after(11.0, () => this.think('Voices, down the intersecting corridor, coming out onto the grating.', 4.2));
      return;
    }
    // the doors grind down behind you, one per arc of running: you are herded
    const th = this.ringTh;
    for (let i = 0; i < silo.doors.length; i++) {
      const dr = silo.doors[i];
      if (!dr.closing && th > dr.th + 0.08) {
        silo.sealDoor(i);
        this.audio.grind(1.5 + i * 0.1);
        this.g.addTrauma(0.28);
      }
    }
    if (th > 1.02) { this.goto('wall'); return; }
    if (th < 0.2 && this.t > 6) this.prompt('<b>W</b> — FORWARD. THE BRIDGE IS PAST THE VALVE.');
    this._deckCheck(dt);
  }

  ph_wall(dt) {
    const silo = this.silo;
    if (dt === 0) {
      this.opts.moveSpeed = 3.6;
      silo.setAlarm(1);
      silo.showGlint(true);
      this.pipeArmed = true;
      // coming back here without the steam is the line reforming around you —
      // it is not a new wall, and the men you already dropped stay dropped
      if (this.wallSpawned) {
        this.audio.clang();
        this.think('The pressure is gone. The shields come back up and the line closes again.', 4.2);
        this.prompt('<b>RMB</b> — THE BRASS FEED PIPE · IT IS THE ONLY THING HERE YOU CAN HURT');
        return;
      }
      this.spawnWall();
      this.audio.clang();
      this.after(0.5, () => this.say('THE ENFORCER', 'Ring four is closed to you.', 3.6));
      this.after(4.2, () => this.say('THE ENFORCER', 'Stand facing the wall. Hands where we can see them.', 4));
      this.after(8.0, () => this.think('Shields locked. They walk like one animal, and they do not open.', 4.6));
      this.after(10.5, () => this.prompt('<b>MOUSE</b> — LOOK FOR THE BRASS FEED PIPE ON THE WALL. IT IS THE ONLY THING HERE WITHOUT ARMOUR ON IT.'));
      this.prompt('<b>A</b> / <b>D</b> — SLIP PAST THE LINE · <b>MOUSE</b> — FIND THE BRASS');
      return;
    }
    this.march += dt * 4.4;
    const p = this.player;
    let nearest = null, nd = Infinity;
    for (const e of this.enforcers) {
      if (e.ko) continue;
      e.goTo(p.root.position.x, p.root.position.z);
      // the line follows you everywhere the deck is; the shaft is not one of them
      this.env.clamp(e.root.position);
      const d = e.distanceTo(p.root.position);
      if (d < nd) { nd = d; nearest = e; }
    }
    this.opts.threat = nearest ? nd : null;
    this._press(dt);
    this._steamCheck(dt);
    this._deckCheck(dt);
    if (this.ringTh > 1.56 && !this._edgeWarn) {
      this._edgeWarn = true;
      this.think('The grating stops. Beyond it there is only the shaft.', 3.4);
      this.prompt('<b>←</b> / <b>→</b> — TURN: THE BRASS PIPE, ON THE WALL BEHIND THEM');
    }
    // the clever route out across the span leads to a console that is not yours
    // yet, and it should say so rather than leave you standing in dead air
    if (!this._platSaid || this.time - this._platSaid > 14) {
      if (p.root.position.distanceTo(silo.platformWorld(this._pw || (this._pw = new THREE.Vector3()))) < 3.4) {
        this._platSaid = this.time;
        this.think('The console wants a handprint the size of a child’s. Nothing you have fits it.', 4.4);
        this.prompt('<b>←</b> / <b>→</b> — BACK ONTO THE RING: THE BRASS PIPE IS THE WAY');
      }
    }
  }

  ph_scald(dt) {
    const silo = this.silo;
    if (dt === 0) {
      this.opts.moveSpeed = 3.5;
      this.prompt('<b>LMB</b> / <b>RMB</b> — THE SHIELD IS ON THE GRATING. KNEE FIRST, THEN JAW.');
      this.think('Scalded men do not hold a line.', 4);
      this.g.addTrauma(0.7);
      this.after(0.2, () => { this.audio.screech(0.9); });
      return;
    }
    const p = this.player;
    let nearest = null, nd = Infinity;
    for (const e of this.enforcers) {
      if (e.ko) continue;
      const d = e.distanceTo(p.root.position);
      if (d < nd) { nd = d; nearest = e; }
    }
    this.opts.threat = nearest ? nd : null;
    if (this.enforcers.every((e) => e.ko)) {
      if (!this.wallCleared) {
        this.wallCleared = true;
        this.prompt(null);
        this.audio.siren(1);
        this.think('Both of them are on the grating. The line is open.', 4.4);
      }
      if (this.t > 3.2) { this._edgeWarn = false; this.goto('bridge'); }
      return;
    }
    // the pressure bleeds off, and so does the excuse
    if (silo.steam <= 0) {
      for (const e of this.enforcers) if (!e.ko) e.setMode('wall');
      this.spawnGlint();
      this.goto('wall');
    }
    // the man still behind the shield has not been met by the jet yet
    this._steamCheck(dt);
    this._deckCheck(dt);
  }

  ph_bridge(dt) {
    const silo = this.silo;
    if (dt === 0) {
      this.opts.moveSpeed = 3.7;
      silo.setAlarm(0.75);
      silo.showGlint(false);
      this.pipeArmed = false;
      this.prompt('<b>W</b> — THE BRIDGE · NO RAIL ON THE UNDERSIDE');
      this.after(1.0, () => this.think('A span of grating out to the middle of the shaft, on four cables older than you are.', 5));
      this.after(6.0, () => this.announce('Ring four clear. Platform two is unattended.', 4.4));
      this.after(10.5, () => this.prompt('<b>E</b> — TAKE THE SATCHEL OFF THE CONSOLE'));
      return;
    }
    const p = this.player;
    const sw = silo.satchelWorld(this._sw || (this._sw = new THREE.Vector3()));
    // the bag sits on the console top, a metre up: across the floor is what counts
    const d = Math.hypot(p.root.position.x - sw.x, p.root.position.z - sw.z);
    if (d < 2.6 && !this._bagPrompt) {
      this._bagPrompt = true;
      this.prompt('<b>E</b> — PICK IT UP');
      this.think('A school satchel, strap undone, exactly the size of the one your little sister carries.', 4.8);
    }
    if (d < 2.6 && this.input.pressed('KeyE')) { this._bag(); return; }
    this._deckCheck(dt);
  }

  _bag() {
    const { audio } = this;
    this.prompt(null);
    this.opts.moveSpeed = 0;
    audio.grabBag();
    this.g.addTrauma(0.3);
    this.say('', 'You lift it. It is heavier than a child’s bag should be, and it is warm.', 4.2);
    this.after(1.2, () => this.goto('crossing'));
  }

  /** Chapter One, end of Section Four: the card is the chapter, not the room */
  _final() {
    const { audio } = this;
    const cat = this.g.catalyst;
    this.prompt(null);
    this.opts.moveSpeed = 0;
    this.opts.threat = null;
    this.hud.blur(3);
    this.g.flashV = 0.8;
    audio.flood();
    audio.setRift(0.7, 1.6);
    this.after(1.4, () => this.hud.darkness(0.85));
    this.after(3.0, () => {
      const s = this.g.stats;
      const secs = (performance.now() - (s.t0 || performance.now())) / 1000;
      document.getElementById('end-kicker').textContent =
        'CHAPTER ONE · THE CELL, THE OUTER RING, THE TURBINE CROSSING AND THE ANOMALY CORE — CLEAR';
      document.getElementById('end-title').innerHTML =
        'THE PODS ARE OPEN.<br><em>SO IS THE WAY OUT.</em>';
      document.getElementById('stats').textContent =
        `${secs.toFixed(0)}s · ${s.hits} clean strikes · ${s.misses} whiffs · ${s.uppercuts} loaded ` +
        `uppercuts · ${s.hurled} scouts thrown into the shaft · ${this.troopersDown || 0} troopers dropped` +
        ` · ${s.taken} hits taken` +
        (cat.def ? ` · PULL: ${cat.def.tier} ${cat.def.name}` : '');
      document.getElementById('endcard').classList.remove('hidden');
      this.g.over = true;
      audio.duckAmbient(0.2, 1.2);
    });
  }

  // ============ SECTION FIVE · CARGO ENTRY ===============================
  ph_cargo(dt) {
    const p = this.player;
    if (dt === 0) {
      this.section = 5;
      this.g.setEnv('silo');
      this.opts.canLook = true;
      this.opts.canLean = true;
      this.opts.moveSpeed = 3.2;
      this.opts.threat = null;
      this.opts.clamp = (pos) => this.silo.clamp(pos);
      this.silo.platformOnly = true;
      this.silo.cargoEntryMode = true;
      this.silo.setVisible(true);
      this.silo.elevator.visible = true;
      this.silo.elevator.position.set(0, 0, 0);
      this.silo.elevator.userData.shut = 0;
      this.silo.elevator.userData.closing = false;
      // Reset the call panel whenever Cargo Entry is entered or restarted.
      const cargoLift = this.silo.elevator.userData;
      cargoLift.cargoPressed = false;
      if (cargoLift.cargoGlow) cargoLift.cargoGlow.intensity = 0;
      if (cargoLift.cargoButtonMat) {
        cargoLift.cargoButtonMat.emissive.setHex(0x5a3218);
        cargoLift.cargoButtonMat.emissiveIntensity = 0.2;
      }
      for (const door of cargoLift.cargoDoors || []) {
        door.material.emissive.setHex(0x17191a);
        door.material.emissiveIntensity = 0.12;
      }
      p.root.position.set(0, 0, 5.2);
      p.aimYaw(Math.PI);
      this.hud.darkness(1);
      this.hud.blur(8);
      this.after(0.5, () => this.hud.darkness(0));
      this.after(1.4, () => this.hud.blur(0));
      this.announce('CHAPTER ONE · SECTION FIVE — CARGO ENTRY', 4.2, 'THE FACILITY · INTERCOM');
      this.after(2.2, () => this.think('The gate opens onto a freight gantry. Below it, the cargo lift waits with its doors half-open. The air smells of rain, hot brakes and diesel.', 5.4));
      this.after(7.2, () => this.prompt('<b>W A S D</b> — CROSS THE GANTRY  ·  <b>E</b> — BOARD THE FREIGHT LIFT'));
      return;
    }
    this.opts.threat = null;
    const liftPos = this.silo.elevator.position;
    const distance = Math.hypot(p.root.position.x - liftPos.x, p.root.position.z - liftPos.z);
    const liftData = this.silo.elevator.userData;
    if (!liftData.cargoPressed && distance < 7.5) {
      this.prompt('<b>E</b> — ENTER FREIGHT ELEVATOR');
    } else if (!liftData.cargoPressed && distance >= 7.5) {
      this.prompt(null);
    }
    if (!liftData.cargoPressed && distance < 7.5 && this.input.pressed('KeyE')) {
      liftData.cargoPressed = true;
      liftData.cargoGlow.intensity = 2.2;
      liftData.cargoButtonMat.emissive.setHex(0xff7a22);
      liftData.cargoButtonMat.emissiveIntensity = 0.65;
      for (const door of liftData.cargoDoors) {
        door.material.emissive.setHex(0x8a3510);
        door.material.emissiveIntensity = 0.28;
      }
      this.prompt(null);
      this.opts.moveSpeed = 0;
      this.audio.clang();
      this.g.addTrauma(0.12);
      this.say('', 'The elevator control lights up. The heavy doors begin to close.', 4.8);
      this.after(1.6, () => {
        // Do not leave the player permanently locked while the Chapter Two
        // descent sequence is still being built.
        this.opts.moveSpeed = 3.2;
      });
      this.after(2.8, () => this.announce('FREIGHT LIFT CALLED. DESCENT PREPARING.', 4.2, 'THE FACILITY · INTERCOM'));
      this.after(5.2, () => this.think('The freight lift is ready for the descent.', 5));
    }
  }

  // ============ SECTION THREE · THE TURBINE CROSSING =======================
  //
  // The ring is behind you and the door is shutting. Everything the facility
  // has left comes down an overhead cable at speed, and the only exit is a hole
  // in the middle of the floor with three storeys of blades turning under it.
  // The fight is not about hurting them. It is about joining their momentum at
  // the exact moment it is pointed somewhere fatal.

  ph_crossing(dt) {
    const silo = this.silo;
    const p = this.player;
    const off = this.g.officer;
    if (dt === 0) {
      this.section = 3;
      this.g.setControls('turbine');
      this.opts.moveSpeed = 0;
      this.opts.canLook = true;
      this.opts.canLean = true;
      this._looking = false;
      this._leapDone = false;
      silo.setAlarm(1);
      silo.platformOnly = true;
      for (let i = 0; i < silo.doors.length; i++) silo.sealDoor(i);
      // the men you left on the grating are still there, and still cannot see
      for (const e of this.enforcers) if (!e.ko) e.setMode('groan');
      this.audio.startTurbine();

      const spot = silo.officerSpot(this._os || (this._os = new THREE.Vector3()));
      off.root.visible = true;
      off.ko = false; off.koT = 0; off.stagger = 0; off.landed = false;
      off.root.position.set(spot.x, 0, spot.z);
      off.root.rotation.set(0, 0, 0);
      const hw = silo.hatchWorld(this._hw || (this._hw = new THREE.Vector3()));
      off.goTo(hw.x, hw.z);
      off.mode = 'offscreen';            // so setMode actually re-enters
      off.setMode('stalk');

      p.fobRate = 0;
      this.think('Someone else is standing at that console, and he has already seen you.', 4.6);
      this.after(0.5, () => this.say('THE FACILITY OFFICER', 'No — no, no, no, it wasn’t me —', 3));
      this.after(2.0, () => {
        off.setMode('flee');
        this.audio.metalStep(1.2);
      });
      this.after(3.4, () => { silo.openHatch(); this.audio.doorHiss(0.7); });
      this.after(4.6, () => { this.audio.hatchSlam(); silo.closeHatch(); this.g.addTrauma(0.4); });
      this.after(5.4, () => this.think('He is gone, and the lid is down behind him. Whatever he was afraid of, he left it up here with you.', 5.2));
      this.after(7.6, () => { this.audio.siren(2); this.announce('Containment protocol engaged. Sector four is sealed.', 4.6); });
      this.after(9.6, () => {
        this.audio.ironShriek(2.4);
        silo.slamElevator();
        this.g.addTrauma(0.5);
      });
      this.after(11.9, () => {
        this.g.addTrauma(1.6);
        this.g.flashV = 0.55;
        this.input.rumble(1, 320);
        this.think('The elevator door comes down like a guillotine and the whole ring feels it. That was the last door that opened.', 5.4);
      });
      this.after(12.6, () => { this.opts.moveSpeed = 3.4; });
      this.after(14.4, () => this.say('THE CONSOLE', 'SIBLING COUNT: 4. PROCESSING: 4. GATE 2 CYCLE: OPEN.', 5));
      this.after(16.4, () => this._openBag());
      return;
    }

    if (this._looking) {
      // the head goes down whether you want it to or not: the fob has your attention
      p.pitch = THREE.MathUtils.damp(p.pitch, -0.6, 2.4, dt);
      p.aimYaw(Math.atan2(p.root.position.x, p.root.position.z));
    }
    this._fobPing(dt, 1.1);
  }

  /** the bag comes open, and what is in it is not a way out — it is a direction */
  _openBag() {
    const { silo, audio, player: p } = this;
    this.opts.moveSpeed = 0;
    audio.grabBag();
    silo.satchel.visible = false;
    p.satchelWorn.visible = true;
    p.fob.visible = true;
    p.fobRate = 0.4;
    audio.fobPing(0.4);
    this.say('', 'You pull the strap tight across your shoulder. Inside the flap, something is already blinking.', 5.2);
    this.after(2.8, () => {
      p.fobRate = 0.78;
      this.think('A tracking fob. The kind they sew into a collar. It is pointing somewhere, hard.', 4.8);
    });
    this.after(5.8, () => { p.fobRate = 1; this.think('Not at the gate. Not at the district. Straight down.', 4.2); });
    this.after(8.2, () => this._reveal());
  }

  /** look over the rail: the shaft, the blades, and the grates nobody closed */
  _reveal() {
    const { silo, audio, player: p } = this;
    this._looking = true;
    this.opts.canLook = false;
    this.opts.moveSpeed = 0;
    silo.surgeTurbine(1);
    audio.setTurbine(1.3, 1.6);
    audio.abyss(3);
    this.g.addTrauma(0.7);
    this.hud.blur(2);
    this.think('Three storeys of blades, turning over in the dark, pulling the whole lower deck’s air down with them.', 5.6);
    this.after(3.6, () => this.think('The maintenance grates are standing wide open. Nobody closed them. Nobody was going to.', 5));
    this.after(7.2, () => {
      this._looking = false;
      this.opts.canLook = true;
      this.opts.moveSpeed = 3.4;
      this.hud.blur(0);
      this.think('The door is shut. The ring is sealed. The only way out of this sector is down.', 4.6);
      this.prompt('<b>W A S D</b> — MOVE · THE FOB WILL NOT STOP SCREAMING AT THE FLOOR');
    });
    this.after(9.8, () => { this.audio.doorHiss(1.3); this.prompt(null); });
    this.after(10.6, () => {
      this.think('Behind you, the wall hisses.', 2.6);
      this.after(2.0, () => this.goto('scouts'));
    });
  }

  ph_scouts(dt) {
    const silo = this.silo;
    const p = this.player;
    if (dt === 0) {
      this.opts.moveSpeed = 3.4;
      this.opts.canLook = true;
      this.opts.canLean = true;
      this.scoutsDown = 0;
      this.bladeDone = this.bladeDone || new Set();
      this.spawnScouts();
      silo.setAlarm(1);
      this.audio.siren(1);
      this.prompt('<b>A</b> / <b>D</b> — BE SOMEWHERE ELSE WHEN HE DASHES · <b>RMB</b> — ONLY WHILE HE IS OFF BALANCE');
      this.after(2.6, () => this.say('THE LEAD SCOUT', 'Target cornered on the central platform.', 3.4));
      this.after(6.4, () => this.say('THE LEAD SCOUT', 'Isolate and terminate.', 2.8));
      this.after(9.4, () => this.think('No batons. No shields. Weighted steel on their fists and springs on their heels.', 4.6));
      this.after(14.0, () => this.think('They are faster than you and they know it. Every dash is a bet that you will still be standing where you were.', 5.6));
      return;
    }

    this._fobPing(dt, 0.9);

    // one at a time, and nobody commits while a squadmate is already off balance.
    // Three simultaneous dashes across a six-metre platform is not a fight, it is
    // a coin toss — and if the others keep coming you never get to use the overrun
    // you just earned, which is the only thing you have.
    let busy = 0;
    for (const s of this.g.scouts) {
      if (!s.ko && (s.mode === 'coil' || s.mode === 'dash' || s.vulnerable)) busy++;
    }
    for (const s of this.g.scouts) {
      s.holdOff = busy > 0 && s.mode !== 'coil' && s.mode !== 'dash' && !s.vulnerable;
    }

    let nearest = null, nd = Infinity;
    for (const s of this.g.scouts) {
      if (s.mode === 'offscreen' && !s.ko) continue;
      if (!s.ko) {
        // the rail and the kerb are invisible walls to everyone but the dead
        this.env.clamp(s.root.position);
        const r = Math.hypot(s.root.position.x, s.root.position.z);
        // overran into the outer rail: he catches it with both hands
        if (s.mode === 'stagger' && r > 4.9) s.setMode('slip');
        const d = s.distanceTo(p.root.position);
        if (d < nd) { nd = d; nearest = s; }
      } else if (s.root.position.y < -8 && !this.bladeDone.has(s)) {
        this.bladeDone.add(s);
        this._chewed(s);
      }
    }
    this.opts.threat = nearest ? nd : null;

    if (this.scoutsDown >= 3) { this.goto('leap'); return; }
    if (p.resolve <= 0) this.blackoutSilo('scouts');
  }

  /** three of them came down the cable; they come off it faster */
  spawnScouts() {
    const silo = this.silo;
    const spot = this._ds || (this._ds = new THREE.Vector3());
    for (const [i, s] of this.g.scouts.entries()) {
      silo.dropSpot(i, spot);
      s.ko = false; s.koT = 0; s.stagger = 0; s.landed = false; s.flinch = 0;
      s.groundY = 0;
      s.v.set(0, 0, 0);
      s.root.position.set(spot.x, 11.2, spot.z);
      s.root.rotation.set(0, 0, 0);
      s.root.visible = false;
      s.mode = 'circle';                 // so setMode actually re-enters
      s.setMode('offscreen');
      this.after(0.4 + i * 0.55, () => {
        silo.sparkTrolley(i);
        this.audio.exoWhine(0.6);
        s.setMode('drop');
      });
    }
  }

  /** the fob talks on its own clock, and the clock runs faster the closer the
   *  answer gets. Silence about it would read as a dead prop. */
  _fobPing(dt, gap) {
    const p = this.player;
    if (!p.fob.visible) return;
    const r = p.fobRate;
    this._pingAt = (this._pingAt || 0) + dt;
    const g = gap * (1.3 - r * 0.78);
    if (this._pingAt >= g) { this._pingAt = 0; this.audio.fobPing(r); }
  }

  /** the shaft takes what the platform throws at it */
  _chewed(s) {
    const silo = this.silo;
    this.scoutsDown++;
    s.root.visible = false;
    silo.bladeBurst(s.root.position.clone().setY(-10));
    silo.surgeTurbine(1);
    this.audio.bladeChew();
    this.audio.setTurbine(1.6, 0.25);
    this.after(1.8, () => this.audio.setTurbine(1.05, 2.2));
    this.g.addHitstop(0.14);
    this.g.addTrauma(1.6);
    this.g.flashV = 0.75;
    // mirrors this attempt's count, not a session total: a retry must not bank
    // throws from a life that ended
    this.g.stats.hurled = this.scoutsDown;
    this.input.rumble(1, 300);
    const left = 3 - this.scoutsDown;
    if (left === 2) this.think('The blades do not slow down. They were not designed to.', 3.6);
    if (left === 1) this.think('Two of them left, and the shaft is still hungry.', 3.4);
    if (left === 0) {
      this.prompt(null);
      this.think('The platform is quiet again, except for ninety metres of turning steel.', 4.4);
    }
  }

  /** a scout that connects: weighted knuckles, at the end of a seven-metre dash */
  onLunge(guard, payload) {
    const p = this.player;
    const dx = p.root.position.x - payload.aim.x;
    const dz = p.root.position.z - payload.aim.z;
    guard.lungeLanded = Math.hypot(dx, dz) < 0.85;
    this.audio.whoosh(1.7);
    if (!guard.lungeLanded) {
      this.audio.exoStep(0.9);
      this.g.addTrauma(0.45);
      p.desperation = Math.min(1, p.desperation + 0.24);
      if (!this._dodgeLine || this.time - this._dodgeLine > 3.6) {
        this._dodgeLine = this.time;
        this.think('He goes past you and keeps going. Exo-boots cannot stop on a six-metre platform.', 3.6);
        this.prompt('<b>RMB</b> — NOW. HE IS OFF BALANCE AND HE KNOWS IT.');
      }
      return;
    }
    this.audio.knuckle();
    const hurt = p.damage(1);
    // he drives you along his own line, toward whatever is behind you
    p.root.position.x += payload.dir.x * 0.7;
    p.root.position.z += payload.dir.z * 0.7;
    this.env.clamp(p.root.position);
    if (!hurt) {
      // you are still reeling from the last one, so this only moves you
      this.g.addHitstop(0.05);
      this.g.addTrauma(0.75);
      this.think('A second pair of knuckles finds the same place. You are still upright, so it does not count.', 3.4);
      return;
    }
    this.g.stats.taken++;
    this.g.dmgPulse = 1;
    this.g.addHitstop(0.1);
    this.g.addTrauma(1.35);
    this.silo.burst(p.headWorld(new THREE.Vector3()), 14, [0.62, 0.06, 0.05], 0.8, 2.2, 0.8);
    const lines = [
      'Steel knuckles across the jaw. Your vision goes white and comes back red.',
      'You were half a step short. He was not short at all.',
      'The platform is six metres across and he just used all of it on you.',
    ];
    this.think(lines[(this.g.stats.taken - 1) % lines.length], 3.6);
    this.prompt('<b>A</b> / <b>D</b> — MOVE OFF THE LINE BEFORE HE COILS AGAIN');
  }

  /** you do not hit him. You add yourself to a movement he can no longer stop. */
  hurlScout(guard) {
    const p = this.player;
    const away = guard.root.position.clone().sub(p.root.position).setY(0);
    if (away.lengthSq() < 1e-4) away.set(0, 0, 1);
    away.normalize();
    guard.groundY = -90;                 // nothing down there to land on
    guard.knockOut(away.x * 6.4, 2.5, away.z * 6.4, -11);
    this.audio.hurl();
    this.audio.exoWhine(0.35);
    this.g.addHitstop(0.16);
    this.g.addTrauma(1.5);
    this.g.flashV = 0.85;
    this.input.rumble(1, 260);
    this.silo.burst(guard.point('chest', new THREE.Vector3()), 26, [0.92, 0.42, 0.2], 1.2, 4.6, 1.2, 0.06);
    p.desperation = Math.min(1, p.desperation + 0.3);
    this.prompt(null);
    this.think('You do not stop him. You get behind the movement and push.', 3.2);
  }

  /** flailing at a scout is how this fight ends early */
  onEvade() {
    if (this._evadeLine && this.time - this._evadeLine < 3.4) return;
    this._evadeLine = this.time;
    const lines = [
      'He is not there when your fist arrives. Nothing about him is where it looks.',
      'Your knuckles find air. His boot finds the deck behind you.',
      'Too slow, and too committed. Wait for him to be the one who is committed.',
    ];
    this.think(lines[this.g.stats.misses % lines.length], 3.4);
    this.prompt('<b>A</b> / <b>D</b> — MOVE OFF THE DASH · <b>RMB</b> — ONLY WHILE HE IS OFF BALANCE');
  }

  ph_leap(dt) {
    const silo = this.silo;
    const p = this.player;
    if (dt === 0) {
      this.opts.moveSpeed = 3.2;
      this.opts.canLook = true;
      this.opts.threat = null;
      this._leapDone = false;
      this._leapPrompt = false;
      p.fobRate = 1;
      this.audio.setTurbine(1.2, 1.6);
      silo.setAlarm(0.6);
      this.think('Three of them down the shaft, and the platform is quiet except for the blades.', 4.6);
      this.after(4.6, () => this.announce('Platform two: no life signs. Intake obstruction logged and cleared.', 4.8));
      this.after(9.6, () => {
        silo.surgeTurbine(1);
        this.audio.abyss(3.2);
        this.g.addTrauma(0.6);
        this.think('The fob is screaming at the floor and it is not going to change its mind.', 4.4);
      });
      this.after(13.6, () => this.think('There is no third option. There was never a third option.', 3.6));
      return;
    }

    if (p.falling) { if (!this._leapDone) this._leapTick(dt); return; }
    this._fobPing(dt, 0.72);
    const r = Math.hypot(p.root.position.x, p.root.position.z);
    if (this.t > 9.6 && r < 4.8) {
      silo.surgeTurbine(0.3);
      if (!this._leapPrompt) {
        this._leapPrompt = true;
        this.prompt('<b>SPACE</b> — STEP OFF THE EDGE OF THE WORLD');
      }
      if (this.input.pressed('Space')) { this._leap(); return; }
    } else if (this._leapPrompt) {
      this._leapPrompt = false;
      this.prompt('<b>W</b> — GET BACK TO THE HOLE IN THE MIDDLE');
    }
  }

  _leap() {
    const p = this.player;
    this.prompt(null);
    this.opts.moveSpeed = 0;
    this.opts.canLook = false;
    this.opts.canLean = false;
    this.opts.threat = null;
    p.busy = 99;
    p.speed = 0;
    p.falling = true;
    p.vy = 1.4;
    this._leapT = 0;
    this.audio.leapWind(3.2);
    this.audio.setTurbine(1.7, 2.2);
    this.silo.surgeTurbine(1);
    this.g.addHitstop(0.5);
    this.g.addTrauma(0.9);
    this.input.rumble(0.7, 900);
    this.say('', 'You pull the strap tight one last time, and you jump.', 4);
  }

  _leapTick(dt) {
    const p = this.player;
    this._leapT += dt;
    this.hud.darkness(clamp01(this._leapT * 0.5));
    this.hud.blur(Math.min(10, this._leapT * 6));
    p.pitch = THREE.MathUtils.damp(p.pitch, -1.15, 3.2, dt);
    p.yaw += dt * 0.36;
    // the intake is a mouth and it is drawing: you do not fall straight, you fall in
    const k = clamp01(this._leapT / 1.4) * dt * 2.6;
    p.root.position.x += (0 - p.root.position.x) * k;
    p.root.position.z += (0 - p.root.position.z) * k;
    this.audio.setTurbine(1.4 + this._leapT * 0.4, 0.25);
    if (p.root.position.y < -24) {
      this._leapDone = true;
      p.vy = 0;
      this.hud.darkness(1);
      // the shaft is ninety metres of blades and then it is a chute, and the
      // chute has a floor at the end of it — that is the whole of Section Four
      this.goto('chute');
    }
  }

  // ============ SECTION FOUR · THE ANOMALY CORE ======================
  //
  // The shaft is ninety metres of blades, then a chute, and the chute has a
  // floor at the end of it. Under the intake the facility keeps exactly one
  // thing running: a tear in something, held open by six containment pods and a
  // great deal of copper. It reaches for you the moment you are standing in the
  // room — the fob goes first, then the pods, then what is left of you comes
  // back with a colour on it. Three of the pods had people in them.

  ph_chute(dt) {
    const core = this.core;
    const p = this.player;
    if (dt === 0) {
      this.section = 4;
      this.g.setEnv('core');
      this.g.setControls('core');
      this._parkFighters();
      this.opts.canLook = true;
      this.opts.canLean = false;
      this.opts.moveSpeed = 0;
      this.opts.threat = null;
      this.troopersDown = 0;
      this._cleared = false;
      this._dumped = false;
      this._fade = 0;
      this._fallT = 0;
      this._chutePrompt = false;
      core.setAlarm(0);
      core.riftWant = 0.14;
      core.surgeRift(0.8);
      p.fob.visible = true;
      p.fobRate = 1;
      core.chuteWorld(p.root.position);
      p.root.position.y = 6.4;
      p.falling = true;
      p.vy = -1.2;
      p.busy = 99;
      p.pitch = -1.1;
      p.yaw = 0;
      this.hud.darkness(1);
      this.hud.blur(8);
      this.hud.prompt(null);
      this.audio.setTurbine(1.5, 0.8);
      this.audio.leapWind(1.9);
      this.say('', 'The blades stop being under you. Then something hard takes the rest.', 3.6);
      this.after(2.2, () => this.think('Dust, a smell like a switched-off transformer, and a room that is not a room: the middle of it has given up.', 5.2));
      this.after(6.4, () => this.announce('Exhaust-path obstruction cleared. Logged as turbine debris.', 4.4));
      this.after(9.6, () => {
        core.openRift(0.55);
        this.audio.setRift(0.9, 2.2);
        this.think('It is not light coming up out of the floor. It is a place where the floor is not.', 4.8);
      });
      this.after(13.4, () => {
        core.surgeRift(0.9);
        this.audio.riftSurge();
        p.fobRate = 1;
        this.g.addTrauma(0.4);
        this.think('The fob has stopped screaming at the ground. It is screaming at the middle of the room.', 4.8);
      });
      this.after(16.8, () => {
        this.audio.siren(1);
        core.setAlarm(0.5);
        this.announce('Containment margin eleven per cent. Non-essential personnel will clear the hall.', 4.4);
      });
      return;
    }

    if (p.falling && !this._dumped) { this._fallTick(dt); return; }
    if (this._fade < 1) {
      this._fade = Math.min(1, this._fade + dt / 1.4);
      this.hud.darkness(1 - this._fade);
      this.hud.blur(8 * (1 - this._fade));
      return;                      // the hall comes in slowly, on the sim clock
    }
    this._fobPing(dt, 0.5);
    if (this.t > 5 && !this._chutePrompt) {
      this._chutePrompt = true;
      this.prompt('<b>WASD</b> — THE HALL IS YOURS FOR A MOMENT  ·  <b>MOUSE</b> — LOOK AT THE MIDDLE OF IT');
    }
    if (this.t > 20.5) this.goto('rift');
  }

  /** the drop out of the chute, kept entirely in the dark: what you get is the
   *  sound of it, and then the floor */
  _fallTick(dt) {
    const p = this.player;
    this._fallT += dt;
    p.pitch = THREE.MathUtils.damp(p.pitch, -1.3, 4, dt);
    p.yaw += dt * 0.55;
    this.audio.setTurbine(Math.max(0.4, 1.2 - this._fallT * 0.4), 0.25);
    if (p.root.position.y <= 0.05) this._dump();
  }

  /** the chute puts you on the deck at speed and the deck wins */
  _dump() {
    const core = this.core;
    const p = this.player;
    const { audio } = this;
    this._dumped = true;
    p.falling = false;
    p.vy = 0;
    p.root.position.y = 0;
    p.busy = 0;
    core.clamp(p.root.position);
    this.opts.moveSpeed = 3.9;
    audio.flood();
    audio.bodyHit();
    audio.metalStep(1.6);
    this.g.addHitstop(0.28);
    this.g.addTrauma(1.8);
    this.g.flashV = 0.45;
    this.g.dmgPulse = 0.4;
    this.input.rumble(1, 460);
    core.burst(p.root.position.clone().setY(0.1), 34, [0.62, 0.58, 0.52], 1.4, 3.4, 0.9, 0.05);
    core.surgeRift(0.5);
    audio.setTurbine(0.5, 2.4);
    audio.setRift(0.55, 2.4);
  }

  /** the hall has one axis and it is the tear: point the eyes at it */
  _faceRift(lift = 0) {
    const p = this.player;
    const w = this.core.riftWorld(this._rw || (this._rw = new THREE.Vector3()));
    const dx = w.x - p.root.position.x, dz = w.z - p.root.position.z;
    const d = Math.max(0.8, Math.hypot(dx, dz));
    p.aimYaw(Math.atan2(-dx, -dz));
    p.pitch = Math.atan2(w.y - 1.62 + lift, d);
  }

  /** everyone from the three rooms above belongs to those rooms now */
  _parkFighters() {
    for (const f of this.g.fighters) {
      if (f.trooper) continue;
      if (f.ko) {
        // a body already on its back keeps going down and out of frame, because
        // the ko integrator never reads `mode`
        f.groundY = -90;
        f.v.y = -3;
      } else {
        f.mode = 'offscreen';
      }
      f.root.visible = false;
    }
  }

  ph_rift(dt) {
    const core = this.core;
    const p = this.player;
    const cat = this.g.catalyst;
    if (dt === 0) {
      this.opts.moveSpeed = 0;
      this.opts.canLook = false;
      this.opts.canLean = false;
      this.opts.threat = null;
      this.prompt(null);
      p.busy = 99;
      p.fobRate = 1;
      this._faceRift();
      // a pull you already carry is a pull this hall does not get to hand out
      // twice — Continue and Section Select both land here with one in hand
      if (cat.unlocked) {
        core.openRift(1);
        core.setRiftColor(cat.def.rgb);
        this.audio.setRift(1.3, 1.2);
        this.goto('troopers');
        return;
      }
      core.setAlarm(1);
      core.openRift(0.45);
      this.audio.setRift(1.1, 1.4);
      this.audio.siren(1);
      this.say('', 'It is closer than it looked from the chute, and it has noticed that you are standing in the room.', 4.6);
      this.after(2.0, () => {
        core.openRift(1);
        this.audio.riftTear(3.2);
        this.g.addTrauma(0.9);
        this.hud.blur(2.5);
        this.think('The tear pulls itself wider on nothing. The gimbal rings are holding a shape that stopped being a shape.', 5);
      });
      this.after(4.4, () => {
        core.lashTo(p.root.position.clone().setY(1.3));
        core.surgeRift(1);
        this.audio.riftSurge();
        this.g.addHitstop(0.24);
        this.g.addTrauma(1.7);
        this.g.flashV = 0.9;
        this.input.rumble(1, 600);
        core.ember(p.root.position.clone().setY(1.35), core.riftColor, 30);
        this.say('', 'It comes through the chest first. Then the arms. Then it is through the whole of you, looking for the edge.', 4.4);
      });
      this.after(6.0, () => {
        this.audio.fobShatter();
        p.fob.visible = false;
        p.fobRate = 0;
        this.g.addTrauma(0.5);
        this.think('The tracker cracks down its own seam and stops. It was never pointed at your brother. It was pointed at this.', 5);
      });
      for (let i = 0; i < 6; i++) {
        this.after(7.4 + i * 0.42, () => {
          core.burstPod(i);
          this.audio.podBurst();
          this.g.addTrauma(0.55);
        });
      }
      this.after(10.6, () => {
        const def = rollRarity({ floored: true });
        cat.unlock(def);
        core.setRiftColor(def.rgb);
        core.surgeRift(1);
        core.lashTo(p.root.position.clone().setY(1.2));
        this.audio.riftSurge();
        this.audio.setRift(1.45, 1.6);
        this.g.addHitstop(0.3);
        this.g.addTrauma(1.9);
        this.g.flashV = 1;
        this.hud.blur(4);
        this.input.rumble(1, 900);
        this.after(0.55, () => this.hud.blur(0));
        this.say(`${def.tier} · ${def.name}`, def.line, 6.5);
      });
      this.after(13.6, () => this.prompt('<b>1</b> — BASE STRIKE  ·  <b>2</b> — SPEND THE WHOLE METER'));
      this.after(15.4, () => this.think('Three of the pods did not just vent gas. Three of them are standing up.', 4.6));
      this.after(16.8, () => this.goto('troopers'));
      return;
    }
    // the tear never settles while you are standing in front of it
    if (!this._riftSurge || this.t - this._riftSurge > 2.6) {
      this._riftSurge = this.t;
      core.surgeRift(0.35);
    }
  }

  ph_troopers(dt) {
    const core = this.core;
    const p = this.player;
    if (dt === 0) {
      this.opts.moveSpeed = 3.9;
      this.opts.canLook = true;
      this.opts.canLean = true;
      this.opts.threat = null;
      p.busy = 0;
      p.desperation = Math.min(1, p.desperation + 0.5);
      p.invuln = 0.8;
      // the tracker died in the surge, whichever way you got here
      p.fob.visible = false;
      p.fobRate = 0;
      this._riftSurge = 0;
      core.setAlarm(1);
      core.openRift(1);
      core.openPods();
      // a room you walk into already has the tear and the pull in it: the hall
      // wears the colour of whatever the rift gave you, on a resume as on the night
      if (this.g.catalyst.unlocked) core.setRiftColor(this.g.catalyst.def.rgb);
      this.audio.setRift(1.3, 1.2);
      this.audio.siren(2);
      this._hammerAim = null;
      this.troopersDown = this.troopersDown || 0;
      this.spawnTroopers();
      this.prompt('<b>WASD</b> — LEAVE THE SPOT WHEN HE COCKS THE HAMMER  ·  <b>2</b> — SPEND IT ON ARMOUR');
      this.after(1.4, () => this.say('CONTAINMENT TROOPER', 'Hall four: subject contained. Subject is not contained.', 3.6));
      this.after(5.2, () => this.think('Insulated plate, a visor with no chin under it, and a hammer on a pneumatic line. Knuckles are not in this argument.', 5.4));
      this.after(11.0, () => this.think('He puts all of his weight into one swing. Step out of the spot you were in and the spot becomes his problem.', 5.2));
      return;
    }

    // one at a time: three armoured men swinging on a twenty-two-metre floor is
    // not a fight, it is a dice roll, and the overruns are the only reward here
    let busy = 0;
    for (const t of this.troopers) {
      if (!t.ko && (t.mode === 'wind' || t.mode === 'swing' || t.mode === 'recover' || t.overextended)) busy++;
    }
    let nearest = null, nd = Infinity;
    for (const t of this.troopers) {
      if (t.ko || t.mode === 'offscreen') continue;
      core.clamp(t.root.position);
      const d = t.distanceTo(p.root.position);
      if (d < nd) { nd = d; nearest = t; }
      if (busy > 0) {
        // nobody starts a swing while a squadmate is already mid-commit; the
        // rush is stopped here because the collapse code starts the wind on
        // arrival and does not ask permission first
        if (t.mode === 'rush') t.setMode('stalk');
        continue;
      }
      if (d > 8.5) continue;
      if (t.mode === 'stalk' || t.mode === 'enter') {
        t.setMode('rush');
        t.goTo(p.root.position.x, p.root.position.z);
      } else if (t.mode === 'rush') {
        // within arm's reach the target becomes his own feet: arrival is what
        // starts the wind, and a man who keeps re-aiming never swings
        if (d < 1.7) t.goTo(t.root.position.x, t.root.position.z);
        else t.goTo(p.root.position.x, p.root.position.z);
      }
    }
    this.opts.threat = nearest ? nd : null;

    if (this.troopersDown >= 3) { this._coreClear(); return; }
    // the hall breathes on its own clock through the whole of this
    if (this.t - this._riftSurge > 3.4) { this._riftSurge = this.t; core.surgeRift(0.3); }
    if (p.resolve <= 0) this.blackout('troopers');
  }

  /** three of the containment pods were never holding gas */
  spawnTroopers() {
    const core = this.core;
    const out = this._pf || (this._pf = new THREE.Vector3());
    for (const [i, t] of this.troopers.entries()) {
      core.podFront([1, 3, 5][i], out);
      t.ko = false; t.koT = 0; t.stagger = 0; t.landed = false; t.flinch = 0;
      t.overextended = false; t.vulnerable = false; t.pneuma = 0;
      t.hasBaton = false;
      t.groundY = 0;
      t.v.set(0, 0, 0);
      t.spin.set(0, 0, 0);
      t.root.position.set(out.x, 0, out.z);
      t.root.rotation.set(0, 0, 0);
      t.root.visible = false;
      t.mode = 'stalk';
      t.setMode('offscreen');
      this.after(0.7 + i * 0.9, () => {
        t.root.visible = true;
        core.burst(t.root.position.clone().setY(1.7), 18, [0.82, 0.9, 1], 1.2, 2.6, 1.5, 0.05);
        core.surgeRift(0.4);
        this.audio.podBurst();
        this.audio.metalStep(1.5);
        t.setMode('enter');
        t.goTo(out.x * 0.84, out.z * 0.84);
      });
    }
  }

  /** the hammer's whole telegraph: he is telling you exactly where he intends
   *  to hit, and the only answer is not to be in it */
  onHammerWind(guard) {
    const p = this.player;
    this._hammerAim = { x: p.root.position.x, z: p.root.position.z };
    this.audio.pneumatic(1);
    this.audio.creak(1.3);
    this.prompt('HAMMER COCKED — <b>WASD</b> — LEAVE THAT SPOT');
    if (!this._windLine || this.time - this._windLine > 6) {
      this._windLine = this.time;
      this.think('Both arms over the helmet, the line charging under his arm. One place, once, very hard.', 4.2);
    }
  }

  /** the swing resolves against where you stood, not where you are now */
  onHammerSwing(guard) {
    const core = this.core;
    const p = this.player;
    const { audio } = this;
    const aim = this._hammerAim || { x: p.root.position.x, z: p.root.position.z };
    const moved = Math.hypot(p.root.position.x - aim.x, p.root.position.z - aim.z);
    audio.whoosh(1.7);
    if (moved > 1.25) {
      guard.overextended = true;
      audio.smash();
      audio.grind(0.6);
      this.g.addTrauma(0.8);
      this.g.flashV = 0.35;
      this.input.rumble(0.8, 180);
      core.burst(new THREE.Vector3(aim.x, 0.35, aim.z), 26, [0.7, 0.66, 0.6], 1.3, 3.6, 1.2, 0.05);
      core.surgeRift(0.3);
      p.desperation = Math.min(1, p.desperation + 0.35);
      p.addImpulse((Math.random() - 0.5) * 0.3, 0.4);
      this.prompt('<b>RMB</b> / <b>1</b> — HE CANNOT PULL IT OUT OF THE FLOOR');
      if (!this._dodgeLine || this.time - this._dodgeLine > 5) {
        this._dodgeLine = this.time;
        this.think('The hammer goes through the plate where you were standing. It takes him a full second to get it back out.', 4);
      }
      return;
    }
    const hurt = p.damage(1);
    const away = new THREE.Vector3(p.root.position.x - guard.root.position.x, 0, p.root.position.z - guard.root.position.z);
    if (away.lengthSq() < 1e-4) away.set(0, 0, 1);
    away.normalize();
    p.root.position.x += away.x * 0.9;
    p.root.position.z += away.z * 0.9;
    core.clamp(p.root.position);
    if (!hurt) {
      this.g.addHitstop(0.05);
      this.g.addTrauma(0.8);
      this.think('The shock goes through you and you are already leaning with it. It does not count.', 3.4);
      return;
    }
    this.g.stats.taken++;
    this.g.dmgPulse = 1;
    this.g.addHitstop(0.13);
    this.g.addTrauma(1.5);
    this.g.flashV = 0.6;
    audio.hit(1.9);
    audio.smash();
    this.input.rumble(1, 260);
    core.burst(p.headWorld(new THREE.Vector3()), 16, [0.62, 0.06, 0.05], 0.9, 2.4, 0.9);
    const lines = [
      'The plate of it takes you across the ribs. The room goes away and comes back wrong way up.',
      'A metre short of out of it. Pneumatics do not care about a metre.',
      'The shock lifts you off the deck and puts you down on the far side of the ring.',
    ];
    this.think(lines[(this.g.stats.taken - 1) % lines.length], 3.6);
    this.prompt('<b>WASD</b> — OFF THE SPOT BEFORE HE COCKS IT AGAIN');
  }

  /** the gate is the last beat of the chapter: it opens and the copy lands */
  _coreClear() {
    if (this._cleared) return;
    this._cleared = true;
    const core = this.core;
    this.opts.moveSpeed = 3.6;
    this.opts.threat = null;
    this.prompt(null);
    core.setAlarm(0.2);
    core.openGate();
    this.audio.grind(2.6);
    this.after(1.6, () => this.say('', 'The last one stops moving. Six pods open, one door open, and the hall is only a hall again.', 4.8));
    this.after(3.6, () => this.announce('GATE SEVEN RELEASED. CARGO GANTRY UNSEALED.', 4.2, 'THE FACILITY · INTERCOM'));
    this.after(5.6, () => this.think('Cold air out of there, and diesel. A way out — and not the way to them.', 5));
    this.after(7.8, () => { this.section = 5; this.g.setEnv('silo'); this.goto('cargo'); });
  }

  // ---------- Section Two machinery ----------

  spawnWall() {
    const silo = this.silo;
    this.wallSpawned = true;
    const mouth = silo.corridorWorld(this._mouth || (this._mouth = new THREE.Vector3()));
    for (const [i, e] of this.enforcers.entries()) {
      e.root.visible = true;
      e.ko = false; e.koT = 0; e.stagger = 0; e.landed = false;
      e.hasBaton = false; e.baton.visible = false;
      e.shieldUp = true;
      e.root.position.set(mouth.x + (i ? 0.9 : -0.35), 0, mouth.z + (i ? 0.2 : -0.2));
      e.root.rotation.set(0, 0, 0);
      e.mode = 'stalk';                 // so setMode actually re-enters the line
      e.setMode('wall');
      e.marchOffset = i * Math.PI;
    }
    this.spawnGlint();
  }

  spawnGlint() {
    this.pipeArmed = true;
    this.silo.showGlint(true);
    this.prompt('<b>RMB</b> — THE BRASS FEED PIPE · IT IS THE ONLY THING HERE YOU CAN HURT');
  }

  /** the line moves forward; you move backward; the deck decides which of you falls */
  _press(dt) {
    const p = this.player;
    for (const e of this.enforcers) {
      if (e.ko || !e.shieldUp) continue;
      const dx = p.root.position.x - e.root.position.x;
      const dz = p.root.position.z - e.root.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 1.3 || d < 1e-4) continue;
      const push = 1.25 * dt;
      p.root.position.x += (dx / d) * push;
      p.root.position.z += (dz / d) * push;
      this.env.clamp(p.root.position);
      p.desperation = Math.min(1, p.desperation + dt * 0.22);
      if (!this._pressSfx || this.time - this._pressSfx > 0.7) {
        this._pressSfx = this.time;
        this.audio.clang();
      }
    }
  }

  /** the burst rolls lengthwise down the walkway and sweeps the arc. Anything the
   *  jet crosses — or stands inside — loses the shield and the formation. */
  _steamCheck() {
    const silo = this.silo;
    if (silo.steam <= 0) return;
    const o = silo.jetOrigin(this._jo || (this._jo = new THREE.Vector3()));
    const d = silo.jetDir(this._jd || (this._jd = new THREE.Vector3()));
    const v = silo.valveWorld(this._vw || (this._vw = new THREE.Vector3()));
    for (const e of this.enforcers) {
      if (e.ko || e.mode === 'scalded') continue;
      const rx = e.root.position.x - o.x, rz = e.root.position.z - o.z;
      const along = rx * d.x + rz * d.z;
      const perp = Math.hypot(rx - d.x * along, rz - d.z * along);
      const atBurst = Math.hypot(e.root.position.x - v.x, e.root.position.z - v.z);
      if ((along > 0.1 && along < 12 && perp < 2.2) || atBurst < 3.2) {
        e.setMode('scalded');
        this.g.addTrauma(0.55);
        silo.burst(e.point('chest', new THREE.Vector3()), 18, [0.95, 0.95, 1], 1.2, 2.4, 1.6, 0.08);
        if (this.phase === 'wall') { this.prompt(null); this.goto('scald'); }
      }
    }
  }

  onPipeHit(punch, point) {
    const silo = this.silo;
    this.pipeArmed = false;
    silo.spark = 1;
    silo.openSteam(16);
    this.audio.brass();
    this.audio.steam(5);
    this.g.addHitstop(0.14);
    this.g.addTrauma(1.3);
    this.g.flashV = 0.75;
    this.input.rumble(0.9, 220);
    silo.burst(point, 46, [1, 0.86, 0.42], 1.5, 5.4, 1.3, 0.05);
    this.player.desperation = 1;
    this.player.addImpulse((Math.random() - 0.5) * 0.4, 0.5);
    silo.showGlint(false);
    this.say('', 'The brass folds under the fist. Somewhere above, a pressure gauge goes to zero.', 4.6);
    this.after(3.0, () => this.think('The line lets go. White, and it rolls down the walkway at them.', 4));
    this._steamCheck();
  }

  onShieldHit(guard, part) {
    if (this.phase !== 'wall' && this.phase !== 'scald') return;
    if (!this._blockLine || this.time - this._blockLine > 3.2) {
      this._blockLine = this.time;
      const lines = [
        'Knuckles on polycarbonate. Your hand disagrees with the decision.',
        'The shield does not move. The shield has never moved.',
        'There is nothing to hit. That is the entire design.',
      ];
      this.think(lines[(this.g.stats.hits + this.g.stats.misses) % lines.length], 3.2);
      this.prompt('<b>MOUSE</b> — BRASS, ON THE WALL · <b>RMB</b> — STRIKE THE PIPE');
    }
  }

  /** the hole in the floor, and what happens when you are standing in it */
  _deckCheck(dt) {
    const p = this.player;
    if (this.section !== 2 || p.state !== 'free' || this.g.over) return;
    if (p.falling) {
      if (p.root.position.y < -13) this._respawn();
      return;
    }
    if (!this.env.onDeck(p.root.position)) {
      p.falling = true;
      p.vy = 0;
      this.opts.moveSpeed = 0;
      this.audio.abyss(2.4);
      this.g.addTrauma(1.3);
      this.hud.darkness(0.4);
      this.hud.blur(5);
      this.think('The grating stops being under your feet.', 3);
      return;
    }
    this._lastSafe.copy(p.root.position);
  }

  _respawn() {
    const p = this.player;
    p.falling = false;
    p.vy = 0;
    p.root.position.copy(this._lastSafe);
    p.root.position.y = 0;
    this.opts.moveSpeed = this.phase === 'breach' ? 3.2 : 3.6;
    p.damage(1, 0);              // the deck is not somebody's fist: no grace
    this.g.dmgPulse = 1;
    this.hud.darkness(0);
    this.hud.blur(0);
    this.audio.flood();
    this.say('', 'You catch the railing with one hand. It takes the rest of you to hold on.', 4.2);
    if (p.resolve <= 0) this.blackoutSilo(this.phase);
  }

  /**
   * Going down is a full stop, not a fade: the sim freezes behind a black
   * screen for 2.6 s and then the phase you were in starts over. The countdown
   * runs on `update`, so hitstop and the pause menu cannot skip the recovery,
   * and nothing on the other side of it can reach you while you are out.
   */
  _blackout(anchor, line) {
    if (this._blacked) return;
    this._blacked = true;
    this._blackAnchor = anchor;
    this._blackT = 2.6;
    this._blackOpts = { moveSpeed: this.opts.moveSpeed, canLook: this.opts.canLook, canLean: this.opts.canLean };
    this.opts.moveSpeed = 0;
    this.opts.canLook = false;
    this.opts.canLean = false;
    this.opts.threat = null;
    this.hud.darkness(1);
    this.hud.blur(0);
    this.audio.heartbeat(1.5);
    this.say('', line, 4);
  }

  _wake() {
    const o = this._blackOpts;
    this._blacked = false;
    this._blackT = 0;
    this.opts.moveSpeed = o.moveSpeed;
    this.opts.canLook = o.canLook;
    this.opts.canLean = o.canLean;
    this.player.resolve = 3;
    this.player.desperation = 0;
    this.player.invuln = 0;
    this.player.falling = false;
    this.player.vy = 0;
    this.player.busy = 0;
    this.player.lean.set(0, 0);
    this.player.leanV.set(0, 0);
    this.hud.darkness(0);
    this.hud.blur(0);
    if (this.section === 1) {
      this.freePrompt = false;
      const g2 = this.guards[1];
      g2.ko = false; g2.koT = 0; g2.stagger = 0; g2.landed = false; g2.overextended = false;
      g2.root.position.set(1.4, 0, -4.5);
      g2.root.rotation.set(0, 0, 0);
      g2.setMode('stalk');
    } else {
      this.wallCleared = false;
      this.wallSpawned = false;
      this._edgeWarn = false;
      this._bagPrompt = false;
      if (this.section === 3) {
        // the platform again, with the same three men coming down the cable —
        // but nothing that already went into the shaft comes back out of it
        this.scoutsDown = 0;
        this.bladeDone = new Set();
        this._leapPrompt = false;
        this._leapDone = false;
        this._looking = false;
        this._dodgeLine = 0;
        this._evadeLine = 0;
        this.audio.setTurbine(1.05, 1.6);
      }
      if (this.section >= 4) {
        // the pods stay open and the pull stays yours: the hall re-runs the
        // fight, it does not re-run the room
        this.troopersDown = 0;
        this._cleared = false;
        this._hammerAim = null;
        this.opts.threat = null;
        this.audio.setTurbine(0.45, 1.8);
        this.audio.setRift(1.2, 1.4);
      }
    }
    this.goto(this._blackAnchor);
  }

  blackoutSilo(anchor) {
    this._blackout(anchor, 'The dark takes you again. It hands you back the same steel.');
  }

  blackout(anchor) {
    if (this.section >= 4) {
      this._blackout(anchor, 'The dark takes you again. It hands you back the same hall, and the same three helmets.');
      return;
    }
    if (this.section >= 2) { this.blackoutSilo(anchor); return; }
    this._blackout(anchor, 'The dark takes you again. It hands you back the same room.');
  }

  _end() {
    const { audio, world } = this;
    this.prompt(null);
    this.opts.moveSpeed = 0;
    audio.screech(1.9);
    setTimeout(() => audio.flood(), 500);
    world.openDoor();
    this.after(1.6, () => { this.g.flashV = 1; });
    this.after(2.9, () => { this.hud.darkness(1); this.prompt(null); });
    this.after(4.0, () => this.goto('breach'));
  }

  // ---------- events from the guards ----------
  onGuardEvent(name, payload, guard) {
    const { audio } = this;
    const isBruiser = guard === this.guards[0];
    switch (name) {
      case 'footstep':
        if (guard.scout) audio.exoStep(guard.mode === 'dash' ? 1.2 : 0.8);
        else if (guard.trooper) audio.metalStep(1.5);
        else if (this.section >= 2) audio.metalStep(guard.mode === 'wall' ? 1.15 : 0.7);
        else audio.step(isBruiser ? 1.2 : 0.95);
        break;
      case 'lighter': audio.clatter(); break;
      case 'baton': audio.smash(); break;
      case 'coil': audio.exoWhine(1); break;
      case 'dash': audio.whoosh(1.8); break;
      case 'lunge': this.onLunge(guard, payload); break;
      case 'scoutLand':
        audio.scoutLand();
        this.g.addTrauma(0.85);
        this.silo.burst(guard.root.position.clone().setY(0.06), 18, [0.5, 0.46, 0.4], 0.9, 2.6, 0.5, 0.05);
        break;
      case 'wind':
        if (guard.trooper) { this.onHammerWind(guard); break; }
        this.forceSide = payload.side;
        audio.whoosh(1.2);
        audio.creak(1.1);
        this.prompt(payload.side < 0 ? 'ARC COMING FROM HIS RIGHT — <b>LEAN →</b>' : 'ARC COMING FROM HIS LEFT — <b>LEAN ←</b>');
        break;
      case 'swingHit':
        if (guard.trooper) this.onHammerSwing(guard);
        else this.resolveDodge(guard, payload.side);
        break;
      case 'flinch': audio.hit(0.6); break;
      case 'land': audio.bodyHit(); this.g.addTrauma(0.55); break;
      case 'ko': audio.crack(); break;
    }
  }

  resolveDodge(guard, side) {
    const want = -side;
    const dodged = this.player.lean.x * want > 0.42 && this.player.state !== 'free';
    this.audio.whoosh(1.4);
    if (dodged) {
      this.g.addTrauma(0.5);
      this.audio.smash();
      this.world.burst(this.player.root.position.clone().setY(0.9), 10, [0.5, 0.48, 0.44], 0.8, 2.2, 0.9, 0.03);
      guard.overextended = true;
      this.player.desperation = Math.min(1, this.player.desperation + 0.3);
      if (!this.player.boltPop) {
        this.player.boltPop = true;
        this.player.state = 'loose';
        this.player.addImpulse(want * 0.9, -0.6);
        this.audio.boltsPop();
        this.g.addHitstop(0.05);
        this.g.addTrauma(0.95);
        this.world.burst(this.player.root.position.clone().setY(0.07), 24, [0.32, 0.3, 0.28], 1.2, 3.4, 1.3);
        this.boltFly();
        this.say('', 'The anchor bolts rip out of the floor. The chair is loose.', 4.6);
        this.prompt('<b>F</b> — HEADBUTT  ·  <b>E</b> — LURCH THE CHAIR ONTO HIS KNEES');
        this.think('You are not fixed to the ground anymore. You are a weapon of iron.', 4.2);
      } else {
        this.prompt('<b>E</b> — LURCH THE CHAIR  ·  <b>F</b> — HEADBUTT  ·  <b>RMB</b> — STRIKE');
      }
    } else {
      if (this.player.state === 'free') return;
      this.player.damage(1);
      this.g.stats.taken++;
      this.g.addHitstop(0.09);
      this.g.addTrauma(1.15);
      this.g.dmgPulse = 1;
      this.audio.hit(1.8);
      this.audio.smash();
      this.world.burst(this.player.headWorld(new THREE.Vector3()), 14, [0.6, 0.06, 0.05], 0.8, 1.9, 0.7);
      const lines = [
        'The nightstick catches your shoulder. The room goes white.',
        'You didn’t move far enough. Bone loses this argument.',
        'He buries it in your arm. Your vision swims back in.',
      ];
      this.think(lines[(this.g.stats.taken - 1) % lines.length], 3.6);
      this.prompt('<b>A</b> / <b>D</b> — SLAM OUT OF THE ARC');
    }
  }

  boltFly() {
    for (let i = 0; i < 4; i++) {
      this.world.burst(this.player.root.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.06, -0.2)),
        3, [0.7, 0.68, 0.65], 1.4, 3.6, 1.4, 0.03);
    }
  }

  onHit(guard, punch, part, res) {
    const { audio, player } = this;

    // a scout only ever arrives here off balance, and one clean strike while it
    // is off balance is the whole mechanic: you are not hurting it, you are
    // finishing a movement it started
    if (guard.scout) {
      if (this.phase === 'scouts' && !guard.ko) this.hurlScout(guard);
      return;
    }

    if (guard.trooper) {
      if (res.ko) {
        this.troopersDown++;
        const away = guard.root.position.clone().sub(player.root.position).setY(0);
        if (away.lengthSq() < 1e-4) away.set(0, 0, 1);
        away.normalize();
        guard.knockOut(away.x * 1.5, 1.6, away.z * 3.4, -9.2);
        this.g.addHitstop(0.16);
        this.g.addTrauma(1.45);
        this.g.flashV = 0.8;
        this.input.rumble(1, 240);
        audio.crack();
        audio.clatter();
        this.core.burst(guard.point('chest', new THREE.Vector3()), 26, [0.85, 0.8, 0.72], 1.2, 3.4, 1.1, 0.05);
        this.core.surgeRift(0.35);
        const left = 3 - this.troopersDown;
        if (left === 2) this.think('The plate is in around his ribs and he is not getting up. Two of them still have their feet.', 3.8);
        if (left === 1) this.think('One left. The meter is already coming back.', 3.4);
        if (left === 0) { this.prompt(null); this.think('The last hammer comes down on the deck and stops charging.', 3.8); }
        else this.prompt('<b>1</b> — STRIKE  ·  <b>2</b> — ANOMALY  ·  <b>WASD</b> — OFF THE SPOT');
      } else if (part === 'knee') {
        audio.hit(0.6);
        if (!this._kneeLine || this.time - this._kneeLine > 4) {
          this._kneeLine = this.time;
          this.think('Insulated plate down to the ankle. A knee strike is a noise it makes at you.', 3.2);
        }
      }
      return;
    }

    if (guard.enforcer) {
      if (res.ko) {
        const away = guard.root.position.clone().sub(player.root.position).setY(0).normalize();
        guard.knockOut(away.x * 1.2, 1.15, away.z * 3.4, -8.6);
        this.g.addHitstop(0.13);
        this.g.addTrauma(1.35);
        this.g.flashV = 0.7;
        audio.crack();
        this.prompt(null);
        this.think('The helmet rings like a bucket. It drops onto the grating and stops arguing.', 3.8);
      } else if (part === 'knee') {
        audio.hit(0.7);
        if (!this._kneeLine || this.time - this._kneeLine > 4) {
          this._kneeLine = this.time;
          this.think('Riot armour eats the knee strike whole. Aim above it.', 3.2);
        }
      }
      return;
    }

    if (guard === this.guards[0] && !guard.ko) {
      if (part === 'head') {
        const away = guard.root.position.clone().sub(player.root.position).setY(0).normalize();
        guard.knockOut(away.x * 1.4, 1.6, away.z * 4.8, -9.4);
        this.g.addHitstop(0.17);
        this.g.addTrauma(1.45);
        this.g.flashV = 1;
        player.desperation = Math.min(1, player.desperation + 0.25);
        this.hitCabinetArmed = true;
        this.goto('strike');
      } else {
        player.damage(1);
        this.g.stats.taken++;
        audio.smash();
        this.g.dmgPulse = 0.9;
        this.g.addTrauma(0.8);
        this.say('THE BRUISER', 'Bad idea.', 2.4);
        if (player.resolve <= 0) this.blackout('approach');
        else this.after(1.8, () => { if (!guard.ko && this.phase === 'approach') guard.setMode('grab'); });
      }
      return;
    }
    if (guard === this.guards[1] && res.ko) {
      const away = guard.root.position.clone().sub(player.root.position).setY(0).normalize();
      guard.knockOut(away.x * 0.8, 1.0, away.z * 3.4, -8.4);
      guard.dropBaton();
      guard.baton.position.set(0.18, 0.035, -0.52);
      guard.baton.rotation.set(Math.PI / 2, 0.6, 0.2);
      this.g.addTrauma(1.2);
      audio.bodyHit();
      this.prompt(null);
    }
  }

  // ---------- frame ----------
  update(dt) {
    this.t += dt;
    this.time += dt;
    if (this._blackT > 0) {
      this._blackT -= dt;
      if (this._blackT <= 0) this._wake();
      return;
    }
    for (let i = this.queue.length - 1; i >= 0; i--) {
      if (this.t >= this.queue[i].at) { const fn = this.queue[i].fn; this.queue.splice(i, 1); fn(); }
    }
    const fn = this['ph_' + this.phase];
    if (fn) fn.call(this, dt + 0.00001);   // never exactly 0 after entering
  }

  postUpdate(dt) {
    if (this.hitCabinetArmed && this.section === 1) {
      const g = this.guards[0];
      const c = this.world.cabinet.position;
      if (g.root.position.distanceTo(new THREE.Vector3(c.x, 0, c.z)) < 1.2) {
        this.hitCabinetArmed = false;
        this.audio.bodyHit();
        this.audio.toolsShower();
        this.g.addTrauma(0.9);
        this.world.throwTools(g.root.position, 1);
        this.world.cabinet.userData.jolt = 1;
      }
    }
    const cab = this.world.cabinet;
    if (cab.userData.jolt > 0) {
      cab.userData.jolt = Math.max(0, cab.userData.jolt - dt * 2.2);
      const j = cab.userData.jolt;
      cab.rotation.x = -0.09 * j;
      cab.position.y = -0.015 * j;
    }
  }
}
