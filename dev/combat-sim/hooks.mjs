import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const { transformSync } = await import(new URL('../../node_modules/rolldown/dist/experimental-index.mjs', import.meta.url).href);

export async function resolve(specifier, context, nextResolve) {
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[a-z]+$/.test(specifier)) {
    const parent = context.parentURL ? fileURLToPath(context.parentURL) : process.cwd();
    const base = path.resolve(path.dirname(parent), specifier);
    for (const cand of [base + '.ts', path.join(base, 'index.ts')]) {
      if (fs.existsSync(cand)) return { url: pathToFileURL(cand).href, shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith('file:') && url.endsWith('.ts')) {
    const file = fileURLToPath(url);
    const src = fs.readFileSync(file, 'utf8');
    const r = transformSync(file, src, { lang: 'ts' });
    if (r.errors && r.errors.length) console.error('transform errors', file, r.errors.slice(0, 2));
    return { format: 'module', source: r.code, shortCircuit: true };
  }
  return nextLoad(url, context);
}
