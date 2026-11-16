// Radio comms: short seeded callouts bots say on events. Throttled, no repeats.
import { pick } from './rng.js';

const LINES = {
  contact: [
    'Contact {site} — one hostile, engaging!',
    'Eyes on enemy, {site} side.',
    'Hostile spotted near {site}.',
    'Taking fire from {site}!',
  ],
  kill: [
    'Hostile down at {site}.',
    'One less — {site} clear for now.',
    'Dropped one, {site}.',
  ],
  down: [
    'Man down! {name} is out.',
    'We lost {name} near {site}.',
  ],
  plant: [
    'Charge is going down at {site} — cover me!',
    'Planting at {site}. Hold the angles!',
    'Charge set at {site}. Defend it!',
  ],
  planted: [
    'Charge planted at {site}. Forty seconds.',
    'Bomb is live at {site}. They have to come to us.',
  ],
  defuse: [
    'Defusing at {site} — watch my back!',
    'On the charge at {site}. Keep them off me!',
  ],
  defused: [
    'Charge defused. Site is ours.',
    'Bomb disarmed at {site}. Nice work.',
  ],
  push: [
    'Pushing {site} — with me!',
    'Rotating to {site}, cover mid.',
    'Moving up on {site}.',
  ],
  retake: [
    'Retaking {site} — stack up!',
    'Everyone to {site}, bomb is live.',
  ],
  round: [
    'Round {round}. Stay sharp.',
    'New round — check your money, buy what you need.',
  ],
};
const COOLDOWN = 6; // seconds between any two comms lines

export class Comms {
  constructor(rng) { this.rng = rng; this.lastT = -99; this.lastLine = ''; }
  say(state, kind, vars = {}) {
    if (state.time - this.lastT < COOLDOWN) return null;
    const pool = LINES[kind];
    if (!pool) return null;
    let line = pick(this.rng, pool);
    if (line === this.lastLine) line = pool[(pool.indexOf(line) + 1) % pool.length];
    line = line.replace('{site}', vars.site || this._siteName(state, vars))
      .replace('{name}', vars.name || 'a teammate')
      .replace('{round}', String(state.round));
    this.lastT = state.time; this.lastLine = line;
    return line;
  }
  _siteName(state, vars) {
    if (vars.site) return vars.site;
    if (vars.x !== undefined) {
      return vars.x < 0 ? 'RADAR DOME (A)' : 'FUEL DEPOT (B)';
    }
    return 'mid';
  }
}
