const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '..', 'src', 'html');
const pages = fs.readdirSync(dir).filter((f) => f.endsWith('.html'));
const theme = (html) => (html.match(/<script>\(function\(\)\{try\{var s=JSON\.parse\(localStorage\.getItem\('atom_settings_v1'\)[\s\S]*?<\/script>/) || [''])[0];

test('every page applies the saved theme in its head, before the stylesheets, with the same script', () => {
  const first = theme(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'));
  assert.ok(first.includes('theme-light') && first.includes('high-contrast') && first.includes('no-anim'));
  for (const page of pages) {
    const html = fs.readFileSync(path.join(dir, page), 'utf8');
    assert.equal(theme(html), first, `${page} has a different or missing theme script`);
    assert.ok(html.indexOf(first) < html.indexOf('rel="stylesheet"'), `${page} loads a stylesheet before the theme script`);
    assert.ok(html.indexOf(first) < html.indexOf('</head>'), `${page} has the theme script outside the head`);
  }
});

test('the 404 page uses root paths, because it is served for missing URLs at any depth', () => {
  const html = fs.readFileSync(path.join(dir, '404.html'), 'utf8');
  const local = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]).filter((u) => !/^(https?:)?\/\//.test(u));
  assert.ok(local.length > 5);
  for (const url of local) assert.ok(url.startsWith('/'), `${url} is relative`);
});
