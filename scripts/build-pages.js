// Builds docs/index.html (the home-screen app on GitHub Pages) from apps-script/Index.html,
// so there is only one copy of the dashboard to maintain.
// Run with:  npm run build:pages
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'apps-script', 'Index.html');
const OUT = path.join(ROOT, 'docs', 'index.html');

const HEAD = [
  '<meta name="referrer" content="no-referrer">',
  '<meta name="theme-color" content="#0e1014">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-title" content="Dashboard">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
  '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">',
  '<link rel="icon" type="image/png" sizes="32x32" href="icons/favicon-32.png">',
  '<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">',
  '<link rel="manifest" href="manifest.webmanifest">'
].join('\n');

function build() {
  const src = fs.readFileSync(SRC, 'utf8');
  if (!src.includes('<!-- PAGES_HEAD -->')) throw new Error('Marker <!-- PAGES_HEAD --> missing from Index.html');
  return src
    .replace('<!DOCTYPE html>', '<!DOCTYPE html>\n<!-- Generated from apps-script/Index.html by scripts/build-pages.js. Do not edit. -->')
    .replace('<!-- PAGES_HEAD -->', HEAD);
}

if (require.main === module) {
  fs.writeFileSync(OUT, build());
  console.log('Wrote docs/index.html');
}
module.exports = { build, OUT };
