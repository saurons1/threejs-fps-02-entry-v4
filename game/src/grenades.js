// Grenades: frag (AoE), flash (blinds player + bots), smoke (vision cloud).
// Thrown on an arc; they bounce once, then trigger.
import * as THREE from 'three';
import { clamp } from './util.js';
import { damageEntity } from './weapons.js';
import { forwardOf } from './player.js';

export class Grenades {
  constructor(G) { this.G = G; this.live = []; }
  throwGrenade(shooter, kind) {
    const G = this.G, s = G.state;
    const inv = shooter === s.player ? s.player.grenades : null;
    if (inv && (inv[kind] || 0) <= 0) return false;
    if (inv) inv[kind]--;
    const f = forwardOf(shooter.yaw);
    const g = {
      kind, x: shooter.x, z: shooter.z, y: (shooter.eyeH || 1.55) - 0.2,
      vx: f.x * 11, vz: f.z * 11, vy: 3.4 + Math.sin(shooter.pitch || 0) * 6,
      t: kind === 'smoke' ? 1.5 : kind === 'flash' ? 1.4 : 1.7,
      bounced: false, mesh: null, owner: shooter,
    };
    const mat = new THREE.MeshStandardMaterial({
      color: kind === 'frag' ? 0x3a6e2e : kind === 'flash' ? 0xd8d5cc : 0x7d8ea3, roughness: 0.5 });
    g.mesh = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), mat);
    g.mesh.position.set(g.x, g.y, g.z);
    G.scene.add(g.mesh);
    this.live.push(g);
    G.audio.grenadeThrow();
    return true;
  }
  update(dt) {
    const G = this.G, s = G.state;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const g = this.live[i];
      g.t -= dt;
      g.vy -= 9.8 * dt;
      g.x += g.vx * dt; g.z += g.vz * dt; g.y += g.vy * dt;
      if (g.y < 0.14) {
        g.y = 0.14;
        if (!g.bounced) { g.bounced = true; g.vy = Math.abs(g.vy) * 0.35; g.vx *= 0.6; g.vz *= 0.6; }
        else { g.vy = 0; g.vx *= 0.9; g.vz *= 0.9; }
      }
      const out = G.world.collide(g.x, g.z, 0.14);
      g.x = out.x; g.z = out.z;
      g.mesh.position.set(g.x, g.y, g.z);
      if (g.t <= 0) { this._detonate(g); G.scene.remove(g.mesh); this.live.splice(i, 1); }
    }
  }
  _detonate(g) {
    const G = this.G, s = G.state;
    if (g.kind === 'frag') {
      G.effects.explosion(g.x, 0.6, g.z);
      G.audio.explosion();
      const hurt = (e) => {
        if (!e.alive || e === g.owner) return;
        const d = Math.hypot(e.x - g.x, e.z - g.z);
        if (d > 7) return;
        const los = G.world.losClear(g.x, g.z, e.x, e.z);
        const dmg = (d < 2.5 ? 110 : 110 * (1 - (d - 2.5) / 4.5)) * (los ? 1 : 0.4);
        damageEntity(G, e, dmg, false, g.owner);
      };
      hurt(s.player);
      for (const b of s.bots) hurt(b);
    } else if (g.kind === 'flash') {
      // Player blinded if looking toward it and close; bots blinded if LOS.
      const p = s.player;
      const pd = Math.hypot(p.x - g.x, p.z - g.z);
      if (p.alive && pd < 24 && G.world.losClear(g.x, g.z, p.x, p.z)) {
        const dx = g.x - p.x, dz = g.z - p.z;
        const ang = Math.atan2(-dx, -dz);
        const facing = Math.abs(((ang - p.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        p.flashT = clamp(2.6 - pd * 0.08, 0.5, 2.6) * (facing < 1.2 ? 1 : 0.45);
        G.audio.flash();
      }
      for (const b of s.bots) {
        if (!b.alive || b === g.owner) continue;
        const d = Math.hypot(b.x - g.x, b.z - g.z);
        if (d < 20 && G.world.losClear(g.x, g.z, b.x, b.z)) {
          b.target = null; b.reactT = 1.6; // blinded: loses target, slow to re-acquire
        }
      }
    } else {
      G.effects.smoke(g.x, g.z);
      G.audio.smoke();
    }
  }
}
