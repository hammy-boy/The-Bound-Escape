import * as THREE from 'three';
import { rustTex, siloWallTex, gratingTex, puffTex } from './textures.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------- the ring, in polar terms ----------
// Everything you can stand on is described by one angle: theta = 0 is the door
// out of the interrogation cell, and the catwalk runs clockwise from there.
export const WALL_R = 26;          // the silo shell
export const DECK_IN = 21.5;       // inner edge of the walkway
export const DECK_OUT = 25.35;     // outer edge, hard against the wall
export const ARC_END = 1.62;       // the catwalk shears off into the silo here
export const TH_NODE = 1.2;        // where the bridge out to the platform leaves
export const TH_VALVE = 1.38;      // the steam valve on the wall
export const TH_CORRIDOR = 0.95;   // the enforcers' intersecting corridor
export const PLAT_R = 6.5;         // the central control platform
export const INTAKE_R = 2.6;       // the open mouth cut through the middle of it
export const SHAFT_R = 13.5;       // the turbine housing below: three storeys across
export const TH_ELEV = 1.5;        // the main elevator bank, at the far end of the ring
export const TH_CONSOLE = 0.62;    // the terminal, straddling the intake
export const TH_HATCH = -0.62;     // the officer's way off the platform

const polar = (p) => ({ r: Math.hypot(p.x, p.z), th: Math.atan2(p.x, -p.z) });
const at = (r, th, out = V()) => out.set(Math.sin(th) * r, 0, -Math.cos(th) * r);

export function buildSilo(scene) {
  const rust = rustTex(), shell = siloWallTex(), grate = gratingTex();
  shell.repeat.set(46, 12);
  grate.repeat.set(9, 9);

  const matGrate = new THREE.MeshStandardMaterial({ map: grate, roughness: 0.85, metalness: 0.35, color: 0x9c9184, side: THREE.DoubleSide });
  const matShell = new THREE.MeshStandardMaterial({ map: shell, roughness: 0.95, metalness: 0.15, color: 0x8a7c6a, side: THREE.BackSide });
  const matMetal = new THREE.MeshStandardMaterial({ map: rust, roughness: 0.62, metalness: 0.45, color: 0xa2937d });
  const matDark = new THREE.MeshStandardMaterial({ color: 0x1c1a17, roughness: 0.9, metalness: 0.3 });
  const matBrass = new THREE.MeshStandardMaterial({ color: 0xc2952f, roughness: 0.34, metalness: 0.85 });
  const matRed = new THREE.MeshBasicMaterial({ color: 0xff2a18, transparent: true, opacity: 0.9, fog: false });

  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  // ---- the shell: a shaft you cannot see the bottom of ----
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(WALL_R, WALL_R, 100, 64, 1, true), matShell);
  wall.position.y = -30;
  group.add(wall);
  const cap = new THREE.Mesh(new THREE.RingGeometry(0, WALL_R, 48), matDark);
  cap.rotation.x = -Math.PI / 2; cap.position.y = 19.6;
  group.add(cap);

  // ---- the catwalk you run along, and the hole where it used to continue ----
  const deckGeo = new THREE.RingGeometry(DECK_IN, DECK_OUT, 90, 1, Math.PI / 2 - ARC_END, ARC_END);
  const deck = new THREE.Mesh(deckGeo, matGrate);
  deck.rotation.x = -Math.PI / 2;
  deck.receiveShadow = true;
  group.add(deck);

  // the far side of the ring, collapsed and hanging in the dark — the scale of
  // the place has to read from the first frame, and it reads from broken steel
  const broken = new THREE.Mesh(new THREE.RingGeometry(DECK_IN + 1.2, DECK_OUT, 40, 1, Math.PI / 2 - 3.5, 1.55), matGrate);
  broken.rotation.x = -Math.PI / 2;
  broken.position.y = -3.4;
  broken.rotation.z = 0.05;
  group.add(broken);
  const brokenB = new THREE.Mesh(new THREE.RingGeometry(DECK_IN + 0.4, DECK_OUT, 30, 1, Math.PI / 2 - 5.6, 0.9), matGrate);
  brokenB.rotation.x = -Math.PI / 2;
  brokenB.position.y = -8.5;
  group.add(brokenB);

  // girders under the deck, every few degrees
  const girder = new THREE.BoxGeometry(0.3, 0.42, DECK_OUT - DECK_IN);
  for (let th = 0.06; th < ARC_END + 0.05; th += 0.11) {
    const g = new THREE.Mesh(girder, matMetal);
    const c = Math.cos(th), s = Math.sin(th);
    g.position.set(s * (DECK_IN + DECK_OUT) / 2, -0.26, -c * (DECK_IN + DECK_OUT) / 2);
    g.rotation.y = -th;
    group.add(g);
  }

  // ---- railings: the outer one continuous, the inner one broken at the bridge
  function rail(radius, th0, th1, y) {
    const g = new THREE.TorusGeometry(radius, 0.035, 5, Math.max(6, Math.round((th1 - th0) * 60)), th1 - th0);
    g.rotateZ(Math.PI / 2 - th1);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, matMetal);
    m.position.y = y;
    return m;
  }
  for (const y of [0.5, 1.02]) {
    group.add(rail(DECK_OUT - 0.08, 0, ARC_END, y));          // outer
    group.add(rail(DECK_IN + 0.08, 0, TH_NODE - 0.1, y));     // inner, up to the bridge mouth
    group.add(rail(DECK_IN + 0.08, TH_NODE + 0.1, ARC_END, y));
  }
  const post = new THREE.BoxGeometry(0.07, 1.05, 0.07);
  for (let th = 0.05; th < ARC_END; th += 0.09) {
    for (const [r, on] of [[DECK_OUT - 0.1, true], [DECK_IN + 0.1, Math.abs(th - TH_NODE) > 0.11]]) {
      if (!on) continue;
      const p = new THREE.Mesh(post, matMetal);
      at(r, th, p.position); p.position.y = 0.52;
      group.add(p);
    }
  }
  // the severed end: two torn stubs of grating, so the drop is unmistakable
  for (const [th, y, rz] of [[ARC_END, -0.35, -0.32], [ARC_END + 0.1, -1.5, -0.75]]) {
    const stub = new THREE.Mesh(new THREE.BoxGeometry(DECK_OUT - DECK_IN, 0.14, 0.9), matGrate);
    at((DECK_IN + DECK_OUT) / 2, th, stub.position);
    stub.position.y = y;
    stub.rotation.y = -th;
    stub.rotation.x = rz;
    group.add(stub);
  }

  // ---- pipes crawling down the wall like vines ----
  const pipeGeo = new THREE.CylinderGeometry(1, 1, 1, 7);
  const PIPES = 120;
  const pipes = new THREE.InstancedMesh(pipeGeo, matMetal, PIPES);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = V(), pos = V();
  for (let i = 0; i < PIPES; i++) {
    const th = Math.random() * Math.PI * 2;
    const r = WALL_R - 0.35 - Math.random() * 1.5;
    const len = 30 + Math.random() * 60;
    const rad = 0.05 + Math.random() * 0.17;
    at(r, th, pos);
    pos.y = 16 - Math.random() * 40 - len / 2;
    sc.set(rad, len, rad);
    m4.compose(pos, q, sc);
    pipes.setMatrixAt(i, m4);
  }
  group.add(pipes);
  // ring manifolds: the horizontal ones that tie the vines together
  for (const y of [10, 2, -9, -24]) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(WALL_R - 0.5 - Math.random() * 0.8, 0.09 + y * 0.002, 5, 90), matMetal);
    t.rotation.x = Math.PI / 2;
    t.position.y = y;
    group.add(t);
  }

  // ---- overhead vents sucking yellow exhaust ----
  const vents = [];
  for (let i = 0; i < 6; i++) {
    const th = 0.12 + i * 1.02;
    const g = new THREE.Group();
    at(WALL_R - 2.4, th, g.position);
    g.position.y = 13.5;
    g.rotation.y = -th;
    group.add(g);
    g.add(new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.5, 2.2), matMetal).translateY(0.25));
    const hood = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.5, 0.7, 10, 1, true), matDark);
    hood.position.y = -0.35;
    g.add(hood);
    const fan = new THREE.Group();
    fan.position.y = -0.4;
    g.add(fan);
    for (let b = 0; b < 5; b++) {
      const bl = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.05, 0.34), matMetal);
      bl.rotation.y = (b / 5) * Math.PI * 2;
      bl.rotation.z = 0.4;
      fan.add(bl);
    }
    vents.push({ fan, th, puffs: [] });
  }

  // ---- the bridge out to the platform ----
  const bridge = new THREE.Group();
  const u = Math.sin(TH_NODE), w = -Math.cos(TH_NODE);
  bridge.position.set(u * (PLAT_R + (DECK_IN - PLAT_R) / 2) + 0, 0, w * (PLAT_R + (DECK_IN - PLAT_R) / 2));
  group.add(bridge);
  const BL = DECK_IN - PLAT_R + 1.2;
  const bdeck = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.14, BL), matGrate);
  bdeck.receiveShadow = true;
  bridge.add(bdeck);
  // railings with gaps at entry (ring side, +Z) and exit (platform side, -Z)
  const GAP_SIZE = 1.8;  // gap width for entering/exiting
  const RAIL_LENGTH = BL - GAP_SIZE * 2;  // middle railing length with gaps at both ends
  for (const sx of [-1.55, 1.55]) {
    const railM = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.0, RAIL_LENGTH), matMetal);
    railM.position.set(sx, 0.5, 0);  // centered on bridge
    bridge.add(railM);
  }
  for (let i = 0; i < 7; i++) {
    const g = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.3, 0.24), matMetal);
    g.position.set(0, -0.2, -BL / 2 + 1 + i * (BL - 2) / 6);
    bridge.add(g);
  }
  bridge.rotation.y = TH_NODE;   // local -Z points inward along the radius

  // ---- the central control platform ----
  // Not a disc: a ring of steel with the ventilation shaft running straight
  // through the middle of it. The hole is the entire reason Section Three ends
  // the way it does, so it has to be visible from the bridge.
  const platform = new THREE.Group();
  group.add(platform);
  const pdisc = new THREE.Mesh(new THREE.CylinderGeometry(PLAT_R, PLAT_R - 0.4, 0.5, 32, 1, true), matMetal);
  pdisc.position.y = -0.25;
  platform.add(pdisc);
  const ptop = new THREE.Mesh(new THREE.RingGeometry(INTAKE_R, PLAT_R - 0.05, 40, 1), matGrate);
  ptop.rotation.x = -Math.PI / 2; ptop.position.y = 0.01;
  ptop.receiveShadow = true;
  platform.add(ptop);
  const punder = new THREE.Mesh(new THREE.RingGeometry(INTAKE_R, PLAT_R - 0.4, 40, 1), matDark);
  punder.rotation.x = Math.PI / 2; punder.position.y = -0.5;
  platform.add(punder);
  platform.add(rail(PLAT_R - 0.1, 0, Math.PI * 2, 1.0));
  platform.add(rail(PLAT_R - 0.1, 0, Math.PI * 2, 0.5));
  // a brass kerb around the intake, low enough to step over and high enough to see
  const kerb = new THREE.Mesh(new THREE.TorusGeometry(INTAKE_R, 0.09, 6, 44), matBrass);
  kerb.rotation.x = Math.PI / 2;
  kerb.position.y = 0.04;
  platform.add(kerb);
  platform.add(rail(INTAKE_R + 0.1, 0.1, Math.PI * 2 - 0.5, 0.44));
  const throat = new THREE.Mesh(new THREE.CylinderGeometry(INTAKE_R, INTAKE_R * 0.84, 3.2, 30, 1, true), matDark);
  throat.position.y = -1.6;
  platform.add(throat);

  // the maintenance grates that were supposed to cover the intake: every single
  // one of them swung open and left standing around the hole like a broken crown
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.34;
    const yawG = new THREE.Group();
    at(INTAKE_R + 0.1, a, yawG.position);
    yawG.position.y = 0.05;
    yawG.rotation.y = -a;
    platform.add(yawG);
    const hinge = new THREE.Group();
    hinge.rotation.x = i === 3 ? -2.9 : -1.62 - Math.random() * 0.3;
    yawG.add(hinge);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.07, INTAKE_R * 0.8), matGrate);
    panel.position.set(0, 0, INTAKE_R * 0.4);
    hinge.add(panel);
    hinge.add(new THREE.Mesh(new THREE.BoxGeometry(2.06, 0.12, 0.1), matMetal).translateZ(0.04));
    hinge.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, INTAKE_R * 0.78), matMetal)
      .translateX(0.98).translateZ(INTAKE_R * 0.4));
  }

  for (let i = 0; i < 4; i++) {
    const th = i * Math.PI / 2 + 0.4;
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 24, 5), matDark);
    at(PLAT_R - 0.9, th, cable.position);
    cable.position.y = 12;
    cable.rotation.z = Math.sin(th) * 0.06;
    cable.rotation.x = Math.cos(th) * 0.06;
    platform.add(cable);
  }

  // the terminal: the only warm light on the ring, parked on the intake lip
  const terminal = new THREE.Group();
  at(3.3, TH_CONSOLE, terminal.position);
  platform.add(terminal);
  terminal.add(new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.15, 0.7), matMetal).translateY(0.58));
  const screenMat = new THREE.MeshBasicMaterial({ color: 0x7fe0d8 });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.62), screenMat);
  screen.position.set(0, 1.0, -0.36);
  screen.rotation.x = -0.22;
  terminal.add(screen);
  const screenLight = new THREE.PointLight(0x74d7cf, 9, 12, 2);
  screenLight.position.set(0, 1.3, -1.0);
  terminal.add(screenLight);
  for (let i = 0; i < 22; i++) {
    const k = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, 0.07),
      new THREE.MeshBasicMaterial({ color: Math.random() < 0.5 ? 0xffd27a : 0x8ef0e6 }));
    k.position.set(-0.5 + (i % 8) * 0.14, 0.72, -0.2 - Math.floor(i / 8) * 0.12);
    terminal.add(k);
  }
  // face the bridge mouth: the screen is the first thing you see coming in
  {
    const m = at(DECK_IN - 1.2, TH_NODE, V());
    terminal.rotation.y = Math.atan2(-(m.x - terminal.position.x), -(m.z - terminal.position.z));
  }

  // your youngest sibling's satchel, left on the console beside the keyboard
  const satchel = new THREE.Group();
  satchel.position.set(0.44, 1.2, -0.04);
  terminal.add(satchel);
  const leather = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.92 });
  satchel.add(new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.16, 0.38), leather).translateY(0.08));
  const flap = new THREE.Mesh(new THREE.BoxGeometry(0.53, 0.05, 0.4), new THREE.MeshStandardMaterial({ color: 0x4a2f1b, roughness: 0.9 }));
  flap.position.set(0, 0.17, 0);
  flap.rotation.x = 0.12;
  satchel.add(flap);
  satchel.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.05), matBrass).translateY(0.15).translateZ(-0.2));
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.022, 4, 14, Math.PI), leather);
  strap.rotation.x = Math.PI / 2;
  strap.position.y = 0.2;
  satchel.add(strap);
  satchel.rotation.y = 0.7;

  // ---- the escape hatch the facility officer goes down ----
  const hatch = new THREE.Group();
  at(5.15, TH_HATCH, hatch.position);
  platform.add(hatch);
  hatch.rotation.y = -TH_HATCH;
  hatch.add(new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.24, 1.5), matMetal).translateY(0.05));
  const hatchMouth = new THREE.Mesh(new THREE.PlaneGeometry(1.16, 1.16), matDark);
  hatchMouth.rotation.x = -Math.PI / 2;
  hatchMouth.position.y = 0.18;
  hatch.add(hatchMouth);
  const hatchShaft = new THREE.Mesh(new THREE.BoxGeometry(1.16, 2.2, 1.16), matDark);
  hatchShaft.position.y = -1.1;
  hatch.add(hatchShaft);
  for (let i = 0; i < 4; i++) {
    hatch.add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.05), matMetal)
      .translateY(-0.4 - i * 0.45).translateZ(0.5));
  }
  const lid = new THREE.Group();
  lid.position.set(-0.66, 0.2, 0);
  hatch.add(lid);
  lid.add(new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.08, 1.28), matMetal).translateX(0.64));
  lid.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.3), matDark).translateX(1.24));
  const hatchLamp = new THREE.PointLight(0xff5a3c, 0, 7, 2);
  hatchLamp.position.set(0, 0.9, 0);
  hatch.add(hatchLamp);

  // ---- blast doors across the ring ----
  const doors = [];
  const DOOR_TH = [0.38, 0.7, 1.0, 1.24];
  for (let i = 0; i < DOOR_TH.length; i++) {
    const th = DOOR_TH[i];
    const g = new THREE.Group();
    at((DECK_IN + DECK_OUT) / 2, th, g.position);
    g.rotation.y = -th;
    group.add(g);
    g.add(new THREE.Mesh(new THREE.BoxGeometry(DECK_OUT - DECK_IN + 0.6, 0.3, 0.5), matMetal).translateY(4.35));
    for (const sx of [-1, 1]) {
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.28, 4.5, 0.5), matMetal).translateX(sx * (DECK_OUT - DECK_IN) / 2).translateY(2.2));
    }
    const slab = new THREE.Mesh(new THREE.BoxGeometry(DECK_OUT - DECK_IN + 0.4, 4.2, 0.34), matMetal);
    slab.position.y = 4.6;
    slab.castShadow = true;
    g.add(slab);
    for (let k = 0; k < 4; k++) {
      slab.add(new THREE.Mesh(new THREE.BoxGeometry(DECK_OUT - DECK_IN + 0.5, 0.1, 0.1), matDark).translateY(-1.6 + k * 1.05).translateZ(0.2));
    }
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), matRed.clone());
    lamp.position.set(0, 4.35, 0.32);
    g.add(lamp);
    doors.push({ th, slab, lamp, shut: 0, closing: false, sealed: false, at: 3.6 + i * 2.2 });
  }

  // ---- modern freight elevator entrance for Cargo Entry ----
  const elevator = new THREE.Group();
  at((DECK_IN + DECK_OUT) / 2, TH_ELEV, elevator.position);
  elevator.rotation.y = -TH_ELEV;
  group.add(elevator);
  const EW = DECK_OUT - DECK_IN + 1.9;
  const facadeW = Math.min(EW, 5.8), facadeH = 6.1;
  const facadeDark = new THREE.MeshStandardMaterial({ color: 0x24272a, roughness: 0.82, metalness: 0.18 });
  const stone = new THREE.MeshStandardMaterial({ color: 0x343536, roughness: 0.92, metalness: 0.05 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x777d80, roughness: 0.32, metalness: 0.82 });
  const steelDoor = new THREE.MeshStandardMaterial({ color: 0x858b8e, roughness: 0.3, metalness: 0.78, emissive: 0x17191a, emissiveIntensity: 0.12 });
  elevator.add(new THREE.Mesh(new THREE.BoxGeometry(facadeW + 2, facadeH + 0.9, 0.5), stone).translateY(facadeH / 2));
  elevator.add(new THREE.Mesh(new THREE.BoxGeometry(facadeW + 0.38, facadeH + 0.34, 0.34), trim).translateY(facadeH / 2).translateZ(0.22));
  const openingW = facadeW - 0.12, openingH = 5.35, openingY = openingH / 2 + 0.28;
  const recess = new THREE.Mesh(new THREE.BoxGeometry(openingW, openingH, 0.16), facadeDark);
  recess.position.set(0, openingY, 0.34); elevator.add(recess);
  const doorL = new THREE.Mesh(new THREE.BoxGeometry(openingW / 2 - 0.025, openingH - 0.08, 0.12), steelDoor);
  const doorR = doorL.clone();
  doorL.position.set(-openingW / 4, openingY, 0.46);
  doorR.position.set(openingW / 4, openingY, 0.46);
  elevator.add(doorL, doorR);
  const seam = new THREE.Mesh(new THREE.BoxGeometry(0.035, openingH - 0.18, 0.035), facadeDark);
  seam.position.set(0, openingY, 0.535); elevator.add(seam);
  for (const y of [openingY - 1.55, openingY + 1.55]) for (const x of [-openingW / 4, openingW / 4]) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(openingW / 2 - 0.16, 0.018, 0.012),
      new THREE.MeshStandardMaterial({ color: 0xb4b8b9, metalness: 0.75, roughness: 0.38 }));
    line.position.set(x, y, 0.526); elevator.add(line);
  }
  const indicator = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.48, 0.12), facadeDark);
  indicator.position.set(0, facadeH + 0.1, 0.36); elevator.add(indicator);
  const indicatorFace = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.25), new THREE.MeshBasicMaterial({ color: 0xffe8c5 }));
  indicatorFace.position.set(0, facadeH + 0.1, 0.43); elevator.add(indicatorFace);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.92, 0.13), trim);
  panel.position.set(facadeW / 2 + 0.48, 2.15, 0.38); elevator.add(panel);
  const buttonMat = new THREE.MeshStandardMaterial({ color: 0xe8d7b8, emissive: 0x5a3218, emissiveIntensity: 0.2, metalness: 0.35, roughness: 0.3 });
  const callButton = new THREE.Mesh(new THREE.CircleGeometry(0.075, 20), buttonMat);
  callButton.position.set(facadeW / 2 + 0.48, 2.27, 0.46); elevator.add(callButton);
  const buttonRing = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.018, 6, 24), new THREE.MeshBasicMaterial({ color: 0xd8c39d }));
  buttonRing.position.set(facadeW / 2 + 0.48, 2.27, 0.465); elevator.add(buttonRing);
  for (const x of [-1.65, 0, 1.65]) {
    const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.105, 16), new THREE.MeshBasicMaterial({ color: 0xffead0 }));
    lamp.rotation.x = -Math.PI / 2; lamp.position.set(x, facadeH + 0.5, 0.1); elevator.add(lamp);
    const light = new THREE.PointLight(0xffd8ad, 1.8, 5, 2);
    light.position.set(x, facadeH + 0.25, 0.5); elevator.add(light);
  }
  const cabinGlow = new THREE.PointLight(0xffc58a, 0, 7, 2);
  cabinGlow.position.set(0, 2.8, 1.2); elevator.add(cabinGlow);
  // Hidden legacy shutter retained for the existing elevator state/update code.
  const slab = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01), facadeDark);
  slab.visible = false; elevator.add(slab);
  elevator.userData = { shut: 0, closing: false, slab, cargoCabin: elevator, cargoDoors: [doorL, doorR], cargoButtonMat: buttonMat, cargoGlow: cabinGlow, cargoPressed: false };
  
  // ---- the maintenance line the scouts come down ----
  const dropLine = new THREE.Group();
  dropLine.position.y = 11.6;
  group.add(dropLine);
  const lineSpin = new THREE.Group();
  lineSpin.rotation.y = 0.55;
  dropLine.add(lineSpin);
  const lineCable = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 46, 6), matMetal);
  lineCable.rotation.z = Math.PI / 2;
  lineSpin.add(lineCable);
  const trolleys = [];
  for (let i = 0; i < 3; i++) {
    const tr = new THREE.Group();
    tr.position.x = (i - 1) * 3.4;
    lineSpin.add(tr);
    tr.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.24, 0.3), matDark));
    tr.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 5), matMetal).translateY(-0.3));
    tr.add(new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.025, 5, 10), matBrass).translateY(-0.6));
    trolleys.push(tr);
  }

  // ---- the ventilation shaft under the platform ----
  // Multi-tiered, three storeys across, and it is still running: the blades turn
  // over in the dark and pull the whole lower deck's air down with them.
  const turbine = new THREE.Group();
  group.add(turbine);
  const matBlade = new THREE.MeshStandardMaterial({ map: rust, color: 0x8a7d6a, roughness: 0.52, metalness: 0.34, side: THREE.DoubleSide });
  const housing = new THREE.Mesh(new THREE.CylinderGeometry(SHAFT_R, SHAFT_R * 0.66, 54, 40, 1, true), matShell);
  housing.position.y = -28;
  turbine.add(housing);
  const housingLip = new THREE.Mesh(new THREE.TorusGeometry(SHAFT_R, 0.5, 6, 44), matMetal);
  housingLip.rotation.x = Math.PI / 2;
  housingLip.position.y = -1.2;
  turbine.add(housingLip);

  const tiers = [];
  for (const [y, rr, n, spin] of [[-9.5, SHAFT_R * 0.95, 9, 0.4], [-20.5, SHAFT_R * 0.82, 8, -0.32], [-33, SHAFT_R * 0.62, 7, 0.46]]) {
    const hub = new THREE.Group();
    hub.position.y = y;
    turbine.add(hub);
    hub.add(new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.3, 3.4, 18), matMetal));
    hub.add(new THREE.Mesh(new THREE.ConeGeometry(1.8, 1.6, 18), matDark).translateY(2.4));
    const len = rr - 2.6;
    for (let i = 0; i < n; i++) {
      const piv = new THREE.Group();
      piv.rotation.y = (i / n) * Math.PI * 2;
      hub.add(piv);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(len, 0.18, 3.0), matBlade);
      blade.position.set(2.0 + len / 2, 0, 0);
      blade.rotation.y = 0.44;
      piv.add(blade);
      blade.add(new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 0.2), matDark).translateY(0.11).translateZ(-1.42));
      blade.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 3.05), matMetal).translateX(-len / 2 + 0.1));
    }
    hub.add(new THREE.Mesh(new THREE.TorusGeometry(rr, 0.26, 6, 46), matMetal).rotateX(Math.PI / 2));
    tiers.push({ hub, spin });
  }
  // static guide vanes between the tiers, so the shaft has walls and not just fans
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const vane = new THREE.Mesh(new THREE.BoxGeometry(0.4, 9.5, 2.6), matMetal);
    at(SHAFT_R - 0.9, a, vane.position);
    vane.position.y = -15;
    vane.rotation.y = -a + 0.5;
    turbine.add(vane);
  }
  const vortexLight = new THREE.PointLight(0xff7a2c, 40, 74, 1.7);
  vortexLight.position.y = -13;
  turbine.add(vortexLight);
  const vortexRim = new THREE.PointLight(0x4d6a86, 22, 60, 2);
  vortexRim.position.y = -26;
  turbine.add(vortexRim);
  const vortexFloor = new THREE.Mesh(new THREE.CircleGeometry(SHAFT_R * 0.62, 26),
    new THREE.MeshBasicMaterial({ color: 0x5a1f06, transparent: true, opacity: 0.55, fog: false }));
  vortexFloor.rotation.x = -Math.PI / 2;
  vortexFloor.position.y = -47;
  turbine.add(vortexFloor);

  // ---- the steam valve, and the brass feed pipe that is the only soft spot ----
  const valve = new THREE.Group();
  at(WALL_R - 0.55, TH_VALVE, valve.position);
  valve.position.y = 1.5;
  valve.rotation.y = -TH_VALVE;
  group.add(valve);
  valve.add(new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.7, 0.22), matMetal).translateZ(0.1));
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.72, 12), matMetal);
  body.rotation.x = Math.PI / 2;
  body.position.z = 0.5;
  valve.add(body);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.045, 5, 18), matDark);
  wheel.position.set(0, 0.52, 0.5);
  valve.add(wheel);
  for (let i = 0; i < 4; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.05, 0.05), matDark);
    spoke.position.set(0, 0.52, 0.5);
    spoke.rotation.y = (i / 4) * Math.PI;
    valve.add(spoke);
  }
  for (const sy of [-0.3, 0.3]) {
    valve.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 8), matMetal)
      .translateY(sy * 1.4).translateZ(0.42));
  }
  // the feed pipe: thin, brass, and hissing like a wound
  const pipe = new THREE.Group();
  valve.add(pipe);
  const seg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 1.05, 8), matBrass);
  seg1.rotation.x = Math.PI / 2;
  seg1.position.set(0, -0.16, 0.9);
  pipe.add(seg1);
  const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), matBrass);
  elbow.position.set(0, -0.16, 1.42);
  pipe.add(elbow);
  const seg2 = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 8), matBrass);
  seg2.position.set(0, 0.08, 1.42);
  pipe.add(seg2);
  const crackMat = new THREE.MeshBasicMaterial({ color: 0xffe9b0 });
  const crack = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), crackMat);
  crack.position.set(0, -0.16, 1.46);
  pipe.add(crack);
  const pipeWorld = V();
  elbow.getWorldPosition(pipeWorld);

  // a glint so the target is findable in a red-lit smoke chamber
  const glint = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.21, 20),
    new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.85, side: THREE.DoubleSide, fog: false, depthTest: false }));
  glint.position.copy(pipeWorld).add(V(0, 0.34, 0));
  glint.rotation.x = -Math.PI / 2;
  glint.visible = false;
  group.add(glint);

  // ---- the intersecting corridor they come out of ----
  const corridor = new THREE.Group();
  at(WALL_R - 1.4, TH_CORRIDOR, corridor.position);
  corridor.rotation.y = -TH_CORRIDOR;
  group.add(corridor);
  corridor.add(new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.14, 3.6), matGrate).translateZ(1.6));
  for (const sx of [-1.7, 1.7]) {
    corridor.add(new THREE.Mesh(new THREE.BoxGeometry(0.24, 3.2, 3.8), matMetal).translateX(sx).translateY(1.6).translateZ(1.6));
  }
  corridor.add(new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.5, 3.8), matMetal).translateY(3.4).translateZ(1.6));
  const corridorLamp = new THREE.PointLight(0xff5a3c, 0, 14, 2);
  corridorLamp.position.set(0, 2.4, 2.4);
  corridor.add(corridorLamp);

  // ---- lights ----
  group.add(new THREE.HemisphereLight(0x2b2f3a, 0x07060a, 0.5));
  const redWash = new THREE.PointLight(0xff2a18, 0, 70, 1.6);
  redWash.position.set(0, 12, 0);
  group.add(redWash);
  const beacons = [];
  for (let i = 0; i < 7; i++) {
    const th = (i / 7) * Math.PI * 2;
    const g = new THREE.Group();
    at(WALL_R - 0.9, th, g.position);
    g.position.y = 6.5;
    group.add(g);
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.34), matDark));
    const lens = new THREE.Mesh(new THREE.ConeGeometry(0.42, 3.6, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xff2416, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    lens.rotation.x = Math.PI / 2;
    lens.position.z = -1.8;
    g.add(lens);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), matRed.clone());
    bulb.position.z = -0.2;
    g.add(bulb);
    g.rotation.y = -th + Math.PI;
    beacons.push({ g, lens, bulb, spin: 0.5 + i * 0.13, phase: i * 0.9 });
    if (i % 2 === 0) {
      const l = new THREE.PointLight(0xff2a18, 0, 30, 2);
      l.position.set(0, -0.4, -1);
      g.add(l);
      beacons[i].light = l;
    }
  }
  // one lamp that actually casts, so the enforcers have a shadow under them
  const keyLight = new THREE.SpotLight(0xffd9b0, 90, 40, 0.75, 0.5, 1.6);
  at(DECK_IN + 2, TH_NODE - 0.35, keyLight.position);
  keyLight.position.y = 9;
  keyLight.target.position.copy(at(DECK_IN + 2, TH_NODE - 0.1, V()));
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.bias = -0.002;
  keyLight.shadow.camera.far = 34;
  group.add(keyLight, keyLight.target);
  const deepGlow = new THREE.PointLight(0x2a1d12, 30, 90, 2);
  deepGlow.position.set(0, -55, 0);
  group.add(deepGlow);

  // ---- steam + exhaust: one sprite pool, two colours ----
  const puff = puffTex();
  const MAXP = 90;
  const puffs = [];
  for (let i = 0; i < MAXP; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, transparent: true, opacity: 0, depthWrite: false }));
    sp.visible = false;
    group.add(sp);
    puffs.push({ sp, life: 0, ttl: 1, v: V(), grow: 1, tint: 1, sink: 0 });
  }
  let pCursor = 0;
  function emitPuff(origin, dir, count, { ttl = 1.4, size = 0.6, grow = 3, tint = 1, sink = 0 } = {}) {
    for (let i = 0; i < count; i++) {
      const p = puffs[pCursor];
      pCursor = (pCursor + 1) % MAXP;
      p.life = ttl * (0.6 + Math.random() * 0.6);
      p.ttl = p.life;
      p.grow = grow;
      p.tint = tint;
      p.sink = sink;
      p.sp.visible = true;
      p.sp.scale.setScalar(size * (0.6 + Math.random() * 0.7));
      p.sp.position.copy(origin).add(V((Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.25));
      p.v.copy(dir).multiplyScalar(0.6 + Math.random() * 0.8).add(V((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5));
    }
  }

  // ---- sparks off the brass ----
  const MAXS = 160;
  const sPos = new Float32Array(MAXS * 3), sCol = new Float32Array(MAXS * 3);
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3).setUsage(THREE.DynamicDrawUsage));
  sGeo.setAttribute('color', new THREE.BufferAttribute(sCol, 3).setUsage(THREE.DynamicDrawUsage));
  sPos.fill(-999);
  const sparks = new THREE.Points(sGeo, new THREE.PointsMaterial({ size: 0.05, vertexColors: true, transparent: true, depthWrite: false }));
  sparks.frustumCulled = false;
  group.add(sparks);
  const pool = [];
  for (let i = 0; i < MAXS; i++) pool.push({ life: 0, x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0 });
  let sCursor = 0;
  function burst(origin, count, color, spread = 0.9, speed = 3, up = 1, size = 0.05) {
    const [r, g, b] = color;
    for (let i = 0; i < count; i++) {
      const p = pool[sCursor];
      const j = sCursor * 3;
      sCursor = (sCursor + 1) % MAXS;
      p.life = 0.5 + Math.random() * 0.8;
      p.x = origin.x + (Math.random() - 0.5) * 0.06;
      p.y = origin.y + (Math.random() - 0.5) * 0.06;
      p.z = origin.z + (Math.random() - 0.5) * 0.06;
      const a = Math.random() * Math.PI * 2, e = Math.random() * spread;
      p.vx = Math.cos(a) * e * speed;
      p.vy = Math.random() * speed * up;
      p.vz = Math.sin(a) * e * speed;
      sCol[j] = r; sCol[j + 1] = g; sCol[j + 2] = b;
      sparks.material.size = size;
    }
  }

  // the abyss: fog you can see the bottom of nowhere in
  const fog = new THREE.FogExp2(0x0a0908, 0.012);
  const api = {
    group, deck, doors, beacons, valve, pipe, satchel, terminal, screen, platform,
    hatch, lid, elevator, turbine, dropLine,
    steam: 0, alarm: 0, alarmPhase: 0,
    spark: 0,
    sway: 0,
    surge: 0,          // the blades speeding up because something is in them
    hatchWant: 0,
    hatchOpen: 0,
    platformOnly: false,   // the sector is sealed: the bridge mouth is a wall too

    pipeWorld(out = V()) { return elbow.getWorldPosition(out); },
    valveWorld(out = V()) { return body.getWorldPosition(out); },
    /** where the jet comes out, and where it points: a broken feed line does not
     *  fire straight into the shaft, it rolls lengthwise down the walkway and
     *  sweeps the arc — which is the only reason it can catch a line of men */
    jetOrigin(out = V()) { return elbow.getWorldPosition(out); },
    jetDir(out = V()) {
      const p = elbow.getWorldPosition(V());
      const ang = Math.atan2(p.x, -p.z) + Math.PI / 2 + api.sway;
      return out.set(-Math.sin(ang), 0.12, Math.cos(ang)).normalize();
    },
    deckAt(th, r = (DECK_IN + DECK_OUT) / 2, out = V()) { return at(r, th, out); },
    nodeWorld(out = V()) { return at(DECK_IN - 1.2, TH_NODE, out); },
    corridorWorld(out = V()) { return at(DECK_IN + 1.4, TH_CORRIDOR, out); },
    /** where the player actually is, in ring terms */
    ring(pos) { return { r: Math.hypot(pos.x, pos.z), th: Math.atan2(pos.x, -pos.z) }; },
    satchelWorld(out = V()) { return satchel.getWorldPosition(out); },
    platformWorld(out = V()) { return terminal.getWorldPosition(out); },

    // ---- Section Three: what is under the platform, and how you get to it ----
    /** the middle of the deck is the middle of the intake: there is nothing there */
    intakeWorld(out = V()) { return out.set(0, 0, 0); },
    turbineWorld(out = V()) { return out.set(0, -11, 0); },
    consoleWorld(out = V()) { return terminal.getWorldPosition(out); },
    hatchWorld(out = V()) { return hatch.getWorldPosition(out); },
    elevWorld(out = V()) { return elevator.getWorldPosition(out); },
    officerSpot(out = V()) { return at(4.35, TH_CONSOLE - 0.7, out); },
    dropSpot(i, out = V()) { return at(4.15, TH_CONSOLE + Math.PI * 0.72 + i * 1.3, out); },

    slamElevator() { elevator.userData.closing = true; },
    openHatch() { api.hatchWant = 1; },
    closeHatch() { api.hatchWant = 0; },
    surgeTurbine(v = 1) { api.surge = Math.max(api.surge, v); },
    bladeBurst(pos) { burst(pos, 46, [1, 0.66, 0.26], 1.8, 8.5, 0.45, 0.08); },
    sparkTrolley(i) {
      const tr = trolleys[i];
      if (tr) burst(tr.getWorldPosition(V()).setY(10.9), 16, [1, 0.9, 0.62], 1.1, 3.2, 0.3, 0.04);
    },

    setAlarm(v) { api.alarm = v; },
    openSteam(sec = 3) { api.steam = Math.max(api.steam, sec); },
    sealDoor(i) { if (doors[i]) doors[i].closing = true; },
    showGlint(v) { glint.visible = v; },
    burst(origin, count, color, spread = 0.9, speed = 3, up = 1, size = 0.05) {
      burst(origin, count, color, spread, speed, up, size);
    },

    /** keeps you on the steel: ring band, bridge corridor, or platform disc */
    clamp(pos) {
      const ring = V(pos.x, 0, pos.z), bridgeP = V(pos.x, 0, pos.z), plat = V(pos.x, 0, pos.z);
      {
        let { r, th } = polar(pos);
        r = THREE.MathUtils.clamp(r, DECK_IN + 0.06, DECK_OUT - 0.06);
        th = Math.max(0.03, th);
        at(r, th, ring);
      }
      {
        const along = THREE.MathUtils.clamp(pos.x * u + pos.z * w, PLAT_R - 1, DECK_IN + 0.4);
        // allow exiting through gaps at bridge ends: if near the ends, widen the perp clamp
        const distFromRing = Math.abs(along - DECK_IN);
        const distFromPlat = Math.abs(along - PLAT_R);
        const nearGap = distFromRing < 1.5 || distFromPlat < 1.5;
        const perpWidth = nearGap ? 2.5 : 1.5;  // wider when near entry/exit gaps
        const perp = THREE.MathUtils.clamp(pos.x * w - pos.z * u, -perpWidth, perpWidth);
        bridgeP.set(u * along + w * perp, 0, w * along - u * perp);
      }
      {
        // the platform is a ring, not a disc: the middle of it is the intake, and
        // the only way down through it is the one you take at the very end
        const { r, th } = polar(pos);
        at(THREE.MathUtils.clamp(r, INTAKE_R + 0.5, PLAT_R - 0.5), th, plat);
      }
      // once the sector seals, the bridge mouth you came in through is a wall like
      // any other: the platform is the whole world until you jump off it
      if (api.platformOnly) { pos.x = plat.x; pos.z = plat.z; return pos; }
      let best = ring, bd = ring.distanceToSquared(pos);
      for (const c of [bridgeP, plat]) {
        const d = c.distanceToSquared(pos);
        if (d < bd) { bd = d; best = c; }
      }
      pos.x = best.x; pos.z = best.z;
      return pos;
    },

    onDeck(pos) {
      const { r, th } = polar(pos);
      if (r < PLAT_R + 0.6) return true;
      const along = pos.x * u + pos.z * w, perp = pos.x * w - pos.z * u;
      // widened perp check to allow walking through entry/exit gaps
      const distFromRing = Math.abs(along - DECK_IN);
      const distFromPlat = Math.abs(along - PLAT_R);
      const nearGap = distFromRing < 1.5 || distFromPlat < 1.5;
      const perpWidth = nearGap ? 2.5 : 1.75;
      if (along > PLAT_R - 1.5 && along < DECK_IN + 0.8 && Math.abs(perp) < perpWidth) return true;
      // and the walkway itself: the annulus, and only the part of it that is
      // still there — past the shear there is nothing to stand on
      return r > DECK_IN - 0.4 && r < DECK_OUT + 0.8 && th >= -0.04 && th <= ARC_END;
    },

    setVisible(v) { group.visible = v; },

    update(dt, t) {
      api.sway = Math.sin(t * 0.52) * 0.34;
      // red beacons sweeping the ring
      for (const b of beacons) {
        b.spin += dt * (0.9 + api.alarm * 1.5);
        b.g.rotation.y = -Math.atan2(b.g.position.x, -b.g.position.z) + Math.PI + Math.sin(b.spin + b.phase) * 1.2;
        const on = (0.2 + api.alarm * 0.8) * (0.55 + 0.45 * Math.sin(b.spin * 2.4 + b.phase));
        b.lens.material.opacity = 0.05 + on * 0.2;
        b.bulb.material.opacity = 0.25 + on;
        if (b.light) b.light.intensity = on * 26;
      }
      redWash.intensity = (3.5 + api.alarm * 19) * (0.6 + 0.4 * Math.sin(t * 3.1));
      deepGlow.intensity = 26 + Math.sin(t * 0.4) * 6;
      screenLight.intensity = 8 + Math.sin(t * 7.3) * 2.4 + (Math.random() < 0.02 ? -5 : 0);
      screenMat.color.setRGB(0.42 + 0.1 * Math.sin(t * 2.2), 0.88, 0.84);
      corridorLamp.intensity = api.alarm * 16;
      glint.material.opacity = 0.5 + 0.45 * Math.sin(t * 5.5);
      if (glint.visible) {
        elbow.getWorldPosition(pipeWorld);
        glint.position.copy(pipeWorld).add(V(0, 0.34, 0));
      }

      // vents: fans wind up and cough yellow exhaust
      for (const v of vents) {
        v.fan.rotation.y += dt * (1.6 + api.alarm * 3.4);
        if (Math.random() < dt * (0.5 + api.alarm * 1.6)) {
          const o = V();
          at(WALL_R - 2.4, v.th, o);
          o.y = 12.8;
          emitPuff(o, V(0, 1, 0).multiplyScalar(0.5), 2, { ttl: 4.5, size: 2.6, grow: 5, tint: 0 });
        }
      }

      // the valve, hissing under pressure
      if (api.steam > 0) {
        api.steam -= dt;
        const o = api.jetOrigin(V()), d = api.jetDir(V());
        emitPuff(o, d, 4, { ttl: 1.1, size: 0.7, grow: 4.5, tint: 1 });
        if (Math.random() < dt * 26) burst(o, 2, [1, 0.95, 0.8], 1.4, 6, 0.4, 0.03);
      } else if (Math.random() < dt * 3) {
        const o = api.jetOrigin(V());
        emitPuff(o, V(0, 0.4, 0), 1, { ttl: 0.7, size: 0.22, grow: 1.2, tint: 1 });
      }
      crack.visible = api.steam <= 0;
      crack.material.color.setRGB(1, 0.9 - api.spark, 0.6 * api.spark + 0.3);
      api.spark = Math.max(0, api.spark - dt * 1.6);
      // blast doors grinding down
      for (const dr of doors) {
        if (dr.closing && dr.shut < 1) {
          dr.shut = Math.min(1, dr.shut + dt * 0.85);
          const e = dr.shut * dr.shut * (3 - 2 * dr.shut);
          dr.slab.position.y = 4.6 - e * 4.6;
          dr.lamp.material.opacity = 0.4 + 0.6 * Math.abs(Math.sin(t * 9));
        }
      }

      // the elevator bank does not grind. It falls, and then it is shut.
      const el = elevator.userData;
      if (el.closing && el.shut < 1) {
        el.shut = Math.min(1, el.shut + dt * 0.82);
        const e = el.shut * el.shut;
        slab.position.y = ELEV_OPEN - e * (ELEV_OPEN - ELEV_SHUT);
      }
      const elevPulse = 0.4 + 0.6 * Math.abs(Math.sin(t * 8.5));
      elevLamp.material.opacity = el.closing || api.alarm > 0.5 ? elevPulse : 0.2;
      elevLight.intensity = (el.closing ? 30 : api.alarm * 14) * elevPulse;

      // the officer's hatch, and the lamp that says it is open
      api.hatchOpen = THREE.MathUtils.damp(api.hatchOpen ?? 0, api.hatchWant, 5.5, dt);
      lid.rotation.z = api.hatchOpen * 1.95;
      hatchLamp.intensity = api.hatchOpen * 14;

      // the shaft: three tiers turning over in the dark, dragging the air down
      api.surge = Math.max(0, api.surge - dt * 0.42);
      const spinK = 1 + api.surge * 3.4;
      for (const tr of tiers) tr.hub.rotation.y += dt * tr.spin * spinK;
      vortexLight.intensity = 34 + api.surge * 130 + Math.sin(t * 2.1) * 7;
      vortexRim.intensity = 18 + api.surge * 44 + Math.sin(t * 1.3 + 1) * 5;
      vortexFloor.material.opacity = 0.4 + api.surge * 0.42 + Math.sin(t * 3.4) * 0.06;
      if (Math.random() < dt * (2.4 + api.surge * 9)) {
        const a = Math.random() * Math.PI * 2;
        const rr = INTAKE_R + Math.random() * 3.6;
        const o = V(Math.sin(a) * rr, 0.7 - Math.random() * 0.7, -Math.cos(a) * rr);
        emitPuff(o, V(-o.x * 0.5, -3.4, -o.z * 0.5), 1,
          { ttl: 2.6, size: 0.55, grow: 1.4, tint: 0, sink: 1.3 });
      }

      // sprites
      for (const p of puffs) {
        if (p.life <= 0) continue;
        p.life -= dt;
        p.sp.position.addScaledVector(p.v, dt);
        p.v.y += dt * (0.35 - (p.sink || 0));
        p.v.multiplyScalar(1 - dt * 0.5);
        const k = p.life / p.ttl;
        p.sp.scale.addScalar(dt * p.grow);
        p.sp.material.opacity = Math.min(0.5, k * 0.55);
        p.sp.material.color.setRGB(
          p.tint ? 0.94 : 0.86, p.tint ? 0.95 : 0.8, p.tint ? 0.97 : 0.42);
        if (p.life <= 0) p.sp.visible = false;
      }

      const pa = sGeo.attributes.position;
      for (let i = 0; i < MAXS; i++) {
        const p = pool[i];
        const j = i * 3;
        if (p.life > 0) {
          p.life -= dt;
          p.vy -= 9.8 * dt;
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          pa.array[j] = p.x; pa.array[j + 1] = p.y; pa.array[j + 2] = p.z;
          if (p.y < -80) p.life = 0;
        } else {
          pa.array[j + 1] = -999;
        }
      }
      pa.needsUpdate = true;
    },
  };

  api.fog = fog;
  return api;
}
