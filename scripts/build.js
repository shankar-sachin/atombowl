const { spawnSync } = require('node:child_process');
const { copyFileSync, readdirSync, cpSync, mkdirSync } = require('node:fs');
const path = require('node:path');
const result = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.json', ...process.argv.slice(2)], { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status || 1);
for (const [source, destination] of [['src/html', 'docs'], ['src/css', 'docs/css']]) {
  for (const file of readdirSync(source, { withFileTypes: true })) {
    if (file.isFile()) copyFileSync(path.join(source, file.name), path.join(destination, file.name));
  }
}
copyFileSync('src/data/firebase_rules.md', 'docs/firebase_rules.md');
copyFileSync('src/data/manifest.json', 'docs/manifest.json');
copyFileSync('src/data/favicon.png', 'docs/favicon.png');

mkdirSync('docs/data', { recursive: true });
for (const file of ['set_A.json', 'set_B.json', 'demo.gif']) copyFileSync(path.join('src/data', file), path.join('docs/data', file));
cpSync('src/data/auth', 'docs/data/auth', { recursive: true });
cpSync('src/data/lessons', 'docs/data/lessons', { recursive: true });
cpSync('src/images', 'docs/images', { recursive: true });
