// Trusted structural verifier for the playground task (operator-owned:
// scripts/** is never in any task's allowed_writes). No browser in the
// sandbox, so this pins the static contract instead.
import { readFileSync } from 'node:fs';

const fail = (msg) => { console.error('playground check FAIL: ' + msg); process.exit(1); };
let html;
try { html = readFileSync('index.html', 'utf8'); } catch { fail('index.html missing'); }
if (!/<script\s+type=["']module["']/.test(html)) fail('no <script type="module">');
if (!/from\s+['"]\.\/src\/index\.mjs['"]/.test(html)) fail('does not import ./src/index.mjs');
if (!/run/.test(html)) fail('does not reference run');
if (!/<textarea/.test(html)) fail('no textarea');
if (/https?:\/\//.test(html.replace(/https?:\/\/github\.com\/Marontis\/weft[^\s"'<]*/g, '')))
  fail('external network reference found (must be offline-capable; only the repo link is allowed)');
console.log('playground check PASS');
