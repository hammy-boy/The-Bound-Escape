import * as THREE from 'three';
import { canvasTex, concreteTex, rustTex, wallTex, smokeTex } from './textures.js';

// ---------- geometry helpers ----------
function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}

export function buildWorld(scene) {
  const concrete = concreteTex(), rust = rustTex(), wall = wallTex();

  // metalness without an environment map is just a black hole — the bulb is the
  // only thing to reflect, so rusted steel has to come mostly from its diffuse.
  const matConcrete = new THREE.MeshStandardMaterial({ map: concrete, roughness: 0.96, metalness: 0.05, color: 0x8d8578 });
  const matWall = new THREE.MeshStandardMaterial({ map: wall, roughness: 0.95, metalness: 0.02, color: 0x9a8f7f });
  const matMetal = new THREE.MeshStandardMaterial({ map: rust, roughness: 0.68, metalness: 0.22, color: 0xa89a86 });
  const matDark = new THREE.MeshStandardMaterial({ color: 0x23201b, roughness: 0.9 });
  const matWood = new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 0.95 });

  scene.fog = new THREE.FogExp2(0x090807, 0.05);

  const world = new THREE.Group();
  scene.add(world);

  // shell: 13 wide, 13 deep, 4 tall; player sits at origin facing -Z toward the door
  const W = 13, D = 13, H = 4;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), matConcrete);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  world.add(floor);

  // Persistent impact craters are real openings in the floor geometry.
  const floorCraterRecords = [];
  function rebuildFloorWithCraterHoles() {
    const shape = new THREE.Shape();
    shape.moveTo(-W / 2, -D / 2);
    shape.lineTo(W / 2, -D / 2);
    shape.lineTo(W / 2, D / 2);
    shape.lineTo(-W / 2, D / 2);
    shape.closePath();
    for (const crater of floorCraterRecords) {
      const hole = new THREE.Path();
      hole.absarc(crater.x, -crater.z, crater.radius, 0, Math.PI * 2, true);
      shape.holes.push(hole);
    }
    const geometry = new THREE.ShapeGeometry(shape, 48);
    floor.geometry.dispose();
    floor.geometry = geometry;
    floor.geometry.computeVertexNormals();
  }

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), matDark);
  ceil.rotation.x = Math.PI / 2; ceil.position.y = H;
  world.add(ceil);

  const back = box(W, H, 0.5, matWall, 0, H / 2, D / 2);
  const left = box(0.5, H, D, matWall, -W / 2, H / 2, 0);
  const right = box(0.5, H, D, matWall, W / 2, H / 2, 0);
  world.add(back, left, right);

  // front wall with a doorway opening, x in [-0.85, 0.85]
  const opening = 1.7;
  const sideW = (W - opening) / 2;
  world.add(box(sideW, H, 0.5, matWall, -(opening + sideW) / 2, H / 2, -D / 2));
  world.add(box(sideW, H, 0.5, matWall, (opening + sideW) / 2, H / 2, -D / 2));
  world.add(box(opening, 1.0, 0.5, matWall, 0, H - 0.5, -D / 2));

  // the heavy iron door, hinged on the left jamb, swings outward
  const doorPivot = new THREE.Group();
  doorPivot.position.set(-opening / 2, 0, -D / 2 - 0.06);
  world.add(doorPivot);
  const door = box(opening + 0.12, H - 1.0, 0.12, matMetal, (opening + 0.12) / 2, (H - 1.0) / 2, 0);
  door.add(box(0.14, 0.14, 0.34, matDark, opening - 0.12, 1.5, 0.12));   // handle
  for (let i = 0; i < 5; i++) door.add(box(0.06, 0.06, 0.2, matDark, 0.2 + i * 0.34, 0.28, 0.08));
  doorPivot.add(door);

  // light from the far side of the door: a sliver under it, a seam at the jamb,
  // and a shaft on the floor — the exit has to read as an exit from across a
  // pitch-black room
  const gapSliver = new THREE.Mesh(new THREE.PlaneGeometry(opening - 0.06, 0.09),
    new THREE.MeshBasicMaterial({ color: 0xd6e6fb, transparent: true, opacity: 0.9, fog: false }));
  gapSliver.position.set(0, 0.045, -D / 2 + 0.28);
  world.add(gapSliver);
  const jambSeam = new THREE.Group();
  for (const sx of [-1, 1]) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.05, H - 1.0),
      new THREE.MeshBasicMaterial({ color: 0xa8c6ea, transparent: true, opacity: 0.55, fog: false }));
    s.position.set(sx * (opening / 2 - 0.02), (H - 1.0) / 2, -D / 2 + 0.27);
    jambSeam.add(s);
  }
  world.add(jambSeam);
  const doorShaft = new THREE.Mesh(new THREE.PlaneGeometry(opening, 3.4),
    new THREE.MeshBasicMaterial({
      color: 0x8fb0dd, transparent: true, opacity: 0.22,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
  doorShaft.rotation.x = -Math.PI / 2;
  doorShaft.position.set(0, 0.014, -D / 2 + 1.75);
  world.add(doorShaft);

  // what is on the other side: a blinding city
  const skyTex = canvasTex(256, (c, x, s) => {
    const g = x.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, '#050a16'); g.addColorStop(0.52, '#13203a');
    g.addColorStop(0.78, '#4a4053'); g.addColorStop(1, '#c98a3f');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
    x.globalAlpha = 0.5;
    for (let i = 0; i < 90; i++) {          // haze smeared over the smog line
      x.fillStyle = `hsla(${28 + Math.random() * 14},60%,${50 + Math.random() * 30}%,0.05)`;
      x.beginPath(); x.ellipse(Math.random() * s, s * (0.6 + Math.random() * 0.4), 20 + Math.random() * 60, 6, 0, 0, 7); x.fill();
    }
    x.globalAlpha = 1;
    for (let i = 0; i < 220; i++) {         // far traffic and rooftop beacons
      x.fillStyle = Math.random() < 0.25 ? '#ff5a3c' : '#ffe6b0';
      x.fillRect(Math.random() * s, s * (0.72 + Math.random() * 0.26), 1.6, 1.6);
    }
  });
  const cityPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(70, 30),
    new THREE.MeshBasicMaterial({ map: skyTex, transparent: true, opacity: 0, fog: false })
  );
  cityPlane.position.set(0, 11, -D / 2 - 26);
  world.add(cityPlane);

  const windowTex = canvasTex(128, (c, x, s) => {
    x.fillStyle = '#000'; x.fillRect(0, 0, s, s);
    for (let gy = 6; gy < s; gy += 11) {
      for (let gx = 5; gx < s; gx += 9) {
        if (Math.random() < 0.42) continue;                  // dark floors
        const warm = Math.random() < 0.72;
        x.fillStyle = warm ? `hsl(${36 + Math.random() * 12},85%,${58 + Math.random() * 22}%)`
                           : `hsl(${195 + Math.random() * 25},70%,${60 + Math.random() * 25}%)`;
        x.fillRect(gx, gy, 5, 6);
      }
    }
  }, 1);
  const cityBlocks = new THREE.Group();
  for (let i = 0; i < 22; i++) {
    const h = 4 + Math.random() * 17;
    const m = new THREE.MeshStandardMaterial({
      color: 0x0d0f14, roughness: 1, emissive: 0xffffff, emissiveMap: windowTex, emissiveIntensity: 1.5,
    });
    m.emissiveMap = windowTex;
    const b = box(1.8 + Math.random() * 2.8, h, 1.8 + Math.random() * 2.8, m,
      (Math.random() - 0.5) * 17, h / 2, -D / 2 - 3.5 - Math.random() * 17);
    cityBlocks.add(b);
    if (Math.random() < 0.3) {                                // rooftop beacon
      cityBlocks.add(box(0.16, 0.16, 0.16, new THREE.MeshBasicMaterial({ color: 0xff3b1e, fog: false }),
        b.position.x, h + 0.2, b.position.z));
    }
  }
  cityBlocks.visible = false;
  world.add(cityBlocks);

  // ---- tool cabinet the first guard folds into ----
  const cabinet = new THREE.Group();
  cabinet.position.set(0.2, 0, -2.35);
  cabinet.rotation.y = 0.12;
  world.add(cabinet);
  cabinet.add(box(1.15, 1.28, 0.62, matMetal, 0, 0.64, 0));
  for (let i = 0; i < 4; i++) {
    cabinet.add(box(1.05, 0.2, 0.04, matDark, 0, 0.24 + i * 0.28, -0.32));
    cabinet.add(box(0.22, 0.05, 0.06, matMetal, 0, 0.24 + i * 0.28, -0.36));
  }
  cabinet.add(box(1.15, 0.06, 0.64, matMetal, 0, 1.31, 0));
  const cabinetLight = cabinet;

  // loose tools resting on top — they shower when hit
  const toolMeshes = [];
  for (let i = 0; i < 8; i++) {
    const t = box(0.05 + Math.random() * 0.16, 0.045, 0.045, matMetal,
      -0.45 + i * 0.13 + Math.random() * 0.05, 1.36, (Math.random() - 0.5) * 0.4);
    t.rotation.set(Math.random(), Math.random() * 3, Math.random());
    cabinet.add(t);
    toolMeshes.push(t);
  }

  // ---- clutter ----
  const bench = new THREE.Group();
  bench.position.set(-4.4, 0, -3.2); bench.rotation.y = 0.5;
  bench.add(box(2.6, 0.1, 0.9, matWood, 0, 0.92, 0));
  bench.add(box(0.12, 0.92, 0.8, matDark, -1.2, 0.46, 0));
  bench.add(box(0.12, 0.92, 0.8, matDark, 1.2, 0.46, 0));
  world.add(bench);

  for (const [x, z, s] of [[4.9, -4.4, 1], [5.4, -3.3, 0.85], [-5.0, 3.6, 1.05]]) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.32 * s, 0.32 * s, 0.9 * s, 14), matMetal);
    barrel.position.set(x, 0.45 * s, z);
    barrel.castShadow = barrel.receiveShadow = true;
    world.add(barrel);
    barrel.add(new THREE.Mesh(new THREE.TorusGeometry(0.32 * s, 0.02, 6, 16).rotateX(Math.PI / 2)).translateY(0.18));
  }

  for (let i = 0; i < 5; i++) {
    const crate = box(0.7, 0.5, 0.7, matWood, -4.2 + (i % 2) * 0.75, 0.25 + Math.floor(i / 2) * 0.52, 3.4 + (i % 3) * 0.2);
    crate.rotation.y = Math.random();
    world.add(crate);
  }

  // ceiling pipes + a hanging chain
  for (let i = 0; i < 3; i++) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, W, 8), matMetal);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(0, H - 0.3 - i * 0.14, -3 + i * 3.4);
    pipe.castShadow = true;
    world.add(pipe);
  }
  const chain = new THREE.Group();
  chain.position.set(-2.6, H - 0.1, -1.4);
  for (let i = 0; i < 9; i++) {
    const l = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.014, 5, 10), matMetal);
    l.position.y = -i * 0.11;
    l.rotation.x = i % 2 ? Math.PI / 2 : 0;
    chain.add(l);
  }
  world.add(chain);

  // ---- inches from the player's feet: the cup and the cigarette ----
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.028, 0.08, 10, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.5, side: THREE.DoubleSide }));
  cup.position.set(0.28, 0.04, -0.55);
  cup.rotation.set(0.2, 0, 1.35);
  cup.castShadow = true;
  world.add(cup);

  const butt = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.055, 6),
    new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 1 }));
  butt.position.set(-0.21, 0.008, -0.44);
  butt.rotation.set(Math.PI / 2, 0, 0.7);
  world.add(butt);
  const ember = new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xff6a22 }));
  ember.position.set(0, 0, -0.028);
  butt.add(ember);

  const smoke = new THREE.Group();
  const smokeMap = smokeTex();
  const puffs = [];
  for (let i = 0; i < 9; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeMap, transparent: true, opacity: 0.16, depthWrite: false }));
    sp.scale.setScalar(0.05 + i * 0.012);
    smoke.add(sp);
    puffs.push({ sp, off: i / 9 });
  }
  smoke.position.set(-0.21, 0.03, -0.44);
  world.add(smoke);

  // ---- lights ----
  // every lamp in the cell hangs off the cell group, so switching the whole
  // environment off takes its light with it and cannot bleed into the silo
  world.add(new THREE.HemisphereLight(0x4b4232, 0x0a0908, 0.55));

  const bulb = new THREE.Group();
  bulb.position.set(0.5, H - 0.55, -1.5);
  world.add(bulb);
  bulb.add(box(0.02, 0.55, 0.02, matDark, 0, 0.28, 0));
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.2, 14, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 0.7, metalness: 0.6, side: THREE.DoubleSide }));
  shade.position.y = 0.02; shade.rotation.x = Math.PI;
  bulb.add(shade);
  const bulbMesh = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xffd9a0 }));
  bulbMesh.position.y = -0.12;
  bulb.add(bulbMesh);

  const bulbLight = new THREE.PointLight(0xffbe7a, 26, 16, 2);
  bulbLight.position.copy(bulbMesh.position);
  bulbLight.castShadow = true;
  bulbLight.shadow.mapSize.set(1024, 1024);
  bulbLight.shadow.bias = -0.0016;
  bulbLight.shadow.camera.far = 18;
  bulb.add(bulbLight);

  const coldFill = new THREE.DirectionalLight(0x6f8bb5, 0.9);
  coldFill.position.set(-1, 2.4, -8);
  coldFill.target.position.set(0, 1, 0);
  world.add(coldFill, coldFill.target);
  // the room is a concrete box, not a void — nothing in it should go pure black
  world.add(new THREE.AmbientLight(0x39404d, 1.35));

  const cityLight = new THREE.PointLight(0xeaf2ff, 0, 34, 2);
  cityLight.position.set(0, 2.2, -D / 2 - 1.6);
  world.add(cityLight);

  // ---- dust motes: lit by the bulb in 3D, else they read as stars ----
  const BULB = new THREE.Vector3(bulb.position.x, bulb.position.y - 0.12, bulb.position.z);
  const N = 700;
  const pos = new Float32Array(N * 3);
  const vel = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 11;
    pos[i * 3 + 1] = Math.random() * 3.6;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 11;
    vel[i * 3] = (Math.random() - 0.5) * 0.05;
    vel[i * 3 + 1] = 0.01 + Math.random() * 0.04;
    vel[i * 3 + 2] = (Math.random() - 0.5) * 0.05;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  dustGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    vertexColors: true, size: 0.012, transparent: true, opacity: 0.7, depthWrite: false,
  }));
  world.add(dust);

  // ---- particle burst pool (blood, concrete chips, sparks) ----
  const MAXP = 260;
  const pPos = new Float32Array(MAXP * 3);
  const pCol = new Float32Array(MAXP * 3);
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3).setUsage(THREE.DynamicDrawUsage));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3).setUsage(THREE.DynamicDrawUsage));
  const parts = new THREE.Points(pGeo, new THREE.PointsMaterial({
    size: 0.05, vertexColors: true, transparent: true, opacity: 1, depthWrite: false,
  }));
  parts.frustumCulled = false;
  world.add(parts);
  const pool = [];
  for (let i = 0; i < MAXP; i++) pool.push({ life: 0, x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0 });
  let cursor = 0;
  pPos.fill(-999);

  function burst(origin, count, color, spread, speed, up = 1, size = 0.05) {
    const [r, g, b] = color;
    for (let i = 0; i < count; i++) {
      const p = pool[cursor];
      const idx = cursor * 3;
      cursor = (cursor + 1) % MAXP;
      p.life = 0.5 + Math.random() * 0.9;
      p.x = origin.x + (Math.random() - 0.5) * 0.05;
      p.y = origin.y + (Math.random() - 0.5) * 0.05;
      p.z = origin.z + (Math.random() - 0.5) * 0.05;
      const a = Math.random() * Math.PI * 2, e = Math.random() * spread;
      p.vx = Math.cos(a) * e * speed;
      p.vy = Math.random() * speed * up;
      p.vz = Math.sin(a) * e * speed;
      pCol[idx] = r; pCol[idx + 1] = g; pCol[idx + 2] = b;
      parts.material.size = size;
    }
  }

  // ---- flying tool chunks ----
  const debris = [];
  const debrisMat = new THREE.MeshStandardMaterial({ color: 0x9a8d7a, roughness: 0.5, metalness: 0.7 });
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.05 + Math.random() * 0.1, 0.04, 0.04), debrisMat);
    m.visible = false;
    world.add(m);
    debris.push({ m, v: new THREE.Vector3(), av: new THREE.Vector3(), alive: false, settle: 0 });
  }

  const api = {
    group: world, doorPivot, door, cabinet: cabinetLight, cityPlane, cityBlocks,
    cityLight, bulbLight, bulbMesh, bulb, coldFill, ember,

    burst(pos, count, color, spread = 0.8, speed = 2, up = 1, size = 0.05) {
      const v = pos instanceof THREE.Vector3 ? pos : new THREE.Vector3(pos.x, pos.y, pos.z);
      burst(v, count, color, spread, speed, up, size);
    },

    breakFloor(pos, radius = 1.15) {
      const x = THREE.MathUtils.clamp(pos.x, -W / 2 + radius + 0.1, W / 2 - radius - 0.1);
      const z = THREE.MathUtils.clamp(pos.z, -D / 2 + radius + 0.1, D / 2 - radius - 0.1);
      if (floorCraterRecords.some((c) => Math.hypot(c.x - x, c.z - z) < c.radius + radius + 0.35)) return false;
      floorCraterRecords.push({ x, z, radius });
      rebuildFloorWithCraterHoles();

      const pit = new THREE.Mesh(
        new THREE.CircleGeometry(radius * 0.96, 48),
        new THREE.MeshStandardMaterial({ color: 0x08090d, roughness: 1, side: THREE.DoubleSide }),
      );
      pit.rotation.x = -Math.PI / 2;
      pit.position.set(x, -0.42, z);
      world.add(pit);

      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(radius, 0.075, 8, 64),
        new THREE.MeshStandardMaterial({ color: 0x514b45, roughness: 0.98, flatShading: true }),
      );
      rim.rotation.x = -Math.PI / 2;
      rim.position.set(x, 0.018, z);
      rim.receiveShadow = true;
      world.add(rim);
      return true;
    },

    throwTools(from, power = 1) {
      for (const t of toolMeshes) {
        const w = new THREE.Vector3();
        t.getWorldPosition(w);
        t.position.x += (Math.random() - 0.5) * 0.1;
        debris.forEach((d) => {
          if (d.alive) return;
          d.alive = true; d.settle = 0;
          d.m.visible = true;
          d.m.position.copy(w);
          d.m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
          d.v.set((Math.random() - 0.5) * 3.4 * power, (1.6 + Math.random() * 2.6) * power, (-1.4 - Math.random() * 2.2) * power);
          d.av.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
        });
      }
      toolMeshes.forEach((t) => { t.visible = false; });
    },

    doorOpen: 0,
    openDoor() { api._opening = true; },

    /** Section Select back into the cell: the door is shut, the light under it is
     *  a sliver again, and the cabinet has not been emptied across the room */
    resetCell() {
      api._opening = false;
      api.doorOpen = 0;
      doorPivot.rotation.y = 0;
      cityLight.intensity = 0;
      cityPlane.material.opacity = 0;
      cityBlocks.visible = false;
      gapSliver.visible = true;
      jambSeam.visible = true;
      doorShaft.material.opacity = 0.22;
      scene.fog.density = 0.05;
      toolMeshes.forEach((t) => { t.visible = true; });
      for (const d of debris) { d.alive = false; d.settle = 0; d.m.visible = false; }
      cabinet.rotation.x = 0;
      cabinet.position.y = 0;
      cabinet.userData.jolt = 0;
    },

    /** the cell is a box: you stop at the walls */
    clamp(pos) {
      pos.x = THREE.MathUtils.clamp(pos.x, -5.9, 5.9);
      pos.z = THREE.MathUtils.clamp(pos.z, -5.9, 5.9);
      pos.y = 0;
    },
    onDeck() { return true; },
    setVisible(v) { world.visible = v; },

    update(dt, t) {
      // failing bulb
      const flick = 0.82 + 0.18 * Math.sin(t * 11.3) + (Math.random() < 0.014 ? -0.55 : 0);
      bulbLight.intensity = 26 * Math.max(0.15, flick);
      bulbMesh.material.color.setRGB(1, 0.82 * flick + 0.1, 0.55 * flick + 0.08);
      bulb.rotation.z = Math.sin(t * 0.9) * 0.014;
      chain.rotation.z = Math.sin(t * 0.7 + 1) * 0.05;

      // cigarette smoke curling lazily upward
      for (const { sp, off } of puffs) {
        const life = ((t * 0.24 + off) % 1);
        sp.position.set(Math.sin(life * 5 + off * 6) * 0.05 * life, life * 1.15, Math.cos(life * 3.4 + off * 4) * 0.045 * life);
        sp.material.opacity = 0.2 * Math.sin(life * Math.PI);
        sp.scale.setScalar(0.035 + life * 0.16);
      }
      ember.material.color.setRGB(1, 0.32 + 0.12 * Math.sin(t * 2.2), 0.06);

      // dust — lit by the bulb, so it should vanish in the dark corners
      const a = dustGeo.attributes.position, dc = dustGeo.attributes.color;
      const lit = bulbLight.intensity / 26;
      for (let i = 0; i < N; i++) {
        const j = i * 3;
        a.array[j] += vel[j] * dt;
        a.array[j + 1] += vel[j + 1] * dt;
        a.array[j + 2] += vel[j + 2] * dt;
        if (a.array[j + 1] > 3.7) a.array[j + 1] = 0.05;
        if (Math.abs(a.array[j]) > 5.5) vel[j] *= -1;
        if (Math.abs(a.array[j + 2]) > 5.5) vel[j + 2] *= -1;
        const fall = Math.max(0, 1 - Math.hypot(
          a.array[j] - BULB.x, a.array[j + 1] - BULB.y, a.array[j + 2] - BULB.z) / 3.8);
        const v = fall * fall * lit;
        dc.array[j] = 0.85 * v; dc.array[j + 1] = 0.76 * v; dc.array[j + 2] = 0.6 * v;
      }
      a.needsUpdate = true;
      dc.needsUpdate = true;

      // particles
      const pa = pGeo.attributes.position;
      for (let i = 0; i < MAXP; i++) {
        const p = pool[i];
        if (p.life > 0) {
          p.life -= dt;
          p.vy -= 9.6 * dt;
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          if (p.y < 0.01) { p.y = 0.01; p.vy *= -0.28; p.vx *= 0.6; p.vz *= 0.6; }
          pa.array[i * 3] = p.life > 0 ? p.x : -999;
          pa.array[i * 3 + 1] = p.life > 0 ? p.y : -999;
          pa.array[i * 3 + 2] = p.life > 0 ? p.z : -999;
        } else {
          pa.array[i * 3 + 1] = -999;
        }
      }
      pa.needsUpdate = true;

      // debris
      for (const d of debris) {
        if (!d.alive) continue;
        d.v.y -= 11 * dt;
        d.m.position.addScaledVector(d.v, dt);
        d.m.rotation.x += d.av.x * dt;
        d.m.rotation.y += d.av.y * dt;
        d.m.rotation.z += d.av.z * dt;
        if (d.m.position.y < 0.02) {
          d.m.position.y = 0.02;
          if (Math.abs(d.v.y) < 0.4 && d.v.length() < 0.7) { d.settle += dt; }
          d.v.y *= -0.32; d.v.x *= 0.62; d.v.z *= 0.62;
          d.av.multiplyScalar(0.55);
          if (d.settle > 0.7) d.alive = false;
        }
      }

      // door swing + city flood
      if (api._opening && api.doorOpen < 1) {
        api.doorOpen = Math.min(1, api.doorOpen + dt * 0.6);
        const e = 1 - Math.pow(1 - api.doorOpen, 3);
        doorPivot.rotation.y = -e * 1.75;
        cityLight.intensity = e * 55;
        cityPlane.material.opacity = Math.min(1, e * 1.3);
        cityBlocks.visible = e > 0.05;
        scene.fog.density = 0.05 - e * 0.033;
        gapSliver.visible = e < 0.4;
        jambSeam.visible = e < 0.4;
        doorShaft.material.opacity = 0.22 * (1 - e);
      }
    },
  };

  return api;
}
