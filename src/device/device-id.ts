import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { getDataDir } from '../shared/paths.js';

function getDeviceFilePath(): string {
  return join(getDataDir(), 'device.json');
}

export function getDeviceId(): string {
  const filePath = getDeviceFilePath();
  if (existsSync(filePath)) {
    try {
      const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as { deviceId?: string };
      if (typeof parsed.deviceId === 'string' && parsed.deviceId) {
        return parsed.deviceId;
      }
    } catch {
      // Recreate corrupted device file below.
    }
  }

  const deviceId = randomUUID();
  mkdirSync(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify({ deviceId, createdAt: new Date().toISOString() }, null, 2)}\n`, 'utf8');
  renameSync(tempPath, filePath);
  return deviceId;
}
