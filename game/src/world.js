// POLARIS STATION — arctic research station under polar night.
// Map: x in [-32,32], z in [-24,24]. Attackers spawn south (helipad),
// defenders north (station core). Site A = RADAR DOME (west), Site B = FUEL DEPOT (east).
import * as THREE from 'three';
import { segHitsBox, pointInBox, circleVsBox, clamp } from './util.js';

export const MAP = { x0: -32, x1: 32, z0: -24, z1: 24 };
export const SITES = {
  A: { name: 'RADAR DOME', x: -20, z: -16, r: 4.5 },
  B: { name: 'FUEL DEPOT', x: 20, z: -16, r: 4.5 },
};
export const SPAWNS = {
  attack: [[0, 20], [-6, 19], [6, 19], [-3, 21], [3, 21]],
  defend: [[0, -20], [-6, -19], [6, -19], [-3, -21], [3, -21]],
};

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function snowTexture(rng) {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#dfe9f5'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      const v = 200 + Math.floor(rng() * 55);
      g.fillStyle = `rgb(${v},${v + 4},${Math.min(255, v + 14)})`;
      g.fillRect(rng() * w, rng() * h, 2, 2);
    }
    for (let i = 0; i < 26; i++) { // soft drifts
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.beginPath(); g.ellipse(rng() * w, rng() * h, 20 + rng() * 40, 8 + rng() * 14, rng() * 3, 0, 7); g.fill();
    }
  });
}
function moduleTexture(rng, base, trim, litRatio) {
  return canvasTexture(256, 128, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.fillStyle = trim; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 2, h);
    for (let i = 0; i < 8; i++) { // windows, some lit amber
      const x = 14 + i * 30, y = 42;
      g.fillStyle = rng() < litRatio ? '#ffc46b' : '#16283e';
      g.fillRect(x, y, 20, 26);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(x, y, 20, 2);
    }
    g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillRect(0, 0, w, 4); // snow on roof edge
  });
}
function signTexture(text, sub, fg, bg) {
  return canvasTexture(512, 128, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.font = 'bold 64px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, sub ? 48 : 64);
    if (sub) { g.font = 'bold 30px Arial'; g.fillStyle = '#ffd27a'; g.fillText(sub, w / 2, 100); }
  });
}
function letterTexture(letter, color) {
  return canvasTexture(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = color; g.font = 'bold 92px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.strokeStyle = 'rgba(0,0,0,0.85)'; g.lineWidth = 10;
    g.strokeText(letter, 64, 68); g.fillText(letter, 64, 68);
  });
}
function crateTexture(rng) {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#8a6a42'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#5d4526'; g.lineWidth = 6; g.strokeRect(4, 4, w - 8, h - 8);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.moveTo(w, 0); g.lineTo(0, h); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(0, 0, w, 10);
  });
}

export class World {
  constructor(scene, rng) {
    this.scene = scene; this.rng = rng;
    this.solids = [];   // {x0,z0,x1,z1} — collision + LOS blockers
    this.lowSolids = [];// low cover: blocks movement, not LOS (not used for LOS)
    this.updaters = []; // (dt, t) => void — aurora, beacon, snow
    this._build();
    this._waypoints();
  }
  addSolid(x0, z0, x1, z1, h = 3) {
    const b = { x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), h };
    this.solids.push(b);
    return b;
  }
  _box(x, z, w, d, h, mat, y = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y + h / 2, z);
    this.scene.add(m);
    return m;
  }
  _build() {
    const rng = this.rng, scene = this.scene;
    scene.fog = new THREE.FogExp2(0x0a1428, 0.016);
    scene.background = new THREE.Color(0x070d1d);
    // Lights: moon + hemisphere + 3 amber floodlights.
    const hemi = new THREE.HemisphereLight(0x8fb4ff, 0x1a2438, 0.75);
    scene.add(hemi);
    const moon = new THREE.DirectionalLight(0xbfd6ff, 1.1);
    moon.position.set(-18, 30, -12);
    scene.add(moon);
    const flood = (x, z) => {
      const p = new THREE.PointLight(0xffb347, 60, 26, 1.6);
      p.position.set(x, 6, z); scene.add(p);
    };
    flood(-20, -12); flood(20, -12); flood(0, 6);
    // Stars.
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(700 * 3);
    for (let i = 0; i < 700; i++) {
      const a = rng() * Math.PI * 2, e = 0.25 + rng() * 1.2, r = 120;
      starPos[i * 3] = Math.cos(a) * Math.cos(e) * r;
      starPos[i * 3 + 1] = Math.sin(e) * r;
      starPos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xcfe0ff, size: 0.7, sizeAttenuation: false })));
    // Aurora: three tall translucent green bands, slowly swaying.
    const aurTex = canvasTexture(256, 256, (g, w, h) => {
      const grad = g.createLinearGradient(0, h, 0, 0);
      grad.addColorStop(0, 'rgba(60,255,150,0)');
      grad.addColorStop(0.45, 'rgba(60,255,150,0.55)');
      grad.addColorStop(1, 'rgba(120,255,200,0.05)');
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
    });
    this.aurora = [];
    for (let i = 0; i < 3; i++) {
      const geo = new THREE.PlaneGeometry(90, 34, 24, 1);
      const mat = new THREE.MeshBasicMaterial({
        map: aurTex, transparent: true, opacity: 0.5 - i * 0.12,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(-40 + i * 40, 42 - i * 4, -70 - i * 12);
      mesh.rotation.x = -0.12; mesh.rotation.z = 0.1 * (i - 1);
      scene.add(mesh); this.aurora.push(mesh);
    }
    this.updaters.push((dt, t) => {
      this.aurora.forEach((m, i) => {
        m.rotation.z = 0.1 * (i - 1) + Math.sin(t * 0.11 + i * 2.1) * 0.05;
        m.material.opacity = 0.42 - i * 0.1 + Math.sin(t * 0.23 + i * 1.7) * 0.08;
      });
    });
    // Moon disc.
    const moonDisc = new THREE.Mesh(new THREE.CircleGeometry(4, 32),
      new THREE.MeshBasicMaterial({ color: 0xe8f1ff, fog: false }));
    moonDisc.position.set(-52, 46, -80); moonDisc.lookAt(0, 0, 0); scene.add(moonDisc);
    // Ground: snow.
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 68),
      new THREE.MeshStandardMaterial({ map: snowTexture(rng), roughness: 0.95, metalness: 0 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, 0);
    scene.add(ground);
    // Boundary walls (low snow banks + fence posts).
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x9fb4cc, roughness: 0.9 });
    const mkWall = (x, z, w, d) => { this._box(x, z, w, d, 3.4, wallMat); };
    mkWall(0, -24.5, 66, 1); mkWall(0, 24.5, 66, 1);
    mkWall(-32.5, 0, 1, 50); mkWall(32.5, 0, 1, 50);
    this.addSolid(-33, -25, 33, -24); this.addSolid(-33, 24, 33, 25);
    this.addSolid(-33, -24, -32, 24); this.addSolid(32, -24, 33, 24);
    // ---- Station modules ----
    const modRed = new THREE.MeshStandardMaterial({ map: moduleTexture(rng, '#a33327', '#e8e2d4', 0.65), roughness: 0.8 });
    const modWhite = new THREE.MeshStandardMaterial({ map: moduleTexture(rng, '#d8d5cc', '#a33327', 0.5), roughness: 0.8 });
    const modBlue = new THREE.MeshStandardMaterial({ map: moduleTexture(rng, '#2c4a6e', '#e8e2d4', 0.55), roughness: 0.8 });
    const mod = (x, z, w, d, h, mat) => { this._box(x, z, w, d, h, mat); this.addSolid(x - w / 2, z - d / 2, x + w / 2, z + d / 2, h); };
    mod(-8, -1, 10, 6, 3.6, modRed);       // MESS HALL (mid-west)
    mod(14, -4, 10, 6, 3.4, modWhite);     // LAB (mid-east)
    mod(0, -13, 6, 4, 3.2, modBlue);       // COMMS HUT (north-center)
    mod(-8, 13, 6, 2.4, 2.6, new THREE.MeshStandardMaterial({ color: 0x3f6d8e, roughness: 0.7 })); // container 1
    mod(9, 13, 6, 2.4, 2.6, new THREE.MeshStandardMaterial({ color: 0xb06a2e, roughness: 0.7 }));  // container 2
    // Radar dome (Site A): tower + sphere + blinking beacon.
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3, 7, 12),
      new THREE.MeshStandardMaterial({ color: 0xd8d5cc, roughness: 0.7 }));
    tower.position.set(-26, 3.5, -18); scene.add(tower);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(3.4, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xf2f0e8, roughness: 0.45 }));
    dome.position.set(-26, 7, -18); scene.add(dome);
    this.beacon = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    this.beacon.position.set(-26, 10.8, -18); scene.add(this.beacon);
    this.updaters.push((dt, t) => { this.beacon.material.color.setHex(Math.sin(t * 3) > 0 ? 0xff2a2a : 0x551111); });
    this.addSolid(-28.6, -20.6, -23.4, -15.4, 7);
    // Fuel tanks (Site B).
    const tankMat = new THREE.MeshStandardMaterial({ color: 0xd8d5cc, roughness: 0.55, metalness: 0.25 });
    const bandMat = new THREE.MeshStandardMaterial({ color: 0xa33327, roughness: 0.6 });
    const tank = (x, z, r, h) => {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 18), tankMat);
      t.position.set(x, h / 2, z); scene.add(t);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.05, r + 0.05, 0.5, 18), bandMat);
      band.position.set(x, h - 0.7, z); scene.add(band);
      this.addSolid(x - r, z - r, x + r, z + r, h);
    };
    tank(24.5, -18.5, 2.6, 4.2); tank(29.5, -14, 1.9, 3.4);
    // Pipe rack along B lane (visual low pipes, no collider — shoot over them).
    const pipeMat = new THREE.MeshStandardMaterial({ color: 0x7d8ea3, roughness: 0.5, metalness: 0.5 });
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 12, 8), pipeMat);
      p.rotation.z = Math.PI / 2; p.rotation.y = 0;
      p.position.set(22, 0.9 + i * 0.5, -10 + i * 0.55);
      scene.add(p);
    }
    // Crates (solid cover).
    const crateMat = new THREE.MeshStandardMaterial({ map: crateTexture(rng), roughness: 0.85 });
    const crate = (x, z, s = 1.7) => {
      this._box(x, z, s, s, s, crateMat);
      this.addSolid(x - s / 2, z - s / 2, x + s / 2, z + s / 2, s);
    };
    crate(-20, 8); crate(-18, -2); crate(-22, -8); crate(-14, -12);
    crate(0, 6); crate(4, -4); crate(-6, 8); crate(6, 10);
    crate(18, 6); crate(22, -4); crate(14, -14); crate(28, -8);
    crate(-20, -13); crate(-26, -10); crate(20, -13); crate(28, -12);
    crate(-24, 2, 1.2); crate(24, 2, 1.2); crate(12, -12, 1.2); crate(-12, -12, 1.2);
    // Fuel drums (small solid cylinders).
    const drumMat = new THREE.MeshStandardMaterial({ color: 0x2e6e4e, roughness: 0.6, metalness: 0.3 });
    const drum = (x, z) => {
      const d = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.1, 10), drumMat);
      d.position.set(x, 0.55, z); scene.add(d);
      this.addSolid(x - 0.55, z - 0.55, x + 0.55, z + 0.55, 1.1);
    };
    drum(17, -18); drum(18.2, -18.4); drum(-23, -13.5); drum(26, -19.5);
    // Snowmobile prop (visual).
    const sm = new THREE.Group();
    const smBody = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.9),
      new THREE.MeshStandardMaterial({ color: 0xc23b2e, roughness: 0.5 }));
    smBody.position.y = 0.55; sm.add(smBody);
    const smSki = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 1.3),
      new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 }));
    smSki.position.y = 0.12; sm.add(smSki);
    sm.position.set(2, 0, 4); sm.rotation.y = 0.6; scene.add(sm);
    // Floodlight poles.
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a4a5c, roughness: 0.6, metalness: 0.4 });
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
    for (const [x, z] of [[-20, -12], [20, -12], [0, 6], [-14, 14], [14, 14]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6, 8), poleMat);
      pole.position.set(x, 3, z); scene.add(pole);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 0.35), lampMat);
      lamp.position.set(x, 6.1, z); scene.add(lamp);
    }
    // Helipad (attacker spawn): circle + H.
    const padTex = canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = '#3a4556'; g.beginPath(); g.arc(128, 128, 120, 0, 7); g.fill();
      g.strokeStyle = '#ffd27a'; g.lineWidth = 8; g.beginPath(); g.arc(128, 128, 112, 0, 7); g.stroke();
      g.fillStyle = '#ffd27a'; g.font = 'bold 120px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('H', 128, 134);
    });
    const pad = new THREE.Mesh(new THREE.CircleGeometry(5, 28),
      new THREE.MeshStandardMaterial({ map: padTex, roughness: 0.9 }));
    pad.rotation.x = -Math.PI / 2; pad.position.set(0, 0.02, 20); scene.add(pad);
    // Site markers: floating letters + ground rings.
    for (const [key, s] of Object.entries(SITES)) {
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({
        map: letterTexture(key, key === 'A' ? '#ffb347' : '#8fd4ff'), transparent: true, depthWrite: false,
      }));
      spr.scale.set(4, 4, 1); spr.position.set(s.x, 7.5, s.z); scene.add(spr);
      const ring = new THREE.Mesh(new THREE.RingGeometry(s.r - 0.25, s.r, 40),
        new THREE.MeshBasicMaterial({ color: key === 'A' ? 0xffb347 : 0x8fd4ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(s.x, 0.03, s.z); scene.add(ring);
    }
    // Big signage on the modules.
    const sign = (text, sub, x, z, ry, w = 9) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4),
        new THREE.MeshBasicMaterial({ map: signTexture(text, sub, '#ffffff', 'rgba(10,20,38,0.92)'), transparent: true }));
      m.position.set(x, 4.6, z); m.rotation.y = ry; scene.add(m);
    };
    sign('RADAR DOME', 'SITE A', -26, -14.6, 0);
    sign('FUEL DEPOT', 'SITE B', 24.5, -14.6, 0);
    sign('MESS HALL', '', -8, 2.2, 0, 7);
    sign('POLARIS STATION', 'EST. 1962', 0, -10.8, 0, 8);
    // Snowfall.
    const flakeGeo = new THREE.BufferGeometry();
    const flakePos = new Float32Array(500 * 3);
    this.flakes = [];
    for (let i = 0; i < 500; i++) {
      this.flakes.push({ x: (rng() - 0.5) * 70, y: rng() * 18, z: (rng() - 0.5) * 52, s: 0.4 + rng() * 0.9 });
      flakePos[i * 3] = this.flakes[i].x; flakePos[i * 3 + 1] = this.flakes[i].y; flakePos[i * 3 + 2] = this.flakes[i].z;
    }
    flakeGeo.setAttribute('position', new THREE.BufferAttribute(flakePos, 3));
    this.flakePoints = new THREE.Points(flakeGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.14 }));
    scene.add(this.flakePoints);
    this.updaters.push((dt) => {
      const pos = this.flakePoints.geometry.attributes.position.array;
      for (let i = 0; i < 500; i++) {
        const f = this.flakes[i];
        f.y -= f.s * dt * 1.6; f.x += Math.sin(f.y * 0.7) * dt * 0.3;
        if (f.y < 0) { f.y = 16 + this.rng() * 2; f.x = (this.rng() - 0.5) * 70; f.z = (this.rng() - 0.5) * 52; }
        pos[i * 3] = f.x; pos[i * 3 + 1] = f.y; pos[i * 3 + 2] = f.z;
      }
      this.flakePoints.geometry.attributes.position.needsUpdate = true;
    });
  }
  _waypoints() {
    // Nodes: [x, z]. Links auto-built within 11 m with clear 2D LOS.
    const pts = [
      [0, 20], [-7, 19], [7, 19],            // 0-2 attack spawn
      [-14, 16], [-19, 10], [-21, 2], [-22, -6], [-24, -12], [-20, -16], [-27, -12], // 3-9 A lane
      [-1, 12], [-2, 6], [1, -3], [0, -9], [-7, -9], [7, -9], // 10-15 mid
      [14, 16], [19, 10], [21, 2], [22, -6], [24, -12], [20, -16], [28, -12], // 16-22 B lane
      [0, -20], [-7, -19], [7, -19],          // 23-25 defend spawn
      [-18, -18], [-26, -8], [18, -18], [28, -8], // 26-29 site guards
      [-12, 4], [12, 4],                       // 30-31 mid connectors
    ];
    this.wp = pts.map(([x, z]) => ({ x, z, links: [] }));
    for (let i = 0; i < this.wp.length; i++) {
      for (let j = i + 1; j < this.wp.length; j++) {
        const a = this.wp[i], b = this.wp[j];
        const dx = b.x - a.x, dz = b.z - a.z;
        if (dx * dx + dz * dz > 121) continue;
        if (!this.losClear(a.x, a.z, b.x, b.z)) continue;
        a.links.push(j); b.links.push(i);
      }
    }
  }
  nearestWp(x, z) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < this.wp.length; i++) {
      const dx = this.wp[i].x - x, dz = this.wp[i].z - z;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  // BFS path of waypoint indices from (x,z) to (tx,tz).
  findPath(x, z, tx, tz) {
    const start = this.nearestWp(x, z), goal = this.nearestWp(tx, tz);
    if (start === goal) return [goal];
    const prev = new Array(this.wp.length).fill(-1);
    const q = [start]; prev[start] = start;
    while (q.length) {
      const cur = q.shift();
      if (cur === goal) break;
      for (const n of this.wp[cur].links) {
        if (prev[n] === -1) { prev[n] = cur; q.push(n); }
      }
    }
    if (prev[goal] === -1) return [goal];
    const path = [];
    let c = goal;
    while (c !== start) { path.unshift(c); c = prev[c]; }
    return path;
  }
  // 2D line of sight: true if no solid blocks the segment. `smokes` = [{x,z,r}].
  losClear(x0, z0, x1, z1, smokes) {
    for (const b of this.solids) {
      if (segHitsBox(x0, z0, x1, z1, b)) return false;
    }
    if (smokes) {
      for (const s of smokes) {
        // Segment vs circle: does the segment pass through the smoke cloud?
        const dx = x1 - x0, dz = z1 - z0;
        const len2 = dx * dx + dz * dz;
        let t = len2 > 0 ? ((s.x - x0) * dx + (s.z - z0) * dz) / len2 : 0;
        t = clamp(t, 0, 1);
        const px = x0 + dx * t, pz = z0 + dz * t;
        const ddx = px - s.x, ddz = pz - s.z;
        if (ddx * ddx + ddz * ddz < s.r * s.r) return false;
      }
    }
    return true;
  }
  collide(x, z, r) {
    let cx = x, cz = z;
    for (const b of this.solids) {
      if (!pointInBox(cx, cz, b, r)) continue;
      const out = circleVsBox(cx, cz, r, b);
      if (out) { cx = out.x; cz = out.z; }
    }
    cx = clamp(cx, MAP.x0 + r, MAP.x1 - r);
    cz = clamp(cz, MAP.z0 + r, MAP.z1 - r);
    return { x: cx, z: cz };
  }
  update(dt, t) { for (const u of this.updaters) u(dt, t); }
}
