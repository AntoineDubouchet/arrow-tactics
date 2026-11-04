// Lance chaque test SANS NAVIGATEUR de tests/sim/ (fichiers .mts, sources TS
// chargees telles quelles par Node 22+ via tests/ts-register.mjs) dans un
// processus separe, puis resume : un test echoue si son processus sort en
// erreur ou si sa sortie contient « ECHEC ». `node tests/run-sim.mjs nom`
// ne lance que les tests dont le nom contient `nom`.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, 'sim');
const filter = process.argv.slice(2);
const files = readdirSync(dir).filter((f) => f.endsWith('.mts') && (filter.length === 0 || filter.some((k) => f.includes(k)))).sort();
const results = [];
for (const file of files) {
  const t = Date.now();
  const r = spawnSync(process.execPath, ['--import', pathToFileURL(path.join(here, 'ts-register.mjs')).href, path.join(dir, file)], { encoding: 'utf8', cwd: here, maxBuffer: 64 * 1024 * 1024 });
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  const failed = r.status !== 0 || /ECHEC/.test(out);
  const seconds = (Date.now() - t) / 1000;
  results.push({ file, failed, seconds });
  console.log(`\n=== ${file} (${seconds.toFixed(1)} s) ${failed ? 'ECHEC' : 'OK'}`);
  if (failed) console.log(out.split('\n').filter((l) => /ECHEC|Error|error|    at /.test(l)).slice(0, 40).join('\n'));
}
console.log('\n--- Bilan test:sim');
for (const r of results) console.log(`${r.failed ? 'ECHEC' : 'OK   '} ${r.file} (${r.seconds.toFixed(1)} s)`);
const failures = results.filter((r) => r.failed).length;
console.log(failures ? `${failures} test(s) en echec` : `tout OK (${results.length} tests)`);
process.exit(failures ? 1 : 0);
