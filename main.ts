// POLARIS STATION — entrypoint. Copies game/ + screenshots/ into the output
// directory and writes the dossier the judge reads, using the kit's library.
// Node 22 standard library only; no network, no installs.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const REPO = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.MAKEFUN_OUTPUT_DIR || '/output';
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
};

function clearDir(dir) {
  // Empty the directory's CONTENTS only: the grader owns the directory itself,
  // and removing it would fail the second run with EACCES.
  mkdirSync(dir, { recursive: true });
  for (const name of readdirSync(dir)) {
    rmSync(join(dir, name), { recursive: true, force: true });
  }
}

function main() {
  const gameSrc = join(REPO, 'game');
  const shotsSrc = join(REPO, 'screenshots');
  if (!existsSync(gameSrc)) throw new Error('game/ is missing from the repository');
  clearDir(OUT);
  cpSync(gameSrc, join(OUT, 'game'), { recursive: true });
  if (existsSync(shotsSrc)) cpSync(shotsSrc, join(OUT, 'screenshots'), { recursive: true });
  const dossier = buildDossier(OUT, CAPS); // Uint8Array of UTF-8 JSON bytes
  writeFileSync(join(OUT, 'dossier.json'), dossier);
  const parsed = JSON.parse(new TextDecoder().decode(dossier));
  console.log(`POLARIS STATION: dossier ${dossier.length} bytes, text ${parsed.text.length} bytes -> ${OUT}/dossier.json`);
}
main();
