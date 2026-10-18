/**
 * Copy the frontend vendor libraries from node_modules into public/vendor
 * so the app is fully offline — no CDN needed at demo time.
 *
 * Runs automatically after "npm install" (postinstall) and can be re-run
 * with "npm run vendor".
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'vendor');
fs.mkdirSync(outDir, { recursive: true });

const libraries = [
  {
    label: 'Chart.js',
    out: 'chart.umd.js',
    candidates: ['node_modules/chart.js/dist/chart.umd.js', 'node_modules/chart.js/dist/chart.umd.min.js'],
  },
  {
    label: 'html5-qrcode',
    out: 'html5-qrcode.min.js',
    candidates: ['node_modules/html5-qrcode/html5-qrcode.min.js', 'node_modules/html5-qrcode/dist/html5-qrcode.min.js'],
  },
];

let failed = false;
for (const library of libraries) {
  const source = library.candidates
    .map((candidate) => path.join(root, candidate))
    .find((candidate) => fs.existsSync(candidate));
  if (!source) {
    console.error(`x ${library.label}: package file not found — run "npm install" first.`);
    failed = true;
    continue;
  }
  fs.copyFileSync(source, path.join(outDir, library.out));
  console.log(`v ${library.label} -> public/vendor/${library.out}`);
}

process.exit(failed ? 1 : 0);
