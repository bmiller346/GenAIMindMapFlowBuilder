import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { app, BrowserWindow, Menu, dialog, ipcMain, safeStorage, shell } = require('electron');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKEND_PORT = process.env.DOCMAP_BACKEND_PORT || '8000';
const MONGO_HOST = process.env.DOCMAP_MONGO_HOST || '127.0.0.1';
const MONGO_PORT = Number(process.env.DOCMAP_MONGO_PORT || '27017');
const FRONTEND_DEV_URL = process.env.DOCMAP_FRONTEND_URL || 'http://127.0.0.1:5173';
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;

let mainWindow = null;
let backendProcess = null;
let sessionCredentialSettings = null;

const isDev = !app.isPackaged;
const CREDENTIAL_SETTING_KEYS = new Set(['openaiApiKey', 'miroApiToken', 'mondayApiToken']);
const DEFAULT_CREDENTIAL_RETENTION_DAYS = 30;
const ALLOWED_CREDENTIAL_RETENTION_DAYS = new Set([0, 30, 60, 90]);

function ignoreBrokenPipe(error) {
  if (error?.code !== 'EPIPE') {
    throw error;
  }
}

process.stdout?.on?.('error', ignoreBrokenPipe);
process.stderr?.on?.('error', ignoreBrokenPipe);

function safeLog(...args) {
  try {
    console.log(...args);
  } catch (error) {
    if (error?.code !== 'EPIPE') {
      throw error;
    }
  }
}

function safeError(...args) {
  try {
    console.error(...args);
  } catch (error) {
    if (error?.code !== 'EPIPE') {
      throw error;
    }
  }
}

function resolveAppPath(...segments) {
  if (isDev) {
    return path.resolve(__dirname, '..', ...segments);
  }

  return path.join(process.resourcesPath, ...segments);
}

function resolveBackendDir() {
  return resolveAppPath('backend');
}

function resolveBundledFfmpeg() {
  const executableName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const candidates = [
    resolveAppPath('ffmpeg', executableName),
    path.resolve(__dirname, '..', 'node_modules', 'ffmpeg-static', executableName)
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || '';
}

function resolveFrontendIndex() {
  return resolveAppPath('frontend', 'dist', 'index.html');
}

function resolveDesktopIcon(fileName = 'docmap.png') {
  return isDev
    ? path.resolve(__dirname, 'assets', fileName)
    : path.join(process.resourcesPath, 'electron', 'assets', fileName);
}

function resolveCredentialSettingsPath() {
  return path.join(app.getPath('userData'), 'credential-settings.json');
}

function emptyCredentialSettings() {
  return {
    openaiApiKey: '',
    miroApiToken: '',
    mondayApiToken: '',
    credentialRetentionDays: DEFAULT_CREDENTIAL_RETENTION_DAYS,
    expiresAt: ''
  };
}

function normalizeCredentialSettings(settings = {}) {
  const normalized = emptyCredentialSettings();

  for (const key of CREDENTIAL_SETTING_KEYS) {
    const value = settings[key];
    normalized[key] = typeof value === 'string' ? value.trim() : '';
  }

  const retentionDays = Number(settings.credentialRetentionDays);
  normalized.credentialRetentionDays = ALLOWED_CREDENTIAL_RETENTION_DAYS.has(retentionDays)
    ? retentionDays
    : DEFAULT_CREDENTIAL_RETENTION_DAYS;
  normalized.expiresAt =
    typeof settings.expiresAt === 'string' ? settings.expiresAt : '';

  return normalized;
}

function hasCredentialValues(settings = {}) {
  return Array.from(CREDENTIAL_SETTING_KEYS).some((key) => Boolean(settings[key]));
}

function expirationForRetentionDays(retentionDays) {
  if (retentionDays === 0) {
    return '';
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + retentionDays);
  return expiresAt.toISOString();
}

function isCredentialSettingsExpired(settings) {
  if (!settings?.expiresAt) {
    return false;
  }

  return Date.parse(settings.expiresAt) <= Date.now();
}

function canEncryptCredentialSettings() {
  return Boolean(safeStorage?.isEncryptionAvailable?.());
}

function serializeCredentialSettings(settings) {
  const normalized = normalizeCredentialSettings(settings);
  const expiresAt =
    normalized.credentialRetentionDays === 0
      ? ''
      : normalized.expiresAt || expirationForRetentionDays(normalized.credentialRetentionDays);

  if (!canEncryptCredentialSettings()) {
    return {
      encoding: 'plain-v1',
      credentialRetentionDays: normalized.credentialRetentionDays,
      expiresAt,
      values: normalized
    };
  }

  return {
    encoding: 'safeStorage-v1',
    credentialRetentionDays: normalized.credentialRetentionDays,
    expiresAt,
    values: Object.fromEntries(
      Array.from(CREDENTIAL_SETTING_KEYS).map((key) => [
        key,
        normalized[key] ? safeStorage.encryptString(normalized[key]).toString('base64') : ''
      ])
    )
  };
}

function deserializeCredentialSettings(payload) {
  if (!payload || typeof payload !== 'object') {
    return emptyCredentialSettings();
  }

  if (payload.encoding === 'safeStorage-v1') {
    const values = {
      ...emptyCredentialSettings(),
      credentialRetentionDays: payload.credentialRetentionDays,
      expiresAt: payload.expiresAt
    };
    for (const key of CREDENTIAL_SETTING_KEYS) {
      const encrypted = payload.values?.[key];
      if (!encrypted || typeof encrypted !== 'string') {
        values[key] = '';
        continue;
      }

      try {
        values[key] = safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
      } catch (error) {
        safeError(`[docmap-settings] Could not decrypt ${key}: ${error.message}`);
        values[key] = '';
      }
    }
    return normalizeCredentialSettings(values);
  }

  if (payload.encoding === 'plain-v1' || payload.values) {
    return normalizeCredentialSettings({
      ...(payload.values || {}),
      credentialRetentionDays: payload.credentialRetentionDays,
      expiresAt: payload.expiresAt
    });
  }

  return normalizeCredentialSettings(payload);
}

function readCredentialSettings() {
  if (sessionCredentialSettings) {
    return sessionCredentialSettings;
  }

  const settingsPath = resolveCredentialSettingsPath();
  if (!fs.existsSync(settingsPath)) {
    return emptyCredentialSettings();
  }

  try {
    const settings = deserializeCredentialSettings(
      JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
    );
    if (isCredentialSettingsExpired(settings)) {
      clearCredentialSettings();
      return emptyCredentialSettings();
    }

    return settings;
  } catch (error) {
    safeError(`[docmap-settings] Could not read credential settings: ${error.message}`);
    return emptyCredentialSettings();
  }
}

function writeCredentialSettings(settings) {
  const normalized = normalizeCredentialSettings(settings);
  if (!hasCredentialValues(normalized)) {
    clearCredentialSettings();
    return;
  }

  if (normalized.credentialRetentionDays === 0) {
    sessionCredentialSettings = normalized;
    const settingsPath = resolveCredentialSettingsPath();
    if (fs.existsSync(settingsPath)) {
      fs.unlinkSync(settingsPath);
    }
    return;
  }

  sessionCredentialSettings = null;
  const settingsPath = resolveCredentialSettingsPath();
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(
    settingsPath,
    `${JSON.stringify(serializeCredentialSettings(normalized), null, 2)}\n`,
    { mode: 0o600 }
  );
}

function clearCredentialSettings() {
  sessionCredentialSettings = null;
  const settingsPath = resolveCredentialSettingsPath();
  if (fs.existsSync(settingsPath)) {
    fs.unlinkSync(settingsPath);
  }
}

function credentialStorageInfo() {
  const encrypted = canEncryptCredentialSettings();
  return {
    encrypted,
    persistence: encrypted ? 'encrypted-device' : 'local-device'
  };
}

function installCredentialSettingsIpc() {
  ipcMain.handle('docmap:credentials:storage-info', () => credentialStorageInfo());
  ipcMain.handle('docmap:credentials:get', () => readCredentialSettings());
  ipcMain.handle('docmap:credentials:save', (_event, settings) => {
    const normalized = normalizeCredentialSettings(settings);
    writeCredentialSettings(normalized);
    return readCredentialSettings();
  });
  ipcMain.handle('docmap:credentials:clear', () => {
    clearCredentialSettings();
    return emptyCredentialSettings();
  });
}

function packagedVenvPython() {
  const executable = process.platform === 'win32'
    ? path.join(resolveBackendDir(), '.venv', 'Scripts', 'python.exe')
    : path.join(resolveBackendDir(), '.venv', 'bin', 'python');

  return fs.existsSync(executable) ? executable : '';
}

function commandExists(command) {
  const suffixes = process.platform === 'win32' ? ['.cmd', '.exe', '.bat', ''] : [''];
  const pathEntries = (process.env.PATH || '').split(path.delimiter);

  return pathEntries.some((entry) =>
    suffixes.some((suffix) => fs.existsSync(path.join(entry, `${command}${suffix}`)))
  );
}

function pythonCommand() {
  if (commandExists('python')) {
    return process.platform === 'win32' ? 'python.exe' : 'python';
  }

  return process.platform === 'win32' ? 'py.exe' : 'python';
}

function pythonModuleExists(moduleName) {
  const result = spawnSync(pythonCommand(), ['-m', moduleName, '--version'], {
    windowsHide: true,
    stdio: 'ignore'
  });

  return result.status === 0;
}

function backendCommand() {
  const bundledPython = packagedVenvPython();
  if (bundledPython) {
    return {
      command: bundledPython,
      args: ['-m', 'uvicorn', 'app:app', '--host', '127.0.0.1', '--port', BACKEND_PORT]
    };
  }

  if (commandExists('poetry')) {
    return {
      command: process.platform === 'win32' ? 'poetry.cmd' : 'poetry',
      args: ['run', 'uvicorn', 'app:app', '--host', '127.0.0.1', '--port', BACKEND_PORT]
    };
  }

  if (pythonModuleExists('poetry')) {
    return {
      command: pythonCommand(),
      args: ['-m', 'poetry', 'run', 'uvicorn', 'app:app', '--host', '127.0.0.1', '--port', BACKEND_PORT]
    };
  }

  return {
    command: pythonCommand(),
    args: ['-m', 'uvicorn', 'app:app', '--host', '127.0.0.1', '--port', BACKEND_PORT]
  };
}

function startBackend() {
  if (process.env.DOCMAP_SKIP_BACKEND === '1') {
    return;
  }

  const backendDir = resolveBackendDir();
  const { command, args } = backendCommand();
  const bundledFfmpeg = resolveBundledFfmpeg();
  const venvScripts = process.platform === 'win32'
    ? path.join(backendDir, '.venv', 'Scripts')
    : path.join(backendDir, '.venv', 'bin');

  backendProcess = spawn(command, args, {
    cwd: backendDir,
    env: {
      ...process.env,
      PATH: fs.existsSync(venvScripts)
        ? `${venvScripts}${path.delimiter}${process.env.PATH || ''}`
        : process.env.PATH,
      DOCMAP_FFMPEG_PATH: bundledFfmpeg || process.env.DOCMAP_FFMPEG_PATH || '',
      PYTHONUNBUFFERED: '1'
    },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  backendProcess.stdout?.on('data', (data) => {
    safeLog(`[docmap-backend] ${data.toString().trimEnd()}`);
  });

  backendProcess.stderr?.on('data', (data) => {
    safeError(`[docmap-backend] ${data.toString().trimEnd()}`);
  });

  backendProcess.on('exit', (code, signal) => {
    if (mainWindow && code !== 0 && signal !== 'SIGTERM') {
      mainWindow.webContents.send('docmap:backend-exit', { code, signal });
    }
    backendProcess = null;
  });
}

async function waitForUrl(url, timeoutMs = 45000) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { method: 'GET' });
      if (response.ok || response.status < 500) {
        return true;
      }
    } catch {
      // Keep polling while uvicorn starts.
    }

    await new Promise((resolve) => setTimeout(resolve, 750));
  }

  return false;
}

async function waitForBackend(timeoutMs = 90000) {
  return waitForUrl(`${BACKEND_URL}/flows`, timeoutMs);
}

async function canReachMongo(timeoutMs = 1000) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: MONGO_HOST, port: MONGO_PORT });
    const finish = (reachable) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(reachable);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 1100,
    minHeight: 720,
    title: 'DocMap',
    icon: resolveDesktopIcon(process.platform === 'win32' ? 'docmap.ico' : 'docmap.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    safeError(`[docmap-renderer] failed to load ${validatedURL}: ${errorCode} ${errorDescription}`);
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    safeError(`[docmap-renderer] process gone: ${details.reason} (${details.exitCode})`);
  });

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    safeLog(`[docmap-renderer:${level}] ${message} (${sourceId}:${line})`);
  });

  const backendReady = await waitForBackend();
  if (!backendReady) {
    await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'DocMap backend did not start',
      message: 'The local FastAPI backend did not respond in time.',
      detail: 'Check that Poetry is installed and backend dependencies have been installed with `cd backend && poetry install`.'
    });
  }

  if (!(await canReachMongo())) {
    await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'MongoDB is not running',
      message: 'DocMap can open workspaces, but document source uploads need MongoDB.',
      detail: 'Start Docker Desktop, then run `npm run infra:mongo:up` from the repo root. Restart the desktop app after MongoDB is listening on 127.0.0.1:27017.'
    });
  }

  if (process.env.DOCMAP_ELECTRON_DEV === '1') {
    await waitForUrl(FRONTEND_DEV_URL, 45000);
    await mainWindow.loadURL(FRONTEND_DEV_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    return;
  }

  const indexPath = resolveFrontendIndex();
  if (fs.existsSync(indexPath)) {
    await mainWindow.loadFile(indexPath);
    return;
  }

  await mainWindow.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(`
      <h1>DocMap frontend build not found</h1>
      <p>Expected: ${indexPath}</p>
      <p>Run <code>npm run desktop:build:frontend</code> before starting the packaged desktop shell.</p>
    `)}`
  );
}

function installMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open App Data Folder',
          click: () => shell.openPath(app.getPath('userData'))
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => app.quit()
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function stopBackend() {
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill();
  }
}

app.whenReady().then(async () => {
  app.setName('DocMap');
  installCredentialSettingsIpc();
  installMenu();
  startBackend();
  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('before-quit', stopBackend);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
