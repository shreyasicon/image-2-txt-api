/** Run from `webapp/` — forwards to webapp/scalable/deploy-webapp-amplify.js */
const path = require('path');
const { spawnSync } = require('child_process');

const scalable = path.join(__dirname, 'scalable');
const script = path.join(scalable, 'deploy-webapp-amplify.js');
const r = spawnSync(process.execPath, [script, ...process.argv.slice(2)], {
  cwd: scalable,
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32',
});
process.exit(r.status === null ? 1 : r.status);
