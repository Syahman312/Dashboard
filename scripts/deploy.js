// Tests, uploads and publishes the dashboard. The web app URL stays the same.
// Run with:  npm run deploy
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { clasp, deploymentIdFrom, ROOT } = require('./clasp');

const stop = msg => { console.error('\n✗ ' + msg); process.exit(1); };

if (!fs.existsSync(path.join(ROOT, '.clasp.json'))) stop('Not set up yet. Run "npm run setup" first.');
const idFile = path.join(ROOT, '.deployment-id');
if (!fs.existsSync(idFile)) stop('No deployment saved. Run "npm run setup" first.');
const saved = fs.readFileSync(idFile, 'utf8').trim();
const deploymentId = deploymentIdFrom(saved);
if (!/^AKfy[\w-]{20,}$/.test(deploymentId)) stop('The saved deployment ID does not look right: ' + saved + '\n  Run "npm run setup" again, or paste the Deployment ID (starts with AKfy) into .deployment-id');
if (deploymentId !== saved) fs.writeFileSync(idFile, deploymentId + '\n'); // fix a pasted URL for next time

const code = fs.readFileSync(path.join(ROOT, 'apps-script', 'Code.gs'), 'utf8');
const version = (code.match(/DASH_VERSION = '([^']+)'/) || [])[1] || 'dev';
const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');

// Keep the home-screen app (GitHub Pages) in step with the Apps Script page before testing.
const pages = require('./build-pages');
const pagesChanged = !pages.inSync();
if (pagesChanged) fs.writeFileSync(pages.OUT, pages.build());

console.log('1/3 Running tests…');
const t = spawnSync(process.execPath, ['--test', ...fs.readdirSync(path.join(ROOT, 'test')).filter(f => f.endsWith('.test.js')).map(f => path.join('test', f))],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });
if (t.status !== 0) { process.stdout.write(t.stdout || ''); stop('Tests failed, nothing was uploaded.'); }
console.log('    ✓ tests pass');

console.log('2/3 Uploading files to Apps Script…');
if (!clasp(['push', '-f']).ok) stop('Upload failed (see above). If it mentions the Apps Script API, turn it on at https://script.google.com/home/usersettings');

console.log('3/3 Publishing a new version of the web app…');
if (!clasp(['redeploy', deploymentId, '-d', 'v' + version + ' ' + stamp]).ok) stop('Publishing failed (see above). The files were uploaded, but the web app still runs the previous version.');

console.log('\n✓ Deployed v' + version + '. Reload the dashboard and press Refresh.');
if (pagesChanged) console.log('  The phone app page (docs/index.html) changed: commit and push it so GitHub Pages updates.');
console.log('  First time on this version, or an app moved to a new sheet? Run setupDashboard once in the editor (npm run open).');
