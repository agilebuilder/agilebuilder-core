import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const nodeBin = process.execPath;

function getProjectPath(...segments) {
  return path.join(projectRoot, ...segments);
}

async function runNodeCommand(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(nodeBin, args, {
      cwd: projectRoot,
      env: { ...process.env, ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code, signal) => {
      resolve({ code, signal, stdout, stderr });
    });
  });
}

async function waitForMcpStartup() {
  return new Promise((resolve, reject) => {
    const child = spawn(nodeBin, [getProjectPath('dist', 'mcp', 'index.js')], {
      cwd: projectRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      child.kill();
      reject(new Error(`Timed out waiting for MCP startup. stderr:\n${stderr}`));
    }, 10000);

    const finish = (error = null) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      child.kill();

      if (error) {
        reject(error);
      } else {
        resolve(stderr);
      }
    };

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      if (stderr.includes('MCP')) {
        finish();
      }
    });

    child.on('error', (error) => finish(error));
    child.on('exit', (code) => {
      if (!settled && code !== null) {
        finish(new Error(`MCP exited before startup check completed with code ${code}. stderr:\n${stderr}`));
      }
    });
  });
}

async function main() {
  const packageJson = JSON.parse(await readFile(getProjectPath('package.json'), 'utf8'));
  const expectedVersion = packageJson.version;

  assert.ok(existsSync(getProjectPath('dist', 'cli', 'index.js')), 'dist/cli/index.js is missing. Run npm run build first.');
  assert.ok(existsSync(getProjectPath('dist', 'mcp', 'index.js')), 'dist/mcp/index.js is missing. Run npm run build first.');
  assert.ok(!existsSync(getProjectPath('dist', 'cli', 'commands', 'template')), 'Stale template command artifacts should not exist in dist/.');
  assert.ok(!existsSync(getProjectPath('dist', 'cli', 'commands', 'create.js')), 'Stale create command artifact should not exist in dist/.');

  const versionResult = await runNodeCommand([getProjectPath('dist', 'cli', 'index.js'), '--version']);
  assert.equal(versionResult.code, 0, `--version failed:\n${versionResult.stderr}`);
  assert.equal(versionResult.stdout.trim(), expectedVersion, 'CLI version output does not match package.json version.');

  const helpResult = await runNodeCommand([getProjectPath('dist', 'cli', 'index.js'), '--help']);
  assert.equal(helpResult.code, 0, `root help failed:\n${helpResult.stderr}`);
  assert.match(helpResult.stdout, /Usage: agilebuilder/);
  assert.match(helpResult.stdout, /Commands:/);
  assert.match(helpResult.stdout, /\blogin\b/);
  assert.match(helpResult.stdout, /\bspace\b/);
  assert.match(helpResult.stdout, /\bres\b/);
  assert.doesNotMatch(helpResult.stdout, /^\s+template\s/m);
  assert.doesNotMatch(helpResult.stdout, /^\s+create\s/m);

  const resHelpResult = await runNodeCommand([getProjectPath('dist', 'cli', 'index.js'), 'res', '--help']);
  assert.equal(resHelpResult.code, 0, `res --help failed:\n${resHelpResult.stderr}`);
  assert.match(resHelpResult.stdout, /Browse resources interactively/);

  const uiHelpResult = await runNodeCommand([getProjectPath('dist', 'cli', 'index.js'), 'ui', '--help']);
  assert.equal(uiHelpResult.code, 0, `ui --help failed:\n${uiHelpResult.stderr}`);
  assert.match(uiHelpResult.stdout, /Open the visual management interface/);

  const publicExportsResult = await runNodeCommand([
    '--input-type=module',
    '--eval',
    `import * as mod from '${pathToFileURL(getProjectPath('dist', 'index.js')).href}';
console.log(JSON.stringify(Object.keys(mod).sort()));`,
  ]);
  assert.equal(publicExportsResult.code, 0, `public exports check failed:\n${publicExportsResult.stderr}`);
  const publicExports = JSON.parse(publicExportsResult.stdout.trim());
  assert.deepEqual(publicExports, [
    'APP_NAME',
    'APP_VERSION',
    'LOCAL_SPACE_ID',
    'LOCAL_SPACE_NAME',
    'getAuthorizationUrl',
    'isLoggedIn',
    'login',
    'logout',
  ]);

  const internalExportsResult = await runNodeCommand([
    '--input-type=module',
    '--eval',
    `import * as mod from '${pathToFileURL(getProjectPath('dist', 'internal.js')).href}';
console.log(JSON.stringify(['TokenStore' in mod, 'ProcessorFactory' in mod, 'ResourcesDAO' in mod]));`,
  ]);
  assert.equal(internalExportsResult.code, 0, `internal exports check failed:\n${internalExportsResult.stderr}`);
  assert.deepEqual(JSON.parse(internalExportsResult.stdout.trim()), [true, true, true]);

  const mcpStderr = await waitForMcpStartup();
  assert.match(mcpStderr, /MCP/);

  console.log('Smoke tests passed.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
