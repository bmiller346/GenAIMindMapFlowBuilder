import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const repoRoot = path.resolve(__dirname, '..');
const stagingRoot = path.join(repoRoot, '.desktop-resources');
const backendSource = path.join(repoRoot, 'backend');
const backendTarget = path.join(stagingRoot, 'backend');
const ffmpegTarget = path.join(stagingRoot, 'ffmpeg');
const includeVenv = process.argv.includes('--include-venv');

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function shouldCopy(src) {
  const relative = path.relative(backendSource, src);
  const parts = relative.split(path.sep);
  const basename = path.basename(src);

  if (parts.includes('__pycache__') || parts.includes('.pytest_cache')) {
    return false;
  }

  if (!includeVenv && parts.includes('.venv')) {
    return false;
  }

  if (parts.includes('venv') || parts.includes('env')) {
    return false;
  }

  if (basename.endsWith('.pyc') || basename.endsWith('.pyo') || basename.endsWith('.log')) {
    return false;
  }

  return true;
}

async function copyBundledFfmpeg() {
  let ffmpegPath = '';
  try {
    ffmpegPath = require('ffmpeg-static');
  } catch {
    ffmpegPath = '';
  }

  if (!ffmpegPath) {
    console.warn('ffmpeg-static is not installed; packaged local video audio extraction will fall back to PATH.');
    return;
  }

  await fs.mkdir(ffmpegTarget, { recursive: true });
  const executableName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const targetPath = path.join(ffmpegTarget, executableName);
  await fs.copyFile(ffmpegPath, targetPath);
  await fs.chmod(targetPath, 0o755);
  console.log(`Prepared bundled ffmpeg at ${targetPath}`);
}

if (!isInside(repoRoot, stagingRoot)) {
  throw new Error(`Refusing to prepare resources outside repo: ${stagingRoot}`);
}

await fs.rm(stagingRoot, { recursive: true, force: true });
await fs.mkdir(stagingRoot, { recursive: true });

if (process.platform === 'win32') {
  await fs.mkdir(backendTarget, { recursive: true });
  const excludedDirs = ['__pycache__', '.pytest_cache', 'venv', 'env'];
  if (!includeVenv) {
    excludedDirs.push('.venv');
  }

  const result = spawnSync(
    'robocopy',
    [
      backendSource,
      backendTarget,
      '/E',
      '/MT:16',
      '/R:1',
      '/W:1',
      '/NFL',
      '/NDL',
      '/XD',
      ...excludedDirs,
      '/XF',
      '*.pyc',
      '*.pyo',
      '*.log'
    ],
    {
      stdio: 'inherit',
      windowsHide: true
    }
  );

  if ((result.status ?? 16) > 7) {
    throw new Error(`robocopy failed with exit code ${result.status}`);
  }
} else {
  await fs.cp(backendSource, backendTarget, {
    recursive: true,
    filter: shouldCopy
  });
}

await copyBundledFfmpeg();

console.log(`Prepared desktop backend resources at ${backendTarget}`);
console.log(includeVenv ? 'Included backend .venv for self-contained packaging.' : 'Skipped backend .venv for thin packaging.');
