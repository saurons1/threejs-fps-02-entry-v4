// HUD: DOM panels, minimap, killfeed, comms, hit direction, buy menu,
// scoreboard, and round-end overlays. All reads come from G.state.
import { fmtTime } from './util.js';
import { BUY_ITEMS } from './economy.js';
import { WEAPONS } from './weapons.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor(G) {
    this.G = G;
    this.kf = [];
    this.announceT = 0;
    this.hitT = 0;
    this._buildBuy();
  }
  _buildBuy() {
    const grid = $('buy-grid');
    grid.innerHTML = '';
    BUY_ITEMS.forEach((item, i) => {
      const el = document.createElement('div');
      el.className = 'buy-item';
      el.dataset.key = item.key;
      el.innerHTML = `<div><span class="key">${i + 1}</span><span class="nm">${item.name}</span><div class="ds">${item.desc}</div></div><div class="pr">$${item.price}</div>`;
      el.addEventListener('click', () => this.G.tryBuy(item.key));
      grid.appendChild(el);
    });
  }
  show(el, on) { $(el).classList.toggle('hidden', !on); }
  setPhase(phase) {
    this.show('hud', phase === 'buy' || phase === 'live' || phase === 'roundEnd');
    this.show('buy-menu', phase === 'buy');
    this.show('start-screen', phase === 'menu');
    this.show('round-end', phase === 'roundEnd');
    this.show('match-end', phase === 'matchEnd');
    if (phase !== 'buy') this.show('scoreboard', false);
  }
  update(G, dt) {
    const s = G.state, p = s.player;
    $('score-w').textContent = s.scoreW;
    $('score-d').textContent = s.scoreD;
    $('round-label').textContent = `ROUND ${Math.min(s.round, s.maxRounds)}/${s.maxRounds}`;
    $('timer').textContent = fmtTime(s.phase === 'buy' ? s.buyTimer : s.roundTimer);
    const b = s.bomb;
    $('bomb-status').textContent = b.state === 'planted' ? '● CHARGE ' + fmtTime(b.timer) : '';
    $('hp-num').textContent = Math.max(0, Math.ceil(p.hp));
    $('hp-fill').style.width = clamp01(p.hp / 100) * 100 + '%';
    $('armor-num').textContent = Math.max(0, Math.ceil(p.armor));
    $('armor-fill').style.width = clamp01(p.armor / 100) * 100 + '%';
    $('money').textContent = Math.floor(p.money);
    const w = WEAPONS[p.weapon];
    $('weapon-name').textContent = w.name + (p.weapon === 'dmr' && p.ads ? ' · SCOPED' : '');
    const st = p.loadout[p.weapon];
    $('ammo').textContent = st ? st.mag : 0;
    $('reserve').textContent = st ? st.reserve : 0;
    $('firemode').textContent = (w.auto ? 'FULL-AUTO' : 'SEMI-AUTO') + ' · [R] RELOAD' + (st && st.reloading ? ' · RELOADING…' : '');
    $('grenades').innerHTML = `Grenades — <b>Frag ${p.grenades.frag}</b> · <b>Flash ${p.grenades.flash}</b> · <b>Smoke ${p.grenades.smoke}</b>  [G] throw · [1/2/3] select`;
    // Crosshair spread follows movement + ADS.
    const spread = p.ads ? 4 : p.crouched ? 7 : p.moving ? 16 : 10;
    const ch = $('crosshair');
    ch.querySelectorAll('.ch').forEach((el, i) => {
      if (i === 0) el.style.top = (-spread - 10) + 'px';
      if (i === 1) el.style.top = spread + 'px';
      if (i === 2) el.style.left = (-spread - 10) + 'px';
      if (i === 3) el.style.left = spread + 'px';
    });
    ch.style.opacity = p.ads && p.weapon === 'dmr' ? 0 : 1;
    this.show('scope-overlay', p.ads && p.weapon === 'dmr');
    // Flashbang whiteout.
    $('flash-overlay').style.opacity = p.flashT > 0 ? Math.min(1, p.flashT) : 0;
    // Hitmarker decay.
    if (this.hitT > 0) { this.hitT -= dt; if (this.hitT <= 0) $('hitmarker').classList.remove('on'); }
    this.drawMinimap(G);
    this.drawHitdir(G);
    // Announce banner decay.
    if (this.announceT > 0) {
      this.announceT -= dt;
      if (this.announceT <= 0) $('interact').classList.add('hidden');
    }
  }
  hitmark(head) {
    $('hitmarker').classList.add('on');
    $('hitmarker').querySelector('svg g').setAttribute('stroke', head ? '#ff5d5d' : '#fff');
    this.hitT = 0.18;
  }
  damageFlash() {
    const el = $('damage-flash');
    el.style.opacity = 1;
    setTimeout(() => { el.style.opacity = 0; }, 130);
  }
  killfeed(attacker, victim, head) {
    const el = $('killfeed');
    const div = document.createElement('div');
    div.className = 'kf';
    const aName = attacker ? attacker.name : '—';
    const aCls = attacker && attacker.team === 'W' ? 'killer' : 'victim';
    const vCls = victim.team === 'W' ? 'killer' : 'victim';
    div.innerHTML = `<span class="${aCls}">${esc(aName)}</span> <b>${head ? '<span class="hs">✕HS</span> ' : '✕'}</b> <span class="${vCls}">${esc(victim.name)}</span>`;
    el.prepend(div);
    this.kf.push(div);
    while (this.kf.length > 5) this.kf.shift().remove();
    // Keep the timeout id on the node so a staged screenshot can pin the entry.
    div._t = setTimeout(() => { const i = this.kf.indexOf(div); if (i >= 0) { this.kf.splice(i, 1); div.remove(); } }, 6000);
  }
  commsLine(text, who) {
    const el = $('comms');
    const div = document.createElement('div');
    div.className = 'cm';
    div.innerHTML = `<b>[${esc(who || 'RADIO')}]</b> ${esc(text)}`;
    el.prepend(div);
    while (el.children.length > 4) el.lastChild.remove();
    div._t = setTimeout(() => div.remove(), 9000);
  }
  announce(text) {
    const el = $('interact');
    el.innerHTML = esc(text);
    el.classList.remove('hidden');
    this.announceT = 3.5;
  }
  interactPrompt(html, frac) {
    const el = $('interact');
    if (!html) { if (this.announceT <= 0) el.classList.add('hidden'); return; }
    el.innerHTML = html + (frac !== undefined
      ? `<div id="plant-bar"><i id="plant-fill" style="width:${Math.round(frac * 100)}%"></i></div>` : '');
    el.classList.remove('hidden');
  }
  drawMinimap(G) {
    const s = G.state;
    const cv = $('minimap'), g = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const sx = (x) => (x + 32) / 64 * W;
    const sz = (z) => (z + 24) / 48 * H;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(10,22,44,0.9)'; g.fillRect(0, 0, W, H);
    // Snow ground tint.
    g.fillStyle = 'rgba(190,210,235,0.16)'; g.fillRect(0, 0, W, H);
    // Solids.
    g.fillStyle = 'rgba(160,190,230,0.85)';
    for (const b of G.world.solids) {
      if (b.x1 < -32 || b.x0 > 32) continue;
      g.fillRect(sx(b.x0), sz(b.z0), Math.max(2, sx(b.x1) - sx(b.x0)), Math.max(2, sz(b.z1) - sz(b.z0)));
    }
    // Site zones.
    for (const [key, site] of Object.entries(G.worldSites)) {
      g.strokeStyle = key === 'A' ? '#ffb347' : '#8fd4ff';
      g.lineWidth = 1.5;
      g.beginPath(); g.arc(sx(site.x), sz(site.z), site.r / 64 * W, 0, 7); g.stroke();
      g.fillStyle = key === 'A' ? '#ffb347' : '#8fd4ff';
      g.font = 'bold 13px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(key, sx(site.x), sz(site.z));
    }
    // Bomb.
    const b = s.bomb;
    if (b.state === 'planted') {
      const blink = Math.sin(s.time * 8) > 0;
      if (blink) {
        g.fillStyle = '#ff4444';
        g.beginPath(); g.arc(sx(b.siteX), sz(b.siteZ), 4, 0, 7); g.fill();
      }
    }
    // Bots: teammates blue, spotted enemies red.
    for (const bot of s.bots) {
      if (!bot.alive) continue;
      const isMate = bot.team === 'W';
      const spotted = !isMate && s.time - bot.spotT < 3;
      if (!isMate && !spotted) continue;
      g.fillStyle = isMate ? '#7ee2a0' : '#ff5d5d';
      g.beginPath(); g.arc(sx(bot.x), sz(bot.z), 3, 0, 7); g.fill();
    }
    // Player arrow.
    const p = s.player;
    if (p.alive) {
      g.save();
      g.translate(sx(p.x), sz(p.z));
      g.rotate(-p.yaw + Math.PI);
      g.fillStyle = '#fff';
      g.beginPath(); g.moveTo(0, -6); g.lineTo(4.5, 5); g.lineTo(-4.5, 5); g.closePath(); g.fill();
      g.restore();
    }
  }
  drawHitdir(G) {
    const cv = $('hitdir'), g = cv.getContext('2d');
    g.clearRect(0, 0, 150, 150);
    const p = G.state.player;
    if (G.state.time - p.lastDamageT > 1.2 || p.lastDamageFrom === -1) return;
    // Angle of the attacker relative to the player's view.
    const rel = p.lastDamageFrom - p.yaw;
    g.save();
    g.translate(75, 75);
    g.rotate(-rel); // canvas: -PI/2 is "ahead"; attacker right of view -> arc right
    g.strokeStyle = 'rgba(255,60,60,0.95)';
    g.lineWidth = 7;
    g.beginPath(); g.arc(0, 0, 58, -Math.PI / 2 - 0.6, -Math.PI / 2 + 0.6); g.stroke();
    g.restore();
  }
  renderBuy(G) {
    const s = G.state, p = s.player;
    $('buy-round').textContent = s.round;
    $('buy-cash').textContent = Math.floor(p.money);
    document.querySelectorAll('#buy-grid .buy-item').forEach((el) => {
      const key = el.dataset.key;
      const owned = key === 'vest' ? p.armor >= 50
        : key === 'helm' ? p.hasHelmet
        : p.loadout[key] ? true : false;
      el.classList.toggle('owned', owned);
      el.style.opacity = p.money < +el.querySelector('.pr').textContent.slice(1) && !owned ? 0.55 : 1;
    });
  }
  renderScoreboard(G) {
    const s = G.state;
    const rows = [];
    const p = s.player;
    rows.push({ name: p.name + ' (YOU)', team: 'WOLVES', k: p.kills, d: p.deaths, m: Math.floor(p.money), you: true, alive: p.alive });
    for (const b of s.bots) {
      rows.push({ name: b.name, team: b.team === 'W' ? 'WOLVES' : 'WARDENS', k: b.kills, d: b.deaths, m: '—', you: false, alive: b.alive });
    }
    rows.sort((a, b) => b.k - a.k);
    $('score-rows').innerHTML = rows.map((r) =>
      `<tr class="${r.you ? 'you' : ''} ${r.alive ? '' : 'dead'}"><td>${esc(r.name)}</td><td>${r.team}</td><td>${r.k}</td><td>${r.d}</td><td>${r.m}</td></tr>`).join('');
  }
  roundEnd(G, winner, detail) {
    const s = G.state;
    // Clear any lingering buy-phase announce so it cannot ghost over the banner.
    // (The announce banner is the #interact element — see hud.announce.)
    $('interact').classList.add('hidden');
    this.announceT = 0;
    $('re-title').textContent = winner === 'W' ? 'ROUND WON' : 'ROUND LOST';
    $('re-title').className = winner === 'W' ? 'win' : 'lose';
    $('re-detail').textContent = detail;
    $('re-sw').textContent = s.scoreW;
    $('re-sd').textContent = s.scoreD;
    $('re-next').textContent = 'Next round in 4…';
  }
  matchEnd(G, winner) {
    const s = G.state, p = s.player;
    $('me-title').textContent = winner === 'W' ? 'STATION TAKEN' : 'STATION HELD';
    $('me-title').style.color = winner === 'W' ? '#7ee2a0' : '#ff6b6b';
    $('me-detail').textContent = `WOLVES ${s.scoreW} — ${s.scoreD} WARDENS. ` + (winner === 'W' ? 'The charge did its work.' : 'The Wardens held the line.');
    const acc = p.shots > 0 ? Math.round(p.hits / p.shots * 100) : 0;
    $('me-acc').textContent = acc + '%';
    $('me-kills').textContent = p.kills;
    $('me-deaths').textContent = p.deaths;
  }
}
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
