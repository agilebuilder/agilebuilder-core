import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export function getDataDir(): string {
  const dataDirOverride = process.env.AGILEBUILDER_CORE1_DATA_DIR;
  return dataDirOverride
    ? resolve(dataDirOverride)
    : join(homedir(), '.agilebuilder', 'v2');
}

export function getConfigFilePath(): string {
  return join(getDataDir(), 'config.json');
}

export function getCurrentSpaceFilePath(): string {
  return join(getDataDir(), 'current-space.json');
}

export function getLocalResourcesFilePath(): string {
  return join(getDataDir(), 'resources', 'local.json');
}
