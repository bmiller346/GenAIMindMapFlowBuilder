import { execFile, spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const frontendHost = '127.0.0.1';
const frontendPort = 5173;
const backendPort = 8000;
const execFileAsync = promisify(execFile);

const electronBin = process.platform === 'win32'
  ? path.join(repoRoot, 'node_modules', '.bin', 'electron.cmd')
  : path.join(repoRoot, 'node_modules', '.bin', 'electron');

const children = [];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getPortOwnerPids(port) {
  if (process.platform !== 'win32') {
    return Promise.resolve([]);
  }

  const fromNetstat = execFileAsync('netstat.exe', ['-ano', '-p', 'tcp'], {
    windowsHide: true
  })
    .then(({ stdout }) => stdout
      .split(/\r?\n/)
      .map((line) => line.trim().split(/\s+/))
      .filter((columns) => columns.length >= 5)
      .filter(([, localAddress, , state]) => state === 'LISTENING' && localAddress.endsWith(`:${port}`))
      .map((columns) => Number.parseInt(columns.at(-1), 10))
      .filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid))
    .catch(() => []);

  const fromPowerShell = execFileAsync(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess`
    ],
    { windowsHide: true }
  )
    .then(({ stdout }) => stdout
      .split(/\r?\n/)
      .map((line) => Number.parseInt(line.trim(), 10))
      .filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid))
    .catch(() => []);

  return Promise.all([fromNetstat, fromPowerShell])
    .then((pidGroups) => [...new Set(pidGroups.flat())]);
}

async function stopPortOwners(port) {
  const pids = await getPortOwnerPids(port);

  if (pids.length === 0) {
    return;
  }

  console.log(`[dev] port ${port} is already in use; stopping stale listener(s): ${pids.join(', ')}`);

  for (const pid of pids) {
    try {
      if (process.platform === 'win32') {
        await execFileAsync('taskkill.exe', ['/pid', String(pid), '/T', '/F'], {
          windowsHide: true
        });
      } else {
        process.kill(pid);
      }
    } catch {
      // The process may have exited after we inspected the port.
    }
  }

  await waitForPort(port, frontendHost, true, 5000);
}

function canBindPort(host, port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

async function waitForPort(port, host, expectedFree, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const isFree = await canBindPort(host, port);

    if (isFree === expectedFree) {
      return true;
    }

    await sleep(150);
  }

  return false;
}

async function canReachUrl(url, timeoutMs = 3000) {
  const timeout = AbortSignal.timeout(timeoutMs);

  try {
    const response = await fetch(url, { signal: timeout });
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}

function terminateChild(child) {
  if (child.killed || child.exitCode !== null) {
    return;
  }

  if (process.platform === 'win32') {
    spawn('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true
    });
    return;
  }

  child.kill();
}

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
    terminateChild(child);
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

async function main() {
  await stopPortOwners(frontendPort);
  await stopPortOwners(backendPort);

  const portReady = await waitForPort(frontendPort, frontendHost, true);
  const backendReady = await waitForPort(backendPort, frontendHost, true);

  if (!portReady) {
    console.error(`[dev] port ${frontendPort} is still in use after cleanup; refusing to start on the wrong app.`);
    process.exit(1);
  }

  const reuseExistingBackend =
    !backendReady && await canReachUrl(`http://${frontendHost}:${backendPort}/flows`);

  if (!backendReady && !reuseExistingBackend) {
    console.error(`[dev] port ${backendPort} is still in use after cleanup and does not look like a TraceSpace backend.`);
    process.exit(1);
  }

  if (reuseExistingBackend) {
    console.log(`[dev] port ${backendPort} is already serving TraceSpace; reusing that backend for this Electron session.`);
  }

  spawnChecked(
    'vite',
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['--prefix', 'frontend', 'run', 'dev', '--', '--host', frontendHost, '--port', String(frontendPort), '--strictPort']
  );

  const viteReady = await waitForPort(frontendPort, frontendHost, false, 10000);

  if (!viteReady) {
    console.error(`[dev] vite did not bind ${frontendHost}:${frontendPort} in time.`);
    shutdown();
    process.exit(1);
  }

  spawnChecked('electron', electronBin, ['.'], {
    env: {
      ...process.env,
      DOCMAP_ELECTRON_DEV: '1',
      DOCMAP_FRONTEND_URL: `http://${frontendHost}:${frontendPort}`,
      ...(reuseExistingBackend ? { DOCMAP_SKIP_BACKEND: '1' } : {})
    }
  });
}

main().catch((error) => {
  console.error(error);
  shutdown();
  process.exit(1);
});
