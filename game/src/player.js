// The human player: movement with acceleration, crouch, quiet-walk, camera,
// and a multi-part viewmodel gun rebuilt per weapon class.
import * as THREE from 'three';
import { clamp, damp, lerp } from './util.js';
import { WEAPONS } from './weapons.js';

export const EYE_STAND = 1.62, EYE_CROUCH = 1.12;
const WALK_SPEED = 4.3, QUIET_SPEED = 2.1, CROUCH_SPEED = 2.2;
const ACCEL = 34, FRICTION = 11;

export function createPlayer() {
  return {
    isBot: false, name: 'YOU', team: 'W', alive: true,
    x: 0, z: 20, yaw: 0, pitch: 0, // yaw 0 faces north (-z), toward the station
    vx: 0, vz: 0, hp: 100, armor: 0, hasHelmet: false,
    crouched: false, ads: false, adsT: 0,
    radius: 0.45, eyeH: EYE_STAND,
    weapon: 'p9', loadout: {}, // id -> {mag, reserve}
    grenades: { frag: 0, flash: 0, smoke: 0 },
    money: 800, kills: 0, deaths: 0, shots: 0, hits: 0, headshots: 0,
    lastDamageFrom: -1, lastDamageT: -99, flashT: 0, stepT: 0,
    recoil: 0, bobT: 0, viewmodel: null, vmKick: 0,
  };
}

// yaw convention: forward = (-sin(yaw), -cos(yaw)) in (x, z). yaw=0 faces -z (north).
export function forwardOf(yaw) { return { x: -Math.sin(yaw), z: -Math.cos(yaw) }; }
export function rightOf(yaw) { return { x: Math.cos(yaw), z: -Math.sin(yaw) }; }

export function buildViewmodel(weaponId) {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x23282f, roughness: 0.5, metalness: 0.6 });
  const grip = new THREE.MeshStandardMaterial({ color: 0x3a2e22, roughness: 0.85 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xb06a2e, roughness: 0.5, metalness: 0.4 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0e2a3a, roughness: 0.1, metalness: 0.9 });
  const part = (w, h, d, x, y, z, mat = dark) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); g.add(m); return m;
  };
  // Common: receiver + barrel + handguard + magazine + stock + grip + sights.
  part(0.09, 0.11, 0.42, 0, 0, -0.1);                 // receiver
  part(0.05, 0.05, 0.34, 0, 0.02, -0.42);             // barrel
  part(0.07, 0.07, 0.22, 0, -0.01, -0.3);             // handguard
  part(0.05, 0.14, 0.08, 0, -0.11, -0.05, grip);      // magazine
  part(0.07, 0.09, 0.16, 0, -0.01, 0.18);             // stock
  part(0.05, 0.1, 0.06, 0, -0.09, 0.08, grip);        // pistol grip
  part(0.02, 0.05, 0.02, 0, 0.08, -0.28);             // front sight
  part(0.03, 0.04, 0.06, 0, 0.075, 0.05);             // rear sight
  if (weaponId === 'dmr') {
    part(0.06, 0.06, 0.2, 0, 0.1, -0.08, glass);      // scope tube
    part(0.07, 0.07, 0.03, 0, 0.1, -0.18, dark);      // scope bell
    part(0.05, 0.05, 0.46, 0, 0.02, -0.46);           // long barrel
    part(0.09, 0.05, 0.1, 0, -0.02, 0.22, accent);    // cheek rest
  } else if (weaponId === 'shotgun') {
    part(0.06, 0.06, 0.4, 0, -0.03, -0.4);            // pump tube
    part(0.08, 0.05, 0.14, 0, -0.05, -0.32, grip);    // pump grip
    part(0.05, 0.05, 0.4, 0, 0.02, -0.44);            // wide barrel
  } else if (weaponId === 'smg') {
    part(0.04, 0.04, 0.26, 0, 0.02, -0.38);           // short barrel
    part(0.06, 0.12, 0.06, 0, -0.1, -0.12, grip);     // long mag
    part(0.05, 0.05, 0.1, 0, -0.02, 0.2, accent);     // folding stock
  } else if (weaponId === 'rifle') {
    part(0.05, 0.05, 0.36, 0, 0.02, -0.44);           // barrel
    part(0.08, 0.08, 0.26, 0, -0.01, -0.32, accent);  // wooden handguard
    part(0.05, 0.13, 0.08, 0, -0.11, -0.02, grip);    // curved mag
  } else { // pistol: compact
    g.clear();
    part(0.06, 0.08, 0.26, 0, 0, -0.08);
    part(0.05, 0.05, 0.2, 0, 0.02, -0.24);
    part(0.05, 0.12, 0.06, 0, -0.09, 0.04, grip);
    part(0.02, 0.03, 0.02, 0, 0.06, -0.2);
  }
  g.position.set(0.26, -0.24, -0.5);
  return g;
}

export function updatePlayer(G, dt) {
  const s = G.state, p = s.player, inp = G.input, world = G.world;
  if (!p.alive) return;
  const { dx, dy } = inp.consumeMouse();
  const sens = p.ads ? 0.0009 : 0.0021;
  p.yaw -= dx * sens;
  p.pitch = clamp(p.pitch - dy * sens, -1.45, 1.45);
  p.recoil = damp(p.recoil, 0, 9, dt);
  p.pitch += p.recoil * dt * 0.12;
  // ADS.
  const wantAds = inp.mouseDownR && WEAPONS[p.weapon].ads;
  p.ads = wantAds;
  p.adsT = damp(p.adsT, wantAds ? 1 : 0, 14, dt);
  // Movement.
  const ax = inp.axis();
  const crouching = inp.down('KeyC');
  p.crouched = crouching;
  const quiet = inp.down('ShiftLeft') || inp.down('ShiftRight');
  const speed = crouching ? CROUCH_SPEED : quiet ? QUIET_SPEED : WALK_SPEED;
  const f = forwardOf(p.yaw), r = rightOf(p.yaw);
  let mx = f.x * -ax.z + r.x * ax.x;
  let mz = f.z * -ax.z + r.z * ax.x;
  const ml = Math.hypot(mx, mz);
  if (ml > 0) { mx /= ml; mz /= ml; }
  p.vx = damp(p.vx, mx * speed, ACCEL / Math.max(1, speed) * 2.2, dt);
  p.vz = damp(p.vz, mz * speed, ACCEL / Math.max(1, speed) * 2.2, dt);
  // Friction when no input.
  if (ml === 0) { p.vx = damp(p.vx, 0, FRICTION, dt); p.vz = damp(p.vz, 0, FRICTION, dt); }
  const nx = p.x + p.vx * dt, nz = p.z + p.vz * dt;
  const out = world.collide(nx, nz, p.radius);
  p.x = out.x; p.z = out.z;
  const targetEye = crouching ? EYE_CROUCH : EYE_STAND;
  p.eyeH = damp(p.eyeH, targetEye, 12, dt);
  // Footsteps.
  const spd = Math.hypot(p.vx, p.vz);
  if (spd > 1.2) {
    p.stepT -= dt * spd;
    if (p.stepT <= 0) { p.stepT = 2.4; G.audio.step(quiet || crouching ? false : true); }
    p.bobT += dt * spd * 1.6;
  }
  // Flashbang decay.
  if (p.flashT > 0) p.flashT -= dt;
  // Viewmodel motion.
  if (p.viewmodel) {
    const vm = p.viewmodel;
    const bob = Math.sin(p.bobT) * 0.008 * Math.min(1, spd / WALK_SPEED);
    const bobY = Math.abs(Math.cos(p.bobT)) * 0.006 * Math.min(1, spd / WALK_SPEED);
    const adsX = lerp(0.26, 0, p.adsT), adsY = lerp(-0.24, -0.185, p.adsT);
    vm.position.set(adsX + bob, adsY + bobY, -0.5 + p.vmKick);
    vm.rotation.x = p.vmKick * 1.4;
    p.vmKick = damp(p.vmKick, 0, 16, dt);
  }
  // Camera.
  G.camera.position.set(p.x, p.eyeH, p.z);
  G.camera.rotation.order = 'YXZ';
  G.camera.rotation.y = p.yaw;
  G.camera.rotation.x = p.pitch;
  G.camera.rotation.z = 0;
  const targetFov = p.ads ? (p.weapon === 'dmr' ? 34 : 55) : 75;
  if (Math.abs(G.camera.fov - targetFov) > 0.1) {
    G.camera.fov = damp(G.camera.fov, targetFov, 14, dt);
    G.camera.updateProjectionMatrix();
  }
}
