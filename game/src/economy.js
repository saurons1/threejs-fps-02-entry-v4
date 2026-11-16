// Round economy: money earned per kill / round result, spent in the buy menu.
import { WEAPONS, giveWeapon } from './weapons.js';

export const GRENADE_PRICES = { frag: 300, flash: 200, smoke: 300 };
export const ARMOR_VEST = 650, ARMOR_HELM = 1000;
export const WIN_BONUS = 3250, LOSS_BONUS = 1900, LOSS_STREAK_BONUS = 2400;
export const KILL_BONUS = 300;

export const BUY_ITEMS = [
  { key: 'smg', kind: 'gun', name: 'SABLE-9 SMG', desc: '750 RPM · 30/90 · close quarters', price: 1500 },
  { key: 'rifle', kind: 'gun', name: 'K-77 VOSTOK', desc: '600 RPM · 25/75 · all-round rifle', price: 2700 },
  { key: 'shotgun', kind: 'gun', name: 'BORE-12', desc: '8 pellets · 6 shells · corridor clearer', price: 2200 },
  { key: 'dmr', kind: 'gun', name: 'LONGSHOT .50', desc: 'Scoped · 88 dmg · one tap at range', price: 5500 },
  { key: 'vest', kind: 'armor', name: 'KEVLAR VEST', desc: 'Absorbs 50% of damage', price: ARMOR_VEST },
  { key: 'helm', kind: 'armor', name: 'VEST + HELMET', desc: 'Vest + headshots hurt less', price: ARMOR_HELM },
  { key: 'frag', kind: 'grenade', name: 'FRAG GRENADE', desc: '110 dmg blast · clears corners', price: 300 },
  { key: 'flash', kind: 'grenade', name: 'FLASHBANG', desc: 'Blinds bots and you — look away', price: 200 },
  { key: 'smoke', kind: 'grenade', name: 'SMOKE GRENADE', desc: '14 s wall of smoke · blocks sight', price: 300 },
];

export function roundPayout(G, winnerTeam) {
  const s = G.state, p = s.player;
  const won = winnerTeam === 'W';
  let bonus = won ? WIN_BONUS : LOSS_BONUS;
  if (!won) {
    s.lossStreak = (s.lossStreak || 0) + 1;
    if (s.lossStreak >= 2) bonus = LOSS_STREAK_BONUS;
  } else s.lossStreak = 0;
  p.money += bonus;
  // Bots buy too: give the carrier's team a random affordable upgrade.
  for (const b of s.bots) {
    if (!b.alive && s.phase === 'roundEnd') continue;
    const roll = G.rng();
    if (b.armor < 50 && roll < 0.4) b.armor = 50;
    if (roll < 0.25) b.hasHelmet = true;
  }
  return bonus;
}

export function buyItem(G, key) {
  const s = G.state, p = s.player;
  const item = BUY_ITEMS.find((x) => x.key === key);
  if (!item) return false;
  if (p.money < item.price) { G.audio.denied(); return false; }
  if (item.kind === 'gun') {
    if (s.player.loadout[item.key]) { G.audio.denied(); return false; }
    giveWeapon(s.player.loadout, item.key);
    s.player.weapon = item.key;
    G.playerSwapViewmodel(item.key);
  } else if (item.kind === 'armor') {
    if (item.key === 'vest') p.armor = 50;
    else { p.armor = 100; p.hasHelmet = true; }
  } else {
    p.grenades[item.key] = (p.grenades[item.key] || 0) + 1;
  }
  p.money -= item.price;
  G.audio.buy();
  return true;
}

// Bots spend their (simulated) money between rounds: armor + a better gun.
export function botsBuy(G) {
  for (const b of G.state.bots) {
    const r = G.rng();
    if (r < 0.45) b.armor = Math.max(b.armor, 50);
    if (r < 0.2) b.hasHelmet = true;
    if (r < 0.3 && b.st.id === 'rifle') {
      b.st.id = 'dmr';
      const w = WEAPONS.dmr;
      b.st.mag = w.mag; b.st.reserve = w.reserve;
    }
  }
}
