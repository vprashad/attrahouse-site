// After `astro build`:
// - SITE_MODE=landing (default): delete every shop page, so only the landing page and 404 go out.
// - SITE_MODE=shop with STRICT=1 (launch builds): refuse to finish if any [bracketed] placeholder is left.
import { readdirSync, rmSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
const mode = process.env.SITE_MODE === 'shop' ? 'shop' : 'landing';
const KEEP = new Set(['index.html', '404.html', '_astro', 'favicon.svg']);

if (mode === 'landing') {
  for (const name of readdirSync(dist)) if (!KEEP.has(name)) rmSync(join(dist, name), { recursive: true, force: true });
  console.log('landing build: kept', [...KEEP].join(', '));
} else if (process.env.STRICT === '1') {
  const found = [];
  const walk = (dir) => {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.html')) {
        const text = readFileSync(p, 'utf8').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '');
        for (const m of text.matchAll(/\[[A-Z][^\]<>]{3,}\]/g)) found.push(`${p.replace(dist, '')}: ${m[0]}`);
      }
    }
  };
  walk(dist);
  if (found.length) {
    console.error(`Launch build stopped: ${found.length} placeholder(s) still on the site:\n` + found.join('\n'));
    process.exit(1);
  }
  console.log('shop build: no placeholders left');
}
