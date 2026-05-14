import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const electronBin = process.platform === 'win32'
  ? path.join(repoRoot, 'node_modules', '.bin', 'electron.cmd')
  : path.join(repoRoot, 'node_modules', '.bin', 'electron');

const children = [];

function spawnChecked(label, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: repoRoot,
    shell: process.platform === 'win32',
    stdio: 'inherit',
    env: process.env,
    windowsHide: true,
    ...options
  });

  child.on('exit', (code, signal) => {
    if (code && code !== 0) {
      console.error(`[${label}] exited with code ${code}`);
    }
    if (signal) {
      console.error(`[${label}] exited with signal ${signal}`);
    }
    shutdown();
  });

  children.push(child);
  return child;
}

function shutdown() {
  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }
}

process.on('SIGINT', () => {
  shutdown();
  process.exit(0);
});

process.on('SIGTERM', () => {
  shutdown();
  process.exit(0);
});

spawnChecked(
  'vite',
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['--prefix', 'frontend', 'run', 'dev', '--', '--host', '127.0.0.1', '--port', '5173', '--strictPort']
);

setTimeout(() => {
  spawnChecked('electron', electronBin, ['.'], {
    env: {
      ...process.env,
      DOCMAP_ELECTRON_DEV: '1',
      DOCMAP_FRONTEND_URL: 'http://127.0.0.1:5173'
    }
  });
}, 1500);
