// Keyboard + mouse + gamepad. The mouse is only captured when the player asks
// for it with Esc. One abstraction, edge-detected actions.
const DEAD = 0.14;

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.held = new Set();
    this.edges = new Set();
    this.look = { x: 0, y: 0 };
    this.prev = { x: 0, y: 0, at: 0 };
    this.locked = false;
    this.lookScale = 1;
    this.padPrev = {};
    this.pad = null;
    this.padEdges = new Set();
    this.sensitivity = 0.0022;
    // a free cursor has to be swept back across the window to keep turning, so
    // it gets more angle per pixel than a grabbed one
    this.freeSensitivity = 0.003;

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.held.add(e.code);
      this.edges.add(e.code);
      // Use the typed letter as well as the physical key position. This keeps
      // letter prompts (especially Z for the restraints) working on alternate
      // keyboard layouts where the character and e.code can differ.
      if (e.key?.toLowerCase() === 'z') {
        this.held.add('KeyZ');
        this.edges.add('KeyZ');
      }
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => {
      this.held.delete(e.code);
      if (e.key?.toLowerCase() === 'z') this.held.delete('KeyZ');
    });
    addEventListener('blur', () => this.held.clear());

    canvas.addEventListener('mousedown', (e) => {
      // A click has to punch whether or not the pointer is captured.
      const k = e.button === 2 ? 'MB_RIGHT' : e.button === 1 ? 'MB_MID' : 'MB_LEFT';
      this.held.add(k);
      this.edges.add(k);
    });
    addEventListener('mouseup', (e) => {
      const k = e.button === 2 ? 'MB_RIGHT' : e.button === 1 ? 'MB_MID' : 'MB_LEFT';
      this.held.delete(k);
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    addEventListener('mousemove', (e) => {
      // Relative first-person look: only the distance the mouse travelled turns
      // the head — never where the cursor happens to sit.
      if (this.locked) {
        // captured: the browser reports the true delta, however far you swept
        this.look.x += e.movementX || 0;
        this.look.y += e.movementY || 0;
        return;
      }
      const now = performance.now();
      // a trail older than a few frames is the cursor re-entering the window — a
      // jump, not a sweep, so it must not snap the neck
      if (now - this.prev.at > 250) {
        this.prev.x = e.clientX; this.prev.y = e.clientY; this.prev.at = now;
        return;
      }
      // some embedded browsers report no movement deltas; the cursor's trail is
      // the same number
      const cap = (v) => Math.max(-120, Math.min(120, v));
      this.look.x += cap(e.movementX || e.clientX - this.prev.x);
      this.look.y += cap(e.movementY || e.clientY - this.prev.y);
      this.prev.x = e.clientX; this.prev.y = e.clientY; this.prev.at = now;
    });
  }

  /** take the pointer for unbounded first-person look */
  grab() {
    if (this.locked) return;
    // Chrome rejects the promise while its post-Escape cooldown is running, and an
    // unhandled rejection used to kill the start.
    try {
      const r = this.canvas.requestPointerLock?.();
      if (r && r.catch) r.catch(() => {});
    } catch { /* capture unavailable; the free cursor still looks */ }
  }
  /** hand it back — a menu is unusable with the cursor welded to the canvas */
  release() {
    if (this.locked) document.exitPointerLock?.();
  }

  setLookScale(k) {
    this.lookScale = k;
    this.sensitivity = 0.0022 * k;
    this.freeSensitivity = 0.003 * k;
  }

  down(code) { return this.held.has(code); }
  pressed(code) { return this.edges.has(code) || this.padEdges.has(code); }

  /** analogue lean axis: WASD/arrows + left stick */
  axis(out) {
    let x = 0, y = 0;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    if (this.down('KeyW') || this.down('ArrowUp')) y += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y -= 1;
    const p = this.pad;
    if (p) {
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      if (Math.abs(ax) > DEAD) x += ax;
      if (Math.abs(ay) > DEAD) y -= ay;
    }
    out.set(x, y);
    if (out.length() > 1) out.normalize();
    return out;
  }

  /** look delta for this frame (mouse + right stick) */
  lookDelta(out) {
    let x = this.look.x, y = this.look.y;
    const p = this.pad;
    if (p) {
      const rx = p.axes[2] || 0, ry = p.axes[3] || 0;
      if (Math.abs(rx) > DEAD) x += rx * 9;
      if (Math.abs(ry) > DEAD) y += ry * 9;
    }
    out.set(x, y);
    return out;
  }

  update() {
    this.padEdges = new Set();
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    this.pad = null;
    for (const gp of pads) if (gp && gp.connected) { this.pad = gp; break; }
    if (this.pad) {
      const map = {
        0: 'Space', 1: 'KeyE', 2: 'KeyF', 3: 'KeyR',
        6: 'MB_LEFT', 7: 'MB_RIGHT', 4: 'ShiftLeft', 5: 'ShiftLeft',
        9: 'Escape',
      };
      for (const [i, code] of Object.entries(map)) {
        const on = !!this.pad.buttons[i]?.pressed;
        if (on && !this.padPrev[i]) this.padEdges.add(code);
        if (on) this.held.add(code); else if (this.padPrev[i]) this.held.delete(code);
        this.padPrev[i] = on;
      }
    }
  }

  rumble(amount, ms = 120) {
    const act = this.pad?.vibrationActuator;
    if (act?.playEffect) act.playEffect('dual-rumble', {
      duration: ms, strongMagnitude: Math.min(1, amount), weakMagnitude: Math.min(1, amount * 0.6),
    }).catch(() => {});
  }

  endFrame() {
    this.edges.clear();
    this.look.x = 0; this.look.y = 0;
  }
}
