// POLARIS STATION — boot, fixed-step loop, round/match flow, screenshot hooks.
// The game object G is the one shared service bag every module reads.
import * as THREE from 'three';
import { World, SITES, SPAWNS } from './world.js';
import { AudioSys } from './audio.js';
import { Input } from './input.js';
import { createPlayer, updatePlayer, buildViewmodel } from './player.js';
import { WEAPONS, createLoadout, giveWeapon, fireWeapon, startReload, tickReload } from './weapons.js';
import { setupRoundBots, updateBot } from './bots.js';
import { Grenades } from './grenades.js';
import { Effects } from './effects.js';
import { Hud } from './hud.js';
import { Comms } from './comms.js';
import { createBomb, plantBomb, defuseBomb, playerInteract, dropBombIfCarried, updateBomb } from './bomb.js';
import { roundPayout, buyItem, botsBuy } from './economy.js';
import { mulberry32, hashSeed } from './rng.js';
import { clamp } from './util.js';

const STEP = 1 / 60;

function makeState(seed) {
  return {
    seed, time: 0, phase: 'menu', difficulty: 'veteran',
    round: 1, maxRounds: 13, firstTo: 7, scoreW: 0, scoreD: 0,
    roundTimer: 100, buyTimer: 15, roundEndT: 0,
    player: createPlayer(), bots: [], bomb: createBomb(), attackSite: 'A',
    noise: [], lossStreak: 0, grenadeSel: 'frag', frozen: false,
  };
}

export function boot() {
  const params = new URLSearchParams(location.search);
  const seed = hashSeed(params.get('seed') || 'polaris-1');
  const rng = mulberry32(seed);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.domElement.className = 'webgl';
  document.getElementById('app').appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.08, 260);
  scene.add(camera);

  const state = makeState(seed);
  const G = {
    state, scene, camera, renderer, rng,
    world: new World(scene, rng),
    worldSites: SITES,
    worldSpawn: (side, i) => SPAWNS[side][i % SPAWNS[side].length],
    audio: new AudioSys(),
    input: new Input(renderer.domElement),
    effects: new Effects(scene),
    hud: null, comms: new Comms(rng),
    grenades: null,
    plantBomb: (bot) => plantBomb(G, bot),
    defuseBomb: (bot) => defuseBomb(G, bot),
    dropBombIfCarried: (dead) => dropBombIfCarried(G, dead),
    checkRoundEnd: () => checkRoundEnd(G),
    endRound: (w, d) => endRound(G, w, d),
    tryBuy: (key) => { if (state.phase === 'buy' && buyItem(G, key)) G.hud.renderBuy(G); },
    playerSwapViewmodel: (id) => swapViewmodel(G, id),
  };
  G.hud = new Hud(G);
  G.grenades = new Grenades(G);
  // Muzzle flash rides with the camera (viewmodel space).
  camera.add(G.effects.muzzle);
  G.effects.muzzle.position.set(0.26, -0.18, -0.85);
  window.__game = { state, G };

  // ---- Input wiring ----
  let triggerQueued = false;
  G.input.onMouseDown = (btn) => {
    if (state.phase !== 'live') return;
    if (btn === 0) triggerQueued = true;
    if (btn === 2) { /* ADS handled by polling mouseDownR */ }
  };
  G.input.onKey = (code, down) => {
    if (!down) {
      if (code === 'Tab') G.hud.show('scoreboard', false);
      return;
    }
    if (state.phase === 'menu') return;
    if (code === 'KeyR' && state.phase === 'live') {
      const p = state.player, st = p.loadout[p.weapon];
      if (st) startReload(G, p, st);
    }
    if (code === 'KeyB') {
      if (state.phase === 'buy') {
        const open = document.getElementById('buy-menu').classList.contains('hidden');
        G.hud.show('buy-menu', open);
      }
    }
    if (code === 'Tab' && (state.phase === 'live' || state.phase === 'buy')) {
      G.hud.renderScoreboard(G); G.hud.show('scoreboard', true);
    }
    if (code === 'KeyQ' && state.phase === 'live') cycleWeapon(G);
    if (code === 'Digit1' && state.phase === 'live') state.grenadeSel = 'frag';
    if (code === 'Digit2' && state.phase === 'live') state.grenadeSel = 'flash';
    if (code === 'Digit3' && state.phase === 'live') state.grenadeSel = 'smoke';
    if (code === 'KeyG' && state.phase === 'live') {
      G.grenades.throwGrenade(state.player, state.grenadeSel);
    }
    if (state.phase === 'buy' && /^Digit[1-9]$/.test(code)) {
      const items = ['smg', 'rifle', 'shotgun', 'dmr', 'vest', 'helm', 'frag', 'flash', 'smoke'];
      const key = items[+code.slice(5) - 1];
      if (key) G.tryBuy(key);
    }
  };
  renderer.domElement.addEventListener('click', () => {
    if (state.phase === 'live' || state.phase === 'buy') G.input.lock();
  });
  document.getElementById('play-btn').addEventListener('click', () => {
    G.audio.ensure();
    startMatch(G);
    // Pointer lock is requested by the canvas click during play, not here:
    // locking on this button's click retargets later clicks (e.g. DEPLOY NOW)
    // to the locked element instead of the button.
  });
  document.getElementById('again-btn').addEventListener('click', () => {
    location.reload();
  });
  document.querySelectorAll('.diff-btn').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.diff-btn').forEach((x) => x.classList.remove('sel'));
      b.classList.add('sel');
      state.difficulty = b.dataset.diff;
    });
  });
  const deployBtn = document.getElementById('deploy-now');
  if (deployBtn) deployBtn.addEventListener('click', () => { if (state.phase === 'buy') startLive(G); });
  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  // ---- Phase helpers (closed over G) ----
  function startMatch(G) {
    const s = G.state;
    s.phase = 'buy'; s.round = 1; s.scoreW = 0; s.scoreD = 0; s.lossStreak = 0;
    s.player.money = 800;
    s.player.loadout = createLoadout();
    s.player.weapon = 'p9';
    s.player.grenades = { frag: 0, flash: 0, smoke: 0 };
    startRound(G);
  }
  function startRound(G) {
    const s = G.state;
    // Clear old bot bodies.
    for (const b of s.bots) if (b.body) G.scene.remove(b.body.group);
    s.bots = [];
    s.bomb = createBomb();
    s.roundTimer = 100; s.buyTimer = 15;
    // Player respawn.
    const p = s.player;
    const sp = SPAWNS.attack[0];
    p.x = sp[0]; p.z = sp[1]; p.yaw = 0; p.pitch = 0;
    p.hp = 100; p.alive = true; p.flashT = 0; p.plantT = 0; p.defuseT = 0;
    p.vx = 0; p.vz = 0;
    setupRoundBots(G);
    // Carrier bot holds the charge; the player can pick it up if the carrier dies.
    swapViewmodel(G, p.weapon);
    G.hud.setPhase('buy');
    G.hud.renderBuy(G);
    G.comms.say(s, 'round', {});
    G.hud.announce('ROUND ' + s.round + ' — BUY PHASE');
  }
  function startLive(G) {
    const s = G.state;
    s.phase = 'live';
    G.hud.setPhase('live');
    G.hud.show('buy-menu', false);
    G.audio.ensure();
  }
  function endRound(G, winner, detail) {
    const s = G.state;
    if (s.phase !== 'live') return;
    s.phase = 'roundEnd';
    if (winner === 'W') s.scoreW++; else s.scoreD++;
    const bonus = roundPayout(G, winner);
    G.hud.roundEnd(G, winner, detail + ` (+$${bonus})`);
    G.hud.setPhase('roundEnd');
    if (winner === 'W') G.audio.roundWin(); else G.audio.roundLose();
    G.input.unlock();
    s.roundEndT = 4;
    s._matchOver = s.scoreW >= s.firstTo || s.scoreD >= s.firstTo || s.round >= s.maxRounds;
  }
  function checkRoundEnd(G) {
    const s = G.state;
    if (s.phase !== 'live') return;
    const aliveW = s.bots.filter((b) => b.team === 'W' && b.alive).length + (s.player.alive ? 1 : 0);
    const aliveD = s.bots.filter((b) => b.team === 'D' && b.alive).length;
    const b = s.bomb;
    if (b.state === 'planted') {
      if (aliveD === 0) { b.timer = Math.min(b.timer, 3); return; } // no one left to defuse
      if (aliveW === 0) { endRound(G, 'D', 'All attackers eliminated before the blast.'); }
      return;
    }
    if (aliveW === 0) endRound(G, 'D', 'All WOLVES eliminated.');
    else if (aliveD === 0) endRound(G, 'W', 'All WARDENS eliminated.');
  }
  function cycleWeapon(G) {
    const p = G.state.player;
    const owned = Object.keys(p.loadout);
    if (owned.length < 2) return;
    const i = owned.indexOf(p.weapon);
    const next = owned[(i + 1) % owned.length];
    p.weapon = next;
    swapViewmodel(G, next);
  }
  function swapViewmodel(G, id) {
    const p = G.state.player;
    if (p.viewmodel) camera.remove(p.viewmodel);
    p.viewmodel = buildViewmodel(id);
    camera.add(p.viewmodel);
  }

  // ---- Simulation step ----
  function sim(dt) {
    const s = G.state;
    s.time += dt;
    G.world.update(dt, s.time);
    G.effects.update(dt);
    G.grenades.update(dt);
    if (s.phase === 'menu' || s.frozen) return;
    if (s.phase === 'buy') {
      s.buyTimer -= dt;
      updatePlayer(G, dt); // allow looking/moving during buy
      G.hud.update(G, dt);
      if (s.buyTimer <= 0) startLive(G);
      return;
    }
    if (s.phase === 'roundEnd') {
      s.roundEndT -= dt;
      G.hud.update(G, dt);
      if (s.roundEndT <= 0) {
        if (s._matchOver) {
          s.phase = 'matchEnd';
          G.hud.matchEnd(G, s.scoreW > s.scoreD ? 'W' : 'D');
          G.hud.setPhase('matchEnd');
        } else {
          s.round++;
          s.phase = 'buy';
          botsBuy(G);
          startRound(G);
        }
      }
      return;
    }
    if (s.phase !== 'live') return;
    // Live round.
    s.roundTimer -= dt;
    if (s.roundTimer <= 0 && s.bomb.state !== 'planted') {
      endRound(G, 'D', 'Time expired — the charge was never planted.');
      return;
    }
    updatePlayer(G, dt);
    const p = s.player;
    p.moving = Math.hypot(p.vx, p.vz) > 0.8;
    // Player firing.
    const st = p.loadout[p.weapon];
    if (st) {
      tickReload(G, p, st, dt);
      if (st.cooldown > 0) st.cooldown -= dt;
      const w = WEAPONS[p.weapon];
      if (w.auto ? G.input.mouseDown : triggerQueued) {
        fireWeapon(G, p, st);
      }
    }
    triggerQueued = false;
    // Plant / defuse channel while E is held.
    if (G.input.down('KeyE')) {
      const res = playerInteract(G, dt);
      if (res.active) G.hud.interactPrompt(res.done ? '' : `<span class="key">E</span> ${res.label}`, res.frac);
      else G.hud.interactPrompt(null);
    } else {
      p.plantT = 0; p.defuseT = 0;
      G.hud.interactPrompt(null);
    }
    // Bots.
    for (const b of s.bots) updateBot(G, b, dt);
    updateBomb(G, dt);
    checkRoundEnd(G);
    // Prune old noise.
    if (s.noise.length > 24) s.noise.splice(0, s.noise.length - 24);
    // Dead player spectates the first living teammate.
    if (!p.alive) {
      const mate = s.bots.find((b) => b.team === 'W' && b.alive);
      if (mate) {
        G.camera.position.set(mate.x, 2.2, mate.z);
        G.camera.rotation.order = 'YXZ';
        G.camera.rotation.y = mate.yaw; G.camera.rotation.x = 0;
      }
    }
    G.hud.update(G, dt);
  }

  // ---- Screenshot staging (?shot=) ----
  function stageShot(kind) {
    const s = G.state;
    if (kind === 'start') {
      s.phase = 'menu';
      G.hud.setPhase('menu');
      camera.position.set(16, 7, 20);
      camera.lookAt(-8, 3, -10);
      return;
    }
    // All other shots start a match, then freeze a staged moment.
    startMatch(G);
    if (kind === 'buy') {
      s.phase = 'buy'; s.buyTimer = 12;
      s.player.money = 4150;
      giveWeapon(s.player.loadout, 'rifle');
      s.player.weapon = 'rifle';
      swapViewmodel(G, 'rifle');
      G.hud.setPhase('buy');
      G.hud.renderBuy(G);
      const p = s.player;
      p.x = 0; p.z = 16; p.yaw = 0.12; p.pitch = -0.02;
      G.camera.position.set(p.x, p.eyeH, p.z);
      G.camera.rotation.order = 'YXZ';
      G.camera.rotation.y = p.yaw; G.camera.rotation.x = p.pitch;
      return;
    }
    if (kind === 'play') {
      startLive(G);
      const p = s.player;
      // East-mid lane: clear of the mess hall (x -13..-3) and the lab (x 9..19),
      // so both defenders are in plain sight down the lane.
      p.x = 6; p.z = 8; p.yaw = -0.1; p.pitch = -0.01;
      p.hp = 84; p.armor = 93; p.money = 450;
      p.loadout.rifle = { mag: 29, reserve: 90 }; p.weapon = 'rifle';
      swapViewmodel(G, 'rifle');
      s.scoreW = 2; s.scoreD = 1; s.round = 4; s.roundTimer = 74;
      // Two defenders ahead, mid-lane, facing the player; one teammate at the side.
      const place = (bot, x, z, yaw) => {
        bot.x = x; bot.z = z; bot.yaw = yaw; bot.alive = true; bot.hp = 100;
        bot.body.group.position.set(x, 0, z);
        bot.body.group.rotation.y = yaw;
        bot.body.group.visible = true;
      };
      const d1 = s.bots.find((b) => b.name === 'HALO');
      const d2 = s.bots.find((b) => b.name === 'PIKE');
      const mate = s.bots.find((b) => b.name === 'EMBER');
      if (d1) place(d1, 3, 0, Math.PI - 0.1);
      if (d2) place(d2, -1, -6, Math.PI + 0.15);
      if (mate) place(mate, 10, 4, -0.5);
      // The sim is frozen for the shot, so updatePlayer never runs — place the
      // camera at the player's eye explicitly (it would otherwise stay at 0,0,0).
      G.camera.position.set(p.x, p.eyeH, p.z);
      G.camera.rotation.order = 'YXZ';
      G.camera.rotation.y = p.yaw; G.camera.rotation.x = p.pitch;
      // Smoke cloud mid-lane + a tracer across the frame (kept alive while frozen).
      G.effects.smoke(5, -3);
      s._tracer = { from: { x: 5.6, y: 1.5, z: 7.4 }, to: { x: 3, y: 1.3, z: 0 } };
      G.effects.tracer(s._tracer.from, s._tracer.to);
      // Killfeed + comms + HUD values that read at a glance.
      G.hud.killfeed({ name: 'YOU', team: 'W' }, { name: 'BRINE', team: 'D' }, true);
      G.hud.killfeed({ name: 'EMBER', team: 'W' }, { name: 'KESTREL', team: 'D' }, false);
      G.hud.commsLine('Contact mid — two hostiles, engaging!', 'EMBER');
      // Pin the feed entries for the shot: headless rendering is ~1 fps, so the
      // screenshot can land after the normal 6 s / 9 s expiry otherwise.
      for (const d of [...G.hud.kf]) if (d._t) clearTimeout(d._t);
      for (const d of [...document.getElementById('comms').children]) if (d._t) clearTimeout(d._t);
      // The buy-phase announce from startRound must not bleed into the action shot.
      // (The announce banner is the #interact element — see hud.announce.)
      document.getElementById('interact').classList.add('hidden');
      G.hud.announceT = 0;
      G.hud.update(G, 0);
      s.frozen = true;
      return;
    }
    if (kind === 'end') {
      s.phase = 'roundEnd';
      s.scoreW = 3; s.scoreD = 1; s.round = 4;
      G.hud.roundEnd(G, 'W', 'Charge detonated at RADAR DOME (A). (+$3250)');
      G.hud.setPhase('roundEnd');
      G.effects.smoke(-20, -16); // blast smoke lingers for the shot
      camera.position.set(-12, 5, -6);
      camera.lookAt(-20, 2, -16);
      s.frozen = true;
      return;
    }
  }

  // ---- Main loop ----
  let last = performance.now(), acc = 0, frames = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.25) dt = 0.25;
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 5) { sim(STEP); acc -= STEP; n++; }
    if (n === 5) acc = 0;
    // Menu camera orbit.
    if (state.phase === 'menu' && !state.frozen) {
      const t = state.time;
      camera.position.set(Math.sin(t * 0.05) * 26, 9 + Math.sin(t * 0.11) * 1.5, Math.cos(t * 0.05) * 22);
      camera.lookAt(-4, 3, -8);
    }
    // Keep the staged tracer visible while the frame is frozen for a screenshot.
    if (state.frozen && state._tracer) G.effects.tracer(state._tracer.from, state._tracer.to);
    renderer.render(scene, camera);
    frames++;
    if (frames === 3 && window.__shotReady === undefined) {
      window.__shotReady = true;
      document.getElementById('loading').classList.add('hidden');
    }
  }
  // Boot flow.
  const shot = params.get('shot');
  if (shot) {
    // Deterministic staged shot: no menu, straight to the staged frame.
    document.getElementById('loading').classList.add('hidden');
    stageShot(shot);
    G.hud.setPhase(state.phase);
    window.__shotReady = false;
    // Let two frames render, then signal ready.
    setTimeout(() => { window.__shotReady = true; }, 600);
  } else {
    G.hud.setPhase('menu');
  }
  requestAnimationFrame(frame);
}

boot();
