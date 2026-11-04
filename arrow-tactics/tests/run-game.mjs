// Lance les tests EN JEU de tests/game/ (Playwright, Edge) : demarre un
// serveur Vite dedie (port TEST_VITE_PORT, 5177 par defaut), attend qu'il
// reponde, execute chaque script .cjs dans un processus separe avec
// VITE_BASE, puis arrete le serveur. Un test echoue si son processus sort en
// erreur ou si sa sortie contient « ECHEC ». `node tests/run-game.mjs nom`
// ne lance que les scripts dont le nom contient `nom`. Avec VITE_BASE deja
// defini (serveur de developpement deja lance), aucun serveur n'est demarre.
import { spawn, spawnSync } from 'node:child_process';
import { readdirSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const dir = path.join(here, 'game');
mkdirSync(path.join(dir, 'out'), { recursive: true });
const filter = process.argv.slice(2);
const files = readdirSync(dir).filter((f) => f.endsWith('.cjs') && f !== 'lib.cjs' && (filter.length === 0 || filter.some((k) => f.includes(k)))).sort();
const port = process.env.TEST_VITE_PORT || '5177';
let base = process.env.VITE_BASE;
let vite = null;
if (!base) {
  base = `http://localhost:${port}/`;
  const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  vite = spawn(process.execPath, [viteBin, '--port', port, '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  vite.stdout.on('data', () => {});
  vite.stderr.on('data', (d) => process.stderr.write(d));
  const deadline = Date.now() + 60000;
  let up = false;
  while (Date.now() < deadline && !up) {
    try { up = (await fetch(base)).ok; } catch { await new Promise((r) => setTimeout(r, 300)); }
  }
  if (!up) { console.error(`Vite ne repond pas sur ${base}`); vite.kill(); process.exit(1); }
}
const results = [];
for (const file of files) {
  const t = Date.now();
  const r = spawnSync(process.execPath, [path.join(dir, file)], { encoding: 'utf8', cwd: dir, env: { ...process.env, VITE_BASE: base }, maxBuffer: 64 * 1024 * 1024 });
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  const failed = r.status !== 0 || /ECHEC/.test(out);
  const seconds = (Date.now() - t) / 1000;
  results.push({ file, failed, seconds });
  console.log(`\n=== ${file} (${seconds.toFixed(1)} s) ${failed ? 'ECHEC' : 'OK'}`);
  if (failed) console.log(out.split('\n').filter((l) => /ECHEC|Error|error|    at /.test(l)).slice(0, 40).join('\n'));
}
if (vite) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(vite.pid), '/t', '/f'], { stdio: 'ignore' });
  else vite.kill();
}
console.log('\n--- Bilan test:game');
for (const r of results) console.log(`${r.failed ? 'ECHEC' : 'OK   '} ${r.file} (${r.seconds.toFixed(1)} s)`);
const failures = results.filter((r) => r.failed).length;
console.log(failures ? `${failures} test(s) en echec` : `tout OK (${results.length} tests)`);
process.exit(failures ? 1 : 0);
