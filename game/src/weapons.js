// Weapons: definitions, hitscan firing, recoil, reload, damage with armor
// and headshots. One fire path serves the player and the bots.
import * as THREE from 'three';
import { clamp, gauss, rayCircle, rayBox } from './util.js';
import { forwardOf } from './player.js';

export const WEAPONS = {
  p9: { id: 'p9', name: 'P-9 SIDEARM', price: 0, dmg: 26, hs: 2.0, rpm: 320, auto: false,
    mag: 12, reserve: 36, spread: 0.9, moveSpread: 2.2, adsSpread: 0.35, recoil: 0.32,
    reload: 1.3, range: 42, falloff: 28, sound: 'pistol', ads: true, kind: 'pistol' },
  smg: { id: 'smg', name: 'SABLE-9 SMG', price: 1500, dmg: 22, hs: 2.0, rpm: 760, auto: true,
    mag: 30, reserve: 90, spread: 1.35, moveSpread: 2.4, adsSpread: 0.5, recoil: 0.22,
    reload: 1.9, range: 34, falloff: 22, sound: 'smg', ads: true, kind: 'smg' },
  rifle: { id: 'rifle', name: 'K-77 VOSTOK', price: 2700, dmg: 33, hs: 2.0, rpm: 600, auto: true,
    mag: 25, reserve: 75, spread: 0.65, moveSpread: 2.3, adsSpread: 0.22, recoil: 0.4,
    reload: 2.2, range: 55, falloff: 30, sound: 'rifle', ads: true, kind: 'rifle' },
  shotgun: { id: 'shotgun', name: 'BORE-12', price: 2200, dmg: 12, hs: 1.8, rpm: 72, auto: false,
    mag: 6, reserve: 18, spread: 4.4, moveSpread: 2.0, adsSpread: 2.6, recoil: 1.5,
    reload: 2.8, range: 20, falloff: 12, pellets: 8, sound: 'shotgun', ads: true, kind: 'shotgun' },
  dmr: { id: 'dmr', name: 'LONGSHOT .50', price: 5500, dmg: 88, hs: 2.0, rpm: 55, auto: false,
    mag: 5, reserve: 15, spread: 0.14, moveSpread: 3.2, adsSpread: 0.02, recoil: 1.1,
    reload: 3.1, range: 80, falloff: 45, sound: 'dmr', ads: true, kind: 'dmr', scope: true },
};
export const WEAPON_ORDER = ['p9', 'smg', 'rifle', 'shotgun', 'dmr'];

export function createLoadout() {
  return { p9: { mag: 12, reserve: 36 } };
}
export function giveWeapon(loadout, id) {
  const w = WEAPONS[id];
  if (!loadout[id]) loadout[id] = { mag: w.mag, reserve: w.reserve };
  return loadout[id];
}

// --- Hitscan ---
// Shooter: {x, z, yaw, pitch, eyeH, team, ...}. Returns hit info or null.
// dirY comes from pitch; spread is applied as angular error on yaw/pitch.
function shootRay(G, shooter, spreadDeg, eyeY) {
  const rng = G.rng;
  const yawErr = gauss(rng) * spreadDeg * Math.PI / 180;
  const pitErr = gauss(rng) * spreadDeg * Math.PI / 180;
  const yaw = shooter.yaw + yawErr;
  const pitch = shooter.pitch + pitErr;
  const dx = -Math.sin(yaw) * Math.cos(pitch);
  const dz = -Math.cos(yaw) * Math.cos(pitch);
  const dy = Math.sin(pitch);
  const ox = shooter.x, oz = shooter.z;
  let bestT = Infinity, bestEnt = null, bestHead = false;
  // Walls (2D ray vs solids, with height check at the hit distance).
  for (const b of G.world.solids) {
    const t = rayBox(ox, oz, dx, dz, b);
    if (t < 0 || t >= bestT) continue;
    const yAt = eyeY + dy * t;
    if (yAt > b.h + 0.05) continue; // shot passes over this solid
    bestT = t; bestEnt = null;
  }
  // Entities: player + bots of the other team.
  const targets = [];
  if (shooter !== G.state.player && G.state.player.alive) targets.push(G.state.player);
  for (const b of G.state.bots) if (b.alive && b !== shooter) targets.push(b);
  for (const e of targets) {
    if (e.team === shooter.team) continue;
    const t = rayCircle(ox, oz, dx, dz, e.x, e.z, 0.46);
    if (t < 0 || t >= bestT) continue;
    const yAt = eyeY + dy * t;
    if (yAt < 0 || yAt > 1.85) continue;
    bestT = t; bestEnt = e; bestHead = yAt > 1.42;
  }
  if (!isFinite(bestT)) bestT = 60; // nothing hit: tracer flies to max range
  const hitX = ox + dx * bestT, hitY = eyeY + dy * bestT, hitZ = oz + dz * bestT;
  return { t: bestT, ent: bestEnt, head: bestHead, x: hitX, y: hitY, z: hitZ, dx, dy, dz };
}

export function fireWeapon(G, shooter, st) {
  // st = shooter weapon state {mag, reserve, cooldown, reloading, reloadT};
  // the weapon id lives on the shooter, not on the state object.
  const w = WEAPONS[shooter.weapon || st.id];
  if (st.cooldown > 0 || st.reloading) return false;
  if (st.mag <= 0) { startReload(G, shooter, st); return false; }
  const pellets = w.pellets || 1;
  // Bots set aimSpread directly (their aim error model); the player uses weapon spread.
  const spread = shooter.aimSpread !== undefined ? shooter.aimSpread
    : shooter.ads ? w.adsSpread : w.spread * (shooter.moving ? w.moveSpread : 1);
  const eyeY = (shooter.eyeH || 1.62) - 0.12;
  const origin = { x: shooter.x, y: eyeY, z: shooter.z };
  let anyHit = false;
  for (let i = 0; i < pellets; i++) {
    const r = shootRay(G, shooter, spread, eyeY);
    if (!r || !isFinite(r.t)) continue;
    // Tracer from muzzle to hit point.
    const f = forwardOf(shooter.yaw);
    const mx = shooter.x + f.x * 0.7, mz = shooter.z + f.z * 0.7;
    G.effects.tracer({ x: mx, y: eyeY - 0.08, z: mz }, { x: r.x, y: r.y, z: r.z });
    if (r.ent) {
      anyHit = true;
      const dist = r.t;
      let dmg = w.dmg * (shooter.dmgMul || 1) * (dist > w.falloff ? Math.max(0.55, 1 - (dist - w.falloff) / 70) : 1);
      if (r.head) dmg *= r.ent.hasHelmet ? 1.5 : w.hs;
      damageEntity(G, r.ent, dmg, r.head, shooter);
      if (shooter === G.state.player) {
        G.state.player.hits++;
        if (r.head) G.state.player.headshots++;
        G.hud.hitmark(r.head);
      }
      G.effects.spark({ x: r.x, y: r.y, z: r.z });
    }
  }
  st.mag--;
  st.cooldown = 60 / w.rpm;
  if (shooter === G.state.player) {
    G.state.player.shots++;
    G.state.player.recoil = Math.min(2.2, G.state.player.recoil + w.recoil * 0.55);
    G.state.player.vmKick = Math.min(0.09, G.state.player.vmKick + w.recoil * 0.03);
    G.audio.shot(w.sound);
    if (st.mag === 0) startReload(G, shooter, st);
  } else {
    G.audio.shot('enemy');
    G.state.noise.push({ x: shooter.x, z: shooter.z, t: G.state.time, r: 26 });
  }
  if (!anyHit && shooter === G.state.player) {
    // Whiff: still show the tracer (already drawn) — nothing else.
  }
  return true;
}

export function startReload(G, shooter, st) {
  const w = WEAPONS[shooter.weapon || st.id];
  if (st.reloading || st.mag >= w.mag || st.reserve <= 0) return false;
  st.reloading = true; st.reloadT = w.reload;
  if (shooter === G.state.player) G.audio.reload();
  return true;
}
export function tickReload(G, shooter, st, dt) {
  if (!st.reloading) return;
  st.reloadT -= dt;
  if (st.reloadT <= 0) {
    const w = WEAPONS[shooter.weapon || st.id];
    const need = w.mag - st.mag;
    const take = Math.min(need, st.reserve);
    st.mag += take; st.reserve -= take;
    st.reloading = false;
  }
}

export function damageEntity(G, target, dmg, head, attacker) {
  if (!target.alive) return;
  let remaining = dmg;
  if (target.armor > 0) {
    const absorbed = Math.min(target.armor, remaining * 0.5);
    target.armor -= absorbed;
    remaining -= absorbed;
  }
  target.hp -= remaining;
  if (target === G.state.player) {
    // World yaw of the direction from the player to the attacker.
    G.state.player.lastDamageFrom = Math.atan2(-(attacker.x - target.x), -(attacker.z - target.z));
    G.state.player.lastDamageT = G.state.time;
    G.audio.hurt();
    G.hud.damageFlash();
  }
  if (target.hp <= 0) killEntity(G, target, head, attacker);
}

export function killEntity(G, target, head, attacker) {
  target.alive = false; target.hp = 0;
  target.deaths = (target.deaths || 0) + 1;
  if (G.dropBombIfCarried) G.dropBombIfCarried(target); // carrier down: charge drops
  if (attacker) {
    attacker.kills = (attacker.kills || 0) + 1;
    if (attacker === G.state.player) {
      G.state.player.money += 300;
      G.audio.kill();
    } else if (attacker.isBot && attacker.team === 'W') {
      // Teammate kill still pays the team economy a little.
    }
  }
  G.hud.killfeed(attacker, target, head);
  G.comms.say(G.state, 'kill', { site: G.world.siteNameAt ? G.world.siteNameAt(target.x, target.z) : undefined, x: target.x });
  if (target.isBot && target.body) target.body.group.visible = false;
  if (target === G.state.player) {
    G.state.player.deaths++;
    G.input.unlock();
  }
  G.checkRoundEnd();
}
