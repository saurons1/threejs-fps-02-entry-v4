// Bot AI: 5v5 objective play. Attackers push a site, plant, and hold it;
// defenders hold angles, rotate on contact, and retake + defuse after a plant.
// Vision cones, hearing, reaction times, bursts, and per-bot skill.
import * as THREE from 'three';
import { clamp, angDiff, angTurn, gauss } from './util.js';
import { WEAPONS, fireWeapon, startReload, tickReload } from './weapons.js';
import { forwardOf } from './player.js';

export const DIFF = {
  recruit: { react: 0.55, aimMul: 1.65, dmgMul: 0.8, label: 'RECRUIT' },
  veteran: { react: 0.30, aimMul: 1.0, dmgMul: 1.0, label: 'VETERAN' },
  elite: { react: 0.12, aimMul: 0.62, dmgMul: 1.18, label: 'ELITE' },
};
const WOLF_NAMES = ['EMBER', 'NORTH', 'SABLE', 'FROST'];
const WARDEN_NAMES = ['HALO', 'PIKE', 'BRINE', 'KESTREL', 'ORCA'];
const WOLF_COLOR = 0xd98a2b, WARDEN_COLOR = 0x3f8fd2;

function nameTagTexture(name, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(4,10,20,0.72)';
  g.beginPath(); g.roundRect(6, 8, 244, 48, 10); g.fill();
  g.fillStyle = color; g.font = 'bold 30px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(name, 128, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function buildBotBody(name, team, scene) {
  const color = team === 'W' ? WOLF_COLOR : WARDEN_COLOR;
  const group = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color, roughness: 0.75 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c222c, roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc9a184, roughness: 0.8 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.36), suit);
  torso.position.y = 1.05; group.add(torso);
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.4, 0.4), dark);
  vest.position.y = 1.1; group.add(vest);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), skin);
  head.position.y = 1.56; group.add(head);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), dark);
  helmet.position.y = 1.6; group.add(helmet);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.24), dark);
  legL.position.set(-0.16, 0.35, 0); group.add(legL);
  const legR = legL.clone(); legR.position.x = 0.16; group.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.18), suit);
  armL.position.set(-0.4, 1.05, 0.1); group.add(armL);
  const armR = armL.clone(); armR.position.x = 0.4; group.add(armR);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.85), dark);
  gun.position.set(0.18, 1.15, -0.3); group.add(gun);
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({
    map: nameTagTexture(name, team === 'W' ? '#ffb347' : '#8fd4ff'), transparent: true, depthWrite: false,
  }));
  tag.scale.set(2.2, 0.55, 1); tag.position.y = 2.05; group.add(tag);
  scene.add(group);
  return { group, tag };
}

export function createBot(G, team, idx, role, site, spawn) {
  const rng = G.rng;
  const name = team === 'W' ? WOLF_NAMES[idx] : WARDEN_NAMES[idx];
  const weaponId = role === 'rusher' ? 'smg' : role === 'holder' && idx === 4 ? 'dmr'
    : role === 'flanker' ? 'shotgun' : 'rifle';
  const w = WEAPONS[weaponId];
  const body = buildBotBody(name, team, G.scene);
  const bot = {
    isBot: true, name, team, role, site, alive: true,
    x: spawn[0], z: spawn[1], yaw: team === 'W' ? 0 : Math.PI, pitch: 0,
    hp: 100, armor: 0, hasHelmet: false, eyeH: 1.55, radius: 0.45,
    skill: 0.85 + rng() * 0.3,
    st: { id: weaponId, mag: w.mag, reserve: w.reserve, cooldown: 0, reloading: false, reloadT: 0, burst: 0, burstT: 0 },
    state: 'advance', path: [], pathI: 0, dest: null,
    target: null, lastSeen: null, reactT: 0, think: rng() * 0.2,
    home: { x: spawn[0], z: spawn[1] },
    plantT: 0, defuseT: 0, moving: false, speed: 3.6, stepT: 0,
    kills: 0, deaths: 0, aimSpread: 1, dmgMul: 1,
    body, spotT: 0, // last time this bot was spotted by the enemy team
  };
  if (role === 'rusher') bot.speed = 4.2;
  if (role === 'carrier') bot.speed = 3.4;
  return bot;
}

export function setupRoundBots(G) {
  const s = G.state;
  const rng = G.rng;
  // Attackers: carrier (plants), 2 escorts, rusher, flanker. Site picked per round.
  const site = rng() < 0.5 ? 'A' : 'B';
  s.attackSite = site;
  const roles = ['carrier', 'escort', 'escort', 'rusher', 'flanker'];
  s.bots = [];
  for (let i = 0; i < 4; i++) {
    const b = createBot(G, 'W', i, roles[i], site, G.worldSpawn('attack', i + 1));
    b.home = { x: b.x, z: b.z };
    s.bots.push(b);
  }
  // Defenders: 2 hold A, 2 hold B, 1 mid roamer.
  const defs = [
    { role: 'holder', site: 'A', home: [-18, -18] },
    { role: 'holder', site: 'A', home: [-26, -8] },
    { role: 'holder', site: 'B', home: [18, -18] },
    { role: 'holder', site: 'B', home: [28, -8] },
    { role: 'holder', site: null, home: [0, -9] },
  ];
  for (let i = 0; i < 5; i++) {
    const d = defs[i];
    const b = createBot(G, 'D', i, d.role, d.site, G.worldSpawn('defend', i));
    b.home = { x: d.home[0], z: d.home[1] };
    s.bots.push(b);
  }
  // The player carries the charge if the carrier bot is not present (4 bots + player).
  s.bomb.carrier = s.bots[0];
}

function visibleEnemy(G, bot) {
  const s = G.state;
  const diff = DIFF[s.difficulty];
  const smokes = G.effects.smokeClouds();
  let best = null, bestD = Infinity;
  const cands = [];
  if (s.player.alive && s.player.team !== bot.team) cands.push(s.player);
  for (const b of s.bots) if (b.alive && b.team !== bot.team) cands.push(b);
  for (const e of cands) {
    const dx = e.x - bot.x, dz = e.z - bot.z;
    const d = Math.hypot(dx, dz);
    if (d > 46 || d > bestD) continue;
    const ang = Math.atan2(-dx, -dz);
    if (Math.abs(angDiff(bot.yaw, ang)) > 1.15 && d > 6) continue; // outside vision cone
    if (!G.world.losClear(bot.x, bot.z, e.x, e.z, smokes)) continue;
    best = e; bestD = d;
  }
  return best ? { ent: best, dist: bestD } : null;
}

function moveAlongPath(G, bot, dt) {
  if (!bot.path || bot.pathI >= bot.path.length) { bot.moving = false; return true; }
  const wp = G.world.wp[bot.path[bot.pathI]];
  const dx = wp.x - bot.x, dz = wp.z - bot.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.7) { bot.pathI++; return bot.pathI >= bot.path.length; }
  const want = Math.atan2(-dx, -dz);
  bot.yaw = angTurn(bot.yaw, want, 5.5 * dt);
  const f = forwardOf(bot.yaw);
  const nx = bot.x + f.x * bot.speed * dt, nz = bot.z + f.z * bot.speed * dt;
  const out = G.world.collide(nx, nz, bot.radius);
  bot.x = out.x; bot.z = out.z;
  bot.moving = true;
  return false;
}

function setPath(G, bot, tx, tz) {
  const p = G.world.findPath(bot.x, bot.z, tx, tz);
  bot.path = p; bot.pathI = 0;
}

function botFire(G, bot, dt) {
  const s = G.state, diff = DIFF[s.difficulty];
  const st = bot.st;
  if (st.reloading) { tickReload(G, bot, st, dt); return; }
  if (st.cooldown > 0) { st.cooldown -= dt; return; }
  const t = bot.target;
  if (!t || !t.ent.alive) return;
  if (st.mag <= 0) { startReload(G, bot, st); return; }
  if (st.burst <= 0) {
    if (st.burstT > 0) { st.burstT -= dt; return; }
    st.burst = 3 + Math.floor(G.rng() * 3);
    st.burstT = 0.45 + G.rng() * 0.6;
  }
  // Aim: face the target, then fire with an error model.
  const dx = t.ent.x - bot.x, dz = t.ent.z - bot.z;
  const want = Math.atan2(-dx, -dz);
  bot.yaw = angTurn(bot.yaw, want, 7 * dt);
  const targetMoving = t.ent.moving || Math.hypot(t.ent.vx || 0, t.ent.vz || 0) > 1;
  const dist = t.dist;
  bot.aimSpread = (0.85 + dist * 0.045) * (targetMoving ? 1.45 : 1) * diff.aimMul / bot.skill;
  bot.dmgMul = diff.dmgMul;
  bot.pitch = 0;
  // Lead the target slightly at range.
  if (fireWeapon(G, bot, st)) st.burst--;
  if (st.burst <= 0) st.burstT = 0.45 + G.rng() * 0.6;
}

export function updateBot(G, bot, dt) {
  const s = G.state;
  if (!bot.alive) return;
  const diff = DIFF[s.difficulty];
  bot.think -= dt;
  // Periodic re-evaluation.
  if (bot.think <= 0) {
    bot.think = 0.15;
    const vis = visibleEnemy(G, bot);
    if (vis) {
      if (!bot.target) bot.reactT = diff.react * (1.15 - bot.skill * 0.3);
      bot.target = vis;
      bot.lastSeen = { x: vis.ent.x, z: vis.ent.z, t: s.time };
      vis.ent.spotT = s.time;
    } else if (bot.target && s.time - (bot.lastSeen ? bot.lastSeen.t : 0) > 2.2) {
      bot.target = null;
    }
    // Hearing: recent nearby gunfire pulls bots toward it.
    if (!bot.target) {
      for (const n of s.noise) {
        if (s.time - n.t > 1.2) continue;
        const d = Math.hypot(n.x - bot.x, n.z - bot.z);
        if (d < 13 && d > 2) {
          bot.lastSeen = { x: n.x, z: n.z, t: s.time };
          if (bot.state === 'hold') { bot.state = 'investigate'; setPath(G, bot, n.x, n.z); }
        }
      }
    }
    // Objective decisions.
    decide(G, bot);
  }
  // Reaction delay before firing.
  if (bot.target) {
    bot.reactT -= dt;
    if (bot.reactT <= 0) botFire(G, bot, dt);
    // Face the target while engaging (unless planting/defusing).
    if (bot.state !== 'plant' && bot.state !== 'defuse') {
      const dx = bot.target.ent.x - bot.x, dz = bot.target.ent.z - bot.z;
      bot.yaw = angTurn(bot.yaw, Math.atan2(-dx, -dz), 6 * dt);
    }
  }
  // Movement by state.
  switch (bot.state) {
    case 'advance': case 'investigate': case 'retake': case 'rotate': case 'escort': {
      const arrived = moveAlongPath(G, bot, dt);
      if (arrived && bot.state === 'advance') bot.state = 'hold';
      if (arrived && bot.state === 'investigate') bot.state = 'hold';
      break;
    }
    case 'plant': {
      bot.moving = false;
      bot.plantT += dt;
      if (bot.plantT >= 3.5) G.plantBomb(bot);
      break;
    }
    case 'defuse': {
      bot.moving = false;
      bot.defuseT += dt;
      if (bot.defuseT >= 5) G.defuseBomb(bot);
      break;
    }
    case 'hold': default: {
      bot.moving = false;
      // Slow scan: sweep the yaw across the hold sector.
      bot.yaw += Math.sin(s.time * 0.5 + bot.home.x) * 0.12 * dt;
      break;
    }
  }
  // Footsteps audible near the player.
  const pd = Math.hypot(bot.x - s.player.x, bot.z - s.player.z);
  if (bot.moving && pd < 9) {
    bot.stepT -= dt;
    if (bot.stepT <= 0) { bot.stepT = 0.55; G.audio.step(false); }
  }
  // Sync the 3D body.
  bot.body.group.position.set(bot.x, 0, bot.z);
  bot.body.group.rotation.y = bot.yaw; // model front is local -z; yaw 0 faces -z
  bot.body.group.visible = bot.alive;
  // Name tag faces the camera automatically (sprite). Hide tags of far enemies
  // when the player is scoped? Keep them — they read well in screenshots.
  tickReload(G, bot, bot.st, dt);
}

function decide(G, bot) {
  const s = G.state, bomb = s.bomb;
  if (bot.state === 'plant' || bot.state === 'defuse') return;
  const site = bot.site ? (bot.site === 'A' ? G.worldSites.A : G.worldSites.B) : null;
  if (bot.team === 'W') {
    if (bomb.state === 'planted') {
      // Hold the planted site: move to a guard spot near it and wait.
      if (bot.state !== 'hold') {
        const gx = bomb.siteX + (bot.role === 'carrier' ? -3 : 3);
        setPath(G, bot, gx, bomb.siteZ + 2);
        bot.state = 'advance';
      }
      return;
    }
    if (bot.role === 'carrier') {
      const d = site ? Math.hypot(site.x - bot.x, site.z - bot.z) : 99;
      if (site && d < site.r - 0.5 && !bot.target) {
        bot.state = 'plant'; bot.plantT = 0;
        G.comms.say(s, 'plant', { site: site.name });
        return;
      }
      if (bot.state !== 'advance' || !bot.path.length) {
        setPath(G, bot, site.x, site.z); bot.state = 'advance';
      }
      return;
    }
    if (bot.role === 'escort') {
      const carrier = s.bots[0];
      if (carrier && carrier.alive) {
        const d = Math.hypot(carrier.x - bot.x, carrier.z - bot.z);
        if (d > 6) { setPath(G, bot, carrier.x + 2, carrier.z + 1); bot.state = 'escort'; }
        else bot.state = 'hold';
      }
      return;
    }
    if (bot.role === 'rusher' || bot.role === 'flanker') {
      if (bot.state === 'hold' || !bot.path.length) {
        // Flanker takes the far lane: if site is A, go via mid/B side first.
        const via = bot.role === 'flanker'
          ? (site === G.worldSites.A ? { x: 12, z: 4 } : { x: -12, z: 4 })
          : null;
        if (via && bot.pathI === 0 && !bot._flanked) {
          bot._flanked = true;
          setPath(G, bot, via.x, via.z); bot.state = 'advance';
          bot._afterFlank = { x: site.x, z: site.z };
        } else if (bot._afterFlank) {
          setPath(G, bot, bot._afterFlank.x, bot._afterFlank.z);
          bot._afterFlank = null; bot.state = 'advance';
        } else {
          setPath(G, bot, site.x, site.z); bot.state = 'advance';
        }
      }
      return;
    }
  } else {
    // Defenders.
    if (bomb.state === 'planted') {
      const d = Math.hypot(bomb.siteX - bot.x, bomb.siteZ - bot.z);
      if (d < 3.5 && !bot.target) {
        bot.state = 'defuse'; bot.defuseT = 0;
        G.comms.say(s, 'defuse', { site: bomb.siteName });
        return;
      }
      if (bot.state !== 'retake') {
        setPath(G, bot, bomb.siteX, bomb.siteZ); bot.state = 'retake';
        if (bot.role === 'holder') G.comms.say(s, 'retake', { site: bomb.siteName });
      }
      return;
    }
    if (bot.state === 'hold') {
      // Walk home if displaced.
      const d = Math.hypot(bot.home.x - bot.x, bot.home.z - bot.z);
      if (d > 1.2) { setPath(G, bot, bot.home.x, bot.home.z); bot.state = 'advance'; }
      return;
    }
    if (bot.state === 'advance' && bot.pathI >= (bot.path || []).length) bot.state = 'hold';
  }
}
