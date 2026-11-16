// One build command for every case.
// - On Cloudflare (Workers Builds): branch "main" builds the landing page; any other branch builds
//   the full shop, so preview links show the shop while attrahouse.com shows the landing page.
// - Locally: SITE_MODE=shop builds the shop; anything else builds the landing page.
// The chosen mode is written to src/worker/mode.js so the Worker and the pages always agree.
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const branch = process.env.WORKERS_CI_BRANCH;
const mode = branch ? (branch === 'main' ? 'landing' : 'shop') : process.env.SITE_MODE === 'shop' ? 'shop' : 'landing';
writeFileSync(new URL('../src/worker/mode.js', import.meta.url), `// Written by scripts/build.mjs. Do not edit.\nexport const SITE_MODE = ${JSON.stringify(mode)};\n`);
console.log(`Building ${mode}${branch ? ` (branch ${branch})` : ''}`);
const env = { ...process.env, SITE_MODE: mode };
execSync('npx astro build', { stdio: 'inherit', env });
execSync('node scripts/prune-landing.mjs', { stdio: 'inherit', env });
