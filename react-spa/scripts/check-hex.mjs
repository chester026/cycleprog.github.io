#!/usr/bin/env node
// Report-only colour gate (plan 4.8). stylelint isn't a dependency yet, so
// this counts hex colour literals per CSS/JS(X) file under src/ outside the
// two token files. The number lives in docs/audit/quality-gates.md; the goal
// is for it to go down with every restyle until a real stylelint rule can
// turn it into an error. Exit code is always 0.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const srcDir = join(root, 'src');
const TOKEN_FILES = new Set(['src/index.css', 'src/ui/theme.css']);
const EXT = /\.(css|jsx?)$/;
const HEX = /#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b(?![\w-])/gi;
// `#fff` and `#123abc` inside a JSX id/selector string are rare; CSS id
// selectors (`#trainings-hero-banner`) are excluded by the trailing `\b(?![\w-])`
// plus the digit/letter class — a hex literal can't contain `-`.

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXT.test(name) && !name.includes('.test.')) out.push(full);
  }
  return out;
}

const counts = [];
let total = 0;
for (const file of walk(srcDir)) {
  const rel = relative(root, file).split('\\').join('/');
  if (TOKEN_FILES.has(rel)) continue;
  const n = (readFileSync(file, 'utf8').match(HEX) || []).length;
  if (n > 0) {
    counts.push([rel, n]);
    total += n;
  }
}

counts.sort((a, b) => b[1] - a[1]);
for (const [file, n] of counts) console.log(`${String(n).padStart(5)}  ${file}`);
console.log(`\n${total} hex colour literals in ${counts.length} files outside ${[...TOKEN_FILES].join(', ')}`);
