// Shared math + geometry helpers. No allocations in hot paths where noted.
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

// Shortest signed angle difference in (-PI, PI].
export function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
// Turn `cur` toward `target` by at most `maxStep` radians.
export function angTurn(cur, target, maxStep) {
  const d = angDiff(cur, target);
  if (Math.abs(d) <= maxStep) return target;
  return cur + Math.sign(d) * maxStep;
}
// Gaussian-ish random from a seeded rng (sum of 3 uniforms).
export function gauss(rng) {
  return (rng() + rng() + rng() - 1.5) * 1.1547;
}
// 2D segment (x0,z0)->(x1,z1) vs AABB {x0,z0,x1,z1}: true if it hits.
export function segHitsBox(x0, z0, x1, z1, b) {
  const dx = x1 - x0, dz = z1 - z0;
  let tmin = 0, tmax = 1;
  if (Math.abs(dx) < 1e-9) {
    if (x0 < b.x0 || x0 > b.x1) return false;
  } else {
    let t1 = (b.x0 - x0) / dx, t2 = (b.x1 - x0) / dx;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (z0 < b.z0 || z0 > b.z1) return false;
  } else {
    let t1 = (b.z0 - z0) / dz, t2 = (b.z1 - z0) / dz;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return true;
}
// Point in AABB (with optional margin).
export function pointInBox(x, z, b, m = 0) {
  return x >= b.x0 - m && x <= b.x1 + m && z >= b.z0 - m && z <= b.z1 + m;
}
// Ray (ox,oz,dir dx,dz normalized) vs circle (cx,cz,r): returns distance or -1.
export function rayCircle(ox, oz, dx, dz, cx, cz, r) {
  const ex = cx - ox, ez = cz - oz;
  const t = ex * dx + ez * dz;
  if (t < 0) return -1;
  const d2 = ex * ex + ez * ez - t * t;
  const r2 = r * r;
  if (d2 > r2) return -1;
  return t - Math.sqrt(r2 - d2);
}
// Ray vs AABB: returns distance to first hit or -1.
export function rayBox(ox, oz, dx, dz, b) {
  let tmin = 0, tmax = Infinity;
  if (Math.abs(dx) < 1e-9) {
    if (ox < b.x0 || ox > b.x1) return -1;
  } else {
    let t1 = (b.x0 - ox) / dx, t2 = (b.x1 - ox) / dx;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }
  if (Math.abs(dz) < 1e-9) {
    if (oz < b.z0 || oz > b.z1) return -1;
  } else {
    let t1 = (b.z0 - oz) / dz, t2 = (b.z1 - oz) / dz;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }
  return tmin;
}
// Circle (moving entity) vs AABB collision resolve: pushes (x,z) out, returns true if hit.
export function circleVsBox(x, z, r, b) {
  const nx = clamp(x, b.x0, b.x1), nz = clamp(z, b.z0, b.z1);
  const ddx = x - nx, ddz = z - nz;
  const d2 = ddx * ddx + ddz * ddz;
  if (d2 >= r * r) return null;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    return { x: nx + (ddx / d) * r, z: nz + (ddz / d) * r };
  }
  // Center inside the box: push out along the smallest penetration axis.
  const pl = x - b.x0 + r, pr = b.x1 - x + r, pt = z - b.z0 + r, pb = b.z1 - z + r;
  const m = Math.min(pl, pr, pt, pb);
  if (m === pl) return { x: b.x0 - r, z };
  if (m === pr) return { x: b.x1 + r, z };
  if (m === pt) return { x, z: b.z0 - r };
  return { x, z: b.z1 + r };
}
export function fmtMoney(n) { return String(Math.round(n)); }
export function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
