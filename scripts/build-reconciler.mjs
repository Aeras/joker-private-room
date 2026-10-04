import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function buildReconciler(outputDirectory) {
  const output = resolve(outputDirectory);
  mkdirSync(output, { recursive: true });
  execFileSync(process.env.BUN_EXECUTABLE || 'bun', [
    'build', 'supabase/functions/game-reconciler/index.ts',
    '--target=browser', '--format=esm', '--external=jsr:*',
    '--sourcemap=external', `--outdir=${output}`,
  ], { stdio: 'pipe' });
  const sha256 = (text) => createHash('sha256').update(text).digest('hex');
  const bundle = readFileSync(resolve(output, 'index.js'), 'utf8');
  const map = JSON.parse(readFileSync(resolve(output, 'index.js.map'), 'utf8'));
  // Source maps preserve the actual compiler inputs, rather than a hand-maintained
  // approximation of the dependency graph. No gameplay source is substituted.
  const sources = map.sources.map((path, i) => ({ path, sha256: sha256(map.sourcesContent[i].replace(/\r\n/g, '\n')) }));
  const manifest = {
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    bunVersion: execFileSync(process.env.BUN_EXECUTABLE || 'bun', ['--version'], { encoding: 'utf8' }).trim(),
    entrypoint: 'index.js', bundleSha256: sha256(bundle), sources,
  };
  writeFileSync(resolve(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return { bundle, manifest };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('Usage: node scripts/build-reconciler.mjs <artifact-directory>');
  const { manifest } = buildReconciler(process.argv[2]);
  console.log(JSON.stringify(manifest, null, 2));
}
