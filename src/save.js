// Nothing here has a server behind it, so a refresh has to hand back the same run:
// the room you were standing in, how much of you was left, and what the rift did
// to your knuckles. localStorage is the only thing that survives closing the tab,
// which is the reason the record stays this small.

const KEY = 'bound-escape.run.v1';
const V = 1;

/** Where SECTION SELECT can put you. `sec` is the director's section number and
 *  `phase` that room's cold open. A milestone only becomes selectable once the run
 *  has actually stood in it, so the list grows by playing. */
export const MILESTONES = [
  { id: 'c1s1', ch: 1, sec: 1, phase: 'awaken', name: 'THE CELL', line: 'Ground Zero — bound to a fabrication chair' },
  { id: 'c1s2', ch: 1, sec: 2, phase: 'breach', name: 'THE OUTER RING', line: 'The catwalk — riot shields, and no bottom' },
  { id: 'c1s3', ch: 1, sec: 3, phase: 'crossing', name: 'THE TURBINE CROSSING', line: 'The sealed platform — three storeys of blades' },
  { id: 'c1s4', ch: 1, sec: 4, phase: 'chute', name: 'THE ANOMALY CORE', line: 'Under the intake — the rift that rewrites your knuckles' },
  { id: 'c1s5', ch: 1, sec: 5, phase: 'cargo', name: 'CARGO ENTRY', line: 'The freight gantry — find the open lift into the lower city' },
];

/** The beats a refresh may drop straight back into, because each one either spawns
 *  its own actors or needs nothing but the player on the deck. Anything else — a
 *  guard already down, a QTE already half-pressed — routes to the opening of the
 *  room instead, which is the difference between a rescue and a soft lock. */
export const RESUME = {
  1: ['awaken', 'approach'],
  2: ['breach', 'wall', 'bridge'],
  3: ['crossing', 'scouts', 'leap'],
  4: ['chute', 'rift', 'troopers'],
  5: ['cargo'],
};

/** The room that hands you the ability. Jumping into anything before it means the
 *  rift rolls you again — which is the entire point of coming back. */
export const ROLL_SEC = 4;

const BEAT = {
  awaken: 'waking up in the cell',
  approach: 'the two men in the room',
  strike: 'the bruiser on the concrete',
  escalate: 'the second guard’s nightstick',
  freedom: 'the zip-ties',
  breach: 'the ring, before the doors start cycling',
  sprint: 'the ring run',
  wall: 'the shield wall',
  scald: 'the steam valve',
  bridge: 'the bridge out to the platform',
  crossing: 'the sealed platform',
  scouts: 'the scouts coming down the cable',
  leap: 'the intake',
  chute: 'the exhaust chute',
  rift: 'the rift',
  troopers: 'the things that came out of the pods',
  cargo: 'the cargo gantry and freight lift',
};

export const beatName = (phase) => BEAT[phase] || 'a room you have not met yet';
export const byId = (id) => MILESTONES.find((m) => m.id === id) || null;
export const bySection = (sec) => MILESTONES.find((m) => m.sec === sec) || null;

/** the safest re-entry at or after the beat you actually stopped on */
export function resumePhase(sec, phase) {
  const list = RESUME[sec] || (bySection(sec) ? [bySection(sec).phase] : ['awaken']);
  return list.includes(phase) ? phase : list[0];
}

export function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    // an unreadable record is not a broken game: it is a run that never happened
    return s && s.v === V && typeof s.section === 'number' ? s : null;
  } catch { return null; }
}

/** @param {object} patch the run state; the version and timestamp are stamped here */
export function persist(patch) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: V, at: Date.now(), ...patch }));
  } catch { /* private mode, a full quota, a disabled store: the game just plays on */ }
}

export function clearRun() {
  try { localStorage.removeItem(KEY); } catch { /* nothing to forget */ }
}
