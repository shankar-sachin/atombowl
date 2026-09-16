const { spawnSync } = require('node:child_process');
const { copyFileSync, readdirSync, cpSync } = require('node:fs');
const path = require('node:path');
const result = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.json', ...process.argv.slice(2)], { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status || 1);
for (const [source, destination] of [['src/html', 'docs'], ['src/css', 'docs/css']]) {
  for (const file of readdirSync(source, { withFileTypes: true })) {
    if (file.isFile()) copyFileSync(path.join(source, file.name), path.join(destination, file.name));
  }
}
copyFileSync('src/data/firebase_rules.md', 'docs/firebase_rules.md');

cpSync("src/data/auth", "docs/data/auth", { recursive: true });
