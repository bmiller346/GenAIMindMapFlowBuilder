import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, '..', 'frontend');
const viteEntry = path.join(frontendDir, 'node_modules', 'vite', 'dist', 'node', 'index.js');

process.chdir(frontendDir);

const { build } = await import(pathToFileURL(viteEntry).href);

await build({
  root: frontendDir,
  configFile: path.join(frontendDir, 'vite.config.js')
});
