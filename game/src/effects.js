// Visual effects: tracers, muzzle flash, smoke clouds, explosions, hit sparks.
// Pooled, no per-frame allocations.
import * as THREE from 'three';

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.tracers = [];
    this.sparks = [];
    this.smokes = [];   // {x, z, r, life, mesh} — also blocks bot vision (see world.losClear)
    this.flashes = [];
    for (let i = 0; i < 10; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0 }));
      line.visible = false; line.frustumCulled = false;
      scene.add(line);
      this.tracers.push({ line, life: 0 });
    }
    // Muzzle flash: small additive plane that sits at the gun tip.
    this.muzzle = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.muzzle.visible = false;
    scene.add(this.muzzle);
    // Explosion fireball + shockwave ring.
    this.boom = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0 }));
    this.boom.visible = false; scene.add(this.boom);
    this.boomT = 0;
    // Hit sparks: small points burst.
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24 * 3), 3));
    this.sparkPts = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffe08a, size: 0.12, transparent: true, opacity: 0 }));
    this.sparkPts.frustumCulled = false;
    scene.add(this.sparkPts);
    this.sparkLife = 0; this.sparkVel = [];
    for (let i = 0; i < 24; i++) this.sparkVel.push([0, 0, 0]);
  }
  tracer(from, to) {
    const t = this.tracers.find((x) => x.life <= 0) || this.tracers[0];
    const p = t.line.geometry.attributes.position.array;
    p[0] = from.x; p[1] = from.y; p[2] = from.z;
    p[3] = to.x; p[4] = to.y; p[5] = to.z;
    t.line.geometry.attributes.position.needsUpdate = true;
    t.line.visible = true;
    t.line.material.opacity = 0.95;
    t.life = 0.07;
  }
  muzzleFlash(pos, yaw, pitch) {
    this.muzzle.position.copy(pos);
    this.muzzle.rotation.set(0, yaw, 0);
    this.muzzle.visible = true;
    this.muzzle.material.opacity = 0.95;
    this.muzzle.scale.setScalar(0.8 + Math.random() * 0.5);
    this._flashT = 0.05;
  }
  spark(pos) {
    const p = this.sparkPts.geometry.attributes.position.array;
    for (let i = 0; i < 24; i++) {
      p[i * 3] = pos.x; p[i * 3 + 1] = pos.y; p[i * 3 + 2] = pos.z;
      this.sparkVel[i] = [(Math.random() - 0.5) * 6, Math.random() * 4, (Math.random() - 0.5) * 6];
    }
    this.sparkPts.geometry.attributes.position.needsUpdate = true;
    this.sparkPts.material.opacity = 1;
    this.sparkLife = 0.25;
  }
  smoke(x, z) {
    // One cloud = 5 billboards clustered, grows then fades over ~14 s.
    const group = new THREE.Group();
    const geo = new THREE.SphereGeometry(1, 10, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0xcfd8e2, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(geo, mat);
      const a = (i / 5) * Math.PI * 2;
      m.position.set(Math.cos(a) * 1.1, 0.8 + (i % 2) * 0.7, Math.sin(a) * 1.1);
      m.scale.setScalar(1.3 + (i % 3) * 0.4);
      group.add(m);
    }
    group.position.set(x, 0, z);
    this.scene.add(group);
    this.smokes.push({ x, z, r: 3.2, life: 14, group });
  }
  smokeClouds() { return this.smokes.filter((s) => s.life > 0); }
  explosion(x, y, z) {
    this.boom.position.set(x, y, z);
    this.boom.visible = true;
    this.boomT = 0.9;
    this.boom.scale.setScalar(0.5);
  }
  update(dt) {
    for (const t of this.tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.line.material.opacity = Math.max(0, t.life / 0.07) * 0.95;
        if (t.life <= 0) t.line.visible = false;
      }
    }
    if (this._flashT > 0) {
      this._flashT -= dt;
      this.muzzle.material.opacity = Math.max(0, this._flashT / 0.05) * 0.95;
      if (this._flashT <= 0) this.muzzle.visible = false;
    }
    if (this.boomT > 0) {
      this.boomT -= dt;
      const k = 1 - this.boomT / 0.9;
      this.boom.scale.setScalar(0.5 + k * 9);
      this.boom.material.opacity = Math.max(0, 1 - k) * 0.9;
      if (this.boomT <= 0) this.boom.visible = false;
    }
    if (this.sparkLife > 0) {
      this.sparkLife -= dt;
      const p = this.sparkPts.geometry.attributes.position.array;
      for (let i = 0; i < 24; i++) {
        p[i * 3] += this.sparkVel[i][0] * dt;
        p[i * 3 + 1] += this.sparkVel[i][1] * dt - 4 * dt;
        p[i * 3 + 2] += this.sparkVel[i][2] * dt;
      }
      this.sparkPts.geometry.attributes.position.needsUpdate = true;
      this.sparkPts.material.opacity = Math.max(0, this.sparkLife / 0.25);
    }
    for (const s of this.smokes) {
      if (s.life <= 0) continue;
      s.life -= dt;
      const grow = s.life > 12 ? (14 - s.life) / 2 : 1;
      s.group.scale.setScalar(1 + (1 - grow) * 0.15);
      s.group.children.forEach((m) => { m.material.opacity = Math.min(0.85, s.life / 3); });
      if (s.life <= 0) { this.scene.remove(s.group); }
    }
  }
}
