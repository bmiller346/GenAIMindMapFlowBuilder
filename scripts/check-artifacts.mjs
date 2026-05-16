import { execFileSync } from 'node:child_process';

const runGit = (args) =>
  execFileSync('git', args, { encoding: 'utf8' })
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

const blockedTrackedPatterns = [
  /^artifacts\//,
  /(^|\/)test-results\//,
  /(^|\/)playwright-report\//,
  /(^|\/)\.pytest(?:-tmp|-cache|_cache)?(?:\/|$)/,
  /(^|\/)__pycache__\//,
  /\.pyc$/i,
];

const noisyUntrackedPatterns = [
  /^artifacts\//,
  /(^|\/)test-results\//,
  /(^|\/)playwright-report\//,
  /(^|\/)\.pytest(?:-tmp|-cache|_cache)?(?:\/|$)/,
];

const normalizePath = (path) => path.replaceAll('\\', '/');
const matchesAny = (path, patterns) => patterns.some((pattern) => pattern.test(path));

const trackedArtifacts = runGit(['ls-files'])
  .map(normalizePath)
  .filter((path) => matchesAny(path, blockedTrackedPatterns));

const untrackedArtifacts = runGit(['status', '--porcelain', '--untracked-files=all'])
  .filter((line) => line.startsWith('?? '))
  .map((line) => normalizePath(line.slice(3)))
  .filter((path) => matchesAny(path, noisyUntrackedPatterns));

if (trackedArtifacts.length || untrackedArtifacts.length) {
  console.error('Generated artifacts detected. Clean or ignore these before preserving the build:');
  for (const path of trackedArtifacts) {
    console.error(`  tracked: ${path}`);
  }
  for (const path of untrackedArtifacts) {
    console.error(`  untracked: ${path}`);
  }
  process.exit(1);
}

console.log('No generated artifacts are tracked or pending.');
