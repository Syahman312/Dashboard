// One-time setup: links this folder to your Apps Script project and web app.
// Run with:  npm run setup
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { clasp } = require('./clasp');

const ROOT = path.join(__dirname, '..');
const CLASP_JSON = path.join(ROOT, '.clasp.json');
const DEPLOY_FILE = path.join(ROOT, '.deployment-id');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = q => new Promise(res => rl.question(q, a => res(a.trim())));

(async () => {
  console.log('\nDashboard setup\n---------------');
  console.log('1) Signing in to Google (a browser window opens; skip if already signed in).');
  if ((await ask('   Sign in now? [Y/n] ')).toLowerCase() !== 'n') {
    if (clasp(['login']).status !== 0) return fail('Sign-in did not finish.');
  }

  console.log('\n2) Script ID: in the Apps Script editor open Project Settings (gear icon) → IDs → Script ID.');
  let scriptId = '';
  while (!/^[\w-]{20,}$/.test(scriptId)) scriptId = await ask('   Paste the Script ID: ');
  fs.writeFileSync(CLASP_JSON, JSON.stringify({ scriptId, rootDir: 'apps-script' }, null, 2) + '\n');
  console.log('   Saved .clasp.json');

  console.log('\n3) Finding your web app deployment…');
  const res = clasp(['list-deployments'], { capture: true });
  const found = [...(res.stdout || '').matchAll(/^-\s+(\S+)\s+@(\d+)(?:\s+-\s+(.*))?$/gm)]
    .map(m => ({ id: m[1], version: +m[2], desc: m[3] || '' }));
  let deploymentId = '';
  if (found.length === 1) {
    deploymentId = found[0].id;
    console.log('   Using deployment @' + found[0].version + ' ' + found[0].desc);
  } else {
    if (found.length) found.forEach((d, i) => console.log('   ' + (i + 1) + ') @' + d.version + ' ' + d.desc + '  ' + d.id));
    else console.log('   Could not list deployments' + (res.stderr ? ': ' + res.stderr.trim() : '') + '.');
    console.log('   (Deploy → Manage deployments → select the web app → copy the Deployment ID.)');
    const a = await ask('   Pick a number or paste the Deployment ID: ');
    deploymentId = found[+a - 1] ? found[+a - 1].id : a;
  }
  if (!deploymentId) return fail('No deployment chosen.');
  fs.writeFileSync(DEPLOY_FILE, deploymentId + '\n');
  console.log('   Saved .deployment-id');

  console.log('\nAll set. From now on, to publish changes run:\n\n   npm run deploy\n');
  rl.close();
})();

function fail(msg) {
  console.error('\n' + msg + ' Run "npm run setup" again when ready.');
  rl.close();
  process.exitCode = 1;
}
