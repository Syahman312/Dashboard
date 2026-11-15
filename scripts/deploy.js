// Tests, uploads and publishes the dashboard. The web app URL stays the same.
// Run with:  npm run deploy
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { clasp, ROOT } = require('./clasp');

const stop = msg => { console.error('\n✗ ' + msg); process.exit(1); };

if (!fs.existsSync(path.join(ROOT, '.clasp.json'))) stop('Not set up yet. Run "npm run setup" first.');
const idFile = path.join(ROOT, '.deployment-id');
if (!fs.existsSync(idFile)) stop('No deployment saved. Run "npm run setup" first.');
const deploymentId = fs.readFileSync(idFile, 'utf8').trim();

const code = fs.readFileSync(path.join(ROOT, 'apps-script', 'Code.gs'), 'utf8');
const version = (code.match(/DASH_VERSION = '([^']+)'/) || [])[1] || 'dev';
const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');

console.log('1/3 Running tests…');
const t = spawnSync(process.execPath, ['--test', ...fs.readdirSync(path.join(ROOT, 'test')).filter(f => f.endsWith('.test.js')).map(f => path.join('test', f))],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });
if (t.status !== 0) { process.stdout.write(t.stdout || ''); stop('Tests failed, nothing was uploaded.'); }
console.log('    ✓ tests pass');

// Keep the home-screen app (GitHub Pages) in step with the Apps Script page.
const pages = require('./build-pages');
const before = fs.existsSync(pages.OUT) ? fs.readFileSync(pages.OUT, 'utf8') : '';
const after = pages.build();
if (before !== after) fs.writeFileSync(pages.OUT, after);

console.log('2/3 Uploading files to Apps Script…');
if (clasp(['push', '-f']).status !== 0) stop('Upload failed (see above). If it mentions the Apps Script API, turn it on at https://script.google.com/home/usersettings');

console.log('3/3 Publishing a new version of the web app…');
if (clasp(['redeploy', deploymentId, '-d', 'v' + version + ' ' + stamp]).status !== 0) stop('Publishing failed (see above).');

console.log('\n✓ Deployed v' + version + '. Reload the dashboard and press Refresh.');
if (before !== after) console.log('  The phone app page (docs/index.html) changed: commit and push it so GitHub Pages updates.');
