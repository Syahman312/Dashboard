// Runs the clasp installed in node_modules, on Windows, macOS and Linux.
const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BIN = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'clasp.cmd' : 'clasp');

// Quote one argument for the shell (cmd.exe on Windows, sh elsewhere).
function quote(a) {
  if (/^[\w@%+=:,.\/\\-]+$/.test(a)) return a;
  return process.platform === 'win32' ? '"' + a.replace(/"/g, '""') + '"' : "'" + a.replace(/'/g, "'\\''") + "'";
}

/**
 * Runs clasp. clasp sometimes prints an error but still exits with 0, so the
 * output is also checked; `ok` is false if either says something went wrong.
 */
function clasp(args, opts) {
  opts = opts || {};
  // One pre-quoted command string (passing an args array with shell:true is deprecated in Node).
  const cmd = [quote(BIN)].concat(args.map(quote)).join(' ');
  if (opts.live) {
    // Interactive steps (sign-in) must show their output while they wait.
    const live = spawnSync(cmd, { cwd: ROOT, shell: true, stdio: 'inherit' });
    live.ok = live.status === 0;
    return live;
  }
  const res = spawnSync(cmd, { cwd: ROOT, shell: true, encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'] });
  const out = (res.stdout || '') + (res.stderr || '');
  if (!opts.quiet) process.stdout.write(out);
  res.output = out;
  res.ok = res.status === 0 && !/invalid|error|not found|failed|permission|unauthori[sz]ed|no credentials/i.test(out);
  if (res.error && res.error.code === 'ENOENT') console.error('clasp is not installed. Run "npm install" first.');
  return res;
}

/** Accepts a deployment ID or a full web app URL and returns just the ID. */
function deploymentIdFrom(text) {
  const t = String(text || '').trim();
  const m = t.match(/\/macros\/s\/([\w-]+)\//);
  return m ? m[1] : t;
}

module.exports = { clasp, deploymentIdFrom, ROOT };
