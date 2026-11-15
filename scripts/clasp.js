// Runs the clasp installed in node_modules, on Windows, macOS and Linux.
const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BIN = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'clasp.cmd' : 'clasp');

function clasp(args, opts) {
  opts = opts || {};
  const res = spawnSync('"' + BIN + '"', args.map(a => (/[\s"]/.test(a) ? '"' + a.replace(/"/g, '\\"') + '"' : a)), {
    cwd: ROOT, shell: true, encoding: 'utf8', stdio: opts.capture ? 'pipe' : 'inherit'
  });
  if (res.error && res.error.code === 'ENOENT') {
    console.error('clasp is not installed. Run "npm install" first.');
  }
  if (opts.capture && res.stdout) process.stdout.write(res.stdout);
  return res;
}

module.exports = { clasp, ROOT };
