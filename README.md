# POLARIS STATION — 5v5 Tactical FPS

[![make.fun](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/saurons1/threejs-fps-02-entry-v4/rank.svg)](https://make.fun/bounty/threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/saurons1/threejs-fps-02-entry-v4/reward.svg)](https://make.fun/bounty/threejs-fps-02)

A round-based tactical FPS in the Counter-Strike style, built on three.js 0.187.0.
An arctic research station under polar night: aurora sky, snow, floodlit modules.
**WOLVES** (attackers) carry a charge to **RADAR DOME (A)** or **FUEL DEPOT (B)**,
plant it, and hold the site; **WARDENS** (defenders) hold angles, rotate on contact,
and retake + defuse. First to 7 rounds takes the station.

## The game

- **5v5 with objective bots** — carrier plants, escorts cover, rusher and flanker take
  different lanes, defenders hold sites and retake after a plant. Bots see, hear,
  and react (three difficulties: Recruit / Veteran / Elite).
- **Buy economy** — $800 start, kill and round bonuses, 5 weapons (P-9, Sable-9 SMG,
  K-77 Vostok, Bore-12 shotgun, scoped Longshot .50), armor, and 3 grenades
  (frag / flash / smoke — smoke blocks bot vision).
- **Gunplay that rewards stopping to aim** — recoil and spread punish firing on the
  move, headshots pay double, ADS with a scope on the DMR, crouch and quiet-walk.
- **Complete loop** — buy phase, plant/defuse, round end, match end, scoreboard with
  per-bot K/D, killfeed with headshot markers, radio comms, minimap with A/B sites.
- **Original everything** — map, names, art, and sounds (all audio is synthesized
  WebAudio; no assets fetched, no network at all).

## Run it

```sh
node serve.ts        # serves game/ at http://127.0.0.1:8080
```

Open the page in desktop Chrome, pick a difficulty, press DEPLOY.
`WASD` move · mouse aim · click fire · `R` reload · right-click aim ·
`Shift` quiet-walk · `C` crouch · `B` buy · `G` grenade · `E` plant/defuse (hold) ·
`Tab` scoreboard · `1/2/3` frag/flash/smoke.

## Build the entry

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts   # writes out/dossier.json
```

`main.ts` (Node 22 stdlib only) copies `game/` + `screenshots/` to the output
directory and writes the dossier with the kit's `vendor/makefun-threejs.ts`.

## Layout

- `game/index.html` — page + HUD
- `game/src/main.js` — boot, fixed-step loop, round/match flow, screenshot hooks
- `game/src/world.js` — Polaris Station map, colliders, waypoints, aurora sky
- `game/src/bots.js` — objective bot AI (plant / hold / rotate / retake / defuse)
- `game/src/weapons.js` — hitscan gunplay, recoil, armor, headshots
- `game/src/player.js` — movement, camera, viewmodel guns
- `game/src/grenades.js` · `game/src/bomb.js` · `game/src/economy.js`
- `game/src/hud.js` · `game/src/effects.js` · `game/src/comms.js`
- `game/src/audio.js` · `game/src/input.js` · `game/src/util.js` · `game/src/rng.js`
- `game/vendor/three/` — three.js 0.187.0 (vendored, byte for byte)

## License

MIT — see LICENSE.
