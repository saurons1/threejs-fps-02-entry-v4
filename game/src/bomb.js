// The charge: carried by the carrier bot (or the player if they pick it up),
// planted with hold-E at a site, 40 s fuse, defused with hold-E by a defender.
import { SITES } from './world.js';
import { killEntity } from './weapons.js';

export function createBomb() {
  return {
    state: 'carried', // carried | dropped | planted | exploded | defused
    carrier: null, site: null, siteX: 0, siteZ: 0, siteName: '',
    timer: 40, x: 0, z: 0, beepT: 0,
  };
}

// Called when a bot finishes its plant channel.
export function plantBomb(G, bot) {
  const s = G.state, b = s.bomb;
  if (b.state !== 'carried' && b.state !== 'dropped') return;
  const site = s.attackSite === 'A' ? SITES.A : SITES.B;
  b.state = 'planted'; b.site = s.attackSite; b.siteX = site.x; b.siteZ = site.z;
  b.siteName = site.name; b.timer = 40; b.beepT = 0;
  b.x = site.x; b.z = site.z;
  G.comms.say(s, 'planted', { site: site.name });
  G.hud.announce('CHARGE PLANTED AT ' + site.name + ' — 40 SECONDS');
  s.roundTimer = Math.max(s.roundTimer, 45); // round continues past plant
  G.checkRoundEnd();
}

export function defuseBomb(G, bot) {
  const s = G.state, b = s.bomb;
  if (b.state !== 'planted') return;
  b.state = 'defused';
  G.comms.say(s, 'defused', { site: b.siteName });
  G.hud.announce('CHARGE DEFUSED — WARDENS TAKE THE ROUND');
  G.endRound('D', 'Charge defused at ' + b.siteName + '.');
}

// Player plant/defuse channel (hold E). Called every tick while E is held.
export function playerInteract(G, dt) {
  const s = G.state, p = s.player, b = s.bomb;
  if (!p.alive || s.phase !== 'live') return { active: false };
  if (b.state === 'carried' && b.carrier === p) {
    const site = s.attackSite === 'A' ? SITES.A : SITES.B;
    const d = Math.hypot(site.x - p.x, site.z - p.z);
    if (d < site.r) {
      p.plantT = (p.plantT || 0) + dt;
      if (Math.floor(p.plantT * 2) !== Math.floor((p.plantT - dt) * 2)) G.audio.plantBeep(false);
      if (p.plantT >= 3.5) { p.plantT = 0; plantBomb(G, p); return { active: true, done: true }; }
      return { active: true, label: 'PLANTING CHARGE', frac: p.plantT / 3.5 };
    }
    p.plantT = 0;
  }
  if (b.state === 'planted' && p.team === 'W') return { active: false }; // attackers can't defuse
  if (b.state === 'planted') {
    const d = Math.hypot(b.siteX - p.x, b.siteZ - p.z);
    if (d < 3.5) {
      p.defuseT = (p.defuseT || 0) + dt;
      if (Math.floor(p.defuseT * 2) !== Math.floor((p.defuseT - dt) * 2)) G.audio.defuseBeep();
      if (p.defuseT >= 5) { p.defuseT = 0; defuseBomb(G, p); return { active: true, done: true }; }
      return { active: true, label: 'DEFUSING CHARGE', frac: p.defuseT / 5 };
    }
    p.defuseT = 0;
  }
  // Pick up a dropped charge by walking over it.
  if (b.state === 'dropped') {
    const d = Math.hypot(b.x - p.x, b.z - p.z);
    if (d < 1.4) { b.state = 'carried'; b.carrier = p; G.hud.announce('YOU CARRY THE CHARGE — PLANT WITH E'); }
  }
  return { active: false };
}

// If the carrier dies, the charge drops where they fell.
export function dropBombIfCarried(G, dead) {
  const b = G.state.bomb;
  if (b.state === 'carried' && b.carrier === dead) {
    b.state = 'dropped'; b.x = dead.x; b.z = dead.z; b.carrier = null;
    G.hud.announce('CHARGE DROPPED — PICK IT UP');
  }
}

export function updateBomb(G, dt) {
  const s = G.state, b = s.bomb;
  if (b.state !== 'planted') return;
  b.timer -= dt;
  b.beepT -= dt;
  if (b.beepT <= 0) {
    b.beepT = b.timer < 10 ? 0.5 : 1.0;
    G.audio.plantBeep(b.timer < 10);
  }
  if (b.timer <= 0) {
    b.state = 'exploded';
    G.effects.explosion(b.siteX, 1.2, b.siteZ);
    G.audio.explosion();
    // Anyone close to the blast dies.
    const hurt = (e) => {
      if (!e.alive) return;
      const d = Math.hypot(e.x - b.siteX, e.z - b.siteZ);
      if (d < 9) killEntity(G, e, false, null);
    };
    hurt(s.player);
    for (const bot of s.bots) hurt(bot);
    G.endRound('W', 'Charge detonated at ' + b.siteName + '.');
  }
}
