import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distRoot = path.join(projectRoot, 'dist');
const nodeBin = process.execPath;

async function collectTestFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return collectTestFiles(fullPath);
    }

    return fullPath.endsWith('.test.js') ? [fullPath] : [];
  }));

  return files.flat().sort();
}

async function runNode(args) {
  await new Promise((resolve, reject) => {
    const child = spawn(nodeBin, args, {
      cwd: projectRoot,
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          signal
            ? `Command exited with signal ${signal}: ${args.join(' ')}`
            : `Command exited with code ${code}: ${args.join(' ')}`
        )
      );
    });
  });
}

async function main() {
  const unitOnly = process.argv.includes('--unit-only');
  const testFiles = await collectTestFiles(distRoot);

  if (testFiles.length === 0) {
    throw new Error('No compiled test files were found under dist/.');
  }

  await runNode(['--test', ...testFiles]);

  if (!unitOnly) {
    await runNode([path.join(projectRoot, 'scripts', 'smoke-test.mjs')]);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
